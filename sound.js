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

/* ══════════════════ БАНК СЭМПЛОВ (§12.5-quater) ══════════════════
   Владелец принёс десять записей, и §12.5 «синтез вместо файлов»
   этим отменяется в той части, где файлы справляются лучше. Отменена
   она НЕ молча: §12.5 обосновывала синтез вслух, поэтому решение
   записано отдельным разделом, как в §12.5-ter.

   Что синтез удержал за собой и почему это не упрямство:

   · `hover` — высота клетки календаря зависит от закрытых минут.
     Ровно тот довод, которым §12.5 обосновывала синтез, и сэмплом
     он не воспроизводится: растяжение сэмпла меняет тембр вместе
     с высотой, и «услышать месяц рукой» превращается в кашу.
   · `tick` — раз в секунду в последние десять, высота от остатка.
     То же самое, плюс частота: 10 сетевых буферов на 10 секунд.
   · `timer` — пять состояний одним семейством из двух примитивов.

   Файлы грузятся ЛЕНИВО, из `arm()`, то есть на первом настоящем
   жесте и только при включённом звуке: у человека, который звуком
   не пользуется, эти 115 КБ не скачиваются вовсе. Это то же правило,
   что у ленивого `AudioContext` (§12.5-bis), просто применённое
   к байтам.

   CSP НЕ ТРОНУТА, и это не удача, а выбор способа загрузки.
   `media-src` управляет тегами `<audio>`/`<video>`; `fetch()`
   подчиняется `connect-src`, а он уже `'self'`. Поэтому
   `media-src 'none'` остаётся на месте — строка из §12.5-bis про
   «ослаблять политику не за чем» в силе. Заодно `decodeAudioData`
   даёт буфер, который идёт в ТОТ ЖЕ тракт с эхом и шейпером;
   тег `<audio>` играл бы мимо тракта, мимо ограничителя частоты
   и мимо бюджета голосов — то есть мимо всего, чем §12.5-ter
   удерживает интерфейс от превращения в трещотку. */

/** Десять файлов. Имя = имя файла в sfx/ без расширения. */
const SFX_FILES = ['press', 'pulse', 'done', 'week', 'ach', 'login', 'boot', 'open', 'freeze', 'chord'];

/** Общий множитель сэмплов. Файлы выровнены по RMS −17 дБ, синтез
 *  живёт в пиках 0.03…0.30 — этот коэффициент сводит одно к другому,
 *  чтобы лестница уровней осталась ЗА КОДОМ, а не за файлами.
 *  Одно число на весь банк: подстройка громкости отдельного голоса
 *  живёт в `g` его строки ниже. */
const SFX_BASE = 0.45;

/** Голос → сэмпл. `r` — скорость воспроизведения: она же высота,
 *  и она превращает десять файлов в девятнадцать различимых голосов
 *  одной семьи. Семья тут не экономия, а замысел: снятие галочки
 *  обязано звучать роднёй галочки, а отказ — роднёй нажатия.
 *  `g` — подстройка под соседей по уровню, `c` — цена в бюджете. */
const SFX_MAP = {
  /* вехи */
  done:   { f: 'done',   r: 1.00, g: 1.00, c: 5 , w: 0.4},
  week:   { f: 'week',   r: 1.00, g: 1.00, c: 3 , w: 0.4},
  ach:    { f: 'ach',    r: 1.00, g: 1.00, c: 5 , w: 0.5},
  login:  { f: 'login',  r: 1.00, g: 1.00, c: 3 , w: 0.5},
  boot:   { f: 'boot',   r: 1.00, g: 1.00, c: 7 , w: 0.55},
  /* действия */
  ok:     { f: 'chord',  r: 1.00, g: 0.60, c: 1 , w: 0.28},
  undo:   { f: 'press',  r: 0.80, g: 0.80, c: 1 , w: 0.2},
  freeze: { f: 'freeze', r: 1.00, g: 0.85, c: 3 , w: 0.6},
  drop:   { f: 'done',   r: 0.75, g: 0.70, c: 2 , w: 0.24},
  err:    { f: 'done',   r: 0.60, g: 0.80, c: 2 , w: 0.3},
  sync:   { f: 'pulse',  r: 1.60, g: 0.45, c: 1 , w: 0.2},
  data:   { f: 'pulse',  r: 0.90, g: 0.50, c: 5 , w: 0.35},
  glitch: { f: 'chord',  r: 0.70, g: 0.75, c: 3 , w: 0.4},
  /* мелочь интерфейса */
  nav:    { f: 'pulse',  r: 1.00, g: 0.55, c: 1 , w: 0.22},
  press:  { f: 'press',  r: 1.00, g: 0.45, c: 1 , w: 0.18},
  toggle: { f: 'pulse',  r: 1.20, g: 0.50, c: 1 , w: 0.2},
  open:   { f: 'open',   r: 1.00, g: 0.60, c: 2 , w: 0.24},
  field:  { f: 'press',  r: 1.35, g: 0.35, c: 1 , w: 0.18},
  deny:   { f: 'press',  r: 0.55, g: 0.55, c: 1 , w: 0.1}
};

/* Версия ассетов снимается с СОБСТВЕННОГО тега, а не пишется рядом
   числом. Иначе `?v=N` пришлось бы поднимать в трёх местах вместо
   двух, и третье забылось бы первым — ровно та мина, за которую
   §12.1-ter уже платила зашитой дважды тройкой блоков дня. */
const SFX_V = (function () {
  try {
    const s = document.currentScript && document.currentScript.src;
    const q = s ? s.indexOf('?') : -1;
    return q === -1 ? '' : s.slice(q);
  } catch (e) { return ''; }
})();

const Sound = {
  ctx: null,
  bus: null,          // общий регулятор громкости, единственная точка VOL
  wet: null,          // вход в эхо
  out: null,          // куда включаются голоса
  shape: null,        // мягкий шейпер: грязь, а не дисторшн
  _budget: 0,
  _budgetAt: 0,
  _last: null,        // { имя: время } для ограничителя частоты
  _buf: null,         // { имя файла: AudioBuffer } — банк, пока не загружен null
  _bankOn: false,     // загрузка начата
  bankNote: '',       // что не доехало; пусто — всё в порядке
  bankReady: 0,       // сколько файлов доехало

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
    this._bank();
    return ctx;
  },

  /* ── Банк сэмплов ───────────────────────────────────────────
     Зовётся только из arm(), то есть на первом настоящем жесте
     и только при включённом звуке.

     Загрузка НЕ блокирует ничего и НЕ бросает. Пока файл не доехал,
     его голос поёт синтезом — то есть офлайн, медленная сеть
     и битый файл дают не тишину, а прежний звук. Это не запасной
     план, а условие: §10 говорит, что офлайн для этого приложения
     рабочий режим, и трекер не имеет права терять отклик из-за
     недоехавшего украшения. */
  _bank() {
    if (this._bankOn || !this.ctx) return false;
    /* Нет fetch — нет банка, и это не ошибка: голоса поют синтезом.
       Проверка не теоретическая, она про стенд, где страница живёт
       без сети вовсе. */
    if (typeof fetch !== 'function') { this.bankNote = 'fetch недоступен'; return false; }
    this._bankOn = true;
    this._buf = {};
    const ctx = this.ctx;
    const fail = [];
    let done = 0;
    SFX_FILES.forEach(name => {
      fetch('sfx/' + name + '.mp3' + SFX_V)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))
        /* Колбэчная форма decodeAudioData, а не промис: Safari
           обещанную версию поддержал позже прочих, а падать здесь
           нельзя — падение означало бы тишину вместо синтеза. */
        .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))
        .then(buf => { this._buf[name] = buf; this.bankReady++; })
        .catch(e => { fail.push(name + ': ' + (e && e.message ? e.message : e)); })
        .then(() => {
          if (++done !== SFX_FILES.length) return;
          if (!fail.length) return;
          this.bankNote = `не доехало ${fail.length} из ${SFX_FILES.length}: ${fail.join('; ')}`;
          console.warn('sound: ' + this.bankNote + ' — эти голоса поют синтезом');
        });
    });
    return true;
  },

  /** Проиграть сэмпл голоса `name`.
   *
   *  Возвращает `null`, когда банк для этого голоса недоступен, —
   *  и только тогда вызывающий уходит на синтез. Все остальные
   *  случаи возвращают true/false и означают «обработано»:
   *  выключенный звук и исчерпанный бюджет обязаны давать ТИШИНУ,
   *  а не обход через синтез. Иначе бюджет голосов, который и был
   *  написан против очередей (§12.5-bis), обходился бы сам собой. */
  _sfx(name, lvl, rateMul) {
    const m = own(SFX_MAP, name, null);
    if (!m) return null;
    const buf = this._buf ? own(this._buf, m.f, null) : null;
    if (!buf) return null;                       // не доехало — пусть поёт синтез

    const ctx = this._live(lvl);
    if (!ctx) return false;                      // звук выключен — тишина
    if (!this._afford(m.c)) return false;        // бюджет исчерпан — тишина, не обход

    const G = this._gain(lvl);
    /* Эхо выставляется ЗДЕСЬ, а не наследуется. Тракт один на
       страницу, и `_wet` — его общая настройка: без этой строки
       нажатие кнопки сразу после загрузочного свелла играло бы
       с его залом. Ровно тот же класс, что «два правдоподобных
       числа» из §12.1-ter, только на слух. */
    this._wet(m.w == null ? 0.25 : m.w);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, m.r * (rateMul || 1)));
    const amp = ctx.createGain();
    amp.gain.value = G * SFX_BASE * m.g;
    src.connect(amp);
    amp.connect(this.out);
    src.start();
    /* Узлы снимаются по окончании: страница живёт часами, и сотня
       висящих BufferSource — это утечка, которую видно не сразу. */
    src.onended = () => { try { src.disconnect(); amp.disconnect(); } catch (e) { /* уже сняты */ } };
    return true;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('done', SND.MARK); if (_s !== null) return _s;
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
    this._tone({ f: 900 + step * 62, dur: 0.045, type: 'square', g: 0.055, lp: 2400, q: 0.7, lvlGain: G });
    return true;
  },

  /** Неделя закрыта. Крупнее галочки, мельче достижения. */
  week() {
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('week', SND.MARK); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('ach', SND.MARK); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('login', SND.MARK); if (_s !== null) return _s;
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
    /* Единственный голос, где сэмпл и синтез играют ВМЕСТЕ. Причина
       не в красоте: заставка длится полторы секунды и должна давить
       низом, а низа в записи почти нет — она снята в середине
       спектра. Суб синтезируется, потому что бас как раз тот случай,
       где синтез точнее сэмпла: частота задаётся числом, а не
       тем, что оказалось в файле. */
    const _s = this._sfx('boot', SND.MARK);
    if (_s !== null) {
      const c2 = this._live(SND.MARK);
      if (c2 && this._afford(2)) {
        const G2 = this._gain(SND.MARK);
        this._tone({ f: 34, f2: 58, dur: 1.35, type: 'sine', g: 0.42, lvlGain: G2 });
        this._tone({ f: 68, f2: 116, dur: 0.9, type: 'triangle', g: 0.14, lp: 260, lvlGain: G2 });
      }
      return _s;
    }
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

  /** ГУЛ ЗАСТАВКИ. Единственный НЕПРЕРЫВНЫЙ звук в проекте, и это
   *  осознанное исключение из «источник звука — событие»: правило
   *  писано против того, чтобы интерфейс трещал на каждой
   *  перерисовке, а здесь звучит одно состояние — «идёт загрузка».
   *  Оно начинается и кончается ровно один раз за сессию.
   *
   *  Три слоя, и каждый нужен:
   *  · суб 38 Гц с медленным биением — то, что слышно грудью;
   *  · пила 76 Гц через полосовой фильтр, который ездит вверх-вниз, —
   *    «машина работает», а не «нота держится»;
   *  · сонарные пинги раз в 620 мс — то, чем гул перестаёт быть
   *    дроном и становится прибором.
   *
   *  Узлы держатся в `_hum` и снимаются В ОДНОМ месте. Осциллятор,
   *  забытый включённым, — это гул до перезагрузки страницы,
   *  и выключить его человеку будет нечем. */
  _hum: null,

  hum(on) {
    if (!on) {
      const h = this._hum;
      this._hum = null;
      if (!h) return false;
      if (h.ping) clearInterval(h.ping);
      const ctx = this.ctx;
      if (ctx) {
        /* Гасить рампой, а не обрывом: мгновенный обрыв даёт щелчок,
           и он слышен громче самого гула. */
        try {
          h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
          h.o.forEach(o => o.stop(ctx.currentTime + 0.5));
        } catch (e) { /* контекст уже закрыт */ }
      }
      return true;
    }

    if (this._hum) return false;
    const ctx = this._live(SND.MARK); if (!ctx) return false;
    const G = this._gain(SND.MARK); this._wet(0.5);
    const t = ctx.currentTime;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.30 * G), t + 0.7);
    g.connect(this.out);

    const sub = ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 38;
    const sub2 = ctx.createOscillator();
    sub2.type = 'sine'; sub2.frequency.value = 38.7;   // биение 0.7 Гц
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth'; saw.frequency.value = 76;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 5.5;
    bp.frequency.setValueAtTime(220, t);
    /* Полоса ездит сама по себе: без движения фильтра пила звучит
       как гудок трансформатора, а не как работающая машина. */
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.21;
    const lfoG = ctx.createGain(); lfoG.gain.value = 170;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);

    const sawG = ctx.createGain(); sawG.gain.value = 0.5;
    saw.connect(bp); bp.connect(sawG); sawG.connect(g);
    sub.connect(g); sub2.connect(g);

    [sub, sub2, saw, lfo].forEach(o => o.start(t));

    /* Сонарные пинги. setInterval здесь допустим и это НЕ нарушение
       §3.7: он ничего не измеряет, он только пускает событие.
       В фоновой вкладке его придушат — и это ровно то, чего хочется. */
    const ping = setInterval(() => {
      if (!this._hum) return;
      const c2 = this._live(SND.MARK); if (!c2) return;
      const G2 = this._gain(SND.MARK);
      this._tone({ f: 1568, f2: 1046.5, dur: 0.22, type: 'sine', g: 0.055, lvlGain: G2 });
      this._tone({ f: 3136, dur: 0.06, type: 'sine', g: 0.02, lvlGain: G2 });
    }, 620);

    this._hum = { g: g, o: [sub, sub2, saw, lfo], ping: ping };
    return true;
  },

  /** Цифровой взрыв заставки. Самый крупный голос в палитре,
   *  и он единственный собран из ТРЁХ слоёв сразу — сэмпла, суба
   *  и шума. Причина не в размахе: взрыв обязан читаться как распад
   *  ИЗОБРАЖЕНИЯ, а у распада три составляющих, которых поодиночке
   *  не хватает.
   *
   *  · сэмпл `ach` вниз по скорости — тело удара, узнаваемое
   *    как родня достижения: заставка кончается победой, а не сбоем;
   *  · суб-свип 46 → 22 Гц — провал, который слышно грудью,
   *    а не ушами. Синтез тут точнее сэмпла: частота задаётся
   *    числом, а не тем, что оказалось в файле;
   *  · шумовой хвост с падающим срезом — рассыпание.
   *
   *  Стоит 8 из 10 голосов бюджета намеренно: в этот миг ничего
   *  другого звучать и не должно. */
  blast() {
    const ctx = this._live(SND.MARK); if (!ctx || !this._afford(8)) return false;
    const G = this._gain(SND.MARK); this._wet(0.62);
    /* Сэмпл идёт мимо `_sfx`: тот сам берёт уровень эха и бюджет,
       а здесь оба уже взяты, и второй раз платить за них незачем. */
    const buf = this._buf ? own(this._buf, 'ach', null) : null;
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.72;
      const amp = ctx.createGain();
      amp.gain.value = G * SFX_BASE * 1.15;
      src.connect(amp); amp.connect(this.out);
      src.start();
      src.onended = () => { try { src.disconnect(); amp.disconnect(); } catch (e) { /* уже сняты */ } };
    }
    this._tone({ f: 46, f2: 22, dur: 1.5, type: 'sine', g: 0.52, lvlGain: G });
    this._tone({ f: 92, f2: 38, dur: 0.9, type: 'triangle', g: 0.18, lp: 240, lvlGain: G });
    this._noise({ f: 7000, f2: 260, dur: 1.1, g: 0.12, q: 0.5, lvlGain: G });
    this._noise({ f: 1800, f2: 120, dur: 0.6, g: 0.07, q: 1.2, at: 0.08, lvlGain: G });
    return true;
  },

  /* ══════════════════ УРОВЕНЬ 2: ДЕЙСТВИЯ ══════════════════ */

  /** Галочка. Высота — по значимости: `weight` это доля дня или
   *  доля задач недели, закрытая вместе с этой галочкой. Пятая
   *  галочка звучит выше первой. */
  ok(weight) {
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('ok', SND.ACT, 0.95 + Math.min(1, Math.max(0, Number(weight) || 0)) * 0.3); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('undo', SND.ACT); if (_s !== null) return _s;
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
    if (known) this._tone({ f: 784, f2: 1318.51, dur: 0.09, type: 'triangle', g: 0.10, lp: 3800, det: 5, lvlGain: G });
    else       this._tone({ f: 440, f2: 311.13, dur: 0.13, type: 'triangle', g: 0.09, lp: 2200, det: 5, lvlGain: G });
    return true;
  },

  /** Таймер. Один голос на пять состояний: `kind` меняет высоту
   *  и направление, а не набор нот. Так пять кнопок звучат
   *  семьёй, а не пятью разными приборами. */
  timer(kind) {
    const ctx = this._live(SND.ACT); if (!ctx || !this._afford(2)) return false;
    const G = this._gain(SND.ACT); this._wet(0.3);
    if (kind === 'start') {
      this._tone({ f: 330, f2: 660, dur: 0.14, type: 'sawtooth', g: 0.08, lp: 700, lp2: 3000, q: 3, det: 7, lvlGain: G });
    } else if (kind === 'pause') {
      this._tone({ f: 440, f2: 300, dur: 0.11, type: 'square', g: 0.055, lp: 1600, lvlGain: G });
    } else if (kind === 'resume') {
      this._tone({ f: 300, f2: 520, dur: 0.11, type: 'square', g: 0.055, lp: 1900, lvlGain: G });
    } else if (kind === 'reset') {
      this._noise({ f: 1200, f2: 300, dur: 0.14, g: 0.05, q: 0.9, lvlGain: G });
    } else {                                   // add — добор минут
      this._tone({ f: 880, f2: 1046.5, dur: 0.07, type: 'triangle', g: 0.065, lp: 3400, lvlGain: G });
    }
    return true;
  },

  /** Заморозка дня. Единственный «холодный» голос палитры:
   *  высокая расстроенная пара с длинным хвостом. Механика редкая
   *  и дорогая — две на квартал (§3.6), звучать она должна
   *  не как остальные кнопки. */
  freeze() {
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('freeze', SND.ACT); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('data', SND.ACT); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('drop', SND.ACT); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('err', SND.ACT); if (_s !== null) return _s;
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
    /* Сэмпл — после ограничителя. Случай 'err' пропускается
       намеренно: он делегирует в err(), и тот сыграет свой
       сэмпл сам. Перехватить его здесь значило бы озвучить
       ошибку обычным обменом с сервером. */
    if (state !== 'err') { const _s = this._sfx('sync', SND.ACT); if (_s !== null) return _s; }
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
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп.
       Номер вкладки поднимает высоту — как поднимал её синтез. */
    const _s = this._sfx('nav', SND.UI, 1 + Math.min(7, Math.max(0, Number(idx) || 0)) * 0.045); if (_s !== null) return _s;
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
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп. */
    const _s = this._sfx('press', SND.UI); if (_s !== null) return _s;
    const ctx = this._live(SND.UI); if (!ctx || !this._afford(1)) return false;
    const G = this._gain(SND.UI); this._wet(0.18);
    this._noise({ f: 2600, dur: 0.028, g: 0.11, q: 1.8, lvlGain: G });
    return true;
  },

  /** Переключатель. Щелчок реле плюс нота: вверх — включили,
   *  вниз — выключили. Состояние слышно, не глядя на кнопку. */
  toggle(on) {
    if (!this._rate('toggle', 60)) return false;
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп.
       Включили или выключили — слышно по направлению. */
    const _s = this._sfx('toggle', SND.UI, on ? 1.15 : 0.9); if (_s !== null) return _s;
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
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп.
       Раскрыли или свернули. */
    const _s = this._sfx('open', SND.UI, isOpen ? 1 : 1.25); if (_s !== null) return _s;
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
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп.
       Сохранилось или просто напечаталось. */
    const _s = this._sfx('field', SND.UI, saved ? 1 : 1.3); if (_s !== null) return _s;
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
    /* Сэмпл — после ограничителя частоты и до синтеза: банк
       не должен обходить то, чем §12.5-ter держит темп. */
    const _s = this._sfx('deny', SND.UI); if (_s !== null) return _s;
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
    /* Сэмпл — первым. null означает «банка нет», и только тогда
       ниже поёт синтез (§12.5-quater). */
    const _s = this._sfx('glitch', SND.ACT); if (_s !== null) return _s;
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
