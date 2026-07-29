-- ============================================================
-- SOC Roadmap 365 — схема для синхронизации
-- Выполнить один раз в Supabase → SQL Editor → New query → Run
-- ============================================================

-- Таблица прогресса: одна строка на пользователя
create table if not exists public.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────
-- Без этого anon-ключ (он публичный) дал бы доступ к чужим
-- данным. С этими политиками строку видит и меняет только
-- тот, кто вошёл под своей учётной записью.
alter table public.progress enable row level security;

drop policy if exists "own row select" on public.progress;
create policy "own row select" on public.progress
  for select using (auth.uid() = user_id);

drop policy if exists "own row insert" on public.progress;
create policy "own row insert" on public.progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.progress;
create policy "own row update" on public.progress
  for update using (auth.uid() = user_id)
           with check (auth.uid() = user_id);

drop policy if exists "own row delete" on public.progress;
create policy "own row delete" on public.progress
  for delete using (auth.uid() = user_id);

-- Индекс по времени обновления — пригодится, если появятся
-- несколько устройств и захочется смотреть, что свежее.
create index if not exists progress_updated_at_idx
  on public.progress (updated_at desc);

-- ── Проверка ────────────────────────────────────────────────
-- Должно вернуть 4 политики и rowsecurity = true
select tablename, rowsecurity from pg_tables where tablename = 'progress';
select policyname, cmd from pg_policies where tablename = 'progress';
