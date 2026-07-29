/* ============================================================
   config.js — подключение Supabase

   Эти два значения публичные по замыслу Supabase. Publishable-ключ
   не секрет: он лишь идентифицирует проект. Доступ к данным режет
   Row Level Security на стороне сервера — политики в supabase.sql
   отдают строку только тому, у кого auth.uid() = user_id.

   Сюда НИКОГДА не попадают: пароль базы данных и service_role-ключ.
   ============================================================ */

const SUPABASE_URL = 'https://wfjskomrcipjgsaxekny.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oZRGYGKv-buZ8Pw75SOXTA_QbtjnTCh';

/** Адрес живого сайта. Ссылки из писем Supabase ведут сюда.
 *  Тот же адрес обязан быть прописан в Supabase → Authentication →
 *  URL Configuration → Site URL и Redirect URLs, иначе Supabase
 *  подменит его на localhost и ссылка из письма умрёт. */
const SITE_URL = 'https://youakey.github.io/soc-roadmap-365/';

/** При локальной разработке возвращаемся на localhost, в бою — на сайт. */
const AUTH_REDIRECT =
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin + location.pathname
    : SITE_URL;

/** Трек по умолчанию. Реальный активный трек выбирается на экране выбора
 *  и лежит в ROADMAP — треков может быть несколько. */
const ROADMAP_ID = 'cyber';
let ROADMAP = ROADMAP_ID;

/** Синхронизация включается только если оба значения заполнены. */
const SYNC_ENABLED =
  SUPABASE_URL.indexOf('supabase.co') > -1 && SUPABASE_ANON_KEY.length > 30;
