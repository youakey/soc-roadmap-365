/* ============================================================
   boot.js — экран загрузки: 3D-голограмма из частиц (§12.6-ter)

   ── ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ИНЛАЙН ──────────────────────

   Первая редакция держала этот код инлайновым тегом <script>
   в index.html — ради «с первого кадра». Это было бы КАТАСТРОФОЙ
   на живом сайте: в `script-src` нет 'unsafe-inline' (§11), CSP
   отказала бы инлайну, `window.bootScreen` не определился бы вовсе,
   и экран загрузки завис бы НАВСЕГДА поверх приложения — вместе
   со своей же страховкой, которая лежала в том же заблокированном
   теге. Стенд этого не ловит: jsdom политику не применяет.

   Урок общий: проверка, которая не воспроизводит границу, границу
   и не проверяет. Разметка и стили остались инлайновыми —
   `style-src` держит 'unsafe-inline' вынужденно (§11), и картинка
   появляется мгновенно. Оживляет её этот файл, и он свой, с 'self'.

   ── ПОЧЕМУ CANVAS, А НЕ УЗЛЫ ────────────────────────────────

   Тысячи частиц узлами DOM — это тысячи слоёв композитора, и §3.10
   с §12.6 говорят прямо: бюджет считается по ПЛОЩАДИ анимируемых
   узлов. На A12-9720P (§2) это гарантированные рывки. Один <canvas>
   — один узел и одна текстура, сколько бы точек в нём ни рисовалось.

   Внутри — свой 3D: поворот матрицей и перспектива. Библиотек нет
   и быть не может: `script-src` пускает ровно один внешний файл,
   и это supabase-js (§11).

   ── ЧЕМ ОПЛАЧЕНЫ СЕМЬ ТЫСЯЧ ТОЧЕК ───────────────────────────

   Наивная отрисовка стоит на КАЖДУЮ точку: сборку строки
   'rgba(...)', разбор её браузером и смену состояния контекста.
   Семь тысяч смен `fillStyle` за кадр — это и есть та стена,
   в которую упирается «просто добавим ещё частиц».

   Здесь точки складываются в КОРЗИНЫ по паре (цвет, ступень
   прозрачности), а рисуется корзина одним `fill()` по общему пути.
   Строк 'rgba' ровно столько, сколько корзин, и они собраны заранее,
   один раз. Вместо семи тысяч смен состояния — меньше сотни.

   ── ТРИ ФАЗЫ, И ТРЕТЬЯ ПО ГОТОВНОСТИ ────────────────────────

   1. `in`    — точки слетаются с краёв экрана в фигуру.
   2. `hold`  — сфера дышит, по ней идёт ударная волна и скан.
                БЕСКОНЕЧНО, пока приложение поднимается.
   3. `blast` — цифровой взрыв: сжатие, разлёт, снап к сетке,
                хроматическое разделение. Потом слой снимается.

   Бесконечность второй фазы принципиальна: заставка обязана ждать
   столько, сколько идёт загрузка, а не столько, сколько назначено
   заранее. Иначе на медленной сети она отыграет и оставит человека
   смотреть в застывшую картинку.

   Всё время считается по СТЕННЫМ ЧАСАМ (§3.7): уход во вкладку
   и обратно не ломает фазу. Урок §12.6-bis применён сразу.
   ============================================================ */

'use strict';

(function () {
  var el = document.getElementById('boot');
  if (!el) return;

  var cv = document.getElementById('bootCv');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;

  var t0 = Date.now();
  /* MIN — не «сколько красиво», а «сколько нужно, чтобы сборка
     дочиталась». BLAST — длительность взрыва. MAX — страховка:
     незакрывшийся оверлей это белый экран, а не заставка (§12.6). */
  /* MIN — минимум показа. Взято под СРЕДНЮЮ загрузку, а не под
     красоту: сборка занимает 0.55 с, и 780 мс дают ей дочитаться
     плюс мгновение на «собрано». Если приложение не успело —
     фаза ожидания бесконечна и ждёт ровно столько, сколько нужно.
     То есть заставка подстраивается снизу порогом, а сверху —
     готовностью, и ни одна из границ не назначена «на глаз». */
  var MIN = 780, BLAST = 900, MAX = 6000;

  /* Три РАЗНЫХ признака, и путать их нельзя — первая версия путала,
     и `release()` возвращала `handled() === true`, то есть не
     возвращала ничего:
       killed — узел уже снят с экрана;
       want   — снятие заказано, но минимум показа ещё не вышел;
       used   — ЭТУ загрузку страницы экран закрыл собой. */
  var killed = false, want = false, used = false;
  var raf = 0, phase = 'in', blastAt = 0;

  var slow = false;
  try {
    slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
           window.matchMedia('(max-width: 700px)').matches;
  } catch (e) { /* нет matchMedia — считаем, что можно */ }

  /* Число точек. Узкий экран и «поспокойнее» уже отдали половину
     фона ради памяти (§4.1) — валить туда семь тысяч атомов значит
     получить слайд-шоу вместо голограммы. */
  var N = slow ? 1100 : 13000;
  var P = [];

  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* Палитра: циан — конструкция, янтарь — активные узлы, розовый —
     ядро, белёсый — поверхность сферы. Четыре цвета, а не десять:
     пёстрое читается как шум, а не как прибор. */
  /* Палитра: циан — конструкция, ЯДОВИТО-ЗЕЛЁНЫЙ — активные узлы
     (тот самый терминальный фосфор), КРАСНЫЙ — ядро и тревога,
     бледно-зелёный — поверхность сферы. Розовый убран: он читался
     как неон вывески, а не как терминал. Четыре цвета, а не десять:
     пёстрое читается как шум, а не как прибор. */
  var COL = [[45, 226, 230], [126, 255, 92], [255, 42, 58], [168, 240, 190]];

  /* ── Корзины отрисовки ────────────────────────────────────
     Ступеней прозрачности 20: глаз не отличает больше, а число
     корзин это ограничивает сверху. Строки собраны один раз. */
  /* Таблица мерцания. Math.sin на каждую точку каждый кадр — это
     тринадцать тысяч тригонометрий; таблица из 256 значений даёт
     ту же картинку за один индекс. Точка берёт свою ячейку по
     собственному смещению, поэтому фазы у них по-прежнему разные. */
  var FLK = new Float32Array(256), FLM = new Float32Array(256);
  (function () {
    for (var q = 0; q < 256; q++) {
      FLK[q] = 0.80 + 0.20 * Math.sin(q / 256 * TAU);
      FLM[q] = Math.sin(q / 256 * TAU) > -0.35 ? 1 : 0.24;
    }
  })();

  var STEPS = 20;
  var CSS = [], BUCK = [];
  (function () {
    for (var c = 0; c < COL.length; c++) {
      CSS[c] = [];
      for (var s = 0; s < STEPS; s++) {
        CSS[c][s] = 'rgba(' + COL[c][0] + ',' + COL[c][1] + ',' + COL[c][2] + ',' +
                    ((s + 1) / STEPS).toFixed(3) + ')';
        BUCK[c * STEPS + s] = [];
      }
    }
  })();

  /** Точка сферы/каркаса. Стартует ЗА краем экрана — «слетается
   *  со всех сторон», а не выплывает из-под соседнего угла. */
  function mk(x, y, z, col, size) {
    var a = Math.random() * TAU, d = rnd(0.85, 1.9);
    return {
      ring: 0, x: x, y: y, z: z, k: col, sz: size || 1,
      sx: Math.cos(a) * d, sy: Math.sin(a) * d,
      dl: Math.random() * 0.22, p: Math.random(),
      vx: 0, vy: 0, vz: 0, tw: 0, rr: 0, aa: 0, sp: 0, yy: 0, gl: Math.random(),
      /* Радиус от центра ПОСТОЯНЕН и нужен ударной волне каждый кадр.
         Тринадцать тысяч Math.sqrt на кадр — это ровно та цена,
         которую платят за «посчитаем на месте, так понятнее». */
      rad: Math.sqrt(x * x + y * y + z * z)
    };
  }

  /** Кольцевая точка живёт в ПОЛЯРНЫХ координатах своей плоскости
   *  и пересчитывается каждый кадр. Иначе независимое вращение колец
   *  не выразить вовсе: у модели один поворот на всех. */
  function ring(count, R, y, speed, col, size, gap) {
    for (var i = 0; i < count; i++) {
      /* `gap` рвёт кольцо на сегменты: сплошная линия из точек
         выглядит верёвкой, а прибор набран делениями. */
      if (gap && (Math.floor(i / gap[0]) % gap[1]) === 0) continue;
      P.push({
        ring: 1, rr: R + rnd(-2, 2), aa: i / count * TAU, sp: speed, yy: y,
        k: col, sz: size, p: Math.random(), gl: Math.random(),
        sx: 0, sy: 0, dl: 0, vx: 0, vy: 0, vz: 0, tw: 0, x: 0, y: 0, z: 0,
        rad: Math.sqrt((R) * (R) + y * y)
      });
    }
  }

  var RG = 152;                      // радиус сферы в единицах модели

  function build() {
    P.length = 0;
    var u = N / 13000, i, j, a;

    /* ── 1. ПОВЕРХНОСТЬ СФЕРЫ: плотная россыпь атомов ────────
       Главное, что просили: сфера должна СОСТОЯТЬ из множества
       мелких точек, а не из линий. Решётка Фибоначчи распределяет
       их по сфере равномерно, без сгущения у полюсов, которое даёт
       наивный перебор по sin/cos. */
    var surf = Math.round(7200 * u), golden = Math.PI * (3 - Math.sqrt(5));
    for (i = 0; i < surf; i++) {
      var yy = 1 - (i / (surf - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - yy * yy));
      a = golden * i;
      P.push(mk(Math.cos(a) * r * RG, yy * RG, Math.sin(a) * r * RG, 3, 0.85));
    }

    /* ── 2. СЕТКА ПОВЕРХ РОССЫПИ ─────────────────────────────
       Одна россыпь читается как шум: по ней не видно вращения.
       Широты и долготы дают глазу структуру. Вместе — «сфера
       из атомов, но со структурой», а не одно из двух. */
    var lat = Math.round(26 * u), lon = Math.round(34 * u);
    for (i = 1; i < lat; i++) {
      var ph = i / lat * Math.PI;
      var ry = Math.cos(ph) * RG, rr = Math.sin(ph) * RG;
      var cnt = Math.max(10, Math.round(86 * u * Math.sin(ph)));
      for (j = 0; j < cnt; j++) {
        a = j / cnt * TAU;
        P.push(mk(Math.cos(a) * rr, ry, Math.sin(a) * rr, 0, 1.15));
      }
    }
    for (i = 0; i < lon; i++) {
      var lo = i / lon * TAU, ca = Math.cos(lo), sa = Math.sin(lo);
      var cnt2 = Math.round(46 * u);
      for (j = 1; j < cnt2; j++) {
        var ph2 = j / cnt2 * Math.PI, rr2 = Math.sin(ph2) * RG;
        P.push(mk(ca * rr2, Math.cos(ph2) * RG, sa * rr2, 0, 1.0));
      }
    }

    /* ── 3. ВНУТРЕННЯЯ ОБОЛОЧКА И ПЫЛЬ ───────────────────────
       Сфера обязана быть ОБЪЁМНОЙ, а не скорлупой: сквозь неё
       должно просвечивать содержимое. */
    var inner = Math.round(1500 * u);
    for (i = 0; i < inner; i++) {
      var t2 = Math.random() * TAU, p2 = Math.acos(rnd(-1, 1)), q = RG * rnd(0.42, 0.78);
      P.push(mk(Math.sin(p2) * Math.cos(t2) * q, Math.cos(p2) * q, Math.sin(p2) * Math.sin(t2) * q, 3, 0.75));
    }

    /* Ядро — плотный светящийся сгусток в центре. */
    var core = Math.round(600 * u);
    for (i = 0; i < core; i++) {
      var t3 = Math.random() * TAU, p3 = Math.acos(rnd(-1, 1));
      var r3 = Math.pow(Math.random(), 0.45) * 34;
      P.push(mk(Math.sin(p3) * Math.cos(t3) * r3, Math.cos(p3) * r3, Math.sin(p3) * Math.sin(t3) * r3, 2, 1.7));
    }

    /* ── 4. КОЛЬЦА ПРИБОРА ───────────────────────────────────
       Каждое со своей скоростью и в свою сторону: одна скорость
       читалась бы как одна деталь. */
    ring(Math.round(420 * u), 182, 0, 0.40, 0, 1.5, [4, 4]);
    ring(Math.round(170 * u), 196, 0, -0.74, 1, 2.5, [1, 5]);
    ring(Math.round(380 * u), 214, 24, -0.28, 0, 1.3, [6, 3]);
    ring(Math.round(130 * u), 232, 24, 0.58, 1, 2.2, [1, 7]);
    ring(Math.round(340 * u), 258, -28, 0.19, 3, 1.1, [8, 2]);
    ring(Math.round(100 * u), 276, -28, -0.44, 1, 1.9, [1, 9]);
  }

  build();

  /* Янтарные узлы — те, между которыми рисуются линии связи
     и на которые садятся рамки захвата. Список снимается ОДИН раз:
     перебирать семь тысяч точек каждый кадр ради сорока — это та же
     ошибка, что искать иголку перебором стога на каждом кадре. */
  var NODES = [];
  for (var ni = 0; ni < P.length && NODES.length < 48; ni++) {
    if (P[ni].k === 1) NODES.push(P[ni]);
  }

  /* Падающий hex по краям — фон в том же холсте, а не слой поверх. */
  var RAIN = [];
  for (var ri = 0; ri < (slow ? 0 : 56); ri++) {
    RAIN.push({ x: Math.random(), y: Math.random() * -1, sp: rnd(0.16, 0.46),
                n: (Math.random() * 20 + 10) | 0 });
  }
  var HEX = '0123456789ABCDEF';

  /* Рамки захвата целей. */
  var TG = [{ i: 0, at: 0 }, { i: 1, at: 0 }, { i: 2, at: 0 }];

  /* ── Холст ─────────────────────────────────────────────────
     DPR ограничен двойкой: на «трёшке» площадь растёт вдвое,
     а разницы не видно (§3.10 про площадь, а не про число). */
  var W = 0, H = 0, DPR = 1;
  function size() {
    if (!cv) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    if (ctx) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', size);
  size();

  function frame() {
    raf = 0;
    if (!ctx || (killed && phase !== 'blast')) return;

    var now = Date.now();
    var t = (now - t0) / 1000;
    var half = Math.sqrt(W * W + H * H) / 2;
    var cx = W / 2, cy = H * 0.46;
    /* Масштаб от МЕНЬШЕЙ стороны: иначе на широком мониторе фигура
       упрётся в высоту, а на узком уедет за края. */
    var SC = Math.min(W * 0.42, H * 0.62) / 290;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    var i, b;
    for (i = 0; i < BUCK.length; i++) if (BUCK[i].length) BUCK[i].length = 0;

    /* Камера смотрит на кольца сверху под углом — тот вид приборной
       панели, где кольца читаются эллипсами. Крутится фигура,
       а не точка обзора. */
    var ry = t * 0.15, rx = 0.88 + Math.sin(t * 0.31) * 0.10;
    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var cosX = Math.cos(rx), sinX = Math.sin(rx);

    var bt = phase === 'blast' ? (now - blastAt) / BLAST : 0;
    /* Смещения по таблице считаются РАЗ на кадр, а не на точку. */
    var tf1 = (t * 3.1 / TAU * 256) | 0, tf2 = (t * 4.6 / TAU * 256) | 0;

    /* ── Пульсация ─────────────────────────────────────────
       Дыхание плюс УДАРНАЯ ВОЛНА: сферический фронт идёт от ядра
       наружу и подсвечивает те атомы, через которые проходит.
       Дыхание одно читалось бы как «картинка увеличивается»;
       волна читается как «прибор работает». */
    var breathe = 1 + Math.sin(t * 1.7) * 0.030;
    var waveR = ((t * 0.62) % 1) * RG * 1.25;      // радиус фронта
    var scanY = Math.sin(t * 0.85);                // раз на кадр, не на точку
    /* Перед самым взрывом сфера СЖИМАЕТСЯ и наливается светом —
       без замаха разлёт читается как исчезновение, а не как взрыв. */
    var charge = phase === 'blast' ? Math.max(0, 1 - bt / 0.16) : 0;
    var squeeze = 1 - charge * 0.14;
    var flash = charge * charge;

    for (i = 0; i < P.length; i++) {
      var p = P[i];

      if (p.ring) {
        var an = p.aa + p.sp * t;
        p.x = Math.cos(an) * p.rr; p.z = Math.sin(an) * p.rr; p.y = p.yy;
      }

      var k = breathe * squeeze;
      var X = p.x * k, Y = p.y * k, Z = p.z * k;

      if (phase === 'blast' && bt > 0.16) {
        /* Разгон, а не равномерный полёт: степень < 1 даёт резкий
           старт и лёгкое торможение к концу — так читается удар.
           Квадрат (как было) начинается медленно и выглядит
           всплытием. */
        var ee = Math.pow((bt - 0.16) / 0.84, 0.68);
        X += p.vx * ee; Y += p.vy * ee; Z += p.vz * ee;
        /* Кручение вокруг оси Y по дороге — траектория перестаёт
           быть лучом из центра. */
        var tw = p.tw * ee, ctw = Math.cos(tw), stw = Math.sin(tw);
        var tx = X * ctw + Z * stw; Z = -X * stw + Z * ctw; X = tx;
      }

      var x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY;
      var y1 = Y * cosX - z1 * sinX; z1 = Y * sinX + z1 * cosX;

      var per = 700 / (700 + z1 * SC);
      var px = cx + x1 * SC * per, py = cy + y1 * SC * per;

      var al = 1;
      if (phase === 'in') {
        var u2 = (t - (p.ring ? p.rr / 1200 : p.dl)) / 0.42;
        if (u2 <= 0) continue;
        if (u2 < 1) {
          var ea = 1 - Math.pow(1 - u2, 3);
          px = (cx + p.sx * half) + (px - (cx + p.sx * half)) * ea;
          py = (cy + p.sy * half) + (py - (cy + p.sy * half)) * ea;
          al = ea;
        }
      } else if (phase === 'blast') {
        /* Гаснут ПОЗДНО и быстро. Плавное затухание с самого начала
           съедало полёт: атом бледнел раньше, чем доходил до края,
           и разлёта не было видно вовсе. */
        al = bt < 0.55 ? 1 : Math.max(0, 1 - (bt - 0.55) / 0.45);
        /* ЦИФРОВОЙ характер взрыва: координаты снапаются к сетке,
           и часть атомов срывается по горизонтали ступенькой.
           Разлёт без этого выглядит фейерверком, а нужен распад
           изображения. */
        if (bt > 0.16) {
          var g = 3 + ((bt * 9) | 0);
          px = Math.round(px / g) * g;
          py = Math.round(py / g) * g;
          if (p.gl > 0.82) px += (p.gl * 900 % 60 - 30) * bt;
        }
      }
      if (al <= 0.02) continue;
      /* За краем экрана точку считать незачем: цвет, ступень
         и корзина стоят дороже самой проверки. На взрыве отсекается
         больше половины облака. */
      if (px < -8 || px > W + 8 || py < -8 || py > H + 8) continue;   // и на взрыве тоже: улетевшее рисовать незачем

      var dep = (z1 + 210) / 420;
      if (dep < 0) dep = 0; else if (dep > 1) dep = 1;

      /* Скан — полоса подсветки, идущая по фигуре сверху вниз. */
      var scan = 1 + 1.15 * Math.max(0, 1 - Math.abs((y1 / 190) - scanY) * 7);
      /* Ударная волна: подсвечен тот слой, где сейчас фронт. */
      var wv = 1 + 1.5 * Math.max(0, 1 - Math.abs(p.rad - waveR) / 26);
      /* Мерцание у янтарных узлов ступенчатое: плавное читается
         как «дышит», ступенчатое — как «сигнал». */
      var fi = p.k === 1 ? (tf1 + p.p * 856) & 255 : (tf2 + p.p * 368) & 255;
      var fl = p.k === 1 ? FLM[fi] : FLK[fi];

      var a2 = al * (0.34 + dep * 0.60) * scan * wv * fl + flash * 0.55;
      if (a2 > 1) a2 = 1;

      var sz = p.sz * per * (0.7 + dep * 0.65) * Math.max(0.9, SC * 0.85);
      if (phase === 'blast') sz *= 1 + bt * 1.4;

      var lvl = (a2 * STEPS) | 0;
      if (lvl < 0) lvl = 0; else if (lvl >= STEPS) lvl = STEPS - 1;
      b = BUCK[p.k * STEPS + lvl];
      b.push(px - sz / 2, py - sz / 2, sz);

      if (p.k === 1) { p.__x = px; p.__y = py; }
    }

    /* ── Отрисовка корзинами ───────────────────────────────
       Один `fill()` на корзину вместо семи тысяч смен состояния.
       Это и есть цена, за которую куплена плотность. */
    for (var c = 0; c < COL.length; c++) {
      for (var s = 0; s < STEPS; s++) {
        b = BUCK[c * STEPS + s];
        if (!b.length) continue;
        ctx.fillStyle = CSS[c][s];
        ctx.beginPath();
        for (i = 0; i < b.length; i += 3) ctx.rect(b[i], b[i + 1], b[i + 2], b[i + 2]);
        ctx.fill();
      }
    }

    /* ── КРАШ КАДРА ────────────────────────────────────────────
       Экран не гаснет, а РАЗВАЛИВАЕТСЯ. Все три артефакта делаются
       над УЖЕ нарисованным кадром, а не вторым проходом по тринадцати
       тысячам точек: `drawImage` с самого себя стоит одной операции
       композитора независимо от того, что на холсте.

       1. Хроматическое разделение — канал уехал.
       2. Разрыв полосами — картинка порвана по горизонтали.
       3. Шум — потеря сигнала. */
    if (phase === 'blast' && bt > 0.16 && !slow) {
      var dec = 1 - (bt - 0.16) / 0.84;          // артефакты слабеют к концу

      var off = (bt - 0.16) * 30;
      ctx.globalAlpha = 0.24 * dec;
      try {
        ctx.drawImage(cv, -off, 0, W, H);
        ctx.drawImage(cv, off, 0, W, H);
      } catch (e2) { /* холст ещё пуст — не беда */ }
      ctx.globalAlpha = 1;

      /* Разрыв полосами. Источник задаётся в пикселях устройства
         (холст физически такого размера), приёмник — в CSS-пикселях:
         setTransform уже масштабирует всё, что рисуется. Спутать их
         значило бы получить сдвиг, растущий с DPR. */
      ctx.globalCompositeOperation = 'source-over';
      var bands = 9;
      for (var q = 0; q < bands; q++) {
        if (Math.random() > 0.45 + dec * 0.3) continue;
        var by = Math.random() * H;
        var bh = 5 + Math.random() * 46;
        var dx2 = (Math.random() - 0.5) * W * 0.42 * dec;
        try {
          ctx.drawImage(cv, 0, by * DPR, cv.width, bh * DPR, dx2, by, W, bh);
        } catch (e3) { /* полоса вне холста */ }
      }

      /* Шум потери сигнала. Пятнадцать прямоугольников, а не пиксель
         за пикселем: попиксельный шум на 4K — это миллионы операций
         ради эффекта, который читается и с пятнадцати. */
      ctx.globalCompositeOperation = 'lighter';
      for (q = 0; q < 15; q++) {
        ctx.fillStyle = 'rgba(200,255,190,' + (Math.random() * 0.18 * dec).toFixed(3) + ')';
        ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * W * 0.5, 1 + Math.random() * 3);
      }
    }

    /* ── Хакерская обвязка ─────────────────────────────────
       Рисуется только в фазе ожидания: во время сборки и разлёта
       она мешала бы читать главное движение. */
    if (phase === 'hold') {
      ctx.lineWidth = 1;
      for (i = 0; i < NODES.length - 1; i += 2) {
        var A = NODES[i], B = NODES[i + 1];
        if (!A.__x || !B.__x) continue;
        if (Math.abs(A.__x - B.__x) + Math.abs(A.__y - B.__y) > W * 0.34) continue;
        ctx.strokeStyle = 'rgba(126,255,92,' + (0.10 + 0.10 * Math.sin(t * 2 + i)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(A.__x, A.__y); ctx.lineTo(B.__x, B.__y); ctx.stroke();
      }

      ctx.lineWidth = 1.4;
      for (i = 0; i < TG.length; i++) {
        var g2 = TG[i];
        if (now - g2.at > 1100 + i * 260) { g2.at = now; g2.i = (Math.random() * NODES.length) | 0; }
        var nd = NODES[g2.i];
        if (!nd || !nd.__x) continue;
        var age = (now - g2.at) / 1100;
        var rSz = 28 - age * 9;
        ctx.strokeStyle = 'rgba(255,42,58,' + (Math.min(1, age * 5) * (1 - age * 0.5) * 0.9).toFixed(3) + ')';
        var qx = nd.__x, qy = nd.__y, L = 9;
        for (var qi = 0; qi < 4; qi++) {
          var sxq = qi & 1 ? 1 : -1, syq = qi & 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(qx + sxq * rSz, qy + syq * rSz - syq * L);
          ctx.lineTo(qx + sxq * rSz, qy + syq * rSz);
          ctx.lineTo(qx + sxq * rSz - sxq * L, qy + syq * rSz);
          ctx.stroke();
        }
      }

      var sweep = (t * 0.5) % 1;
      var sy2 = cy - H * 0.36 + sweep * H * 0.72;
      var grd = ctx.createLinearGradient(0, sy2 - 28, 0, sy2 + 4);
      grd.addColorStop(0, 'rgba(45,226,230,0)');
      grd.addColorStop(1, 'rgba(45,226,230,.15)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - W * 0.32, sy2 - 28, W * 0.64, 32);
      ctx.fillStyle = 'rgba(170,255,250,.28)';
      ctx.fillRect(cx - W * 0.32, sy2, W * 0.64, 1);

      ctx.font = '11px ui-monospace,Menlo,monospace';
      for (i = 0; i < RAIN.length; i++) {
        var R2 = RAIN[i];
        R2.y += R2.sp * 0.006;
        if (R2.y > 1.3) { R2.y = -0.4; R2.x = Math.random(); }
        var edge = R2.x < 0.5 ? R2.x * 0.36 : 0.64 + (R2.x - 0.5) * 0.72;
        var rx2 = edge * W, ry2 = R2.y * H;
        for (var jj = 0; jj < R2.n; jj++) {
          var aH = (1 - jj / R2.n) * 0.34;
          if (aH < 0.02) continue;
          ctx.fillStyle = 'rgba(126,255,92,' + aH.toFixed(3) + ')';
          ctx.fillText(HEX[(Math.random() * 16) | 0], rx2, ry2 - jj * 13);
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    if (phase === 'in' && t > 0.7) phase = 'hold';
    if (phase === 'blast' && bt >= 1) return;
    raf = requestAnimationFrame(frame);
  }

  if (ctx && !slow) raf = requestAnimationFrame(frame);
  else if (ctx) { phase = 'hold'; frame(); }        // один статичный кадр

  /* Счётчик процентов. Считает по СТЕННЫМ ЧАСАМ (§3.7) и упирается
     в 99: показывать 100 %, пока приложение ещё поднимается, — это
     врать человеку. Сотня выставляется в момент готовности. */
  var pct = document.getElementById('bootPct');
  var pctT = pct ? setInterval(function () {
    if (!pct) return;
    var e = (Date.now() - t0) / 1000;
    var v = want ? 100 : Math.min(99, Math.round(100 * (1 - Math.exp(-e * 0.7))));
    pct.firstChild.nodeValue = v < 10 ? '0' + v : String(v);
    if (v >= 100) { clearInterval(pctT); pctT = 0; }
  }, 90) : 0;

  function kill() {
    if (killed || !el) return;
    killed = true;
    used = true;
    phase = 'blast';
    blastAt = Date.now();

    /* Скорость разлёта — наружу от центра, у каждого атома своя.
       Задаётся здесь, а не при создании: до взрыва она не нужна,
       а считать её каждый кадр незачем. */
    /* Скорость разлёта — ЕДИНИЧНЫЙ вектор от центра, умноженный
       на честную дальность. Первая версия делила координату
       на радиус и домножала на 0.02: получался вектор длиной
       в сотые доли, и при радиусе сферы 152 атом улетал на 30 —
       то есть гас, не сойдя с места. Взрыв выглядел затуханием,
       и это была арифметика, а не вкус.

       Дальность считается в единицах МОДЕЛИ и берётся с запасом:
       полудиагональ экрана в этих единицах — около 550, значит
       600…1900 гарантированно выносит атомы за края на любом
       мониторе. Разброс нужен, иначе облако летит скорлупой. */
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      var d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
      /* ХАОС, а не ровный шар. Чистый радиальный разлёт даёт
         расширяющуюся скорлупу — красиво, но читается как надувание,
         а не как взрыв. Поэтому направление СМЕШИВАЕТСЯ со случайным
         в своей для каждого атома пропорции, а разброс скоростей
         взят широким: часть осколков уходит мгновенно, часть
         ковыляет следом. Именно неодновременность и читается
         как взрыв. */
      var ra = Math.random() * TAU, rz = rnd(-1, 1);
      var rr3 = Math.sqrt(Math.max(0, 1 - rz * rz));
      var mix = rnd(0.30, 0.85);                  // доля радиального
      var sp2 = rnd(260, 2600) * (0.5 + Math.random() * Math.random() * 1.6);
      p.vx = ((p.x / d) * mix + Math.cos(ra) * rr3 * (1 - mix)) * sp2;
      p.vy = ((p.y / d) * mix + rz * (1 - mix)) * sp2;
      p.vz = ((p.z / d) * mix + Math.sin(ra) * rr3 * (1 - mix)) * sp2;
      /* Собственное кручение: атом не летит по прямой, его ведёт. */
      p.tw = rnd(-2.2, 2.2);
    }

    /* Звук взрыва просят отдельным событием, а не вызовом Sound:
       `Sound` объявлен через `const` и на `window` не лежит (§9),
       да и sound.js к моменту загрузки этого файла ещё не разобран.
       Слушатель висит в app.js, где Sound виден. */
    try { window.dispatchEvent(new CustomEvent('boot:blast')); } catch (e) { /* старый браузер */ }

    if (!raf && ctx && !slow) raf = requestAnimationFrame(frame);
    el.className = 'blast';
    setTimeout(function () { if (el) el.className = 'blast gone'; }, BLAST - 260);
    setTimeout(function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }   // иначе цикл переживёт узел
      if (pctT) { clearInterval(pctT); pctT = 0; }
      window.removeEventListener('resize', size);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null; ctx = null; cv = null; pct = null; P.length = 0; NODES.length = 0;
    }, BLAST + 340);
  }

  function done() {
    if (want) return;
    want = true;
    used = true;
    var left = MIN - (Date.now() - t0);
    if (left > 0) setTimeout(kill, left); else kill();
  }

  setTimeout(kill, MAX);

  window.bootScreen = {
    done: done, kill: kill,
    shown: function () { return !killed; },
    /* «Эту загрузку страницы я закрыл собой». Именно этот признак,
       а не `shown()`, спрашивает Fx.boot(). Разница вылезла на стенде:
       при медленной загрузке экран успевает доработать МИНИМУМ
       и уйти ДО того, как openApp доберётся до Fx.boot(), — и тогда
       `shown()` уже false, а Fx рисует второй оверлей поверх первого. */
    handled: function () { return used; },
    /* Выход из аккаунта возвращает право на заставку: узел #boot
       к этому моменту снят физически, и повторный вход в той же
       вкладке остался бы вовсе без загрузочной последовательности. */
    release: function () { used = false; },
    /* Для стенда: сколько атомов в облаке и в какой оно фазе. */
    stat: function () { return { n: P.length, phase: phase, slow: slow }; }
  };
})();
