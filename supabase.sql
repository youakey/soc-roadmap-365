-- ═══════════════════════════════════════════════════════════════
-- SOC ROADMAP — схема v2 (мультипользовательская, мультитрековая)
-- Выполнить целиком в Supabase → SQL Editor → New query → Run
-- Идемпотентно: можно запускать повторно.
--
-- ГЛАВНЫЙ ПРИНЦИП БЕЗОПАСНОСТИ
-- Приватное и публичное разделено на РАЗНЫЕ ТАБЛИЦЫ, а не на поля.
--   progress      — заметки, блокеры, отклики. Видит только владелец.
--   public_stats  — только агрегаты для рейтинга. Видят все вошедшие.
-- Так «показать рейтинг» физически не может утечь в «показать заметки».
-- ═══════════════════════════════════════════════════════════════

-- ─────────────── 1. ПРОФИЛИ ───────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null,
  avatar     text not null default 'shield',
  created_at timestamptz not null default now()
);

-- Ник уникален без учёта регистра
create unique index if not exists profiles_nickname_key
  on public.profiles (lower(nickname));

alter table public.profiles
  add constraint profiles_nickname_len check (char_length(nickname) between 2 and 24)
  not valid;

alter table public.profiles enable row level security;

drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);


-- ─────────────── 2. РОАДМАПЫ ───────────────
-- content — весь трек одним jsonb: недели, задачи, ресурсы, справочники.
create table if not exists public.roadmaps (
  id          text primary key,
  owner_id    uuid references auth.users(id) on delete set null,
  title       text not null,
  subtitle    text default '',
  accent      text default '#22e3d4',
  icon        text default 'shield',
  start_date  date,
  end_date    date,
  total_hours numeric default 0,
  total_weeks int default 0,
  content     jsonb not null default '{}'::jsonb,
  is_public   boolean not null default true,
  sort        int default 0,
  updated_at  timestamptz not null default now()
);

alter table public.roadmaps enable row level security;

drop policy if exists "roadmaps read public" on public.roadmaps;
create policy "roadmaps read public" on public.roadmaps
  for select to authenticated using (is_public or owner_id = auth.uid());

drop policy if exists "roadmaps insert own" on public.roadmaps;
create policy "roadmaps insert own" on public.roadmaps
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "roadmaps update own" on public.roadmaps;
create policy "roadmaps update own" on public.roadmaps
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());


-- ─────────────── 3. ЗАПИСИ НА ТРЕК ───────────────
create table if not exists public.enrollments (
  user_id    uuid not null references auth.users(id) on delete cascade,
  roadmap_id text not null references public.roadmaps(id) on delete cascade,
  started_at timestamptz not null default now(),
  is_active  boolean not null default true,
  primary key (user_id, roadmap_id)
);

alter table public.enrollments enable row level security;

drop policy if exists "enrollments own" on public.enrollments;
create policy "enrollments own" on public.enrollments
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ─────────────── 4. ПРОГРЕСС (ПРИВАТНО) ───────────────
create table if not exists public.progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  roadmap_id text not null references public.roadmaps(id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, roadmap_id)
);

alter table public.progress enable row level security;

-- Только владелец. Ни select, ни update чужого — никак.
drop policy if exists "progress own" on public.progress;
create policy "progress own" on public.progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ─────────────── 5. ПУБЛИЧНАЯ СТАТИСТИКА (РЕЙТИНГ) ───────────────
-- Ровно то, что игрок согласен показать: процент, часы, недели, streak.
-- Никаких заметок, блокеров и откликов здесь нет физически.
create table if not exists public.public_stats (
  user_id      uuid not null references auth.users(id) on delete cascade,
  roadmap_id   text not null references public.roadmaps(id) on delete cascade,
  pct          numeric not null default 0,
  hours_fact   numeric not null default 0,
  weeks_closed int not null default 0,
  tasks_done   int not null default 0,
  streak       int not null default 0,
  current_week int not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (user_id, roadmap_id)
);

alter table public.public_stats enable row level security;

drop policy if exists "stats read all" on public.public_stats;
create policy "stats read all" on public.public_stats
  for select to authenticated using (true);

drop policy if exists "stats write own" on public.public_stats;
create policy "stats write own" on public.public_stats
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "stats update own" on public.public_stats;
create policy "stats update own" on public.public_stats
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists public_stats_board_idx
  on public.public_stats (roadmap_id, pct desc, hours_fact desc);


-- ─────────────── 6. ВИТРИНА РЕЙТИНГА ───────────────
-- Джойн статистики с ником и аватаром — одним запросом с клиента.
create or replace view public.leaderboard
with (security_invoker = true) as
select
  s.roadmap_id,
  s.user_id,
  p.nickname,
  p.avatar,
  s.pct,
  s.hours_fact,
  s.weeks_closed,
  s.tasks_done,
  s.streak,
  s.current_week,
  s.updated_at,
  rank() over (partition by s.roadmap_id order by s.pct desc, s.hours_fact desc) as place
from public.public_stats s
join public.profiles p on p.id = s.user_id;

grant select on public.leaderboard to authenticated;


-- ─────────────── 7. АВТОСОЗДАНИЕ ПРОФИЛЯ ───────────────
-- Ник берётся из метаданных регистрации; при коллизии добавляется суффикс.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
    split_part(new.email, '@', 1)
  );
  base := left(regexp_replace(base, '[^\w\-\. ]', '', 'g'), 20);
  if char_length(base) < 2 then base := 'player'; end if;

  candidate := base;
  while exists (select 1 from public.profiles where lower(nickname) = lower(candidate)) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, nickname, avatar)
  values (new.id, candidate, coalesce(nullif(new.raw_user_meta_data->>'avatar',''), 'shield'))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────────── 8. СИД ТРЕКА «КИБЕРБЕЗ» ───────────────
-- progress, enrollments и public_stats ссылаются на roadmaps по внешнему ключу.
-- Без этой строки первая же запись прогресса падает с ошибкой FK.
-- content пока пуст: 52 недели живут в data-weeks.js и мигрируют в базу
-- отдельным заходом (§3.2 PROJECT.md). owner_id = null — трек общий.
insert into public.roadmaps
  (id, title, subtitle, accent, icon, start_date, end_date, total_hours, total_weeks, is_public, sort)
values
  ('cyber', 'SOC Roadmap 365', 'Junior SOC Analyst за 52 недели',
   '#22e3d4', 'shield', '2026-08-03', '2027-08-01', 631, 52, true, 0)
on conflict (id) do nothing;


-- ─────────────── 9. ПРОВЕРКА ───────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','roadmaps','enrollments','progress','public_stats')
order by tablename;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- трек на месте?
select id, title, total_weeks from public.roadmaps;
