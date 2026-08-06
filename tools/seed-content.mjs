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
const VERSION = 1;

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
  return out;
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

function statement(lit) {
  return [
    BEGIN,
    'update public.roadmaps',
    `   set content = '${lit}'::jsonb,`,
    '       updated_at = now()',
    ` where id = '${TRACK}'`,
    "   and (content is null or content = '{}'::jsonb);",
    END
  ].join('\n');
}

/* ── 5. Личное внутри задач — мерка для следующего захода ───
   §13.2 шаг 2 вынимает параметры человека из трека. Резать сейчас
   нельзя (§3.2-bis), но пересчитать — можно и нужно. */
const PERSONAL = /ASUS|MacBook|A12-9720P|Kingston|NVMe|студенческ|Student Pricing|бюджет|Брест|Минск|rabota\.by|dev\.by/i;
function personalSeams(WEEKS) {
  const hits = [];
  WEEKS.forEach(w => w.tasks.forEach(x => { if (PERSONAL.test(x)) hits.push(`W${w.w}`); }));
  return hits;
}

/* ── 6. Режимы ──────────────────────────────────────────────── */
const data = await readData();
const stat = verify(data);
const lit = sqlLiteral(pack(data));
const stmt = statement(lit);
const seams = personalSeams(data.WEEKS);

if (mode === 'print') {
  ok(`${stat.N} недель, ${stat.tasks} задач, ${stat.sum.toFixed(1)} ч — производные сошлись`);
  console.error(`  личное внутри задач: ${seams.length} шт (${[...new Set(seams)].join(' ')}) — §13.2 шаг 2`);
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
ok(`seed-content совпадает с кодом: ${stat.N} недель, ${stat.tasks} задач`);
if (seams.length) {
  console.log(`  личного внутри задач: ${seams.length} шт — трек и человек ещё не разделены (§13.2)`);
}
