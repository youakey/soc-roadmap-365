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
  anki:   S('<path d="M7 4.5h9.5A1.5 1.5 0 0 1 18 6v13.5H8.5A1.5 1.5 0 0 1 7 18z"/><path d="M4.5 7.5v11A1.5 1.5 0 0 0 6 20h1"/><path d="M10.5 9h4M10.5 12.5h5"/>')
};
const NAV = [
  { id: 'today',  label: 'TODAY'  },
  { id: 'anki',   label: 'ANKI'   },
  { id: 'year',   label: 'YEAR'   },
  { id: 'weeks',  label: 'WEEKS'  },
  { id: 'career', label: 'CAREER' },
  { id: 'rank',   label: 'RANK'   },
  { id: 'more',   label: 'MORE'   }
];

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
  if (id !== 'anki') return '';
  const n = Vocab.rawCount();
  return n ? `<i class="nav-badge">${n > 99 ? '99+' : n}</i>` : '';
}
function buildNav() {
  $('#tabbar').innerHTML = NAV.map(n =>
    `<button class="tab${n.id === VIEW ? ' on' : ''}" data-go="${n.id}">${own(ICONS, n.id, ICONS.shield)}${navBadge(n.id)}<span>${n.label}</span></button>`).join('');
  $('#snav').innerHTML = NAV.map(n =>
    `<button class="${n.id === VIEW ? 'on' : ''}" data-go="${n.id}">${own(ICONS, n.id, ICONS.shield)}<span>${n.label}</span>${navBadge(n.id)}</button>`).join('');
  $$('#tabbar [data-go], #snav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}
const CRUMB = { today:'today', anki:'anki', year:'year', weeks:'weeks', career:'career', rank:'rank', more:'more' };
function paintCrumbs() {
  const el = $('#crumbs');
  if (!el) return;
  const cw = currentWeek();
  el.innerHTML = `<span class="c-path">~/soc-365/${esc(CRUMB[VIEW] || VIEW)}</span>` +
    `<span class="c-sep">·</span><span class="c-meta">${isBeforeStart() ? 'до старта' : 'W' + cw + '/52'}</span>` +
    `<span class="c-cur"></span>`;
}

function go(id) {
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


/** Эффект расшифровки текста: символы перебираются и складываются в слово. */
const GLYPHS = '01<>[]{}/\\|=+*#$%&@ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function decodeText(el) {
  if (REDUCED || !el || el.dataset.decoded) return;
  el.dataset.decoded = '1';
  const target = el.textContent;
  // страховка: что бы ни случилось с кадрами, текст восстановится
  setTimeout(() => { if (el.isConnected) el.textContent = target; }, 1200);
  const len = target.length;
  if (len > 40) return;
  let frame = 0;
  const total = len * 2 + 8;
  const tick = () => {
    let out = '';
    for (let i = 0; i < len; i++) {
      if (target[i] === ' ') { out += ' '; continue; }
      const start = i * 2;
      if (frame > start + 6) out += target[i];
      else if (frame > start) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += '';
    }
    el.textContent = out;
    if (frame++ < total) requestAnimationFrame(tick);
    else el.textContent = target;
  };
  requestAnimationFrame(tick);
}

/** Расшифровать заголовки секций во вкладке при её показе. */
function decodeHeadings(root) {
  $$('.section-h h2', root).forEach((h, i) => setTimeout(() => decodeText(h), i * 70));
}

/** Тактильный отклик там, где он уместен. */
function buzz(ms) { try { !REDUCED && navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {} }

/* ══════════════════ RENDER ══════════════════ */
function renderAll() {
  buildNav();
  ['today','anki','year','weeks','career','rank','more'].forEach(render);
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
  const fn = own({ today: rToday, anki: rAnki, year: rYear, weeks: rWeeks,
                   career: rCareer, rank: rRank, more: rMore }, id, null);
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
  const t = Store.totals();
  const sess = META.sessionWeeks.includes(cw);
  const blocks = sess ? DAILY.filter(b => ['polish','english','lab'].includes(b.id)) : DAILY;
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
      <p class="muted sm" style="margin:2px 0 0">Осталось ${daysBetween(today, META.start)} дн. Пока можно закрыть W1 заранее: поставить SSD в ASUS и развернуть гипервизор.</p></div></div>`);
  }

  /* дневной чеклист */
  h += `<div class="card">
    <div class="card-t">
      <div><h3>Чеклист дня</h3><div class="tiny dim">${weekend ? 'Выходной — по плану отдых. Но если хочется, никто не мешает.' : 'Пн–Пт · ' + (sess ? 'SESSION MODE, 1 час' : '3 часа')}</div></div>
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

  /* Словарь. Счётчик сырых слов и есть напоминание, что пора сесть
     за оформление, — поэтому он висит здесь, рядом с чеклистом,
     а не внутри своей вкладки. */
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

  /* streak и цифры */
  h += `<div class="section-h"><h2>PULSE</h2><span class="rule"></span></div>
  <div class="grid g3">
    ${stat(t.streak, 'streak, дней')}
    ${stat(t.closed + '/52', 'недель закрыто')}
    ${stat(t.pct + '%', 'года пройдено')}
  </div>`;

  h += streakCard();

  /* правило дня */
  const rule = RULES[dayOfYear() % RULES.length];
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
    try { Store.freeze(day); Sync.schedule(); toast('Заморожено'); renderAll(); }
    catch (e) { alert(e.message); }
  };

  $$('[data-block]').forEach(el => el.onclick = () => {
    const on = Store.toggleBlock(today, el.dataset.block);
    if (on) { el.classList.add('pulse'); buzz(14); }
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

function rAnki() {
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
  $$('[data-vdel]').forEach(b => b.onclick = () => {
    const row = Vocab.rows.find(x => x.lid === b.dataset.vdel);
    if (!row || !confirm('Удалить «' + row.word + '»?')) return;
    Vocab.remove(b.dataset.vdel).then(() => { rAnki(); renderAll(); });
  });

  $$('[data-vexp]').forEach(b => b.onclick = () => {
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

function timerStart(block, min, name) {
  T = { block, name, total: min * 60, endsAt: Date.now() + min * 60000, left: null, done: false };
  tSave(); tLoop(); tPaint(); buzz(10);
}
function timerPause() {
  if (!tRunning()) return;
  T.left = tLeft(); T.endsAt = null;
  tSave(); tLoop(); tPaint();
}
function timerResume() {
  if (T.left == null) return;
  T.endsAt = Date.now() + T.left * 1000; T.left = null;
  tSave(); tLoop(); tPaint();
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

  tSave(); tLoop(); tPaint(); buzz(8);
  const box = $('#tBox');
  if (box) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
  if (idle && VIEW === 'today') rToday();       // подсветить PAUSE/RESET
}

function timerReset() {
  T = { block: null, name: '', total: 0, endsAt: null, left: null, done: false };
  tSave(); tLoop(); tPaint();
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
  if (!silent) { try { navigator.vibrate && navigator.vibrate([200, 90, 200]); } catch (e) {} }
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
    ${RED_FLAGS.map(f => `<div class="sm" style="padding:5px 0;border-bottom:1px solid var(--border)">· ${esc(f)}</div>`).join('')}
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
    Sync.schedule(); toast('Сохранено'); renderAll();
  });
  $$('[data-f-status]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-status'), { status: i.value });
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
      <div><pre class="code">${esc(CV_TEXT)}</pre>
      <div class="mt">${CV_RULES.map(r => `<div class="sm" style="padding:4px 0">· ${esc(r)}</div>`).join('')}</div>
      <button class="btn sm mt" data-copy="cv">COPY</button></div></details>
    <details class="acc"><summary><span>Холодное письмо</span></summary>
      <div><pre class="code">${esc(COLD_EMAIL)}</pre>
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
    Sync.schedule(); buzz(10); rCareer(); renderAll();
  });
  $$('[data-repo-url]').forEach(i => i.onchange = () => {
    Store.setRepo(+i.dataset.repoUrl, { url: i.value }); Sync.schedule(); toast('Сохранено');
  });
  $('#addApp').onclick = addAppPrompt;
  bindApps();
  $$('[data-copy]').forEach(b => b.onclick = () => {
    const txt = b.dataset.copy === 'cv' ? CV_TEXT : COLD_EMAIL;
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
    if (confirm('Удалить отклик?')) { Store.delApp(+b.dataset.delapp); rCareer(); renderAll(); }
  });
  $$('[data-appst]').forEach(s => s.onchange = () => {
    Store.updApp(+s.dataset.appst, { status: s.value }); Sync.schedule(); toast('Сохранено'); rCareer();
  });
}
function addAppPrompt() {
  const company = prompt('Компания:'); if (!company) return;
  const role = prompt('Позиция:', 'Junior SOC Analyst') || '';
  const cat = prompt('Категория:\n' + APP_CATEGORIES.join(' / '), APP_CATEGORIES[0]) || APP_CATEGORIES[0];
  const note = prompt('Заметка (необязательно):') || '';
  Store.addApp({ company, role, cat, note, status: 'Отправлен' });
  Sync.schedule(); rCareer(); renderAll(); toast('Отклик добавлен');
}

/* ─────────── ЕЩЁ ─────────── */
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
  LANGS.forEach(l => {
    const s = Store.lang(l.q);
    const shown = Vocab.exportedByQuarter(l.q, 'en') || (Number(s.anki) || 0);
    h += `<div class="card wk q${l.q}">
      <div class="card-t"><h3>${QUARTERS[l.q].code} · English → ${l.target}</h3><span class="pill q${l.q}">${QUARTERS[l.q].range}</span></div>
      <p class="sm muted" style="margin:0 0 8px">${esc(l.en)}</p>
      <p class="tiny dim" style="margin:0 0 10px">PL · ${esc(l.pl)}</p>
      <div class="grid g2">
        <label class="fld" style="margin:0"><span>EF SET</span>
          <input type="text" value="${esc(s.efset)}" data-lang="${l.q}" data-lk="efset" placeholder="${l.target}"></label>
        <div class="fld" style="margin:0"><span>Anki EN (цель ${l.anki})</span>
          <div class="row" style="gap:8px;align-items:baseline">
            <b class="mono" style="font-size:19px">${shown}</b>
            <span class="pill${shown >= l.anki ? ' ok' : ''}">${Math.min(100, Math.round(shown / l.anki * 100))}%</span>
          </div>
        </div>
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
  h += `<details class="acc"><summary><span>Установка стека на MacBook (W1)</span></summary>
    <div><pre class="code">${esc(SETUP_CMD)}</pre></div></details>`;

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
    <p class="tiny mt" style="color:var(--amber)">${esc(BUDGET.note)}</p></div></details>`;

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

  h += `<p class="tiny dim center mt2">SOC Roadmap 365 · старт ${fmtRU(META.start)} · финиш ${fmtRU(META.end)}<br>
    631 технический час · 52 недели · 224 задачи</p>`;

  $('#v-more').innerHTML = h;

  $$('[data-lang]').forEach(i => i.onchange = () => {
    Store.setLang(+i.dataset.lang, i.dataset.lk, i.value); Sync.schedule(); toast('Сохранено');
  });
  $$('[data-copy2]').forEach(b => b.onclick = () =>
    navigator.clipboard.writeText(IR_TEMPLATE).then(() => toast('Скопировано'), () => toast('Не удалось')));
  $('#expBtn').onclick = () => { Store.export(); toast('Бэкап скачан'); };
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { Store.import(r.result); toast('Загружено'); renderAll(); }
      catch (err) { alert('Не удалось прочитать файл: ' + err.message); }
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
/* Контент трека пока живёт в data-weeks.js, но запись на трек уже
   настоящая: строка в enrollments. Когда недели переедут в
   roadmaps.content, экран выбора не придётся переделывать. */
const Tracks = {
  list: [],
  active: null,

  async load() {
    const { data: rms } = await Auth.sb.from('roadmaps')
      .select('id,title,subtitle,accent,icon,total_hours,total_weeks').order('sort');
    this.list = rms || [];
    const { data: ens } = await Auth.sb.from('enrollments')
      .select('roadmap_id,is_active').eq('user_id', Auth.user.id);
    const act = (ens || []).find(e => e.is_active);
    this.active = act ? act.roadmap_id : null;
    return this.active;
  },

  async pick(id) {
    const { error } = await Auth.sb.from('enrollments').upsert(
      { user_id: Auth.user.id, roadmap_id: id, is_active: true },
      { onConflict: 'user_id,roadmap_id' });
    if (error) throw error;
    this.active = id;
    ROADMAP = id;
  }
};

function showPicker() {
  const box = $('#pickerBody');
  $('#picker').style.display = 'grid';
  box.innerHTML = Tracks.list.map(t => `
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
  await Sync.init();
  /* Словарь поднимается отдельно от прогресса: он в своей таблице.
     Ошибку глотаем намеренно — офлайн это нормальный режим захвата,
     слова уже лежат локально и уедут при следующей отправке. */
  await Vocab.init().catch(e => console.warn('vocab init', e));
  tRestore();
  renderAll();
  decodeHeadings($('#v-' + VIEW));
  if (note) toast(note);
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
};

Sync.onchange = () => { if ($('#app').classList.contains('on') && VIEW === 'more') rMore(); };
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
