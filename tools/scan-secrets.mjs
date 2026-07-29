#!/usr/bin/env node
/* ============================================================
   scan-secrets.mjs — поиск секретов в репозитории.

   Почему не grep по словам. Первая версия проверки искала строку
   "service_role" и падала на комментарии, который объясняет, что
   service_role-ключа здесь быть не должно. Проверка, которая ругается
   на собственную документацию, бесполезна: её начинают отключать.

   Здесь ищутся ФОРМЫ секретов, а не слова о них:
     · JWT разбирается, payload декодируется, проверяется claim role;
     · ключи Supabase — по префиксу секретного формата;
     · приватные ключи, токены GitHub, ключи AWS — по их формату;
     · присваивание длинного значения переменной с говорящим именем.

   Публикуемый ключ (sb_publishable_…) не является находкой: он
   публичный по замыслу, доступ режет RLS. См. §11.1 PROJECT.md.
   ============================================================ */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github/ci']);
const SKIP_FILES = new Set(['scan-secrets.mjs']);   // сам себя не сканируем
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.json', '.md', '.sql',
                          '.yml', '.yaml', '.css', '.webmanifest', '.txt', '.svg']);

/* Паттерны склеены из частей нарочно: иначе файл сработал бы сам на себе. */
const SB_SECRET = new RegExp('sb' + '_secret_' + '[A-Za-z0-9_\\-]{20,}');
const PRIVATE_KEY = /-----BEGIN (?:[A-Z][A-Z ]{0,28})?PRIVATE KEY/;
const GH_TOKEN = new RegExp('gh[pousr]' + '_' + '[A-Za-z0-9]{36,}');
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;
/* Присваивание длинного значения переменной с говорящим именем.
   Ключевое слово должно стоять СЛЕВА от = или :, то есть быть именем,
   а не словом в предложении. */
const ASSIGNED = new RegExp(
  '(?:' + 'service' + '_role|SERVICE' + '_ROLE|SUPABASE' + '_SERVICE[A-Z_]*|' +
  'secret|password|passwd|api' + '_key|private' + '_key|access' + '_token)' +
  '\\s*[:=]\\s*[\'"`][A-Za-z0-9._\\-+/=]{20,}[\'"`]', 'i');
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;

const findings = [];
const warnings = [];

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  } catch { return null; }
}

async function walk(dir) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if ([...SKIP_DIRS].some(d => rel === d || rel.startsWith(d + '/'))) continue;
    const st = await stat(full);
    if (st.isDirectory()) { await walk(full); continue; }
    if (SKIP_FILES.has(basename(full))) continue;
    if (!TEXT_EXT.has(extname(full))) continue;
    if (st.size > 3_000_000) continue;
    await scan(full, rel);
  }
}

async function scan(full, rel) {
  const text = await readFile(full, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (SB_SECRET.test(line))   findings.push(`${at} — секретный ключ Supabase`);
    if (PRIVATE_KEY.test(line)) findings.push(`${at} — приватный ключ`);
    if (GH_TOKEN.test(line))    findings.push(`${at} — токен GitHub`);
    if (AWS_KEY.test(line))     findings.push(`${at} — ключ доступа AWS`);
    if (ASSIGNED.test(line))    findings.push(`${at} — длинное значение в переменной с говорящим именем`);
  });

  for (const token of text.match(JWT) || []) {
    const at = rel;
    const payload = decodeJwtPayload(token);
    if (!payload) { warnings.push(`${at} — не удалось разобрать JWT`); continue; }
    const role = String(payload.role || payload.sub || '');
    if (/service.?role/i.test(role)) {
      findings.push(`${at} — JWT с ролью service_role. Это полный обход RLS.`);
    } else if (/^anon$/i.test(role)) {
      warnings.push(`${at} — legacy anon-JWT. Работает, но лучше перейти на publishable-ключ.`);
    } else {
      warnings.push(`${at} — JWT с ролью "${role || 'без role'}", проверить вручную`);
    }
  }
}

await walk(ROOT);

if (warnings.length) {
  console.log('Предупреждения:');
  warnings.forEach(w => console.log('  ! ' + w));
}
if (findings.length) {
  console.error('\nНАЙДЕНЫ СЕКРЕТЫ:');
  findings.forEach(f => console.error('  ✗ ' + f));
  console.error('\nВытереть из истории, отозвать ключ, только потом чинить код.');
  process.exit(1);
}
console.log('✓ Секретов не найдено.');
