/* ============================================================
   config.js — подключение Supabase
   Эти два значения публичные по замыслу Supabase: anon-ключ
   безопасен в открытом коде, доступ к данным режет RLS
   (Row Level Security) на стороне сервера — строку видит
   только тот, кто вошёл под своей учётной записью.
   ============================================================ */

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

/** Синхронизация включается только если оба значения заполнены. */
const SYNC_ENABLED =
  SUPABASE_URL.indexOf('supabase.co') > -1 && SUPABASE_ANON_KEY.length > 40;
