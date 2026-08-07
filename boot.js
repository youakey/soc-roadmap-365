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

   Урок общий и стоит того, чтобы записать его здесь: проверка,
   которая не воспроизводит границу, границу и не проверяет.
   Разметка и стили остались инлайновыми — `style-src` держит
   'unsafe-inline' вынужденно (§11), и картинка появляется
   мгновенно. Оживляет её этот файл, и он свой, с 'self'.

   ── ПОЧЕМУ CANVAS, А НЕ УЗЛЫ ────────────────────────────────

   Тысячи частиц узлами DOM — это тысячи слоёв композитора, и §3.10
   с §12.6 говорят прямо: бюджет считается по ПЛОЩАДИ анимируемых
   узлов. На A12-9720P (§2) это гарантированные рывки. Один <canvas>
   — один узел и одна текстура, сколько бы точек в нём ни рисовалось.

   Внутри — свой 3D: точки поворачиваются матрицей и проецируются
   перспективой. Библиотек нет и быть не может: `script-src` пускает
   ровно один внешний файл, и это supabase-js (§11).

   ── ТРИ ФАЗЫ, И ТРЕТЬЯ ПО ГОТОВНОСТИ ────────────────────────

   1. `in`    — точки слетаются с краёв экрана в фигуру.
   2. `hold`  — фигура вращается в 3D, дышит, по ней идёт скан.
                БЕСКОНЕЧНО, пока приложение поднимается.
   3. `blast` — разлёт: каждая точка получает свою скорость наружу
                и гаснет. Только после этого слой снимается.

   Бесконечность второй фазы принципиальна: заставка обязана ждать
   столько, сколько идёт загрузка, а не столько, сколько назначено
   заранее. Иначе на медленной сети она отыграет и оставит человека
   смотреть в застывшую картинку.
   ============================================================ */

'use strict';

(function () {
  var el = document.getElementById('boot');
  if (!el) return;

  var cv = document.getElementById('bootCv');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;

  var t0 = Date.now();
  /* MIN — не «сколько красиво», а «сколько нужно, чтобы сборка
     дочиталась». BLAST — длительность разлёта. MAX — страховка:
     незакрывшийся оверлей это белый экран, а не заставка (§12.6). */
  var MIN = 1500, BLAST = 780, MAX = 7000;

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

  /* ── Точки ────────────────────────────────────────────────
     Число зависит от экрана и от того, просили ли поспокойнее.
     Узкий экран уже отдал половину фона ради памяти (§4.1),
     и валить в него две тысячи точек — прямой путь к рывкам. */
  var N = slow ? 500 : 3400;
  var P = [];

  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* Палитра: циан — конструкция, янтарь — активные узлы,
     розовый — ядро. Три цвета, а не десять: пёстрое читается
     как шум, а не как прибор. */
  var COL = [[45, 226, 230], [255, 176, 64], [255, 74, 168], [140, 205, 255]];

  /** Фигура — концентрические НАКЛОНЁННЫЕ кольца с делениями,
   *  как на приборной панели: каждое вращается со своей скоростью
   *  и в свою сторону. Разные скорости и есть то, что делает
   *  картинку сложной; одна скорость читалась бы как одна деталь.
   *
   *  Кольцевая точка хранится в ПОЛЯРНЫХ координатах своей
   *  плоскости и пересчитывается каждый кадр. Иначе независимое
   *  вращение колец не выразить вовсе: у модели один поворот. */
  function ring(count, R, y, speed, col, size, gap) {
    for (var i = 0; i < count; i++) {
      /* `gap` рвёт кольцо на сегменты — сплошная линия из точек
         выглядит верёвкой, а прибор набран делениями. */
      if (gap && (Math.floor(i / gap[0]) % gap[1]) === 0) continue;
      P.push({
        ring: 1, rr: R + rnd(-1.5, 1.5), aa: i / count * TAU, sp: speed, yy: y,
        k: col, sz: size, p: Math.random(),
        sx: 0, sy: 0, dl: 0, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0
      });
    }
  }

  function mk(x, y, z, col, size) {
    var a = Math.random() * TAU, d = rnd(0.8, 1.8);
    return {
      ring: 0, x: x, y: y, z: z, k: col, sz: size || 1.2,
      sx: Math.cos(a) * d, sy: Math.sin(a) * d,
      dl: Math.random() * 0.5, vx: 0, vy: 0, vz: 0, p: Math.random(),
      rr: 0, aa: 0, sp: 0, yy: 0
    };
  }

  function build() {
    P.length = 0;
    var u = N / 3400, i, a, j;

    /* Пять колец, разные радиусы, высоты, скорости и направления. */
    ring(Math.round(360 * u), 176, 0, 0.42, 0, 1.6, [4, 4]);    // деления обода
    ring(Math.round(150 * u), 190, 0, -0.78, 1, 2.6, [1, 5]);   // янтарные маяки
    ring(Math.round(340 * u), 208, 22, -0.3, 0, 1.4, [6, 3]);   // сегменты
    ring(Math.round(110 * u), 226, 22, 0.6, 1, 2.3, [1, 7]);
    ring(Math.round(300 * u), 250, -26, 0.2, 3, 1.2, [8, 2]);   // внешняя орбита

    /* ── Глобус: параллели и меридианы ──────────────────────
       Решётка Фибоначчи давала равномерную РОССЫПЬ, и читалась она
       как шум. Прибор читается сеткой: широты и долготы дают глазу
       структуру, по которой видно вращение. Это и есть разница
       между «облако точек» и «голограмма планеты». */
    var RG = 150;
    var lat = Math.round(16 * u), lon = Math.round(24 * u);
    for (i = 1; i < lat; i++) {
      var ph = i / lat * Math.PI;              // 0…π от полюса к полюсу
      var ry = Math.cos(ph) * RG, rr = Math.sin(ph) * RG;
      var cnt = Math.max(8, Math.round(64 * u * Math.sin(ph)));
      for (j = 0; j < cnt; j++) {
        a = j / cnt * TAU;
        P.push(mk(Math.cos(a) * rr, ry, Math.sin(a) * rr, 3, 1.05));
      }
    }
    for (i = 0; i < lon; i++) {
      var lo = i / lon * TAU;
      var ca = Math.cos(lo), sa = Math.sin(lo);
      var cnt2 = Math.round(34 * u);
      for (j = 1; j < cnt2; j++) {
        var ph2 = j / cnt2 * Math.PI;
        var rr2 = Math.sin(ph2) * RG;
        P.push(mk(ca * rr2, Math.cos(ph2) * RG, sa * rr2, 0, 0.95));
      }
    }

    /* Ядро — плотный светящийся шарик в центре глобуса. */
    var core = Math.round(140 * u);
    for (i = 0; i < core; i++) {
      var tt = Math.random() * TAU, ph3 = Math.acos(rnd(-1, 1)), r3 = Math.pow(Math.random(), .4) * 30;
      P.push(mk(Math.sin(ph3) * Math.cos(tt) * r3, Math.cos(ph3) * r3, Math.sin(ph3) * Math.sin(tt) * r3, 2, 2.0));
    }
  }

  build();

  /* Янтарные узлы — те, между которыми рисуются линии связи
     и на которые садятся рамки захвата. Список снимается ОДИН раз:
     перебирать всё облако каждый кадр ради сорока точек — это та же
     ошибка, что искать иголку перебором стога на каждом кадре. */
  var NODES = [];
  for (var ni = 0; ni < P.length && NODES.length < 44; ni++) {
    if (P[ni].k === 1) NODES.push(P[ni]);
  }

  /* Падающий hex по краям — фон, а не украшение поверх: колонки
     живут в том же холсте и потому ничего не стоят сверх него. */
  var RAIN = [];
  for (var ri = 0; ri < (slow ? 0 : 26); ri++) {
    RAIN.push({ x: Math.random(), y: Math.random() * -1, sp: rnd(0.16, 0.42),
                n: (Math.random() * 14 + 8) | 0, s: Math.random() });
  }
  var HEX = '0123456789ABCDEF';

  /* Цели захвата: три рамки, перескакивают на новые узлы. */
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
    if (!ctx || killed && phase !== 'blast') return;

    var now = Date.now();
    var t = (now - t0) / 1000;
    var half = Math.sqrt(W * W + H * H) / 2;
    var cx = W / 2, cy = H * 0.46;
    /* Модель нарисована в своих единицах (радиус глобуса 150),
       а показать её надо крупно на любом экране. Масштаб считается
       от МЕНЬШЕЙ стороны: иначе на широком мониторе фигура упрётся
       в высоту, а на узком уедет за края. */
    var SC = Math.min(W * 0.40, H * 0.60) / 260;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    /* Камера смотрит на кольца СВЕРХУ под углом — тот самый вид
       приборной панели, где кольца читаются эллипсами, а не
       окружностями. Наклон почти постоянный, качание мелкое:
       крутится сама фигура, а не точка обзора. */
    var ry = t * 0.16, rx = 0.92 + Math.sin(t * 0.34) * 0.09;
    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var cosX = Math.cos(rx), sinX = Math.sin(rx);

    var bt = phase === 'blast' ? (now - blastAt) / BLAST : 0;
    var breathe = 1 + Math.sin(t * 1.9) * 0.035;

    for (var i = 0; i < P.length; i++) {
      var p = P[i];

      /* Кольцевая точка живёт в полярных координатах своей
         плоскости: только так у колец получаются РАЗНЫЕ скорости. */
      if (p.ring) {
        var an = p.aa + p.sp * t;
        p.x = Math.cos(an) * p.rr; p.z = Math.sin(an) * p.rr; p.y = p.yy;
      }
      var X = p.x * breathe, Y = p.y * breathe, Z = p.z * breathe;
      if (phase === 'blast') {
        X += p.vx * bt * 900; Y += p.vy * bt * 900; Z += p.vz * bt * 900;
      }

      /* поворот Y, затем X */
      var x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY;
      var y1 = Y * cosX - z1 * sinX; z1 = Y * sinX + z1 * cosX;

      /* перспектива */
      var per = 640 / (640 + z1 * SC);
      var px = cx + x1 * SC * per, py = cy + y1 * SC * per;

      /* Сборка: экранная интерполяция от края к цели. Считается
         в экранных координатах, а не в модельных, — иначе «со всех
         сторон экрана» превращается в «из-под своего же угла». */
      var al = 1;
      if (phase === 'in') {
        var u = (t - (p.ring ? p.rr / 420 : p.dl)) / 0.95;
        if (u <= 0) continue;
        if (u < 1) {
          var e = 1 - Math.pow(1 - u, 3);
          px = (cx + p.sx * half) + (px - (cx + p.sx * half)) * e;
          py = (cy + p.sy * half) + (py - (cy + p.sy * half)) * e;
          al = e;
        }
      } else if (phase === 'blast') {
        al = Math.max(0, 1 - bt * 1.15);
      }

      if (al <= 0.01) continue;

      /* Глубина даёт и размер, и яркость: без этого облако плоское. */
      var dep = (z1 + 190) / 380;
      if (dep < 0) dep = 0; else if (dep > 1) dep = 1;
      var c = COL[p.k];
      var sz = p.sz * per * (0.65 + dep * 0.7) * Math.max(0.85, SC * 0.75);
      /* Скан — полоса подсветки, идущая по фигуре сверху вниз.
         Мерцание у янтарных узлов ступенчатое: плавное читается
         как «дышит», ступенчатое — как «сигнал». Нужно второе. */
      var scan = 1 + 1.2 * Math.max(0, 1 - Math.abs((y1 / 170) - Math.sin(t * 0.9)) * 7);
      var fl = p.k === 1
        ? (Math.sin(t * 3.1 + p.p * 21) > -0.35 ? 1 : 0.22)
        : (0.78 + 0.22 * Math.sin(t * 5 + p.p * 9));
      var a2 = al * (0.42 + dep * 0.58) * scan * fl;
      if (a2 > 1) a2 = 1;

      /* Свечение — второй, крупный и тусклый квадрат ПОД точкой.
         Дешевле любого filter/shadowBlur: тот пересчитывает всю
         область, а это ещё один fillRect в режиме сложения. */
      if (p.k === 1 || p.k === 2) {
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a2 * 0.16).toFixed(3) + ')';
        ctx.fillRect(px - sz * 2.2, py - sz * 2.2, sz * 4.4, sz * 4.4);
      }
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a2.toFixed(3) + ')';
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      /* Экранная позиция узла нужна обвязке ниже. Считать её там
         заново значило бы повторить весь поворот и проекцию. */
      if (p.k === 1) { p.__x = px; p.__y = py; }
    }

    /* ── Хакерская обвязка ────────────────────────────────────
       Всё рисуется ПОСЛЕ облака и только в фазе ожидания: во время
       сборки и разлёта она мешала бы читать главное движение. */
    if (phase === 'hold') {
      /* 1. Линии связи между янтарными узлами. Соседние по списку,
         а не все со всеми: полный перебор — это квадрат от числа
         узлов на каждом кадре, и он никому не нужен. */
      ctx.lineWidth = 1;
      for (i = 0; i < NODES.length - 1; i += 2) {
        var A = NODES[i], B = NODES[i + 1];
        if (!A.__x || !B.__x) continue;
        var d2 = Math.abs(A.__x - B.__x) + Math.abs(A.__y - B.__y);
        if (d2 > W * 0.34) continue;
        ctx.strokeStyle = 'rgba(255,176,64,' + (0.10 + 0.10 * Math.sin(t * 2 + i)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(A.__x, A.__y); ctx.lineTo(B.__x, B.__y); ctx.stroke();
      }

      /* 2. Рамки захвата. Перескакивают раз в ~1.1 с — это читается
         как «система ищет», а не как мигающий квадрат. */
      ctx.lineWidth = 1.4;
      for (i = 0; i < TG.length; i++) {
        var g = TG[i];
        if (now - g.at > 1100 + i * 260) { g.at = now; g.i = (Math.random() * NODES.length) | 0; }
        var nd = NODES[g.i];
        if (!nd || !nd.__x) continue;
        var age = (now - g.at) / 1100;
        var rSz = 26 - age * 8, aG = Math.min(1, age * 5) * (1 - age * 0.5);
        ctx.strokeStyle = 'rgba(255,176,64,' + (aG * 0.85).toFixed(3) + ')';
        var qx = nd.__x, qy = nd.__y, L = 8;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          ctx.beginPath();
          ctx.moveTo(qx + q[0] * rSz, qy + q[1] * rSz - q[1] * L);
          ctx.lineTo(qx + q[0] * rSz, qy + q[1] * rSz);
          ctx.lineTo(qx + q[0] * rSz - q[0] * L, qy + q[1] * rSz);
          ctx.stroke();
        });
      }

      /* 3. Радарная развёртка через всю фигуру. */
      var sweep = (t * 0.55) % 1;
      var sy = cy - H * 0.34 + sweep * H * 0.68;
      var grd = ctx.createLinearGradient(0, sy - 26, 0, sy + 4);
      grd.addColorStop(0, 'rgba(45,226,230,0)');
      grd.addColorStop(1, 'rgba(45,226,230,.16)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - W * 0.3, sy - 26, W * 0.6, 30);
      ctx.fillStyle = 'rgba(160,255,250,.30)';
      ctx.fillRect(cx - W * 0.3, sy, W * 0.6, 1);

      /* 4. Падающий hex по краям. Шрифт ставится один раз на кадр —
         смена font в цикле дороже самой отрисовки. */
      ctx.font = '11px ui-monospace,Menlo,monospace';
      for (i = 0; i < RAIN.length; i++) {
        var R2 = RAIN[i];
        R2.y += R2.sp * 0.006;
        if (R2.y > 1.3) { R2.y = -0.4; R2.x = Math.random(); }
        var edge = R2.x < 0.5 ? R2.x * 0.3 : 0.7 + (R2.x - 0.5) * 0.6;
        var rx2 = edge * W, ry2 = R2.y * H;
        for (var jj = 0; jj < R2.n; jj++) {
          var aH = (1 - jj / R2.n) * 0.26;
          if (aH < 0.02) continue;
          ctx.fillStyle = 'rgba(45,226,230,' + aH.toFixed(3) + ')';
          ctx.fillText(HEX[(Math.random() * 16) | 0], rx2, ry2 - jj * 13);
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    if (phase === 'in' && t > 1.5) phase = 'hold';
    if (phase === 'blast' && bt >= 1) return;      // разлёт кончился
    raf = requestAnimationFrame(frame);
  }

  /* Кадры считаются от стенных часов (§3.7), поэтому уход во вкладку
     и обратно не ломает фазу: `t` берётся из Date.now(), а не
     из числа отрисованных кадров. Урок §12.6-bis применён сразу. */
  if (ctx && !slow) raf = requestAnimationFrame(frame);
  else if (ctx) { phase = 'hold'; frame(); }        // один статичный кадр

  function kill() {
    if (killed || !el) return;
    killed = true;
    used = true;
    phase = 'blast';
    blastAt = Date.now();
    /* Скорость разлёта — наружу от центра, у каждой точки своя.
       Задаётся здесь, а не при создании: до взрыва она не нужна,
       а считать её каждый кадр незачем. */
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      var d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
      var k = rnd(0.7, 2.1) / d;
      p.vx = p.x * k * 0.012 + rnd(-0.05, 0.05);
      p.vy = p.y * k * 0.012 + rnd(-0.05, 0.05);
      p.vz = p.z * k * 0.012;
    }
    if (!raf && ctx && !slow) raf = requestAnimationFrame(frame);
    el.className = 'blast';
    setTimeout(function () { if (el) el.className = 'blast gone'; }, BLAST - 180);
    setTimeout(function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }   // иначе цикл переживёт узел
      if (pctT) { clearInterval(pctT); pctT = 0; }
      pct = null;
      window.removeEventListener('resize', size);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null; ctx = null; cv = null; P.length = 0;
    }, BLAST + 320);
  }

  function done() {
    if (want) return;
    want = true;
    used = true;
    var left = MIN - (Date.now() - t0);
    if (left > 0) setTimeout(kill, left); else kill();
  }

  /* Счётчик процентов. Считает по СТЕННЫМ ЧАСАМ (§3.7) и упирается
     в 99: показывать 100 %, пока приложение ещё поднимается, — это
     врать человеку. Сотня выставляется ровно в момент готовности. */
  var pct = document.getElementById('bootPct');
  var pctT = pct ? setInterval(function () {
    if (!pct) return;
    var e = (Date.now() - t0) / 1000;
    var v = want ? 100 : Math.min(99, Math.round(100 * (1 - Math.exp(-e * 0.75))));
    pct.firstChild.nodeValue = v < 10 ? '0' + v : String(v);
    if (v >= 100) { clearInterval(pctT); pctT = 0; }
  }, 90) : 0;

  setTimeout(kill, MAX);

  window.bootScreen = {
    done: done, kill: kill,
    shown: function () { return !killed; },
    /* «Эту загрузку страницы я закрыл собой». Именно этот признак,
       а не `shown()`, спрашивает Fx.boot(). Разница вылезла на стенде:
       при медленной загрузке экран успевает доработать МИНИМУМ
       и уйти ДО того, как openApp доберётся до Fx.boot(), — и тогда
       `shown()` уже false, а Fx рисует второй оверлей поверх первого.
       Человек видит два подряд и читает это как подвисание. */
    handled: function () { return used; },
    /* Выход из аккаунта возвращает право на заставку: узел #boot
       к этому моменту снят физически, и повторный вход в той же
       вкладке остался бы вовсе без загрузочной последовательности. */
    release: function () { used = false; },
    /* Для стенда: сколько точек в облаке и в какой оно фазе. */
    stat: function () { return { n: P.length, phase: phase, slow: slow }; }
  };
})();
