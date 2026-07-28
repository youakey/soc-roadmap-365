/* ============================================================
   app.js — рендеринг и логика SOC Roadmap 365
   ============================================================ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ICONS = {
  today:  '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 15.5l2 2 4-4"/></svg>',
  year:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  weeks:  '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  career: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/></svg>',
  more:   '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>'
};
const NAV = [
  { id: 'today',  label: 'Сегодня'  },
  { id: 'year',   label: 'Год'      },
  { id: 'weeks',  label: 'Недели'   },
  { id: 'career', label: 'Карьера'  },
  { id: 'more',   label: 'Ещё'      }
];

let VIEW = 'today';
let WEEK_FILTER = 'all';
let TIMER = null;

/* ══════════════════ PIN ══════════════════ */
let pinBuf = '';

function renderLock() {
  const first = !Store.d.pin;
  $('#lockMsg').textContent = first ? 'Придумай PIN из 4 цифр' : 'Введи PIN-код';
  $('#lockHint').innerHTML = first
    ? 'PIN защищает страницу от случайных глаз.<br>Он хранится в твоём браузере и никуда не отправляется.'
    : 'Забыл PIN? Открой сайт в приватном окне —<br>сбросится вместе с прогрессом.';
  renderDots();
  const pad = $('#pinPad');
  pad.innerHTML = '';
  [1,2,3,4,5,6,7,8,9].forEach(n => pad.appendChild(key(n)));
  pad.appendChild(ghost(''));
  pad.appendChild(key(0));
  pad.appendChild(ghost('⌫', () => { pinBuf = pinBuf.slice(0, -1); renderDots(); }));

  function key(n) {
    const b = document.createElement('button');
    b.className = 'pin-key'; b.textContent = n;
    b.onclick = () => press(String(n));
    return b;
  }
  function ghost(t, fn) {
    const b = document.createElement('button');
    b.className = 'pin-key ghost'; b.textContent = t;
    if (fn) b.onclick = fn; else b.style.visibility = 'hidden';
    return b;
  }
}
function renderDots() {
  $('#pinDots').innerHTML = [0,1,2,3]
    .map(i => `<div class="pin-dot${i < pinBuf.length ? ' on' : ''}"></div>`).join('');
}
function press(n) {
  if (pinBuf.length >= 4) return;
  pinBuf += n; renderDots();
  if (pinBuf.length === 4) setTimeout(submitPin, 160);
}
function submitPin() {
  if (!Store.d.pin) {
    Store.d.pin = pinBuf; Store.save(); pinBuf = ''; unlock();
  } else if (pinBuf === Store.d.pin) {
    pinBuf = ''; unlock();
  } else {
    const l = $('#lock'); l.classList.add('shake');
    setTimeout(() => { l.classList.remove('shake'); pinBuf = ''; renderDots(); }, 420);
  }
}
function unlock() {
  $('#lock').style.display = 'none';
  $('#app').classList.add('on');
  renderAll();
}
function lock() {
  $('#lock').style.display = 'grid';
  $('#app').classList.remove('on');
  pinBuf = ''; renderLock();
}

/* ══════════════════ SHELL ══════════════════ */
function buildNav() {
  $('#tabbar').innerHTML = NAV.map(n =>
    `<button class="tab${n.id === VIEW ? ' on' : ''}" data-go="${n.id}">${ICONS[n.id]}<span>${n.label}</span></button>`).join('');
  $('#snav').innerHTML = NAV.map(n =>
    `<button class="${n.id === VIEW ? 'on' : ''}" data-go="${n.id}">${ICONS[n.id]}<span>${n.label}</span></button>`).join('');
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}
function go(id) {
  VIEW = id;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + id));
  $$('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === id));
  window.scrollTo({ top: 0, behavior: 'instant' });
  render(id);
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._x); t._x = setTimeout(() => t.classList.remove('on'), 2200);
}
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  Store.d.theme = th; Store.save();
}

/* ══════════════════ RENDER ══════════════════ */
function renderAll() {
  buildNav();
  ['today','year','weeks','career','more'].forEach(render);
  const cw = currentWeek();
  $('#topWeek').textContent = isBeforeStart() ? 'до старта' : 'W' + cw;
  const t = Store.totals();
  $('#sideProgress').innerHTML =
    `<div class="row" style="justify-content:space-between"><span>Прогресс года</span><b>${t.pct}%</b></div>
     <div class="bar mt" style="height:6px"><i style="width:${t.pct}%"></i></div>
     <div class="tiny dim mt">${t.hoursFact} из ${t.hoursPlan} ч · ${t.closed}/52 недель</div>`;
}
function render(id) {
  ({ today: rToday, year: rYear, weeks: rWeeks, career: rCareer, more: rMore })[id]();
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

  h += `<div class="section-h"><h2>${greeting()}</h2></div>`;

  if (isBeforeStart()) {
    h += card(`<div class="row" style="gap:14px">
      <div style="font-size:30px">🚀</div>
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
        <div class="box">✓</div>
        <div class="body"><b>${b.name}</b><p>${esc(b.desc)}</p></div>
        <div class="min">${m}м</div></div>`;
    }).join('')}</div>
    ${sess ? `<p class="tiny mt" style="color:var(--warn)">🔴 Неделя сессии. Универ приоритетнее — это заложено в план, а не провал.</p>` : ''}
  </div>`;

  /* таймер */
  h += `<div class="card">
    <div class="card-t"><h3>Таймер</h3><span class="tiny dim">Запусти блок и не трогай телефон</span></div>
    <div class="timer"><div class="tt" id="tDisp">00:00</div><div class="tl" id="tLbl">выбери блок</div></div>
    <div class="row wrap mt" style="justify-content:center">
      ${blocks.map(b => `<button class="btn sm" data-timer="${(b.id === 'lab' && sess) ? 35 : b.min}" data-tname="${esc(b.name)}">${b.name} · ${(b.id === 'lab' && sess) ? 35 : b.min}м</button>`).join('')}
    </div>
    <div class="row mt" style="justify-content:center">
      <button class="btn sm ghost" id="tStop">Стоп</button>
    </div>
  </div>`;

  /* текущая неделя */
  h += `<div class="section-h"><h2>Неделя W${cw}</h2><span class="pill q${w.q}">${QUARTERS[w.q].code}</span></div>`;
  h += weekCard(w, true);

  /* streak и цифры */
  h += `<div class="section-h"><h2>Пульс</h2></div>
  <div class="grid g3">
    ${stat(t.streak, 'streak, дней')}
    ${stat(t.closed + '/52', 'недель закрыто')}
    ${stat(t.pct + '%', 'года пройдено')}
  </div>`;

  if (t.streak >= 3) h += `<p class="tiny dim mt center">🔥 ${t.streak} ${plural(t.streak, 'будний день', 'будних дня', 'будних дней')} подряд. Главное правило — не пропустить 3 дня подряд.</p>`;

  /* правило дня */
  const rule = RULES[dayOfYear() % RULES.length];
  h += `<div class="card mt2" style="border-color:color-mix(in srgb, var(--accent) 30%, transparent)">
    <div class="tiny" style="color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Правило дня</div>
    <h3 style="margin:5px 0 4px">${esc(rule.name)}</h3>
    <p class="muted sm" style="margin:0">${esc(rule.text)}</p>
  </div>`;

  $('#v-today').innerHTML = h;

  $$('[data-block]').forEach(el => el.onclick = () => {
    Store.toggleBlock(today, el.dataset.block);
    rToday(); renderAll();
  });
  $$('[data-timer]').forEach(b => b.onclick = () => startTimer(+b.dataset.timer, b.dataset.tname));
  $('#tStop').onclick = stopTimer;
  bindWeekCard($('#v-today'));
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

/* таймер */
function startTimer(min, name) {
  stopTimer();
  let left = min * 60;
  $('#tLbl').textContent = name;
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    const el = $('#tDisp'); if (!el) { stopTimer(); return; }
    el.textContent = m + ':' + s;
    if (left <= 0) {
      stopTimer();
      el.textContent = '00:00';
      $('#tLbl').textContent = 'готово ✓';
      toast(name + ' — блок закончен');
      try { navigator.vibrate && navigator.vibrate([200, 90, 200]); } catch (e) {}
      return;
    }
    left--;
  };
  tick();
  TIMER = setInterval(tick, 1000);
}
function stopTimer() { if (TIMER) { clearInterval(TIMER); TIMER = null; } }

/* ─────────── ГОД ─────────── */
function rYear() {
  const t = Store.totals();
  const R = 74, C = 2 * Math.PI * R;
  let h = '';

  h += `<div class="section-h"><h2>Дашборд года</h2><span class="tiny dim">${fmtRU(META.start)} → ${fmtRU(META.end)}</span></div>`;

  h += `<div class="card center">
    <div class="ring-wrap">
      <svg class="ring" width="176" height="176" viewBox="0 0 176 176">
        <circle class="track" cx="88" cy="88" r="${R}" stroke-width="12"/>
        <circle class="fill"  cx="88" cy="88" r="${R}" stroke-width="12"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - t.pct / 100)}"/>
      </svg>
      <div class="ring-txt"><b>${t.pct}%</b><span class="tiny dim">пройдено</span></div>
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

  h += `<div class="section-h"><h2>Кварталы</h2></div>`;
  [1,2,3,4].forEach(q => {
    const Q = QUARTERS[q], s = Store.quarterTotals(q);
    h += `<div class="card wk q${q}">
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

  h += `<div class="section-h"><h2>Контрольные точки</h2><span class="tiny dim">заполняй факт</span></div>`;
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

  h += `<div class="section-h"><h2>Если отстаёшь</h2></div><div class="card">
    <table class="t"><tbody>${LAG_PROTOCOL.map(l =>
      `<tr><td style="width:132px"><b>${esc(l.lag)}</b></td><td class="muted">${esc(l.action)}</td></tr>`).join('')}</tbody></table></div>`;

  h += `<div class="section-h"><h2>Красные флаги</h2></div><div class="card">
    <p class="sm muted">Два и более признака дольше 2 недель — снижай нагрузку до session mode и восстанавливайся.</p>
    ${RED_FLAGS.map(f => `<div class="sm" style="padding:5px 0;border-bottom:1px solid var(--border)">· ${esc(f)}</div>`).join('')}
    <p class="tiny dim mt" style="margin-bottom:0">Год — это долго. План на 75% за 52 недели кратно лучше плана на 120% за 14 недель и брошенного.</p></div>`;

  $('#v-year').innerHTML = h;
  $$('[data-ms]').forEach(i => i.onchange = () => {
    Store.setMetric(+i.dataset.ms, i.dataset.mk, i.value); toast('Сохранено');
  });
}

/* ─────────── НЕДЕЛИ ─────────── */
function rWeeks() {
  const cw = currentWeek();
  let h = `<div class="section-h"><h2>52 недели</h2><span class="tiny dim">W${cw} сейчас</span></div>`;

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

  h += list.length ? list.map(w => weekCard(w, w.w === cw)).join('')
                   : `<div class="empty"><div class="ic">🗂</div>Ничего не найдено</div>`;

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

  return `<div class="card wk q${w.q}${isNow ? ' now' : ''}${isNow ? ' open' : ''}" data-wk="${w.w}">
    <div class="wk-h" data-toggle>
      <div class="wk-n">W${w.w}</div>
      <div class="wk-body">
        <h3>${esc(w.topic)}</h3>
        <div class="tiny dim">${fmtShort(w.start)} – ${fmtShort(w.end)} · ${w.hours} ч</div>
        <div class="wk-meta">
          <span class="pill ${stCls}">${esc(s.status)}</span>
          ${all ? `<span class="pill">${done}/${all} задач</span>` : ''}
          ${sess ? `<span class="pill danger">SESSION MODE</span>` : ''}
          ${exam ? `<span class="pill warn">${esc(exam)}</span>` : ''}
          ${isNow ? `<span class="pill accent">сейчас</span>` : ''}
        </div>
        ${all ? `<div class="bar mt" style="height:5px"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="wk-x">›</div>
    </div>

    <div class="wk-detail">
      <div class="tiny dim" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Задачи недели</div>
      ${w.tasks.map((tk, i) => `<div class="task${(s.tasks || []).includes(i) ? ' on' : ''}" data-task="${i}">
        <div class="box">✓</div><span>${esc(tk)}</span></div>`).join('')}

      <div class="deliv"><b>Deliverable — без него неделя не закрыта</b>${esc(w.deliverable)}</div>

      <div class="grid g2 mt">
        <label class="fld"><span>Часы факт (план ${w.hours})</span>
          <input type="number" step="0.1" min="0" value="${s.hours ?? ''}" data-f-hours="${w.w}" placeholder="0"></label>
        <label class="fld"><span>Статус</span>
          <select data-f-status="${w.w}">${['Не начата','В работе','Закрыта','Частично','Перенесена']
            .map(o => `<option${o === s.status ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
      </div>
      <label class="fld"><span>Оценка недели</span>
        <select data-f-rating="${w.w}"><option value="">—</option>${[1,2,3,4,5]
          .map(o => `<option${String(o) === String(s.rating) ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="fld"><span>Блокеры и заметки</span>
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
    Store.toggleTask(n, +el.dataset.task);
    el.classList.toggle('on');
    const card = el.closest('[data-wk]');
    const w = WEEKS[n - 1], s = Store.week(n);
    const bar = $('.bar > i', card);
    if (bar) bar.style.width = Math.round(s.tasks.length / w.tasks.length * 100) + '%';
    const pill = $$('.pill', card).find(p => /\d+\/\d+ задач/.test(p.textContent));
    if (pill) pill.textContent = `${s.tasks.length}/${w.tasks.length} задач`;
  });
  $$('[data-f-hours]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-hours'), { hours: i.value === '' ? null : Number(i.value) });
    toast('Сохранено'); renderAll();
  });
  $$('[data-f-status]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-status'), { status: i.value });
    toast('Сохранено'); renderAll();
  });
  $$('[data-f-rating]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-rating'), { rating: i.value || null });
    toast('Сохранено');
  });
  $$('[data-f-notes]', root).forEach(i => i.onchange = () => {
    Store.setWeek(+i.getAttribute('data-f-notes'), { notes: i.value });
    toast('Сохранено');
  });
}

/* ─────────── КАРЬЕРА ─────────── */
function rCareer() {
  const t = Store.totals();
  let h = `<div class="section-h"><h2>Портфолио</h2><span class="pill ${t.repos === 8 ? 'ok' : ''}">${t.repos}/8</span></div>`;

  PORTFOLIO.forEach(r => {
    const s = Store.repo(r.id);
    const wk = WEEKS[r.week - 1];
    h += `<div class="card wk q${wk.q}">
      <div class="card-t">
        <div><h3 class="mono" style="font-size:14.5px">${esc(r.name)}</h3>
        <div class="tiny dim">создаётся в W${r.week} · ${esc(r.why)}</div></div>
        <span class="pill ${s.published ? 'ok' : ''}">${s.published ? 'готов' : 'W' + r.week}</span>
      </div>
      <p class="sm muted" style="margin:0 0 10px">${esc(r.inside)}</p>
      <div class="row wrap" style="gap:7px">
        ${[['readme','README (EN)'],['screens','3+ скриншота'],['published','Опубликован']]
          .map(([k, l]) => `<button class="fbtn${s[k] ? ' on' : ''}" data-repo="${r.id}" data-rk="${k}">${s[k] ? '✓ ' : ''}${l}</button>`).join('')}
      </div>
      <label class="fld mt"><span>Ссылка на репозиторий</span>
        <input type="url" value="${esc(s.url)}" data-repo-url="${r.id}" placeholder="https://github.com/..."></label>
    </div>`;
  });

  h += `<div class="card"><h3>Требования к каждому репозиторию</h3>
    ${PORTFOLIO_RULES.need.map(x => `<div class="sm" style="padding:4px 0">✓ ${esc(x)}</div>`).join('')}
    <h3 class="mt2" style="color:var(--danger)">Что НЕ класть</h3>
    ${PORTFOLIO_RULES.avoid.map(x => `<div class="sm" style="padding:4px 0">✕ ${esc(x)}</div>`).join('')}</div>`;

  /* отклики */
  h += `<div class="section-h"><h2>Отклики</h2><span class="pill ${t.apps >= 60 ? 'ok' : ''}">${t.apps}/60</span></div>`;
  h += `<div class="card">
    <div class="grid g3">
      ${stat(t.apps, 'откликов')}
      ${stat(t.interviews, 'интервью')}
      ${stat(t.apps ? Math.round(t.interviews / t.apps * 100) + '%' : '—', 'конверсия')}
    </div>
    <div class="bar mt"><i style="width:${Math.min(100, Math.round(t.apps / 60 * 100))}%"></i></div>
    <p class="tiny dim mt" style="margin-bottom:0">Волна №1 — 30 откликов в W49. Волна №2 — 30 в W51, половина холодными письмами.</p>
    <button class="btn primary mt" id="addApp" style="width:100%">+ Добавить отклик</button>
  </div>`;

  h += `<div id="appList">${renderApps()}</div>`;

  /* рынок / CV / письмо */
  h += `<div class="section-h"><h2>Карта рынка</h2></div>`;
  MARKET.forEach(m => {
    const p = m.real === 'high' ? 'ok' : m.real === 'mid' ? 'warn' : 'danger';
    const lbl = m.real === 'high' ? 'реалистично' : m.real === 'mid' ? 'средне' : 'сложно';
    h += `<div class="card"><div class="card-t"><h3>${esc(m.dir)}</h3><span class="pill ${p}">${lbl}</span></div>
      <p class="sm muted" style="margin:0">${esc(m.text)}</p></div>`;
  });

  h += `<div class="section-h"><h2>Ожидания по W52</h2></div><div class="card"><table class="t"><tbody>
    ${OUTCOMES.map(o => `<tr><td><b>${esc(o.s)}</b><div class="tiny dim">${esc(o.text)}</div></td>
      <td style="width:66px;text-align:right"><span class="pill">${o.p}</span></td></tr>`).join('')}
    </tbody></table>
    <p class="tiny dim mt" style="margin-bottom:0">Не строй план вокруг «оффер или провал». Строй вокруг «к W52 у меня есть портфолио, которого нет у 95% выпускников».</p></div>`;

  h += `<div class="section-h"><h2>Резюме</h2></div>
    <details class="acc"><summary><span>Структура CV — 1 страница</span></summary>
      <div><pre class="code">${esc(CV_TEXT)}</pre>
      <div class="mt">${CV_RULES.map(r => `<div class="sm" style="padding:4px 0">· ${esc(r)}</div>`).join('')}</div>
      <button class="btn sm mt" data-copy="cv">Скопировать шаблон</button></div></details>
    <details class="acc"><summary><span>Холодное письмо</span></summary>
      <div><pre class="code">${esc(COLD_EMAIL)}</pre>
      <p class="tiny dim mt">Работает за счёт конкретики вместо «хочу развиваться», честного признания отсутствия вакансии и упоминания готовности к ночным сменам — там дыра в укомплектованности любого SOC.</p>
      <button class="btn sm" data-copy="mail">Скопировать письмо</button></div></details>`;

  $('#v-career').innerHTML = h;

  $$('[data-repo]').forEach(b => b.onclick = () => {
    const id = +b.dataset.repo, k = b.dataset.rk;
    Store.setRepo(id, { [k]: Store.repo(id)[k] ? 0 : 1 });
    rCareer(); renderAll();
  });
  $$('[data-repo-url]').forEach(i => i.onchange = () => {
    Store.setRepo(+i.dataset.repoUrl, { url: i.value }); toast('Сохранено');
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
  if (!list.length) return `<div class="empty"><div class="ic">📮</div>Пока пусто. Первая волна — W49.</div>`;
  return list.slice().reverse().map(a => `<div class="app-item">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div style="min-width:0"><b>${esc(a.company || '—')}</b>
        <div class="tiny dim">${esc(a.role || '')} ${a.cat ? '· ' + esc(a.cat) : ''}</div></div>
      <button class="btn sm danger" data-delapp="${a.id}">✕</button>
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
    Store.updApp(+s.dataset.appst, { status: s.value }); toast('Сохранено'); rCareer();
  });
}
function addAppPrompt() {
  const company = prompt('Компания:'); if (!company) return;
  const role = prompt('Позиция:', 'Junior SOC Analyst') || '';
  const cat = prompt('Категория:\n' + APP_CATEGORIES.join(' / '), APP_CATEGORIES[0]) || APP_CATEGORIES[0];
  const note = prompt('Заметка (необязательно):') || '';
  Store.addApp({ company, role, cat, note, status: 'Отправлен' });
  rCareer(); renderAll(); toast('Отклик добавлен');
}

/* ─────────── ЕЩЁ ─────────── */
function rMore() {
  let h = `<div class="section-h"><h2>Ежедневный блюпринт</h2></div>
  <div class="card"><table class="t"><thead><tr><th>Блок</th><th style="width:52px">Мин</th></tr></thead><tbody>
    ${DAILY.map(b => `<tr><td><b>${b.name}</b><div class="tiny dim">${esc(b.desc)}</div></td>
      <td class="mono">${b.min}</td></tr>`).join('')}
    <tr><td><b>Итого технических</b></td><td class="mono"><b>155</b></td></tr>
  </tbody></table>
  <h3 class="mt2">Вариации</h3>
  <table class="t"><tbody>${DAY_VARIANTS.map(v =>
    `<tr><td><b>${esc(v.name)}</b><div class="tiny dim">${esc(v.when)}</div></td>
     <td class="mono tiny" style="width:100px">${v.blocks}</td></tr>`).join('')}</tbody></table></div>`;

  h += `<div class="section-h"><h2>Как читать документацию на A1</h2></div><div class="card">
    ${READING_METHOD.map(m => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <b>Проход ${m.n} — ${esc(m.name)} <span class="dim tiny">(${m.min} мин)</span></b>
      <p class="sm muted" style="margin:3px 0 0">${esc(m.text)}</p></div>`).join('')}
    <p class="tiny dim mt" style="margin-bottom:0">Никогда не переводи документ целиком — это иллюзия работы.</p></div>`;

  h += `<div class="section-h"><h2>Языки</h2></div>`;
  LANGS.forEach(l => {
    const s = Store.lang(l.q);
    h += `<div class="card wk q${l.q}">
      <div class="card-t"><h3>${QUARTERS[l.q].code} · English → ${l.target}</h3><span class="pill q${l.q}">${QUARTERS[l.q].range}</span></div>
      <p class="sm muted" style="margin:0 0 8px">${esc(l.en)}</p>
      <p class="tiny dim" style="margin:0 0 10px">🇵🇱 ${esc(l.pl)}</p>
      <div class="grid g2">
        <label class="fld" style="margin:0"><span>EF SET факт</span>
          <input type="text" value="${esc(s.efset)}" data-lang="${l.q}" data-lk="efset" placeholder="${l.target}"></label>
        <label class="fld" style="margin:0"><span>Anki EN (цель ${l.anki})</span>
          <input type="text" value="${esc(s.anki)}" data-lang="${l.q}" data-lk="anki" placeholder="${l.anki}"></label>
      </div></div>`;
  });

  h += `<div class="section-h"><h2>Ресурсы</h2></div>`;
  [1,2,3,4].forEach(q => {
    h += `<details class="acc"><summary><span>${QUARTERS[q].code} · ${QUARTERS[q].name}</span><span class="pill q${q}">${RESOURCES.filter(r => r.q === q).length}</span></summary><div>
      ${RESOURCES.filter(r => r.q === q).map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b></a>
        <span class="pill" style="margin-left:6px">${esc(r.price)}</span>
        <div class="tiny muted" style="margin-top:2px">${esc(r.what)}</div></div>`).join('')}
    </div></details>`;
  });

  h += `<div class="section-h"><h2>Железо и лаборатория</h2></div>`;
  HARDWARE.forEach(hw => {
    h += `<div class="card"><div class="card-t"><h3>${esc(hw.name)}</h3>
      <span class="pill ${hw.ok ? 'ok' : 'danger'}">${hw.role}</span></div>
      <p class="sm muted">${esc(hw.text)}</p>
      <p class="tiny dim" style="margin:0"><b>Роль:</b> ${esc(hw.use)}</p></div>`;
  });
  h += `<details class="acc"><summary><span>Установка стека на MacBook (W1)</span></summary>
    <div><pre class="code">${esc(SETUP_CMD)}</pre></div></details>`;

  h += `<div class="section-h"><h2>Справочник</h2></div>`;
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
    <button class="btn sm mt" data-copy2="ir">Скопировать</button></div></details>`;
  h += `<details class="acc"><summary><span>Фильтр для сторонних курсов</span></summary><div>
    <p class="sm muted">Курс не «дополняет» план, а ЗАМЕНЯЕТ конкретную неделю. 631 час распределён полностью.</p>
    ${COURSE_FILTER.map((c, i) => `<div class="sm" style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${i + 1}.</b> ${esc(c)}</div>`).join('')}
  </div></details>`;

  h += `<div class="section-h"><h2>Бюджет</h2></div><div class="card">
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
    <p class="tiny mt" style="color:var(--warn)">${esc(BUDGET.note)}</p></div></details>`;

  h += `<div class="section-h"><h2>Все правила</h2></div><div class="card">
    ${RULES.map(r => `<div style="padding:9px 0;border-bottom:1px solid var(--border)">
      <b>${esc(r.name)}</b><p class="sm muted" style="margin:2px 0 0">${esc(r.text)}</p></div>`).join('')}</div>`;

  h += `<div class="section-h"><h2>Данные</h2></div><div class="card">
    <p class="sm muted">Весь прогресс хранится только в этом браузере (localStorage). Никуда не отправляется, но и не синхронизируется между устройствами. <b>Делай бэкап раз в месяц</b> — очистка данных сайта сотрёт всё.</p>
    <div class="row wrap mt">
      <button class="btn primary" id="expBtn">Скачать бэкап</button>
      <button class="btn" id="impBtn">Загрузить бэкап</button>
      <button class="btn" id="pinBtn">Сменить PIN</button>
      <button class="btn danger" id="resetBtn">Сбросить всё</button>
    </div>
    <input type="file" id="impFile" accept="application/json" style="display:none">
    <p class="tiny dim mt" style="margin-bottom:0">Синхронизация Mac ↔ iPhone: скачай бэкап на Mac → отправь себе в Telegram → загрузи на телефоне.</p>
  </div>`;

  h += `<p class="tiny dim center mt2">SOC Roadmap 365 · старт ${fmtRU(META.start)} · финиш ${fmtRU(META.end)}<br>
    631 технический час · 52 недели · 224 задачи</p>`;

  $('#v-more').innerHTML = h;

  $$('[data-lang]').forEach(i => i.onchange = () => {
    Store.setLang(+i.dataset.lang, i.dataset.lk, i.value); toast('Сохранено');
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
  $('#pinBtn').onclick = () => {
    const p = prompt('Новый PIN (4 цифры):');
    if (p && /^\d{4}$/.test(p)) { Store.d.pin = p; Store.save(); toast('PIN изменён'); }
    else if (p !== null) alert('Нужно ровно 4 цифры');
  };
  $('#resetBtn').onclick = () => {
    if (confirm('Стереть ВЕСЬ прогресс? Отменить будет нельзя.\n\nСначала лучше скачать бэкап.')) {
      Store.reset(); location.reload();
    }
  };
}

function stat(v, l) { return `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`; }
function card(inner) { return `<div class="card">${inner}</div>`; }

/* ══════════════════ INIT ══════════════════ */
Store.load();
document.documentElement.dataset.theme = Store.d.theme || 'dark';
renderLock();
$('#themeBtn').onclick = () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
};
$('#lockBtn').onclick = lock;
document.addEventListener('keydown', e => {
  if ($('#lock').style.display === 'none') return;
  if (/^\d$/.test(e.key)) press(e.key);
  if (e.key === 'Backspace') { pinBuf = pinBuf.slice(0, -1); renderDots(); }
});
