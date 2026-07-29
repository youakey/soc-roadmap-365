/* ============================================================
   security.js — общий слой защиты клиента. Грузится ПЕРВЫМ,
   до config.js и до всего остального: часть его работы имеет
   смысл только раньше прикладного кода.

   Что здесь и почему именно здесь:

   1. Фреймбастер. Директиву frame-ancestors нельзя задать через
      <meta>, она работает только заголовком, а GitHub Pages
      заголовки не отдаёт. Значит защита от кликджекинга —
      единственно возможным способом, на JS.

   2. Одно экранирование на весь проект. До этого их было два:
      esc() в app.js и escA() в auth.js. Две копии одной защиты
      расходятся молча — правят одну, забывают вторую.

   3. Аллоулист схем для ссылок. Экранирование НЕ защищает href:
      esc('javascript:alert(1)') возвращает строку без изменений,
      потому что запрещённых символов там нет.

   4. Разбор недоверенного JSON. JSON.parse + Object.assign — это
      загрязнение прототипа: у ключа "__proto__" в разобранном
      объекте есть [[Set]], и Object.assign его вызывает.
      Через импорт резервной копии это выполнимо.

   5. Чтение чужих объектов только по своим ключам. AVATARS['constructor']
      возвращает функцию, а не иконку.

   Слой намеренно не делает: шифрование localStorage. Ключ пришлось
   бы положить в этот же публичный файл, см. §11 PROJECT.md.
   ============================================================ */

'use strict';

/* ── 1. КЛИКДЖЕКИНГ ─────────────────────────────────────────
   Сайт не должен открываться внутри чужого фрейма: поверх него
   можно положить прозрачный слой и собирать чужие нажатия.
   Пробуем вырваться; если родитель на другом домене и бросает
   исключение — прячем документ, чтобы нечего было накрывать. */
(function frameGuard() {
  let framed;
  try { framed = window.top !== window.self; }
  catch (e) { framed = true; }          // доступ к top упал — значит фрейм чужой
  if (!framed) return;

  try {
    window.top.location = window.self.location;
    return;
  } catch (e) { /* вырваться не дали, работаем по второму сценарию */ }

  document.documentElement.style.display = 'none';
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.display = '';
    document.body.textContent = '';
    const p = document.createElement('p');
    p.style.cssText = 'font:14px system-ui;padding:24px;text-align:center';
    p.textContent = 'Страница не открывается внутри фрейма. ';
    const a = document.createElement('a');
    a.href = 'https://youakey.github.io/soc-roadmap-365/';
    a.target = '_top';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Открыть напрямую';
    p.appendChild(a);
    document.body.appendChild(p);
  });
})();

/* ── 2. ЭКРАНИРОВАНИЕ ───────────────────────────────────────
   Пять символов, а не четыре: одинарная кавычка нужна, потому
   что в шаблонах есть атрибуты в одинарных кавычках. */
const secEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/* ── 3. ССЫЛКИ ──────────────────────────────────────────────
   Возвращает адрес, годный для href, либо пустую строку.
   Разрешены только http, https и mailto. Всё остальное —
   javascript:, data:, vbscript:, blob:, file: — отсекается.
   Пустой href не навигирует никуда, это безопасный отказ.

   Разбор через конструктор URL, а не регуляркой: он сам
   разворачивает \t, перевод строки и прочие вставки, которыми
   маскируют "java\tscript:". */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];
function safeUrl(u) {
  if (u == null) return '';
  const raw = String(u).trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw, document.baseURI); }
  catch (e) { return ''; }
  if (SAFE_SCHEMES.indexOf(parsed.protocol) === -1) return '';
  return parsed.href;
}
/** Готовый атрибут: и схема проверена, и кавычки экранированы. */
function safeHref(u) { return secEsc(safeUrl(u)); }

/* ── 4. НЕДОВЕРЕННЫЙ JSON ───────────────────────────────────
   Reviver выбрасывает ключи, через которые лезут в прототип.
   Возвращает null, если разбор не удался: вызывающий сам решает,
   что делать с испорченными данными. */
const POLLUTING_KEYS = ['__proto__', 'constructor', 'prototype'];
function safeParse(text) {
  try {
    return JSON.parse(String(text), (key, value) => {
      if (POLLUTING_KEYS.indexOf(key) !== -1) return undefined;
      return value;
    });
  } catch (e) { return null; }
}

/** Копирует из src в target только заранее известные ключи.
 *  Ключ, которого нет в образце, не попадёт в состояние вообще —
 *  это защита и от загрязнения прототипа, и от мусора в кеше. */
function pickShape(target, src) {
  if (!src || typeof src !== 'object') return target;
  Object.keys(target).forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(src, k)) return;
    if (POLLUTING_KEYS.indexOf(k) !== -1) return;
    const v = src[k];
    if (v === undefined || v === null) return;
    if (Array.isArray(target[k]) && !Array.isArray(v)) return;
    if (!Array.isArray(target[k]) && typeof target[k] !== typeof v) return;
    target[k] = v;
  });
  return target;
}

/* ── 5. ЧТЕНИЕ ПО СВОИМ КЛЮЧАМ ──────────────────────────────
   Ключ приходит из базы: avatar и icon пользователь задаёт сам.
   Прямой доступ obj[key] достаёт и прототипные свойства. */
function own(obj, key, fallback) {
  if (obj && typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }
  return fallback;
}

/* ── 6. ЗАВИСИМОСТЬ С CDN ───────────────────────────────────
   SRI не даст загрузиться подменённому файлу, но тогда
   window.supabase просто не появится. Проверяем форму объекта
   и отказываем внятно, а не белым экраном. */
function dependencyReady() {
  return !!(window.supabase && typeof window.supabase.createClient === 'function');
}
