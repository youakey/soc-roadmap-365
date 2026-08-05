/* ============================================================
   sound.js — звуковой слой в духе киберпанка (§12.5)

   Файлов нет, всё синтезируется на месте. Решение не про экономию
   веса: высота звука обязана зависеть от данных. Писк, который
   поднимается на последних десяти секундах блока, тон подтверждения,
   растущий вместе с долей закрытого дня, и озвученное наведение
   на клетку календаря, чья высота равна минутам того дня, — это
   сигналы, а не украшение. Сэмплами так не сделать, не набрав
   полсотни файлов, каждый со своей лицензией и своим ?v=N.

   ── ЧТО ИЗМЕНИЛОСЬ 05.08.2026 ────────────────────────────────

   Первая редакция §12.5 держала ЗАКРЫТЫЙ список из пяти поводов
   и правило «всё остальное молчит». Список отменён по решению
   владельца: интерфейс озвучивается широко. Взамен закрытого
   списка введена иерархия — см. LEVEL ниже. Это не смягчение
   правила, а его замена: старое правило («порог для звука выше,
   чем для анимации») больше не действует, и притворяться, что
   оно живо, было бы враньём в комментарии.

   Что осталось нетронутым, потому что это физика, а не вкус:

   1. КОНТЕКСТ НЕ СОЗДАЁТСЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ. iOS Safari
      выдаёт AudioContext в состоянии suspended, и resume() обязан
      быть вызван синхронно внутри обработчика реального нажатия.
      Единственная точка создания — arm(), и зовётся она из жеста.

   2. ОДИН КОНТЕКСТ НА СТРАНИЦУ, и одна цепочка эффектов на него.

   3. ИСТОЧНИК ЗВУКА — СОБЫТИЕ, А НЕ ПЕРЕРИСОВКА. Ни одна функция
      отсюда не зовётся из render()/renderAll().

   4. prefers-reduced-motion ЗВУК НЕ ВЫКЛЮЧАЕТ: разные оси.

   5. ФОНОВАЯ ВКЛАДКА ДУШИТСЯ — ограничение платформы, чинить
      setInterval-ом нельзя (§9).

   ── ИЕРАРХИЯ ГРОМКОСТИ ───────────────────────────────────────

   Закрытый список решал ровно одну задачу: не дать интерфейсу
   тараторить. Убрав список, задачу надо решать иначе, иначе
   получится игрушка, которую выключат в первый же вечер.

   · LEVEL.MARK — вехи. Блок доигран, неделя закрыта, достижение,
     вход. Слышно всегда, когда звук включён. Громко и с эхом.
   · LEVEL.ACT — действия. Галочка, таймер, заморозка, экспорт,
     DRILL, удаление, ошибка. Слышно всегда. Средне и коротко.
   · LEVEL.UI — мелочь. Вкладки, кнопки, поля, раскрытие карточек,
     наведение. Отдельный тумблер `UI` в настройках: именно эту
     россыпь человек захочет выключить первой, оставив вехи.
     Тихо, коротко, с жёстким ограничителем частоты.

   ── ЧЕГО НЕ ОЗВУЧЕНО И ПОЧЕМУ ────────────────────────────────

   Прокрутка и `mousemove` молчат. Это не осторожность и не
   недоделка: оба события идут десятками в секунду и сливаются
   в дрон, который не несёт ни одного бита смысла. Ограничитель
   превратил бы дрон в дребезг — хуже, чем тишина. Наведение
   озвучено там, где оно дискретно (клетка календаря, пункт меню,
   карточка), и молчит на плотных сетках, где указатель проходит
   двадцать узлов за взмах.
   ============================================================ */

'use strict';

/* Уровни. Строки, а не числа: в логе и в тесте читаемо. */
const SND = { MARK: 'mark', ACT: 'act', UI: 'ui' };

const Sound = {
  ctx: null,
  bus: null,          // общий регулятор громкости, единственная точка VOL
  wet: null,          // вход в эхо
  out: null,          // куда включаются голоса
  shape: null,        // мягкий шейпер: грязь, а не дисторшн
  _budget: 0,
  _budgetAt: 0,
  _last: null,        // { имя: время } для ограничителя частоты

  /* ── состояние ─────────────────────────────────────────── */

  supported() { return !!(window.AudioContext || window.webkitAudioContext); },
  on() { return Store.soundOn(); },
  uiOn() { return Store.soundOn() && Store.soundUi(); },

  /* ── создание и разблокировка ─────────────────────────────
     arm() безопасно звать сколько угодно раз: пока контекст жив
     и играет, она выходит первой же строкой. Висит на каждом
     нажатии в документе — единственный способ поймать настоящий
     жест на iOS, не разбирая, какая именно кнопка нажата. */
  arm() {
    if (!Store.soundOn()) return null;
    const ctx = this._ctx();
    if (!ctx) return null;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* дальше молчим */ } }
    return ctx;
  },

  _ctx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); }
    catch (e) { console.warn('audio', e); return null; }
    this._chain();
    return this.ctx;
  },

  /* ── тракт ─────────────────────────────────────────────────
     Собирается один раз на страницу, вместе с контекстом.

     голоса → out ─┬─→ shape → bus → колонки
                   └─→ wet → delay ⇄ feedback → shape

     Эхо здесь и есть весь «киберпанк»: одиночный писк звучит как
     писк, а тот же писк с коротким затухающим отражением — как
     писк в бетонной серверной. Стоит это одного DelayNode на
     страницу, а не отдельной обработки на каждый голос.

     Шейпер мягкий намеренно. Задача — подмешать нечётные гармоники
     и убрать стерильность синуса, а не расплавить сигнал: звук
     слушают по часу в день. */
  _chain() {
    const ctx = this.ctx;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);

    this.shape = ctx.createWaveShaper();
    this.shape.curve = this._curve(0.28);
    this.shape.oversample = '2x';
    this.shape.connect(this.bus);

    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(this.shape);

    /* Слэп-эхо: 118 мс — короче внятного повтора и длиннее гребёнки.
       Обратная связь 0.3 даёт три-четыре различимых отражения
       и затухает раньше, чем успевает надоесть. */
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.118;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    /* Срез в петле: без него отражения звенят всё ярче и
       превращаются в свист. */
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;

    this.wet = ctx.createGain();
    this.wet.gain.value = 0.34;

    this.out.connect(this.wet);
    this.wet.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.shape);
  },

  /** Кривая мягкого насыщения. k = 0 — прямая, k → 1 — жёстко. */
  _curve(k) {
    const n = 1024, c = new Float32Array(n);
    const a = k * 12;
    for (let i = 0; i < n; i++) {
      const x = i * 2 / n - 1;
      c[i] = (1 + a) * x / (1 + a * Math.abs(x));
    }
    return c;
  },

  /** Готов ли контекст принять расписание прямо сейчас.
   *
   *  Строже arm() намеренно: на suspended-контексте currentTime
   *  не идёт, и всё запланированное прозвучит скопом в момент
   *  разблокировки. Лучше потерять один сигнал, чем однажды
   *  выстрелить очередью.
   *
   *  `lvl` — уровень из SND. UI-уровень дополнительно закрыт
   *  своим тумблером: это единственное место, где он проверяется,
   *  чтобы правило не размазалось по двадцати вызовам. */
  _live(lvl) {
    if (!Store.soundOn()) return null;
    if (lvl === SND.UI && !Store.soundUi()) return null;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    return ctx;
  },

  /** Громкость. Ухо ближе к квадрату, отсюда v*v. Уровень задаёт
   *  свою долю: мелочь интерфейса звучит вдвое тише вех, иначе
   *  нажатие кнопки перекрикивает закрытую неделю. */
  _gain(lvl) {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return 1;
    const v = Store.soundVol();
    this.bus.gain.setTargetAtTime(v * v * 0.5, ctx.currentTime, 0.01);
    if (lvl === SND.UI) return 0.42;
    if (lvl === SND.ACT) return 0.72;
    return 1;
  },

  /** Эхо по уровню: вехи звучат в зале, мелочь — в наушниках.
   *  Без этого интерфейс тонет в собственных отражениях. */
  _wet(x) {
    if (!this.wet || !this.ctx) return;
    this.wet.gain.setTargetAtTime(x, this.ctx.currentTime, 0.005);
  },

  /** Бюджет голосов: не больше 10 за 120 мс. Страховка от того
   *  случая, ради которого писано правило «источник звука —
   *  событие»: если сигнал прорвётся в цикл, он прозвучит десять
   *  раз, а не восемьсот. */
  _afford(n) {
    const now = Date.now();
    if (now - this._budgetAt > 120) { this._budgetAt = now; this._budget = 0; }
    if (this._budget + n > 10) return false;
    this._budget += n;
    return true;
  },

  /** Ограничитель частоты по имени голоса. Нужен ровно тем
   *  голосам, которые вешаются на события, идущие пачками:
   *  наведение, переключение вкладок, нажатия подряд. */
  _rate(name, ms) {
    if (!this._last) this._last = {};
    const now = Date.now();
    const prev = own(this._last, name, 0);
    if (now - prev < ms) return false;
    this._last[name] = now;
    return true;
  },

  /* ── синтез ────────────────────────────────────────────────
     Голос: осциллятор (при желании — пара расстроенных) →
     необязательный резонансный фильтр → экспоненциальная
     огибающая. Огибающая никогда не доходит до нуля:
     exponentialRampToValueAtTime(0) в Web Audio недопустим,
     а обрыв без спада даёт щелчок. */
  _tone(p) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (p.at || 0);
    const dur = p.dur || 0.1;

    const env = ctx.createGain();
    const peak = Math.max(0.0005, (p.g == null ? 0.3 : p.g) * (p.lvlGain == null ? 1 : p.lvlGain));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + (p.a || 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let sink = env;
    if (p.lp) {
      const flt = ctx.createBiquadFilter();
      flt.type = p.hp ? 'highpass' : 'lowpass';
      flt.frequency.setValueAtTime(p.lp, t0);
      if (p.lp2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, p.lp2), t0 + dur);
      flt.Q.value = p.q == null ? 0.9 : p.q;
      flt.connect(env);
      sink = flt;
    }
    env.connect(this.out);

    /* Расстройка. Два осциллятора в паре центов дают биения —
       тот самый «неживой синтезатор», на котором держится
       звучание ретро-терминала. Один осциллятор звучит стерильно. */
    const mk = cents => {
      const osc = ctx.createOscillator();
      osc.type = p.type || 'sine';
      osc.frequency.setValueAtTime(p.f, t0);
      if (p.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f2), t0 + dur);
      if (cents) osc.detune.setValueAtTime(cents, t0);
      osc.connect(sink);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    };
    mk(0);
    if (p.det) { mk(p.det); mk(-p.det); }
  },

  /** Шум через фильтр. Из него собраны щелчки реле, разряды
   *  и «песок» под крупными сигналами. */
  _noise(p) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (p.at || 0);
    const dur = p.dur || 0.05;

    const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const flt = ctx.createBiquadFilter();
    flt.type = p.band === false ? 'lowpass' : 'bandpass';
    flt.frequency.setValueAtTime(p.f || 1800, t0);
    if (p.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, p.f2), t0 + dur);
    flt.Q.value = p.q == null ? 1.6 : p.q;

    const env = ctx.createGain();
    const peak = Math.max(0.0005, (p.g == null ? 0.16 : p.g) * (p.lvlGain == null ? 1 : p.lvlGain));
    env.gain.setValueAtTime(peak, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(flt); flt.connect(env); env.connect(this.out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  },

  /* ══════════════════ УРОВЕНЬ 1: ВЕХИ ══════════════════ */

  /** Блок таймера досижен до конца. Главный случай: человек
   *  смотрит в терминал, а не на вкладку. Восходящая триада,
   *  низкое тело и песок сверху — «задача принята». */
  done() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(5)) return false;
    const G = this._gain(SND.MARK); this._wet(0.4);
    this._tone({ f: 587.33, dur: 0.13, type: 'triangle', g: 0.30, lp: 2600, det: 6, lvlGain: G });
    this._tone({ f: 880.00, dur: 0.13, type: 'triangle', g: 0.28, lp: 3200, det: 6, at: 0.085, lvlGain: G });
    this._tone({ f: 1174.66, dur: 0.36, type: 'triangle', g: 0.26, lp: 4200, det: 8, at: 0.17, lvlGain: G });
    this._tone({ f: 146.83, dur: 0.44, type: 'sine', g: 0.24, lvlGain: G });
    this._noise({ f: 5200, f2: 1400, dur: 0.22, g: 0.05, q: 0.7, lvlGain: G });
    return true;
  },

  /** Последние десять секунд. Высота растёт по мере убывания
   *  остатка — тот самый случай, ради которого выбран синтез.
   *  Отсечку повтора держит вызывающий: tPaint() крутится
   *  дважды в секунду. */
  tick(left) {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.MARK); this._wet(0.16);
    const step = Math.min(9, Math.max(0, 10 - left));
    this._tone({ f: 900 + step * 62, dur: 0.045, type: 'square', g: 0.11, lp: 2400, q: 0.7, lvlGain: G });
    return true;
  },

  /** Неделя закрыта. Крупнее галочки, мельче достижения. */
  week() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(3)) return false;
    const G = this._gain(SND.MARK); this._wet(0.4);
    this._tone({ f: 523.25, dur: 0.11, type: 'triangle', g: 0.26, lp: 3000, det: 5, lvlGain: G });
    this._tone({ f: 783.99, dur: 0.24, type: 'triangle', g: 0.24, lp: 3800, det: 7, at: 0.09, lvlGain: G });
    this._noise({ f: 3200, dur: 0.06, g: 0.05, lvlGain: G });
    return true;
  },

  /** Достижение. Самое крупное событие: свип снизу вверх плюс
   *  триада сверху. Свип слышен как «что-то открылось», а не
   *  «что-то отметилось». */
  ach() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(5)) return false;
    const G = this._gain(SND.MARK); this._wet(0.5);
    this._tone({ f: 220, f2: 1760, dur: 0.42, type: 'sawtooth', g: 0.14, lp: 500, lp2: 4200, q: 3.2, det: 9, lvlGain: G });
    this._tone({ f: 659.25, dur: 0.32, type: 'triangle', g: 0.20, lp: 3600, det: 6, at: 0.30, lvlGain: G });
    this._tone({ f: 987.77, dur: 0.32, type: 'triangle', g: 0.18, lp: 4200, det: 6, at: 0.34, lvlGain: G });
    this._tone({ f: 1318.51, dur: 0.44, type: 'triangle', g: 0.16, lp: 5000, det: 8, at: 0.38, lvlGain: G });
    this._noise({ f: 900, f2: 6000, dur: 0.4, g: 0.05, q: 0.6, lvlGain: G });
    return true;
  },

  /** Вход. Одиночный свип «канал открыт», один раз за сессию.
   *  На восстановленной сессии не прозвучит: жеста не было,
   *  контекста нет. Это требование §12.5, выполненное
   *  конструкцией, а не проверкой. */
  login() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(3)) return false;
    const G = this._gain(SND.MARK); this._wet(0.5);
    this._tone({ f: 160, f2: 1400, dur: 0.5, type: 'sawtooth', g: 0.13, lp: 420, lp2: 3600, q: 4, det: 11, lvlGain: G });
    this._tone({ f: 1174.66, dur: 0.28, type: 'sine', g: 0.16, at: 0.42, lvlGain: G });
    this._noise({ f: 400, f2: 5000, dur: 0.5, g: 0.04, q: 0.5, lvlGain: G });
    return true;
  },

  /** Загрузочная последовательность. Идёт в паре со спецэффектом
   *  §12.6: низкий подъём, три засечки, разряд наверху. Длиннее
   *  всего в палитре и звучит ровно один раз за сессию. */
  boot() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(7)) return false;
    const G = this._gain(SND.MARK); this._wet(0.55);
    this._tone({ f: 55, f2: 220, dur: 1.0, type: 'sawtooth', g: 0.16, lp: 200, lp2: 1800, q: 5, det: 14, lvlGain: G });
    this._noise({ f: 200, f2: 3000, dur: 0.9, g: 0.04, q: 0.4, lvlGain: G });
    [0.22, 0.44, 0.66].forEach((at, i) => {
      this._tone({ f: 660 + i * 220, dur: 0.05, type: 'square', g: 0.10, lp: 2600, at: at, lvlGain: G });
    });
    this._tone({ f: 1318.51, dur: 0.5, type: 'triangle', g: 0.20, lp: 5200, det: 8, at: 0.9, lvlGain: G });
    this._noise({ f: 6000, f2: 900, dur: 0.3, g: 0.07, q: 0.6, at: 0.9, lvlGain: G });
    return true;
  },

  /* ══════════════════ УРОВЕНЬ 2: ДЕЙСТВИЯ ══════════════════ */

  /** Галочка. Высота — по значимости: `weight` это доля дня или
   *  доля задач недели, закрытая вместе с этой галочкой. Пятая
   *  галочка звучит выше первой. */
  ok(weight) {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.ACT); this._wet(0.28);
    const w = Math.min(1, Math.max(0, Number(weight) || 0));
    const f = 620 + w * 400;
    this._tone({ f: f, f2: f * 1.5, dur: 0.09, type: 'triangle', g: 0.22, lp: 3400, det: 4, lvlGain: G });
    return true;
  },

  /** Снятие галочки. Зеркало ok(): вниз и тише. Раньше молчало —
   *  и это читалось как «не сработало». */
  undo() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.ACT); this._wet(0.2);
    this._tone({ f: 520, f2: 360, dur: 0.09, type: 'triangle', g: 0.14, lp: 2200, lvlGain: G });
    return true;
  },

  /** Переворот карточки в тренажёре. Щелчок, а не нота:
   *  переворот — механическое действие, а не результат. */
  flip() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.ACT); this._wet(0.24);
    this._noise({ f: 1900, dur: 0.05, g: 0.13, q: 1.4, lvlGain: G });
    this._tone({ f: 320, dur: 0.06, type: 'square', g: 0.05, lp: 900, lvlGain: G });
    return true;
  },

  /** Оценка в тренажёре. Направление несёт весь смысл: рука
   *  на стрелках, глаза на слове. */
  grade(known) {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.ACT); this._wet(0.26);
    if (known) this._tone({ f: 784, f2: 1318.51, dur: 0.09, type: 'triangle', g: 0.20, lp: 3800, det: 5, lvlGain: G });
    else       this._tone({ f: 440, f2: 311.13, dur: 0.13, type: 'triangle', g: 0.18, lp: 2200, det: 5, lvlGain: G });
    return true;
  },

  /** Таймер. Один голос на пять состояний: `kind` меняет высоту
   *  и направление, а не набор нот. Так пять кнопок звучат
   *  семьёй, а не пятью разными приборами. */
  timer(kind) {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.ACT); this._wet(0.3);
    if (kind === 'start') {
      this._tone({ f: 330, f2: 660, dur: 0.14, type: 'sawtooth', g: 0.16, lp: 700, lp2: 3000, q: 3, det: 7, lvlGain: G });
    } else if (kind === 'pause') {
      this._tone({ f: 440, f2: 300, dur: 0.11, type: 'square', g: 0.11, lp: 1600, lvlGain: G });
    } else if (kind === 'resume') {
      this._tone({ f: 300, f2: 520, dur: 0.11, type: 'square', g: 0.11, lp: 1900, lvlGain: G });
    } else if (kind === 'reset') {
      this._noise({ f: 1200, f2: 300, dur: 0.14, g: 0.10, q: 0.9, lvlGain: G });
    } else {                                   // add — добор минут
      this._tone({ f: 880, f2: 1046.5, dur: 0.07, type: 'triangle', g: 0.13, lp: 3400, lvlGain: G });
    }
    return true;
  },

  /** Заморозка дня. Единственный «холодный» голос палитры:
   *  высокая расстроенная пара с длинным хвостом. Механика редкая
   *  и дорогая — две на квартал (§3.6), звучать она должна
   *  не как остальные кнопки. */
  freeze() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(3)) return false;
    const G = this._gain(SND.ACT); this._wet(0.6);
    this._tone({ f: 1568, dur: 0.5, type: 'sine', g: 0.13, det: 18, lvlGain: G });
    this._tone({ f: 2093, dur: 0.42, type: 'sine', g: 0.09, det: 22, at: 0.06, lvlGain: G });
    this._noise({ f: 7000, dur: 0.3, g: 0.04, q: 0.8, lvlGain: G });
    return true;
  },

  /** Выгрузка данных: экспорт колоды, экспорт резервной копии.
   *  Короткая очередь «пакетов» — единственное место, где
   *  повторяющийся ритм уместен, потому что он и есть смысл. */
  data() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(5)) return false;
    const G = this._gain(SND.ACT); this._wet(0.35);
    for (let i = 0; i < 4; i++) {
      this._tone({ f: 1200 + i * 180, dur: 0.035, type: 'square', g: 0.09, lp: 3000, at: i * 0.045, lvlGain: G });
    }
    this._tone({ f: 220, dur: 0.2, type: 'sine', g: 0.10, at: 0.18, lvlGain: G });
    return true;
  },

  /** Удаление. Падение вниз с песком: действие необратимое,
   *  и звучать оно должно тяжелее прочих. */
  drop() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.ACT); this._wet(0.3);
    this._tone({ f: 300, f2: 90, dur: 0.26, type: 'sawtooth', g: 0.14, lp: 1400, lp2: 300, q: 2, det: 9, lvlGain: G });
    this._noise({ f: 1600, f2: 200, dur: 0.2, g: 0.06, q: 0.7, lvlGain: G });
    return true;
  },

  /** Ошибка. Единственный намеренно неблагозвучный голос:
   *  малая секунда внизу. Ни одна другая пара нот в палитре
   *  так не звучит, поэтому спутать нельзя. */
  err() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(3)) return false;
    const G = this._gain(SND.ACT); this._wet(0.25);
    this._tone({ f: 233.08, dur: 0.26, type: 'sawtooth', g: 0.13, lp: 900, q: 1.4, det: 10, lvlGain: G });
    this._tone({ f: 246.94, dur: 0.26, type: 'sawtooth', g: 0.11, lp: 900, q: 1.4, lvlGain: G });
    this._noise({ f: 300, dur: 0.1, g: 0.06, q: 0.6, lvlGain: G });
    return true;
  },

  /** Состояние обмена с сервером. Три коротких чирпа по смыслу,
   *  ограничитель на секунду: синхронизация может дёргаться. */
  sync(state) {
    if (!this._rate('sync', 900)) return false;
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.ACT); this._wet(0.2);
    if (state === 'err') { this._wet(0.25); return this.err(); }
    if (state === 'busy') this._tone({ f: 1400, dur: 0.03, type: 'square', g: 0.06, lp: 3400, lvlGain: G });
    else this._tone({ f: 1046.5, f2: 1568, dur: 0.07, type: 'triangle', g: 0.09, lp: 4000, lvlGain: G });
    return true;
  },

  /* ══════════════════ УРОВЕНЬ 3: МЕЛОЧЬ ══════════════════
     Всё ниже закрыто отдельным тумблером UI и звучит вдвое тише.
     У каждого голоса свой ограничитель частоты: это единственный
     уровень, где событий бывает пачками. */

  /** Переключение вкладки. Высота зависит от номера вкладки —
   *  восемь разделов дают восемь разных нот, и через неделю
   *  переход «на слух» узнаётся раньше, чем глаз доходит
   *  до заголовка. */
  nav(idx) {
    if (!this._rate('nav', 70)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.UI); this._wet(0.22);
    const n = Math.min(7, Math.max(0, Number(idx) || 0));
    this._tone({ f: 520 + n * 78, dur: 0.055, type: 'triangle', g: 0.16, lp: 3000, det: 4, lvlGain: G });
    this._noise({ f: 2400, dur: 0.025, g: 0.05, q: 2, lvlGain: G });
    return true;
  },

  /** Нажатие кнопки. Самый частый звук интерфейса, поэтому
   *  самый короткий: 28 мс щелчка и всё. */
  press() {
    if (!this._rate('press', 35)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.18);
    this._noise({ f: 2600, dur: 0.028, g: 0.11, q: 1.8, lvlGain: G });
    return true;
  },

  /** Переключатель. Щелчок реле плюс нота: вверх — включили,
   *  вниз — выключили. Состояние слышно, не глядя на кнопку. */
  toggle(on) {
    if (!this._rate('toggle', 60)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.UI); this._wet(0.2);
    this._noise({ f: 1500, dur: 0.03, g: 0.12, q: 2.4, lvlGain: G });
    this._tone({ f: on ? 700 : 470, f2: on ? 940 : 350, dur: 0.06, type: 'square', g: 0.09, lp: 2600, at: 0.012, lvlGain: G });
    return true;
  },

  /** Раскрытие и складывание карточки, аккордеона, месяца
   *  календаря. Короткий свип в сторону движения. */
  open(isOpen) {
    if (!this._rate('open', 60)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.24);
    this._tone({ f: isOpen ? 380 : 760, f2: isOpen ? 760 : 380, dur: 0.09, type: 'triangle', g: 0.12, lp: 2400, lvlGain: G });
    return true;
  },

  /** Поле ввода: не на каждый символ, а на фокус и на сохранение.
   *  Посимвольный звук — ровно тот дребезг, из-за которого
   *  прокрутка и mousemove оставлены немыми. */
  field(saved) {
    if (!this._rate('field', 60)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.18);
    if (saved) this._tone({ f: 880, f2: 1174.66, dur: 0.06, type: 'triangle', g: 0.11, lp: 3400, lvlGain: G });
    else this._noise({ f: 3200, dur: 0.02, g: 0.07, q: 2.6, lvlGain: G });
    return true;
  },

  /** Озвученное наведение. Высота равна значению под указателем:
   *  клетка календаря звучит тем выше, чем больше минут закрыто
   *  в тот день. Проведя рукой по месяцу, месяц можно услышать —
   *  это и есть тот случай, когда синтез делает то, чего сэмплы
   *  не умеют вовсе.
   *
   *  `v` — доля 0…1. Ограничитель 55 мс: указатель проходит
   *  клетку за 20–30 мс, без него получилась бы очередь. */
  hover(v) {
    if (!this._rate('hover', 55)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.3);
    const x = Math.min(1, Math.max(0, Number(v) || 0));
    this._tone({ f: 480 + x * 900, dur: 0.03, type: 'sine', g: 0.07, lp: 4000, lvlGain: G });
    return true;
  },

  /** Отказ: кнопка недоступна, действие запрещено. Тихий тупой
   *  стук — понятно, что нажатие услышано и отклонено. */
  deny() {
    if (!this._rate('deny', 120)) return false;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.1);
    this._tone({ f: 150, dur: 0.07, type: 'square', g: 0.10, lp: 500, lvlGain: G });
    return true;
  },

  /** Глитч-разряд — звуковая половина спецэффекта §12.6.
   *  Зовётся оттуда же, откуда и картинка, чтобы они не разъехались
   *  во времени: разряд, который слышно раньше, чем видно, читается
   *  как поломка. */
  glitch() {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(3)) return false;
    const G = this._gain(SND.ACT); this._wet(0.45);
    this._noise({ f: 800, f2: 5200, dur: 0.11, g: 0.09, q: 0.6, lvlGain: G });
    this._tone({ f: 90, dur: 0.13, type: 'square', g: 0.09, lp: 700, lvlGain: G });
    this._tone({ f: 2400, f2: 700, dur: 0.08, type: 'sawtooth', g: 0.05, lp: 3000, q: 6, at: 0.03, lvlGain: G });
    return true;
  },

  /* ── проба из настроек ─────────────────────────────────────
     Формально не событие интерфейса, а отклик самого органа
     управления — как ползунок громкости в системе. Включатель
     без отклика читается как «звук не работает», а регулятор
     без отклика бесполезен вовсе.

     Отдельный путь ещё и потому, что это единственное место,
     где мы играем сразу после разблокировки: resume() возвращает
     промис, и в тот же тик контекст ещё suspended. Ждать промиса
     здесь безопасно — от жеста нас отделяют миллисекунды. */
  preview(weight) {
    if (!Store.soundOn()) return;
    const ctx = this.arm();
    if (!ctx) return;
    const beep = () => this.ok(weight == null ? 0.5 : weight);
    if (ctx.state === 'running') { beep(); return; }
    try { ctx.resume().then(beep, () => {}); } catch (e) { /* не дали — молчим */ }
  }
};
