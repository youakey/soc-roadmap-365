# Security Policy · Политика безопасности

**SOC Roadmap 365** — статический сайт на GitHub Pages с бэкендом на Supabase.
Проект посвящён работе SOC-аналитика, поэтому к сообщениям об уязвимостях
здесь относятся всерьёз.

*A static site on GitHub Pages with a Supabase backend. The project is about
SOC analyst work, so vulnerability reports are taken seriously here.*

- Живой сайт / Live site: <https://youakey.github.io/soc-roadmap-365/>
- Репозиторий / Repository: <https://github.com/youakey/soc-roadmap-365>

---

## 🇷🇺 Русский

### Что входит в область

| В области | Вне области |
|---|---|
| Код в этом репозитории: `index.html`, `*.js`, `styles.css` | Инфраструктура GitHub Pages и сам GitHub |
| Схема базы и политики RLS в `supabase.sql` | Инфраструктура Supabase как платформы |
| Конфигурация CSP, SRI, обработка URL | Уязвимости в браузере пользователя |
| Логика аутентификации и синхронизации прогресса | Сторонний код `supabase-js` — сообщайте его авторам |

**Отдельно про ключ в `config.js`.** `sb_publishable_...` — публикуемый ключ,
он не секрет по замыслу Supabase и лишь идентифицирует проект. Доступ к данным
режет Row Level Security на сервере. Сообщение вида «в коде найден ключ API»
не считается уязвимостью. А вот **любой способ прочитать или изменить данные
другого пользователя** — считается, и это самый ценный класс находок.

### Как сообщить

1. **Предпочтительно:** приватное сообщение через GitHub —
   вкладка *Security* → *Report a vulnerability*. Канал закрытый,
   переписка видна только владельцу репозитория.
2. Если приватные сообщения окажутся отключены — откройте issue
   **без технических деталей**, с одной фразой «нашёл уязвимость, нужен
   приватный канал», и владелец свяжется с вами.

**Не публикуйте детали в открытом issue, PR или соцсетях до исправления.**

### Что приложить к сообщению

- Тип уязвимости и её влияние: что именно может сделать атакующий.
- Пошаговое воспроизведение. Для клиентских находок — конкретный
  URL или полезная нагрузка. Для находок в базе — запрос к REST API.
- Версия ассетов: `?v=N` в исходнике страницы.
- Браузер и его версия, если находка от него зависит.

### Правила исследования

Можно:

- изучать код страницы, читать сетевые запросы, играть со своими данными;
- заводить свои тестовые аккаунты и ломать их сколько угодно;
- проверять политики RLS запросами от своего аккаунта.

Нельзя:

- нагрузочное тестирование, флуд и любой отказ в обслуживании;
- социальная инженерия против владельца проекта или пользователей;
- доступ к данным других аккаунтов сверх минимума, необходимого,
  чтобы подтвердить находку, и хранение таких данных;
- изменение или удаление чужих данных;
- автоматические сканеры, создающие заметную нагрузку.

Исследование в этих рамках считается добросовестным. Претензий к тому,
кто их соблюдает и сообщил приватно, не будет.

### Сроки

| Этап | Срок |
|---|---|
| Подтверждение получения | 5 рабочих дней |
| Первичная оценка | 10 рабочих дней |
| Исправление критичного | по возможности быстро, ориентир 30 дней |
| Раскрытие | по согласованию, обычно после выхода исправления |

Проект личный и ведётся одним человеком в свободное время: сроки —
честное намерение, а не контракт. Вознаграждения нет, но авторство находки
будет указано в истории коммитов и в разделе благодарностей, если вы
не против.

### Что уже сделано

Чтобы не тратить ваше время на известное:

- CSP через `<meta>` с `default-src 'self'`, без `unsafe-eval`,
  `object-src`/`base-uri`/`form-action` в `'none'`;
- защита от кликджекинга фреймбастером — `frame-ancestors` в `<meta>`
  браузеры игнорируют, а заголовки GitHub Pages не отдаёт;
- экранирование всех данных пользователя перед вставкой в разметку,
  единая реализация в `security.js`;
- аллоулист схем для `href`: `javascript:` и `data:` отсекаются;
- разбор недоверенного JSON без загрязнения прототипа;
- приватные и публичные данные разнесены **по разным таблицам**,
  а не по полям, — в публичной таблице приватных данных нет физически;
- границы значений и триггеры-валидаторы на сервере: подделать рейтинг
  запросом к REST API нельзя.

Известные и признанные ограничения перечислены в `PROJECT.md`, §11 —
загляните туда перед сообщением, часть из них уже описана как долг.

---

## 🇬🇧 English

### Scope

| In scope | Out of scope |
|---|---|
| Code in this repository: `index.html`, `*.js`, `styles.css` | GitHub Pages and GitHub infrastructure |
| Database schema and RLS policies in `supabase.sql` | Supabase platform infrastructure |
| CSP and SRI configuration, URL handling | Vulnerabilities in the user's browser |
| Authentication and progress-sync logic | Third-party `supabase-js` code — report upstream |

**About the key in `config.js`.** `sb_publishable_...` is a publishable key.
By Supabase design it is not a secret; it only identifies the project, and
data access is gated by server-side Row Level Security. A report saying
"an API key is exposed in the source" is not a vulnerability. However,
**any way to read or modify another user's data** is — and that is the most
valuable class of finding here.

### How to report

1. **Preferred:** private report through GitHub — the *Security* tab →
   *Report a vulnerability*. The channel is private and visible only to
   the repository owner.
2. If private reporting turns out to be disabled, open an issue with
   **no technical details** — just "found a vulnerability, need a private
   channel" — and the owner will get in touch.

**Please do not publish details in a public issue, PR, or on social media
before a fix ships.**

### What to include

- Vulnerability class and impact: what exactly an attacker can do.
- Step-by-step reproduction. For client-side findings, the specific URL
  or payload. For database findings, the REST API request.
- Asset version: `?v=N` in the page source.
- Browser and version, if the finding depends on it.

### Research rules

Allowed:

- reading page source and network traffic, experimenting with your own data;
- creating your own test accounts and breaking them however you like;
- probing RLS policies with requests from your own account.

Not allowed:

- load testing, flooding, or any denial of service;
- social engineering against the project owner or its users;
- accessing other accounts' data beyond the minimum needed to confirm
  a finding, or retaining such data;
- modifying or deleting data that is not yours;
- automated scanners that generate noticeable load.

Research within these rules is considered good faith. No action will be
taken against anyone who follows them and reports privately.

### Timelines

| Stage | Target |
|---|---|
| Acknowledgement | 5 business days |
| Initial assessment | 10 business days |
| Critical fix | as fast as practical, aiming for 30 days |
| Disclosure | coordinated, normally after the fix ships |

This is a personal project maintained by one person in their spare time.
The timelines are an honest intention, not a contract. There is no bounty,
but findings will be credited in the commit history and in an
acknowledgements section, if you are happy with that.

### Already in place

So you do not spend time on what is known:

- CSP via `<meta>` with `default-src 'self'`, no `unsafe-eval`, and
  `object-src` / `base-uri` / `form-action` set to `'none'`;
- clickjacking protection via a frame-buster — `frame-ancestors` is ignored
  in `<meta>` by specification, and GitHub Pages serves no custom headers;
- all user data escaped before insertion into markup, with a single
  implementation in `security.js`;
- scheme allowlist for `href`: `javascript:` and `data:` are rejected;
- untrusted JSON parsed without prototype pollution;
- private and public data separated **into different tables** rather than
  different columns — the public table physically contains no private data;
- server-side value bounds and validating triggers: the leaderboard cannot
  be forged through the REST API.

Known and accepted limitations are listed in `PROJECT.md`, §11 — worth a look
before reporting, as some are already documented as technical debt.
