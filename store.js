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
    settings: { hidden: {} },// { hidden: { anki: true } } — скрытые разделы (§12.2)
    createdAt: null
  };
}

/* Разделы, которые вообще разрешено прятать (§12.2). Белый список, а не
   свободный ключ: он же закрывает запись по ключу из данных — в объект
   настроек не попадёт ничего, чего здесь нет. */
const HIDEABLE = ['anki'];

const Store = {
  d: null,

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      /* Object.assign по разобранному JSON — это загрязнение прототипа:
         у ключа "__proto__" есть [[Set]], и Object.assign его вызывает.
         pickShape переносит только ключи, которые есть в образце. */
      this.d = raw ? pickShape(fresh(), safeParse(raw)) : fresh();
      delete this.d.pin;     // PIN убран на этапе A — чистим старые сохранения
    } catch (e) {
      console.warn('Не удалось прочитать сохранение, начинаю с чистого', e);
      this.d = fresh();
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
  export() {
    const blob = new Blob([JSON.stringify(this.d, null, 2)], { type: 'application/json' });
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
    this.d = pickShape(fresh(), obj);
    if (!this.d.createdAt) this.d.createdAt = new Date().toISOString();
    this.save();
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
