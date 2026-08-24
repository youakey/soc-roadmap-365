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

   2. База недоступна — работаем на последнем, что она сказала,
      а если не говорила ничего — на встроенном содержании.
      Офлайн для этого приложения нормальный режим (§10), и трекер
      не имеет права становиться белым экраном без сети. Порядок
      запасов: кеш последнего удачного чтения → `data-weeks.js`.
      Кеш заведён 07.08.2026 (§3.2-quater), когда содержание начали
      править прямо в базе и версия в ней стала расходиться с файлами.

   3. Сюда НИЧЕГО не пишется. Содержание общего трека правит владелец
      из SQL Editor, клиенту на запись доступа нет вовсе — так стоит
      RLS с блока 9.5, и открывать её было бы возвратом того самого
      пути, ради закрытия которого писался блок 9 (§11.1: клиент
      не граница безопасности и ею быть не может).
   ============================================================ */

'use strict';

/* Кеш последнего удачного чтения из базы. Одна запись, а не по одной
   на трек: она заменяется целиком при смене трека. Цена честная —
   человек, переключающийся между двумя треками без сети, увидит
   встроенное содержание для того, который читал раньше. Взамен
   объём ограничен сверху и не растёт с числом треков.

   Ключ инвалидации — пара (трек, версия). Версия лежит в самом
   содержании (`content.v`, §13.2-bis) и заведена ровно для того,
   чтобы правку прямо в базе было по чему отличить. */
const CONTENT_KEY = 'soc365.content.v1';

const Content = {
  /** Откуда взято содержание: 'code' — файлы страницы, 'db' — база,
   *  'cache' — последнее, что база сказала на этом устройстве. */
  source: 'code',
  /** Почему не из базы, если не из базы. Пусто, когда всё в порядке. */
  note: '',
  /** Замечания, которые НЕ повод отвергнуть содержание. Пока здесь
   *  одно семейство — разъехавшиеся подписи кварталов (§3.2-quinquies). */
  warn: [],
  /** Версия применённого содержания, 0 — если версии в нём нет. */
  v: 0,
  /** Собственная дата старта ТРЕКА — та, что пришла из базы или лежит
   *  в файлах. Снимается один раз, ДО первого персонального сдвига,
   *  и нужна ровно для обратной операции: человек стёр свою дату —
   *  трек обязан вернуться на свою, а не остаться на чужой (§12.7). */
  base: '',

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

  /* Форма И существование: `2026-02-31` формой проходит, а днём
     не является, и `Date.parse` это не ловит (см. `isDay` в
     security.js). Правило одно на проект — как экранирование. */
  _isDate(s) { return isDay(s); },

  /** Разбор всего содержания. `why` заполняется первой же причиной отказа. */
  parse(raw) {
    this.note = '';
    this.warn = [];
    const bad = (why) => { this.note = why; return null; };

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('content не объект');
    if (!Object.keys(raw).length) return bad('content пуст — трек ещё не засеян');

    /* Версия. Отсутствие версии — НЕ повод отвергнуть содержание:
       блоб v1 её уже имел, но чужой трек может её и не заводить,
       а разбор обязан принимать всё, что принимал вчера. Нужна она
       одному месту — кешу, где служит половиной ключа. */
    const vRaw = own(raw, 'v', undefined);
    const v = Number.isInteger(vRaw) && vRaw >= 0 && vRaw < 1e9 ? vRaw : 0;

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

    /* Блоки, остающиеся в режиме сессии. Раньше эта тройка была зашита
       в app.js, и §3.2-bis назвала её швом. Теперь она в содержании,
       и каждый её элемент обязан ссылаться на существующий блок дня:
       опечатка здесь означала бы session mode без единого блока —
       молча, без ошибки в консоли. Проверяется ниже, когда разобран
       `daily`: раньше просто не с чем сверять. */
    const rb = own(rm, 'sessionBlocks', null);
    if (!Array.isArray(rb) || !rb.length) return bad('meta.sessionBlocks не массив');
    const sessionBlocks = [];
    for (const id of rb) {
      if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) return bad(`sessionBlocks: дурной id «${id}»`);
      sessionBlocks.push(id);
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

    /* ── Подписи кварталов: сверяем ГРАНИЦЫ, а не текст ──────────
       §3.2-bis оставила это долгом и объяснила, почему просто
       сверять нельзя: `dates` и `range` — отображаемый текст,
       и у второго трека он может быть оформлен как угодно
       («Осень 2026», «Autumn»). Жёсткая сверка запретила бы такое
       оформление, а отсутствие сверки означает, что правка недель
       прямо в базе молча разъедется с подписью.

       Выход — сузить проверку до тех подписей, которые САМИ написаны
       числами: если в `dates` есть хотя бы две пары «дд.мм», первая
       обязана совпасть с началом первой недели квартала, а последняя —
       с концом последней. Подпись словами не проверяется вовсе
       и не порождает ни одного замечания. Это прямое исполнение урока
       §13.2-bis: проверка, которая шумит, не работает, поэтому она
       стоит ровно там, где может быть права.

       И это ЗАМЕЧАНИЕ, а не отказ. Разбор всё-или-ничего защищает
       данные — номера недель, даты, непрерывность; неверная подпись
       квартала данные не портит, она врёт глазу. Отвергнуть из-за неё
       весь трек значило бы показать человеку прошлогоднее содержание
       из-за опечатки в заголовке карточки. Правило шире дефекта —
       это ложное спокойствие (§9). */
    const dmOf = (s) => s.slice(8, 10) + '.' + s.slice(5, 7);
    Object.keys(quarters).forEach(k => {
      const ws = weeks.filter(w => String(w.q) === k);
      if (!ws.length) return;
      const last = ws[ws.length - 1];

      const dm = String(quarters[k].dates).match(/\d{2}\.\d{2}/g);
      if (dm && dm.length >= 2) {
        const w1 = dmOf(ws[0].start), w2 = dmOf(last.end);
        if (dm[0] !== w1 || dm[dm.length - 1] !== w2) {
          this.warn.push(`Q${k}: подпись «${quarters[k].dates}» разошлась с границами недель (${w1} … ${w2})`);
        }
      }

      const wn = String(quarters[k].range).match(/W(\d+)/g);
      if (wn && wn.length >= 2) {
        const r1 = 'W' + ws[0].w, r2 = 'W' + last.w;
        if (wn[0] !== r1 || wn[wn.length - 1] !== r2) {
          this.warn.push(`Q${k}: диапазон «${quarters[k].range}» разошёлся с номерами недель (${r1}–${r2})`);
        }
      }
    });

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
    for (const id of sessionBlocks) {
      if (!Object.prototype.hasOwnProperty.call(seen, id)) {
        return bad(`sessionBlocks: блока «${id}» нет в daily`);
      }
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

    return { v, weeks, meta: { start, end, totalHours, weeklyHours, sessionWeeks, sessionBlocks, examWeeks }, quarters, daily, dayVariants, milestones };
  },

  /* ── Подстановка ──────────────────────────────────────────
     По месту, чтобы не трогать ни одно из 40+ обращений
     к этим именам в app.js, store.js и zero.js. */
  install(c) {
    WEEKS.length = 0;
    c.weeks.forEach(w => WEEKS.push(w));

    /* Базу снимаем ЗДЕСЬ, а не при первом `rebase()`: `install()`
       пересаживает недели из свежих шаблонов, то есть возвращает
       трек на его собственные даты. Снять базу позже значило бы
       запомнить уже сдвинутую (§12.7). */
    this.base = c.meta.start;

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

  /* ── Персональная точка отсчёта (§12.7) ───────────────────
     Трек задаёт ФОРМУ — 52 недели, темы, часы, номера сессионных
     недель. Когда человек по этой форме идёт — его дело, и это
     ровно та граница «трек ↔ человек», которую провела §13.2-bis.
     Поэтому дата живёт в `person.params.start`, а не в треке:
     иначе второй человек не смог бы начать в свой день, не сдвинув
     план первому.

     Даты считаются ОТ НОМЕРА НЕДЕЛИ, а не сдвигом существующих,
     и это не оптимизация. Сдвиг пришлось бы применять один раз
     и помнить, применён ли он: второй вызов уехал бы вдвое.
     Счёт от номера — чистая функция (старт, индекс), поэтому
     `rebase()` можно звать сколько угодно раз подряд с любым
     значением, и результат один и тот же.

     Право так считать даёт разбор: `parse()` принимает содержание
     только если недели идут встык и каждая ровно семь дней
     (§3.2-bis). То есть «дата = старт + 7·индекс» — не допущение
     о данных, а уже проверенный инвариант.

     Производные пересобираются, а не сдвигаются, по той же причине,
     по которой их пересобирает генератор (§3.2-bis): подпись
     квартала — это ТЕКСТ, посчитанный из границ, и сдвигать текст
     нечем. Иначе §3.2-quinquies немедленно и справедливо заругалась
     бы на разъехавшуюся подпись. */
  rebase(startISO) {
    if (!WEEKS.length) return false;
    if (!this.base) this.base = WEEKS[0].start;

    const want = this._isDate(startISO) ? startISO : this.base;
    if (!want) return false;

    const DAY = 86400000;
    const t0 = Date.parse(want + 'T00:00:00Z');
    if (!isFinite(t0)) return false;
    const at = n => new Date(t0 + n * DAY).toISOString().slice(0, 10);

    WEEKS.forEach((w, i) => { w.start = at(i * 7); w.end = at(i * 7 + 6); });

    META.start = WEEKS[0].start;
    META.end = WEEKS[WEEKS.length - 1].end;

    /* Дата контрольной точки — это ДАННЫЕ, а не подпись: `parse()`
       требует, чтобы она равнялась концу своей недели, и на клиенте
       тоже (§3.2-bis). Значит и пересчитывать её надо от недели. */
    MILESTONES.forEach(m => {
      const w = WEEKS[m.w - 1];
      if (w) m.date = w.end;
    });

    Object.keys(QUARTERS).forEach(k => {
      const ws = WEEKS.filter(w => String(w.q) === String(k));
      if (!ws.length) return;
      QUARTERS[k].dates = this._qDates(ws[0].start, ws[ws.length - 1].end);
    });

    return want !== this.base;
  },

  /** Подпись квартала. Ровно то же правило, что в
   *  `tools/seed-content.mjs`: год печатается один раз, если обе
   *  границы в одном году, и дважды, если квартал пересекает Новый
   *  год. Два места с одним правилом — это мина (§12.1-ter), поэтому
   *  здесь она закрыта проверкой: `--check` генератора и разбор
   *  §3.2-quinquies сверяют подпись с границами, и разошедшееся
   *  правило немедленно даёт замечание. */
  _qDates(a, b) {
    const dm = x => x.slice(8, 10) + '.' + x.slice(5, 7);
    const yy = x => x.slice(0, 4);
    return yy(a) === yy(b)
      ? `${dm(a)} – ${dm(b)}.${yy(b)}`
      : `${dm(a)}.${yy(a)} – ${dm(b)}.${yy(b)}`;
  },

  /* ── Блоки дня для текущего режима ────────────────────────
     Одно место на весь проект, и это не вкусовщина. Тройка
     `['polish','english','lab']` была зашита ДВАЖДЫ — в app.js
     и в zero.js, — и §12.1-ter уже заплатила ровно за это:
     правило обхода поправили в одной функции и забыли в другой,
     получив два правдоподобных ответа и ни одной ошибки.

     Пустой список означал бы день из нуля блоков — молча. Поэтому
     на пустом отдаём все: недосказанность лучше пустоты. */
  dayBlocks(sess) {
    if (!sess) return DAILY.slice();
    const ids = Array.isArray(META.sessionBlocks) ? META.sessionBlocks : [];
    const out = DAILY.filter(b => ids.indexOf(b.id) !== -1);
    return out.length ? out : DAILY.slice();
  },

  /* ── Кеш последнего удачного чтения ───────────────────────
     Мина, которую надо видеть заранее: кеш и `person.js` независимы,
     подстановка параметров идёт ПОВЕРХ содержания и ПО МЕСТУ.
     `install()` кладёт объекты недель прямо в `WEEKS`, а `applyPerson()`
     потом переписывает у них `tasks`. То есть объект, отданный
     в `install()`, через миг перестаёт быть шаблоном.

     Поэтому запись в кеш стоит ДО `install()` и сериализует объект
     сразу, строкой. Это не дисциплина порядка вызовов, а устройство:
     после `JSON.stringify` дальнейшие правки по месту до кеша
     не доходят физически. Ровно та же мина сработала в генераторе
     сида — там ответом был снимок ДО загрузки `person.js` (§13.2-bis). */
  _save(roadmapId, c) {
    try {
      localStorage.setItem(CONTENT_KEY, JSON.stringify({ t: roadmapId, v: c.v, c }));
      return true;
    } catch (e) {
      /* Кончилось место — это не повод ломать загрузку: кеш запас,
         а не источник. Молчать всё же нельзя: офлайн после этого
         будет работать на встроенном, и знать почему надо. */
      console.warn('content: кеш не записан', e && e.message ? e.message : e);
      return false;
    }
  },

  /** Разобранное содержание из кеша или null. Разбор ТОТ ЖЕ, что
   *  для базы: localStorage не граница доверия (§11.1), и то, что
   *  положили туда мы, мог поправить кто угодно. Второй раз `parse()`
   *  не пишется — он один на оба источника, и это же доказывает,
   *  что нормализованная форма переживает круг через сериализацию. */
  _load(roadmapId) {
    let box = null;
    try {
      const raw = localStorage.getItem(CONTENT_KEY);
      box = raw ? safeParse(raw) : null;
    } catch (e) {
      console.warn('content: кеш не прочитан', e && e.message ? e.message : e);
      return null;
    }
    if (!box || typeof box !== 'object' || Array.isArray(box)) return null;
    /* Половина ключа — трек. Содержание другого трека для этого
       такое же чужое, как отсутствие кеша вовсе. */
    if (own(box, 't', null) !== roadmapId) return null;
    const keep = this.note;
    const c = this.parse(own(box, 'c', null));
    if (!c) {
      console.warn('content: кеш не прошёл разбор —', this.note);
      this.note = keep;
      return null;
    }
    this.note = keep;
    return c;
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
    this.warn = [];
    this.v = 0;
    if (!sb || !roadmapId) { this.note = 'трек не выбран'; return this.source; }

    let raw = null;
    let reach = true;
    try {
      const { data, error } = await sb.from('roadmaps')
        .select('content').eq('id', roadmapId).maybeSingle();
      if (error) throw error;
      raw = data ? data.content : null;
    } catch (e) {
      reach = false;
      this.note = 'база недоступна: ' + (e && e.message ? e.message : String(e));
    }

    /* Пустой content — это не поломка, а «трек ещё не засеян»:
       блок 11 supabase.sql не выполняли. Всё остальное — поломка,
       и о ней надо знать. Разбор всё-или-ничего: не прошла хоть
       одна неделя — не применяется ничего. */
    const c = reach ? this.parse(raw) : null;
    if (c) {
      this._save(roadmapId, c);   // ДО install() — см. комментарий выше
      this.install(c);
      this.source = 'db';
      this.v = c.v;
      this._say();
      return this.source;
    }

    /* База не ответила или ответила негодным. Кеш — это ПОСЛЕДНЕЕ,
       что база сказала на этом устройстве, то есть строго более
       свежие сведения, чем встроенный файл: содержание правят
       в базе, а файл обновляется только выкладкой сайта. */
    const cached = this._load(roadmapId);
    if (cached) {
      this.install(cached);
      this.source = 'cache';
      this.v = cached.v;
      this.note = (this.note ? this.note + '; ' : '') +
        `показываю сохранённое содержание v${cached.v}`;
      console.warn('content: беру содержание из кеша устройства —', this.note);
      this._say();
      return this.source;
    }

    /* Замечания принадлежали разбору, который не применился. Оставить
       их значило бы ругаться на содержание, которого человек не видит. */
    this.warn = [];
    console.warn('content: остаюсь на встроенном содержании трека —', this.note);
    return this.source;
  },

  /** Сказать про замечания. Отдельно от `note`: `note` отвечает
   *  на «почему не из базы», а это — «содержание применено, но
   *  вот что в нём выглядит несогласованным». */
  _say() {
    this.warn.forEach(m => console.warn('content: ' + m +
      ' — данные не пострадали, врёт подпись. Починка: правка недель в базе обязана поднимать подпись и версию (§3.9).'));
  }
};
