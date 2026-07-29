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

/** Синхронизация включается только если оба значения заполнены. */
const SYNC_ENABLED =
  SUPABASE_URL.indexOf('supabase.co') > -1 && SUPABASE_ANON_KEY.length > 30;
