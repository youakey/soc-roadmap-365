/* ============================================================
   sound.js — HUD-отклик в духе консоли (§12.5)

   Файлов нет, всё синтезируется на месте. Решение не про экономию
   веса: высота звука обязана зависеть от данных. Писк, который
   поднимается на последних десяти секундах блока, и подтверждение,
   чья высота растёт вместе со значимостью события, — это сигнал,
   а не украшение. Сэмплами так не сделать, не набрав два десятка
   файлов, каждый со своей лицензией и своим ?v=N.

   Вся палитра — осциллятор, огибающая громкости и фильтр. Ниже
   ровно они и есть; всё остальное в файле — дисциплина включения.

   ── Что здесь важнее самого синтеза ──────────────────────────

   1. КОНТЕКСТ НЕ СОЗДАЁТСЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ. iOS Safari
      выдаёт AudioContext в состоянии suspended, и resume() обязан
      быть вызван синхронно внутри обработчика реального нажатия.
      Контекст, созданный на старте, останется молчащим навсегда —
      и, что хуже, молча: ни одной ошибки в консоли. Поэтому
      единственная точка создания — arm(), а arm() зовётся только
      из жеста.

   2. ОДИН КОНТЕКСТ НА СТРАНИЦУ. Объект тяжёлый, браузеры
      ограничивают их число. Создаём ровно один и переиспользуем.

   3. ИСТОЧНИК ЗВУКА — СОБЫТИЕ, А НЕ ПЕРЕРИСОВКА. Ни одна функция
      из этого файла не зовётся из render()/renderAll(). Иначе
      сигнал пойдёт пачками при каждом обновлении экрана.
      Исключение только на вид: tPaint() зовёт tick(), но tick()
      сам отсекает повтор в ту же секунду отсчёта — см. ниже.

   4. prefers-reduced-motion ЗВУК НЕ ВЫКЛЮЧАЕТ. Это разные оси:
      человек может не выносить движение и спокойно относиться
      к писку, и наоборот. Флаг у звука свой.

   5. ФОНОВАЯ ВКЛАДКА ДУШИТСЯ, и это ограничение платформы, а не
      баг. Чинить его setInterval-ом нельзя (§9): всё, что считает
      время, считает по стенным часам.
   ============================================================ */

'use strict';

const Sound = {
  ctx: null,
  bus: null,          // общий регулятор громкости, единственная точка VOL
  _budget: 0,         // сколько голосов уже пущено в текущем окне
  _budgetAt: 0,       // когда окно открылось

  /* ── состояние ─────────────────────────────────────────── */

  /** Поддерживает ли браузер вообще. Проверяется до создания. */
  supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  },
  on() { return Store.soundOn(); },

  /* ── создание и разблокировка ──────────────────────────────
     arm() безопасно звать сколько угодно раз: пока контекст жив
     и играет, она выходит первой же строкой. Это важно, потому
     что она висит на каждом нажатии в документе — единственный
     способ поймать «настоящий жест» на iOS, не разбирая, какая
     именно кнопка нажата. */
  arm() {
    if (!Store.soundOn()) return null;
    const ctx = this._ctx();
    if (!ctx) return null;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* дальше просто молчим */ } }
    return ctx;
  },

  _ctx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); }
    catch (e) { console.warn('audio', e); return null; }
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.ctx.destination);
    return this.ctx;
  },

  /** Готов ли контекст принять расписание прямо сейчас.
   *
   *  Отдельно от arm() и намеренно строго: на suspended-контексте
   *  currentTime не идёт, и всё, что мы туда запланируем, прозвучит
   *  скопом в момент разблокировки. Лучше потерять один сигнал,
   *  чем однажды выстрелить очередью. */
  _live() {
    if (!Store.soundOn()) return null;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    return ctx;
  },

  /** Громкость: воспринимается ухом ближе к квадрату, отсюда v*v.
   *  0.5 сверху — запас на то, что голосов в аккорде бывает четыре. */
  _gain() {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const v = Store.soundVol();
    this.bus.gain.setTargetAtTime(v * v * 0.5, ctx.currentTime, 0.01);
  },

  /** Бюджет голосов: не больше 8 за 120 мс. Страховка ровно
   *  от того случая, ради которого писано правило «источник звука —
   *  событие»: если сигнал всё же прорвётся в цикл, он прозвучит
   *  восемь раз, а не восемьсот. */
  _afford(n) {
    const now = Date.now();
    if (now - this._budgetAt > 120) { this._budgetAt = now; this._budget = 0; }
    if (this._budget + n > 8) return false;
    this._budget += n;
    return true;
  },

  /* ── синтез ────────────────────────────────────────────────
     Один голос: осциллятор → (необязательный фильтр) → огибающая.
     Огибающая экспоненциальная и никогда не доходит до нуля —
     exponentialRampToValueAtTime(0) в Web Audio недопустим,
     а резкий обрыв даёт щелчок. */
  _tone(p) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (p.at || 0);
    const dur = p.dur || 0.1;

    const osc = ctx.createOscillator();
    osc.type = p.type || 'sine';
    osc.frequency.setValueAtTime(p.f, t0);
    if (p.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f2), t0 + dur);

    const env = ctx.createGain();
    const peak = Math.max(0.0005, p.g == null ? 0.3 : p.g);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + (p.a || 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail = osc;
    if (p.lp) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(p.lp, t0);
      if (p.lp2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, p.lp2), t0 + dur);
      flt.Q.value = p.q == null ? 0.9 : p.q;
      osc.connect(flt);
      tail = flt;
    }
    tail.connect(env);
    env.connect(this.bus);

    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  /** Щелчок реле: короткий шум через полосовой фильтр. Единственный
   *  звук палитры, у которого нет высоты, — и единственный, которому
   *  она не нужна. */
  _click(p) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (p.at || 0);
    const dur = p.dur || 0.05;

    const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(p.f || 1800, t0);
    flt.Q.value = p.q == null ? 1.6 : p.q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0005, p.g == null ? 0.16 : p.g), t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(flt); flt.connect(env); env.connect(this.bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  },

  /* ══════════════════ ПАЛИТРА ══════════════════
     Список закрытый (§12.5). Всё, чего здесь нет, молчит:
     переключение вкладок, наведение, прокрутка, рендер.
     Порог для звука выше, чем для анимации, потому что звук
     заметен всегда — то же правило, что для наведения в §3.8. */

  /** 1. Блок таймера досижен до конца. Главный случай: человек
   *  в этот момент смотрит в терминал, а не на вкладку. Восходящая
   *  триада плюс низкое тело — «задача принята», а не «ошибка». */
  done() {
    const ctx = this._live(); if (!ctx || !this._afford(4)) return false;
    this._gain();
    this._tone({ f: 587.33, dur: 0.13, type: 'triangle', g: 0.30, lp: 2600, at: 0 });
    this._tone({ f: 880.00, dur: 0.13, type: 'triangle', g: 0.28, lp: 3200, at: 0.085 });
    this._tone({ f: 1174.66, dur: 0.34, type: 'triangle', g: 0.26, lp: 4200, at: 0.17 });
    this._tone({ f: 146.83, dur: 0.42, type: 'sine', g: 0.22, at: 0 });
    return true;
  },

  /** 2. Последние десять секунд. Высота растёт по мере убывания
   *  остатка — это и есть тот случай, ради которого выбран синтез.
   *  Янтарное состояние циферблата уже есть (§3.7), звук ему в пару.
   *
   *  `left` — целые секунды остатка, 10…1. Отсечка повтора живёт
   *  в вызывающем (app.js): tPaint() крутится дважды в секунду,
   *  и без неё каждый тик прозвучал бы дважды. */
  tick(left) {
    const ctx = this._live(); if (!ctx || !this._afford(1)) return false;
    this._gain();
    const step = Math.min(9, Math.max(0, 10 - left));
    this._tone({ f: 900 + step * 62, dur: 0.045, type: 'square', g: 0.11, lp: 2400, q: 0.7 });
    return true;
  },

  /** 3a. Галочка в чеклисте. Высота — по значимости: `weight`
   *  0…1 это доля дня, закрытая вместе с этой галочкой. Пятая
   *  галочка звучит выше первой, и это единственное, что о ней
   *  вообще сообщается ухом. */
  ok(weight) {
    const ctx = this._live(); if (!ctx || !this._afford(1)) return false;
    this._gain();
    const w = Math.min(1, Math.max(0, Number(weight) || 0));
    const f = 620 + w * 400;
    this._tone({ f: f, f2: f * 1.5, dur: 0.09, type: 'triangle', g: 0.22, lp: 3400 });
    return true;
  },

  /** 3b. Неделя закрыта. Две ноты вверх — заметно крупнее галочки
   *  и заметно мельче достижения. Ступень между ними и есть та
   *  «разная высота по значимости», которую требует спека. */
  week() {
    const ctx = this._live(); if (!ctx || !this._afford(2)) return false;
    this._gain();
    this._tone({ f: 523.25, dur: 0.11, type: 'triangle', g: 0.26, lp: 3000 });
    this._tone({ f: 783.99, dur: 0.22, type: 'triangle', g: 0.24, lp: 3800, at: 0.09 });
    return true;
  },

  /** 3c. Достижение. Самое крупное событие списка, поэтому
   *  единственное, где есть свип: он слышен как «что-то
   *  открылось», а не как «что-то отметилось». */
  ach() {
    const ctx = this._live(); if (!ctx || !this._afford(4)) return false;
    this._gain();
    this._tone({ f: 220, f2: 1760, dur: 0.42, type: 'sawtooth', g: 0.14, lp: 500, lp2: 4200, q: 2.2 });
    this._tone({ f: 659.25, dur: 0.30, type: 'triangle', g: 0.20, lp: 3600, at: 0.30 });
    this._tone({ f: 987.77, dur: 0.30, type: 'triangle', g: 0.18, lp: 4200, at: 0.34 });
    this._tone({ f: 1318.51, dur: 0.40, type: 'triangle', g: 0.16, lp: 5000, at: 0.38 });
    return true;
  },

  /** 4a. Переворот карточки в тренажёре. Тренажёр управляется
   *  клавишами, взгляд прикован к карточке — отклик ухом здесь
   *  работает лучше, чем где-либо ещё. Щелчок, а не нота:
   *  переворот это механическое действие, а не результат. */
  flip() {
    const ctx = this._live(); if (!ctx || !this._afford(1)) return false;
    this._gain();
    this._click({ f: 1900, dur: 0.05, g: 0.13, q: 1.4 });
    return true;
  },

  /** 4b. Оценка в тренажёре. Вверх — знаю, вниз — ещё раз.
   *  Направление здесь несёт весь смысл: рука на стрелках,
   *  глаза на слове. */
  grade(known) {
    const ctx = this._live(); if (!ctx || !this._afford(1)) return false;
    this._gain();
    if (known) this._tone({ f: 784, f2: 1318.51, dur: 0.09, type: 'triangle', g: 0.20, lp: 3800 });
    else       this._tone({ f: 440, f2: 311.13, dur: 0.13, type: 'triangle', g: 0.18, lp: 2200 });
    return true;
  },

  /** 5. Вход. Одиночный свип «канал открыт», один раз за сессию.
   *
   *  На восстановленной сессии он не прозвучит, и это правильно:
   *  контекста ещё нет (жеста не было), _live() вернёт null.
   *  Звук на загрузке страницы никто не заказывал. */
  login() {
    const ctx = this._live(); if (!ctx || !this._afford(2)) return false;
    this._gain();
    this._tone({ f: 160, f2: 1400, dur: 0.5, type: 'sawtooth', g: 0.13, lp: 420, lp2: 3600, q: 3 });
    this._tone({ f: 1174.66, dur: 0.26, type: 'sine', g: 0.16, at: 0.42 });
    return true;
  },

  /* ── проба из настроек ─────────────────────────────────────
     Формально это не событие из закрытого списка, и всё же она
     здесь. Причина: включатель без отклика — это «звук не
     работает», а регулятор громкости без отклика бесполезен
     вовсе, крутить его вслепую нечем. Проба озвучивает не
     интерфейс, а сам орган управления, ровно как ползунок
     громкости в системе. Границу это не размывает: играет
     только SOUND и только VOL.

     Отдельный путь ещё и потому, что это единственное место,
     где мы играем сразу после разблокировки: resume() возвращает
     промис, и в тот же тик контекст ещё suspended. Здесь ждать
     промиса безопасно — от жеста нас отделяют миллисекунды. */
  preview(weight) {
    if (!Store.soundOn()) return;
    const ctx = this.arm();
    if (!ctx) return;
    const beep = () => this.ok(weight == null ? 0.5 : weight);
    if (ctx.state === 'running') { beep(); return; }
    try { ctx.resume().then(beep, () => {}); } catch (e) { /* не дали — молчим */ }
  }
};
