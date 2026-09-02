/* ============================================================
   store.js — хранение прогресса

   С этапа A источник истины — сервер, а localStorage работает
   как кеш: он даёт мгновенный отклик и держит приложение живым
   без сети. Привязка кеша к аккаунту — поле ownerId: если в
   браузере войдёт другой пользователь, кеш чужого не подхватится.
   ============================================================ */

const KEY = 'soc365.v1';

/** Свежий пустой стейт. Именно функция, а не константа: иначе вложенные
 *  объекты расшариваются по ссылке и «Сбросить всё» не очищает данные. */
function fresh() {
  return {
    ownerId: null,           // id аккаунта, которому принадлежит этот кеш
    theme: 'dark',
    weeks: {},               // { "7": { hours, status, rating, notes, tasks:[0,2] } }
    days: {},                // { "2026-08-03": { polish:1, english:1, theory:1, lab:1, recall:1 } }
    portfolio: {},           // { "4": { readme, screens, published, url } }
    apps: [],                // отклики на вакансии
    metrics: {},             // { "13": { hours, repos, thm, anki, efset, ... } }
    langs: {},               // { "1": { efset:"A2", anki: 310 } }
    freezes: {},             // { "2026-09-14": 1 } — замороженный пропуск → квартал
    /* ANKI скрыт по умолчанию (05.08.2026). Раздел полезен не всем и
       не сразу, а семь вкладок в таббаре — это уже потолок по ширине
       (§12.2-bis). Включается одним переключателем в SETTINGS, данные
       словаря при этом никуда не деваются: скрыть и стереть — разные
       действия. На уже сохранённый прогресс это не влияет — pickShape
       возьмёт settings из кеша, а не отсюда.

       Звук (§12.5) живёт здесь же и по той же причине: настройка следует
       за аккаунтом, а не за браузером. `on: false` — не осторожность,
       а требование спеки: трекер учёбы, который неожиданно пищит, —
       враждебный трекер. */
    settings: { hidden: { anki: true }, sound: { on: false, vol: 0.6, ui: true } },
    createdAt: null
  };
}

/* Разделы, которые вообще разрешено прятать (§12.2). Белый список, а не
   свободный ключ: он же закрывает запись по ключу из данных — в объект
   настроек не попадёт ничего, чего здесь нет. */
const HIDEABLE = ['anki'];

const Store = {
  d: null,

  /* Был ли на этом устройстве сохранённый кеш в момент загрузки.
     Нужно ровно одному месту — слиянию настроек в sync.js (§12.5-bis):
     на чистом устройстве побеждает облако, на обжитом — местное.
     Отличить «человек выключил звук» от «здесь просто умолчание»
     иначе нечем: fresh() отдаёт непустой объект настроек. */
  cached: false,

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.cached = !!raw;
      /* Object.assign по разобранному JSON — это загрязнение прототипа:
         у ключа "__proto__" есть [[Set]], и Object.assign его вызывает.
         pickShape переносит только ключи, которые есть в образце. */
      this.d = raw ? pickShape(fresh(), safeParse(raw)) : fresh();
      delete this.d.pin;     // PIN убран на этапе A — чистим старые сохранения
    } catch (e) {
      console.warn('Не удалось прочитать сохранение, начинаю с чистого', e);
      this.d = fresh();
      this.cached = false;      // испорченный кеш — это тот же чистый лист
    }
    if (!this.d.createdAt) this.d.createdAt = new Date().toISOString();
    return this.d;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
      return true;
    } catch (e) {
      alert('Не удалось сохранить. Возможно, кончилось место в браузере или включён приватный режим.');
      return false;
    }
  },

  /* ---------- настройки разделов (§12.2) ----------
     Живут в payload, а не в браузере: человек прячет раздел один раз,
     а не заново на каждом устройстве. Скрыть — не значит стереть:
     данные раздела остаются нетронутыми, включил обратно — всё на месте. */
  hidden(id) {
    const s = this.d.settings;
    const h = s && typeof s === 'object' ? own(s, 'hidden', null) : null;
    return h && typeof h === 'object' ? own(h, id, false) === true : false;
  },
  setHidden(id, on) {
    if (HIDEABLE.indexOf(id) === -1) return false;   // чужой ключ не пройдёт
    if (!this.d.settings || typeof this.d.settings !== 'object') this.d.settings = { hidden: {} };
    if (!this.d.settings.hidden || typeof this.d.settings.hidden !== 'object') this.d.settings.hidden = {};
    if (on) this.d.settings.hidden[id] = true;
    else delete this.d.settings.hidden[id];
    this.save();
    return true;
  },
  hideable() { return HIDEABLE.slice(); },

  /* ---------- звук (§12.5) ----------
     Соседствует с hidden не случайно: то же место хранения, тот же
     маршрут в payload, та же логика «настройка следует за аккаунтом».

     Читается защитно, как и hidden. pickShape в security.js мелкий:
     он подменяет весь объект `settings` тем, что лежало в кеше, и
     внутрь не заглядывает. Значит здесь может оказаться что угодно —
     старый кеш без ключа `sound`, строка вместо объекта, вообще null.
     Отсюда own() и проверки типа на каждом шаге, а не `s.sound.on`.

     Побочная выгода той же мелкости: у всех, кто пользовался сайтом
     до этой правки, ключа `sound` в кеше нет, и звук у них выключен
     без единой строки миграции. */
  soundOn() {
    const s = this.d.settings;
    const so = s && typeof s === 'object' ? own(s, 'sound', null) : null;
    return so && typeof so === 'object' ? own(so, 'on', false) === true : false;
  },
  /** Громкость 0…1. Один регулятор, без «настроек звука» на пол-экрана. */
  soundVol() {
    const s = this.d.settings;
    const so = s && typeof s === 'object' ? own(s, 'sound', null) : null;
    const v = so && typeof so === 'object' ? own(so, 'vol', null) : null;
    if (typeof v !== 'number' || !isFinite(v)) return 0.6;
    return Math.min(1, Math.max(0, v));
  },
  /** Мелочь интерфейса: вкладки, кнопки, поля, наведение (§12.5).
   *  Отдельный тумблер появился вместе с отменой закрытого списка:
   *  именно эту россыпь человек захочет выключить первой, оставив
   *  вехи. Умолчание `true` — но оно ничего не включает само по себе,
   *  потому что накрыто главным `on`, который выключен.
   *
   *  Отсутствие ключа читается как `true`, а не как `false`: у тех,
   *  кто включил звук до этой правки, в кеше ключа нет, и трактовать
   *  его как «выключено» значило бы молча урезать им звук. */
  soundUi() {
    const s = this.d.settings;
    const so = s && typeof s === 'object' ? own(s, 'sound', null) : null;
    if (!so || typeof so !== 'object') return true;
    return own(so, 'ui', true) !== false;
  },
  setSoundUi(on) { this._sound().ui = !!on; this.save(); return !!on; },

  /** Общая починка формы: после неё в settings.sound точно объект. */
  _sound() {
    if (!this.d.settings || typeof this.d.settings !== 'object') this.d.settings = {};
    if (!this.d.settings.sound || typeof this.d.settings.sound !== 'object') {
      this.d.settings.sound = { on: false, vol: 0.6, ui: true };
    }
    return this.d.settings.sound;
  },
  setSoundOn(on) { this._sound().on = !!on; this.save(); return !!on; },
  setSoundVol(v) {
    const n = Math.min(1, Math.max(0, Number(v)));
    this._sound().vol = isFinite(n) ? n : 0.6;
    this.save();
    return this._sound().vol;
  },

  /* ---------- недели ---------- */
  week(n) {
    if (!this.d.weeks[n]) this.d.weeks[n] = { hours: null, status: 'Не начата', rating: null, notes: '', tasks: [] };
    return this.d.weeks[n];
  },
  setWeek(n, patch) { Object.assign(this.week(n), patch); this.save(); },
  toggleTask(n, i) {
    const w = this.week(n);
    const k = w.tasks.indexOf(i);
    if (k >= 0) w.tasks.splice(k, 1); else w.tasks.push(i);
    this.save();
    return k < 0;
  },

  /* ---------- дни ---------- */
  day(iso) {
    if (!this.d.days[iso]) this.d.days[iso] = {};
    return this.d.days[iso];
  },
  toggleBlock(iso, id) {
    const d = this.day(iso);
    d[id] = d[id] ? 0 : 1;
    this.save();
    return !!d[id];
  },
  dayMinutes(iso) {
    const d = this.d.days[iso] || {};
    return DAILY.reduce((s, b) => s + (d[b.id] ? b.min : 0), 0);
  },
  dayComplete(iso) {
    const d = this.d.days[iso] || {};
    return DAILY.every(b => d[b.id]);
  },
  dayAny(iso) {
    const d = this.d.days[iso] || {};
    return DAILY.some(b => d[b.id]);
  },

  /* ---------- streak ----------
     Считаем по будням. Пропуск НЕ обнуляет цепочку — это принципиально:
     обнуление и есть та точка, где люди бросают. Вместо него два механизма:

     · Долг. Работа в выходной даёт кредит, которым закрывается пропущенный
       будний день. Не успел в среду — отработал в субботу, цепочка цела.
     · Заморозка. Две на квартал, на сессию и болезнь. Замороженный день
       вычёркивается из счёта совсем.

     Кредит намеренно не привязан жёстко к своей неделе: считаем в пользу
     человека. Цель метрики — вернуть его к работе, а не выписать штраф. */
  streakInfo() {
    const freezes = this.d.freezes || {};
    let days = 0, credits = 0, covered = 0;
    const cur = new Date();
    cur.setHours(12, 0, 0, 0);
    // если сегодня ещё ничего не сделано — начинаем считать со вчера
    if (!this.dayAny(iso(cur))) cur.setDate(cur.getDate() - 1);

    for (let guard = 0; guard < 500; guard++) {
      const day = iso(cur), dow = cur.getDay();
      const back = () => cur.setDate(cur.getDate() - 1);

      /* Цепочка не тянется раньше старта трека (§12.1-ter). Без этой
         строки счёт шёл по календарю: работа до старта давала streak,
         которого сервер не признаёт. `public_stats_guard` режет поле
         по (current_date - start_date), и человек видел на TODAY одно
         число, а в RANK другое — молча, без ошибки. Границу на сервере
         трогать нельзя, она закрывает накрутку (§11.3); врал клиент. */
      if (day < META.start) break;

      if (dow === 0 || dow === 6) {           // выходной
        if (this.dayAny(day)) credits++;      // поработал — это кредит на долг
        back(); continue;
      }
      if (this.dayAny(day)) { days++; back(); continue; }
      if (freezes[day])      { back(); continue; }          // заморожен
      if (credits > 0)       { credits--; covered++; back(); continue; }  // закрыт выходным
      break;                                                 // вот здесь цепочка рвётся
    }
    return { days, covered, credits };
  },
  streak() { return this.streakInfo().days; },

  /** Квартал плана, в который попадает дата. */
  quarterOf(day) {
    const w = WEEKS.find(w => day >= w.start && day <= w.end);
    return w ? w.q : 1;
  },
  freezesLeft(q) {
    const used = Object.values(this.d.freezes || {}).filter(x => x === q).length;
    return Math.max(0, 2 - used);
  },
  /** Заморозить пропущенный будний день. Бросает понятную ошибку, если нельзя. */
  freeze(day) {
    const dow = parseISO(day).getDay();
    if (dow === 0 || dow === 6) throw new Error('Выходные и так не считаются пропуском.');
    if (day >= iso(new Date()))  throw new Error('Заморозить можно только прошедший день.');
    if (this.dayAny(day))        throw new Error('В этот день ты работал — замораживать нечего.');
    const q = this.quarterOf(day);
    if (this.freezesLeft(q) <= 0) throw new Error('Заморозки на этот квартал кончились. Их две — это намеренно.');
    (this.d.freezes = this.d.freezes || {})[day] = q;
    this.save();
    return q;
  },
  /** Ближайший пропуск, который рвёт цепочку. Его и предлагаем заморозить. */
  breakingDay() {
    const freezes = this.d.freezes || {};
    let credits = 0;
    const cur = new Date();
    cur.setHours(12, 0, 0, 0);
    if (!this.dayAny(iso(cur))) cur.setDate(cur.getDate() - 1);
    for (let guard = 0; guard < 90; guard++) {
      const day = iso(cur), dow = cur.getDay();
      const back = () => cur.setDate(cur.getDate() - 1);

      /* Та же граница, что и в streakInfo() (§12.1-ter), и её здесь
         не было. Функции-близнецы: одна считает длину цепочки, вторая
         ищет день, который её рвёт, — и правку 04.08.2026 получила
         только первая. Итог: до старта трека streak честно показывал 0,
         а карточка рядом заявляла «цепочку рвёт 04.08» и предлагала
         потратить заморозку на день, когда трек ещё не начался.
         Пропуска до старта не существует: пропустить можно только то,
         что уже началось. */
      if (day < META.start) return null;

      if (dow === 0 || dow === 6) { if (this.dayAny(day)) credits++; back(); continue; }
      if (this.dayAny(day)) { back(); continue; }
      if (freezes[day])     { back(); continue; }
      if (credits > 0)      { credits--; back(); continue; }
      return day;
    }
    return null;
  },

  /* ---------- достижения ---------- */
  /** Задача ищется по тексту, а не по индексу: содержание недель ещё правится. */
  taskDoneMatching(re) {
    return WEEKS.some(w => {
      const done = (this.d.weeks[w.w] || {}).tasks || [];
      return w.tasks.some((txt, i) => done.includes(i) && re.test(txt));
    });
  },
  quarterClosed(q) {
    const ws = WEEKS.filter(w => w.q === q);
    return ws.length > 0 && ws.every(w => (this.d.weeks[w.w] || {}).status === 'Закрыта');
  },
  achievements() {
    const t = this.totals();
    return ACHIEVEMENTS.map(a => Object.assign({}, a, { got: !!a.test(t, this) }));
  },

  /* ---------- портфолио ---------- */
  repo(id) {
    if (!this.d.portfolio[id]) this.d.portfolio[id] = { readme: 0, screens: 0, published: 0, url: '' };
    return this.d.portfolio[id];
  },
  setRepo(id, patch) { Object.assign(this.repo(id), patch); this.save(); },

  /* ---------- отклики ---------- */
  addApp(a) { this.d.apps.push(Object.assign({ id: Date.now(), date: iso(new Date()) }, a)); this.save(); },
  updApp(id, patch) {
    const a = this.d.apps.find(x => x.id === id);
    if (a) { Object.assign(a, patch); this.save(); }
  },
  delApp(id) { this.d.apps = this.d.apps.filter(x => x.id !== id); this.save(); },

  /* ---------- метрики контрольных точек ---------- */
  metric(w) { if (!this.d.metrics[w]) this.d.metrics[w] = {}; return this.d.metrics[w]; },
  setMetric(w, k, v) { this.metric(w)[k] = v; this.save(); },

  /* ---------- языки ---------- */
  lang(q) { if (!this.d.langs[q]) this.d.langs[q] = { efset: '', anki: '' }; return this.d.langs[q]; },
  setLang(q, k, v) { this.lang(q)[k] = v; this.save(); },

  /* ---------- сводка ---------- */
  totals() {
    let hf = 0, closed = 0, partial = 0, moved = 0, rated = [], tasksDone = 0, tasksAll = 0;
    WEEKS.forEach(w => {
      const s = this.d.weeks[w.w];
      tasksAll += w.tasks.length;
      if (!s) return;
      hf += Number(s.hours) || 0;
      if (s.status === 'Закрыта') closed++;
      if (s.status === 'Частично') partial++;
      if (s.status === 'Перенесена') moved++;
      if (s.rating) rated.push(Number(s.rating));
      tasksDone += (s.tasks || []).length;
    });
    const daysDone = Object.keys(this.d.days).filter(k => this.dayAny(k)).length;
    return {
      hoursPlan: META.totalHours,
      hoursFact: Math.round(hf * 10) / 10,
      pct: Math.min(100, Math.round(hf / META.totalHours * 100)),
      closed, partial, moved,
      weekPct: Math.round(closed / 52 * 100),
      avg: rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length * 10) / 10 : null,
      tasksDone, tasksAll,
      streak: this.streak(),
      daysDone,
      repos: PORTFOLIO.filter(r => this.d.portfolio[r.id] && this.d.portfolio[r.id].published).length,
      apps: this.d.apps.length,
      interviews: this.d.apps.filter(a => a.status === 'Интервью' || a.status === 'Оффер').length
    };
  },

  quarterTotals(q) {
    const ws = WEEKS.filter(w => w.q === q);
    const plan = ws.reduce((s, w) => s + w.hours, 0);
    const fact = ws.reduce((s, w) => s + (Number((this.d.weeks[w.w] || {}).hours) || 0), 0);
    const closed = ws.filter(w => (this.d.weeks[w.w] || {}).status === 'Закрыта').length;
    return {
      plan: Math.round(plan * 10) / 10,
      fact: Math.round(fact * 10) / 10,
      pct: plan ? Math.min(100, Math.round(fact / plan * 100)) : 0,
      closed, total: ws.length
    };
  },

  /* ---------- экспорт / импорт ---------- */
  /* ---------- резервная копия (§8) ----------

     ДО 02.09.2026 ЭТО БЫЛ НЕ БЭКАП. Выгружался только `Store.d`,
     то есть `progress.payload`. За бортом молча оставались:
       · `person.params` — все 22 поля анкеты (§13.2-bis), они живут
         в своём ключе localStorage и в своей таблице;
       · словарь ANKI — своя таблица и свой ключ. Кнопка EXPORT
         на вкладке ANKI бэкапом не является: она собирает файл
         ДЛЯ Anki, только из `ready`/`exported`, без `raw`, без
         `source`, `week` и `status`. Восстановить из него нельзя.
     То есть человек, потерявший аккаунт, восстанавливал прогресс
     и терял анкету со словарём, ничего об этом не узнав.

     `ownerId` В ВЫГРУЗКУ НЕ КЛАДЁТСЯ, и это тоже починка, а не
     оформление. Он был там, а `Sync.init()` при чужом ownerId зовёт
     `Store.reset()`: восстановление копии в ДРУГОЙ аккаунт стирало
     только что загруженное — молча, с зелёной галочкой. Привязка
     кеша к аккаунту — свойство устройства, а не данных человека.

     Формат конвертом, со своей версией. Плоские копии старого
     образца ЧИТАЮТСЯ по-прежнему (см. `import`): импортёр, который
     отказывается от уже скачанных файлов, — это та же потеря
     данных, что и сервер, обрезающий незнакомое поле (§13.2-quater). */
  backup() {
    const box = { v: 2, at: new Date().toISOString(), progress: Object.assign({}, this.d) };
    delete box.progress.ownerId;
    if (typeof Person !== 'undefined' && Person.p) box.person = Person.p;
    if (typeof Vocab !== 'undefined' && Array.isArray(Vocab.rows)) box.vocab = Vocab.rows;
    return box;
  },

  export() {
    const blob = new Blob([JSON.stringify(this.backup(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `soc365-backup-${iso(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  /** Импорт — единственное место, куда попадает файл со стороны.
   *  Разбор через safeParse (выбрасывает прототипные ключи) и перенос
   *  через pickShape (берёт только известные поля нужного типа).
   *  Раньше здесь был Object.assign по произвольному объекту. */
  import(text) {
    const obj = safeParse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Не похоже на резервную копию');
    }
    /* Конверт нового образца узнаётся по своему полю, а не по номеру
       версии: файл без `progress` — это плоская копия старого образца,
       и она обязана читаться как раньше. */
    const boxed = own(obj, 'progress', null);
    const prog = (boxed && typeof boxed === 'object' && !Array.isArray(boxed)) ? boxed : obj;

    this.d = pickShape(fresh(), prog);
    this.d.ownerId = null;          // привязку к аккаунту ставит Sync.init()
    if (!this.d.createdAt) this.d.createdAt = new Date().toISOString();
    this.save();

    /* Анкета и словарь — только из конверта: в плоской копии их нет,
       и трогать уже живущие на устройстве нельзя. Разбор идёт через
       собственные защитные разборщики (`Person.parse`, `Vocab.shape`),
       а не через Object.assign: файл приходит со стороны (§11.5). */
    if (boxed) {
      const per = own(obj, 'person', null);
      if (per && typeof per === 'object' && !Array.isArray(per) && typeof Person !== 'undefined') {
        Person.p = Person.parse(per);
        Person.dirty = true;        // сервер этого ещё не видел
        Person.saveLocal();
      }
      const voc = own(obj, 'vocab', null);
      if (Array.isArray(voc) && typeof Vocab !== 'undefined') {
        Vocab.rows = voc.map(r => Vocab.shape(r)).filter(r => r.word);
        Vocab.rows.forEach(r => { r.dirty = 1; });   // уедет следующей отправкой
        Vocab.save();
      }
    }
  },
  reset() { localStorage.removeItem(KEY); this.load(); }
};

/* ---------- утилиты дат ---------- */
function iso(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function fmtRU(s) {
  const d = parseISO(s);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}
function fmtShort(s) {
  const d = parseISO(s);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

/** Текущая неделя плана по сегодняшней дате. До старта → 1, после финиша → 52. */
function currentWeek(today) {
  const t = today || iso(new Date());
  if (t < META.start) return 1;
  const w = WEEKS.find(w => t >= w.start && t <= w.end);
  if (w) return w.w;
  return 52;
}
function isBeforeStart() { return iso(new Date()) < META.start; }
function isAfterEnd() { return iso(new Date()) > META.end; }
