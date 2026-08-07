/* ============================================================
   app.js — рендеринг и логика SOC Roadmap 365
   ============================================================ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
/* Экранирование живёт в security.js: одна реализация на весь проект.
   Здесь только псевдоним, чтобы не править сотню мест вызова. */
const esc = secEsc;

const S = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}${extra||''}</svg>`;

const ICONS = {
  today:  S('<path d="M3 12h4l2-5 3 10 2.5-7 1.8 4H21"/>'),
  year:   S('<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v5.5l3.5 2"/><path d="M12 3.5v1M20.5 12h-1M12 20.5v-1M3.5 12h1"/>'),
  weeks:  S('<rect x="3" y="4.5" width="18" height="15.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M7.5 14l2 2 4.5-4.5"/>'),
  career: S('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V6A1.5 1.5 0 0 1 10 4.5h4A1.5 1.5 0 0 1 15.5 6v1.5"/><path d="M3 13h18"/>'),
  more:   S('<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
  shield: S('<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4.5"/>'),
  check:  S('<path d="M4.5 12.5l4.5 4.5L19.5 6.5"/>'),
  chev:   S('<path d="M9 5l7 7-7 7"/>'),
  theme:  S('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>'),
  out:    S('<path d="M14 20.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5H14"/><path d="M17 15.5l3.5-3.5L17 8.5"/><path d="M20 12H9.5"/>'),
  user:   S('<circle cx="12" cy="8.5" r="3.7"/><path d="M4.8 20c.7-3.6 3.7-5.7 7.2-5.7s6.5 2.1 7.2 5.7"/>'),
  rocket: S('<path d="M12 3c3.5 2 5.5 5.5 5.5 9.5L12 18l-5.5-5.5C6.5 8.5 8.5 5 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M8.5 17c-1.5.6-2 2-2 4 2 0 3.4-.5 4-2M15.5 17c1.5.6 2 2 2 4-2 0-3.4-.5-4-2"/>'),
  timer:  S('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5"/><path d="M9.5 2.5h5"/>'),
  inbox:  S('<path d="M3.5 13.5L6 5.5h12l2.5 8"/><path d="M3.5 13.5h4l1.2 2.5h6.6l1.2-2.5h4v5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18.5z"/>'),
  radar:  S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-3.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
  bolt:   S('<path d="M13.5 3L6 13.5h5L10.5 21 18 10.5h-5z"/>'),
  rank:   S('<path d="M5 20.5h4v-7H5zM10 20.5h4V6h-4zM15 20.5h4v-10h-4z"/>'),
  file:   S('<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V7.5H18"/><path d="M9 12.5h6M9 16h4"/>'),
  anki:   S('<path d="M7 4.5h9.5A1.5 1.5 0 0 1 18 6v13.5H8.5A1.5 1.5 0 0 1 7 18z"/><path d="M4.5 7.5v11A1.5 1.5 0 0 0 6 20h1"/><path d="M10.5 9h4M10.5 12.5h5"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6"/>'),
  sound:  S('<path d="M4.5 9.5h3L12 5.5v13L7.5 14.5h-3z"/><path d="M15.5 9.5a3.8 3.8 0 0 1 0 5M18.2 7a7.2 7.2 0 0 1 0 10"/>')
};
/* `wide: true` — пункт живёт только в сайдбаре. Таббар и без того
   семиколоночный; восьмая колонка на 360 px даёт 45 px на иконку
   с подписью, то есть подпись обрезается. Поэтому на узком экране
   SETTINGS показывается секцией внутри MORE (§12.2). */
const NAV = [
  { id: 'today',    label: 'TODAY'    },
  { id: 'anki',     label: 'ANKI'     },
  { id: 'year',     label: 'YEAR'     },
  { id: 'weeks',    label: 'WEEKS'    },
  { id: 'career',   label: 'CAREER'   },
  { id: 'rank',     label: 'RANK'     },
  { id: 'more',     label: 'MORE'     },
  { id: 'settings', label: 'SETTINGS', wide: true }
];
/* Пункт виден, только если раздел не спрятан (§12.2). */
const navItems = () => NAV.filter(n => !Store.hidden(n.id));

/* Статусы недели хранятся по-русски и такими лежат в базе.
   Меняем только подпись — иначе поедут уже сохранённые данные. */
const ST_LABEL = {
  'Не начата': 'TODO', 'В работе': 'WIP', 'Закрыта': 'DONE',
  'Частично': 'PARTIAL', 'Перенесена': 'MOVED'
};
const stLabel = v => ST_LABEL[v] || v;

let VIEW = 'today';
let WEEK_FILTER = 'all';

/* ══════════════════ SHELL ══════════════════ */
/** Счётчик на пункте меню. Пока он не нужен — атрибута нет вовсе,
 *  иначе пустой кружок висит на виду и обесценивает сигнал. */
function navBadge(id) {
  if (id !== 'anki' || Store.hidden('anki')) return '';
  const n = Vocab.rawCount();
  return n ? `<i class="nav-badge">${n > 99 ? '99+' : n}</i>` : '';
}
function buildNav() {
  const items = navItems();
  $('#tabbar').innerHTML = items.filter(n => !n.wide).map(n =>
    `<button class="tab${n.id === VIEW ? ' on' : ''}" data-go="${n.id}">${own(ICONS, n.id, ICONS.shield)}${navBadge(n.id)}<span>${n.label}</span></button>`).join('');
  $('#snav').innerHTML = items.map(n =>
    `<button class="${n.id === VIEW ? 'on' : ''}" data-go="${n.id}">${own(ICONS, n.id, ICONS.shield)}<span>${n.label}</span>${navBadge(n.id)}</button>`).join('');
  $$('#tabbar [data-go], #snav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}
const CRUMB = { today:'today', anki:'anki', year:'year', weeks:'weeks', career:'career', rank:'rank', more:'more', settings:'settings' };
function paintCrumbs() {
  const el = $('#crumbs');
  if (!el) return;
  const cw = currentWeek();
  el.innerHTML = `<span class="c-path">~/soc-365/${esc(CRUMB[VIEW] || VIEW)}</span>` +
    `<span class="c-sep">·</span><span class="c-meta">${isBeforeStart() ? 'до старта' : 'W' + cw + '/52'}</span>` +
    `<span class="c-cur"></span>`;
}

function go(id) {
  /* Скрытый раздел недостижим и по прямому вызову, не только из меню
     (§12.2). Молча уводим на TODAY: сообщать «раздел выключен» —
     это объяснение устройства продукта, а ему в интерфейсе не место
     (§3.8). Человек сам его и выключил. */
  if (Store.hidden(id)) id = 'today';
  VIEW = id;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + id));
  $$('#tabbar [data-go], #snav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === id));
  window.scrollTo({ top: 0, behavior: 'instant' });
  render(id);
  paintCrumbs();
  decodeHeadings($('#v-' + id));
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._x); t._x = setTimeout(() => t.classList.remove('on'), 2200);
}
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  Store.d.theme = th; Store.save();
}

/* ─── анимации ─── */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Появление блоков при скролле. Один наблюдатель, отписка после показа. */
let _io = null;
function observeReveals(root) {
  if (REDUCED) { $$('.reveal', root).forEach(e => e.classList.add('seen')); return; }
  if (!_io) {
    _io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); _io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  }
  $$('.reveal:not(.seen)', root).forEach(e => _io.observe(e));
}

/** Плавный счёт числа. Короткий, только на видимых цифрах. */
function countUp(el, to, suffix) {
  if (REDUCED || to === 0) { el.textContent = fmtNum(to) + (suffix || ''); return; }
  const dur = 700, t0 = performance.now(), from = 0;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtNum(from + (to - from) * e) + (suffix || '');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function fmtNum(n) { return Number.isInteger(n) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1); }


/** Эффект расшифровки текста: символы перебираются и складываются в слово.
 *
 *  Считает по СТЕННЫМ ЧАСАМ, а не по кадрам (§3.7), и это не стиль.
 *  Первая версия считала кадры, и на живом сайте это стоило видимого
 *  дефекта: `requestAnimationFrame` в скрытой вкладке не идёт вовсе.
 *  Человек, ушедший на другую вкладку в первые полторы секунды,
 *  возвращался к заголовкам, навсегда застывшим глифами: кадры встали
 *  на середине, страховка к тому времени уже отработала, а повторно
 *  расшифровать мешает `data-decoded`. Найдено глазами 07.08.2026
 *  (§12.6-bis).
 *
 *  По стенным часам возврат во вкладку чинит себя сам: прошедшего
 *  времени уже больше отведённого, и первый же кадр пишет готовый
 *  текст. Ровно тот вывод, который §3.7 сделала про таймер. */
const GLYPHS = '01<>[]{}/\\|=+*#$%&@ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/* Мс на «кадр». 17 — это те же 60 Гц, на которых считалась прежняя
   версия: смена единицы измерения не должна менять длительность,
   иначе страховка на 1200 мс начнёт срабатывать раньше конца. */
const DECODE_STEP = 17;
function decodeText(el) {
  if (REDUCED || !el || el.dataset.decoded) return;
  el.dataset.decoded = '1';
  const target = el.textContent;
  // страховка: что бы ни случилось с кадрами, текст восстановится
  setTimeout(() => { if (el.isConnected) el.textContent = target; }, 1200);
  const len = target.length;
  if (len > 40) return;
  const total = len * 2 + 8;
  const t0 = Date.now();
  const tick = () => {
    const frame = (Date.now() - t0) / DECODE_STEP;
    if (frame >= total) { el.textContent = target; return; }
    let out = '';
    for (let i = 0; i < len; i++) {
      if (target[i] === ' ') { out += ' '; continue; }
      const start = i * 2;
      if (frame > start + 6) out += target[i];
      else if (frame > start) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += '';
    }
    el.textContent = out;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Расшифровать заголовки секций во вкладке при её показе. */
function decodeHeadings(root) {
  $$('.section-h h2', root).forEach((h, i) => setTimeout(() => decodeText(h), i * 70));
}

/** Тактильный отклик там, где он уместен. */
function buzz(ms) { try { !REDUCED && navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {} }

/* ─── звук (§12.5) ───
   REDUCED здесь намеренно НЕ участвует: движение и звук — разные оси.
   Человек может не выносить анимацию и спокойно относиться к писку,
   и наоборот. У звука свой флаг, и он живёт в настройках аккаунта.

   Разблокировка. AudioContext на iOS рождается suspended, и resume()
   обязан быть вызван синхронно внутри настоящего нажатия. Слушатель
   висит на всём документе в фазе перехвата: разбирать, какая именно
   кнопка нажата, бессмысленно — годится любая. Пока звук выключен,
   arm() выходит первой строкой и контекст не создаётся вовсе.
   Снимать слушатель нельзя: iOS роняет контекст обратно в suspended
   после ухода из вкладки, и разблокировать его надо будет заново. */
window.addEventListener('pointerdown', () => Sound.arm(), true);
window.addEventListener('keydown', () => Sound.arm(), true);

/* ─── широкое озвучивание интерфейса (§12.5, редакция 2) ───

   Закрытый список из пяти поводов отменён: интерфейс озвучивается
   целиком. Но двести правок в обработчиках — это двести мест, где
   можно забыть, и ровно та ситуация, из-за которой в проекте одно
   экранирование на всех (§11.2). Поэтому мелочь ловится ОДНИМ
   делегированным слушателем на документ, по разметке, а не по
   именам функций.

   Порядок веток важен: сначала самые узкие признаки, потом общие.
   Иначе `data-hide` (переключатель) сначала совпадёт с `.btn`
   и прозвучит как обычная кнопка.

   Отдельный вопрос — что НЕ озвучено. Прокрутка и `mousemove`
   молчат: оба события идут десятками в секунду и сливаются в дрон,
   в котором нет ни одного бита смысла. Наведение озвучено только
   там, где оно дискретно (клетка календаря, пункт меню), и молчит
   на плотных сетках. Это не осторожность, а то же правило §3.8
   про эффект наведения: если он заметен раньше содержимого, он
   слишком яркий. */
function uiSoundFor(el) {
  if (!el) return;
  if (el.disabled) { Sound.deny(); return; }

  if (el.closest('[data-hide],[data-sound],[data-soundui]')) return;   // у них свой голос
  if (el.closest('[data-go]'))    { Sound.nav(navIndex(el.closest('[data-go]').dataset.go)); return; }
  if (el.closest('[data-block],[data-task],[data-repo]')) return;      // это уровень действий
  if (el.closest('summary'))      { Sound.open(!el.closest('details').open); return; }
  if (el.closest('.wk-h'))        { Sound.open(!el.closest('.wk').classList.contains('open')); return; }
  if (el.closest('button,.btn'))  { Sound.press(); return; }
}
window.addEventListener('click', e => {
  const el = e.target && e.target.closest ? e.target.closest('button,.btn,summary,.wk-h,[data-go]') : null;
  if (el) uiSoundFor(el);
}, true);

/* Поля: на фокус — шорох, на сохранение — короткое подтверждение.
   Посимвольного звука нет намеренно, это тот же дребезг, из-за
   которого молчит прокрутка. */
window.addEventListener('focusin', e => {
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range') Sound.field(false);
}, true);
window.addEventListener('change', e => {
  const t = e.target;
  if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (t.type === 'range') return;                       // у VOL своя проба
  if (t.closest && t.closest('[data-f-status]')) return; // у статуса недели свой голос
  Sound.field(true);
}, true);

/** Номер вкладки в NAV — он же высота ноты перехода. Восемь
 *  разделов дают восемь разных нот, и через неделю переход
 *  узнаётся на слух раньше, чем глаз доходит до заголовка. */
function navIndex(id) {
  for (let i = 0; i < NAV.length; i++) if (NAV[i].id === id) return i;
  return 0;
}

/* Достижения нигде не «выдаются» — они пересчитываются из прогресса
   каждый раз заново (Store.achievements()). Значит момент получения
   можно поймать только сравнением с прошлым состоянием.

   Слепок снимается ПОСЛЕ загрузки прогресса, иначе первый же вызов
   объявит новыми все шесть достижений. И сравнение зовётся только
   из обработчиков, которые меняют данные, — не из renderAll(). */
let ACH_SEEN = null;
function achSnapshot() {
  ACH_SEEN = Store.achievements().filter(a => a.got).map(a => a.id);
}
/** Появилось ли новое достижение с прошлой проверки. */
function achCheck() {
  if (!ACH_SEEN) { achSnapshot(); return false; }
  const now = Store.achievements().filter(a => a.got).map(a => a.id);
  const fresh = now.filter(id => ACH_SEEN.indexOf(id) === -1);
  ACH_SEEN = now;
  if (!fresh.length) return false;
  Sound.ach();
  Fx.glitch(document.getElementById('zeroBox'), false);
  return true;
}

/* ══════════════════ RENDER ══════════════════ */
function renderAll() {
  buildNav();
  /* Скрытые НЕ отфильтровываем здесь: пропустить вызов и вычистить
     разметку — разные вещи. Первая версия фильтровала список, и старый
     DOM скрытого раздела оставался висеть — поймал тест. Решение о том,
     что делать со скрытым, принимает один render() (§12.2). */
  ['today','anki','year','weeks','career','rank','more','settings'].forEach(render);
  const cw = currentWeek();
  $('#topWeek').textContent = isBeforeStart() ? 'до старта' : 'W' + cw;
  paintCrumbs();
  const t = Store.totals();
  $('#sideProgress').innerHTML =
    `<div class="row" style="justify-content:space-between"><span>YEAR</span><b>${t.pct}%</b></div>
     <div class="bar mt" style="height:6px"><i style="width:${t.pct}%"></i></div>
     <div class="tiny dim mt">${t.hoursFact} из ${t.hoursPlan} ч · ${t.closed}/52 недель</div>`;
}
function render(id) {
  if (Store.hidden(id)) { const b = $('#v-' + id); if (b) b.innerHTML = ''; return; }
  const fn = own({ today: rToday, anki: rAnki, year: rYear, weeks: rWeeks,
                   career: rCareer, rank: rRank, more: rMore,
                   settings: rSettings }, id, null);
  if (!fn) return;
  fn();
  observeReveals($('#v-' + id));
}

/* ─────────── СЕГОДНЯ ─────────── */
function rToday() {
  const today = iso(new Date());
  const cw = currentWeek();
  const w = WEEKS[cw - 1];
  const st = Store.week(cw);
  const sess = META.sessionWeeks.includes(cw);
  const blocks = Content.dayBlocks(sess);
  const goalMin = blocks.reduce((s, b) => s + (b.id === 'lab' && sess ? 35 : b.min), 0);
  const doneMin = blocks.reduce((s, b) => s + ((Store.d.days[today] || {})[b.id] ? (b.id === 'lab' && sess ? 35 : b.min) : 0), 0);
  const dow = new Date().getDay();
  const weekend = dow === 0 || dow === 6;

  let h = '';

  h += `<div class="section-h"><h2>${greeting()}</h2><span class="rule"></span></div>`;

  if (isBeforeStart()) {
    h += card(`<div class="row" style="gap:14px">
      <div style="color:var(--cyan)">${ICONS.rocket}</div>
      <div><b>Старт ${fmtRU(META.start)}</b>
      <p class="muted sm" style="margin:2px 0 0">Осталось ${daysBetween(today, META.start)} дн. Пока можно закрыть W1 заранее — железо: ${esc(Person.vars().lab)}, дальше гипервизор.</p></div></div>`);
  }

  /* дневной чеклист */
  h += `<div class="card">
    <div class="card-t">
      <div><h3>Чеклист дня</h3><div class="tiny dim">${weekend ? 'Выходной — по плану отдых. Но если хочется, никто не мешает.' : esc(Person.vars().days) + ' дн/нед · ' + (sess ? 'SESSION MODE, 1 час' : esc(Person.vars().hours) + ' ч')}</div></div>
      <span class="pill ${doneMin >= goalMin ? 'ok' : ''}">${fmtMin(doneMin)} / ${fmtMin(goalMin)}</span>
    </div>
    <div class="bar" style="margin-bottom:14px"><i style="width:${Math.round(doneMin / goalMin * 100)}%"></i></div>
    <div class="grid" style="gap:8px">${blocks.map(b => {
      const on = !!(Store.d.days[today] || {})[b.id];
      const m = (b.id === 'lab' && sess) ? 35 : b.min;
      return `<div class="chk${on ? ' on' : ''}" data-block="${b.id}">
        <div class="box">${ICONS.check}</div>
        <div class="body"><b>${b.name}</b><p>${esc(b.desc)}</p></div>
        <div class="min">${m}м</div></div>`;
    }).join('')}</div>
    ${sess ? `<p class="tiny mt" style="color:var(--amber)">Неделя сессии. Универ приоритетнее — это заложено в план, а не провал.</p>` : ''}
  </div>`;

  /* ZERO — приборная панель (§12.3). Стоит ПОД чеклистом, а не над ним:
     спека прямо требует, чтобы чеклист не уезжал вниз. Виджет собирает
     себя сам, здесь только две строки — так его можно вырезать целиком
     вместе с zero.js, ничего больше не трогая. */
  h += `<div class="section-h"><h2>ZERO</h2><span class="rule"></span></div>`;
  h += Zero.html();

  /* Словарь. Счётчик сырых слов и есть напоминание, что пора сесть
     за оформление, — поэтому он висит здесь, рядом с чеклистом,
     а не внутри своей вкладки. */
  if (!Store.hidden('anki')) {
    const vRaw = Vocab.rawCount(), vReady = Vocab.count(null, 'ready');
    h += `<div class="card">
      <div class="card-t">
        <div><h3>ANKI</h3><div class="tiny dim mono">raw ${vRaw} · ready ${vReady}</div></div>
        <span class="pill${vRaw ? ' warn' : ' ok'}">${vRaw}</span>
      </div>
      <div class="row wrap" style="gap:8px">
        <button class="btn sm${vRaw ? ' primary' : ''}" data-goto="anki">OPEN</button>
      </div>
    </div>`;
  }

  /* таймер */
  h += `<div class="card">
    <div class="card-t"><h3>TIMER</h3><span class="tiny dim">Досидел блок до конца — галочка встанет сама</span></div>
    <div class="timer" id="tBox">
      <div class="tdial">
        <div class="tsweep"></div>
        <div class="tflash"></div>
        <svg class="tsvg" viewBox="0 0 220 220" aria-hidden="true">
          <circle class="t-rail"  cx="110" cy="110" r="94"/>
          <circle class="t-ticks" cx="110" cy="110" r="79"/>
          <circle class="t-arc" id="tArc" cx="110" cy="110" r="94"
                  stroke-dasharray="${TC}" stroke-dashoffset="${TC}"/>
          <g class="t-head" id="tHead"><circle cx="110" cy="16" r="3.6"/></g>
        </svg>
        <div class="tcore">
          <div class="tt" id="tDisp">00:00</div>
          <div class="tl" id="tLbl">выбери блок</div>
          <div class="thex" id="tHex">awaiting task</div>
        </div>
      </div>
      <i class="tc tc1"></i><i class="tc tc2"></i><i class="tc tc3"></i><i class="tc tc4"></i>
    </div>
    <div class="row wrap tadd" style="justify-content:center">
      ${[-5, 1, 5, 10, 25].map(m =>
        `<button class="btn sm tchip${m < 0 ? ' minus' : ''}" data-tadd="${m}" title="${m < 0 ? 'убрать' : 'добавить'} ${Math.abs(m)} мин">${m < 0 ? '−' : '+'}${Math.abs(m)}м</button>`
      ).join('')}
    </div>
    <div class="row wrap mt" style="justify-content:center">
      ${blocks.map(b => {
        const mins = (b.id === 'lab' && sess) ? 35 : b.min;
        const on = (Store.d.days[today] || {})[b.id];
        return `<button class="btn sm${T.block === b.id ? ' primary' : ''}" data-timer="${mins}" data-tblock="${b.id}" data-tname="${esc(b.name)}">${esc(b.name)} · ${mins}м${on ? ' ✓' : ''}</button>`;
      }).join('')}
    </div>
    <div class="row mt" style="justify-content:center;gap:8px">
      <button class="btn sm" id="tPause" disabled>PAUSE</button>
      <button class="btn sm ghost" id="tReset" disabled>RESET</button>
    </div>
  </div>`;

  /* текущая неделя */
  h += `<div class="section-h"><h2>WEEK W${cw}</h2><span class="rule"></span><span class="pill q${w.q}">${QUARTERS[w.q].code}</span></div>`;
  h += weekCard(w, true);

  /* Блок PULSE убран вместе с приходом Zero (§12.3). Он показывал ровно
     три числа — streak, закрытые недели, процент года, — и все три теперь
     стоят в панели выше, рядом с полутора десятками остальных. Два места
     с одним и тем же числом на одном экране однажды разойдутся: это тот
     же почерк, что у клиента и серверной границы streak (§12.1-ter).
     streakCard() остался: там не цифры, а действие — кнопка заморозки. */
  h += streakCard();

  /* правило дня */
  const rule = RULES[dayOfYear() % RULES.length] || { name: '', text: '' };
  h += `<div class="card mt2" style="border-color:color-mix(in srgb, var(--accent) 30%, transparent)">
    <div class="tiny" style="color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Правило дня</div>
    <h3 style="margin:5px 0 4px">${esc(rule.name)}</h3>
    <p class="muted sm" style="margin:0">${esc(rule.text)}</p>
  </div>`;

  $('#v-today').innerHTML = h;

  const fb = $('#freezeBtn');
  if (fb) fb.onclick = () => {
    const day = fb.dataset.day;
    if (!confirm(`Заморозить ${fmtRU(day)}?\n\nДень перестанет считаться пропуском. Заморозок две на квартал — тратить стоит на сессию и болезнь, а не на лень.`)) return;
    try { Store.freeze(day); Sync.schedule(); Sound.freeze(); toast('Заморожено'); renderAll(); }
    catch (e) { Sound.err(); alert(e.message); }
  };

  $$('[data-block]').forEach(el => el.onclick = () => {
    const on = Store.toggleBlock(today, el.dataset.block);
    if (on) {
      el.classList.add('pulse'); buzz(14);
      /* Высота подтверждения растёт вместе с долей закрытого дня:
         пятая галочка звучит выше первой (§12.5). Считаем ПОСЛЕ
         переключения — вес учитывает только что поставленную. */
      const doneNow = blocks.reduce((s, b) => s + ((Store.d.days[today] || {})[b.id] ? 1 : 0), 0);
      Sound.ok(blocks.length ? doneNow / blocks.length : 0.5);
      /* День закрылся целиком — это веха, а не галочка. Разряд
         по карточке чеклиста в пару к звуку (§12.6). */
      if (blocks.length && doneNow === blocks.length) Fx.glitch(el.closest('.card'));
    } else {
      Sound.undo();     // раньше снятие молчало, и это читалось как «не сработало»
    }
    Sync.schedule();
    rToday(); renderAll();
  });
  $$('[data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto));
  $$('[data-timer]').forEach(b => b.onclick = () =>
    timerStart(b.dataset.tblock, +b.dataset.timer, b.dataset.tname));
  $$('[data-tadd]').forEach(b => b.onclick = () => timerAdd(+b.dataset.tadd));
  $('#tPause').onclick = () => tRunning() ? timerPause() : timerResume();
  $('#tReset').onclick = timerReset;
  tPaint();
  Zero.wire($('#v-today'));
  /* Дешифровка чисел и волна по ядру (§12.6). Обе зовутся ПОСЛЕ
     вставки разметки и обе решают сами, есть ли что показывать:
     digits() перебирает только те ячейки, чьё значение реально
     изменилось, и на первой отрисовке молчит. То есть источником
     остаётся смена числа, а не факт перерисовки, — то же правило,
     что для звука (§12.5). */
  if (Fx.digits($('#v-today'))) Fx.wave();
  bindWeekCard($('#v-today'));
}

/* ─────────── ANKI ─────────── */
/* Спека — §10 PROJECT.md. Раздел разбит на три карточки ровно по трём
   действиям, которые спека разводит намеренно: захват идёт во время
   чтения документации и занимает секунду, оформление — в блоке Cyber
   English, выгрузка — раз в несколько дней. Смешивать их нельзя:
   если на вводе спрашивать перевод, ввод перестанет случаться. */
let ANKI_DECK = 'en';
let ANKI_FIELDS = 2;
let ANKI_REEXPORT = false;
let ANKI_LIMIT = 25;          // размер прохода: 10 / 25 / вся колода
let BROWSE_FILTER = 'all';
let BROWSE_Q = '';
const BROWSE_CAP = 120;       // строк за раз; ниже подписано, сколько всего

const DECK_LABEL = { en: 'EN', pl: 'PL' };
/** Курсор на экране пальцем возвращать в поле нельзя: всплывает
 *  клавиатура и закрывает список. Автофокус — только мышь. */
function isCoarse() {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
}

/** Источник подставляется сам: номер недели и то, над чем неделя идёт. */
function ankiSource(wk) {
  const w = WEEKS[wk - 1];
  return w ? 'W' + w.w + ' · ' + w.topic : '';
}

/* ── тренажёр ──────────────────────────────────────────────
   Оформлен как окно терминала: моноширинный шрифт, приглашение
   в шапке, ответ выводится строками, прогресс — ASCII-метром.
   Блеска нет намеренно: ни белых бликов, ни drop-shadow. Ответ
   отмечается цветом рамки и текста, потому что слово разглядывают
   подолгу, а вспышка на каждой карточке бьёт по глазам (§3.8).

   Переворот — настоящий rotateY с perspective, и живёт он ТОЛЬКО
   внутри .dstage с overflow: hidden. Причина в §3.5: трансформ,
   выходящий за родителя, расширяет документ, Safari ужимает
   страницу, и position: fixed уезжает вместе с layout-viewport.
   .dstage не предок таббара, поэтому containing block ему не грозит,
   но клипование обязательно. */

/** ASCII-метр вместо кольца: в стиле командной строки и, в отличие
 *  от светящегося кольца, не мигает на каждой карточке. */
function dMeter(done, total) {
  const cells = 22;
  const fill = total ? Math.round((done / total) * cells) : 0;
  return '[' + '█'.repeat(fill) + '░'.repeat(Math.max(0, cells - fill)) + ']';
}
function dTime(s) {
  const m = Math.floor(s / 60);
  return (m ? m + 'm ' : '') + (s % 60) + 's';
}

/** Шапка окна. Приглашение настоящее по смыслу: показывает колоду
 *  и размер прохода, то есть работает подписью, а не украшением. */
function dHead(right) {
  return `<div class="term-bar">
    <i class="term-led"></i>
    <span class="term-title mono">soc365@drill:~/${esc(ANKI_DECK)}$</span>
    <span class="spacer"></span>
    <span class="tiny dim mono">${right || ''}</span>
  </div>`;
}

function rDrill() {
  const box = $('#v-anki');
  const total = Drill.total, done = Drill.done;

  let h = `<div class="section-h"><h2>DRILL</h2><span class="rule"></span>
    <span class="pill accent">${DECK_LABEL[Drill.deck] || esc(Drill.deck)}</span></div>`;

  /* ── проход закончен ── */
  if (Drill.finished || !Drill.card()) {
    h += `<div class="term">
      ${dHead('exit 0')}
      <div class="term-body">
        <div class="tline mono dim">$ drill --deck=${esc(Drill.deck)}</div>
        <div class="tline mono">&gt; cards&nbsp;&nbsp;${total}</div>
        <div class="tline mono ok">&gt; ok&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Drill.ok}</div>
        <div class="tline mono ag">&gt; again&nbsp;&nbsp;${Drill.again}</div>
        <div class="tline mono">&gt; time&nbsp;&nbsp;&nbsp;${dTime(Drill.seconds())}</div>
        <div class="tline mono dim">${dMeter(1, 1)} ${total}/${total}</div>
        <div class="tline mono acc">[ session closed ]</div>
        <div class="row wrap mt" style="gap:8px">
          <button class="btn sm primary" id="dAgainAll">RESTART</button>
          <button class="btn sm ghost" id="dExit">EXIT</button>
        </div>
      </div>
    </div>`;
    box.innerHTML = h;
    $('#dAgainAll').onclick = () => { Drill.start(Drill.deck, ANKI_LIMIT); rAnki(); };
    $('#dExit').onclick = () => { Drill.stop(); rAnki(); renderAll(); };
    return;
  }

  const c = Drill.card();
  const w = c.week ? WEEKS[c.week - 1] : null;
  const flipped = Drill.flipped;

  h += `<div class="term">
    ${dHead('q ' + Drill.left)}
    <div class="term-body">
      <div class="dmeter mono">
        <span class="dbar">${dMeter(done, total)}</span>
        <span class="dnum">${done}/${total}</span>
        <span class="ok">ok ${Drill.ok}</span>
        <span class="ag">again ${Drill.again}</span>
      </div>

      <div class="dstage">
        <div class="dcard${flipped ? ' flip' : ''}" id="dCard" role="button" tabindex="0"
             aria-label="Перевернуть карточку">
          <div class="dface dfront">
            <div class="dtag mono">FRONT${c.week ? ' · W' + c.week : ''}</div>
            <div class="dword mono" id="dWord">${esc(c.word)}</div>
            <div class="dprompt mono dim">_</div>
          </div>
          <div class="dface dback">
            <div class="dtag mono">BACK</div>
            <div class="dmean">${esc(c.meaning)}</div>
            ${c.example ? `<div class="dex mono">&gt; ${esc(c.example)}</div>` : ''}
            ${c.source ? `<div class="dsrc mono dim">// ${esc(c.source)}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="row wrap drow" style="gap:8px">
        ${flipped
          ? `<button class="btn sm dag" data-dact="again">AGAIN</button>
             <button class="btn sm primary dok" data-dact="know">OK</button>`
          : `<button class="btn sm primary" data-dact="flip">SHOW</button>`}
        <span class="spacer"></span>
        <button class="btn sm danger" data-dact="del">DEL</button>
        <button class="btn sm ghost" data-dact="exit">EXIT</button>
      </div>
      <div class="dkeys tiny dim mono">SPACE flip · &larr; again · &rarr; ok · D del · ESC exit</div>
    </div>
  </div>`;

  box.innerHTML = h;

  /* Слово проявляется расшифровкой глифами — тот же эффект, что
     у заголовков, и он же самый «терминальный» из всех имеющихся.
     decodeText сам уважает prefers-reduced-motion. */
  if (!flipped) decodeText($('#dWord'));

  const card = $('#dCard');
  card.onclick = () => drillAct('flip');
  card.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillAct('flip'); }
  };
  $$('[data-dact]').forEach(b => b.onclick = e => { e.stopPropagation(); drillAct(b.dataset.dact); });
}

/** Одна точка входа для мыши, тача и клавиатуры — иначе три пути
 *  разойдутся, как разошлись два экранирования до security.js. */
function drillAct(act) {
  if (!Drill.on) return;

  if (act === 'exit') { Drill.stop(); rAnki(); renderAll(); return; }

  /* На экране итога живёт только выход. Без этой проверки пробел
     и стрелки продолжали крутить счётчики за концом прохода:
     pos уходил за total, ok рос на карточках, которых уже нет. */
  if (Drill.finished || !Drill.card()) return;

  if (act === 'flip') { Drill.flip(); rDrill(); buzz(8); Sound.flip(); return; }

  if (act === 'del') {
    const c = Drill.card();
    if (!c || !confirm('Удалить «' + c.word + '» из словаря?\n\nОтменить будет нельзя.')) return;
    Drill.drop(c.lid);
    Sound.drop();
    Vocab.remove(c.lid).then(() => { rDrill(); renderAll(); });
    rDrill();
    return;
  }

  if (act !== 'know' && act !== 'again') return;
  if (!Drill.flipped) return;          // отвечать не глядя нельзя

  /* Карточка уезжает в сторону ответа: вправо зелёным, влево янтарным.
     Уход происходит внутри .dstage с overflow: hidden, поэтому
     документ не расширяется (§3.5). При reduced-motion кадр пустой
     и всё сводится к мгновенной перерисовке. */
  const el = $('#dCard');
  const go = () => {
    if (act === 'know') Drill.know(); else Drill.later();
    rDrill();
  };
  buzz(act === 'know' ? 12 : 18);
  /* Направление здесь несёт весь смысл: рука на стрелках, глаза
     на слове. Звучит сразу, а не после ухода карточки, — отклик
     на нажатие, а не на анимацию. */
  Sound.grade(act === 'know');
  if (REDUCED || !el) { go(); return; }
  el.classList.add(act === 'know' ? 'out-ok' : 'out-ag');
  setTimeout(go, 240);
}

function rAnki() {
  if (Drill.on) { rDrill(); return; }
  const cw = currentWeek();
  const raws = Vocab.list(ANKI_DECK, 'raw');
  const readyN = Vocab.count(ANKI_DECK, 'ready');
  const expN   = Vocab.count(ANKI_DECK, 'exported');

  let h = `<div class="section-h"><h2>CAPTURE</h2><span class="rule"></span>
    <span class="pill${Vocab.rawCount() ? ' warn' : ''}">RAW ${Vocab.rawCount()}</span></div>`;

  h += `<div class="card">
    <div class="row wrap" style="gap:8px;margin-bottom:12px">
      ${DECKS.map(d => `<button class="btn sm${d === ANKI_DECK ? ' primary' : ''}" data-deck="${d}">${DECK_LABEL[d]}</button>`).join('')}
      <span class="spacer"></span>
      <span class="tiny dim mono">W${cw}</span>
    </div>
    <label class="fld" style="margin:0"><span>WORD</span>
      <input type="text" id="vIn" autocomplete="off" autocapitalize="off" spellcheck="false"
             maxlength="120" placeholder="слово → Enter"></label>
    <div class="row wrap mt" style="gap:8px">
      <button class="btn sm primary" id="vAdd">ADD</button>
      <span class="tiny dim mono">${DECK_LABEL[ANKI_DECK]} · raw ${raws.length} · ready ${readyN} · exported ${expN}</span>
    </div>
  </div>`;

  /* ── тренажёр: панель запуска ── */
  const pool = Drill.pool(ANKI_DECK).length;
  h += `<div class="section-h"><h2>DRILL</h2><span class="rule"></span>
    <span class="pill${pool ? ' ok' : ''}">${pool}</span></div>`;

  if (!pool) {
    h += `<div class="empty"><div class="ic">${ICONS.radar}</div>
      Повторять пока нечего: карточка попадает в проход, когда у неё есть значение.</div>`;
  } else {
    h += `<div class="term">
      ${dHead('ready ' + pool)}
      <div class="term-body">
        <div class="tline mono dim">$ drill --deck=${esc(ANKI_DECK)} --count=${ANKI_LIMIT || pool}</div>
        <div class="tline mono">&gt; в колоде ${DECK_LABEL[ANKI_DECK]} готово карточек: ${pool}</div>
        <div class="row wrap mt" style="gap:8px">
          ${[10, 25, 0].map(n =>
            `<button class="btn sm${n === ANKI_LIMIT ? ' primary' : ''}" data-dlimit="${n}">${n || 'ВСЯ КОЛОДА'}</button>`).join('')}
        </div>
        <div class="row wrap mt" style="gap:8px">
          <button class="btn primary" id="dStart">START ${Math.min(ANKI_LIMIT || pool, pool)}</button>
        </div>
      </div>
    </div>`;
  }

  /* ── оформление ── */
  h += `<div class="section-h"><h2>SHAPE</h2><span class="rule"></span>
    <span class="pill${raws.length ? ' accent' : ''}">${raws.length}</span></div>`;

  if (!raws.length) {
    h += `<div class="empty"><div class="ic">${ICONS.file}</div>В колоде ${DECK_LABEL[ANKI_DECK]} сырых слов нет.</div>`;
  } else {
    raws.forEach(r => {
      const w = r.week ? WEEKS[r.week - 1] : null;
      const opts = [];
      if (w) {
        opts.push({ v: ankiSource(w.w), t: 'W' + w.w + ' · ' + w.topic });
        w.tasks.forEach(tk => opts.push({ v: 'W' + w.w + ' · ' + tk, t: tk }));
      }
      h += `<div class="card" data-vrow="${esc(r.lid)}">
        <div class="card-t">
          <h3 class="mono">${esc(r.word)}</h3>
          <span class="row" style="gap:6px">
            <span class="pill">${DECK_LABEL[r.deck] || esc(r.deck)}</span>
            ${r.week ? `<span class="pill q${w ? w.q : 1}">W${r.week}</span>` : ''}
          </span>
        </div>
        <label class="fld"><span>MEANING</span>
          <input type="text" maxlength="500" value="${esc(r.meaning)}" data-vf="meaning" data-vlid="${esc(r.lid)}"
                 placeholder="${r.deck === 'en' ? 'значение, лучше на английском' : 'значение'}"></label>
        <label class="fld"><span>EXAMPLE</span>
          <input type="text" maxlength="1000" value="${esc(r.example)}" data-vf="example" data-vlid="${esc(r.lid)}"
                 placeholder="предложение, в котором встретилось"></label>
        ${opts.length ? `<label class="fld"><span>SOURCE</span>
          <select data-vf="source" data-vlid="${esc(r.lid)}">
            ${opts.map(o => `<option value="${esc(o.v)}"${o.v === r.source ? ' selected' : ''}>${esc(o.t.length > 64 ? o.t.slice(0, 63) + '…' : o.t)}</option>`).join('')}
          </select></label>` : ''}
        <div class="row wrap mt" style="gap:8px">
          <button class="btn sm primary" data-vready="${esc(r.lid)}">READY</button>
          <button class="btn sm danger" data-vdel="${esc(r.lid)}">DEL</button>
        </div>
      </div>`;
    });
  }

  /* ── экспорт ── */
  h += `<div class="section-h"><h2>EXPORT</h2><span class="rule"></span>
    <span class="pill${readyN ? ' ok' : ''}">READY ${readyN}</span></div>`;

  h += `<div class="card">
    <div class="grid g3">
      ${stat(Vocab.count(null, 'raw'), 'raw, всего')}
      ${stat(Vocab.count(null, 'ready'), 'ready, всего')}
      ${stat(Vocab.count(null, 'exported'), 'exported, всего')}
    </div>
    <div class="row wrap mt2" style="gap:8px">
      ${[2, 4].map(f => `<button class="btn sm${f === ANKI_FIELDS ? ' primary' : ''}" data-vfields="${f}">${f === 2 ? 'BASIC · 2' : 'CUSTOM · 4'}</button>`).join('')}
    </div>
    <div class="row wrap mt" style="gap:8px">
      <button class="btn sm${ANKI_REEXPORT ? ' primary' : ' ghost'}" id="vReexp">+ EXPORTED</button>
    </div>
    <div class="row wrap mt2" style="gap:8px">
      ${DECKS.map(d => {
        const n = Vocab.count(d, 'ready') + (ANKI_REEXPORT ? Vocab.count(d, 'exported') : 0);
        return `<button class="btn${n ? ' primary' : ''}" data-vexp="${d}"${n ? '' : ' disabled'}>EXPORT ${DECK_LABEL[d]} · ${n}</button>`;
      }).join('')}
    </div>
  </div>`;

  /* ── список всех карточек ──
     Единственное место, где карточку можно удалить в любом состоянии,
     включая уже выгруженную. Правка значения тоже здесь: опечатку
     находят обычно после экспорта, а не до. */
  const all = Vocab.rows.filter(r => r.deck === ANKI_DECK);
  const q = BROWSE_Q.trim().toLowerCase();
  const found = all.filter(r =>
    (BROWSE_FILTER === 'all' || r.status === BROWSE_FILTER) &&
    (!q || r.word.toLowerCase().indexOf(q) !== -1 || r.meaning.toLowerCase().indexOf(q) !== -1));
  const shown = found.slice(0, BROWSE_CAP);

  h += `<div class="section-h"><h2>BROWSE</h2><span class="rule"></span>
    <span class="pill">${found.length}</span></div>`;

  h += `<div class="card">
    <label class="fld" style="margin:0 0 10px"><span>FIND</span>
      <input type="text" id="bQ" value="${esc(BROWSE_Q)}" autocomplete="off" spellcheck="false"
             placeholder="слово или значение"></label>
    <div class="row wrap" style="gap:8px">
      ${[['all','ALL'],['raw','RAW'],['ready','READY'],['exported','EXPORTED']].map(f =>
        `<button class="btn sm${f[0] === BROWSE_FILTER ? ' primary' : ''}" data-bf="${f[0]}">${f[1]} ${
          f[0] === 'all' ? all.length : all.filter(r => r.status === f[0]).length}</button>`).join('')}
    </div>`;

  if (!shown.length) {
    h += `<div class="empty" style="padding:26px 12px"><div class="ic">${ICONS.file}</div>Ничего не нашлось.</div>`;
  } else {
    h += `<div class="brows mt">${shown.map(r => `
      <div class="brow" data-brow="${esc(r.lid)}">
        <div class="bhead">
          <b class="mono">${esc(r.word)}</b>
          <span class="row" style="gap:6px">
            ${r.week ? `<span class="pill">W${r.week}</span>` : ''}
            <span class="pill ${r.status === 'exported' ? 'ok' : r.status === 'ready' ? 'accent' : 'warn'}">${r.status.toUpperCase()}</span>
          </span>
        </div>
        <input type="text" class="bmean" maxlength="500" value="${esc(r.meaning)}"
               data-vf="meaning" data-vlid="${esc(r.lid)}" placeholder="значение">
        <div class="row wrap bact" style="gap:6px">
          ${r.status === 'ready' || r.status === 'exported'
            ? `<button class="btn sm ghost" data-bunready="${esc(r.lid)}">TO RAW</button>` : ''}
          <button class="btn sm danger" data-vdel="${esc(r.lid)}">DEL</button>
        </div>
      </div>`).join('')}</div>`;
    if (found.length > shown.length) {
      h += `<div class="tiny dim mono mt">показано ${shown.length} из ${found.length}</div>`;
    }
  }
  h += `</div>`;

  $('#v-anki').innerHTML = h;

  /* ── события ── */
  const inp = $('#vIn');
  const add = () => {
    const val = inp.value;
    if (!val.trim()) return;
    const res = Vocab.capture(ANKI_DECK, val, { source: ankiSource(cw), week: cw });
    if (res.dup) { toast('Уже есть: ' + res.dup.word); inp.select(); return; }
    if (res.tooLong) { toast('Слишком длинно'); return; }
    if (!res.ok) return;
    inp.value = '';
    buzz(10);
    /* Точечная перерисовка, а не renderAll: захват идёт подряд, по слову
       в секунду, а renderAll перебирает все семь вкладок и 52 карточки
       недель. Счётчик живёт в меню и на TODAY — их и обновляем. */
    rAnki();
    buildNav();
    rToday();
    /* Фокус возвращаем в поле: пять слов вводятся подряд, без мыши. */
    if (!isCoarse()) { const n = $('#vIn'); if (n) n.focus(); }
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  $('#vAdd').onclick = add;
  if (!isCoarse() && VIEW === 'anki') inp.focus();

  $$('[data-deck]').forEach(b => b.onclick = () => { ANKI_DECK = b.dataset.deck; rAnki(); });
  $$('[data-vfields]').forEach(b => b.onclick = () => { ANKI_FIELDS = +b.dataset.vfields; rAnki(); });
  $('#vReexp').onclick = () => { ANKI_REEXPORT = !ANKI_REEXPORT; rAnki(); };

  $$('[data-dlimit]').forEach(b => b.onclick = () => { ANKI_LIMIT = +b.dataset.dlimit; rAnki(); });
  const st = $('#dStart');
  if (st) st.onclick = () => {
    if (!Drill.start(ANKI_DECK, ANKI_LIMIT)) { toast('Повторять нечего'); return; }
    buzz(14);
    window.scrollTo({ top: 0, behavior: 'instant' });
    rDrill();
  };

  $$('[data-vf]').forEach(el => el.onchange = () => {
    const patch = {};
    patch[el.dataset.vf] = el.value;
    Vocab.patch(el.dataset.vlid, patch);
  });

  $$('[data-vready]').forEach(b => b.onclick = () => {
    const res = Vocab.ready(b.dataset.vready);
    if (res && res.need === 'meaning') { toast('Без значения карточка пустая'); return; }
    buzz(12); rAnki(); renderAll();
  });
  $$('[data-bunready]').forEach(b => b.onclick = () => {
    Vocab.unready(b.dataset.bunready);
    /* Карточка вернулась в сырые — из текущего прохода её убираем,
       отвечать по ней уже нечем. */
    Drill.drop(b.dataset.bunready);
    toast('Вернул в raw'); rAnki(); renderAll();
  });
  $$('[data-vdel]').forEach(b => b.onclick = () => {
    const row = Vocab.rows.find(x => x.lid === b.dataset.vdel);
    if (!row || !confirm('Удалить «' + row.word + '»?\n\nОтменить будет нельзя.')) return;
    Drill.drop(b.dataset.vdel);
    Sound.drop();
    Vocab.remove(b.dataset.vdel).then(() => { rAnki(); renderAll(); });
  });

  /* Поиск фильтрует на ходу, но перерисовывать раздел на каждую букву
     нельзя: поле потеряет фокус. Перерисовываем только список. */
  const bq = $('#bQ');
  if (bq) {
    bq.oninput = () => {
      BROWSE_Q = bq.value;
      clearTimeout(bq._t);
      bq._t = setTimeout(() => {
        const pos = bq.selectionStart;
        rAnki();
        const n = $('#bQ');
        if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* не критично */ } }
      }, 260);
    };
  }
  $$('[data-bf]').forEach(b => b.onclick = () => { BROWSE_FILTER = b.dataset.bf; rAnki(); });

  $$('[data-vexp]').forEach(b => b.onclick = () => {
    Sound.data();
    const n = Vocab.export(b.dataset.vexp, ANKI_FIELDS, ANKI_REEXPORT);
    if (!n) { toast('Выгружать нечего'); return; }
    toast('Выгружено карточек: ' + n);
    rAnki(); renderAll();
  });
}

function greeting() {
  const hh = new Date().getHours();
  if (hh < 5)  return 'Поздно уже';
  if (hh < 12) return 'Доброе утро';
  if (hh < 18) return 'Добрый день';
  return 'Добрый вечер';
}
function dayOfYear() {
  const d = new Date(), s = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - s) / 86400000);
}
function fmtMin(m) { return m >= 60 ? Math.floor(m / 60) + 'ч ' + (m % 60 ? (m % 60) + 'м' : '') : m + 'м'; }
function plural(n, a, b, c) {
  const m = n % 100, k = n % 10;
  if (m > 10 && m < 20) return c;
  if (k === 1) return a;
  if (k >= 2 && k <= 4) return b;
  return c;
}

/* ══════════════════ ТАЙМЕР ══════════════════
   Отсчёт идёт от метки окончания по стенным часам, а не убавлением
   счётчика: браузер душит setInterval в фоне до одного раза в минуту,
   и старый таймер врал, стоило заблокировать телефон. Интервал теперь
   нужен только чтобы перерисовать цифры — сам отсчёт от него не зависит.

   Состояние лежит в отдельном ключе localStorage, а не в синхронизируемом
   payload: запущенный таймер — дело конкретного устройства, тащить его
   на второй телефон бессмысленно. */
const TKEY = 'soc365.timer';
const TC = +(2 * Math.PI * 94).toFixed(1);   // длина кольца прогресса, r=94
let TIMER = null;
let T = { block: null, name: '', total: 0, endsAt: null, left: null, done: false };

function tSave() { try { localStorage.setItem(TKEY, JSON.stringify(T)); } catch (e) {} }
function tLoad() {
  try { const raw = localStorage.getItem(TKEY); if (raw) T = Object.assign(T, JSON.parse(raw)); }
  catch (e) {}
}
function tLeft() {
  if (T.left != null) return T.left;                       // пауза
  if (!T.endsAt) return T.total;
  return Math.max(0, Math.round((T.endsAt - Date.now()) / 1000));
}
function tRunning() { return !!T.endsAt && T.left == null; }

/* Последняя озвученная секунда обратного отсчёта. tPaint() крутится
   дважды в секунду и вдобавок зовётся при каждой отрисовке TODAY —
   без этой отсечки один и тот же тик прозвучал бы несколько раз.
   Сбрасывается везде, где отсчёт начинается заново. */
let T_BEEP = null;

function timerStart(block, min, name) {
  T = { block, name, total: min * 60, endsAt: Date.now() + min * 60000, left: null, done: false };
  T_BEEP = null;
  tSave(); tLoop(); tPaint(); buzz(10);
  Sound.timer('start');
}
function timerPause() {
  if (!tRunning()) return;
  T.left = tLeft(); T.endsAt = null;
  tSave(); tLoop(); tPaint();
  Sound.timer('pause');
}
function timerResume() {
  if (T.left == null) return;
  T.endsAt = Date.now() + T.left * 1000; T.left = null;
  tSave(); tLoop(); tPaint();
  Sound.timer('resume');
}
/** Добор минут на ходу.
 *
 *  Отсчёт живёт по стенной метке `endsAt` (§3.7), поэтому «добавить пять
 *  минут» — это сдвинуть метку, а не тронуть счётчик. Вместе с меткой
 *  растёт и `total`, иначе кольцо прогресса прыгнуло бы назад.
 *
 *  Кнопки работают в любом состоянии: на паузе двигают остаток, после
 *  финиша запускают блок заново, а если блок не выбран вовсе — поднимают
 *  свободный отсчёт. Галочку такой таймер не ставит: она положена только
 *  за честно досиженный блок. */
function timerAdd(min) {
  const sec = min * 60;
  const idle = !T.block && !T.endsAt && T.left == null && !T.done;

  if (idle) {
    if (sec <= 0) return;                       // из нуля минусом не уйдёшь
    T = { block: null, name: 'FREE RUN', total: sec,
          endsAt: Date.now() + sec * 1000, left: null, done: false };
  } else if (T.done) {
    if (sec <= 0) return;                       // блок уже закрыт, откатывать нечего
    T.done = false; T.left = null; T.total = sec;
    T.endsAt = Date.now() + sec * 1000;
  } else if (tRunning()) {
    const left = Math.max(5, tLeft() + sec);
    T.total = Math.max(T.total + sec, left);
    T.endsAt = Date.now() + left * 1000;
  } else {                                      // пауза
    const left = Math.max(5, T.left + sec);
    T.total = Math.max(T.total + sec, left);
    T.left = left;
  }

  T_BEEP = null;                                // отсчёт сдвинулся — тики заново
  tSave(); tLoop(); tPaint(); buzz(8);
  Sound.timer('add');
  const box = $('#tBox');
  if (box) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
  if (idle && VIEW === 'today') rToday();       // подсветить PAUSE/RESET
}

function timerReset() {
  T = { block: null, name: '', total: 0, endsAt: null, left: null, done: false };
  T_BEEP = null;
  tSave(); tLoop(); tPaint();
  Sound.timer('reset');
  document.title = 'SOC Roadmap 365';
  if (VIEW === 'today') rToday();
}

/** Блок досижен до конца — галочка в чеклисте встаёт сама. */
function timerFinish(silent) {
  const block = T.block, name = T.name;
  T.endsAt = null; T.left = 0; T.done = true;
  tSave(); tLoop();
  document.title = 'SOC Roadmap 365';

  if (block) {
    const today = iso(new Date());
    if (!Store.day(today)[block]) {
      Store.toggleBlock(today, block);
      Sync.schedule();
      toast(name + ' — блок закрыт, галочка стоит');
    } else {
      toast(name + ' — время вышло');
    }
  }
  /* Главный случай всей §12.5: человек смотрит в терминал, а не
     на вкладку. Под `silent` идёт только восстановление после
     перезагрузки — там блок доиграл, пока страницы не было, и
     звук на загрузке никто не заказывал. Заодно это снимает
     вопрос с жестом: на восстановлении его и не было. */
  if (!silent) {
    try { navigator.vibrate && navigator.vibrate([200, 90, 200]); } catch (e) {}
    Sound.done();
    /* Разряд по циферблату. Звук и картинка пускаются из одного
       места, иначе разъедутся во времени (§12.6). */
    Fx.glitch($('#tBox') || $('#v-today .timer'), false);
  }
  T_BEEP = null;
  renderAll();
}

function tLoop() {
  if (TIMER) { clearInterval(TIMER); TIMER = null; }
  if (tRunning()) TIMER = setInterval(tPaint, 500);
}

const HEX = () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');

function tPaint() {
  const disp = $('#tDisp');
  if (!disp) { if (TIMER) { clearInterval(TIMER); TIMER = null; } return; }

  const left = tLeft();
  const run = tRunning();
  if (run && left <= 0) { timerFinish(); return; }

  const hh = Math.floor(left / 3600);
  disp.textContent = (hh ? String(hh) + ':' + String(Math.floor(left / 60) % 60).padStart(2, '0')
                         : String(Math.floor(left / 60)).padStart(2, '0'))
                     + ':' + String(left % 60).padStart(2, '0');

  const lbl = $('#tLbl');
  if (lbl) lbl.textContent = T.done ? 'БЛОК ЗАКРЫТ'
    : !T.block && !T.total ? 'выбери блок'
    : run ? (T.name || 'FREE RUN') : (T.name || 'FREE RUN') + ' · пауза';

  const box = $('#tBox') || $('#v-today .timer');
  if (box) {
    box.classList.toggle('run', run);
    box.classList.toggle('done', !!T.done);
    box.classList.toggle('warn', run && left <= 10);        // последние секунды — янтарь
  }

  /* Тик последних десяти секунд (§12.5), в пару к янтарю выше.
     Высота растёт по мере убывания остатка — считает её Sound.
     Здесь только отсечка повтора: tPaint зовётся дважды в секунду
     и ещё раз при каждой отрисовке TODAY, а тик положен один
     на секунду. Условие на `run` обязательно: на паузе и после
     финиша отсчёта нет, а `left` остаётся маленьким. */
  if (run && left > 0 && left <= 10) {
    if (T_BEEP !== left) { T_BEEP = left; Sound.tick(left); }
  } else if (!run) {
    T_BEEP = null;
  }

  // кольцо прогресса и точка на его конце
  const p = T.total ? Math.min(1, Math.max(0, 1 - left / T.total)) : 0;
  const arc = $('#tArc');
  if (arc) arc.setAttribute('stroke-dashoffset', (TC * (1 - p)).toFixed(1));
  const head = $('#tHead');
  if (head) head.setAttribute('transform', 'rotate(' + (p * 360).toFixed(2) + ' 110 110)');

  // строка телеметрии: пока идёт отсчёт — живой поток, иначе статус
  const hex = $('#tHex');
  if (hex) hex.textContent =
      T.done ? 'exit code 0 · block closed'
    : run    ? '0x' + HEX() + ' · 0x' + HEX() + ' · ' + Math.round(p * 100) + '%'
    : T.total ? '-- halted · ' + Math.round(p * 100) + '% --'
    : 'awaiting task';

  const pb = $('#tPause');
  if (pb) { pb.textContent = run ? 'PAUSE' : 'RESUME'; pb.disabled = (!T.block && !T.total) || T.done; }
  const rb = $('#tReset');
  if (rb) rb.disabled = !T.block && !T.total;

  /* Ячейка TMR в панели Zero. Своего интервала виджет не заводит —
     подхватывает тот, что и так крутится, пока идёт отсчёт (§12.3). */
  Zero.tick();

  // на десктопе остаток видно прямо во вкладке
  if (run) document.title = disp.textContent + ' · ' + (T.name || 'FREE RUN');
}

/** Таймер мог доработать, пока вкладка была закрыта или телефон заблокирован. */
function tRestore() {
  tLoad();
  if (T.endsAt && T.left == null && Date.now() >= T.endsAt) timerFinish(true);
  else tLoop();
}

/* ─────────── ГОД ─────────── */
/* ═══════════ КАЛЕНДАРЬ ПРОГРЕССА (§12.4) ═══════════

   Два уровня. YEAR — 13 месяцев трека мелкой матрицей, читается одним
   взглядом. MONTH — один месяц крупно, с числами, номерами недель
   и разбором дня. Переход между ними — приближение, как в календаре
   телефона.

   Про `transform` в приближении. §3.5 запрещает его у ПРЕДКОВ элемента
   с `position: fixed`. Таббар лежит в `#app` рядом с `.layout`, а сцена
   календаря — внутри `main` → `.layout`. То есть сцена предком таббара
   НЕ является, и масштабировать её безопасно. Дополнительно она обёрнута
   в `overflow: hidden`: без этого горизонтальный `transform` расширил бы
   документ, Safari ужал бы страницу, и `fixed` уехал бы вместе
   с layout-viewport (§9). Проверяется пробным `fixed`-элементом.

   Никакого `blur()` и `backdrop-filter`: на iOS это рывки при инерционной
   прокрутке (§9). «Голограмма» набирается свечением, градиентами
   и сканлайнами — тем же языком, на котором уже говорит фон (§3.10).

   Данные берутся из `Store.d.days` как есть. Календарь ничего не пишет
   и не пересчитывает: он представление, а не источник истины. */

let CAL_MODE = 'year';   // 'year' | 'month'
let CAL_I = 0;           // индекс месяца в calMonths()

const MON_S = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MON_L = ['ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ','ИЮЛЬ',
               'АВГУСТ','СЕНТЯБРЬ','ОКТЯБРЬ','НОЯБРЬ','ДЕКАБРЬ'];
const DOW_S = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];

/** Дата + n дней, обе в ISO. Считаем в UTC: в локальной зоне переход
 *  на летнее время сдвинул бы клетку на сутки. */
function isoPlus(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isoOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
/** Понедельник = 0. В трекере неделя начинается с понедельника, а getUTCDay
 *  считает от воскресенья — без сдвига сетка месяца съезжает на день. */
const dowMon = day => (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;

/** Месяцы, которые пересекает трек. Их 13: с августа 2026 по август 2027. */
function calMonths() {
  const out = [];
  const s = new Date(META.start + 'T00:00:00Z'), e = new Date(META.end + 'T00:00:00Z');
  const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  while (d <= e) {
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Состояние дня. Один источник правды для обоих уровней: если развести
 *  их по разным функциям, мелкая сетка однажды покрасит день не так,
 *  как крупная, и заметить это будет нечем. */
function calState(day, today) {
  if (day < META.start || day > META.end) return 'out';
  if (Store.dayAny(day))            return Store.dayComplete(day) ? 'full' : 'part';
  if (own(Store.d.freezes || {}, day, null)) return 'frz';
  if (day > today)                  return 'future';
  const dow = dowMon(day);
  return dow > 4 ? 'off' : 'miss';
}

/** Номер недели трека, которой принадлежит день. null — день вне трека. */
function weekOfDay(day) {
  if (day < META.start || day > META.end) return null;
  const w = WEEKS.find(w => day >= w.start && day <= w.end);
  return w ? w.w : null;
}

function monthDays(y, m) {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= last; d++) out.push(isoOf(y, m, d));
  return out;
}

/** Сводка месяца: сколько рабочих дней закрыто из тех, что уже прошли. */
function monthStat(y, m, today) {
  const days = monthDays(y, m);
  let done = 0, due = 0;
  days.forEach(day => {
    const st = calState(day, today);
    if (st === 'full' || st === 'part') { done++; due++; }
    else if (st === 'miss') due++;
  });
  return { done, due, pct: due ? Math.round(done / due * 100) : 0, days: days.length };
}

/* ─────────── уровень YEAR: 13 месяцев мелко ─────────── */
function calYearHtml(today) {
  const months = calMonths();
  return `<div class="cal-year">${months.map((mo, i) => { // eslint-disable-line
    const days = monthDays(mo.y, mo.m);
    const pad = dowMon(days[0]);
    const st = monthStat(mo.y, mo.m, today);
    const cur = days.some(d => d === today);
    const cells = Array(pad).fill('<i class="mini pad"></i>')
      .concat(days.map(d => `<i class="mini s-${calState(d, today)}"></i>`)).join('');
    return `<button class="cal-mo${cur ? ' now' : ''}" data-mo="${i}" type="button" style="--i:${i}">
      <span class="cal-mo-h">
        <b>${MON_S[mo.m]}</b><small class="mono">'${String(mo.y).slice(2)}</small>
        ${st.due ? `<span class="cal-mo-p mono">${st.pct}%</span>` : ''}
      </span>
      <span class="cal-mini">${cells}</span>
      <span class="cal-mo-bar"><i style="width:${st.pct}%"></i></span>
      <span class="cal-mo-scan" aria-hidden="true"></span>
    </button>`;
  }).join('')}</div>`;
}

/* ─────────── уровень MONTH: один месяц крупно ─────────── */
function calMonthHtml(i, today) {
  const months = calMonths();
  const mo = months[Math.max(0, Math.min(i, months.length - 1))];
  const days = monthDays(mo.y, mo.m);
  const pad = dowMon(days[0]);
  const st = monthStat(mo.y, mo.m, today);

  /* Раскладываем по строкам-неделям, чтобы слева поставить номер недели
     трека: это и есть связь календаря с моделью трекера. */
  const slots = Array(pad).fill(null).concat(days);
  while (slots.length % 7) slots.push(null);
  let rows = '';
  /* Порядковый номер клетки уезжает в --i и задаёт задержку каскада
     прямо в CSS. Считать задержки в JS через setTimeout нельзя: §3.10
     и §12.3 требуют движение кадрами, а не таймерами. */
  let k = 0;
  for (let r = 0; r < slots.length / 7; r++) {
    const row = slots.slice(r * 7, r * 7 + 7);
    const wn = row.map(weekOfDay).find(x => x != null) || null;
    /* Сессия и экзамен помечаются на номере недели, а не заливкой клеток:
       заливка спорила бы с цветом дней, а он здесь несёт данные (§12.4). */
    const sess = wn && META.sessionWeeks.includes(wn);
    const exam = wn ? own(META.examWeeks, String(wn), null) : null;
    rows += `<div class="cal-row" style="--r:${r}">
      <span class="cal-wn mono">${wn
        ? `<button type="button" class="${sess ? 'sess' : ''}${exam ? ' exam' : ''}" style="--r:${r}"
             data-wk-open="${wn}" title="${exam ? esc(exam) : sess ? 'SESSION MODE' : 'W' + wn}">W${wn}</button>`
        : ''}</span>
      ${row.map((day, c) => {
        /* --r и --c дают волну по диагонали, --i — линейный каскад.
           Разные переходы берут разную формулу: приближение идёт
           диагональю от угла, листание — колонками по ходу движения. */
        const v = `--i:${k++};--c:${c}`;
        if (!day) return `<i class="cal-c pad" style="${v}"></i>`;
        const s = calState(day, today);
        const mins = Store.dayMinutes(day);
        return `<button type="button" class="cal-c s-${s}${day === today ? ' now' : ''}"
          style="${v}" data-d="${day}" data-w="${wn || ''}">
          <span class="cal-c-in"><b>${+day.slice(8)}</b>${mins ? `<u class="mono">${mins}</u>` : ''}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  const prev = i > 0, next = i < months.length - 1;
  return `<div class="cal-month" data-i="${i}">
    <div class="cal-nav">
      <button class="cal-arrow" type="button" data-mstep="-1" ${prev ? '' : 'disabled'} aria-label="Раньше">${ICONS.chev}</button>
      <div class="cal-title">
        <b>${MON_L[mo.m]}</b><span class="mono dim">${mo.y}</span>
      </div>
      <button class="cal-arrow" type="button" data-mstep="1" ${next ? '' : 'disabled'} aria-label="Позже">${ICONS.chev}</button>
      <span class="spacer"></span>
      <span class="pill mono">${st.done}/${st.due}</span>
      <button class="btn sm" type="button" data-cal-back>YEAR</button>
    </div>
    <div class="cal-dow-big">${DOW_S.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal-rows">${rows}</div>
  </div>`;
}

function calendarHtml() {
  const today = iso(new Date());
  const legend = [['full','день закрыт'],['part','частично'],['miss','пропуск'],
                  ['frz','заморозка'],['off','выходной'],['future','впереди']]
    .map(([k, t]) => `<span class="cal-lg"><i class="cal-d s-${k}"></i>${t}</span>`).join('');

  return `<div class="section-h"><h2>CALENDAR</h2><span class="rule"></span>
      <span class="tiny dim mono">${CAL_MODE === 'year' ? 'нажми месяц' : 'нажми день'}</span></div>
    <div class="card hud scanfx cal-card">
      <span class="beam"></span>
      <div class="cal-stage" id="calStage">
        ${CAL_MODE === 'year' ? calYearHtml(today) : calMonthHtml(CAL_I, today)}
      </div>
      <div class="cal-legend">${legend}</div>
      <div class="cal-tip mono" id="calTip">&nbsp;</div>
    </div>`;
}

/** Перерисовываем ТОЛЬКО сцену, а не весь YEAR: rYear() заново запускает
 *  кольцо, счёт чисел и волну появления, и переключение месяца выглядело
 *  бы как перезагрузка вкладки. */
function calRepaint(anim) {
  const stage = $('#calStage');
  if (!stage) return;
  const today = iso(new Date());
  stage.innerHTML = CAL_MODE === 'year' ? calYearHtml(today) : calMonthHtml(CAL_I, today);
  if (!anim || REDUCED) return;

  const el = stage.firstElementChild;
  if (el) {
    el.classList.add(anim);
    el.addEventListener('animationend', e => {
      if (e.target === el) el.classList.remove(anim);
    }, { once: true });
  }

  /* Развёртка: луч проходит по сцене и «проявляет» содержимое, поверх —
     короткая сетка наводки. Оба слоя декоративные, живут ровно столько,
     сколько идёт кадр, и снимаются сами. Держать их постоянно нельзя:
     это два лишних композиторских слоя на каждой перерисовке (§3.10). */
  const fx = document.createElement('span');
  fx.className = 'cal-fx' + (anim === 'cal-in' ? ' boot' : '');
  fx.setAttribute('aria-hidden', 'true');
  fx.innerHTML = '<i class="cal-fx-sweep"></i><i class="cal-fx-grid"></i>';
  stage.appendChild(fx);
  fx.addEventListener('animationend', () => fx.remove(), { once: true });
  /* Страховка: если кадр не проиграется (вкладка ушла в фон и анимации
     не стартовали), слой всё равно уберётся. Иначе он останется висеть. */
  setTimeout(() => fx.remove(), 1200);
}

/** Один слушатель на сцену. 364 клетки — это 364 замыкания, если вешать
 *  на каждую; день и месяц достаются из data-атрибутов. */
function wireCalendar() {
  const stage = $('#calStage'), tip = $('#calTip');
  if (!stage || !tip) return;
  const idle = '&nbsp;';

  stage.onclick = e => {
    const back = e.target.closest('[data-cal-back]');
    if (back) { CAL_MODE = 'year'; calRepaint('cal-out'); tip.innerHTML = idle; return; }

    const step = e.target.closest('[data-mstep]');
    if (step) {
      const n = calMonths().length;
      CAL_I = Math.max(0, Math.min(n - 1, CAL_I + (+step.dataset.mstep)));
      calRepaint(+step.dataset.mstep > 0 ? 'cal-l' : 'cal-r');
      return;
    }

    const wk = e.target.closest('[data-wk-open]');
    if (wk) { openWeek(+wk.dataset.wkOpen); return; }

    const mo = e.target.closest('[data-mo]');
    if (mo) { CAL_I = +mo.dataset.mo; CAL_MODE = 'month'; Sound.open(true); calRepaint('cal-in'); return; }

    const day = e.target.closest('.cal-c[data-d]');
    if (day && day.dataset.w) openWeek(+day.dataset.w);
  };

  /* Наведение меняет только строку подсказки — сетка не перерисовывается. */
  stage.onpointerover = e => {
    const c = e.target.closest('.cal-c[data-d], .cal-mo');
    if (!c) return;
    if (c.dataset.d) {
      const d = c.dataset.d;
      const blocks = DAILY.filter(b => own(Store.day(d), b.id, false)).map(b => b.name);
      /* Клетка звучит тем выше, чем больше минут закрыто в тот день.
         Проведя рукой по месяцу, месяц можно услышать — ровно то,
         чего сэмплами не сделать (§12.5). Ограничитель частоты
         внутри Sound: указатель проходит клетку за 20–30 мс. */
      Sound.hover(Math.min(1, Store.dayMinutes(d) / 180));
      const frz = own(Store.d.freezes || {}, d, null);
      tip.innerHTML = `${fmtRU(d)} · ${c.dataset.w ? 'W' + c.dataset.w : 'вне трека'} · ${Store.dayMinutes(d)} мин` +
        (blocks.length ? ' · ' + esc(blocks.join(', ')) : frz ? ' · заморожен' : '');
    } else {
      const months = calMonths(), mo = months[+c.dataset.mo];
      const s = monthStat(mo.y, mo.m, iso(new Date()));
      Sound.hover(s.due ? s.done / s.due : 0);
      tip.innerHTML = `${MON_L[mo.m]} ${mo.y} · закрыто ${s.done} из ${s.due}`;
    }
  };
  stage.onpointerleave = () => { tip.innerHTML = idle; };
}

/* Стрелки листают месяц, Escape возвращает к году. Слушатель глобальный,
   но молчит везде, кроме открытой вкладки YEAR в режиме месяца, — иначе
   он отберёт стрелки у полей ввода и у тренажёра (§10.2). */
window.addEventListener('keydown', e => {
  if (VIEW !== 'year' || CAL_MODE !== 'month') return;
  if (!$('#calStage')) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = calMonths().length;
  if (e.key === 'ArrowRight' && CAL_I < n - 1) { CAL_I++; calRepaint('cal-l'); }
  else if (e.key === 'ArrowLeft' && CAL_I > 0) { CAL_I--; calRepaint('cal-r'); }
  else if (e.key === 'Escape') { CAL_MODE = 'year'; calRepaint('cal-out'); }
  else return;
  e.preventDefault();
});

/** Открыть карточку недели на WEEKS. Переход уже существует — новых
 *  экранов календарь не заводит (§12.4). */
function openWeek(n) {
  WEEK_FILTER = 'all';
  go('weeks');
  const card = $(`#v-weeks [data-wk="${n}"]`);
  if (!card) return;
  card.classList.add('open');
  card.scrollIntoView({ block: 'center', behavior: REDUCED ? 'instant' : 'smooth' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1000);
}

function rYear() {
  const t = Store.totals();
  const R = 74, C = 2 * Math.PI * R;
  let h = '';

  h += `<div class="section-h"><h2>YEAR DASHBOARD</h2><span class="rule"></span><span class="tiny dim">${fmtRU(META.start)} → ${fmtRU(META.end)}</span></div>`;

  h += `<div class="card center">
    <div class="ring-wrap">
      <div class="radar"></div>
      <svg class="ring" width="176" height="176" viewBox="0 0 176 176">
        <circle class="track" cx="88" cy="88" r="${R}" stroke-width="10"/>
        <g class="ticks">${Array.from({length:48},(_,i)=>{
          const a=i*7.5*Math.PI/180, r1=R+9, r2=R+(i%4?12:15);
          return `<line x1="${88+Math.cos(a)*r1}" y1="${88+Math.sin(a)*r1}" x2="${88+Math.cos(a)*r2}" y2="${88+Math.sin(a)*r2}"/>`;
        }).join('')}</g>
        <circle class="fill"  cx="88" cy="88" r="${R}" stroke-width="10"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - t.pct / 100)}"/>
      </svg>
      <div class="ring-txt"><b>${t.pct}%</b><span class="dim">выполнено</span></div>
    </div>
    <div class="grid g2 mt2">
      ${stat(t.hoursFact, 'часов факт')}
      ${stat(t.hoursPlan, 'часов план')}
    </div>
    <div class="grid g3 mt">
      ${stat(t.closed, 'закрыто')}
      ${stat(t.partial, 'частично')}
      ${stat(t.moved, 'перенесено')}
    </div>
    <div class="grid g3 mt">
      ${stat(t.avg ?? '—', 'ср. оценка')}
      ${stat(t.tasksDone + '/' + t.tasksAll, 'задач')}
      ${stat(t.streak, 'streak')}
    </div>
  </div>`;

  h += `<div class="section-h"><h2>QUARTERS</h2><span class="rule"></span></div>`;
  [1,2,3,4].forEach(q => {
    const Q = QUARTERS[q], s = Store.quarterTotals(q);
    h += `<div class="card hud wk q${q} reveal">
      <div class="card-t">
        <div><h3>${Q.code} · ${Q.name}</h3><div class="tiny dim">${Q.range} · ${Q.dates}</div></div>
        <span class="pill q${q}">${s.pct}%</span>
      </div>
      <div class="bar q${q}"><i style="width:${s.pct}%"></i></div>
      <div class="row mt tiny dim" style="justify-content:space-between">
        <span>${s.fact} / ${s.plan} ч</span><span>${s.closed} / ${s.total} недель</span>
      </div>
      <p class="sm muted mt" style="margin-bottom:0">${esc(Q.goal)}</p>
    </div>`;
  });

  h += calendarHtml();

  h += `<div class="section-h"><h2>CHECKPOINTS</h2><span class="rule"></span><span class="tiny dim">заполняй факт</span></div>`;
  const LBL = { hours:'Часов накоплено', repos:'Репозиториев', thm:'THM rooms', anki:'Карточек Anki EN',
                efset:'English (EF SET)', rules:'Detection rules', cases:'Инцидентов разобрано', apps:'Откликов' };
  MILESTONES.forEach(m => {
    const cur = currentWeek();
    const state = cur > m.w ? 'прошла' : cur === m.w ? 'сейчас' : 'впереди';
    const mv = Store.metric(m.w);
    h += `<details class="acc"${cur === m.w ? ' open' : ''}>
      <summary><span>W${m.w} · ${esc(m.name)}</span><span class="pill ${state === 'сейчас' ? 'accent' : ''}">${fmtShort(m.date)}</span></summary>
      <div>
        <p class="sm muted">${esc(m.test)}</p>
        <table class="t"><thead><tr><th>Метрика</th><th style="width:74px">Цель</th><th style="width:104px">Факт</th></tr></thead><tbody>
        ${Object.keys(m.targets).map(k => `<tr>
          <td>${LBL[k]}</td><td class="dim">${m.targets[k]}</td>
          <td><input type="text" value="${esc(mv[k] || '')}" data-ms="${m.w}" data-mk="${k}" style="padding:5px 8px;font-size:13px"></td>
        </tr>`).join('')}
        </tbody></table>
      </div></details>`;
  });

  h += `<div class="section-h"><h2>FALLING BEHIND</h2><span class="rule"></span></div><div class="card">
    <table class="t"><tbody>${LAG_PROTOCOL.map(l =>
      `<tr><td style="width:132px"><b>${esc(l.lag)}</b></td><td class="muted">${esc(l.action)}</td></tr>`).join('')}</tbody></table></div>`;

  h += `<div class="section-h"><h2>RED FLAGS</h2><span class="rule"></span></div><div class="card">
    <p class="sm muted">Два и более признака дольше 2 недель — снижай нагрузку до session mode и восстанавливайся.</p>
    ${RED_FLAGS.map(f => `<div class="sm" style="padding:5px 0;border-bottom:1px solid var(--border)">· ${esc(f.t)}</div>`).join('')}
    <p class="tiny dim mt" style="margin-bottom:0">Год — это долго. План на 75% за 52 недели кратно лучше плана на 120% за 14 недель и брошенного.</p></div>`;

  $('#v-year').innerHTML = h;

  // кольцо и цифры оживают после вставки в DOM
  requestAnimationFrame(() => {
    const fill = $('#v-year .ring .fill');
    if (fill) { fill.style.strokeDashoffset = C; requestAnimationFrame(() => fill.style.strokeDashoffset = C * (1 - t.pct / 100)); }
    const rt = $('#v-year .ring-txt b'); if (rt) countUp(rt, t.pct, '%');
    $$('#v-year .stat b').forEach(b => {
      const n = parseFloat(String(b.textContent).replace(',', '.'));
      if (!isNaN(n) && String(b.textContent).trim() === String(n)) countUp(b, n);
    });
    $$('#v-year .bar > i').forEach(bar => { const w = bar.style.width; bar.style.width = '0%';
      requestAnimationFrame(() => bar.style.width = w); });
  });

  wireCalendar();

  $$('[data-ms]').forEach(i => i.onchange = () => {
    Store.setMetric(+i.dataset.ms, i.dataset.mk, i.value); Sync.schedule(); toast('Сохранено');
  });
}

/* ─────────── НЕДЕЛИ ─────────── */
function rWeeks() {
  const cw = currentWeek();
  let h = `<div class="section-h"><h2>52 WEEKS</h2><span class="rule"></span><span class="tiny dim">W${cw} сейчас</span></div>`;

  h += `<div class="filters">
    ${[['all','Все'],['now','Текущая'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],
       ['open','Не закрыты'],['done','Закрыты'],['exam','Экзамены']]
      .map(([k, l]) => `<button class="fbtn${WEEK_FILTER === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}
  </div>`;

  const list = WEEKS.filter(w => {
    const s = Store.week(w.w);
    switch (WEEK_FILTER) {
      case 'now':  return w.w === cw;
      case 'q1': case 'q2': case 'q3': case 'q4': return w.q === +WEEK_FILTER[1];
      case 'open': return s.status !== 'Закрыта';
      case 'done': return s.status === 'Закрыта';
      case 'exam': return !!META.examWeeks[w.w];
      default: return true;
    }
  });

  h += list.length
    ? `<div class="wk-grid">${list.map(w => weekCard(w, w.w === cw)).join('')}</div>`
    : `<div class="empty"><div class="ic">${ICONS.file}</div>Ничего не найдено</div>`;

  $('#v-weeks').innerHTML = h;
  $$('[data-f]').forEach(b => b.onclick = () => { WEEK_FILTER = b.dataset.f; rWeeks(); });
  bindWeekCard($('#v-weeks'));
}

function weekCard(w, isNow) {
  const s = Store.week(w.w);
  const sess = META.sessionWeeks.includes(w.w);
  const exam = META.examWeeks[w.w];
  const done = (s.tasks || []).length, all = w.tasks.length;
  const pct = all ? Math.round(done / all * 100) : 0;
  const stCls = s.status === 'Закрыта' ? 'ok' : s.status === 'Частично' ? 'warn'
              : s.status === 'Перенесена' ? 'danger' : s.status === 'В работе' ? 'accent' : '';

  return `<div class="card hud scanfx gleam wk q${w.q}${isNow ? ' now' : ''}${isNow ? ' open' : ''}${isNow ? '' : ' reveal'}" data-wk="${w.w}">
    <span class="beam"></span><span class="sheen"></span>
    <div class="wk-h" data-toggle>
      <div class="wk-n">W${w.w}</div>
      <div class="wk-body">
        <h3>${esc(w.topic)}</h3>
        <div class="tiny dim">${fmtShort(w.start)} – ${fmtShort(w.end)} · ${w.hours} ч</div>
        <div class="wk-meta">
          <span class="pill ${stCls}">${esc(stLabel(s.status))}</span>
          ${all ? `<span class="pill">${done}/${all} tasks</span>` : ''}
          ${sess ? `<span class="pill danger">SESSION MODE</span>` : ''}
          ${exam ? `<span class="pill warn">${esc(exam)}</span>` : ''}
          ${isNow ? `<span class="pill accent">сейчас</span>` : ''}
        </div>
        ${all ? `<div class="bar mt" style="height:5px"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="wk-x">${ICONS.chev}</div>
    </div>

    <div class="wk-detail">
      <div class="tiny dim" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">TASKS</div>
      ${w.tasks.map((tk, i) => `<div class="task${(s.tasks || []).includes(i) ? ' on' : ''}" data-task="${i}">
        <div class="box">${ICONS.check}</div><span>${esc(tk)}</span></div>`).join('')}

      <div class="deliv"><b>DELIVERABLE — без него неделя не закрыта</b>${esc(w.deliverable)}</div>

      <div class="grid g2 mt">
        <label class="fld"><span>HOURS FACT / PLAN ${w.hours}</span>
          <input type="number" step="0.1" min="0" value="${s.hours ?? ''}" data-f-hours="${w.w}" placeholder="0"></label>
        <label class="fld"><span>STATUS</span>
          <select data-f-status="${w.w}">${['Не начата','В работе','Закрыта','Частично','Перенесена']
            .map(o => `<option value="${o}"${o === s.status ? ' selected' : ''}>${stLabel(o)}</option>`).join('')}</select></label>
      </div>
      <label class="fld"><span>RATING</span>
        <select data-f-rating="${w.w}"><option value="">—</option>${[1,2,3,4,5]
          .map(o => `<option${String(o) === String(s.rating) ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="fld"><span>BLOCKERS / NOTES</span>
        <textarea data-f-notes="${w.w}" placeholder="Где застрял, что переношу...">${esc(s.notes)}</textarea></label>
    </div>
  </div>`;
}

function bindWeekCard(root) {
  $$('[data-toggle]', root).forEach(el => el.onclick = e => {
    if (e.target.closest('input,select,textarea')) return;
    el.closest('.wk').classList.toggle('open');
  });
  $$('[data-task]', root).forEach(el => el.onclick = () => {
    const n = +el.closest('[data-wk]').dataset.wk;
    const added = Store.toggleTask(n, +el.dataset.task);
    el.classList.toggle('on'); if (added) buzz(10);
    /* Значимость — доля закрытых задач недели: последняя задача
       звучит выше первой (§12.5). Достижения `pcap` и `rule`
       выдаются именно отсюда, поэтому здесь же и проверка. */
    if (added) {
      const wk = WEEKS[n - 1], done = Store.week(n).tasks.length;
      Sound.ok(wk && wk.tasks.length ? done / wk.tasks.length : 0.5);
    }
    achCheck();
    Sync.schedule();
    const card = el.closest('[data-wk]');
    const w = WEEKS[n - 1], s = Store.week(n);
    const bar = $('.bar > i', card);
    if (bar) bar.style.width = Math.round(s.tasks.length / w.tasks.length * 100) + '%';
    const pill = $$('.pill', card).find(p => /\d+\/\d+ задач/.test(p.textContent));
    if (pill) pill.textContent = `${s.tasks.length}/${w.tasks.length} задач`;
  });
  $$('[data-f-hours]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-hours'), { hours: i.value === '' ? null : Number(i.value) });
    achCheck();                                   // отсюда приходит «100 часов»
    Sync.schedule(); toast('Сохранено'); renderAll();
  });
  $$('[data-f-status]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-status'), { status: i.value });
    /* Закрытая неделя — событие крупнее галочки и мельче достижения,
       у него своя ступень в палитре (§12.5). Прочие статусы молчат:
       «в работе» и «перенесена» — это пометки, а не вехи.
       Порядок важен: если неделя закрыла квартал, достижение
       прозвучит следом и перекроет — потому и проверяется вторым. */
    if (i.value === 'Закрыта') { Sound.week(); Fx.glitch(i.closest('.wk') || i.closest('.card'), false); }
    achCheck();
    Sync.schedule(); toast('Сохранено'); renderAll();
  });
  $$('[data-f-rating]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-rating'), { rating: i.value || null });
    Sync.schedule(); toast('Сохранено');
  });
  $$('[data-f-notes]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-notes'), { notes: i.value });
    Sync.schedule(); toast('Сохранено');
  });
}

/* ─────────── КАРЬЕРА ─────────── */
/* Карточка streak. Показываем не только число, но и почему оно не
   обнулилось — иначе механика долга и заморозок остаётся невидимой. */
function streakCard() {
  const si = Store.streakInfo();
  const brk = Store.breakingDay();
  const q = currentWeek() ? WEEKS[currentWeek() - 1].q : 1;
  const left = Store.freezesLeft(q);
  let h = '';

  const bits = [];
  if (si.covered) bits.push(`${si.covered} ${plural(si.covered, 'пропуск закрыт', 'пропуска закрыто', 'пропусков закрыто')} работой в выходной`);
  if (si.credits) bits.push(`${si.credits} ${plural(si.credits, 'выходной в запасе', 'выходных в запасе', 'выходных в запасе')}`);

  if (si.days >= 3 || bits.length) {
    h += `<p class="tiny dim mt center">${si.days} ${plural(si.days, 'будний день', 'будних дня', 'будних дней')} подряд${
      bits.length ? ' · ' + bits.join(' · ') : ''}.</p>`;
  }

  if (brk) {
    h += `<div class="card mt streak-brk">
      <b>Цепочку рвёт ${fmtRU(brk)}</b>
      <p class="sm muted" style="margin:6px 0 0">Один сорванный день не должен стоить месяца работы. Закрой его работой в ближайшие выходные — или потрать заморозку, если это была сессия или болезнь.</p>
      <div class="row wrap mt">
        <button class="btn" id="freezeBtn" data-day="${brk}"${left ? '' : ' disabled'}>FREEZE ${fmtShort(brk)}</button>
        <span class="tiny dim">осталось ${left} ${plural(left, 'заморозка', 'заморозки', 'заморозок')} на Q${q} · всего две за квартал</span>
      </div>
    </div>`;
  }
  return h;
}

function rCareer() {
  const t = Store.totals();
  let h = `<div class="section-h"><h2>PORTFOLIO</h2><span class="rule"></span><span class="pill ${t.repos === 8 ? 'ok' : ''}">${t.repos}/8</span></div>`;

  PORTFOLIO.forEach(r => {
    const s = Store.repo(r.id);
    const wk = WEEKS[r.week - 1];
    h += `<div class="card hud scanfx wk q${wk.q} reveal"><span class="beam"></span>
      <div class="card-t">
        <div><h3 class="mono" style="font-size:14.5px">${esc(r.name)}</h3>
        <div class="tiny dim">создаётся в W${r.week} · ${esc(r.why)}</div></div>
        <span class="pill ${s.published ? 'ok' : ''}">${s.published ? 'готов' : 'W' + r.week}</span>
      </div>
      <p class="sm muted" style="margin:0 0 10px">${esc(r.inside)}</p>
      <div class="row wrap" style="gap:7px">
        ${[['readme','README (EN)'],['screens','3+ скриншота'],['published','Опубликован']]
          .map(([k, l]) => `<button class="fbtn${s[k] ? ' on' : ''}" data-repo="${r.id}" data-rk="${k}">${s[k] ? '[x] ' : '[ ] '}${l}</button>`).join('')}
      </div>
      <label class="fld mt"><span>REPO URL</span>
        <input type="url" value="${esc(s.url)}" data-repo-url="${r.id}" placeholder="https://github.com/..."></label>
    </div>`;
  });

  h += `<div class="card"><h3>Требования к каждому репозиторию</h3>
    ${PORTFOLIO_RULES.need.map(x => `<div class="sm" style="padding:4px 0"><span style="color:var(--green)">+</span> ${esc(x)}</div>`).join('')}
    <h3 class="mt2" style="color:var(--danger)">Что НЕ класть</h3>
    ${PORTFOLIO_RULES.avoid.map(x => `<div class="sm" style="padding:4px 0"><span style="color:var(--red)">−</span> ${esc(x)}</div>`).join('')}</div>`;

  /* отклики */
  h += `<div class="section-h"><h2>APPLIES</h2><span class="rule"></span><span class="pill ${t.apps >= 60 ? 'ok' : ''}">${t.apps}/60</span></div>`;
  h += `<div class="card">
    <div class="grid g3">
      ${stat(t.apps, 'откликов')}
      ${stat(t.interviews, 'интервью')}
      ${stat(t.apps ? Math.round(t.interviews / t.apps * 100) + '%' : '—', 'конверсия')}
    </div>
    <div class="bar mt"><i style="width:${Math.min(100, Math.round(t.apps / 60 * 100))}%"></i></div>
    <p class="tiny dim mt" style="margin-bottom:0">Волна №1 — 30 откликов в W49. Волна №2 — 30 в W51, половина холодными письмами.</p>
    <button class="btn primary mt" id="addApp" style="width:100%">+ APPLY</button>
  </div>`;

  h += `<div id="appList">${renderApps()}</div>`;

  /* рынок / CV / письмо */
  h += `<div class="section-h"><h2>MARKET MAP</h2><span class="rule"></span></div>`;
  MARKET.forEach(m => {
    const p = m.real === 'high' ? 'ok' : m.real === 'mid' ? 'warn' : 'danger';
    const lbl = m.real === 'high' ? 'реалистично' : m.real === 'mid' ? 'средне' : 'сложно';
    h += `<div class="card"><div class="card-t"><h3>${esc(m.dir)}</h3><span class="pill ${p}">${lbl}</span></div>
      <p class="sm muted" style="margin:0">${esc(m.text)}</p></div>`;
  });

  h += `<div class="section-h"><h2>W52 EXPECTATIONS</h2><span class="rule"></span></div><div class="card"><table class="t"><tbody>
    ${OUTCOMES.map(o => `<tr><td><b>${esc(o.s)}</b><div class="tiny dim">${esc(o.text)}</div></td>
      <td style="width:66px;text-align:right"><span class="pill">${o.p}</span></td></tr>`).join('')}
    </tbody></table>
    <p class="tiny dim mt" style="margin-bottom:0">Не строй план вокруг «оффер или провал». Строй вокруг «к W52 у меня есть портфолио, которого нет у 95% выпускников».</p></div>`;

  h += `<div class="section-h"><h2>CV</h2><span class="rule"></span></div>
    <details class="acc"><summary><span>Структура CV — 1 страница</span></summary>
      <div><pre class="code">${esc(PERSON_OUT.cv)}</pre>
      <div class="mt">${CV_RULES.map(r => `<div class="sm" style="padding:4px 0">· ${esc(r)}</div>`).join('')}</div>
      <button class="btn sm mt" data-copy="cv">COPY</button></div></details>
    <details class="acc"><summary><span>Холодное письмо</span></summary>
      <div><pre class="code">${esc(PERSON_OUT.email)}</pre>
      <p class="tiny dim mt">Работает за счёт конкретики вместо «хочу развиваться», честного признания отсутствия вакансии и упоминания готовности к ночным сменам — там дыра в укомплектованности любого SOC.</p>
      <button class="btn sm" data-copy="mail">COPY</button></div></details>`;

  const ach = Store.achievements();
  h += `<div class="section-h"><h2>ACHIEVEMENTS</h2><span class="rule"></span>
    <span class="tiny dim mono">${ach.filter(a => a.got).length}/${ach.length}</span></div>
    <div class="ach-grid">${ach.map(a => `
      <div class="ach${a.got ? ' got' : ''}">
        <span class="ach-ic">${own(ICONS, a.icon, ICONS.shield)}</span>
        <span class="ach-txt"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
      </div>`).join('')}</div>
    <p class="tiny dim mt2">Здесь нет наград за «зашёл три дня подряд». Награда за присутствие обесценивает награду за работу.</p>`;

  $('#v-career').innerHTML = h;

  $$('[data-repo]').forEach(b => b.onclick = () => {
    const id = +b.dataset.repo, k = b.dataset.rk;
    Store.setRepo(id, { [k]: Store.repo(id)[k] ? 0 : 1 });
    achCheck();                                   // «первый репозиторий»
    Sync.schedule(); buzz(10); rCareer(); renderAll();
  });
  $$('[data-repo-url]').forEach(i => i.onchange = () => {
    Store.setRepo(+i.dataset.repoUrl, { url: i.value }); Sync.schedule(); toast('Сохранено');
  });
  $('#addApp').onclick = addAppPrompt;
  bindApps();
  $$('[data-copy]').forEach(b => b.onclick = () => {
    const txt = b.dataset.copy === 'cv' ? PERSON_OUT.cv : PERSON_OUT.email;
    navigator.clipboard.writeText(txt).then(() => toast('Скопировано'), () => toast('Не удалось скопировать'));
  });
}

function renderApps() {
  const list = Store.d.apps;
  if (!list.length) return `<div class="empty"><div class="ic">${ICONS.inbox}</div>Пока пусто. Первая волна — W49.</div>`;
  return list.slice().reverse().map(a => `<div class="app-item">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div style="min-width:0"><b>${esc(a.company || '—')}</b>
        <div class="tiny dim">${esc(a.role || '')} ${a.cat ? '· ' + esc(a.cat) : ''}</div></div>
      <button class="btn sm danger" data-delapp="${a.id}">×</button>
    </div>
    <div class="row wrap mt" style="gap:8px">
      <select data-appst="${a.id}" style="width:auto;flex:1;min-width:150px">
        ${APP_STATUSES.map(s => `<option${s === a.status ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      <span class="pill">${fmtShort(a.date)}</span>
    </div>
    ${a.note ? `<p class="tiny muted mt" style="margin-bottom:0">${esc(a.note)}</p>` : ''}
  </div>`).join('');
}
function bindApps() {
  $$('[data-delapp]').forEach(b => b.onclick = () => {
    if (confirm('Удалить отклик?')) { Store.delApp(+b.dataset.delapp); Sound.drop(); rCareer(); renderAll(); }
  });
  $$('[data-appst]').forEach(s => s.onchange = () => {
    Store.updApp(+s.dataset.appst, { status: s.value }); Sync.schedule(); toast('Сохранено'); rCareer();
  });
}
/** Категории откликов: текущие плюс те, что уже лежат в сохранённых
 *  откликах. Категория — хранимое значение (§3.8), и человек, сменивший
 *  город, иначе осиротил бы старые записи: они остались бы с категорией,
 *  которой больше нет в списке выбора. Объединение стоит одну строку
 *  и закрывает это целиком. */
function appCats() {
  const out = APP_CATEGORIES.slice();
  (Store.d.apps || []).forEach(a => {
    const c = a && typeof a.cat === 'string' ? a.cat : '';
    if (c && out.indexOf(c) === -1) out.push(c);
  });
  return out;
}

function addAppPrompt() {
  const company = prompt('Компания:'); if (!company) return;
  const role = prompt('Позиция:', 'Junior SOC Analyst') || '';
  const cats = appCats();
  const cat = prompt('Категория:\n' + cats.join(' / '), cats[0]) || cats[0];
  const note = prompt('Заметка (необязательно):') || '';
  Store.addApp({ company, role, cat, note, status: 'Отправлен' });
  achCheck();                                     // «первый отклик отправлен»
  Sync.schedule(); rCareer(); renderAll(); toast('Отклик добавлен');
}

/* ─────────── ЕЩЁ ─────────── */
/* ─────────── НАСТРОЙКИ (§12.2) ───────────
   Разметка и обвязка разведены, потому что блок рисуется в двух местах:
   своей вкладкой на десктопе и секцией внутри MORE на телефоне (таббар
   уже семиколоночный). Видим всегда ровно один — второй режет CSS.
   Одна разметка на оба места: разойдутся — разъедется и поведение. */
const SECTION_NAME = { anki: 'ANKI' };

function settingsHtml() {
  const rows = Store.hideable().map(id => {
    const off = Store.hidden(id);
    return `<div class="set-row">
      <span class="set-name">${own(ICONS, id, ICONS.shield)}${esc(own(SECTION_NAME, id, id))}</span>
      <button class="btn sm sw${off ? '' : ' on'}" data-hide="${id}" role="switch"
              aria-checked="${off ? 'false' : 'true'}">${off ? 'OFF' : 'ON'}</button>
    </div>`;
  }).join('');

  /* Звук (§12.5). Отдельной секцией, а не строкой среди разделов:
     это не «что показывать», а «как отвечать». Подписи по §3.8 —
     SOUND, ON/OFF, VOL. Объяснять, что звук синтезируется, не нужно:
     из интерфейса объяснения устройства продукта убраны (§3.8).

     Регулятор один и в разметке живёт всегда, но при выключенном
     звуке отключён: серый неподвижный ползунок честнее исчезнувшего —
     видно, что настройка есть и чего она ждёт. */
  const sOn = Store.soundOn();
  const uOn = Store.soundUi();
  const vol = Math.round(Store.soundVol() * 100);
  const sound = `<div class="set-row">
      <span class="set-name">${ICONS.sound}SOUND</span>
      <button class="btn sm sw${sOn ? ' on' : ''}" data-sound role="switch"
              aria-checked="${sOn ? 'true' : 'false'}">${sOn ? 'ON' : 'OFF'}</button>
    </div>
    <div class="set-row${sOn ? '' : ' off'}">
      <span class="set-name">UI</span>
      <button class="btn sm sw${sOn && uOn ? ' on' : ''}" data-soundui role="switch"
              aria-checked="${uOn ? 'true' : 'false'}"${sOn ? '' : ' disabled'}>${uOn ? 'ON' : 'OFF'}</button>
    </div>
    <div class="set-row${sOn ? '' : ' off'}">
      <span class="set-name">VOL</span>
      <span class="set-vol">
        <input type="range" data-vol min="0" max="100" step="5" value="${vol}"
               aria-label="VOL"${sOn ? '' : ' disabled'}>
        <b class="mono tiny" data-volnum>${vol}</b>
      </span>
    </div>`;

  /* PROFILE (§13.2 шаг 2). Место выбрано не «потому что удобно»:
     SETTINGS — единственный экран, где уже живут вещи, которые
     человек настраивает под себя и один раз. Отдельная вкладка
     стоила бы седьмого пункта в таббаре, а он и так на пределе
     по ширине (§12.2-bis).

     Подписи латиницей и коротко (§3.8), объяснений устройства нет:
     под каждым полем — что туда писать, а не почему поле существует.
     Пустое поле показывает своё умолчание placeholder'ом, поэтому
     незаполненная анкета выглядит как заполненная бледно, а не
     как поломка. */
  const pv = Person.vars();
  const prow = f => {
    const v = Person.val(f.id);
    if (f.type === 'bool') {
      return `<div class="set-row">
        <span class="set-name">${esc(f.label)}<small class="tiny dim" style="display:block;font-weight:400">${esc(f.hint)}</small></span>
        <button class="btn sm sw${v ? ' on' : ''}" data-pf="${esc(f.id)}" role="switch"
                aria-checked="${v ? 'true' : 'false'}">${v ? 'ON' : 'OFF'}</button>
      </div>`;
    }
    if (f.type === 'sel') {
      return `<label class="fld"><span>${esc(f.label)} — ${esc(f.hint)}</span>
        <select data-pf="${esc(f.id)}">${f.opts.map(o =>
          `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(own(OS_LABEL, o, o))}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'num') {
      return `<label class="fld"><span>${esc(f.label)} — ${esc(f.hint)}</span>
        <input type="number" inputmode="numeric" min="${f.min}" max="${f.max}"
               value="${esc(String(v))}" data-pf="${esc(f.id)}"></label>`;
    }
    return `<label class="fld"><span>${esc(f.label)} — ${esc(f.hint)}</span>
      <input type="text" maxlength="${f.max}" value="${esc(String(v))}"
             data-pf="${esc(f.id)}" placeholder="${esc(own(pv, f.id, ''))}"></label>`;
  };

  const profile = `<div class="grid g2">${
    PERSON_FIELDS.filter(f => f.type !== 'bool').map(prow).join('')}</div>${
    PERSON_FIELDS.filter(f => f.type === 'bool').map(prow).join('')}
    <p class="tiny dim" style="margin:10px 0 0">Ресурс времени — ${esc(pv.weekly)} ч/нед против ${META.weeklyHours} ч/нед по плану трека.</p>`;

  return `<div class="section-h"><h2>PROFILE</h2><span class="rule"></span></div>
    <div class="card">${profile}</div>
    <div class="section-h"><h2>SECTIONS</h2><span class="rule"></span></div>
    <div class="card">${rows}</div>
    <div class="section-h"><h2>SOUND</h2><span class="rule"></span></div>
    <div class="card">${sound}</div>`;
}

/** Обвязка навешивается на переданный корень, а не на документ:
 *  иначе копия из MORE и копия из вкладки перехватят кнопки друг друга. */
function wireSettings(root) {
  if (!root) return;

  /* PROFILE. Правка параметра пересобирает трек и перерисовывает всё:
     задачи недель, карточку железа, карту рынка и подписи блоков дня
     считаются от этих значений, и показывать половину пересчитанного —
     это ровно та молчаливая рассинхронизация, за которую платили
     в §12.1-ter.

     Текстовые поля слушают `input`, а не `change`: иначе значение
     доезжает только по уходу фокуса, и человек, закрывший вкладку
     сразу после ввода, теряет его. Отправка в облако отложена
     на полторы секунды — иначе запрос на каждую букву. */
  const repaint = commit => {
    applyPerson();
    if (commit) Person.schedule(Auth.sb, Auth.user);
    renderAll();
  };
  root.querySelectorAll('[data-pf]').forEach(el => {
    const id = el.dataset.pf;
    if (el.tagName === 'BUTTON') {
      el.onclick = () => { Person.set(id, own(Person.p || {}, id, false) !== true); repaint(true); buzz(10); };
      return;
    }
    if (el.tagName === 'SELECT') { el.onchange = () => { Person.set(id, el.value); repaint(true); }; return; }
    if (el.type === 'number') { el.onchange = () => { Person.set(id, el.value); repaint(true); }; return; }
    /* Пересборка на каждую букву перерисовала бы поле и увела фокус.
       Поэтому набор только сохраняется, а пересчёт — по уходу фокуса. */
    el.oninput = () => { Person.set(id, el.value); Person.schedule(Auth.sb, Auth.user); };
    el.onchange = () => { Person.set(id, el.value); repaint(true); };
  });

  root.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => {
    const id = b.dataset.hide;
    if (!Store.setHidden(id, !Store.hidden(id))) return;
    Sync.schedule();
    /* Уходим с раздела, если стояли на нём: go() и сам бы увёл,
       но перерисовать надо всё — меню, TODAY и MORE тоже меняются. */
    if (Store.hidden(VIEW)) go('today');
    renderAll();
    buzz(10);
  });

  /* Переключатель звука. Нажатие — настоящий жест, поэтому здесь же
     и единственное разрешённое место для создания контекста помимо
     общего слушателя: Sound.preview() внутри зовёт arm().

     Проба обязательна. Включатель, который ничего не издаёт, читается
     как «звук не работает», и человек идёт искать поломку там, где
     её нет. */
  const sb = root.querySelector('[data-sound]');
  if (sb) sb.onclick = () => {
    const on = !Store.soundOn();
    Store.setSoundOn(on);
    Sync.schedule();
    if (on) Sound.preview(0.55);
    /* Перерисовываем ОБЕ копии блока: одна во вкладке, вторая
       внутри MORE. Видим всегда одну, но разъехаться они не должны
       (§12.2-bis). renderAll() перебирает разделы целиком. */
    renderAll();
    buzz(10);
  };

  /* Мелочь интерфейса. Отдельный тумблер появился вместе с отменой
     закрытого списка (§12.5, редакция 2): вехи человек оставит,
     а россыпь на каждое нажатие захочет выключить первой. Кнопка
     недоступна, пока выключен главный SOUND, — иначе она обещает
     то, чего не будет. */
  const ub = root.querySelector('[data-soundui]');
  if (ub) ub.onclick = () => {
    if (!Store.soundOn()) { Sound.deny(); return; }
    const on = !Store.soundUi();
    Store.setSoundUi(on);
    Sync.schedule();
    if (on) Sound.toggle(true);       // выключая, молчим: подтверждать нечем
    renderAll();
    buzz(8);
  };

  /* Громкость. `input` — на каждое движение ползунка, `change` —
     на отпускание. Пробу играем только на `change`: на `input`
     это была бы очередь из двадцати писков за один протяг. */
  const vr = root.querySelector('[data-vol]');
  if (vr) {
    const num = root.querySelector('[data-volnum]');
    vr.oninput = () => { if (num) num.textContent = vr.value; };
    vr.onchange = () => {
      Store.setSoundVol(Number(vr.value) / 100);
      Sync.schedule();
      Sound.preview(0.55);
    };
  }
}

function rSettings() {
  $('#v-settings').innerHTML = settingsHtml();
  wireSettings($('#v-settings'));
}

function rMore() {
  let h = `<div class="section-h"><h2>DAILY BLUEPRINT</h2><span class="rule"></span></div>
  <div class="card"><table class="t"><thead><tr><th>Блок</th><th style="width:52px">Мин</th></tr></thead><tbody>
    ${DAILY.map(b => `<tr><td><b>${b.name}</b><div class="tiny dim">${esc(b.desc)}</div></td>
      <td class="mono">${b.min}</td></tr>`).join('')}
    <tr><td><b>Итого технических</b></td><td class="mono"><b>155</b></td></tr>
  </tbody></table>
  <h3 class="mt2">Вариации</h3>
  <table class="t"><tbody>${DAY_VARIANTS.map(v =>
    `<tr><td><b>${esc(v.name)}</b><div class="tiny dim">${esc(v.when)}</div></td>
     <td class="mono tiny" style="width:100px">${v.blocks}</td></tr>`).join('')}</tbody></table></div>`;

  h += `<div class="section-h"><h2>READING DOCS ON A1</h2><span class="rule"></span></div><div class="card">
    ${READING_METHOD.map(m => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <b>Проход ${m.n} — ${esc(m.name)} <span class="dim tiny">(${m.min} мин)</span></b>
      <p class="sm muted" style="margin:3px 0 0">${esc(m.text)}</p></div>`).join('')}
    <p class="tiny dim mt" style="margin-bottom:0">Никогда не переводи документ целиком — это иллюзия работы.</p></div>`;

  h += `<div class="section-h"><h2>LANGS</h2><span class="rule"></span></div>`;
  /* Anki EN больше не вводится руками: число берётся из раздела ANKI,
     накопительно к концу квартала — цели в LANGS тоже накопительные
     (300 / 700 / 1100 / 1400). Старое ручное значение остаётся видимым,
     пока своих выгрузок нет: это история до появления раздела. */
  /* Раздел ANKI выключен — считать Anki EN не из чего, поэтому поле
     возвращается к ручному вводу, каким было до §10 (§12.2). */
  const ankiOff = Store.hidden('anki');
  LANGS.forEach(l => {
    const s = Store.lang(l.q);
    const manual = Number(s.anki) || 0;
    const shown = ankiOff ? manual : (Vocab.exportedByQuarter(l.q, 'en') || manual);
    h += `<div class="card wk q${l.q}">
      <div class="card-t"><h3>${QUARTERS[l.q].code} · English → ${l.target}</h3><span class="pill q${l.q}">${QUARTERS[l.q].range}</span></div>
      <p class="sm muted" style="margin:0 0 8px">${esc(l.en)}</p>
      ${Person.cond('lang2') ? `<p class="tiny dim" style="margin:0 0 10px">${esc(l.pl)}</p>` : ''}
      <div class="grid g2">
        <label class="fld" style="margin:0"><span>EF SET</span>
          <input type="text" value="${esc(s.efset)}" data-lang="${l.q}" data-lk="efset" placeholder="${l.target}"></label>
        ${ankiOff
          ? `<label class="fld" style="margin:0"><span>Anki EN (цель ${l.anki})</span>
              <input type="number" min="0" inputmode="numeric" value="${manual || ''}"
                     data-lang="${l.q}" data-lk="anki" placeholder="0"></label>`
          : `<div class="fld" style="margin:0"><span>Anki EN (цель ${l.anki})</span>
              <div class="row" style="gap:8px;align-items:baseline">
                <b class="mono" style="font-size:19px">${shown}</b>
                <span class="pill${shown >= l.anki ? ' ok' : ''}">${Math.min(100, Math.round(shown / l.anki * 100))}%</span>
              </div>
            </div>`}
      </div></div>`;
  });

  h += `<div class="section-h"><h2>RESOURCES</h2><span class="rule"></span></div>`;
  [1,2,3,4].forEach(q => {
    h += `<details class="acc"><summary><span>${QUARTERS[q].code} · ${QUARTERS[q].name}</span><span class="pill q${q}">${RESOURCES.filter(r => r.q === q).length}</span></summary><div>
      ${RESOURCES.filter(r => r.q === q).map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <a href="${safeHref(r.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(r.name)}</b></a>
        <span class="pill" style="margin-left:6px">${esc(r.price)}</span>
        <div class="tiny muted" style="margin-top:2px">${esc(r.what)}</div></div>`).join('')}
    </div></details>`;
  });

  h += `<div class="section-h"><h2>HARDWARE / LAB</h2><span class="rule"></span></div>`;
  HARDWARE.forEach(hw => {
    h += `<div class="card"><div class="card-t"><h3>${esc(hw.name)}</h3>
      <span class="pill ${hw.ok ? 'ok' : 'danger'}">${hw.role}</span></div>
      <p class="sm muted">${esc(hw.text)}</p>
      <p class="tiny dim" style="margin:0"><b>Роль:</b> ${esc(hw.use)}</p></div>`;
  });
  h += `<details class="acc"><summary><span>Установка стека (W1) · ${esc(Person.vars().os)}</span></summary>
    <div><pre class="code">${esc(PERSON_OUT.setup)}</pre></div></details>`;

  h += `<div class="section-h"><h2>CHEATSHEET</h2><span class="rule"></span></div>`;
  h += `<details class="acc"><summary><span>Команды наизусть к W52</span></summary><div>
    ${COMMANDS.map(g => `<h3 class="mt">${esc(g.group)}</h3>
      ${g.items.map(i => `<div class="cmd-row"><code>${esc(i.cmd)}</code><small>${esc(i.desc)}</small></div>`).join('')}`).join('')}
  </div></details>`;
  h += `<details class="acc"><summary><span>Windows Event ID — ядро SOC</span></summary><div>
    ${EVENT_IDS.map(e => `<div class="cmd-row"><code>${esc(e.id)}</code><small>${esc(e.desc)}</small></div>`).join('')}
  </div></details>`;
  h += `<details class="acc"><summary><span>50 вопросов для интервью</span></summary><div>
    ${INTERVIEW.map(g => `<h3 class="mt">${esc(g.group)}</h3>
      ${g.qs.map((q, i) => `<div class="sm" style="padding:5px 0;border-bottom:1px solid var(--border)">${i + 1}. ${esc(q)}</div>`).join('')}`).join('')}
    <p class="tiny dim mt">Отвечать вслух, не в голове. Это разные навыки.</p>
  </div></details>`;
  h += `<details class="acc"><summary><span>Шаблон incident report</span></summary>
    <div><pre class="code">${esc(IR_TEMPLATE)}</pre>
    <button class="btn sm mt" data-copy2="ir">COPY</button></div></details>`;
  h += `<details class="acc"><summary><span>Фильтр для сторонних курсов</span></summary><div>
    <p class="sm muted">Курс не «дополняет» план, а ЗАМЕНЯЕТ конкретную неделю. 631 час распределён полностью.</p>
    ${COURSE_FILTER.map((c, i) => `<div class="sm" style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${i + 1}.</b> ${esc(c)}</div>`).join('')}
  </div></details>`;

  h += `<div class="section-h"><h2>BUDGET</h2><span class="rule"></span></div><div class="card">
    <h3>Обязательно</h3><table class="t"><tbody>
    ${BUDGET.required.map(b => `<tr><td>${esc(b.item)}<div class="tiny dim">${esc(b.when)}</div></td>
      <td style="width:110px;text-align:right"><b>${esc(b.cost)}</b></td></tr>`).join('')}</tbody></table>
    <h3 class="mt2">Рекомендуется</h3><table class="t"><tbody>
    ${BUDGET.recommended.map(b => `<tr><td>${esc(b.item)}<div class="tiny dim">${esc(b.when)}</div></td>
      <td style="width:110px;text-align:right">${esc(b.cost)}</td></tr>`).join('')}</tbody></table></div>`;
  h += `<details class="acc"><summary><span>Сертификаты — разбор</span></summary><div>
    ${BUDGET.certs.map(c => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="pill">${esc(c.cost)}</span></div>
      <div class="tiny" style="margin-top:3px">${esc(c.verdict)}</div>
      <div class="tiny dim">+ ${esc(c.pro)}</div><div class="tiny dim">− ${esc(c.con)}</div></div>`).join('')}
    <p class="tiny mt" style="color:var(--amber)">${esc(BUDGET.note)}</p>
    ${BUDGET_TEXT.map(b => `<p class="tiny dim" style="margin:6px 0 0">${esc(b.t)}</p>`).join('')}</div></details>`;

  h += `<div class="section-h"><h2>RULES</h2><span class="rule"></span></div><div class="card">
    ${RULES.map(r => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <b>${esc(r.name)}</b><p class="sm muted" style="margin:2px 0 0">${esc(r.text)}</p></div>`).join('')}</div>`;

  /* ── аккаунт ── */
  const su = Sync.user;
  const prof = Auth.profile || {};
  const track = (Tracks.list.find(t => t.id === ROADMAP) || {}).title || ROADMAP;
  h += `<div class="section-h"><h2>ACCOUNT</h2><span class="rule"></span><span class="row tiny dim" style="gap:6px"><i class="sync-dot ${
      Sync.state === 'ok' ? 'ok' : Sync.state === 'busy' ? 'busy' : Sync.state === 'err' ? 'err' : ''}"></i>${esc(Sync.label())}</span></div>`;

  h += su ? `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:12px">
        <div class="row" style="gap:11px">
          <span class="av on" style="cursor:default">${AV_SVG(prof.avatar || 'shield')}</span>
          <div>
            <b>${esc(prof.nickname || '—')}</b>
            <div class="tiny dim mono">${esc(su.email)}</div>
          </div>
        </div>
        <button class="btn sm" id="syOut">LOGOUT</button>
      </div>
      <div class="row tiny dim mt" style="gap:6px"><span class="pill">${esc(track)}</span></div>
    </div>` : `<div class="card"><p class="sm muted" style="margin:0">Сессия потерялась. Перезагрузи страницу.</p></div>`;

  h += `<div class="section-h"><h2>DATA</h2><span class="rule"></span></div><div class="card">
    <p class="sm muted">Прогресс живёт в твоём Supabase, а в браузере лежит его копия для офлайна. <b>Бэкап раз в месяц</b> всё равно стоит делать — от собственной ошибки он спасает лучше любого сервера.</p>
    <div class="row wrap mt">
      <button class="btn primary" id="expBtn">EXPORT</button>
      <button class="btn" id="impBtn">IMPORT</button>
      <button class="btn danger" id="resetBtn">DROP ALL</button>
    </div>
    <input type="file" id="impFile" accept="application/json" style="display:none">
    <p class="tiny dim mt" style="margin-bottom:0">«Сбросить всё» стирает и локальную копию, и облачную — при следующей отправке пустое состояние уедет на сервер.</p>
  </div>`;

  /* SETTINGS внутри MORE — только там, где нет сайдбара (§12.2).
     Прячет CSS по той же границе 880 px, что переключает таббар
     и сайдбар: держать порог в одном месте надёжнее, чем сверять
     медиазапрос с matchMedia в скрипте. */
  h += `<div class="only-narrow" id="moreSettings">${settingsHtml()}</div>`;

  h += `<p class="tiny dim center mt2">SOC Roadmap 365 · старт ${fmtRU(META.start)} · финиш ${fmtRU(META.end)}<br>
    631 технический час · 52 недели · 224 задачи</p>`;

  $('#v-more').innerHTML = h;
  wireSettings($('#moreSettings'));

  $$('[data-lang]').forEach(i => i.onchange = () => {
    Store.setLang(+i.dataset.lang, i.dataset.lk, i.value); Sync.schedule(); toast('Сохранено');
  });
  $$('[data-copy2]').forEach(b => b.onclick = () =>
    navigator.clipboard.writeText(IR_TEMPLATE).then(() => toast('Скопировано'), () => toast('Не удалось')));
  $('#expBtn').onclick = () => { Store.export(); Sound.data(); toast('Бэкап скачан'); };
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { Store.import(r.result); Sound.data(); toast('Загружено'); renderAll(); }
      catch (err) { Sound.err(); alert('Не удалось прочитать файл: ' + err.message); }
    };
    r.readAsText(f);
  };
  $('#resetBtn').onclick = () => {
    if (confirm('Стереть ВЕСЬ прогресс? Отменить будет нельзя.\n\nСначала лучше скачать бэкап.')) {
      Store.reset(); location.reload();
    }
  };

  const sOut = $('#syOut');
  if (sOut) sOut.onclick = () => {
    if (confirm('LOGOUT?\n\nПрогресс останется в облаке — вернёшься тем же входом.')) Auth.signOut();
  };
}

/* ══════════════════ ТРЕКИ ══════════════════ */
/* Запись на трек настоящая: строка в enrollments. Содержание трека
   приезжает из roadmaps.content (§3.2-bis), а этот раздел отвечает
   только за то, НА КАКОЙ трек человек записан.

   Последний известный трек лежит в своём ключе localStorage, а НЕ
   полем в `Store.d`, и это не обход правила «добавил поле — допиши
   mergeState()». `Store.d` целиком уезжает в `progress.payload`,
   а payload ключуется парой (user_id, roadmap_id): положить туда
   «какой трек активен» значило бы завести запись, которая знает
   про собственный ключ. Плюс истина об активном треке уже есть
   на сервере — строка в `enrollments`; здесь нужен не второй
   источник, а устройственный запас на случай, когда до сервера
   не дотянуться.

   Привязка к аккаунту обязательна. `ROADMAP` участвует в ключе
   прогресса: подхваченный чужой трек орфанил бы прогресс молча —
   ровно тем почерком, за который платили в §12.1. Поэтому в записи
   лежит owner, и чужая запись не читается вовсе. */
const TRACK_KEY = 'soc365.track.v1';

const Tracks = {
  list: [],
  active: null,
  /** Была ли база доступна при последней загрузке. Читают showPicker()
   *  и openApp(): без сети человеку надо сказать, что он видит
   *  сохранённое, а не пустоту. */
  offline: false,
  note: '',

  _remember(userId, id) {
    if (!userId || !id) return false;
    try { localStorage.setItem(TRACK_KEY, JSON.stringify({ owner: userId, id })); return true; }
    catch (e) { console.warn('tracks: последний трек не записан', e); return false; }
  },

  _recall(userId) {
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(TRACK_KEY);
      const o = raw ? safeParse(raw) : null;
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      if (own(o, 'owner', null) !== userId) return null;   // чужой кеш не наш
      const id = own(o, 'id', null);
      return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? id : null;
    } catch (e) {
      console.warn('tracks: последний трек не прочитан', e);
      return null;
    }
  },

  /** Список треков и активная запись. Не бросает: офлайн для этого
   *  приложения рабочий режим (§10), а не сбой. */
  async load() {
    this.offline = false;
    this.note = '';
    const uid = Auth.user ? Auth.user.id : null;

    /* `supabase-js` без сети НЕ бросает — он возвращает
       `{ data: null, error }`. Прежний код читал один только `data`
       и принимал «сети нет» за «треков нет»: список пустел, активной
       записи не находилось, и человек вместо своего трекера видел
       пустой экран выбора трека. Это разные случаи, и ответы у них
       разные. Дефект жил с этапа A (§3.2-bis, долг 1). */
    const rm = await Auth.sb.from('roadmaps')
      .select('id,title,subtitle,accent,icon,total_hours,total_weeks').order('sort');
    const en = await Auth.sb.from('enrollments')
      .select('roadmap_id,is_active').eq('user_id', uid);

    /* Любая из двух ошибок — это «серверу не ответить». Различать их
       тоньше нечем и незачем: половина ответа не лучше отсутствующего,
       а решение в обоих случаях одно. */
    const err = (rm && rm.error) || (en && en.error);
    if (err) {
      this.offline = true;
      this.note = 'база недоступна: ' + (err.message || String(err));
      this.list = [];
      /* Последний известный трек — единственный способ поднять трекер
         без сети. Нет его — показывать нечего: список треков живёт
         на сервере, и придумать его здесь не из чего. */
      this.active = this._recall(uid);
      console.warn('tracks: ' + this.note + (this.active
        ? ` — поднимаюсь на последнем известном треке «${this.active}»`
        : ' — последнего трека на этом устройстве нет'));
      return this.active;
    }

    this.list = (rm && rm.data) || [];
    const act = ((en && en.data) || []).find(e => e.is_active);
    this.active = act ? act.roadmap_id : null;
    /* Помним ТОЛЬКО подтверждённое сервером. Запомнить выбор, который
       не доехал, значило бы завести на устройстве трек, которого нет
       в `enrollments`, — и получить прогресс под ключом, которого
       на сервере не существует. */
    if (this.active) this._remember(uid, this.active);
    return this.active;
  },

  async pick(id) {
    const { error } = await Auth.sb.from('enrollments').upsert(
      { user_id: Auth.user.id, roadmap_id: id, is_active: true },
      { onConflict: 'user_id,roadmap_id' });
    if (error) throw error;
    this.active = id;
    ROADMAP = id;
    this._remember(Auth.user.id, id);
  }
};

function showPicker() {
  const box = $('#pickerBody');
  $('#picker').style.display = 'grid';
  /* Пустой экран выбора без объяснения — это и был дефект §3.2-bis.
     Список треков живёт на сервере, придумать его здесь не из чего,
     поэтому единственное честное действие — сказать, что произошло. */
  const off = Tracks.offline
    ? `<div class="track ghost">
         <span class="track-txt">
           <b>Нет связи с сервером</b>
           <small>Список треков не загрузился, а сохранённого трека на этом
           устройстве нет. Появится сеть — экран заполнится сам.</small>
         </span>
       </div>`
    : '';
  box.innerHTML = off + Tracks.list.map(t => `
    <button class="track hud" data-track="${esc(t.id)}">
      <span class="track-ic">${AV_SVG(t.icon || 'shield')}</span>
      <span class="track-txt">
        <b>${esc(t.title)}</b>
        <small>${esc(t.subtitle || '')}</small>
        <span class="row tiny dim mt" style="gap:6px">
          <span class="pill">${t.total_weeks || 0} weeks</span>
          <span class="pill">${t.total_hours || 0} h</span>
        </span>
      </span>
    </button>`).join('') + `
    <div class="track ghost">
      <span class="track-txt">
        <b>Нужен трек под себя?</b>
        <small>Соберу индивидуально под твою цель, время и железо.</small>
      </span>
    </div>`;

  $$('#picker [data-track]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await Tracks.pick(b.dataset.track);
      $('#picker').style.display = 'none';
      await openApp('');
    } catch (e) {
      b.disabled = false;
      alert('Не получилось выбрать трек: ' + (e.message || e));
    }
  });
}

/* ══════════════════ RANK ══════════════════ */
function rRank() {
  const box = $('#v-rank');
  box.innerHTML = `<div class="section-h"><h2>RANK</h2><span class="rule"></span></div>
    <div class="card"><p class="sm muted mono" style="margin:0">loading…</p></div>`;
  if (!Auth.sb || !Auth.user) return;

  Auth.sb.from('leaderboard').select('*').eq('roadmap_id', ROADMAP)
    .order('place').limit(100)
    .then(({ data, error }) => {
      let h = `<div class="section-h"><h2>RANK</h2><span class="rule"></span>
        <span class="tiny dim mono">${esc(ROADMAP)}</span></div>`;
      if (error) {
        h += `<div class="card"><p class="sm muted" style="margin:0">Рейтинг не загрузился: ${esc(error.message)}</p></div>`;
      } else if (!data || !data.length) {
        h += `<div class="empty"><div class="ic">${ICONS.rank}</div>Пока пусто. Первая же закрытая задача поставит тебя в таблицу.</div>`;
      } else {
        h += `<div class="card"><div class="tbl-wrap"><table class="t rank"><thead><tr>
            <th style="width:44px">#</th><th>PLAYER</th><th style="width:64px">PCT</th>
            <th style="width:64px">HOURS</th><th style="width:56px">WK</th><th style="width:60px">STREAK</th>
          </tr></thead><tbody>
          ${data.map(r => `<tr class="${r.user_id === Auth.user.id ? 'me' : ''}">
            <td class="mono">${r.place}</td>
            <td><span class="row" style="gap:8px"><span class="av sm2">${AV_SVG(r.avatar)}</span>${esc(r.nickname)}</span></td>
            <td class="mono">${Math.round(r.pct)}%</td>
            <td class="mono">${r.hours_fact}</td>
            <td class="mono">${r.weeks_closed}</td>
            <td class="mono">${r.streak}</td></tr>`).join('')}
          </tbody></table></div>
        </div>`;
      }
      box.innerHTML = h;
    });
}

function stat(v, l) { return `<div class="stat hud"><b>${esc(v)}</b><span>${esc(l)}</span></div>`; }
function card(inner) { return `<div class="card">${inner}</div>`; }

/* ══════════════════ ФОН ══════════════════ */
/* Столбцы hex в подложке. Рисуем один раз при загрузке: дальше всё
   двигает CSS, поэтому на прокрутке и таймере это ничего не стоит.
   Живёт внутри .env (fixed + overflow: hidden) — документ не расширяет. */
function envRain() {
  const box = $('#envRain');
  if (!box || REDUCED) return;
  const cols = window.innerWidth < 640 ? 6 : 11;
  const glyphs = '0123456789ABCDEF';
  let h = '';
  for (let i = 0; i < cols; i++) {
    let txt = '';
    for (let j = 0; j < 26; j++) txt += glyphs[(Math.random() * 16) | 0] + '\n';
    const dur = 34 + Math.random() * 46;
    h += `<i style="left:${(i / cols) * 100 + Math.random() * (60 / cols)}%;
      animation-duration:${dur.toFixed(1)}s; animation-delay:-${(Math.random() * dur).toFixed(1)}s;
      opacity:${(0.035 + Math.random() * 0.03).toFixed(3)};
      font-size:${(9 + Math.random() * 4).toFixed(1)}px">${txt}</i>`;
  }
  box.innerHTML = h;
}
envRain();

/* Строка состояния в шапке: стенные часы и индикатор канала.
   Часы идут по Date.now(), поэтому фоновое удушение интервалов
   им не вредит — та же логика, что у таймера (§3.7). */
function netStat() {
  const el = $('#netStat'), clock = $('#netClock'), lbl = $('#netLbl');
  if (!el || !clock) return;
  const two = n => String(n).padStart(2, '0');
  const paint = () => {
    const d = new Date();
    clock.textContent = two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  };
  const link = () => {
    const on = navigator.onLine !== false;
    el.classList.toggle('off', !on);
    if (lbl) lbl.textContent = on ? 'LINK' : 'OFFLINE';
  };
  paint(); link();
  setInterval(paint, 1000);
  window.addEventListener('online', link);
  window.addEventListener('offline', link);
}
netStat();

/* ══════════════════ INIT ══════════════════ */
Store.load();
document.documentElement.dataset.theme = Store.d.theme || 'dark';

// иконки оболочки
$('#brandMark').innerHTML = ICONS.shield;
$('#themeBtn').innerHTML  = ICONS.theme;
$('#outBtn').innerHTML    = ICONS.out;

/* Вход обязателен: приложение открывается только после того,
   как Supabase отдал сессию, то есть почта подтверждена.
   Дальше — трек: без записи в enrollments показываем экран выбора. */
async function openApp(note) {
  $('#gate').style.display = 'none';
  $('#picker').style.display = 'none';
  $('#app').classList.add('on');
  /* Содержание трека — раньше всего остального (§3.2). `currentWeek()`,
     `Store.stats()` и Zero читают WEEKS и META сразу, и увидеть они
     обязаны окончательные данные: применить содержание после первой
     отрисовки значило бы показать одни даты, а через миг другие.
     Не бросает никогда — без базы работаем на встроенном содержании,
     офлайн для этого приложения нормальный режим (§10). */
  await Content.load(Auth.sb, ROADMAP);
  /* Параметры человека — сразу за содержанием и до всего остального
     (§13.2 шаг 2). Порядок обязателен: `applyPerson()` подставляет
     их в задачи недель по месту, а недели к этому моменту уже могли
     приехать из базы. Сделать наоборот значило бы подставить в трек
     из `data-weeks.js`, а потом заменить его базой — и увидеть
     на экране шаблоны `{{lab}}` вместо своей машины.
     `reseat` говорит `applyPerson()`, что сырьё сменилось: недель
     столько же, и по длине подмену не поймать (§12.5-bis). */
  await Person.load(Auth.sb, Auth.user);
  applyPerson(true);
  await Sync.init();
  /* Словарь поднимается отдельно от прогресса: он в своей таблице.
     Ошибку глотаем намеренно — офлайн это нормальный режим захвата,
     слова уже лежат локально и уедут при следующей отправке. */
  await Vocab.init().catch(e => console.warn('vocab init', e));
  tRestore();
  /* Слепок достижений снимается ПОСЛЕ загрузки прогресса и до первой
     отрисовки. Раньше — и все шесть окажутся «новыми» при первом же
     нажатии; позже — и достижение, полученное между загрузкой
     и снимком, потеряется (§12.5). */
  achSnapshot();
  renderAll();
  decodeHeadings($('#v-' + VIEW));
  if (note) toast(note);
  /* Без сети трекер поднялся на последнем известном треке и на
     запасном содержании. Сказать об этом обязательно: молча
     показанные вчерашние данные — это те же «два правдоподобных
     числа», за которые платила §12.1-ter. */
  else if (Tracks.offline) toast('Нет связи с сервером — трекер работает офлайн');

  /* «Канал открыт» — один раз за сессию. На восстановленной сессии
     не прозвучит вовсе: жеста не было, контекста нет, Sound молчит
     по построению. Это не изъян, а ровно то поведение, которого
     требует §12.5: звука при загрузке страницы быть не должно. */
  Sound.login();
  /* Загрузочная последовательность (§12.6). Один раз за сессию,
     флаг внутри Fx. На восстановленной сессии звука не будет —
     жеста не было, — но картинка покажется: она жеста не требует. */
  Fx.boot();
}

Auth.onenter = async (note) => {
  const active = await Tracks.load();
  if (!active) { $('#gate').style.display = 'none'; showPicker(); return; }
  ROADMAP = active;
  await openApp(note);
};
Auth.onleave = () => {
  $('#app').classList.remove('on');
  $('#picker').style.display = 'none';
  $('#gate').style.display = 'grid';
  Store.reset();                  // локальный кеш чужому не достаётся
  Vocab.wipe();                   // словарь тем более: это карта незнания
  Drill.stop();                   // и незакрытый проход по чужим словам
  ACH_SEEN = null;                // слепок чужих достижений тоже не наш
  /* Контекст не закрываем: он тяжёлый, один на страницу (§12.5),
     и следующий вход переиспользует его. Звучать он не будет —
     Store.reset() вернул настройки к умолчанию, где звук выключен. */
};

/* Клавиатура тренажёра. Раскладка как в настольной Anki: пробел
   показывает ответ, дальше оценка. Слушатель один и глобальный,
   но срабатывает только когда проход идёт и вкладка открыта, —
   иначе он перехватит пробел у поля захвата и у чеклиста. */
window.addEventListener('keydown', e => {
  if (!Drill.on || VIEW !== 'anki') return;
  if (Store.hidden('anki')) return;   // раздел выключен — слушатель молчит (§12.2)
  if (!$('#app').classList.contains('on')) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key;
  let act = null;
  if (k === ' ' || k === 'Enter') act = Drill.flipped ? 'know' : 'flip';
  else if (k === 'ArrowRight' || k === '2') act = 'know';
  else if (k === 'ArrowLeft'  || k === '1') act = 'again';
  else if (k === 'd' || k === 'D' || k === 'в' || k === 'В') act = 'del';
  else if (k === 'Escape') act = 'exit';
  if (!act) return;

  e.preventDefault();
  drillAct(act);
});

/* Состояние обмена с сервером. Ограничитель на секунду живёт
   внутри Sound.sync(): синхронизация умеет дёргаться, и без него
   busy/ok чередовались бы очередью (§12.5). */
Sync.onchange = () => {
  if (!$('#app').classList.contains('on')) return;
  Sound.sync(Sync.state);
  if (VIEW === 'more') rMore();
};
window.addEventListener('pagehide', () => {
  if (Sync.user) Sync.push();
  if (Vocab.user) Vocab.push();
});

$('#themeBtn').onclick = () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
};
$('#outBtn').onclick = () => {
  if (confirm('LOGOUT?\n\nПрогресс останется в облаке — вернёшься тем же входом.')) Auth.signOut();
};

Auth.init().catch(e => {
  console.error('auth init', e);
  Auth.go('signin', '', 'Не удалось подключиться: ' + (e.message || e));
});
