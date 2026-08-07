#!/usr/bin/env node
/* ============================================================
   seed-content.mjs — сборка `roadmaps.content` из кода (§3.2).

   Зачем он есть. 52 недели переезжают из `data-weeks.js` в базу.
   Переносить 52 недели, 224 задачи и восемь производных дат руками —
   это гарантированная опечатка, ровно та, от которой предостерегает
   §12.1: спека считает константы, а данные считают производные.
   Поэтому блоб собирает скрипт, а не руки, и он же сверяет
   производные арифметикой с источником, прежде чем что-то напечатать.

   Что попадает в content: только то, что относится к ТРЕКУ.
   META, QUARTERS, DAILY, DAY_VARIANTS, MILESTONES, WEEKS.
   Не попадает: HARDWARE, BUDGET, MARKET, RESOURCES, CV — это
   параметры человека и справочники, они уезжают отдельным заходом
   (§13.2, шаг 2). Скрипт отдельно считает, сколько личного ещё
   осталось внутри задач недель, — чтобы у следующего захода было
   число, а не ощущение.

   Режимы:
     node tools/seed-content.mjs           печатает SQL-стейтмент
     node tools/seed-content.mjs --write   врезает его в supabase.sql
     node tools/seed-content.mjs --check   сверяет блоб в supabase.sql
                                           с тем, что сейчас в коде

   Последний режим гоняет CI. Без него блоб в supabase.sql тихо
   разошёлся бы с `data-weeks.js` при первой же правке содержания,
   и на новом проекте засеялось бы старое.

   Про экранирование, и это не украшательство. SQL Editor в Supabase
   рвёт отправку по точкам с запятой (§9), а в задачах недель их 27.
   Поэтому в готовом литерале не остаётся ни одной `;`, ни одной
   одинарной кавычки и ни одной пары `--`: они записаны escape-
   последовательностями JSON (;, ', -), которые
   `::jsonb` разворачивает обратно уже внутри Postgres. Корректность
   подмены не предполагается, а проверяется round-trip'ом.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const SQL = new URL('supabase.sql', ROOT);
const TRACK = 'cyber';
/* v2 — разделение «трек ↔ человек» (§13.2 шаг 2): в задачах появились
   подстановки `{{ключ}}`, а в META — `sessionBlocks`. Форма содержания
   изменилась, значит одного `--write` мало: живая строка непуста,
   и прежнее условие «только если пусто» её бы не тронуло. Поэтому
   условие теперь по версии, а поле `v` заведено ровно для этого.

   v3 — правка того же захода, найденная на живом сайте: подстановка
   стояла в косвенном падеже («на {{daily}}»), и на незаполненном
   профиле выходило «на повседневная машина». Имена машин по-русски
   несклоняемы, умолчание — нет, и гадать тут нечем: предложения
   переписаны так, чтобы падеж не зависел от подставленного. */
const VERSION = 3;

const BEGIN = '-- >>> seed-content: сгенерировано tools/seed-content.mjs, руками не править';
const END = '-- <<< seed-content';

const mode = process.argv.includes('--check') ? 'check'
  : process.argv.includes('--write') ? 'write' : 'print';

const fail = (m) => { console.error('✗ ' + m); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);

/* ── 1. Достаём константы из файлов страницы ────────────────
   Файлы — обычные скрипты и объявляют всё через `const`, то есть
   наружу ничего не кладут (§9). Читаем их в отдельном контексте
   без единого глобала: ни fetch, ни process, ни fs там нет,
   а сами файлы — свои же, из этого репозитория. */
async function readData() {
  const src = (await Promise.all(
    ['data-weeks.js', 'data.js'].map(f => readFile(new URL(f, ROOT), 'utf8'))
  )).join('\n;\n');
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(src, ctx, { filename: 'data.bundle.js', timeout: 5000 });
  const out = vm.runInContext(
    '({ WEEKS, META, QUARTERS, DAILY, DAY_VARIANTS, MILESTONES })', ctx);
  for (const [k, v] of Object.entries(out)) {
    if (v === undefined) fail(`в данных нет ${k}`);
  }

  /* СНИМОК ДО person.js, и это принципиально. `person.js` при загрузке
     сразу зовёт `applyPerson()`, а тот подставляет параметры в задачи
     ПО МЕСТУ. Прочитай мы WEEKS после — в базу уехал бы трек с чужим
     ноутбуком вместо шаблона, и заметили бы это на втором пользователе.
     Клон через JSON, потому что дальше та же структура и сериализуется. */
  const snap = JSON.parse(JSON.stringify(out));

  /* Теперь можно поднимать клиентский слой параметров: нужен он ровно
     для того, чтобы СВЕРИТЬ шаблоны с настоящим списком имён, а не
     с копией этого списка, заведённой здесь. Копия разъехалась бы —
     §11.5 уже заплатила за это списком аватаров в двух местах. */
  const shim = `
    function own(o, k, d) {
      return o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d;
    }
    function safeParse() { return null; }
    var localStorage = null, console = { warn: function () {} };
  `;
  const personSrc = await readFile(new URL('person.js', ROOT), 'utf8');
  vm.runInContext(shim + '\n;\n' + personSrc, ctx, { filename: 'person.js', timeout: 5000 });
  const vars = vm.runInContext('Person.vars()', ctx);
  const applied = vm.runInContext('WEEKS.map(w => w.tasks.slice())', ctx);
  const raws = vm.runInContext(`({
    HARDWARE_RAW, MARKET_RAW, OUTCOMES_RAW, LANGS_RAW, RULES_RAW,
    RED_FLAGS_RAW, APP_CATEGORIES_RAW, BUDGET_TEXT_RAW,
    CV_TEXT_RAW, COLD_EMAIL_RAW
  })`, ctx);

  return { ...snap, vars, applied, raws };
}

/* ── 2. Производные, которые обязаны сойтись ────────────────
   Все восемь дат вкладки YEAR собраны из границ недель при
   генерации (§12.1-bis). Если хоть одна разошлась — данные
   несогласованы уже сейчас, и сеять их нельзя. */
const dm = s => s.slice(8, 10) + '.' + s.slice(5, 7);
const yy = s => s.slice(0, 4);

/** Строка квартала. Год печатается один раз, если обе границы
 *  в одном году, и дважды, если квартал пересекает Новый год. */
function quarterDates(start, end) {
  return yy(start) === yy(end)
    ? `${dm(start)} – ${dm(end)}.${yy(end)}`
    : `${dm(start)}.${yy(start)} – ${dm(end)}.${yy(end)}`;
}

const DAY = 86400000;
const t = s => Date.parse(s + 'T00:00:00Z');
const near = (a, b) => Math.abs(a - b) < 0.05;

function verify(d) {
  const { WEEKS, META, QUARTERS, DAILY, DAY_VARIANTS, MILESTONES } = d;
  const errs = [];
  const N = WEEKS.length;

  if (N < 1) errs.push('недель ноль');

  WEEKS.forEach((w, i) => {
    const at = `W${i + 1}`;
    if (w.w !== i + 1) errs.push(`${at}: поле w = ${w.w}, а место ${i + 1}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.start)) errs.push(`${at}: start не дата`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.end)) errs.push(`${at}: end не дата`);
    if (t(w.end) - t(w.start) !== 6 * DAY) errs.push(`${at}: неделя не семь дней`);
    if (!Number.isInteger(w.q) || w.q < 1 || w.q > 4) errs.push(`${at}: квартал ${w.q}`);
    if (typeof w.topic !== 'string' || !w.topic) errs.push(`${at}: пустая тема`);
    if (!Array.isArray(w.tasks) || !w.tasks.length) errs.push(`${at}: нет задач`);
    if (!Number.isFinite(w.hours) || w.hours < 0) errs.push(`${at}: часы ${w.hours}`);
    if (typeof w.deliverable !== 'string') errs.push(`${at}: нет артефакта`);
    if (i && t(w.start) - t(WEEKS[i - 1].end) !== DAY) {
      errs.push(`${at}: разрыв или нахлёст с предыдущей`);
    }
  });

  if (META.start !== WEEKS[0].start) errs.push('META.start ≠ начало W1');
  if (META.end !== WEEKS[N - 1].end) errs.push(`META.end ≠ конец W${N}`);

  const sum = WEEKS.reduce((a, w) => a + w.hours, 0);
  if (!near(sum, META.totalHours)) {
    errs.push(`часы недель ${sum.toFixed(1)} ≠ META.totalHours ${META.totalHours}`);
  }
  META.sessionWeeks.forEach(n => {
    if (!Number.isInteger(n) || n < 1 || n > N) errs.push(`sessionWeeks: ${n} вне трека`);
  });
  Object.keys(META.examWeeks).forEach(k => {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > N) errs.push(`examWeeks: ${k} вне трека`);
  });

  /* Кварталы: границы берём из самих недель, а не из подписи `range`. */
  Object.keys(QUARTERS).forEach(k => {
    const q = Number(k);
    const ws = WEEKS.filter(w => w.q === q);
    if (!ws.length) { errs.push(`Q${k}: ни одной недели`); return; }
    const want = quarterDates(ws[0].start, ws[ws.length - 1].end);
    const have = QUARTERS[k].dates;
    if (have !== want) errs.push(`Q${k}.dates «${have}» ≠ производная «${want}»`);
    const qh = ws.reduce((a, w) => a + w.hours, 0);
    if (!near(qh, QUARTERS[k].hours)) {
      errs.push(`Q${k}.hours ${QUARTERS[k].hours} ≠ сумме ${qh.toFixed(1)}`);
    }
    const want2 = `W${ws[0].w}–W${ws[ws.length - 1].w}`;
    if (QUARTERS[k].range !== want2) errs.push(`Q${k}.range «${QUARTERS[k].range}» ≠ «${want2}»`);
  });

  MILESTONES.forEach(m => {
    const w = WEEKS[m.w - 1];
    if (!w) { errs.push(`контрольная точка W${m.w}: такой недели нет`); return; }
    if (m.date !== w.end) errs.push(`контрольная точка W${m.w}: ${m.date} ≠ конца недели ${w.end}`);
  });

  /* Идентификаторы дневных блоков — общий ключ с Store.d.days.
     Переименование орфанит уже накопленный прогресс, поэтому форма
     ключа проверяется здесь, а не только глазами (§3.2-bis). */
  DAILY.forEach(b => {
    if (!/^[a-z][a-z0-9_]*$/.test(String(b.id))) errs.push(`DAILY: дурной id «${b.id}»`);
    if (!Number.isFinite(b.min) || b.min < 0) errs.push(`DAILY «${b.id}»: минуты ${b.min}`);
  });
  if (!Array.isArray(DAY_VARIANTS) || !DAY_VARIANTS.length) errs.push('DAY_VARIANTS пуст');

  if (errs.length) fail('данные несогласованы:\n  ' + errs.join('\n  '));
  return { N, sum, tasks: WEEKS.reduce((a, w) => a + w.tasks.length, 0) };
}

/* ── 3. Сборка блоба ────────────────────────────────────────
   Порядок ключей фиксирован: иначе --check краснел бы на
   перестановке, которая ничего не меняет. */
function pack(d) {
  const { WEEKS, META, QUARTERS, DAILY, DAY_VARIANTS, MILESTONES } = d;
  return {
    v: VERSION,
    meta: {
      start: META.start,
      end: META.end,
      totalHours: META.totalHours,
      weeklyHours: META.weeklyHours,
      sessionWeeks: META.sessionWeeks.slice(),
      sessionBlocks: META.sessionBlocks.slice(),
      examWeeks: { ...META.examWeeks }
    },
    quarters: Object.fromEntries(Object.keys(QUARTERS).sort().map(k => [k, {
      code: QUARTERS[k].code, name: QUARTERS[k].name, range: QUARTERS[k].range,
      dates: QUARTERS[k].dates, hours: QUARTERS[k].hours,
      goal: QUARTERS[k].goal, principle: QUARTERS[k].principle
    }])),
    daily: DAILY.map(b => ({ id: b.id, name: b.name, min: b.min, desc: b.desc })),
    dayVariants: DAY_VARIANTS.map(v => ({ name: v.name, when: v.when, blocks: v.blocks })),
    milestones: MILESTONES.map(m => ({
      w: m.w, date: m.date, name: m.name, test: m.test, targets: { ...m.targets }
    })),
    weeks: WEEKS.map(w => ({
      w: w.w, start: w.start, end: w.end, q: w.q, topic: w.topic,
      tasks: w.tasks.slice(), hours: w.hours, deliverable: w.deliverable
    }))
  };
}

/* ── 4. Литерал, безопасный для SQL Editor ──────────────────
   `;`, `'` и пара `--` уезжают в \uXXXX. Все три символа в этом
   JSON встречаются только внутри строк, но полагаться на это
   нельзя — поэтому подмена проверяется round-trip'ом. */
function sqlLiteral(obj) {
  const plain = JSON.stringify(obj);
  const esc = plain
    .replace(/;/g, '\\u003b')
    .replace(/'/g, '\\u0027')
    .replace(/-(?=-)/g, '\\u002d');

  if (JSON.stringify(JSON.parse(esc)) !== plain) fail('экранирование исказило данные');
  if (/[;']/.test(esc)) fail('в литерале осталась ; или кавычка');
  if (esc.includes('--')) fail('в литерале осталась пара --');
  return esc;
}

/* Условие — по ВЕРСИИ содержания, а не по «пусто ли оно».
   Прежнее `content = '{}'` работало ровно один раз: после первого
   применения содержание непусто, и никакая правка недель до базы
   больше не доезжает. На пустом content выражение даёт 0 и тоже
   срабатывает, поэтому одного запроса хватает и новому проекту,
   и живому. Идемпотентность прежняя: второй запуск на той же версии
   возвращает ноль строк.

   Каст написан так, чтобы не бросить исключение НИКОГДА: если в `v`
   окажется строка или объект, jsonb_typeof отсечёт её до каста.
   Падение миграции на кривых данных — это ровно тот случай, когда
   «не применилось ничего» лучше, чем половина. */
function statement(lit) {
  return [
    BEGIN,
    'update public.roadmaps',
    `   set content = '${lit}'::jsonb,`,
    '       updated_at = now()',
    ` where id = '${TRACK}'`,
    '   and coalesce(',
    "         case when jsonb_typeof(content -> 'v') = 'number'",
    "              then (content ->> 'v')::int end, 0) < " + VERSION + ';',
    END
  ].join('\n');
}

/* ── 5. Личное внутри задач — теперь запрет, а не мерка ─────
   §13.2 шаг 2 вынул параметры человека из трека, и с этого момента
   счётчик обязан показывать ноль. Предупреждение здесь не годится:
   «просто оставим как есть, потом уберём» — это и есть та тропинка,
   по которой личное возвращается в трек. Поэтому — падение.

   Из прежнего списка маркеров убрано слово «бюджет»: оно ловило
   ссылку «§Бюджет» в задаче W51, то есть отсылку к разделу трека,
   а вовсе не бюджет человека. Одиннадцатое попадание из §3.2-bis
   было ложным — настоящих швов было десять. */
const PERSONAL = new RegExp(
  ['ASUS', 'MacBook', 'A12-9720P', 'Kingston', 'Student Pricing', 'студенческ',
   'Брест', 'Минск', 'Беларус', 'Приорбанк', 'rabota\\.by', 'dev\\.by',
   'justjoin', 'nofluffjobs', 'niebezpiecznik', 'pracuj\\.pl'].join('|'), 'i');

function personalSeams(WEEKS) {
  const hits = [];
  WEEKS.forEach(w => w.tasks.forEach(x => { if (PERSONAL.test(x)) hits.push(`W${w.w}`); }));
  return hits;
}

/* ── 5-bis. Подстановки обязаны разрешаться ─────────────────
   Опечатка в имени ключа не ломает страницу: `{{tpyo}}` просто
   остаётся видимым в тексте задачи (так решено намеренно, см.
   person.js). Значит поймать её должен кто-то другой, и здесь для
   этого есть всё: и шаблоны, и НАСТОЯЩИЙ список имён из person.js.

   Проверяется дважды и по-разному. Сначала — что каждое имя из
   шаблона есть среди переменных. Потом — что после применения
   параметров в задачах не осталось ни одной пары `{{`. Второе
   не следует из первого: подстановка могла бы и не сработать вовсе,
   и первая проверка этого бы не заметила. */
const TPL_RE = /\{\{([a-z][a-z0-9_]{0,23})\}\}/g;

/* Подстановки, значение которых — свободное существительное: имя
   машины, города, вуза. Числа и готовые обороты сюда не входят.
   Нужны отдельным списком из-за правила ниже. */
/* Список пополняется вместе с анкетой, и это не формальность: правило
   ниже действует только на то, что в нём перечислено. `name_short`
   и `edu_en` заведены 07.08.2026 (§13.2-sexies) и внесены сюда тем же
   коммитом — забыть их значило бы завести подстановку вне проверки. */
const NOUNS = ['daily', 'lab', 'city', 'hub', 'abroad', 'edu', 'edu_en', 'employers',
  'boards', 'lang2', 'lang2t', 'name', 'name_short'];

/* Предлог перед существительным требует косвенного падежа, а подставить
   туда можно что угодно. Имена машин по-русски несклоняемы («на MacBook
   Air» — верно), а нейтральное умолчание «повседневная машина» — нет,
   и выходит «на повседневная машина». Найдено на живом сайте уже после
   выкладки, поэтому проверка и появилась: гадать про падеж нечем,
   предложение надо строить так, чтобы падеж от подстановки не зависел. */
const PREP = /(?:^|[\s(])(на|в|во|с|со|из|для|по|о|об|к|ко|у|от|до|при|под|над|за|без|про|через|между|перед)\s+$/i;

function checkTemplates(WEEKS, DAILY, vars, applied, raws) {
  const errs = [];
  const seen = new Set();

  /* Рекурсия по любому шаблону: массив, объект, строка. */
  function walk(node, at) {
    if (typeof node === 'string') { scan(node, at); return; }
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, `${at}[${i}]`)); return; }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(k => walk(node[k], `${at}.${k}`));
    }
  }

  function scan(s, at) {
    if (typeof s !== 'string') return;
    for (const m of s.matchAll(TPL_RE)) {
      seen.add(m[1]);
      if (!Object.prototype.hasOwnProperty.call(vars, m[1])) {
        errs.push(`${at}: подстановка «${m[1]}» — такого имени нет в Person.vars()`);
      }
      if (NOUNS.indexOf(m[1]) !== -1) {
        const before = s.slice(0, m.index);
        const p = before.match(PREP);
        if (p) errs.push(`${at}: «${p[1]} {{${m[1]}}}» — предлог требует падежа, а подставить могут что угодно. Перестрой предложение.`);
      }
    }
    /* Незакрытая пара `{{` не попадёт в regexp вовсе и уедет в базу
       как есть. Ловим её отдельно, по числу открывающих пар. */
    const opens = (s.match(/\{\{/g) || []).length;
    const pairs = (s.match(TPL_RE) || []).length;
    if (opens !== pairs) errs.push(`${at}: «{{» без закрывающей пары или дурное имя`);
  }

  WEEKS.forEach(w => w.tasks.forEach((x, i) => scan(x, `W${w.w}[${i}]`)));
  WEEKS.forEach(w => scan(w.deliverable, `W${w.w}.deliverable`));
  DAILY.forEach(b => { scan(b.name, `daily.${b.id}.name`); scan(b.desc, `daily.${b.id}.desc`); });

  /* Шаблоны в data.js — та же беда и тот же разбор. Первая версия
     проверки смотрела только содержание трека, и предлог спокойно
     дожил до экрана в карте рынка. Проверять надо ВСЕ шаблоны,
     а не те, что попадают в базу. */
  Object.keys(raws).forEach(name => walk(raws[name], name));

  applied.forEach((tasks, i) => tasks.forEach((x, j) => {
    if (String(x).indexOf('{{') !== -1) {
      errs.push(`W${i + 1}[${j}]: подстановка не сработала — в готовом тексте осталось «{{»`);
    }
  }));

  if (errs.length) fail('шаблоны не сходятся:\n  ' + errs.join('\n  '));
  return seen;
}

/* ── 6. Режимы ──────────────────────────────────────────────── */
const data = await readData();
const stat = verify(data);
const keys = checkTemplates(data.WEEKS, data.DAILY, data.vars, data.applied, data.raws);
const seams = personalSeams(data.WEEKS);
if (seams.length) {
  fail('в задачах трека осталось личное: ' + [...new Set(seams)].join(' ') +
       '\n  Трек и человек разделены (§13.2 шаг 2), и обратно личное не возвращается.\n' +
       '  Если это ложное срабатывание — правь список маркеров осознанно, а не задачу.');
}
const lit = sqlLiteral(pack(data));
const stmt = statement(lit);

if (mode === 'print') {
  ok(`${stat.N} недель, ${stat.tasks} задач, ${stat.sum.toFixed(1)} ч — производные сошлись`);
  console.error(`  подстановок в треке: ${keys.size} имён (${[...keys].sort().join(' ')})`);
  console.error(`  личного внутри задач: 0`);
  console.error(`  литерал: ${Buffer.byteLength(lit, 'utf8')} байт`);
  console.log(stmt);
  process.exit(0);
}

const sql = await readFile(SQL, 'utf8');
const from = sql.indexOf(BEGIN);
const to = sql.indexOf(END);

if (mode === 'write') {
  if (from === -1 || to === -1 || to < from) fail(`в supabase.sql нет маркеров\n  ${BEGIN}\n  ${END}`);
  const next = sql.slice(0, from) + stmt + sql.slice(to + END.length);
  await writeFile(SQL, next);
  ok(`supabase.sql обновлён: ${stat.N} недель, ${Buffer.byteLength(lit, 'utf8')} байт литерала`);
  process.exit(0);
}

/* --check */
if (from === -1 || to === -1 || to < from) fail('в supabase.sql нет блока seed-content');
const have = sql.slice(from, to + END.length);
if (have !== stmt) {
  fail('блок seed-content в supabase.sql разошёлся с data-weeks.js / data.js.\n' +
       '  Это ровно та мина из §12.1: производные посчитаны заново, а блоб остался старым.\n' +
       '  Починка: node tools/seed-content.mjs --write');
}
ok(`seed-content совпадает с кодом: ${stat.N} недель, ${stat.tasks} задач, v${VERSION}`);
console.log(`  подстановок: ${keys.size} имён, личного внутри задач: 0 (§13.2 шаг 2)`);
