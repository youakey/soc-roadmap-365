/* ============================================================
   store.js — хранение прогресса
   ВСЁ хранится ТОЛЬКО в localStorage твоего браузера.
   Никаких серверов, никакой аналитики, никуда ничего не уходит.
   ============================================================ */

const KEY = 'soc365.v1';

/** Свежий пустой стейт. Именно функция, а не константа: иначе вложенные
 *  объекты расшариваются по ссылке и «Сбросить всё» не очищает данные. */
function fresh() {
  return {
    pin: null,               // строка из 4 цифр; null = PIN ещё не задан
    theme: 'dark',
    weeks: {},               // { "7": { hours, status, rating, notes, tasks:[0,2] } }
    days: {},                // { "2026-08-03": { polish:1, english:1, theory:1, lab:1, recall:1 } }
    portfolio: {},           // { "4": { readme, screens, published, url } }
    apps: [],                // отклики на вакансии
    metrics: {},             // { "13": { hours, repos, thm, anki, efset, ... } }
    langs: {},               // { "1": { efset:"A2", anki: 310 } }
    createdAt: null
  };
}

const Store = {
  d: null,

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.d = raw ? Object.assign(fresh(), JSON.parse(raw)) : fresh();
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

  /* ---------- streak: подряд идущие БУДНИ с хотя бы одним закрытым блоком ---------- */
  streak() {
    let n = 0;
    const cur = new Date();
    cur.setHours(12, 0, 0, 0);
    // если сегодня ещё ничего не сделано — начинаем считать со вчера
    if (!this.dayAny(iso(cur))) cur.setDate(cur.getDate() - 1);
    for (let guard = 0; guard < 500; guard++) {
      const dow = cur.getDay();
      if (dow === 0 || dow === 6) { cur.setDate(cur.getDate() - 1); continue; }
      if (this.dayAny(iso(cur))) { n++; cur.setDate(cur.getDate() - 1); }
      else break;
    }
    return n;
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
  import(text) {
    const obj = JSON.parse(text);
    if (typeof obj !== 'object' || obj === null) throw new Error('Не похоже на резервную копию');
    this.d = Object.assign(fresh(), obj);
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
