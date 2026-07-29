/* ============================================================
   auth.js — аккаунт: регистрация, подтверждение почты,
   вход и восстановление пароля.

   Почему вход обязателен:
   прогресс живёт на сервере и привязан к пользователю, а не к
   браузеру. localStorage остаётся только кешем для офлайна.
   PIN убран — он защищал вкладку, а не данные, и создавал
   ложное ощущение безопасности.

   Поток подтверждения почты (implicit flow):
   signUp → Supabase шлёт письмо → пользователь жмёт ссылку →
   Supabase проверяет токен и возвращает его на AUTH_REDIRECT
   в хеше адреса → supabase-js подхватывает сессию сам.
   Implicit выбран намеренно: ссылку можно открыть на другом
   устройстве (зарегистрировался на Маке — подтвердил с телефона).
   PKCE так не умеет: там нужен verifier из того же браузера.
   ============================================================ */

/* Хеш нужно снять ДО createClient: detectSessionInUrl его вычистит. */
const URL_HASH = location.hash || '';

const AVATARS = {
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4.5"/>',
  radar:  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-3.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  bolt:   '<path d="M13.5 3L6 13.5h5L10.5 21 18 10.5h-5z"/>',
  rocket: '<path d="M12 3c3.5 2 5.5 5.5 5.5 9.5L12 18l-5.5-5.5C6.5 8.5 8.5 5 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M8.5 17c-1.5.6-2 2-2 4 2 0 3.4-.5 4-2M15.5 17c1.5.6 2 2 2 4-2 0-3.4-.5-4-2"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  eye:    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
};
const AV_SVG = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${AVATARS[k] || AVATARS.shield}</svg>`;

const escA = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const Auth = {
  sb: null,
  user: null,
  profile: null,

  screen: 'wait',      // wait | signin | signup | sent | forgot | newpass | dead
  email: '',
  avatar: 'shield',
  note: '',            // спокойное сообщение
  error: '',           // красное сообщение
  busy: false,

  onenter: null,       // вызывает app.js, когда пользователь вошёл
  onleave: null,       // вызывает app.js при выходе

  available() {
    return typeof SYNC_ENABLED !== 'undefined' && SYNC_ENABLED
      && typeof window.supabase !== 'undefined';
  },

  /* ── старт ───────────────────────────────────────────── */
  async init() {
    const gate = document.getElementById('gate');
    document.getElementById('gateLogo').innerHTML = AV_SVG('shield');

    if (!this.available()) {
      this.screen = 'dead';
      this.error = 'Supabase не подключён в этой сборке: проверь config.js.';
      this.render();
      return;
    }

    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    });

    const url = this.readHash();

    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.user = session ? session.user : null;
        this.go('newpass', 'Придумай новый пароль.');
        return;
      }
      if (event === 'SIGNED_OUT') {
        this.user = null; this.profile = null;
        this.go('signin', 'Вышел из аккаунта.');
        if (this.onleave) this.onleave();
      }
    });

    /* Ссылка из письма протухла или её уже использовали. */
    if (url.error) {
      this.screen = url.type === 'recovery' ? 'forgot' : 'signin';
      this.error = url.error;
      this.render();
      return;
    }

    const { data } = await this.sb.auth.getSession();
    const session = data && data.session;

    if (session && url.type === 'recovery') {
      this.user = session.user;
      this.go('newpass', 'Ссылка принята. Придумай новый пароль.');
      return;
    }
    if (session) {
      this.user = session.user;
      await this.enter(url.type === 'signup' ? 'Почта подтверждена.' : '');
      return;
    }

    this.go('signin');
  },

  /** Разбор хеша из письма: тип действия и человеческая ошибка. */
  readHash() {
    const p = new URLSearchParams(URL_HASH.replace(/^#/, ''));
    const code = p.get('error_code') || '';
    const raw = p.get('error_description') || p.get('error') || '';
    let error = '';
    if (raw) {
      error = /expired/i.test(code + raw)
        ? 'Ссылка из письма устарела. Запроси новую — это займёт секунду.'
        : decodeURIComponent(raw.replace(/\+/g, ' '));
    }
    return { type: p.get('type') || '', error };
  },

  /* ── вход состоялся ──────────────────────────────────── */
  async enter(note) {
    await this.loadProfile();
    /* Почта не подтверждена — Supabase такую сессию не выдаёт,
       но проверяем явно: настройку подтверждения могли выключить. */
    history.replaceState(null, '', location.pathname + location.search);
    if (this.onenter) await this.onenter(note || '');
  },

  async loadProfile() {
    if (!this.user) return null;
    const { data } = await this.sb.from('profiles')
      .select('nickname, avatar').eq('id', this.user.id).maybeSingle();
    this.profile = data || null;
    return this.profile;
  },

  /* ── действия ────────────────────────────────────────── */
  async signUp(email, password, nickname, avatar) {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: AUTH_REDIRECT,
        data: { nickname: nickname, avatar: avatar }
      }
    });
    if (error) throw error;
    /* Сессии нет = Supabase ждёт подтверждения почты. Это норма. */
    if (data.session) { this.user = data.session.user; return 'in'; }
    return 'sent';
  },

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data;
  },

  async resend(email) {
    const { error } = await this.sb.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: AUTH_REDIRECT }
    });
    if (error) throw error;
  },

  async forgot(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT
    });
    if (error) throw error;
  },

  async setPassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  },

  async signOut() {
    await this.sb.auth.signOut();
    this.user = null;
    this.profile = null;
  },

  /* ── экран ───────────────────────────────────────────── */
  go(screen, note, error) {
    this.screen = screen;
    this.note = note || '';
    this.error = error || '';
    this.render();
  },

  shake() {
    const g = document.getElementById('gate');
    g.classList.add('shake');
    setTimeout(() => g.classList.remove('shake'), 460);
  },

  render() {
    const box = document.getElementById('gateBody');
    const s = this.screen;
    let h = '';

    if (s === 'wait') {
      box.innerHTML = '<p class="gate-note">Проверяю сессию…</p>';
      return;
    }

    if (s === 'dead') {
      box.innerHTML = `<p class="gate-err">${escA(this.error)}</p>`;
      return;
    }

    if (s === 'signin') {
      h = `<p class="gate-note">Прогресс привязан к аккаунту, а не к браузеру.
           Войди той же почтой на Маке и на iPhone — трекер будет один.</p>
        <label class="fld"><span>Почта</span>
          <input type="email" id="gEmail" autocomplete="username" value="${escA(this.email)}" placeholder="you@example.com"></label>
        <label class="fld"><span>Пароль</span>
          <input type="password" id="gPass" autocomplete="current-password" placeholder="••••••••"></label>
        <button class="btn primary wide" id="gDo">Войти</button>
        <div class="gate-links">
          <button class="linkbtn" data-go="signup">Создать аккаунт</button>
          <button class="linkbtn" data-go="forgot">Забыл пароль</button>
        </div>`;
    }

    if (s === 'signup') {
      h = `<p class="gate-note">Ник виден другим в рейтинге. Почта — никому и никогда.</p>
        <label class="fld"><span>Ник</span>
          <input type="text" id="gNick" maxlength="24" autocomplete="nickname" placeholder="от 2 до 24 символов"></label>
        <label class="fld"><span>Аватар</span></label>
        <div class="av-pick">${Object.keys(AVATARS).map(k =>
          `<button class="av${k === this.avatar ? ' on' : ''}" data-av="${k}" title="${k}">${AV_SVG(k)}</button>`).join('')}</div>
        <label class="fld mt"><span>Почта</span>
          <input type="email" id="gEmail" autocomplete="username" value="${escA(this.email)}" placeholder="you@example.com"></label>
        <label class="fld"><span>Пароль</span>
          <input type="password" id="gPass" autocomplete="new-password" placeholder="минимум 6 символов"></label>
        <button class="btn primary wide" id="gDo">Создать аккаунт</button>
        <div class="gate-links">
          <button class="linkbtn" data-go="signin">Уже есть аккаунт</button>
        </div>`;
    }

    if (s === 'sent') {
      h = `<p class="gate-note">Письмо ушло на <b>${escA(this.email)}</b>.
           Открой ссылку из него — вернёшься сюда уже внутри.</p>
        <p class="gate-dim">Письма нет через пару минут? Загляни в «Спам»
           и в «Промоакции». Встроенная почта Supabase отправляет
           примерно три письма в час.</p>
        <button class="btn wide" id="gDo">Отправить письмо ещё раз</button>
        <div class="gate-links">
          <button class="linkbtn" data-go="signin">Вернуться ко входу</button>
        </div>`;
    }

    if (s === 'forgot') {
      h = `<p class="gate-note">Пришлём ссылку для смены пароля.</p>
        <label class="fld"><span>Почта</span>
          <input type="email" id="gEmail" autocomplete="username" value="${escA(this.email)}" placeholder="you@example.com"></label>
        <button class="btn primary wide" id="gDo">Прислать ссылку</button>
        <div class="gate-links">
          <button class="linkbtn" data-go="signin">Назад ко входу</button>
        </div>`;
    }

    if (s === 'newpass') {
      h = `<p class="gate-note">Новый пароль — минимум 6 символов.</p>
        <label class="fld"><span>Новый пароль</span>
          <input type="password" id="gPass" autocomplete="new-password"></label>
        <label class="fld"><span>Ещё раз</span>
          <input type="password" id="gPass2" autocomplete="new-password"></label>
        <button class="btn primary wide" id="gDo">Сохранить пароль</button>`;
    }

    box.innerHTML =
      (this.note ? `<p class="gate-ok">${escA(this.note)}</p>` : '') +
      (this.error ? `<p class="gate-err">${escA(this.error)}</p>` : '') + h;

    this.bind();
  },

  bind() {
    const $g = id => document.getElementById(id);
    const val = id => { const el = $g(id); return el ? el.value.trim() : ''; };
    const raw = id => { const el = $g(id); return el ? el.value : ''; };

    Array.from(document.querySelectorAll('[data-go]')).forEach(b => {
      if (!b.closest('#gate')) return;
      b.onclick = () => {
        const e = $g('gEmail'); if (e) this.email = e.value.trim();
        this.go(b.dataset.go);
      };
    });
    Array.from(document.querySelectorAll('#gate [data-av]')).forEach(b => {
      b.onclick = () => {
        this.avatar = b.dataset.av;
        Array.from(document.querySelectorAll('#gate [data-av]'))
          .forEach(x => x.classList.toggle('on', x.dataset.av === this.avatar));
      };
    });

    const btn = $g('gDo');
    if (!btn) return;

    const run = async () => {
      if (this.busy) return;
      this.busy = true;
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Секунду…';
      try {
        await this.submit({ val, raw });
      } catch (err) {
        this.error = this.human(err);
        this.note = '';
        this.render();
        this.shake();
      } finally {
        this.busy = false;
        if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; }
      }
    };

    btn.onclick = run;
    Array.from(document.querySelectorAll('#gate input')).forEach(i => {
      i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
    });

    const first = document.querySelector('#gate input');
    if (first) setTimeout(() => first.focus(), 60);
  },

  async submit(io) {
    const { val, raw } = io;
    const s = this.screen;

    if (s === 'signin') {
      const e = val('gEmail'), p = raw('gPass');
      if (!e || !p) throw new Error('Заполни почту и пароль.');
      this.email = e;
      await this.signIn(e, p);
      await this.enter('');
      return;
    }

    if (s === 'signup') {
      const nick = val('gNick'), e = val('gEmail'), p = raw('gPass');
      if (nick.length < 2 || nick.length > 24) throw new Error('Ник — от 2 до 24 символов.');
      if (!e) throw new Error('Нужна почта.');
      if (p.length < 6) throw new Error('Пароль — минимум 6 символов.');
      this.email = e;
      const res = await this.signUp(e, p, nick, this.avatar);
      if (res === 'in') { await this.enter('Аккаунт создан.'); return; }
      this.go('sent');
      return;
    }

    if (s === 'sent') {
      await this.resend(this.email);
      this.go('sent', 'Отправил ещё раз.');
      return;
    }

    if (s === 'forgot') {
      const e = val('gEmail');
      if (!e) throw new Error('Нужна почта.');
      this.email = e;
      await this.forgot(e);
      this.go('signin', 'Если такая почта есть — письмо со ссылкой уже в пути.');
      return;
    }

    if (s === 'newpass') {
      const p = raw('gPass'), p2 = raw('gPass2');
      if (p.length < 6) throw new Error('Пароль — минимум 6 символов.');
      if (p !== p2) throw new Error('Пароли не совпали.');
      await this.setPassword(p);
      await this.enter('Пароль обновлён.');
      return;
    }
  },

  /** Ошибки Supabase приходят по-английски. Переводим то, что встречается. */
  human(err) {
    const m = (err && (err.message || err.error_description)) || String(err);
    if (/Invalid login credentials/i.test(m)) return 'Почта или пароль не подходят.';
    if (/Email not confirmed/i.test(m)) return 'Почта ещё не подтверждена — открой ссылку из письма.';
    if (/User already registered|already been registered/i.test(m)) return 'Такая почта уже зарегистрирована. Войди или восстанови пароль.';
    if (/Password should be at least/i.test(m)) return 'Пароль — минимум 6 символов.';
    if (/Unable to validate email|invalid format/i.test(m)) return 'Почта выглядит неправильно.';
    if (/rate limit|too many requests|after \d+ seconds/i.test(m)) return 'Слишком часто. Подожди минуту и попробуй снова.';
    if (/duplicate key value.*profiles_nickname/i.test(m)) return 'Такой ник уже занят.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером. Проверь интернет.';
    if (/redirect|not allowed/i.test(m)) return 'Адрес возврата не разрешён в Supabase → Authentication → URL Configuration.';
    return m;
  }
};
