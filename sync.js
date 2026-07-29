/* ============================================================
   sync.js — прогресс между устройствами через Supabase.

   Что изменилось на этапе A:
   · Аккаунт обязателен. Клиент и сессию держит auth.js,
     здесь только обмен данными.
   · Схема v2: ключ прогресса — пара (user_id, roadmap_id),
     а не один user_id. Один аккаунт может вести несколько треков.
   · localStorage больше не источник истины, а кеш для офлайна:
     при входе облако вливается в локальную копию, локальная
     уходит обратно. Слияние, а не затирание — отметки с телефона
     не сносят отметки с ноутбука.
   · В public_stats уходят только агрегаты для будущего рейтинга.
     Заметок, блокеров и откликов там нет физически — это
     разделение на уровне таблиц, см. §3.1 PROJECT.md.
   ============================================================ */

const Sync = {
  state: 'off',        // off | ready | busy | ok | err
  lastError: '',
  lastAt: null,
  _timer: null,
  onchange: null,

  get sb()   { return Auth.sb; },
  get user() { return Auth.user; },

  available() {
    return typeof SYNC_ENABLED !== 'undefined' && SYNC_ENABLED && !!Auth.sb;
  },

  set(state, err) {
    this.state = state;
    if (err !== undefined) this.lastError = err;
    if (this.onchange) this.onchange();
  },

  /** Вызывается после входа. Чужой локальный кеш не показываем. */
  async init() {
    if (!this.available() || !this.user) { this.set('off'); return; }

    if (Store.d.ownerId && Store.d.ownerId !== this.user.id) Store.reset();
    Store.d.ownerId = this.user.id;
    Store.save();

    this.set('busy');
    try {
      await this.enroll();
      await this.pull(true);
      await this.push();
    } catch (e) {
      this.set('err', e.message || String(e));
    }
  },

  /** Запись на трек. Идемпотентно: повторный вход ничего не ломает. */
  async enroll() {
    const { error } = await this.sb.from('enrollments').upsert(
      { user_id: this.user.id, roadmap_id: ROADMAP_ID },
      { onConflict: 'user_id,roadmap_id', ignoreDuplicates: true }
    );
    if (error) {
      if (/foreign key|violates/i.test(error.message || '')) {
        throw new Error('Трек ещё не заведён в базе — выполни блок 9 из supabase.sql.');
      }
      throw error;
    }
  },

  /** Забрать облачную версию и слить с локальной. */
  async pull(silent) {
    if (!this.user) return;
    this.set('busy');
    try {
      const { data, error } = await this.sb
        .from('progress').select('payload, updated_at')
        .eq('user_id', this.user.id)
        .eq('roadmap_id', ROADMAP_ID)
        .maybeSingle();
      if (error) throw error;
      if (data && data.payload) {
        Store.d = mergeState(Store.d, data.payload);
        Store.d.ownerId = this.user.id;
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
      delete payload.ownerId;                  // служебное, в облаке не нужно
      const { error } = await this.sb.from('progress').upsert({
        user_id: this.user.id,
        roadmap_id: ROADMAP_ID,
        payload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,roadmap_id' });
      if (error) throw error;
      this.lastAt = new Date();
      this.set('ok', '');
      this.pushStats();
      return true;
    } catch (e) {
      this.set('err', e.message || String(e));
      return false;
    }
  },

  /** Агрегаты для рейтинга. Не критично: упало — прогресс всё равно сохранён. */
  async pushStats() {
    if (!this.user || typeof Store.totals !== 'function') return;
    try {
      const t = Store.totals();
      const { error } = await this.sb.from('public_stats').upsert({
        user_id: this.user.id,
        roadmap_id: ROADMAP_ID,
        pct: t.pct,
        hours_fact: t.hoursFact,
        weeks_closed: t.closed,
        tasks_done: t.tasksDone,
        streak: t.streak,
        current_week: typeof currentWeek === 'function' ? currentWeek() : 1,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,roadmap_id' });
      if (error) console.warn('public_stats', error.message);
    } catch (e) {
      console.warn('public_stats', e);
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
    if (!this.user) return 'нет входа';
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
