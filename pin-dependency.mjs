#!/usr/bin/env node
/* ============================================================
   pin-dependency.mjs — пин единственной внешней зависимости.

   Проблема, которую он решает. В index.html supabase-js подключён
   по плавающему адресу @2. Добавить туда integrity нельзя: как только
   вышестоящий проект выпустит 2.x+1, jsdelivr отдаст другой файл,
   хэш не сойдётся, браузер откажется его выполнять — и сайт умрёт
   целиком, потому что без supabase-js нет входа.

   Поэтому порядок такой: сначала пин на точную версию, потом SRI.

   Режимы:
     node tools/pin-dependency.mjs          пин + запись хэша в index.html
     node tools/pin-dependency.mjs --check  проверка: хэш в файле = хэш с CDN
   Второй режим гоняет CI на каждый пуш.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const HTML = new URL('../index.html', import.meta.url);
const PKG = '@supabase/supabase-js';
const FILE = 'dist/umd/supabase.min.js';
const check = process.argv.includes('--check');

const fail = (m) => { console.error('✗ ' + m); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);

async function sri(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) fail(`CDN ответил ${r.status} на ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { hash: 'sha384-' + createHash('sha384').update(buf).digest('base64'), bytes: buf.length };
}

const html = await readFile(HTML, 'utf8');
const tag = html.match(/<script[^>]*supabase\.min\.js[^>]*><\/script>/);
if (!tag) fail('в index.html не найден тег supabase-js');

const pinned = tag[0].match(/supabase-js@(\d+\.\d+\.\d+)/);
const current = tag[0].match(/integrity="(sha384-[^"]+)"/);

if (check) {
  if (!pinned) fail('зависимость не запинена на точную версию — SRI поставить нельзя. Запусти без --check.');
  if (!current) fail(`версия ${pinned[1]} запинена, но integrity отсутствует. Запусти без --check.`);
  const url = `https://cdn.jsdelivr.net/npm/${PKG}@${pinned[1]}/${FILE}`;
  const { hash, bytes } = await sri(url);
  if (hash !== current[1]) {
    fail(`ХЭШ НЕ СОВПАЛ для ${pinned[1]}\n  в index.html: ${current[1]}\n  с CDN:        ${hash}\n` +
         `  Либо файл на CDN подменён, либо хэш в репозитории неверен. Разбираться руками.`);
  }
  ok(`SRI совпадает: ${PKG}@${pinned[1]}, ${bytes} байт`);
  process.exit(0);
}

// ── режим пина ──
const meta = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${PKG}/resolved?specifier=2`)
  .then(r => r.json()).catch(() => null);
const version = pinned ? pinned[1] : meta?.version;
if (!version) fail('не удалось узнать версию за плавающим @2');

const url = `https://cdn.jsdelivr.net/npm/${PKG}@${version}/${FILE}`;
const { hash, bytes } = await sri(url);

const fresh = `<script src="${url}"\n        integrity="${hash}"\n` +
              `        crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;
let out = html.replace(tag[0], fresh);

// CSP сужаем с префикса пути до конкретного файла
out = out.replace(
  /script-src 'self' https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/[^;]*/,
  `script-src 'self' ${url}`
);

// поднимаем версию ассетов: изменился index.html
const v = Math.max(...[...out.matchAll(/\?v=(\d+)/g)].map(m => +m[1]));
out = out.replaceAll(`?v=${v}`, `?v=${v + 1}`);

await writeFile(HTML, out);
ok(`запинено ${PKG}@${version} (${bytes} байт)`);
ok(`integrity=${hash}`);
ok(`CSP сужен до точного файла, версия ассетов ?v=${v + 1}`);
console.log('\nНе забудь: manifest.webmanifest тоже держит ?v= — подними вручную,\n' +
            'и залей index.html вместе с остальным (§9 PROJECT.md).');
