/* ============================================================
   content.js — источник содержания трека (§3.2).

   Что здесь происходит. До этого файла 52 недели жили в `data-weeks.js`
   и попадали в приложение просто потому, что тег <script> объявил
   глобальный `WEEKS`. Теперь содержание трека лежит в `roadmaps.content`,
   а этот файл переставляет источник, НЕ трогая имена: `WEEKS`, `META`,
   `QUARTERS`, `DAILY`, `DAY_VARIANTS` и `MILESTONES` остаются на своих
   местах и той же формы. Ни `app.js`, ни `store.js`, ни `zero.js`
   не знают, откуда взялось содержимое, — и это условие задачи,
   а не экономия: 40 с лишним обращений к этим именам переписывать
   ради смены источника незачем.

   Подмена идёт ПО МЕСТУ. `WEEKS` объявлен через `const`, переприсвоить
   его нельзя, да и не нужно: массив опустошается и наполняется заново,
   объекты — тем же способом. Кто держал ссылку, видит новые данные.

   ── Три решения, каждое с ценой ──

   1. Содержание из базы читается ЗАЩИТНО и целиком, а не по кусочкам.
      Не прошла проверку хоть одна неделя — не применяется ничего,
      остаётся встроенное. Половина мигрированного трека хуже, чем
      немигрированный: даты поедут относительно номеров молча, без
      единой ошибки в консоли — ровно тот почерк, за который уже
      платили в §12.1. `pickShape` здесь не годится: он подменяет
      объект целиком и внутрь не заглядывает (§12.5-bis).

   2. База недоступна — работаем на встроенном содержании.
      Офлайн для этого приложения нормальный режим (§10), и трекер
      не имеет права становиться белым экраном без сети. Поэтому
      `data-weeks.js` остаётся в репозитории: он больше не истина,
      но он запас. Цена честная и записана в §3.2-bis: пока запас
      не обновляют вместе с базой, офлайн показывает содержание
      на момент последней выкладки.

   3. Сюда НИЧЕГО не пишется. Содержание общего трека правит владелец
      из SQL Editor, клиенту на запись доступа нет вовсе — так стоит
      RLS с блока 9.5, и открывать её было бы возвратом того самого
      пути, ради закрытия которого писался блок 9 (§11.1: клиент
      не граница безопасности и ею быть не может).
   ============================================================ */

'use strict';

const Content = {
  /** Откуда взято содержание: 'code' — из файлов страницы, 'db' — из базы. */
  source: 'code',
  /** Почему не из базы, если не из базы. Пусто, когда всё в порядке. */
  note: '',

  /* ── Границы. Не про красоту, а про то, что содержание приходит
     снаружи: его размер и форму задаёт не эта страница. ── */
  MAX_WEEKS: 520,
  MAX_TASKS: 200,
  MAX_STR: 4000,

  /* ── Разбор ───────────────────────────────────────────────
     Возвращает нормализованный объект или null. Ни одного поля
     из `raw` наружу не выносится: всё перекладывается в свежие
     литералы через own(), поэтому ни `__proto__`, ни лишние ключи
     до состояния не доходят. */

  _str(o, k, req) {
    const v = own(o, k, undefined);
    if (v === undefined || v === null) return req ? null : '';
    if (typeof v !== 'string' || v.length > this.MAX_STR) return null;
    return v;
  },

  _num(o, k) {
    const v = own(o, k, undefined);
    return Number.isFinite(v) ? v : null;
  },

  _int(o, k, lo, hi) {
    const v = own(o, k, undefined);
    if (!Number.isInteger(v) || v < lo || v > hi) return null;
    return v;
  },

  _isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); },

  /** Разбор всего содержания. `why` заполняется первой же причиной отказа. */
  parse(raw) {
    this.note = '';
    const bad = (why) => { this.note = why; return null; };

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('content не объект');
    if (!Object.keys(raw).length) return bad('content пуст — трек ещё не засеян');

    /* ── недели ── */
    const rw = own(raw, 'weeks', null);
    if (!Array.isArray(rw)) return bad('нет массива weeks');
    if (!rw.length) return bad('weeks пуст');
    if (rw.length > this.MAX_WEEKS) return bad(`weeks: ${rw.length} — больше предела`);

    const weeks = [];
    for (let i = 0; i < rw.length; i++) {
      const s = rw[i];
      const at = `W${i + 1}`;
      if (!s || typeof s !== 'object') return bad(`${at}: не объект`);

      const w = this._int(s, 'w', 1, this.MAX_WEEKS);
      if (w !== i + 1) return bad(`${at}: поле w = ${own(s, 'w', '—')}, а место ${i + 1}`);

      const start = own(s, 'start', null), end = own(s, 'end', null);
      if (!this._isDate(start) || !this._isDate(end)) return bad(`${at}: границы не даты`);
      if (start > end) return bad(`${at}: начало позже конца`);
      /* Непрерывность обязательна, и это не педантизм. Инвариант §12.1
         «номер недели и подпись под ним считаются от одних данных»
         держится именно на том, что интервалы идут встык (§12.1-bis):
         в дырке currentWeek() не находит недели и молча отдаёт последнюю.
         Трек с настоящим перерывом выражается неделей в режиме сессии,
         как здесь и сделано с W24/W25/W45/W46, а не пропуском дат. */
      if (i && Date.parse(start + 'T00:00:00Z') - Date.parse(weeks[i - 1].end + 'T00:00:00Z') !== 86400000) {
        return bad(`${at}: разрыв или нахлёст с предыдущей неделей`);
      }

      const q = this._int(s, 'q', 1, 4);
      if (q === null) return bad(`${at}: квартал вне 1…4`);

      const topic = this._str(s, 'topic', true);
      if (topic === null || !topic) return bad(`${at}: пустая тема`);

      const rt = own(s, 'tasks', null);
      if (!Array.isArray(rt) || !rt.length) return bad(`${at}: нет задач`);
      if (rt.length > this.MAX_TASKS) return bad(`${at}: слишком много задач`);
      const tasks = [];
      for (let j = 0; j < rt.length; j++) {
        const x = rt[j];
        if (typeof x !== 'string' || !x || x.length > this.MAX_STR) return bad(`${at}: задача ${j + 1} не строка`);
        tasks.push(x);
      }

      const hours = this._num(s, 'hours');
      if (hours === null || hours < 0) return bad(`${at}: часы не число`);

      const deliverable = this._str(s, 'deliverable', false);
      if (deliverable === null) return bad(`${at}: артефакт не строка`);

      weeks.push({ w, start, end, q, topic, tasks, hours, deliverable });
    }

    /* ── META ── */
    const rm = own(raw, 'meta', null);
    if (!rm || typeof rm !== 'object') return bad('нет meta');
    const start = own(rm, 'start', null), end = own(rm, 'end', null);
    if (!this._isDate(start) || !this._isDate(end)) return bad('meta: границы не даты');
    /* Инвариант §12.1: номер недели и подпись под ней обязаны считаться
       от одних и тех же данных. Разойдутся — W3 покажет даты W2, молча. */
    if (start !== weeks[0].start) return bad('meta.start ≠ начало первой недели');
    if (end !== weeks[weeks.length - 1].end) return bad('meta.end ≠ конец последней недели');

    const totalHours = this._num(rm, 'totalHours');
    if (totalHours === null || totalHours <= 0) return bad('meta.totalHours не число');
    const weeklyHours = this._num(rm, 'weeklyHours');
    if (weeklyHours === null || weeklyHours < 0) return bad('meta.weeklyHours не число');

    const rs = own(rm, 'sessionWeeks', null);
    if (!Array.isArray(rs)) return bad('meta.sessionWeeks не массив');
    const sessionWeeks = [];
    for (const n of rs) {
      if (!Number.isInteger(n) || n < 1 || n > weeks.length) return bad(`sessionWeeks: ${n} вне трека`);
      sessionWeeks.push(n);
    }

    const re = own(rm, 'examWeeks', null);
    if (!re || typeof re !== 'object' || Array.isArray(re)) return bad('meta.examWeeks не объект');
    const examWeeks = {};
    for (const k of Object.keys(re)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > weeks.length) return bad(`examWeeks: ${k} вне трека`);
      const v = this._str(re, k, true);
      if (v === null || !v) return bad(`examWeeks[${k}]: не строка`);
      examWeeks[k] = v;
    }

    /* ── кварталы ── */
    const rq = own(raw, 'quarters', null);
    if (!rq || typeof rq !== 'object' || Array.isArray(rq)) return bad('нет quarters');
    const quarters = {};
    for (const k of Object.keys(rq)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > 4) return bad(`quarters: ключ ${k}`);
      const s = own(rq, k, null);
      if (!s || typeof s !== 'object') return bad(`Q${k}: не объект`);
      const hours = this._num(s, 'hours');
      if (hours === null || hours < 0) return bad(`Q${k}: часы не число`);
      const f = {};
      for (const key of ['code', 'name', 'range', 'dates', 'goal', 'principle']) {
        const v = this._str(s, key, true);
        if (v === null) return bad(`Q${k}.${key}: не строка`);
        f[key] = v;
      }
      quarters[k] = { code: f.code, name: f.name, range: f.range, dates: f.dates, hours, goal: f.goal, principle: f.principle };
    }
    /* Каждой неделе нужен её квартал: rQuarters читает QUARTERS[w.q]
       напрямую, и дырка там даёт пустую карточку без единой ошибки. */
    for (const w of weeks) {
      if (!Object.prototype.hasOwnProperty.call(quarters, String(w.q))) {
        return bad(`W${w.w} ссылается на квартал ${w.q}, которого нет`);
      }
    }

    /* ── распорядок дня ──
       `id` — общий ключ с `Store.d.days` и с разбором session mode
       в app.js. Переименование орфанит уже накопленный прогресс
       человека, поэтому форма ключа проверяется, а не подразумевается. */
    const rd = own(raw, 'daily', null);
    if (!Array.isArray(rd) || !rd.length) return bad('нет daily');
    const daily = [];
    const seen = {};
    for (const s of rd) {
      if (!s || typeof s !== 'object') return bad('daily: элемент не объект');
      const id = this._str(s, 'id', true);
      if (id === null || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) return bad(`daily: дурной id «${id}»`);
      if (seen[id]) return bad(`daily: id «${id}» дважды`);
      seen[id] = 1;
      const min = this._num(s, 'min');
      if (min === null || min < 0 || min > 1440) return bad(`daily «${id}»: минуты`);
      const name = this._str(s, 'name', true);
      const desc = this._str(s, 'desc', false);
      if (name === null || !name || desc === null) return bad(`daily «${id}»: подписи`);
      daily.push({ id, name, min, desc });
    }

    /* ── варианты дня ── */
    const rv = own(raw, 'dayVariants', null);
    if (!Array.isArray(rv)) return bad('нет dayVariants');
    const dayVariants = [];
    for (const s of rv) {
      if (!s || typeof s !== 'object') return bad('dayVariants: элемент не объект');
      const name = this._str(s, 'name', true);
      const when = this._str(s, 'when', false);
      const blocks = this._str(s, 'blocks', false);
      if (name === null || !name || when === null || blocks === null) return bad('dayVariants: подписи');
      dayVariants.push({ name, when, blocks });
    }

    /* ── контрольные точки ──
       `date` обязана быть концом своей недели: это производная,
       и именно на таких §12.1 споткнулась (§12.1-bis). */
    const rms = own(raw, 'milestones', null);
    if (!Array.isArray(rms)) return bad('нет milestones');
    const milestones = [];
    for (const s of rms) {
      if (!s || typeof s !== 'object') return bad('milestones: элемент не объект');
      const w = this._int(s, 'w', 1, weeks.length);
      if (w === null) return bad('milestones: номер недели вне трека');
      const date = own(s, 'date', null);
      if (!this._isDate(date)) return bad(`контрольная точка W${w}: дата`);
      if (date !== weeks[w - 1].end) return bad(`контрольная точка W${w}: ${date} ≠ конца недели ${weeks[w - 1].end}`);
      const name = this._str(s, 'name', true);
      const test = this._str(s, 'test', false);
      if (name === null || !name || test === null) return bad(`контрольная точка W${w}: подписи`);
      const rtg = own(s, 'targets', null);
      if (!rtg || typeof rtg !== 'object' || Array.isArray(rtg)) return bad(`контрольная точка W${w}: targets`);
      const targets = {};
      for (const k of Object.keys(rtg)) {
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(k)) return bad(`контрольная точка W${w}: ключ targets «${k}»`);
        const v = own(rtg, k, undefined);
        if (typeof v === 'string') { if (v.length > 64) return bad(`targets.${k}: длинная строка`); }
        else if (!Number.isFinite(v)) return bad(`targets.${k}: не число и не строка`);
        targets[k] = v;
      }
      milestones.push({ w, date, name, test, targets });
    }

    return { weeks, meta: { start, end, totalHours, weeklyHours, sessionWeeks, examWeeks }, quarters, daily, dayVariants, milestones };
  },

  /* ── Подстановка ──────────────────────────────────────────
     По месту, чтобы не трогать ни одно из 40+ обращений
     к этим именам в app.js, store.js и zero.js. */
  install(c) {
    WEEKS.length = 0;
    c.weeks.forEach(w => WEEKS.push(w));

    Object.keys(META).forEach(k => { delete META[k]; });
    Object.assign(META, c.meta);

    Object.keys(QUARTERS).forEach(k => { delete QUARTERS[k]; });
    Object.assign(QUARTERS, c.quarters);

    DAILY.length = 0;
    c.daily.forEach(b => DAILY.push(b));

    DAY_VARIANTS.length = 0;
    c.dayVariants.forEach(v => DAY_VARIANTS.push(v));

    MILESTONES.length = 0;
    c.milestones.forEach(m => MILESTONES.push(m));
  },

  /* ── Загрузка ─────────────────────────────────────────────
     Зовётся один раз, ПОСЛЕ выбора трека и ДО первой отрисовки:
     `currentWeek()` и `Store.stats()` читают WEEKS сразу, и увидеть
     они должны уже окончательные данные, а не сначала одни, потом
     другие. Ошибку не бросает никогда — офлайн это рабочий режим,
     а не сбой (§10). */
  async load(sb, roadmapId) {
    this.source = 'code';
    this.note = '';
    if (!sb || !roadmapId) { this.note = 'трек не выбран'; return this.source; }

    let raw = null;
    try {
      const { data, error } = await sb.from('roadmaps')
        .select('content').eq('id', roadmapId).maybeSingle();
      if (error) throw error;
      raw = data ? data.content : null;
    } catch (e) {
      this.note = 'база недоступна: ' + (e && e.message ? e.message : String(e));
      console.warn('content: остаюсь на встроенном содержании трека —', this.note);
      return this.source;
    }

    const c = this.parse(raw);
    if (!c) {
      /* Пустой content — это не поломка, а «трек ещё не засеян»:
         блок 11 supabase.sql не выполняли. Всё остальное — поломка,
         и о ней надо знать. */
      console.warn('content: остаюсь на встроенном содержании трека —', this.note);
      return this.source;
    }

    this.install(c);
    this.source = 'db';
    return this.source;
  }
};
