/* ============================================================
   sync.js — синхронизация прогресса между устройствами
   через Supabase (Postgres + Auth + RLS).

   Как устроено:
   · Работает офлайн-первым: источник истины — localStorage.
     Без сети и без входа приложение работает как раньше.
   · После входа прогресс отправляется в облако и подтягивается
     на других устройствах.
   · Слияние по времени изменения: у каждой записи есть
     updated_at, берётся более свежая версия. Внутри данных
     дни/недели сливаются по ключам, чтобы отметки с телефона
     не затирали отметки с ноутбука.
   ============================================================ */

const Sync = {
  sb: null,
  user: null,
  state: 'off',        // off | ready | busy | ok | err
  lastError: '',
  lastAt: null,
  _timer: null,
  onchange: null,

  available() { return typeof SYNC_ENABLED !== 'undefined' && SYNC_ENABLED && typeof window.supabase !== 'undefined'; },

  set(state, err) {
    this.state = state;
    if (err !== undefined) this.lastError = err;
    if (this.onchange) this.onchange();
  },

  async init() {
    if (!this.available()) { this.set('off'); return; }
    try {
      this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      const { data } = await this.sb.auth.getSession();
      this.user = data && data.session ? data.session.user : null;
      this.set(this.user ? 'ready' : 'off');
      this.sb.auth.onAuthStateChange((_e, session) => {
        this.user = session ? session.user : null;
        this.set(this.user ? 'ready' : 'off');
      });
      if (this.user) await this.pull(true);
    } catch (e) {
      this.set('err', e.message || String(e));
    }
  },

  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    this.set('ready');
    await this.pull(true);
    return data;
  },

  async signOut() {
    await this.sb.auth.signOut();
    this.user = null;
    this.set('off');
  },

  /** Забрать облачную версию и слить с локальной. */
  async pull(silent) {
    if (!this.user) return;
    this.set('busy');
    try {
      const { data, error } = await this.sb
        .from('progress').select('payload, updated_at')
        .eq('user_id', this.user.id).maybeSingle();
      if (error) throw error;
      if (data && data.payload) {
        Store.d = mergeState(Store.d, data.payload);
        Store.save();
      }
      this.lastAt = new Date();
      this.set('ok', '');
      if (!silent && typeof renderAll === 'function') renderAll();
      return true;
    } catch (e) {
      this.set('err', e.message || String(e));
      return false;
    }
  },

  /** Отправить локальную версию в облако. */
  async push() {
    if (!this.user) return;
    this.set('busy');
    try {
      const payload = Object.assign({}, Store.d);
      delete payload.pin;                      // PIN остаётся только на устройстве
      const { error } = await this.sb.from('progress').upsert({
        user_id: this.user.id,
        payload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      this.lastAt = new Date();
      this.set('ok', '');
      return true;
    } catch (e) {
      this.set('err', e.message || String(e));
      return false;
    }
  },

  /** Отложенная отправка — чтобы не слать запрос на каждый клик. */
  schedule() {
    if (!this.user) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), 2500);
  },

  label() {
    if (!this.available()) return 'синхронизация не настроена';
    if (!this.user) return 'не вошёл — данные только на этом устройстве';
    switch (this.state) {
      case 'busy': return 'синхронизирую…';
      case 'err':  return 'ошибка: ' + this.lastError;
      case 'ok':   return 'синхронизировано ' + (this.lastAt ? timeAgo(this.lastAt) : '');
      default:     return 'подключено';
    }
  }
};

/* ── слияние двух состояний ───────────────────────────────── */
function mergeState(local, remote) {
  if (!remote) return local;
  const out = Object.assign({}, local);

  // недели: объединяем по номеру, отметки задач — объединением множеств
  out.weeks = Object.assign({}, remote.weeks || {}, local.weeks || {});
  Object.keys(remote.weeks || {}).forEach(k => {
    const r = remote.weeks[k], l = (local.weeks || {})[k];
    if (!l) return;
    out.weeks[k] = {
      hours:  pick(l.hours, r.hours),
      status: l.status && l.status !== 'Не начата' ? l.status : (r.status || 'Не начата'),
      rating: pick(l.rating, r.rating),
      notes:  (l.notes && l.notes.length >= (r.notes || '').length) ? l.notes : r.notes,
      tasks:  Array.from(new Set([].concat(l.tasks || [], r.tasks || [])))
    };
  });

  // дни: объединяем по дате, внутри дня — по блокам (галочка не снимается слиянием)
  out.days = Object.assign({}, remote.days || {});
  Object.keys(local.days || {}).forEach(d => {
    out.days[d] = Object.assign({}, remote.days ? remote.days[d] : {}, local.days[d]);
  });

  out.portfolio = Object.assign({}, remote.portfolio || {}, local.portfolio || {});
  out.metrics   = deepMerge(remote.metrics || {}, local.metrics || {});
  out.langs     = deepMerge(remote.langs || {}, local.langs || {});

  // отклики: по id, без дублей
  const byId = {};
  [].concat(remote.apps || [], local.apps || []).forEach(a => { byId[a.id] = Object.assign(byId[a.id] || {}, a); });
  out.apps = Object.values(byId).sort((a, b) => a.id - b.id);

  out.theme = local.theme || remote.theme || 'dark';
  out.pin = local.pin;                        // PIN никогда не приходит из облака
  out.createdAt = remote.createdAt || local.createdAt;
  return out;
}
function pick(a, b) { return (a === null || a === undefined || a === '') ? b : a; }
function deepMerge(base, over) {
  const o = Object.assign({}, base);
  Object.keys(over).forEach(k => {
    o[k] = (typeof over[k] === 'object' && over[k] !== null && !Array.isArray(over[k]))
      ? Object.assign({}, base[k] || {}, over[k]) : over[k];
  });
  return o;
}
function timeAgo(d) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return Math.floor(s / 86400) + ' дн назад';
}
