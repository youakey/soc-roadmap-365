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
   '#22e3d4', 'shield', '2026-08-10', '2027-08-08', 631, 52, true, 0)
on conflict (id) do nothing;

-- Даты трека обязаны совпадать с META в data.js (§12.1). Строка сидится
-- один раз, и `do nothing` выше её уже НЕ перезапишет — поэтому границы
-- обновляются явно. Это не про красоту: public_stats_guard берёт из
-- start_date потолок streak, и разошедшаяся дата тихо режет рейтинг.
-- Идемпотентно: повторный запуск ничего не меняет.
update public.roadmaps
   set start_date = '2026-08-10',
       end_date   = '2027-08-08'
 where id = 'cyber'
   and (start_date, end_date) is distinct from (date '2026-08-10', date '2027-08-08');


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


-- ─────────────── 11. СОДЕРЖАНИЕ ТРЕКА В roadmaps.content (§3.2) ───────────────
-- Блок идемпотентный: один update с условием, ни одного drop table (§3.9).
--
-- Зачем. 52 недели, кварталы, контрольные точки и распорядок дня жили
-- в data-weeks.js и data.js, то есть в коде. Пока они там, второго трека
-- физически некуда положить: трек — это строка в roadmaps, а строка
-- содержания не несёт. Всё остальное в §13 стоит за этим блоком.
--
-- Почему сеет SQL, а не клиент. §3.2 писалась как «засеется при первом
-- входе, идемпотентно». Так нельзя: RLS на roadmaps не даёт вошедшему
-- править чужой трек вовсе (блок 9.5 — публикация и правка общих треков
-- это решение владельца, а не пользователя), а открыть ему запись
-- значило бы вернуть ровно тот путь, ради закрытия которого писался
-- блок 9. Клиент содержание только ЧИТАЕТ. Разбор — §3.2-bis PROJECT.md.
--
-- Условие — ПО ВЕРСИИ, и это правка от 06.08.2026 (§13.2-bis).
-- Прежде здесь стояло «только если content пуст», и это работало
-- ровно один раз: после первого применения content непуст, и никакая
-- правка недель до базы больше не доезжает. Разделение «трек ↔ человек»
-- поменяло ФОРМУ содержания — в задачах появились подстановки
-- {{ключ}}, в meta появился sessionBlocks, — и старое условие оставило
-- бы живой проект на v1 навсегда. Поле `v` заведено ровно для этого.
--
-- На пустом content выражение даёт 0, поэтому одного запроса хватает
-- и новому проекту, и живому. Идемпотентность прежняя: повторный
-- запуск на той же версии возвращает ноль строк. Каст написан так,
-- чтобы не бросить исключение никогда: нечисловой `v` отсекается
-- проверкой jsonb_typeof до каста.
--
-- Цена записана честно: правка содержания ПРЯМО В БАЗЕ теперь обязана
-- поднимать `v`, иначе следующий --write её перезапишет.
--
-- Блоб генерируется, а не пишется руками:
--     node tools/seed-content.mjs --write
-- Он же сверяет производные с источником (подписи кварталов и даты
-- контрольных точек собраны из границ недель — §12.1-bis) и отказывается
-- печатать, если хоть одна разошлась. CI гоняет `--check`: без него блоб
-- здесь тихо разошёлся бы с data-weeks.js при первой же правке недель.
--
-- В литерале нет ни одной `;` и ни одной одинарной кавычки — они
-- записаны escape-последовательностями JSON, которые ::jsonb разворачивает
-- обратно. Это не эстетика: SQL Editor рвёт отправку по точкам с запятой
-- (§9), а в задачах недель их 27.
--
-- Личного (железо, бюджет, рынок труда) в content не заезжает: сюда идут
-- META, QUARTERS, DAILY, DAY_VARIANTS, MILESTONES и WEEKS, и только они.
-- То личное, что уже вросло в текст задач недель, остаётся на месте —
-- его вынимает §13.2 шаг 2, отдельным заходом.

-- >>> seed-content: сгенерировано tools/seed-content.mjs, руками не править
update public.roadmaps
   set content = '{"v":3,"meta":{"start":"2026-08-10","end":"2027-08-08","totalHours":630.8,"weeklyHours":12.9,"sessionWeeks":[24,25,45,46],"sessionBlocks":["polish","english","lab"],"examWeeks":{"13":"FOUNDATIONS EXAM","26":"AUTOMATION EXAM","39":"BLUE TEAM EXAM"}},"quarters":{"1":{"code":"Q1","name":"FOUNDATIONS","range":"W1–W13","dates":"10.08 – 08.11.2026","hours":167.7,"goal":"Networking, Linux, Windows, AD на уровне уверенного джуна. Home lab развёрнут.","principle":"Ты не «изучаешь сети», ты строишь и ломаешь сети. Ни одна неделя не заканчивается конспектом — только рабочим артефактом."},"2":{"code":"Q2","name":"AUTOMATION","range":"W14–W26","dates":"09.11.2026 – 07.02.2027","hours":147.7,"goal":"Python, Bash, Regex, SQL. Три рабочих security-скрипта в GitHub. MITRE ATT&CK освоен.","principle":"Ты учишь Python не как программист, а как аналитик: прочитать файл → распарсить строку → посчитать → выдать отчёт."},"3":{"code":"Q3","name":"BLUE TEAM CORE","range":"W27–W39","dates":"08.02 – 09.05.2027","hours":167.7,"goal":"Wazuh, ELK, Splunk. Анализ логов и трафика. 10+ разобранных инцидентов.","principle":"Квартал, ради которого существуют предыдущие два. Здесь ты перестаёшь быть студентом и становишься аналитиком."},"4":{"code":"Q4","name":"JOB READY","range":"W40–W52","dates":"10.05 – 08.08.2027","hours":147.7,"goal":"THM SOC L1 закрыт, BTLO, портфолио, CV, 60+ откликов, интервью.","principle":"Знания больше не наращиваются вширь. Всё конвертируется в доказательство компетентности."}},"daily":[{"id":"polish","name":"{{lang2t}}","min":10,"desc":"Duolingo (курс с английского, не с родного!) + Anki по второму языку. Мозг ещё холодный — идеально для механической памяти."},{"id":"english","name":"Cyber English","min":15,"desc":"7 мин Anki · 5 мин ввод 5 новых слов из технического текста · 3 мин сказать вслух 3 предложения."},{"id":"theory","name":"Теория","min":45,"desc":"Курс / глава книги / официальная документация. Обязательно с конспектом в Obsidian."},{"id":"lab","name":"Практика","min":100,"desc":"Терминал, VM, TryHackMe, код. Никакого потребления контента — только руки."},{"id":"recall","name":"Active recall","min":10,"desc":"Закрыл все окна → по памяти записал 5 фактов дня → обновил журнал."}],"dayVariants":[{"name":"Стандартный","when":"Минимум 3 дня в неделю","blocks":"10 / 15 / 45 / 100 / 10"},{"name":"Lab-heavy","when":"Пятница, THM-руммы. Не чаще 2 раз в неделю","blocks":"10 / 15 / 15 / 130 / 10"},{"name":"Theory-heavy","when":"Старт новой темы. Не чаще 2 раз в неделю","blocks":"10 / 15 / 90 / 50 / 15"},{"name":"Session mode","when":"W24, W25, W45, W46 и любой аврал — 1 час","blocks":"10 / 15 / 0 / 35 / 0"}],"milestones":[{"w":13,"date":"2026-11-08","name":"Foundations Exam","test":"Собираешь сеть в Packet Tracer с VLAN + DHCP + ACL\u003b ставишь Ubuntu Server с нуля и настраиваешь SSH + firewall + users по чек-листу без гуглинга.","targets":{"hours":168,"repos":2,"thm":30,"anki":300,"efset":"A2","rules":0,"cases":1,"apps":0}},{"w":26,"date":"2027-02-07","name":"Automation Exam","test":"Пишешь с нуля Python-скрипт, парсящий auth.log и выдающий top-10 IP по failed SSH, за ≤ 45 минут.","targets":{"hours":323,"repos":5,"thm":45,"anki":700,"efset":"A2+","rules":0,"cases":3,"apps":0}},{"w":39,"date":"2027-05-09","name":"Blue Team Exam","test":"Разбираешь незнакомый PCAP + Windows Event Log и пишешь incident report по шаблону за ≤ 2 часа.","targets":{"hours":491,"repos":7,"thm":70,"anki":1100,"efset":"B1-","rules":15,"cases":12,"apps":0}},{"w":52,"date":"2027-08-08","name":"Job Ready","test":"60+ откликов, ≥ 5 интервью, English B1+, портфолио из 8 репозиториев.","targets":{"hours":631,"repos":8,"thm":110,"anki":1400,"efset":"B1+","rules":20,"cases":25,"apps":60}}],"weeks":[{"w":1,"start":"2026-08-10","end":"2026-08-16","q":1,"topic":"Setup + OSI/TCP-IP model","tasks":["Установить весь стек — рабочее место: {{daily}} (§3.3)","Создать GitHub-аккаунт + репозиторий soc-journey","Настроить Obsidian vault со структурой 01-Networking / 02-Linux / 03-Windows / 04-Security / 99-Commands","Поставить гипервизор (Proxmox VE 8 или аналог). Железо: {{lab}}, {{ram}} ГБ памяти — рассчитывай на {{vm}} VM одновременно","THM room: What is Networking?, Intro to LAN","Prof. Messer — Network+ Section 1 (OSI)"],"hours":12.9,"deliverable":"Репозиторий soc-journey с README + скриншот работающего гипервизора"},{"w":2,"start":"2026-08-17","end":"2026-08-23","q":1,"topic":"TCP vs UDP, ports, handshake","tasks":["THM: OSI Model, Packets & Frames, Extending Your Network","Выучить наизусть 25 портов (Anki-колода делается своими руками, не скачивается)","tcpdump -i en0 -n \u0027tcp[tcpflags] & (tcp-syn) != 0\u0027 — поймать реальный three-way handshake","Wireshark: открыть свой capture, найти SYN / SYN-ACK / ACK, RST, FIN"],"hours":12.9,"deliverable":"ports-cheatsheet.md + PCAP с размеченным handshake"},{"w":3,"start":"2026-08-24","end":"2026-08-30","q":1,"topic":"IPv4 addressing & subnetting","tasks":["Дрилл: subnettingpractice.com — 20 задач/день, 5 дней = 100 задач. Цель — /26, /27, /28 в уме за 30 сек","Private ranges RFC1918, CIDR, NAT, broadcast/network address","Prof. Messer — IPv4 subnetting","Базовый IPv6: формат, link-local fe80::, зачем нужен"],"hours":12.9,"deliverable":"subnetting-drill.md — журнал 100 решённых задач с временем"},{"w":4,"start":"2026-08-31","end":"2026-09-06","q":1,"topic":"DNS + DHCP глубоко","tasks":["THM: DNS in Detail, Networking Core Protocols","Типы записей: A, AAAA, CNAME, MX, TXT, NS, PTR, SOA","dig, nslookup, host — 20 практических запросов, включая dig +trace google.com","DHCP DORA: поймать в Wireshark полный цикл (перезагрузить Wi-Fi адаптер с активным capture)","Security-угол: DNS tunneling, DNS exfiltration, fast flux — почему SOC смотрит DNS-логи первыми"],"hours":12.9,"deliverable":"PCAP с DORA + dns-records.md + список 5 DNS-based атак"},{"w":5,"start":"2026-09-07","end":"2026-09-13","q":1,"topic":"Routing, switching, VLAN","tasks":["Установить Cisco Packet Tracer (бесплатно через Cisco Networking Academy — регистрация на курс «Getting Started with Cisco Packet Tracer»)","Собрать топологию: 2 VLAN + router-on-a-stick + DHCP на роутере + ping между VLAN","Настроить и протестировать standard/extended ACL — заблокировать HTTP из VLAN10 в VLAN20","Static routing между 3 роутерами","Понять ARP, MAC-таблицу, show mac address-table"],"hours":12.9,"deliverable":".pkt файл топологии в GitHub + скриншот работающих ACL"},{"w":6,"start":"2026-09-14","end":"2026-09-20","q":1,"topic":"Application layer + Wireshark I","tasks":["HTTP-методы, коды ответов, headers (User-Agent, Referer, Cookie, X-Forwarded-For)","TLS handshake — поймать в Wireshark, найти SNI, посмотреть сертификат","SMTP/IMAP/POP3, SSH, FTP — понять, что передаётся в plaintext","Wireshark: display filters http.request, ip.addr==, tcp.port==, frame contains \"password\"","Скачать и разобрать 2 учебных PCAP с malware-traffic-analysis.net (раздел «Traffic Analysis Exercises», начни с самых старых — они проще)"],"hours":12.9,"deliverable":"wireshark-filters.md (30 фильтров) + краткий разбор 1 PCAP"},{"w":7,"start":"2026-09-21","end":"2026-09-27","q":1,"topic":"Linux I: FS, навигация, права","tasks":["Теория недели: Stepik «Введение в Linux» (курс 73) — пройти ЦЕЛИКОМ, 3 ч 36 мин видео + 84 теста. Ровно ложится в 45-минутный блок × 5 дней. Дальше практика:","Развернуть Ubuntu Server 24.04 LTS на lab box (без GUI — принципиально)","FHS: что лежит в /etc /var /usr /proc /opt /tmp","ls cd pwd cp mv rm find locate which — 50 команд из практики","Права: chmod в octal и symbolic, chown, umask, SUID/SGID/sticky bit. Security-угол: find / -perm -4000 -type f 2>/dev/null — почему SOC ищет SUID-бинарники","OverTheWire Bandit уровни 0–15"],"hours":12.9,"deliverable":"Bandit 0–15 пройдены, лог решений в bandit-writeup.md"},{"w":8,"start":"2026-09-28","end":"2026-10-04","q":1,"topic":"Linux II: users, processes, systemd","tasks":["Теория: Stepik «Linux — администрирование — Bash» (курс 181507), разделы про пользователей, права и процессы. Смотреть на 1,25–1,5x. Практика:","/etc/passwd, /etc/shadow, /etc/group, /etc/sudoers — разобрать каждое поле","useradd usermod passwd su sudo — создать 3 пользователя с разными правами","Процессы: ps aux, top/htop, kill, nice, /proc/<pid>/","systemctl — start/stop/enable/status, написать свой .service unit","OverTheWire Bandit 16–25"],"hours":12.9,"deliverable":"Свой systemd-сервис + linux-users-lab.md"},{"w":9,"start":"2026-10-05","end":"2026-10-11","q":1,"topic":"Linux III: сеть, пакеты, логи","tasks":["Теория: Stepik 181507, разделы про сеть, диагностику и пакеты (1,25–1,5x). Практика:","ip a, ip r, ss -tulpn, netstat, nmcli — статический IP на сервере","apt, репозитории, dpkg, ручная сборка из исходников","Логи — ядро недели: /var/log/auth.log, syslog, journalctl -u ssh -since \"1 hour ago\", rsyslog конфиг, logrotate","cron + at, security-угол: cron как persistence-механизм","Сгенерировать 200 failed SSH-попыток на свой сервер (hydra из Kali по локалке или простой bash-цикл) и найти их в auth.log"],"hours":12.9,"deliverable":"auth.log с реальными failed logins + linux-logs.md"},{"w":10,"start":"2026-10-12","end":"2026-10-18","q":1,"topic":"Linux IV: hardening + сборка сервера","tasks":["Теория: Stepik 181507, раздел про харденинг — он заявлен в программе курса и попадает в эту неделю точно. Практика:","SSH hardening: key-based auth, PermitRootLogin no, смена порта, AllowUsers","ufw / iptables — базовые правила, default deny","fail2ban — установить, настроить jail для sshd, посмотреть как он банит твою же атаку из W9","auditd — включить, добавить правило слежения за /etc/passwd, прочитать ausearch","Написать свой чек-лист харденинга на 25 пунктов"],"hours":12.9,"deliverable":"linux-hardening-checklist.md (25 пунктов) в GitHub"},{"w":11,"start":"2026-10-19","end":"2026-10-25","q":1,"topic":"Windows I: внутренности","tasks":["Развернуть Windows 10/11 VM на lab box","Архитектура: processes, threads, services, DLL, handles","Registry: hives HKLM/HKCU, ключи автозапуска Run, RunOnce, Winlogon — почему это первое место, куда смотрит аналитик","Sysinternals Suite: Process Explorer, Autoruns, Procmon, TCPView — по 30 мин на каждый","Event Viewer — первое знакомство: Security log, найти Event ID 4624 (успешный логон) и 4625 (неудачный)"],"hours":12.9,"deliverable":"windows-persistence-locations.md + скриншоты Autoruns"},{"w":12,"start":"2026-10-26","end":"2026-11-01","q":1,"topic":"Windows II: AD + PowerShell","tasks":["Поднять Windows Server 2019/2022 Evaluation (180 дней бесплатно с Microsoft Evaluation Center), роль AD DS, домен lab.local","Завести 5 users, 2 groups, 2 OU. Присоединить Windows 10 VM к домену","GPO: применить password policy и отключить USB-накопители — увидеть эффект на клиенте","PowerShell основы: Get-Process, Get-Service, Get-EventLog, Get-ADUser, pipeline, Where-Object","Security-угол: Kerberos в двух словах, что такое TGT, зачем атакующему krbtgt"],"hours":12.9,"deliverable":"Работающий домен lab.local + ad-lab-setup.md со скриншотами"},{"w":13,"start":"2026-11-02","end":"2026-11-08","q":1,"topic":"Core Security Concepts + EXAM","tasks":["CIA triad, AAA, defense in depth, least privilege, zero trust","Криптография для аналитика: symmetric vs asymmetric, hashing (MD5/SHA256), PKI, цифровая подпись — без математики, только применение","Cyber Kill Chain (Lockheed Martin) — 7 фаз, выучить наизусть","Типы атак: phishing, malware families, DDoS, MITM, SQLi, XSS — по одному абзацу на каждый","FOUNDATIONS EXAM (см. §Контрольные точки) — 3 часа в субботу"],"hours":12.9,"deliverable":"security-concepts.md + результат экзамена в progress.md"},{"w":14,"start":"2026-11-09","end":"2026-11-15","q":2,"topic":"Python I: синтаксис и control flow","tasks":["Курс: «Автоматизация рутинных задач с помощью Python» (Al Sweigart, automatetheboringstuff.com) — есть бесплатный русский перевод\u003b главы 1–3","Типы: int, float, str, bool\u003b f-strings\u003b ввод/вывод","if/elif/else, for, while, range, break/continue","20 микрозадач: конвертер CIDR→кол-во хостов\u003b проверка «валиден ли IPv4»\u003b генератор случайного пароля","Настроить VS Code + Python extension + venv"],"hours":12.9,"deliverable":"Репозиторий python-security-scripts с 20 микроскриптами"},{"w":15,"start":"2026-11-16","end":"2026-11-22","q":2,"topic":"Python II: функции, файлы, ошибки","tasks":["def, аргументы, *args/kwargs, return, scope","Работа с файлами: open(), context manager with, чтение построчно (критично для логов размером в гигабайты)","try/except/finally, типы исключений","Модули: os, sys, pathlib, argparse — скрипт с CLI-аргументами","Задача: скрипт, который читает auth.log из W9 и печатает количество строк со словом Failed"],"hours":12.9,"deliverable":"logcount.py с argparse"},{"w":16,"start":"2026-11-23","end":"2026-11-29","q":2,"topic":"Python III: структуры данных","tasks":["list, dict, set, tuple — когда какая","collections.Counter и defaultdict — главные инструменты аналитика логов","List/dict comprehensions","Сортировка: sorted(key=lambda), .most_common()","Задача: из auth.log вывести top-10 IP по числу failed logins с помощью Counter","json — читать и писать"],"hours":12.9,"deliverable":"top_failed_ips.py + вывод в JSON"},{"w":17,"start":"2026-11-30","end":"2026-12-06","q":2,"topic":"Regex + Python re","tasks":["Синтаксис: . * + ? [] () {} \\d \\w \\s ^ $ |, greedy vs lazy, capture groups, named groups (?P<ip>...)","Тренажёр: regex101.com (режим Python) + regexcrossword.com — 30 задач","re.search, re.findall, re.sub, re.compile","Написать regex для: IPv4, email, timestamp в syslog, URL, MD5/SHA256-хеш, Windows-путь, CVE-идентификатор","Переписать top_failed_ips.py через regex с named groups"],"hours":12.9,"deliverable":"regex-cookbook.md (15 паттернов с объяснением)"},{"w":18,"start":"2026-12-07","end":"2026-12-13","q":2,"topic":"Python IV: сеть и API","tasks":["socket — написать простейший TCP port scanner (только по своей лабораторной сети!)","requests — GET/POST, headers, status codes, timeout","Работа с API: зарегистрировать бесплатные ключи VirusTotal API и AbuseIPDB API","Скрипт: подать на вход список IP → получить AbuseIPDB confidence score → вывести таблицу","Rate limiting и обработка HTTP-ошибок"],"hours":12.9,"deliverable":"ioc-enricher.py — обогащение IP через AbuseIPDB"},{"w":19,"start":"2026-12-14","end":"2026-12-20","q":2,"topic":"Python V: PROJECT #1","tasks":["Проект «Log Triage Tool» — законченный CLI-инструмент: • на вход auth.log или Apache access.log\u003b • парсит через regex\u003b • считает top IP, top User-Agent, failed/success ratio\u003b • помечает IP, встречающиеся > N раз, как подозрительные\u003b • обогащает их через AbuseIPDB\u003b • выдаёт отчёт в CSV и в консоль. Требования к качеству: argparse, обработка ошибок, README на английском, requirements.txt, комментарии."],"hours":12.9,"deliverable":"Публичный репозиторий log-triage-tool с README и скриншотом вывода"},{"w":20,"start":"2026-12-21","end":"2026-12-27","q":2,"topic":"Bash I + текстовые фильтры","tasks":["Теория: Stepik 181507, разделы про написание скриптов на Bash — доедаешь хвост курса. Практика:","Shell: переменные, $1 $@ $?, кавычки, pipes, redirect > >> 2>&1","if, for, while, case, функции","Триада аналитика: grep (-i -v -E -r -c -A -B), awk ({print $1}, -F, NR, суммирование), sed (s///g, -n, диапазоны)","sort | uniq -c | sort -nr — идиома, которую ты будешь использовать всю карьеру","cut, tr, wc, head/tail -f, xargs, jq"],"hours":12.9,"deliverable":"bash-one-liners.md — 30 однострочников для анализа логов"},{"w":21,"start":"2026-12-28","end":"2027-01-03","q":2,"topic":"Bash II: PROJECT #2","tasks":["Проект «Linux Triage Script» — bash-скрипт первичного сбора данных с скомпрометированного хоста: • текущие пользователи и последние логины (last, lastlog)\u003b • прослушиваемые порты (ss -tulpn)\u003b • запущенные процессы + их бинарники\u003b • cron-задания всех пользователей\u003b • SUID-бинарники\u003b • последние 100 строк auth.log с failed logins\u003b • всё в timestamped-папку + tar.gz. Протестировать на своей Ubuntu-VM."],"hours":12.9,"deliverable":"Репозиторий linux-triage-script + пример вывода"},{"w":22,"start":"2027-01-04","end":"2027-01-10","q":2,"topic":"MITRE ATT&CK + Git/GitHub","tasks":["*Новогодняя неделя — намеренно поставлена низкозатратная по setup тема.*","attack.mitre.org — структура: Tactics → Techniques → Sub-techniques → Procedures","Выучить 14 Enterprise Tactics в порядке","Разобрать 10 техник детально, начиная с: T1059 Command and Scripting Interpreter, T1078 Valid Accounts, T1547 Boot or Logon Autostart, T1055 Process Injection, T1071 Application Layer Protocol","ATT&CK Navigator — построить свою layer-карту","THM: MITRE, Cyber Kill Chain, Unified Kill Chain, Pyramid of Pain","Git: branch, merge, .gitignore, PR, оформление README с бейджами"],"hours":12.9,"deliverable":"ATT&CK Navigator layer (JSON) + attack-notes.md на 10 техник"},{"w":23,"start":"2027-01-11","end":"2027-01-17","q":2,"topic":"SQL I","tasks":["sqlbolt.com — уроки 1–13 полностью","SELECT / WHERE / ORDER BY / LIMIT / DISTINCT","JOIN (INNER, LEFT), GROUP BY, HAVING, агрегаты COUNT/SUM/AVG/MAX","Установить SQLite локально, загрузить CSV с логами из своего проекта W19 и написать 15 аналитических запросов","Понять, почему SIEM-запросы (SPL, KQL, Lucene) — это идейно тот же SQL"],"hours":12.9,"deliverable":"sql-queries-for-logs.sql — 15 запросов с комментариями"},{"w":24,"start":"2027-01-18","end":"2027-01-24","q":2,"topic":"SESSION MODE","tasks":["Только: 10 мин Polish + 15 мин English + 35 мин лёгкая практика (Anki-повтор, 1 короткий THM room, чтение attack.mitre.org). Никаких новых тем. Никаких установок VM. Универ имеет приоритет."],"hours":2.9,"deliverable":"Streak не прерван"},{"w":25,"start":"2027-01-25","end":"2027-01-31","q":2,"topic":"SESSION MODE","tasks":["То же."],"hours":2.9,"deliverable":"Streak не прерван"},{"w":26,"start":"2027-02-01","end":"2027-02-07","q":2,"topic":"SQL II + OWASP Top 10 + EXAM","tasks":["Subqueries, UNION, индексы — зачем","SQL Injection изнутри: развернуть DVWA или OWASP Juice Shop (Docker) — годится повседневная машина ({{daily}}), выполнить SQLi вручную (\u0027 OR 1=1\u002d-, UNION-based). Цель — увидеть, как это выглядит в web-логе, а не научиться взламывать","OWASP Top 10 (2021) — по абзацу на каждый пункт + пример в Juice Shop для A01, A03, A07","AUTOMATION EXAM: с нуля, за ≤ 45 мин, написать Python-скрипт: читает незнакомый лог → regex-парсинг → top-10 IP по failed auth → вывод в JSON"],"hours":12.9,"deliverable":"owasp-top10-notes.md + скриншоты Juice Shop + результат экзамена"},{"w":27,"start":"2027-02-08","end":"2027-02-14","q":3,"topic":"Wazuh: развёртывание [LOCAL LAB]","tasks":["Лабораторная машина — {{lab}}. Wazuh 4.x all-in-one на Ubuntu Server (manager + indexer + dashboard). Требует ~4 ГБ RAM — это половина твоего запаса из {{ram}} ГБ, планируй остальное вокруг неё","Установить Wazuh agent на: Ubuntu-VM, Windows 10-VM, Windows Server","Разобрать интерфейс: Security Events, Integrity Monitoring, Vulnerabilities, MITRE ATT&CK view","Сгенерировать события: failed SSH, создание пользователя, изменение /etc/passwd — найти каждое в дашборде","THM: Intro to SIEM, Wazuh room"],"hours":12.9,"deliverable":"Работающий Wazuh с 3 агентами + скриншоты в home-soc-lab репо"},{"w":28,"start":"2027-02-15","end":"2027-02-21","q":3,"topic":"Wazuh: rules, decoders, FIM","tasks":["Анатомия правила: <rule id level>, <if_sid>, <match>, <regex>, <mitre>","Уровни 0–15 — что означает каждый","Написать 5 своих правил: (a) создание нового локального пользователя на Windows, (b) >5 failed SSH за 60 сек с одного IP, (c) запуск powershell.exe с -enc, (d) изменение файла в /etc/cron.d/, (e) очистка Windows Security log (EID 1102)","FIM (syscheck): настроить мониторинг /etc, C:\\Windows\\System32\\drivers\\etc\\hosts","Active Response: автоматический бан IP через firewall-drop"],"hours":12.9,"deliverable":"wazuh-custom-rules.xml — 5 своих правил с описанием"},{"w":29,"start":"2027-02-22","end":"2027-02-28","q":3,"topic":"Windows Event Logs — ядро SOC","tasks":["Каналы: Security, System, Application, PowerShell/Operational, Sysmon/Operational","Выучить наизусть Event ID: 4624 (logon + типы логона 2/3/10 — обязательно понимать разницу), 4625, 4634, 4648, 4672, 4688 (process creation + command line), 4697, 4720, 4726, 4732, 4768/4769 (Kerberos), 7045 (service install), 1102 (audit log cleared)","Включить Command Line Auditing и Advanced Audit Policy через GPO","Пробежаться по своей AD-лаборатории: создать юзера, добавить в Domain Admins, залогиниться по RDP — найти всю цепочку в логах","wevtutil, Get-WinEvent -FilterHashtable"],"hours":12.9,"deliverable":"windows-event-id-cheatsheet.md — 20 EID с описанием и примером"},{"w":30,"start":"2027-03-01","end":"2027-03-07","q":3,"topic":"Sysmon + Sigma","tasks":["Установить Sysmon с конфигом SwiftOnSecurity/sysmon-config (или Olaf Hartong Modular)","Ключевые Event ID Sysmon: 1 (process create), 3 (network connection), 7 (image loaded), 8 (CreateRemoteThread), 10 (process access), 11 (file create), 12/13/14 (registry), 22 (DNS query)","Форвардить Sysmon в Wazuh","Sigma: формат правила, logsource/detection/condition. Взять 5 готовых правил из репозитория SigmaHQ/sigma и разобрать построчно","Написать 2 своих Sigma-правила и сконвертировать через sigma-cli в запросы Splunk и Elastic"],"hours":12.9,"deliverable":"2 своих Sigma-правила в detection-rules репо"},{"w":31,"start":"2027-03-08","end":"2027-03-14","q":3,"topic":"ELK Stack: развёртывание [LOCAL LAB]","tasks":["Elasticsearch + Kibana через docker compose (годится и повседневная машина — {{daily}}: официальные образы есть под обе архитектуры)","Filebeat на Ubuntu-VM → отправка auth.log и syslog","Winlogbeat на Windows-VM → Security + Sysmon логи","Понять: index, document, field, mapping, index pattern / data view","Загрузить готовый датасет и построить первый Discover-запрос","THM: Investigating with ELK 101"],"hours":12.9,"deliverable":"docker-compose.yml для ELK в GitHub + скриншот входящих логов"},{"w":32,"start":"2027-03-15","end":"2027-03-21","q":3,"topic":"KQL / Lucene + дашборды","tasks":["Lucene: field:value, AND OR NOT, wildcards, ranges, _exists_","KQL (Kibana Query Language) — основной синтаксис","Построить дашборд «SOC Overview»: failed logons by user, top source IP, process creations by parent, DNS queries volume, alert timeline","Создать 3 Kibana alert rules","Понять ECS (Elastic Common Schema) — почему нормализация полей это половина работы SIEM-инженера"],"hours":12.9,"deliverable":"Экспорт дашборда (NDJSON) + скриншот в портфолио"},{"w":33,"start":"2027-03-22","end":"2027-03-28","q":3,"topic":"Splunk + SPL I","tasks":["Установить Splunk Enterprise Free (500 МБ/день индексации — бесплатно бессрочно)","SPL: search, fields, table, where, rename, sort, head","stats count by, dedup, top, rare, timechart","eval, rex (твой regex из W17 применяется здесь напрямую), lookup","Загрузить свой auth.log и повторить в SPL все 15 SQL-запросов из W23"],"hours":12.9,"deliverable":"spl-cheatsheet.md — 25 SPL-запросов"},{"w":34,"start":"2027-03-29","end":"2027-04-04","q":3,"topic":"Splunk BOTS: первое расследование","tasks":["Скачать Splunk Boss of the SOC (BOTS) v1 dataset (публичный, бесплатный) + список вопросов","Пройти сценарий APT (Scenario 1) — минимум 20 вопросов","Работать по методике, а не наугад: сформулировать гипотезу → выбрать sourcetype → построить SPL → зафиксировать вывод","Вести журнал расследования в формате будущего incident report","THM: Splunk 101, Splunk 2, Splunk 3"],"hours":12.9,"deliverable":"botsv1-investigation.md — полный writeup с SPL-запросами и выводами"},{"w":35,"start":"2027-04-05","end":"2027-04-11","q":3,"topic":"Wireshark advanced + NTA","tasks":["Display filters уровня аналитика: http.request.method, dns.qry.name, tls.handshake.extensions_server_name, tcp.analysis.flags, ip.geoip.country","Statistics → Conversations / Protocol Hierarchy / IO Graph, Follow TCP Stream, Export Objects → HTTP","Разобрать 4 PCAP с malware-traffic-analysis.net (свежие, 2023–2025) по полной методике: определить заражённый хост, время, malware family, C2-домены, извлечь payload","Признаки C2 beaconing: регулярные интервалы, jitter, малый размер пакетов, редкий User-Agent"],"hours":12.9,"deliverable":"4 PCAP-writeup в репо pcap-analysis"},{"w":36,"start":"2027-04-12","end":"2027-04-18","q":3,"topic":"Zeek + Suricata + Security Onion","tasks":["Установить Zeek — разобрать логи conn.log, dns.log, http.log, ssl.log, files.log, notice.log. Прогнать через них PCAP из W35","Suricata + ruleset Emerging Threats Open: прогнать те же PCAP, прочитать fast.log и eve.json","Написать 2 своих Suricata-правила (например: детект подозрительного User-Agent и DNS-запроса к .onion)","*Опционально, если позволяет железо ({{lab}}, {{ram}} ГБ):* Security Onion 2 — но честно оцени память, требуется 16 ГБ на саму VM\u003b если не тянет — работай с Zeek/Suricata отдельно, эффект тот же"],"hours":12.9,"deliverable":"2 своих Suricata-правила + zeek-logs-guide.md"},{"w":37,"start":"2027-04-19","end":"2027-04-25","q":3,"topic":"Web server log analysis","tasks":["Форматы: Apache Combined, Nginx, IIS W3C. Каждое поле наизусть","Развернуть Apache + DVWA, сгенерировать атаки самому (SQLi, XSS, directory traversal, brute force входа, сканирование gobuster/dirb) → найти каждую атаку в access.log","Признаки: всплеск 404, 500 после 200, длинные URL с encoded-символами, ../, union select, <script>, сканерные User-Agent (sqlmap, nikto, Nmap)","Написать Python-скрипт-детектор web-атак (развитие проекта W19)","THM: Web Attacks / Investigating Web Attacks (модуль SOC L1)"],"hours":12.9,"deliverable":"web-attack-detector.py + weblog-attack-patterns.md"},{"w":38,"start":"2027-04-26","end":"2027-05-02","q":3,"topic":"EDR + endpoint & malware triage","tasks":["Концепция EDR vs антивирус vs XDR. Развернуть бесплатный EDR-компонент: Wazuh уже даёт часть\u003b дополнительно Velociraptor (open source DFIR) — установить server + client, выполнить 5 hunts","Триаж malware без реверса: хеш → VirusTotal, строки (strings, floss), PE-заголовки (pecheck, PEStudio), поведение — hybrid-analysis.com и any.run (free tier)","YARA — синтаксис, написать 2 простых правила по строкам","Правило безопасности: любые семплы — только в изолированной VM без сети, снапшот до и после. Для старта используй безобидные тестовые файлы (EICAR) и публичные отчёты"],"hours":12.9,"deliverable":"2 YARA-правила + 1 malware triage report (по публичному семплу)"},{"w":39,"start":"2027-05-03","end":"2027-05-09","q":3,"topic":"IR-процесс + BLUE TEAM EXAM","tasks":["NIST SP 800-61r2 — 4 фазы: Preparation → Detection & Analysis → Containment/Eradication/Recovery → Post-Incident. Альтернатива: SANS PICERL","Alert triage workflow: severity, true/false positive, escalation criteria (L1→L2), SLA","Написать свой шаблон incident report (см. Приложение Б) и заполнить его по расследованию из W34","Chain of custody, что можно и нельзя трогать на хосте","BLUE TEAM EXAM: незнакомый PCAP + Windows Event Log → полный incident report по шаблону за ≤ 2 часа"],"hours":12.9,"deliverable":"incident-report-template.md + 1 заполненный отчёт"},{"w":40,"start":"2027-05-10","end":"2027-05-16","q":4,"topic":"THM SOC L1: триаж и фишинг","tasks":["Модуль SOC Team Internals: alert triage workflow, reporting standards, SOC metrics, shift handover","Модуль Phishing: анализ email-заголовков (Received, SPF, DKIM, DMARC, Return-Path), извлечение IOC из вложений и ссылок. Rooms: Phishing Analysis Fundamentals, Phishing Analysis Tools, Phishing Prevention, The Greenholt Phish","Инструменты: emlAnalyzer, URL2PNG, PhishTool (free tier)"],"hours":12.9,"deliverable":"2 phishing-writeup в портфолио"},{"w":41,"start":"2027-05-17","end":"2027-05-23","q":4,"topic":"THM SOC L1: Windows + Network Detection","tasks":["Модуль Windows Security Monitoring целиком","Модуль Network Detection: identify scans, lateral movement, exfiltration\u003b Wireshark + NetworkMiner","Модуль Web Attack Investigation: web shells, log-based detection","Темп: минимум 3 room в неделю с конспектом каждого"],"hours":12.9,"deliverable":"Обновлённый THM-профиль + 3 room-конспекта"},{"w":42,"start":"2027-05-24","end":"2027-05-30","q":4,"topic":"THM SOC L1: capstone challenges","tasks":["Пройти challenge-rooms уровня «полное расследование»: Summit, Benign, Boogeyman 1, Tempest, Snapped Phish-ing Line, Retracted","Каждую оформить как writeup по своему incident report template (W39)","Закрыть путь SOC Level 1 до 100% и получить сертификат прохождения"],"hours":12.9,"deliverable":"Сертификат THM SOC Level 1 + 3 полных writeup"},{"w":43,"start":"2027-05-31","end":"2027-06-06","q":4,"topic":"LetsDefend / HTB — «настоящие» алерты","tasks":["LetsDefend (после поглощения Hack The Box в 2025 г. интегрируется в HTB\u003b {{student_price}})","Free tier: 15 алертов в месяц. С подпиской — закрыть 30+ алертов SOC Analyst path","Работать строго по процедуре платформы: Take Ownership → Analyze → Artifacts → Verdict (True/False Positive) → Close с обоснованием","Это важнее любых курсов: интерфейс LetsDefend максимально близок к реальной работе L1"],"hours":12.9,"deliverable":"Скриншот статистики: 30+ закрытых алертов, accuracy > 80%"},{"w":44,"start":"2027-06-07","end":"2027-06-13","q":4,"topic":"Blue Team Labs Online","tasks":["Зарегистрироваться на blueteamlabs.online. Free tier: 6 бесплатных Investigation + 10 часов лабораторий в месяц + все Security Challenges бесплатно","Пройти все доступные Challenges (downloadable, без лимита времени) — категории: Phishing Analysis, Digital Forensics, Network Analysis, OSINT","Пройти 6 free Investigations","*Опционально:* BTLO Pro £15/мес — {{budget_if}}, взять 1 месяц и закрыть 15–20 investigations"],"hours":12.9,"deliverable":"Публичный BTLO-профиль с рангом + 4 writeup"},{"w":45,"start":"2027-06-14","end":"2027-06-20","q":4,"topic":"SESSION MODE","tasks":["10 мин Polish + 15 мин English + 35 мин: только Anki-повторы и чтение вакансий на английском. Универ приоритетнее."],"hours":2.9,"deliverable":"Streak не прерван"},{"w":46,"start":"2027-06-21","end":"2027-06-27","q":4,"topic":"SESSION MODE","tasks":["То же."],"hours":2.9,"deliverable":"Streak не прерван"},{"w":47,"start":"2027-06-28","end":"2027-07-04","q":4,"topic":"CAPSTONE: Home SOC Lab","tasks":["Финальный проект-визитка. Репозиторий home-soc-lab с полной документацией на английском: • диаграмма архитектуры (draw.io / Excalidraw)\u003b • deployment-инструкции Wazuh + ELK + Sysmon + агенты\u003b • 10 custom detection rules (Wazuh XML + Sigma)\u003b • 3 симулированных атаки (brute force SSH, PowerShell-загрузчик, web shell) с до/после скриншотами срабатывания\u003b • mapping каждой детекции на технику MITRE ATT&CK\u003b • 3 incident report по этим атакам. Инструмент симуляции: Atomic Red Team (Invoke-AtomicTest) — бесплатный и безопасный."],"hours":12.9,"deliverable":"Флагманский репозиторий home-soc-lab с 15+ скриншотами"},{"w":48,"start":"2027-07-05","end":"2027-07-11","q":4,"topic":"CV, LinkedIn, GitHub","tasks":["CV в двух версиях: на языке местного рынка и на английском. Площадки: {{boards}}. Зарубежное направление: {{abroad}}. Одна страница, формат из §5.3","LinkedIn: заголовок, About, Projects, Skills\u003b язык — English","GitHub: закрепить 6 репозиториев, README-профиль, единый стиль","Профили там же, где ищешь вакансии: {{boards}}, плюс LinkedIn Jobs","Записать 90-секундный elevator pitch на английском, переписать 10 раз, выучить"],"hours":12.9,"deliverable":"CV × 2 языка (PDF) + обновлённые профили"},{"w":49,"start":"2027-07-12","end":"2027-07-18","q":4,"topic":"Волна откликов #1 + техподготовка","tasks":["30 откликов по схеме из §5.4 ({{hub}} и окрестности, {{abroad}}, {{remote}}). Вести трекер в Google Sheets: компания / дата / канал / статус / контакт","Технический интервью-прогон: 50 типовых вопросов Junior SOC (список в Приложении В) — отвечать вслух, не в голове","Разобрать 5 своих проектов так, чтобы объяснить каждый за 2 минуты"],"hours":12.9,"deliverable":"Трекер с 30 откликами + записанные ответы на 50 вопросов"},{"w":50,"start":"2027-07-19","end":"2027-07-25","q":4,"topic":"Interview prep: English + behavioral","tasks":["Mock interview на английском — минимум 4 полных прогона (с ИИ-собеседником, языковым партнёром или преподавателем на italki ~$10/час)","STAR-метод для behavioral: подготовить 6 историй (проблема в лаборатории, работа в команде, ошибка и урок, самообучение)","Отработать 10 вопросов про себя на английском дословно: \"Tell me about yourself\", \"Why cybersecurity?\", \"Walk me through your home lab\", \"How would you investigate a phishing alert?\"","Follow-up по всем откликам W49"],"hours":12.9,"deliverable":"6 STAR-историй + 4 проведённых mock interview"},{"w":51,"start":"2027-07-26","end":"2027-08-01","q":4,"topic":"Волна откликов #2 + сертификация","tasks":["Ещё 30 откликов, включая холодные письма в компании без открытых вакансий (§5.5)","Решение по сертификату (§Бюджет): Security+ (дороже, но лучше всего распознаётся HR), BTL1 (~$399, практический, идеален для blue team) или Google Cybersecurity Certificate (Coursera, дешёвый, слабее по весу)","Если сертификат берёшь — начать подготовку сейчас, экзамен уже в Year 2"],"hours":12.9,"deliverable":"60 откликов суммарно + план сертификации"},{"w":52,"start":"2027-08-02","end":"2027-08-08","q":4,"topic":"Ретроспектива + план Year 2","tasks":["Полный аудит: закрыть все незавершённые writeup, привести GitHub в порядок","Пересчитать реальные часы за год против плановых — где просел и почему","Проверить English — тест на уровень (EF SET, бесплатный, 50 мин). Цель: B1+","Написать Year 2 Roadmap: специализация (DFIR / Detection Engineering / Threat Hunting / Cloud Security), сертификат, целевая зарплата","Опубликовать итоговый пост на LinkedIn «My year of learning blue team» — это реально приносит отклики от рекрутеров"],"hours":12.9,"deliverable":"YEAR2-ROADMAP.md + пост в LinkedIn + результат EF SET"}]}'::jsonb,
       updated_at = now()
 where id = 'cyber'
   and coalesce(
         case when jsonb_typeof(content -> 'v') = 'number'
              then (content ->> 'v')::int end, 0) < 3;
-- <<< seed-content


-- ─────────────── 12. ПАРАМЕТРЫ ЧЕЛОВЕКА (§13.2 шаг 2) ───────────────
-- Блок идемпотентный: только create/alter, ни одного drop table (§3.9).
--
-- Зачем. Содержание трека уехало в roadmaps.content (§3.2-bis), но
-- внутри него продолжали жить параметры одного конкретного человека:
-- его ноутбук, город, бюджет, учебное заведение. Пока в задаче W1
-- написано «поставить Proxmox на ASUS», трек нельзя ни продать,
-- ни подарить, ни собрать второй — ноутбук владельца окажется у всех.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ КОЛОНКА В profiles. Это главный
-- вопрос блока, и ответ даёт §3.1. На profiles висит политика
-- «profiles read all»: for select to authenticated using (true).
-- Её читает КАЖДЫЙ вошедший, целиком, обычным GET /rest/v1/profiles.
-- Витрина leaderboard тут ни при чём: она не сужает доступ, она джойн
-- поверх той же таблицы, и колонка в profiles попала бы наружу
-- независимо от того, есть ли она в витрине. То есть «бюджет
-- в profiles» — это бюджет, опубликованный всем вошедшим. §3.1
-- разделяет приватное и публичное НА УРОВНЕ ТАБЛИЦ именно чтобы
-- такая ошибка была невозможна физически, а не ловилась вниманием.
--
-- ПОЧЕМУ НЕ progress.payload. Прогресс ключуется парой
-- (user_id, roadmap_id). Город, железо и бюджет принадлежат человеку,
-- а не треку: они не меняются оттого, что он записался на второй.
-- В payload они завели бы вторую копию на шаге 3 §13.2 и разъехались
-- бы молча — тот же класс дефекта, что §12.1-ter.
--
-- ФОРМА: одна колонка jsonb, а не восемнадцать типизированных.
-- Набор параметров ещё будет расти вместе со вторым треком, и каждая
-- новая строка анкеты не должна становиться миграцией. Границы формы
-- при этом стоят на сервере, ниже: клиент не граница (§11.1).
--
-- СПИСКА ДОПУСТИМЫХ КЛЮЧЕЙ НА СЕРВЕРЕ НАМЕРЕННО НЕТ. §11.5 уже
-- заплатила за список аватаров, живущий одновременно в auth.js
-- и в CHECK: списки разъезжаются, и сервер начинает отвергать то,
-- что клиент считает нормальным. Список полей живёт в одном месте —
-- PERSON_FIELDS в person.js. Сервер сторожит размер и форму значений,
-- то есть ровно то, чем можно навредить базе, а не себе.
--
-- ВНИМАНИЕ ПРИ ВЫПОЛНЕНИИ РУКАМИ: ниже есть create function с телом
-- в $$ … $$. SQL Editor режет отправку по точкам с запятой и молча
-- рвёт такое тело, показывая при этом СТАРЫЙ результат в панели (§9).
-- Функцию и триггер отправлять отдельным запуском, результат сверять
-- с каталогом (pg_proc, pg_trigger, pg_policies), а не с панелью.

create table if not exists public.person (
  id         uuid primary key references auth.users(id) on delete cascade,
  params     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- jsonb_typeof иммутабельна, поэтому это может быть CHECK. Размер —
-- не может: pg_column_size помечена stable (§11.5), и границу объёма
-- пришлось делать триггером, как в блоке 9.4.
alter table public.person drop constraint if exists person_params_object;
alter table public.person
  add constraint person_params_object check (jsonb_typeof(params) = 'object');

alter table public.person enable row level security;

-- Только владелец. Ни select, ни update чужого — никак, как у progress.
-- Ровно поэтому таблица и заведена отдельно от profiles.
drop policy if exists "person own" on public.person;
create policy "person own" on public.person
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── 12.1. Границы формы и запрет подделки полей ──
-- BEFORE-триггер: сам переписывает id и updated_at, как в блоке 9.3.
-- Верхние границы взяты с запасом к тому, что реально вводится
-- в анкете: восемнадцать полей, самое длинное — 200 символов.
create or replace function public.person_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  v jsonb;
  n int := 0;
begin
  if auth.uid() is not null then
    new.id := auth.uid();
  end if;
  new.updated_at := now();

  if pg_column_size(new.params) > 8192 then
    raise exception 'person.params больше 8 КиБ' using errcode = '22001';
  end if;

  for k, v in select * from jsonb_each(new.params) loop
    n := n + 1;
    if char_length(k) > 32 then
      raise exception 'person.params: длинное имя параметра' using errcode = '22001';
    end if;
    if jsonb_typeof(v) not in ('string', 'number', 'boolean') then
      raise exception 'person.params[%]: только строка, число или булево', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) = 'string' and char_length(v #>> '{}') > 400 then
      raise exception 'person.params[%]: строка длиннее 400 символов', k using errcode = '22001';
    end if;
  end loop;

  if n > 64 then
    raise exception 'person.params: больше 64 параметров' using errcode = '22001';
  end if;

  return new;
end $$;

drop trigger if exists person_guard_biu on public.person;
create trigger person_guard_biu
  before insert or update on public.person
  for each row execute function public.person_guard();


-- ─────────────── 13. ПРОВЕРКА ───────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','roadmaps','enrollments','progress','public_stats','vocab','person')
order by tablename;

-- Параметры человека приватны и в витрину не уходят. Проверка
-- буквальная, а не «мы же не добавляли»: запрос обязан вернуть
-- ноль строк. Если однажды вернёт хоть одну — §3.1 нарушена.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('leaderboard','public_stats','profiles')
  and column_name in (
    'params','city','hub','region','abroad','employers','boards','edu',
    'student','level','os','daily','lab','ram','budget','hours','days','lang2');

-- Граница person применилась?
select conname from pg_constraint
where conrelid = 'public.person'::regclass;

select tgname, tgenabled from pg_trigger
where tgrelid = 'public.person'::regclass and not tgisinternal;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- трек на месте?
select id, title, total_weeks from public.roadmaps;

-- содержание засеяно? (§3.2) Сверяемся с каталогом, а не с панелью
-- результатов: она показывает старый прогон, и провал выглядит как успех (§9).
-- weeks обязано совпасть с total_weeks, границы — с META в data.js.
select id,
       jsonb_array_length(content -> 'weeks')                      as weeks,
       content #>> '{meta,start}'                                  as meta_start,
       content #>> '{meta,end}'                                    as meta_end,
       content #>> '{weeks,0,start}'                               as w1_start,
       content -> 'v'                                              as content_v,
       pg_column_size(content)                                     as bytes
from public.roadmaps
where content <> '{}'::jsonb;

-- границы применились?
select conname from pg_constraint
where conname in ('public_stats_sane','profiles_nickname_shape','profiles_avatar_known','vocab_sane')
order by conname;

select tgname from pg_trigger
where tgname in ('public_stats_guard_biu','progress_guard_biu','vocab_guard_biu','person_guard_biu')
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
