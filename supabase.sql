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


-- ─────────────── 9. ГРАНИЦЫ ДАННЫХ (аудит безопасности) ───────────────
-- Блок идемпотентный: только alter/create/drop policy, ни одного drop table (§3.9).
--
-- Зачем. Клиент считает агрегаты сам и отправляет их в public_stats через
-- обычный REST. RLS проверяет, ЧЬЯ строка, но не проверяет, ЧТО в строке.
-- То есть до этого блока любой вошедший мог одной командой
--   PATCH /rest/v1/public_stats  {"pct":100,"hours_fact":9999,"streak":9999}
-- и встать первым в рейтинге. Никакая обработка на клиенте — включая
-- шифрование localStorage — этот путь не закрывает: запрос идёт мимо
-- страницы. Границы обязаны стоять на сервере.
--
-- Валидация не делает накрутку невозможной: сервер не знает, сидел ли
-- человек над PCAP. Она делает её бессмысленной — выйти за пределы
-- физически возможного больше нельзя, а внутри пределов накрутка
-- не даёт преимущества, ради которого стоило бы возиться.

-- ── 9.1. Приводим существующие строки в границы, иначе ALTER не пройдёт ──
update public.public_stats s set
  pct          = least(greatest(coalesce(nullif(s.pct, 'NaN'), 0), 0), 100),
  hours_fact   = greatest(coalesce(nullif(s.hours_fact, 'NaN'), 0), 0),
  weeks_closed = greatest(coalesce(s.weeks_closed, 0), 0),
  tasks_done   = greatest(coalesce(s.tasks_done, 0), 0),
  streak       = greatest(coalesce(s.streak, 0), 0),
  current_week = greatest(coalesce(s.current_week, 1), 1)
where s.pct is null or s.pct = 'NaN'::numeric or s.pct < 0 or s.pct > 100
   or s.hours_fact is null or s.hours_fact = 'NaN'::numeric or s.hours_fact < 0
   or s.weeks_closed < 0 or s.tasks_done < 0 or s.streak < 0 or s.current_week < 1;

-- Ник и аватар тоже приводим в рамки: ALTER проверяет существующие строки.
update public.profiles set
  nickname = left(btrim(regexp_replace(nickname, '\s+', ' ', 'g')), 24)
where nickname <> left(btrim(regexp_replace(nickname, '\s+', ' ', 'g')), 24);

update public.profiles set nickname = nickname || '_'
where char_length(nickname) < 2;

-- Список ключей обязан совпадать с AVATARS в auth.js. Разойдутся —
-- сервер начнёт отвергать аватар, который клиент считает нормальным.
update public.profiles set avatar = 'shield'
where avatar not in ('shield','radar','bolt','rocket','terminal','eye');

-- ── 9.2. Жёсткие рамки на уровне типов ──
-- numeric в Postgres принимает 'NaN', и NaN = NaN истинно. Поэтому
-- нужна явная проверка <> 'NaN', иначе NaN проходит любые сравнения.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'public_stats_sane') then
    alter table public.public_stats add constraint public_stats_sane check (
      pct          between 0 and 100 and pct        <> 'NaN'::numeric
      and hours_fact >= 0            and hours_fact <> 'NaN'::numeric
      and hours_fact <= 100000
      and weeks_closed between 0 and 1000
      and tasks_done   between 0 and 100000
      and streak       between 0 and 20000
      and current_week between 1 and 1000
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_nickname_shape') then
    alter table public.profiles add constraint profiles_nickname_shape check (
      char_length(nickname) between 2 and 24
      and nickname !~ '[\s]{2,}'
      and nickname = btrim(nickname)
    );
  end if;

  -- Аватар пользователь задаёт сам. Клиент подставляет shield на неизвестный
  -- ключ, так что дыры нет, но мусору в базе делать нечего.
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_known') then
    alter table public.profiles add constraint profiles_avatar_known check (
      avatar in ('shield','radar','bolt','rocket','terminal','eye')
    );
  end if;
end $$;

-- ── 9.3. Кросс-проверка с треком и запрет подделки полей ──
-- BEFORE-триггер: сам переписывает user_id и updated_at, чтобы клиент
-- не мог назначить чужую строку или задним числом подвинуть время.
create or replace function public.public_stats_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r_weeks int;
  r_hours numeric;
  r_start date;
  elapsed int;
begin
  -- Владелец строки — только тот, кто пришёл с токеном. RLS это уже
  -- проверяет; здесь второй рубеж, на случай ошибки в политике.
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;

  -- Время ставит сервер. Клиентское updated_at игнорируется: иначе
  -- в рейтинге можно было бы вечно выглядеть «только что активным».
  new.updated_at := now();

  select total_weeks, total_hours, start_date
    into r_weeks, r_hours, r_start
  from public.roadmaps where id = new.roadmap_id;

  if r_weeks is null then
    raise exception 'Неизвестный трек: %', new.roadmap_id using errcode = '23503';
  end if;

  -- Больше недель, чем есть в треке, закрыть нельзя.
  new.weeks_closed := least(greatest(new.weeks_closed, 0), r_weeks);
  new.current_week := least(greatest(new.current_week, 1), r_weeks);

  -- Часы: перерабатывать можно, но не в десять раз против плана.
  new.hours_fact := least(greatest(new.hours_fact, 0), r_hours * 3);

  -- Streak не может быть длиннее, чем трек вообще идёт.
  elapsed := greatest((current_date - r_start)::int + 1, 1);
  new.streak := least(greatest(new.streak, 0), elapsed);

  new.pct := least(greatest(new.pct, 0), 100);

  return new;
end $$;

drop trigger if exists public_stats_guard_biu on public.public_stats;
create trigger public_stats_guard_biu
  before insert or update on public.public_stats
  for each row execute function public.public_stats_guard();

-- ── 9.4. Границы приватного прогресса ──
-- payload — свободный jsonb. Без верхней границы один аккаунт может
-- залить в базу сколько угодно. pg_column_size нельзя положить в CHECK
-- (функция stable, а CHECK требует immutable), поэтому триггер.
create or replace function public.progress_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.payload is null then
    new.payload := '{}'::jsonb;
  end if;
  if pg_column_size(new.payload) > 1048576 then
    raise exception 'Слишком большой payload: % байт, предел 1 МиБ',
      pg_column_size(new.payload) using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists progress_guard_biu on public.progress;
create trigger progress_guard_biu
  before insert or update on public.progress
  for each row execute function public.progress_guard();

-- ── 9.5. Свой трек нельзя сделать публичным ──
-- Политика «roadmaps insert own» разрешала вставку с is_public = true.
-- То есть любой вошедший мог опубликовать трек, и он появился бы на
-- экране выбора у всех остальных. Публикация — решение владельца
-- проекта, а не пользователя: она делается из SQL Editor.
-- Порядок важен: СНАЧАЛА создаём новые политики, ПОТОМ убираем старые.
-- Если делать наоборот и запрос порвётся между drop и create, таблица
-- останется без политики вовсе — RLS по умолчанию запрещает всё, и экран
-- выбора трека сломается. При таком порядке в худшем случае недолго
-- действуют обе, а это лишь мягче, но не опаснее.
create policy "roadmaps insert own private" on public.roadmaps
  for insert to authenticated
  with check (owner_id = auth.uid() and is_public = false);

create policy "roadmaps update own private" on public.roadmaps
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and is_public = false);

drop policy if exists "roadmaps insert own" on public.roadmaps;
drop policy if exists "roadmaps update own" on public.roadmaps;


-- ─────────────── 10. СЛОВАРЬ ANKI ───────────────
-- Раздел ANKI, спека в §10 PROJECT.md. Только create/alter, ни одного
-- drop table (§3.9). Блок идемпотентный, повторный запуск безопасен.
--
-- Почему отдельная таблица, а не progress.payload. Пять слов в день за год
-- дают больше тысячи записей. payload и так тащит весь прогресс одним jsonb
-- и упирается в предел 1 МиБ из блока 9.4. Отдельная таблица даёт ещё
-- сортировку и фильтры на сервере и не раздувает основную запись.
--
-- Приватность абсолютная. Слова из технических текстов — это карта того,
-- чего человек не знает. В public_stats и в leaderboard из этой таблицы
-- не уходит ничего, даже счётчик (§3.1).
--
-- ВНИМАНИЕ ПРИ ВЫПОЛНЕНИИ РУКАМИ: блок содержит create function с телом
-- в $$ … $$. SQL Editor режет отправку по точкам с запятой и молча рвёт
-- такое тело, показывая при этом СТАРЫЙ результат в панели (§9). Функцию
-- и триггер отправлять отдельным запуском, результат сверять с каталогом
-- (pg_proc, pg_trigger), а не с панелью.

create table if not exists public.vocab (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  deck        text not null default 'en',
  word        text not null,
  meaning     text default '',
  example     text default '',
  source      text default '',
  week        int,
  status      text not null default 'raw',
  created_at  timestamptz not null default now(),
  exported_at timestamptz
);

alter table public.vocab enable row level security;

-- Только владелец. Ни select, ни update чужого — никак, как у progress.
drop policy if exists "vocab own" on public.vocab;
create policy "vocab own" on public.vocab
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 10.1. Пара (колода, слово) — естественный ключ ──
-- Клиент пишет офлайн: слово ловится во время чтения документации, часто
-- без сети. Значит id, который выдаёт сервер, на момент захвата неизвестен,
-- и синхронизация не может опираться на него. Опирается на (user_id, deck,
-- word) — по этой же тройке идёт upsert, поэтому повторная отправка одной
-- и той же карточки не создаёт дубль, даже если ответ сервера потерялся.
-- Одно слово в двух колодах разрешено: deck входит в ключ.
--
-- Индекс СТРОГО по колонкам, без lower() и без btrim().
-- Первая версия была `(user_id, deck, lower(btrim(word)))` — красивее,
-- потому что ловила и «Beacon» при живом «beacon». И она не работает:
-- PostgREST передаёт on_conflict списком имён колонок и физически
-- не может выразить индекс по выражению, а Postgres на такое отвечает
-- «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification». Отправка падала целиком, dirty не снимался.
-- Регистр разбирает клиент, там же, где показывает сообщение о дубле;
-- пробелы срезает триггер ниже. Серверному индексу остаётся его
-- настоящая работа — сделать повторную отправку безвредной.
drop index if exists public.vocab_user_deck_word_idx;
create unique index if not exists vocab_user_deck_word_idx
  on public.vocab (user_id, deck, word);

-- Списки читаются пачкой по колоде и состоянию.
create index if not exists vocab_list_idx
  on public.vocab (user_id, deck, status, created_at);

-- ── 10.2. Границы значений ──
-- §8 требовал ограничить длины текстовых полей на уровне БД, а не только
-- в интерфейсе. Здесь это делается сразу, до первой строки: добавлять
-- ограничение к живым данным дороже.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_sane') then
    alter table public.vocab add constraint vocab_sane check (
      deck in ('en','pl')
      and status in ('raw','ready','exported')
      and char_length(btrim(word)) between 1 and 120
      and char_length(coalesce(meaning, '')) <= 500
      and char_length(coalesce(example, '')) <= 1000
      and char_length(coalesce(source,  '')) <= 200
      and (week is null or week between 1 and 1000)
    );
  end if;
end $$;

-- ── 10.3. Страж вставки ──
-- Два дела. Первое — прибить user_id к auth.uid(), как в progress_guard:
-- RLS проверяет, чья строка, но клиент всё равно её присылает.
-- Второе — верхняя граница на число строк. Без неё любой вошедший
-- получает неограниченный примитив записи в базу: RLS разрешает писать
-- свои строки, а «свои» можно наделать миллион. Пять слов в день за год —
-- меньше двух тысяч, так что 20 000 не помешает никому живому.
create or replace function public.vocab_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;

  new.word    := btrim(coalesce(new.word, ''));
  new.meaning := coalesce(new.meaning, '');
  new.example := coalesce(new.example, '');
  new.source  := coalesce(new.source,  '');

  -- Дата выгрузки не выдумывается клиентом: она либо есть, либо ставится
  -- сервером в тот момент, когда карточка стала exported.
  if new.status = 'exported' and new.exported_at is null then
    new.exported_at := now();
  end if;
  if new.status <> 'exported' then
    new.exported_at := null;
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.vocab where user_id = new.user_id) >= 20000 then
    raise exception 'Словарь переполнен: предел 20 000 карточек на аккаунт'
      using errcode = '54000';
  end if;

  return new;
end $$;

drop trigger if exists vocab_guard_biu on public.vocab;
create trigger vocab_guard_biu
  before insert or update on public.vocab
  for each row execute function public.vocab_guard();


-- ─────────────── 11. ПРОВЕРКА ───────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','roadmaps','enrollments','progress','public_stats','vocab')
order by tablename;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- трек на месте?
select id, title, total_weeks from public.roadmaps;

-- границы применились?
select conname from pg_constraint
where conname in ('public_stats_sane','profiles_nickname_shape','profiles_avatar_known','vocab_sane')
order by conname;

select tgname from pg_trigger
where tgname in ('public_stats_guard_biu','progress_guard_biu','vocab_guard_biu')
order by tgname;

-- у всех функций прибит search_path?
select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user','public_stats_guard','progress_guard','vocab_guard')
order by p.proname;

-- индексы словаря на месте? нужны оба: уникальный ключ и список
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'vocab'
order by indexname;
