/* ============================================================
   zero.js — ZERO, приборная панель на вкладке TODAY (§12.3)

   Что это. Виджет-HUD над уже посчитанными данными. Zero НЕ языковая
   модель и в сеть не ходит: ни одного запроса наружу, connect-src в CSP
   не трогается. Всё, что здесь показано, взято из Store, Vocab, WEEKS
   и META — выдуманного числа нет ни одного. Число, которое ничего
   не измеряет, в трекере — ложь, которую однажды поверят.

   Почему отдельный файл, а не блок в app.js. app.js уже 2136 строк.
   Zero самодостаточен: считает свои показатели, собирает свою разметку
   и сам заводит движение. Не зашло — файл вырезается целиком, из app.js
   уходят три вызова. Ровно то же правило, что у слоя отделки v4 (§3.10).

   Zero НИЧЕГО не пишет. Ни в Store, ни в Vocab, ни в localStorage.
   Он представление, а не источник истины (то же решение, что
   у календаря, §12.4). Отсюда, в частности, запрет на Store.week():
   этот метод создаёт запись недели побочным эффектом.

   ── ДВИЖЕНИЕ И БЮДЖЕТ СЛОЁВ ────────────────────────────────
   §3.10 уже объясняет, почему «пусть двигается всё» нельзя понимать
   буквально: каждый вращающийся узел получает собственный
   композиторский слой РАЗМЕРОМ ВО ВЕСЬ СВОЙ БЛОК, и при DPR 3 это
   мегабайты текстур на каждое кольцо.

   Поэтому бюджет назначен заранее и записан здесь, а не выведен
   после факта. Постоянно анимированных узлов:

     широкий экран — 9, из них крупнее 120 px два (.z-ticks, .z-sweep);
     узкий (< 700 px) — 8, крупнее 120 px ровно один (.z-sweep на
       уменьшенном ядре 132 px); .z-ticks гасится, ядро ужимается;
     prefers-reduced-motion — 0, показатели остаются все.

   Арифметика при DPR 3: 132 px → 396² × 4 B ≈ 0.63 МБ,
   62 px → 186² × 4 B ≈ 0.14 МБ. Узкий экран: 0.63 + 4×0.14 + мелочь
   ≈ 1.2 МБ. Это на порядок меньше, чем дали бы восемь колец в полный
   размер, и сопоставимо с одним орбом фона.

   Движение сделано кадрами CSS. setInterval на кадры нет нигде.
   Единственное, что считается в JS, — осциллограмма: один canvas,
   перерисовка по requestAnimationFrame и только пока виджет в зоне
   видимости (IntersectionObserver). Остаток таймера подхватывается
   из уже существующего tPaint (§3.7), своего интервала Zero не заводит.

   Ни blur(), ни backdrop-filter: на iOS это рывки при инерционной
   прокрутке (§9). «Стекло» набирается градиентами и свечением.

   ── ГЛАВНОЕ ОГРАНИЧЕНИЕ (§3.5, §3.5-bis) ───────────────────
   Весь виджет живёт внутри .zero с overflow: hidden, потому что
   внутри есть горизонтально едущая полоса развёртки. Ни transform,
   ни filter, ни perspective, ни contain, ни content-visibility
   не попадают на #app, .layout, main и .view — иначе предок станет
   containing block для position: fixed и таббар отклеится в третий
   раз. Проверяется пробным fixed-элементом, а не чтением transform.
   Внутри .card transform допустим: карточка предком таббара не
   является (тот же разбор, что у сцены календаря, §12.4-bis).
   ============================================================ */

/* Сколько дней показывает осциллограмма. Четыре недели: меньше —
   не видно ритма, больше — на 390 px клетка уходит в один пиксель. */
const Z_WAVE_DAYS = 28;

/* Сколько реплик голоса попадает в ленту за один проход (§12.6).
   Подошедших правил бывает и десять; пустить все — значит превратить
   поток телеметрии в стену текста, а лента должна читаться боковым
   зрением. Пять — это примерно один экран прокрутки ленты. */
const Z_VOICE_MAX = 5;

/* Порог узкого экрана. Тот же, на котором §3.10 гасит фон. Держится
   в CSS; здесь он нужен только для решения «сколько кадров рисовать
   осциллограмме» и сверяется через matchMedia в момент запуска. */
const Z_NARROW = 700;

/* Потолок DPR для canvas. На iPhone DPR 3, и полотно 640×128 логических
   пикселей превратилось бы в 1920×384 — лишняя память и лишний фрагмент
   ради разницы, которой не видно на линии в 1.5 px. */
const Z_DPR_CAP = 2;

const Zero = {
  /* ── состояние подсказок ──────────────────────────────────
     Живёт в памяти вкладки и нигде больше — как проход Drill (§10.2).
     Перезагрузил страницу — Zero знакомится с тобой заново. Никакого
     localStorage и ничего в payload: это не данные, это разговор. */
  seen: [],      // id, которые уже входили в оборот за жизнь вкладки
  queue: [],     // ждут своей очереди — очередь, а не стопка
  cur: null,     // ровно одна подсказка на экране, больше не бывает

  _io: null,     // наблюдатель видимости для осциллограммы
  _raf: null,
  _vis: false,
  _last: 0,
  _m: null,      // последний снимок показателей: считается один раз за отрисовку

  /* ══════════ ПОКАЗАТЕЛИ ══════════
     Один вызов — один снимок. Всё считается из того, что уже есть
     в проекте; ни одной новой сущности в хранилище Zero не заводит. */
  metrics() {
    const now = new Date();
    const today = iso(now);
    const cw = currentWeek();
    const wk = WEEKS[cw - 1] || WEEKS[0];
    const q = wk ? wk.q : 1;

    const t = Store.totals();
    const si = Store.streakInfo();
    const qt = Store.quarterTotals(q);

    /* Дневная норма считается ровно так же, как в чеклисте на TODAY:
       неделя сессии режет набор блоков и укорачивает практику до 35 мин.
       Две разные арифметики на одном экране разъедутся — это уже было
       с клиентом и серверной границей streak (§12.1-ter). */
    const sess = META.sessionWeeks.indexOf(cw) !== -1;
    const blocks = sess
      ? DAILY.filter(b => b.id === 'polish' || b.id === 'english' || b.id === 'lab')
      : DAILY;
    const bmin = b => (b.id === 'lab' && sess) ? 35 : b.min;
    const rec = own(Store.d.days, today, null) || {};
    const goalMin = blocks.reduce((s, b) => s + bmin(b), 0);
    const doneMin = blocks.reduce((s, b) => s + (own(rec, b.id, 0) ? bmin(b) : 0), 0);
    const restBlocks = blocks.filter(b => !own(rec, b.id, 0));

    /* Календарный ход трека. Это НЕ процент часов: человек может идти
       по календарю на 40%, а по часам на 25% — расхождение и есть темп. */
    const span = daysBetween(META.start, META.end) + 1;
    const gone = Math.max(0, Math.min(span, daysBetween(META.start, today) + 1));
    const calPct = Math.round(gone / span * 100);

    /* Ожидаемые часы к сегодняшнему дню. Недели неравные по нагрузке,
       поэтому не «доля года × 631», а сумма закончившихся недель плюс
       текущая пропорционально прожитым в ней дням. */
    let expect = 0;
    WEEKS.forEach(w => {
      if (today > w.end) expect += w.hours;
      else if (today >= w.start) expect += w.hours * ((daysBetween(w.start, today) + 1) / 7);
    });
    expect = Math.round(expect * 10) / 10;
    const drift = Math.round((t.hoursFact - expect) * 10) / 10;
    const pace = expect > 0 ? Math.round(t.hoursFact / expect * 100) : 0;

    /* Ближайшая контрольная точка — та, чья дата ещё не прошла. */
    const ms = MILESTONES.find(x => x.date >= today) || MILESTONES[MILESTONES.length - 1];

    /* Словарь показывается, только если раздел включён: при скрытом ANKI
       считать RAW/RDY/EXP не из чего и незачем (§12.2). */
    const anki = !Store.hidden('anki');

    return {
      today, hour: now.getHours(), dow: now.getDay(),
      weekend: now.getDay() === 0 || now.getDay() === 6,
      before: isBeforeStart(), after: isAfterEnd(),
      cw, q, wk, sess, t, si, qt,
      goalMin, doneMin, restBlocks,
      calPct, expect, drift, pace,
      ms, msIn: daysBetween(today, ms.date),
      exam: own(META.examWeeks, String(cw), null),
      frz: Store.freezesLeft(q),
      brk: Store.breakingDay(),
      anki,
      vRaw:   anki ? Vocab.rawCount() : 0,
      vReady: anki ? Vocab.count(null, 'ready') : 0,
      vExp:   anki ? Vocab.count(null, 'exported') : 0,
      vPl:    anki ? Vocab.count('pl', null) : 0,

      /* Текущая неделя: свои часы и задачи. Читаем Store.d напрямую
         через own() — Store.week() создал бы запись побочным эффектом,
         а Zero не пишет. */
      wkHours: Number((own(Store.d.weeks, String(cw), null) || {}).hours) || 0,
      wkTasks: ((own(Store.d.weeks, String(cw), null) || {}).tasks || []).length,
      wkTasksAll: wk ? wk.tasks.length : 0,
      wkPlan: wk ? wk.hours : 0,

      ach: Store.achievements().filter(a => a.got).length,
      achAll: ACHIEVEMENTS.length,
      endIn: Math.max(0, daysBetween(today, META.end)),

      /* Разброс по кварталам — он назван в спеке отдельной строкой.
         Четыре независимых процента: где просело, видно сразу. */
      qs: [1, 2, 3, 4].map(n => {
        const s = Store.quarterTotals(n);
        return { q: n, pct: s.pct, fact: s.fact, plan: s.plan, closed: s.closed, total: s.total };
      }),

      wave: this.wave(today)
    };
  },

  /** Сводка по осциллограмме: среднее, пик и сколько дней закрыто
   *  целиком. Считается из тех же 28 точек, что и рисунок, — второго
   *  источника не заводим. */
  waveStat(wave) {
    const mins = wave.map(d => d.min);
    const sum = mins.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / (mins.length || 1)),
      peak: mins.reduce((a, b) => b > a ? b : a, 0),
      full: mins.filter(v => v >= 180).length
    };
  },

  /** Минуты по дням за последние Z_WAVE_DAYS. Читает Store как есть. */
  wave(today) {
    const out = [];
    for (let i = Z_WAVE_DAYS - 1; i >= 0; i--) {
      const day = isoPlus(today, -i);
      out.push({ day, min: Store.dayMinutes(day) });
    }
    return out;
  },

  /* ══════════ ПОДСКАЗКИ ══════════
     Правила, а не генерация. Тон коучерский и без упрёка: §3.6
     объясняет, почему streak намеренно не наказывает, — подсказка,
     которая тычет носом, работает против той же цели.

     Порядок в массиве и есть приоритет: сверху то, что про сейчас
     и что можно поправить сегодня. */
  rules(m) {
    const out = [];
    const push = (id, text) => out.push({ id, text });

    if (m.brk) {
      push('debt', 'Цепочку рвёт ' + fmtRU(m.brk) +
        '. Выходной закрывает пропуск — поработай в субботу, и всё сойдётся.');
    }
    if (!m.before && !m.weekend && m.hour >= 20 && m.doneMin === 0) {
      push('late', 'Сегодня пока ноль. Десяти минут Polish хватит, чтобы цепочка не порвалась, — остальное подождёт до завтра.');
    }
    if (m.sess) {
      push('session', 'W' + m.cw + ' — неделя сессии. Универ приоритетнее, это заложено в план, а не провал.');
    }
    if (m.doneMin > 0 && m.doneMin < m.goalMin && m.restBlocks.length === 1) {
      const b = m.restBlocks[0];
      push('almost', 'Остался один блок — ' + b.name + '. День закроется целиком.');
    }
    if (m.goalMin > 0 && m.doneMin >= m.goalMin) {
      push('closed', 'День закрыт: ' + m.doneMin + ' минут. Дальше — по желанию, не по долгу.');
    }
    if (m.anki && m.vRaw >= 20) {
      push('raw', 'Сырых слов набралось ' + m.vRaw + '. Пять минут в блоке Cyber English — и они станут карточками.');
    }
    if (m.anki && m.vReady >= 20) {
      push('ready', m.vReady + ' карточек готовы к выгрузке. EXPORT занимает полминуты.');
    }
    if (m.weekend && m.doneMin > 0) {
      push('credit', 'Выходной пошёл в кредит: он закроет ближайший пропуск.');
    }
    if (m.exam) {
      push('exam', 'W' + m.cw + ' — ' + m.exam + '. Проверка в конце недели, а не в конце квартала.');
    }
    if (!m.before && m.msIn >= 0 && m.msIn <= 14) {
      push('ms', m.ms.name + ' через ' + m.msIn + ' дн. Цифры контрольной точки — на YEAR.');
    }
    if (!m.before && m.drift <= -10) {
      push('slow', 'Отставание ' + Math.abs(m.drift) + ' ч. План на 75% за 52 недели кратно лучше плана на 120% за 14 и брошенного.');
    }
    if (!m.before && m.drift >= 10) {
      push('fast', 'Опережение ' + m.drift + ' ч. Запас стоит потратить на глубину, а не на скорость.');
    }
    if (m.frz === 0 && !m.before) {
      push('frz', 'Заморозки на Q' + m.q + ' кончились. До конца квартала цепочку держит только работа в выходной.');
    }
    return out;
  },

  /** Раскладывает подходящие правила по очереди и поднимает одну.
   *
   *  Три требования спеки исполняются здесь и их стоит держать рядом:
   *  · не спамить — на экране ровно одна подсказка, никогда больше;
   *  · не нагромождаться — новая НЕ выталкивает текущую, а встаёт
   *    в очередь; это очередь, а не стопка;
   *  · жить до перезагрузки — id отработавшей подсказки остаётся
   *    в seen, и второй раз за жизнь вкладки она не всплывёт.
   *
   *  Текущая уходит по одной из двух причин: человек нажал ACK или
   *  её условие перестало выполняться (оформил слова — подсказка про
   *  сырые карточки больше не о чём). Сама себя она не сменяет. */
  sync(m) {
    const hits = this.rules(m);
    const live = hits.map(h => h.id);

    hits.forEach(h => {
      if (this.seen.indexOf(h.id) !== -1) return;
      this.seen.push(h.id);          // отмечаем на входе, а не на показе
      this.queue.push(h);
    });

    /* Условие текущей отпало — она отработала, поднимаем следующую. */
    if (this.cur && live.indexOf(this.cur.id) === -1) this.cur = null;
    /* Из очереди выбрасываем то, что успело перестать быть правдой. */
    this.queue = this.queue.filter(h => live.indexOf(h.id) !== -1);
    /* Текст обновляем: числа в подсказке живые. */
    if (this.cur) {
      const fresh = hits.find(h => h.id === this.cur.id);
      if (fresh) this.cur = fresh;
    }
    if (!this.cur && this.queue.length) this.cur = this.queue.shift();
    return this.cur;
  },

  /** ACK — единственное действие человека над подсказкой. */
  ack() {
    this.cur = this.queue.length ? this.queue.shift() : null;
  },

  /* ══════════ РАЗМЕТКА ══════════ */

  /** Одна ячейка показателя. Микрополоса под числом — это тот же
   *  показатель, только глазами: у каждого числа есть чем меряться,
   *  иначе цифра превращается в украшение. */
  cell(i, key, val, unit, frac, tone) {
    const w = Math.max(0, Math.min(100, Math.round((frac || 0) * 100)));
    return `<div class="z-cell${tone ? ' ' + tone : ''}" data-k="${secEsc(key)}" style="--i:${i}">
      <span class="z-k mono">${secEsc(key)}</span>
      <b class="z-v mono">${secEsc(String(val))}</b>
      <span class="z-u mono">${secEsc(unit || '')}</span>
      <span class="z-mb"><span style="width:${w}%"></span></span>
    </div>`;
  },

  /** Кольцевой калибр. Дуга — данные, вращается только насечка. */
  gauge(key, pct, label, tone) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return `<div class="z-g ${tone}">
      <div class="z-g-dial">
        <span class="z-g-ticks"></span>
        <svg class="z-g-svg" viewBox="0 0 72 72" aria-hidden="true">
          <circle class="z-g-rail" cx="36" cy="36" r="30" pathLength="100"/>
          <circle class="z-g-arc"  cx="36" cy="36" r="30" pathLength="100" style="--p:${p}"/>
        </svg>
        <span class="z-g-num mono" data-count="${p}">${p}%</span>
      </div>
      <span class="z-g-lbl mono">${secEsc(label)}</span>
    </div>`;
  },

  /** Строка телеметрии в шапке. Выглядит машинно, но врать не может:
   *  это те же показатели, просто другой записью. `uptime` — рабочие
   *  дни, `load` — темп относительно плана, hex — процент года
   *  в шестнадцатеричном виде. Ни одного случайного числа: у таймера
   *  бегущий hex декоративен (§3.7), здесь это было бы ложью — панель
   *  целиком про то, что каждая цифра что-то меряет. */
  telemetry(m) {
    return 'core.online · uptime ' + m.t.daysDone + 'd · load ' + m.pace +
           '% · 0x' + m.t.pct.toString(16).toUpperCase().padStart(2, '0');
  },

  /** Бегущая лента внизу панели. Содержимое — те же показатели строкой;
   *  в разметку она уходит дважды подряд, чтобы петля шла без стыка. */
  /* ══════════ ГОЛОС В ЛЕНТЕ (§12.6) ══════════

     Реплики Zero, вплетённые в поток телеметрии. Это НЕ подсказки:
     у подсказок свой контракт — одна на экране, очередь, жизнь
     до перезагрузки, кнопка ACK (§12.3). Голос устроен иначе:
     он идёт мимо, его не нужно закрывать, и пропустить его не жалко.
     Смешивать их нельзя, поэтому он и живёт в ленте.

     Правило то же, что для всей панели: **каждая реплика привязана
     к настоящему числу**. «Ты справишься» здесь не появится никогда —
     не из вкуса, а из §12.3: число, которое ничего не измеряет,
     в трекере ложь, и фраза, которая ничего не измеряет, — тоже.
     Поэтому ниже нет ни одной строки без условия и без величины.

     Тон — SOC-консоль: система докладывает оператору. Не тренер,
     не бот-подбадриватель. Упрёка нет по той же причине, по которой
     streak не обнуляется (§3.6): наказание в момент, когда и так
     тяжело, работает против цели.

     Отбор — не случайный: из подошедших берутся первые VOICE_MAX
     в порядке приоритета. Случайность здесь означала бы, что при
     одном и том же состоянии лента говорит разное, а это ровно то,
     что отличает генерацию от правил. */
  voice(m) {
    const out = [];
    const say = s => out.push(s);
    const t = m.t;

    if (m.before) {
      say('STANDBY // трек стартует ' + fmtRU(META.start) + ' — до отсчёта ' +
          Math.max(0, daysBetween(iso(new Date()), META.start)) + 'd');
    }
    if (!m.before && m.doneMin >= m.goalMin && m.goalMin > 0) {
      say('DAY CLOSED // ' + m.doneMin + 'm из ' + m.goalMin + ' — норма выбрана');
    }
    if (!m.before && m.doneMin > 0 && m.doneMin < m.goalMin) {
      say('IN PROGRESS // ' + m.doneMin + '/' + m.goalMin + 'm, до нормы ' +
          (m.goalMin - m.doneMin) + 'm');
    }
    if (m.si.days >= 5) {
      say('CHAIN ' + m.si.days + 'd // столько же дней ты уже умеешь');
    }
    if (m.si.covered > 0) {
      say('DEBT CLEARED ' + m.si.covered + 'd // выходные закрыли пропуски, цепочка цела');
    }
    if (m.si.credits > 0) {
      say('CREDIT ' + m.si.credits + 'd // отработано вперёд, пропуск не порвёт цепочку');
    }
    if (!m.before && m.drift >= 10) {
      say('AHEAD +' + m.drift + 'h // запас есть, глубина дороже скорости');
    }
    if (!m.before && m.drift <= -10) {
      say('BEHIND ' + m.drift + 'h // 75% за 52 недели лучше 120% за 14 и брошенного');
    }
    if (t.closed > 0) {
      say('WEEKS ' + t.closed + '/52 // закрыто необратимо, назад это не отыгрывается');
    }
    if (t.hoursFact >= 100) {
      say('MILESTONE 100h // здесь кончается «посмотрел курс» и начинается опыт');
    } else if (t.hoursFact > 0) {
      say('HOURS ' + t.hoursFact + 'h // до отметки 100 осталось ' +
          Math.round((100 - t.hoursFact) * 10) / 10 + 'h');
    }
    if (t.tasksDone > 0) {
      say('TASKS ' + t.tasksDone + '/' + t.tasksAll + ' // ' +
          Math.round(t.tasksDone / (t.tasksAll || 1) * 100) + '% плана руками');
    }
    if (t.repos > 0) {
      say('PORTFOLIO ' + t.repos + ' // ссылка, которую не стыдно дать рекрутёру');
    }
    if (t.apps > 0) {
      say('APPLIED ' + t.apps + ' // самый тяжёлый отклик был первый');
    }
    if (m.sess) {
      say('W' + m.cw + ' SESSION // универ приоритетнее, это заложено в план');
    }
    if (m.exam) {
      say('W' + m.cw + ' ' + m.exam + ' // проверка в конце недели, не в конце квартала');
    }
    if (m.anki && m.vRaw > 0) {
      say('VOCAB RAW ' + m.vRaw + ' // карта незнания, а не долг');
    }
    if (m.frz === 0 && !m.before) {
      say('FREEZE 0/2 // до конца Q' + m.q + ' цепочку держит работа в выходной');
    }
    /* Экранирование здесь НЕ ставится: реплики уходят в tape(),
       а он экранирует весь список разом. Две обработки подряд
       дают `&amp;amp;` — тот самый случай, ради которого в проекте
       одно экранирование на всех (§11.2). */
    if (!m.before && m.ms && m.msIn >= 0) {
      say('NEXT ' + String(m.ms.name).toUpperCase() + ' T-' + m.msIn + 'd');
    }
    if (!out.length) {
      /* Нулевое состояние — тоже число, а не заглушка: день,
         с которого всё начинается, у трека ровно один. */
      say('DAY 0 // всё впереди, и это единственный раз, когда это правда');
    }
    return out.slice(0, Z_VOICE_MAX);
  },

  /** Лента: показатели вперемешку с репликами. Голос ставится
   *  через равные промежутки, а не подряд, — иначе он читается
   *  как отдельный блок текста, а не как часть потока. */
  tape(m) {
    const nums = [
      'SYS.ZERO', 'CAL ' + m.calPct + '%', 'HRS ' + m.t.hoursFact + '/' + m.t.hoursPlan,
      'PACE ' + m.pace + '%', 'DRIFT ' + (m.drift > 0 ? '+' : '') + m.drift + 'H',
      'STRK ' + m.si.days + 'D', 'WKS ' + m.t.closed + '/52',
      'TASK ' + m.t.tasksDone + '/' + m.t.tasksAll,
      'DAY ' + m.doneMin + '/' + m.goalMin + 'M',
      'W' + m.cw + ' ' + QUARTERS[m.q].code, 'MS ' + m.msIn + 'D',
      'DAYS ' + m.t.daysDone
    ].map(s => secEsc(s));

    const voice = this.voice(m).map(s => '<i class="z-say">' + secEsc(s) + '</i>');
    const parts = [];
    /* Делим на voice.length + 1 промежутков, а не на voice.length:
       иначе последняя реплика не помещается в цикл и уезжает в хвост
       через `while` ниже — то есть голос всё-таки приклеивается блоком,
       ровно то, чего мы избегали. Плюс единица гарантирует, что после
       последней реплики в ленте остаются числа. */
    const every = Math.max(2, Math.floor(nums.length / (voice.length + 1)));
    let vi = 0;
    nums.forEach((s, i) => {
      parts.push(s);
      if (i % every === every - 1 && vi < voice.length) parts.push(voice[vi++]);
    });
    while (vi < voice.length) parts.push(voice[vi++]);
    return parts.join(' <b>·</b> ') + ' <b>·</b> ';
  },

  html() {
    const m = this.metrics();
    this._m = m;                     // wire() и осциллограмма берут этот же снимок
    const adv = this.sync(m);
    const t = m.t, si = m.si;

    const ws = this.waveStat(m.wave);
    const cells = [];
    let i = 0;
    const add = (k, v, u, f, tone) => cells.push(this.cell(i++, k, v, u, f, tone));

    add('PCT',   t.pct,                    '%',            t.pct / 100, 'acc');
    add('CAL',   m.calPct,                 '%',            m.calPct / 100);
    add('HRS',   t.hoursFact,              '/' + t.hoursPlan, t.hoursFact / t.hoursPlan);
    add('PACE',  m.pace,                   '%',            m.pace / 100, m.pace >= 100 ? 'ok' : m.pace >= 80 ? '' : 'warn');
    add('DRIFT', (m.drift > 0 ? '+' : '') + m.drift, 'ч',  Math.min(1, Math.abs(m.drift) / 20), m.drift >= 0 ? 'ok' : 'warn');
    add('STRK',  si.days,                  'd',            Math.min(1, si.days / 20), si.days ? 'ok' : '');
    add('DEBT',  si.covered,               'd',            Math.min(1, si.covered / 5), si.covered ? 'warn' : '');
    add('CRED',  si.credits,               'd',            Math.min(1, si.credits / 4));
    add('FRZ',   m.frz,                    '/2',           m.frz / 2, m.frz ? '' : 'warn');
    add('WKS',   t.closed,                 '/52',          t.closed / 52);
    add('TASK',  t.tasksDone,              '/' + t.tasksAll, t.tasksAll ? t.tasksDone / t.tasksAll : 0);
    add('DAY',   m.doneMin,                '/' + m.goalMin + 'm', m.goalMin ? m.doneMin / m.goalMin : 0,
        m.goalMin && m.doneMin >= m.goalMin ? 'ok' : '');
    add('TMR',   '--:--',                  '',             0);          // живое значение подставляет tick()
    add('WK',    'W' + m.cw,               '/52',          m.cw / 52, 'acc');
    add('Q',     'Q' + m.q,                ' ' + m.qt.pct + '%', m.qt.pct / 100);
    add('QHRS',  m.qt.fact,                '/' + m.qt.plan, m.qt.plan ? m.qt.fact / m.qt.plan : 0);
    add('MS',    m.msIn,                   'd',            Math.max(0, 1 - m.msIn / 91), m.msIn <= 14 ? 'warn' : '');
    add('DAYS',  t.daysDone,               'd',            Math.min(1, t.daysDone / 364));
    add('RPO',   t.repos,                  '/8',           t.repos / 8);
    add('APP',   t.apps,                   '/60',          Math.min(1, t.apps / 60));
    add('INTV',  t.interviews,             '/5',           Math.min(1, t.interviews / 5), t.interviews ? 'ok' : '');
    add('ACH',   m.ach,                    '/' + m.achAll, m.achAll ? m.ach / m.achAll : 0, m.ach ? 'ok' : '');
    add('WHRS',  m.wkHours,                '/' + m.wkPlan, m.wkPlan ? m.wkHours / m.wkPlan : 0);
    add('WTSK',  m.wkTasks,                '/' + m.wkTasksAll, m.wkTasksAll ? m.wkTasks / m.wkTasksAll : 0);
    add('PART',  t.partial,                'w',            Math.min(1, t.partial / 8), t.partial ? 'warn' : '');
    add('MOVD',  t.moved,                  'w',            Math.min(1, t.moved / 8), t.moved ? 'warn' : '');
    add('AVG',   t.avg === null ? '—' : t.avg, '/5',       t.avg ? t.avg / 5 : 0);
    add('END',   m.endIn,                  'd',            1 - Math.min(1, m.endIn / 364));
    add('AVGD',  ws.avg,                   'm/d',          Math.min(1, ws.avg / 180), ws.avg >= 180 ? 'ok' : '');
    add('PEAK',  ws.peak,                  'm',            Math.min(1, ws.peak / 240));
    add('FULL',  ws.full,                  '/' + Z_WAVE_DAYS, ws.full / Z_WAVE_DAYS);
    if (m.anki) {
      add('RAW',  m.vRaw,   '',      Math.min(1, m.vRaw / 20), m.vRaw >= 20 ? 'warn' : '');
      add('RDY',  m.vReady, '',      Math.min(1, m.vReady / 20));
      add('EXP',  m.vExp,   '/1400', Math.min(1, m.vExp / 1400));
      add('DECK', m.vRaw + m.vReady + m.vExp, '', Math.min(1, (m.vRaw + m.vReady + m.vExp) / 1400), 'acc');
      add('PL',   m.vPl,    '',      Math.min(1, m.vPl / 300));
    }

    /* Ядро. Три дуги — три разных измерения одного трека, и они
       намеренно не совпадают: календарь идёт сам, часы — нет.

       Разорванные ободки, насечка и перекрестье прицела — статичные
       SVG-штрихи, ноль композиторских слоёв: это `stroke-dasharray`,
       а не элементы. Ровно тот приём, которым §3.10 заменил шесть
       десятков колец одной композицией, только в векторе. */
    const core = `<div class="z-core">
      <div class="z-3d">
      <span class="z-ticks"></span>
      <span class="z-sweep"></span>
      <svg class="z-core-svg" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="z-seg"  cx="100" cy="100" r="95" pathLength="120"/>
        <circle class="z-brk"  cx="100" cy="100" r="80" pathLength="120"/>
        <path   class="z-cross" d="M100 3 v9 M100 197 v-9 M3 100 h9 M197 100 h-9"/>
        <circle class="z-rail" cx="100" cy="100" r="88" pathLength="100"/>
        <circle class="z-rail" cx="100" cy="100" r="72" pathLength="100"/>
        <circle class="z-rail" cx="100" cy="100" r="56" pathLength="100"/>
        <circle class="z-arc a1" cx="100" cy="100" r="88" pathLength="100" style="--p:${m.calPct}"/>
        <circle class="z-arc a2" cx="100" cy="100" r="72" pathLength="100" style="--p:${t.pct}"/>
        <circle class="z-arc a3" cx="100" cy="100" r="56" pathLength="100" style="--p:${m.goalMin ? Math.round(m.doneMin / m.goalMin * 100) : 0}"/>
      </svg>
      <span class="z-head" style="--a:${(m.calPct * 3.6).toFixed(1)}"><i></i></span>
      <span class="z-grid" aria-hidden="true"></span>
      <div class="z-core-txt">
        <b class="mono" data-decode="1">W${m.cw}</b>
        <span class="mono">${t.pct}% · ${t.hoursFact}ч</span>
        <span class="mono z-core-sub">${secEsc(QUARTERS[m.q].code)} · ${secEsc(QUARTERS[m.q].name)}</span>
      </div>
      </div>
    </div>`;

    /* Выноски по углам ядра. В разборе HUD Старка это названо прямо:
       приборы, которые не нужны сейчас, живут по краям мелкими, а в
       центр выходят те, что нужны. Линия-выноска рисуется CSS-границей,
       не элементом и не SVG поверх, — ноль лишних узлов.
       На узком экране гаснут: там ядро 132 px, и вешать на него подписи
       некуда, а сами числа никуда не деваются — они есть в россыпи. */
    const sat = (pos, k, v) =>
      `<span class="z-sat ${pos}"><i class="z-sat-k mono">${secEsc(k)}</i><b class="mono">${secEsc(String(v))}</b></span>`;
    const sats = `<div class="z-sats">
      ${sat('tl', 'CAL',   m.calPct + '%')}
      ${sat('tr', 'PACE',  m.pace + '%')}
      ${sat('bl', 'STRK',  m.si.days + 'd')}
      ${sat('br', 'MS',    m.msIn + 'd')}
    </div>`;

    /* Разброс по кварталам — отдельной строкой в спеке §12.3.
       Четыре независимых процента рядом: где просело, видно сразу,
       а по одному общему проценту года этого не увидеть никогда. */
    const spread = `<div class="z-qs">
      <span class="z-qs-lbl mono">SPREAD</span>
      ${m.qs.map(s => `<div class="z-q q${s.q}${s.q === m.q ? ' now' : ''}" style="--p:${s.pct}">
        <span class="z-q-k mono">Q${s.q}</span>
        <span class="z-q-bar"><span></span></span>
        <span class="z-q-v mono">${s.pct}%</span>
        <span class="z-q-u mono">${s.closed}/${s.total}w</span>
      </div>`).join('')}
    </div>`;

    const gauges = `<div class="z-gauges">
      ${this.gauge('yr',  t.pct,      'YEAR', 'g-acc')}
      ${this.gauge('day', m.goalMin ? m.doneMin / m.goalMin * 100 : 0, 'DAY', 'g-ok')}
      ${this.gauge('q',   m.qt.pct,   QUARTERS[m.q].code, 'g-q')}
      ${this.gauge('wks', t.weekPct,  'WEEKS', 'g-el')}
    </div>`;

    /* Подсказка оформлена как вывод терминала: приглашение, текст,
       мигающая каретка. Тот же язык, на котором уже говорит тренажёр
       DRILL (§10.2), — второго словаря заводить незачем.

       Класс `fresh` (он и несёт анимацию раскрытия) ставится только
       когда подсказка ДРУГАЯ. Иначе она вспыхивала бы заново на каждую
       галочку в чеклисте: rToday() зовётся на любое действие, и «одна
       подсказка за появление» превратилось бы в мигалку. */
    const fresh = adv && adv.id !== this._shownId ? ' fresh' : '';
    if (adv) this._shownId = adv.id; else this._shownId = null;

    const advHtml = adv
      ? `<div class="z-adv${fresh}" data-adv="${secEsc(adv.id)}">
           <span class="z-tag mono">zero:~$</span>
           <p>${secEsc(adv.text)}<i class="z-cur"></i></p>
           <button class="btn sm ghost z-ack" id="zAck">ACK</button>
           ${this.queue.length ? `<span class="z-qn mono dim">QUEUE ${this.queue.length}</span>` : ''}
         </div>`
      : `<div class="z-adv idle">
           <span class="z-tag mono">zero:~$</span>
           <p class="mono dim">all clear</p>
         </div>`;

    return `<div class="card zero" id="zeroBox">
      <i class="zc zc1"></i><i class="zc zc2"></i><i class="zc zc3"></i><i class="zc zc4"></i>
      <span class="z-scan" aria-hidden="true"></span>

      <div class="z-top">
        <span class="z-led"></span>
        <span class="z-name mono">ZERO</span>
        <span class="z-sub mono dim">${this.telemetry(m)}</span>
        <span class="spacer"></span>
        <span class="pill accent">${m.before ? 'STANDBY' : 'ONLINE'}</span>
      </div>

      ${advHtml}

      <div class="z-body">
        <div class="z-core-wrap">${core}${sats}</div>
        <div class="z-right">${gauges}${spread}</div>
      </div>

      <div class="z-wave">
        <canvas id="zWave" class="z-wave-c"></canvas>
        <div class="z-wave-lbl mono dim" id="zWaveLbl">${Z_WAVE_DAYS}d · min/day</div>
      </div>

      <div class="z-read">${cells.join('')}</div>

      <div class="z-tape"><div class="z-tape-in mono">${this.tape(m)}${this.tape(m)}</div></div>
    </div>`;
  },

  /* ══════════ ЖИЗНЬ ══════════ */

  /** Навешивает обработчики и заводит осциллограмму. Вызывается
   *  из rToday() сразу после вставки разметки. */
  wire(root) {
    const box = root ? root.querySelector('#zeroBox') : null;
    if (!box) return;

    const ack = box.querySelector('#zAck');
    if (ack) ack.onclick = () => { this.ack(); rToday(); };

    /* Числа калибров докручиваются от нуля — тем же countUp, что и
       остальные показатели проекта. Один rAF на 700 мс, не интервал. */
    Array.prototype.forEach.call(box.querySelectorAll('.z-g-num'), el => {
      countUp(el, +el.dataset.count || 0, '%');
    });

    /* Номер недели и подписи калибров проявляются расшифровкой глифами —
       тем же decodeText, что и заголовки разделов и слово в тренажёре
       (§10.2). Панель читается как экран, который сам себя набирает,
       а не как таблица. Эффект одноразовый: постоянных слоёв не даёт,
       и при prefers-reduced-motion decodeText выходит сразу. */
    Array.prototype.forEach.call(box.querySelectorAll('[data-decode], .z-g-lbl'), (el, n) => {
      setTimeout(() => { if (el.isConnected) decodeText(el); }, n * 60);
    });

    /* Луч развёртки идёт сверху вниз на всю высоту панели, а высота
       зависит от того, сколько показателей поместилось в строку.
       Отдаём её в CSS переменной: считать высоту кадрами нельзя,
       а зашивать константу — значит промахнуться на каждом экране. */
    const h = box.offsetHeight;
    if (h) box.style.setProperty('--z-h', h + 'px');

    this.stopWave();
    this.startWave(box);
    this.aim(box);
    this.tick();      // сразу подставить остаток таймера, если он идёт
  },

  /** Ядро смотрит на курсор: параллакс по слоям внутри перспективы.
   *
   *  Только под ПК и только при точном указателе — то же правило, что
   *  §4.1 задаёт всему оживлению: на телефоне оно выключается, там уже
   *  гасится половина фона ради памяти (§3.10). Плюс `preserve-3d`
   *  разводит слои ядра по отдельным композиторским поверхностям,
   *  а при DPR 3 это ровно тот расход, которого виджет избегает.
   *
   *  Ни одного обработчика на кадр: `pointermove` только запоминает
   *  координаты, запись в CSS идёт одним rAF. Без покоя ядро дрейфует
   *  само — кадрами CSS, без JS. */
  aim(box) {
    const core = box.querySelector('.z-core');
    if (!core || REDUCED || !this.wide() || isCoarse()) return;
    let raf = null, px = 0, py = 0;
    box.onpointermove = e => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        core.classList.add('aim');
        core.style.setProperty('--ry', (px * 24).toFixed(1) + 'deg');
        core.style.setProperty('--rx', (-py * 17).toFixed(1) + 'deg');
      });
    };
    box.onpointerleave = () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      core.classList.remove('aim');
      core.style.removeProperty('--rx');
      core.style.removeProperty('--ry');
    };
  },

  /** Порог, на котором §4.1 разрешает оживление, и тот же, на котором
   *  таббар меняется на сайдбар. Держится в CSS; здесь он нужен только
   *  чтобы не вешать слушатель там, где 3D всё равно выключено. */
  wide() {
    try { return window.matchMedia('(min-width: 880px)').matches; }
    catch (e) { return false; }
  },

  /** Осциллограмма. Один canvas, готовый path, перерисовка по rAF
   *  и только пока виджет виден: наблюдатель уже есть в проекте,
   *  здесь заводится свой, потому что тот отписывается после показа. */
  startWave(box) {
    const cv = box.querySelector('#zWave');
    if (!cv) return;
    this._cv = cv;
    this._data = (this._m || this.metrics()).wave;
    this._lbl = box.querySelector('#zWaveLbl');
    this._narrow = this.narrow();

    this.drawWave(0);
    if (REDUCED) return;               // движение погашено — остаётся картинка

    if (!('IntersectionObserver' in window)) { this._vis = true; this.loop(); return; }
    this._io = new IntersectionObserver(es => {
      const on = es.some(e => e.isIntersecting);
      if (on === this._vis) return;
      this._vis = on;
      if (on) this.loop(); else if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    }, { threshold: 0.01 });
    this._io.observe(cv);
  },

  stopWave() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this._io) { this._io.disconnect(); this._io = null; }
    this._vis = false;
  },

  loop() {
    if (this._raf) return;
    const step = now => {
      this._raf = null;
      if (!this._vis || !this._cv || !this._cv.isConnected) return;
      /* Развёртка идёт по стенным часам (§3.7): период 9 секунд,
         фаза берётся из now, а не из счётчика кадров. Пропущенные
         в фоне кадры её не сдвигают. На узком экране кадры
         прореживаются до ~20 в секунду — движение остаётся,
         работа втрое меньше. */
      const gap = this._narrow ? 48 : 0;
      if (now - this._last >= gap) { this._last = now; this.drawWave(now); }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  },

  narrow() {
    try { return window.matchMedia('(max-width: ' + Z_NARROW + 'px)').matches; }
    catch (e) { return false; }
  },

  drawWave(now) {
    const cv = this._cv, data = this._data;
    if (!cv || !data || !data.length) return;
    /* jsdom не умеет 2d-контекст без нативной зависимости и шумит в консоль.
       Тесту это знать не нужно, а виджету — тем более: нет контекста,
       нет осциллограммы, остальные показатели на месте. */
    let ctx = null;
    try { ctx = cv.getContext ? cv.getContext('2d') : null; } catch (e) { ctx = null; }
    if (!ctx || typeof ctx.setTransform !== 'function') return;

    const dpr = Math.min(Z_DPR_CAP, window.devicePixelRatio || 1);
    const w = Math.max(80, cv.clientWidth || 320);
    const h = Math.max(36, cv.clientHeight || 64);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const cyan = (css.getPropertyValue('--cyan') || '#22e3d4').trim();
    const line = (css.getPropertyValue('--line') || '#1b2739').trim();
    const amber = (css.getPropertyValue('--amber') || '#ffb020').trim();

    const norm = 180;                                     // дневная норма, 3 часа
    const peak = Math.max(norm, ...data.map(d => d.min));
    const pad = 4;
    const y = v => h - pad - (v / peak) * (h - pad * 2);
    const x = i => pad + (i / (data.length - 1)) * (w - pad * 2);

    // база: линия нормы
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Math.round(y(norm)) + 0.5); ctx.lineTo(w, Math.round(y(norm)) + 0.5); ctx.stroke();

    // столбики дней — сами по себе данные, без них ломаная висит в воздухе
    ctx.fillStyle = line;
    data.forEach((d, i) => { if (d.min) ctx.fillRect(x(i) - 1, y(d.min), 2, h - pad - y(d.min)); });

    // ломаная
    ctx.strokeStyle = cyan; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => { const px = x(i), py = y(d.min); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();

    if (REDUCED) return;

    /* Развёртка: вертикальный луч идёт слева направо и по дороге
       «читает» день, над которым проходит. Это не украшение — подпись
       под графиком меняется на настоящие дату и минуты. */
    const per = 9000;
    const ph = ((now || 0) % per) / per;      // фаза из самой метки времени
    const cx = pad + ph * (w - pad * 2);
    const idx = Math.min(data.length - 1, Math.round(ph * (data.length - 1)));
    const d = data[idx];

    const g = ctx.createLinearGradient(cx - 26, 0, cx, 0);
    g.addColorStop(0, 'rgba(34,227,212,0)');
    g.addColorStop(1, 'rgba(34,227,212,.22)');
    ctx.fillStyle = g; ctx.fillRect(cx - 26, 0, 26, h);
    ctx.strokeStyle = cyan; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

    ctx.fillStyle = d.min >= norm ? cyan : amber;
    ctx.beginPath(); ctx.arc(x(idx), y(d.min), 2.6, 0, Math.PI * 2); ctx.fill();

    if (this._lbl) {
      this._lbl.textContent = 'D-' + (data.length - 1 - idx) + ' · ' + fmtShort(d.day) + ' · ' + d.min + 'm';
    }
  },

  /** Живой остаток таймера в ячейке TMR. Своего интервала нет:
   *  вызывается из tPaint, который и так крутится, пока идёт отсчёт
   *  (§3.7). Таймер не запущен — в ячейке прочерк. */
  tick() {
    const cell = document.querySelector('#zeroBox .z-cell[data-k="TMR"]');
    if (!cell) return;
    const v = cell.querySelector('.z-v'), bar = cell.querySelector('.z-mb > span');
    if (!v) return;

    const run = typeof tRunning === 'function' && tRunning();
    const total = (typeof T === 'object' && T) ? (T.total || 0) : 0;
    const left = (typeof tLeft === 'function') ? tLeft() : 0;

    if (!total) { v.textContent = '--:--'; cell.classList.remove('ok', 'warn'); if (bar) bar.style.width = '0%'; return; }
    v.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    const p = Math.max(0, Math.min(1, 1 - left / total));
    if (bar) bar.style.width = Math.round(p * 100) + '%';
    cell.classList.toggle('ok', !run && left <= 0);
    cell.classList.toggle('warn', run && left <= 10);
  }
};
