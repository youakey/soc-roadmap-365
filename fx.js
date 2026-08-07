/* ============================================================
   fx.js — спецэффекты (§12.6)

   Четыре штуки, и все четыре подчинены одному и тому же набору
   ограничений, выстраданному раньше. Их стоит держать перед
   глазами, потому что каждый эффект по отдельности выглядит
   безобидно, а вместе они ровно тот класс работы, который уже
   дважды ронял этот проект.

   1. CONTAINING BLOCK (§3.5-bis). `transform`, `filter`,
      `perspective`, `contain`, `will-change`, `content-visibility`
      у предка ломают `position: fixed` — таббар отклеивается.
      Поэтому ни один эффект НЕ вешает эти свойства на `#app`,
      `.layout`, `main` и `.view`. Экран загрузки лежит в `body`
      отдельным узлом, а не внутри `#app`; глитч живёт на карточке
      (у `.card` `transform` и так есть от `rise`, и это уже
      разобрано в §3.5-bis как безопасное).

   2. ПАМЯТЬ, А НЕ КАДРЫ (§3.10). Бюджет считается по ПЛОЩАДИ
      анимируемых узлов: каждый слой размером во весь экран при
      DPR 3 — это десятки мегабайт текстуры. Отсюда: экран
      загрузки живёт полторы секунды и удаляется; глитч — это
      два псевдоэлемента на одной карточке; волна по ядру Zero
      идёт по узлам, которые и так уже анимированы.

   3. ДВИЖЕНИЕ ГАСИТСЯ ЦЕЛИКОМ ПРИ prefers-reduced-motion (§4.1),
      и это НЕ то же самое, что звук (§12.5): звук остаётся.
      Проверка одна на файл — `Fx.off()`.

   4. НА ТЕЛЕФОНЕ ОЖИВЛЕНИЕ ВЫКЛЮЧЕНО (§4.1). Узкий экран уже
      отдал половину фона ради памяти; добавлять туда полноэкранные
      слои — прямой путь к рывкам на A12-9720P.

   5. КАДРЫ — CSS, БЕЗ setInterval (§3.7). JS здесь только ставит
      и снимает классы. Единственные таймеры в файле — одноразовые
      setTimeout на снятие класса, и у каждого есть страховка.
   ============================================================ */

'use strict';

const Fx = {
  _bootDone: false,

  /** Единственная проверка «эффекты выключены» на весь файл.
   *  Две причины: человек не выносит движение, либо экран узкий
   *  и память дороже красоты. Звук ни к одной из них отношения
   *  не имеет и продолжает работать. */
  off() {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
      if (window.matchMedia('(max-width: 700px)').matches) return true;
    } catch (e) { /* нет matchMedia — считаем, что можно */ }
    return false;
  },

  /** Снять класс через n мс, не накопив таймеров на одном узле.
   *  Без хранения хэндла быстрая серия событий оставила бы пять
   *  отложенных снятий, и первое же погасило бы последний эффект. */
  _flash(el, cls, ms) {
    if (!el) return;
    if (el._fxT) clearTimeout(el._fxT);
    el.classList.remove(cls);
    void el.offsetWidth;                    // перезапуск анимации
    el.classList.add(cls);
    el._fxT = setTimeout(() => {
      el.classList.remove(cls);
      el._fxT = null;
    }, ms);
  },

  /* ══════════ 1. ГЛИТЧ-РАЗРЯД ══════════
     Вешается на крупные события: закрытый блок, закрытая неделя,
     достижение. Картинка и звук пускаются из одного места, иначе
     они разъедутся во времени, а разряд, который слышно раньше,
     чем видно, читается как поломка.

     Сдвиг делается `translate`, а не `filter`: `filter` дал бы
     тот же вид дороже, и он же — в списке §3.5-bis. Цветоделение
     набирается двумя псевдоэлементами с `mix-blend-mode`, то есть
     двумя слоями на одной карточке, а не отдельными узлами. */
  glitch(el, withSound) {
    if (withSound !== false) Sound.glitch();
    if (this.off() || !el) return false;
    this._flash(el, 'fx-glitch', 460);
    return true;
  },

  /* ══════════ 2. ЗАГРУЗОЧНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ══════════
     Один раз за сессию, сразу после входа. Строки stdout
     появляются по очереди, снизу растёт полоса, в конце —
     разряд и уход.

     Узел кладётся в `body`, а НЕ в `#app`: у него `position: fixed`
     и собственная анимация, и внутри `#app` он сделал бы ровно ту
     мину, из-за которой таббар уезжал дважды (§3.5-bis).

     Пропускается нажатием и клавишей: полторы секунды заставки
     на каждом входе — это ровно та декорация ради декорации,
     против которой предупреждает §4. */
  boot() {
    if (this._bootDone) return false;
    this._bootDone = true;

    Sound.boot();
    if (this.off()) return false;
    if (document.getElementById('fxBoot')) return false;
    /* Экран загрузки из index.html (§12.6-ter) закрывает первый вход
       целиком и делает это РАНЬШЕ — ещё до того, как поднялись
       скрипты. Два оверлея подряд читаются как подвисание, поэтому
       здесь остаётся только звук.

       Совсем убирать эту ветку нельзя, и не из-за CI: в одной
       странице можно выйти и войти снова, и тогда узла #boot уже
       нет физически — второй вход остался бы без загрузочной
       последовательности вовсе. */
    if (window.bootScreen && window.bootScreen.handled()) return false;

    const lines = [
      'zero.core  ......  online',
      'telemetry  ......  linked',
      'roadmap    ......  52w loaded',
      'channel    ......  secure'
    ];
    const box = document.createElement('div');
    box.id = 'fxBoot';
    box.className = 'fx-boot';
    box.setAttribute('aria-hidden', 'true');
    /* Разметка собирается узлами, а не строкой: содержимое здесь
       своё и постоянное, но вставлять html там, где можно обойтись
       без него, — плохая привычка (§11.3). */
    const inner = document.createElement('div');
    inner.className = 'fx-boot-in mono';
    lines.forEach((t, i) => {
      const p = document.createElement('p');
      p.style.setProperty('--i', String(i));
      p.textContent = t;
      inner.appendChild(p);
    });
    const bar = document.createElement('span');
    bar.className = 'fx-boot-bar';
    inner.appendChild(bar);
    box.appendChild(inner);
    document.body.appendChild(box);

    const kill = () => {
      if (!box.isConnected) return;
      box.classList.add('out');
      setTimeout(() => { if (box.isConnected) box.remove(); }, 260);
    };
    box.addEventListener('pointerdown', kill);
    window.addEventListener('keydown', kill, { once: true });
    /* Страховка: что бы ни случилось с кадрами, экран уйдёт.
       Тот же приём, что у decodeText в app.js, и по той же
       причине — незакрывшийся оверлей запирает приложение. */
    setTimeout(kill, 1700);
    return true;
  },

  /** Выход из аккаунта возвращает право на загрузочную
   *  последовательность. Без этого ветка выше была бы мёртвой:
   *  `_bootDone` живёт до перезагрузки страницы, а узел #boot
   *  из index.html к тому моменту уже снят — и второй вход в той же
   *  вкладке остался бы вовсе без заставки. */
  rearm() { this._bootDone = false; },

  /* ══════════ 3. ВОЛНА ПО ЯДРУ ZERO ══════════
     Импульс расходится по трём дугам ядра и четырём калибрам,
     когда в панель приходит новое число.

     Волна НЕ трогает раскладку: класс висит на самом ядре,
     а кадры двигают только прозрачность и `box-shadow` уже
     существующих узлов. Новых слоёв не появляется — это прямое
     следствие §3.10, где записано, во что обходится каждый
     самостоятельный композиторский слой. */
  wave() {
    if (this.off()) return false;
    const core = document.querySelector('#zeroBox .z-core');
    if (!core) return false;
    this._flash(core, 'fx-wave', 900);
    const box = document.getElementById('zeroBox');
    if (box) this._flash(box, 'fx-pulse', 900);
    return true;
  },

  /* ══════════ 4. ДЕШИФРОВКА ЧИСЕЛ ══════════
     Показатели Zero перещёлкивают глифами перед новым значением —
     тем же приёмом, что заголовки разделов (decodeText в app.js).

     Здесь он свой, а не общий, по двум причинам. Во-первых,
     decodeText помечает узел `data-decoded` и второй раз его
     не трогает — а показателям положено дешифроваться при каждой
     смене. Во-вторых, у чисел алфавит другой: буквы среди цифр
     читаются как сбой шрифта, а не как расшифровка.

     Перебираются только те ячейки, чьё значение действительно
     изменилось: перерисовка сама по себе поводом не является
     (то же правило, что для звука в §12.5). */
  digits(root) {
    if (this.off()) return 0;
    const cells = Array.from((root || document).querySelectorAll('#zeroBox .z-cell'));
    let n = 0;
    cells.forEach((cell, idx) => {
      const v = cell.querySelector('.z-v');
      if (!v) return;
      const now = v.textContent;
      if (cell._fxPrev === undefined) { cell._fxPrev = now; return; }  // первый показ не мигает
      if (cell._fxPrev === now) return;
      cell._fxPrev = now;
      n++;
      this._scramble(v, now, idx * 18);
    });
    return n;
  },

  _scramble(el, target, delay) {
    if (el._fxRaf) { cancelAnimationFrame(el._fxRaf); el._fxRaf = null; }
    const GL = '0123456789#%$/\\<>';
    const len = target.length;
    if (!len || len > 12) return;
    /* Страховка на случай, если кадры не дойдут: текст вернётся
       в любом случае. Ровно как у decodeText (§9). */
    if (el._fxT) clearTimeout(el._fxT);
    el._fxT = setTimeout(() => { if (el.isConnected) el.textContent = target; }, 700 + delay);

    /* По СТЕННЫМ ЧАСАМ, а не по кадрам (§3.7). Счёт кадрами здесь
       той же породы, что в decodeText, и той же ценой: в скрытой
       вкладке `requestAnimationFrame` не идёт, и показатель застывает
       глифами до следующей смены значения — а показатель Zero может
       не меняться неделями. Возврат во вкладку теперь чинит себя сам:
       прошедшего времени больше отведённого, первый кадр пишет число
       (§12.6-bis). */
    const total = len * 2 + 6;
    /* Отсчёт начинается в момент ПЕРВОГО кадра, а не вызова: между
       ними стоит `delay`, и заведи мы точку отсчёта здесь — у дальних
       ячеек всё отведённое время вышло бы ещё до старта, и они
       перещёлкнули бы значение без единой промежуточной картинки. */
    let t0 = 0;
    const step = () => {
      const frame = (Date.now() - t0) / 17;
      if (frame >= total) { el.textContent = target; el._fxRaf = null; return; }
      let out = '';
      for (let i = 0; i < len; i++) {
        const ch = target.charAt(i);
        if (ch === ' ' || ch === '.' || ch === ':') { out += ch; continue; }
        const start = i * 2;
        if (frame > start + 4) out += ch;
        else out += GL.charAt((Math.random() * GL.length) | 0);
      }
      el.textContent = out;
      el._fxRaf = requestAnimationFrame(step);
    };
    setTimeout(() => { t0 = Date.now(); el._fxRaf = requestAnimationFrame(step); }, delay);
  }
};
