// SOC Roadmap 365 — справочные данные
// Профиль: студент ИБ, Брест · 3 ч/день × 5 дней · старт 10.08.2026 · финиш 08.08.2027

const META = {
  start: '2026-08-10',
  end: '2027-08-08',
  totalHours: 630.8,
  weeklyHours: 12.9,
  sessionWeeks: [24, 25, 45, 46],
  /* Какие блоки дня остаются в режиме сессии. Раньше эта тройка была
     зашита прямо в app.js, и §3.2-bis назвала её швом: тот, кто
     переименует блок, тихо ломает session mode. Теперь она едет
     вместе с содержанием трека — то есть в базу. */
  sessionBlocks: ['polish', 'english', 'lab'],
  examWeeks: { 13: 'FOUNDATIONS EXAM', 26: 'AUTOMATION EXAM', 39: 'BLUE TEAM EXAM' }
};

const QUARTERS = {
  1: { code: 'Q1', name: 'FOUNDATIONS', range: 'W1–W13', dates: '10.08 – 08.11.2026', hours: 167.7,
       goal: 'Networking, Linux, Windows, AD на уровне уверенного джуна. Home lab развёрнут.',
       principle: 'Ты не «изучаешь сети», ты строишь и ломаешь сети. Ни одна неделя не заканчивается конспектом — только рабочим артефактом.' },
  2: { code: 'Q2', name: 'AUTOMATION', range: 'W14–W26', dates: '09.11.2026 – 07.02.2027', hours: 147.7,
       goal: 'Python, Bash, Regex, SQL. Три рабочих security-скрипта в GitHub. MITRE ATT&CK освоен.',
       principle: 'Ты учишь Python не как программист, а как аналитик: прочитать файл → распарсить строку → посчитать → выдать отчёт.' },
  3: { code: 'Q3', name: 'BLUE TEAM CORE', range: 'W27–W39', dates: '08.02 – 09.05.2027', hours: 167.7,
       goal: 'Wazuh, ELK, Splunk. Анализ логов и трафика. 10+ разобранных инцидентов.',
       principle: 'Квартал, ради которого существуют предыдущие два. Здесь ты перестаёшь быть студентом и становишься аналитиком.' },
  4: { code: 'Q4', name: 'JOB READY', range: 'W40–W52', dates: '10.05 – 08.08.2027', hours: 147.7,
       goal: 'THM SOC L1 закрыт, BTLO, портфолио, CV, 60+ откликов, интервью.',
       principle: 'Знания больше не наращиваются вширь. Всё конвертируется в доказательство компетентности.' }
};

const DAILY = [
  { id: 'polish',  name: '{{lang2t}}',        min: 10,  desc: 'Duolingo (курс с английского, не с родного!) + Anki по второму языку. Мозг ещё холодный — идеально для механической памяти.' },
  { id: 'english', name: 'Cyber English',     min: 15,  desc: '7 мин Anki · 5 мин ввод 5 новых слов из технического текста · 3 мин сказать вслух 3 предложения.' },
  { id: 'theory',  name: 'Теория',            min: 45,  desc: 'Курс / глава книги / официальная документация. Обязательно с конспектом в Obsidian.' },
  { id: 'lab',     name: 'Практика',          min: 100, desc: 'Терминал, VM, TryHackMe, код. Никакого потребления контента — только руки.' },
  { id: 'recall',  name: 'Active recall',     min: 10,  desc: 'Закрыл все окна → по памяти записал 5 фактов дня → обновил журнал.' }
];

const DAY_VARIANTS = [
  { name: 'Стандартный', when: 'Минимум 3 дня в неделю', blocks: '10 / 15 / 45 / 100 / 10' },
  { name: 'Lab-heavy',   when: 'Пятница, THM-руммы. Не чаще 2 раз в неделю', blocks: '10 / 15 / 15 / 130 / 10' },
  { name: 'Theory-heavy',when: 'Старт новой темы. Не чаще 2 раз в неделю',    blocks: '10 / 15 / 90 / 50 / 15' },
  { name: 'Session mode',when: 'W24, W25, W45, W46 и любой аврал — 1 час',    blocks: '10 / 15 / 0 / 35 / 0' }
];

const MILESTONES = [
  { w: 13, date: '2026-11-08', name: 'Foundations Exam',
    test: 'Собираешь сеть в Packet Tracer с VLAN + DHCP + ACL; ставишь Ubuntu Server с нуля и настраиваешь SSH + firewall + users по чек-листу без гуглинга.',
    targets: { hours: 168, repos: 2, thm: 30, anki: 300, efset: 'A2', rules: 0, cases: 1, apps: 0 } },
  { w: 26, date: '2027-02-07', name: 'Automation Exam',
    test: 'Пишешь с нуля Python-скрипт, парсящий auth.log и выдающий top-10 IP по failed SSH, за ≤ 45 минут.',
    targets: { hours: 323, repos: 5, thm: 45, anki: 700, efset: 'A2+', rules: 0, cases: 3, apps: 0 } },
  { w: 39, date: '2027-05-09', name: 'Blue Team Exam',
    test: 'Разбираешь незнакомый PCAP + Windows Event Log и пишешь incident report по шаблону за ≤ 2 часа.',
    targets: { hours: 491, repos: 7, thm: 70, anki: 1100, efset: 'B1-', rules: 15, cases: 12, apps: 0 } },
  { w: 52, date: '2027-08-08', name: 'Job Ready',
    test: '60+ откликов, ≥ 5 интервью, English B1+, портфолио из 8 репозиториев.',
    targets: { hours: 631, repos: 8, thm: 110, anki: 1400, efset: 'B1+', rules: 20, cases: 25, apps: 60 } }
];

const PORTFOLIO = [
  { id: 1, name: 'soc-journey', week: 1, inside: 'Публичный журнал обучения: недельные заметки, ссылки, прогресс', why: 'Доказывает дисциплину и последовательность' },
  { id: 2, name: 'network-labs', week: 5, inside: 'Packet Tracer топологии .pkt, разбор PCAP, cheatsheets', why: 'Фундамент сетей' },
  { id: 3, name: 'linux-hardening-checklist', week: 10, inside: 'Чек-лист на 25 пунктов + скрипт проверки', why: 'Показывает системное мышление' },
  { id: 4, name: 'log-triage-tool', week: 19, inside: 'Python CLI: парсинг логов, top-IP, обогащение через AbuseIPDB', why: 'Главный инженерный проект' },
  { id: 5, name: 'linux-triage-script', week: 21, inside: 'Bash-скрипт сбора артефактов с хоста', why: 'Показывает IR-мышление' },
  { id: 6, name: 'detection-rules', week: 30, inside: 'Wazuh XML, Sigma и Suricata правила', why: 'Самый ценный репозиторий для blue team' },
  { id: 7, name: 'pcap-analysis', week: 35, inside: 'Writeup по PCAP с malware-traffic-analysis и BOTS', why: 'Доказывает аналитический навык' },
  { id: 8, name: 'home-soc-lab', week: 47, inside: 'ФЛАГМАН: архитектура, 10 детекций, 3 атаки Atomic Red Team, 3 incident report', why: 'Единственный проект, который заменяет опыт работы' }
];

const PORTFOLIO_RULES = {
  need: ['README на английском: What / Why / Architecture / How to run / Screenshots / What I learned',
         'Минимум 3 скриншота — рекрутер не запускает код, он смотрит картинки',
         'Осмысленная история коммитов, не один коммит «init»',
         'Топики GitHub: soc, blue-team, siem, wazuh, incident-response, detection-engineering'],
  avoid: ['Скачанные чужие скрипты без изменений',
          '«Хакерские» проекты (эксплойты, брутфорсеры) — на blue team это минус',
          'Реальные malware-семплы в репозитории. Никогда. Только хеши и описания',
          'Скриншоты с реальными данными университета или чьей-либо инфраструктуры']
};

const RESOURCES = [
  { q: 1, name: 'TryHackMe — Pre Security path', what: '5 модулей, ~30 rooms. Полностью бесплатно', url: 'https://tryhackme.com/path/outline/presecurity', price: 'Free' },
  { q: 1, name: 'Professor Messer — Network+ N10-009', what: 'YouTube-плейлист, Sections 1–3', url: 'https://www.professormesser.com/', price: 'Free' },
  { q: 1, name: 'Cisco Packet Tracer', what: 'Через курс «Getting Started with Cisco Packet Tracer»', url: 'https://skillsforall.com/', price: 'Free' },
  { q: 1, name: 'Stepik 73 — Введение в Linux', what: 'Основная теория W7. Пройти целиком: 23 урока, 3 ч 36 мин, 84 теста. 4.7', url: 'https://stepik.org/course/73', price: 'Free + сертификат' },
  { q: 1, name: 'Stepik 181507 — Linux-администрирование-Bash', what: 'Теория W8–W10 и W20–W21. НЕ подряд: 45 уроков, 22 ч. Смотреть 1,25–1,5x. 4.9', url: 'https://stepik.org/course/181507', price: 'Free' },
  { q: 1, name: 'OverTheWire Bandit', what: 'Уровни 0–25', url: 'https://overthewire.org/wargames/bandit/', price: 'Free' },
  { q: 1, name: 'malware-traffic-analysis.net', what: 'Traffic Analysis Exercises, начинать со старых (2014–2017)', url: 'https://www.malware-traffic-analysis.net/', price: 'Free' },
  { q: 1, name: 'Microsoft Evaluation Center', what: 'Windows Server 2022 Eval ISO, 180 дней', url: 'https://www.microsoft.com/en-us/evalcenter', price: 'Free' },
  { q: 1, name: 'Sysinternals Suite', what: 'Process Explorer, Autoruns, Procmon, TCPView', url: 'https://learn.microsoft.com/en-us/sysinternals/', price: 'Free' },
  { q: 1, name: 'subnettingpractice.com', what: 'Генератор задач на подсети', url: 'https://subnettingpractice.com/', price: 'Free' },

  { q: 2, name: 'Automate the Boring Stuff with Python', what: 'Главы 1–9, 12, 16. Есть русский перевод', url: 'https://automatetheboringstuff.com/', price: 'Free online' },
  { q: 2, name: 'regex101.com', what: 'Тренажёр регулярных выражений, режим Python', url: 'https://regex101.com/', price: 'Free' },
  { q: 2, name: 'regexcrossword.com', what: 'Игровой дрилл regex', url: 'https://regexcrossword.com/', price: 'Free' },
  { q: 2, name: 'sqlbolt.com', what: 'Уроки 1–18', url: 'https://sqlbolt.com/', price: 'Free' },
  { q: 2, name: 'MITRE ATT&CK + Navigator', what: 'Enterprise Matrix, 14 тактик', url: 'https://attack.mitre.org/', price: 'Free' },
  { q: 2, name: 'AbuseIPDB API', what: 'Free tier ключ для обогащения IP', url: 'https://www.abuseipdb.com/', price: 'Free' },
  { q: 2, name: 'VirusTotal API', what: 'Free tier ключ', url: 'https://www.virustotal.com/', price: 'Free' },
  { q: 2, name: 'OWASP Juice Shop / DVWA', what: 'Docker-образы для практики web-атак', url: 'https://owasp.org/www-project-juice-shop/', price: 'Free' },
  { q: 2, name: 'OverTheWire Natas', what: 'Уровни 0–10, web-безопасность', url: 'https://overthewire.org/wargames/natas/', price: 'Free' },

  { q: 3, name: 'TryHackMe Premium', what: 'Старт подписки с W27. Модули SOC L1', url: 'https://tryhackme.com/', price: '~$14/мес' },
  { q: 3, name: 'Wazuh', what: '4.x all-in-one deployment на lab box', url: 'https://wazuh.com/', price: 'Free / open source' },
  { q: 3, name: 'Elastic Stack', what: 'Elasticsearch + Kibana + Filebeat + Winlogbeat, Basic license', url: 'https://www.elastic.co/', price: 'Free' },
  { q: 3, name: 'Splunk Enterprise Free', what: '500 МБ/день индексации, бессрочно', url: 'https://www.splunk.com/en_us/download.html', price: 'Free' },
  { q: 3, name: 'Splunk BOTS datasets', what: 'BOTS v1/v2/v3 + вопросы на GitHub', url: 'https://github.com/splunk/botsv1', price: 'Free' },
  { q: 3, name: 'Sysmon + SwiftOnSecurity config', what: 'Конфиг для осмысленного логирования', url: 'https://github.com/SwiftOnSecurity/sysmon-config', price: 'Free' },
  { q: 3, name: 'SigmaHQ / sigma', what: 'Репозиторий правил + sigma-cli', url: 'https://github.com/SigmaHQ/sigma', price: 'Free' },
  { q: 3, name: 'Zeek', what: 'conn.log, dns.log, http.log, ssl.log, files.log', url: 'https://zeek.org/', price: 'Free' },
  { q: 3, name: 'Suricata + ET Open rules', what: 'IDS + бесплатный ruleset', url: 'https://suricata.io/', price: 'Free' },
  { q: 3, name: 'Velociraptor', what: 'Open source DFIR / EDR', url: 'https://docs.velociraptor.app/', price: 'Free' },
  { q: 3, name: 'any.run / hybrid-analysis', what: 'Песочницы, free tier', url: 'https://any.run/', price: 'Free' },

  { q: 4, name: 'TryHackMe SOC Level 1 path', what: 'Путь целиком + challenge rooms', url: 'https://tryhackme.com/path/outline/soclevel1', price: '~$14/мес' },
  { q: 4, name: 'LetsDefend / Hack The Box', what: 'SOC Analyst Path. Проверь Student Pricing — скидка по студенческому', url: 'https://app.letsdefend.io/student-pricing', price: 'Free 15 алертов / VIP $20–30' },
  { q: 4, name: 'Blue Team Labs Online', what: '6 free investigations + ВСЕ Challenges бесплатно. Pro £15/мес', url: 'https://blueteamlabs.online/', price: 'Free / £15' },
  { q: 4, name: 'Atomic Red Team', what: 'Безопасная симуляция техник ATT&CK в своей лаборатории', url: 'https://github.com/redcanaryco/atomic-red-team', price: 'Free' },
  { q: 4, name: 'PhishTool Community', what: 'Разбор фишинговых писем', url: 'https://www.phishtool.com/', price: 'Free' },
  { q: 4, name: 'EF SET', what: 'Тест уровня английского, 50 минут', url: 'https://www.efset.org/', price: 'Free' },
  { q: 4, name: 'italki / Preply', what: 'Mock interview с носителем, только speaking', url: 'https://www.italki.com/', price: '$8–15/час' },
  { q: 4, name: 'rabota.by', what: 'Запросы: SOC, аналитик ИБ, мониторинг ИБ, SIEM', url: 'https://rabota.by/', price: 'Free' },
  { q: 4, name: 'dev.by', what: 'Основная площадка белорусского IT: вакансии + сообщество', url: 'https://dev.by/', price: 'Free' },
  { q: 4, name: 'justjoin.it / nofluffjobs', what: 'Польский рынок, фильтр Security + Remote', url: 'https://justjoin.it/', price: 'Free' }
];

/* ══════════════════════════════════════════════════════════════
   НИЖЕ — ГРАНИЦА «ТРЕК ↔ ЧЕЛОВЕК» (§13.2 шаг 2, §13.2-bis).

   Всё, что кончается на `_RAW`, — это ШАБЛОН, а не данные.
   Живая копия рядом объявлена пустым массивом и наполняется
   в `applyPerson()` из person.js: шаблон + параметры человека.
   Читать в app.js надо живую копию, а `_RAW` не читать вовсе.

   Почему живая копия — отдельный пустой массив, а не результат
   функции: 40+ обращений вида `HARDWARE.forEach` переписывать
   ради смены источника незачем — тот же довод, что в §3.2-bis.
   Наполнение идёт по месту, ссылки остаются валидными, и правка
   параметра в SETTINGS перерисовывает трек без перезагрузки.

   Про английский. Он остаётся вшитым в трек намеренно: SOC-
   документация, THM, LetsDefend и вакансии написаны по-английски,
   и «выучить английский» здесь не предпочтение человека, а условие
   задачи. Настраиваемым сделан ВТОРОЙ язык — тот, что у владельца
   польский, а у следующего человека может быть немецкий или
   не быть вовсе.
   ══════════════════════════════════════════════════════════════ */

const LANGS_RAW = [
  { q: 1, en: 'Грамматика A1→A2 + 300 технических слов. Читаешь man и THM room descriptions без перевода.', target: 'A2', anki: 300,
    pl: '{{lang2}}: 300 слов, алфавит и произношение, настоящее время. Осторожно с ложными друзьями.' },
  { q: 2, en: 'A2→A2+. Глаголы действия, техническое описание процессов. Пишешь README на английском.', target: 'A2+', anki: 700,
    pl: '{{lang2}}: 600 слов, прошедшее время, грамматика обзорно.' },
  { q: 3, en: 'A2+→B1. Документация Wazuh/Elastic, аудирование: John Hammond, 13Cubed, SANS DFIR.', target: 'B1-', anki: 1100,
    pl: '{{lang2}}: 900 слов, читаешь профильные ИБ-издания на этом языке.' },
  { q: 4, en: 'B1. ГОВОРЕНИЕ. 4 mock interview, 6 STAR-историй, elevator pitch на 90 секунд.', target: 'B1+', anki: 1400,
    pl: '{{lang2}}: A2. 10 вакансий на этом языке без переводчика. Представление о себе на 60 секунд.' }
];
const LANGS = [];

const READING_METHOD = [
  { n: 1, name: 'Skeleton', min: 2, text: 'Не читай текст. Смотри только заголовки, код-блоки, таблицы, скриншоты. Задача — понять структуру. Ответь одним предложением по-русски: про что документ?' },
  { n: 2, name: 'Command-first', min: 5, text: 'Читай ТОЛЬКО код и команды. Они язык-независимы: tcpdump -i eth0 -w capture.pcap понятен без English. Скопируй все команды в свой commands.md. Здесь ты извлёк 60% практической ценности.' },
  { n: 3, name: 'Targeted translation', min: 8, text: 'Возьми ОДИН абзац — тот, что объясняет непонятую команду. Переведи через DeepL. Выпиши МАКСИМУМ 5 новых слов в Anki. Не больше. 5 слов × 250 дней = 1250 слов технического английского.' }
];

const RULES_RAW = [
  { name: 'Правило 3 попыток', text: 'Застрял на технической проблеме → 3 подхода → не вышло → записал вопрос в blockers и пошёл дальше по плану. Вернёшься через неделю. Самая частая причина срывов — 4 дня подряд на сломанной VM.' },
  { name: 'Правило 80%', text: 'Если неделя закрыта на 80% — она считается закрытой. Перфекционизм здесь это прямая дорога к остановке.' },
  { name: 'Не пропускать 3 дня подряд', text: 'Единственная метрика, которую нужно защищать любой ценой. План, выполненный на 75% за 52 недели, кратно лучше плана на 120% за 14 недель и брошенного.' },
  { name: 'Пятница — 20 минут review', text: 'Что сделал / где застрял / что переношу / часы факт vs план. Единственная ретроспектива, которая нужна.' },
  { name: '{{days}} дней, не 7', text: 'Дней отдыха в неделю — {{restdays}}, и они полностью без кибербезопасности. Это не лень, это условие работоспособности на дистанции 52 недель.' },
  { name: 'Сон 7–8 часов', text: 'Обучение это консолидация памяти во сне. Урезание сна ради лишнего часа лабораторий даёт отрицательный результат.' },
  { name: 'Термины — на English', text: 'payload, beacon, persistence, lateral movement заучиваются на английском без перевода, как имена собственные.' },
  { name: 'Физика', text: 'Правило 20-20-20 для глаз, 5 минут разминки между блоками, 2 тренировки в неделю вне учебных часов. Без этого план не доживёт до Q4.' }
];
const RULES = [];

/* `when_` — единственное условие показа во всём файле, и список
   условий закрытый (`Person.cond`). Свободное выражение в данных
   было бы интерпретатором внутри шаблона, а его тут быть не должно. */
const RED_FLAGS_RAW = [
  { t: 'Пропущено 3+ дня подряд без внешней причины' },
  { t: 'Открываешь материал и не можешь читать дольше 10 минут' },
  { t: 'Раздражение при мысли о ноутбуке' },
  { t: 'Падение оценок в учёбе', when_: 'student' },
  { t: 'Нарушение сна' },
  { t: '«Я ничего не успеваю и всё равно ничего не знаю» как фоновая мысль' }
];
const RED_FLAGS = [];

const LAG_PROTOCOL = [
  { lag: '1 неделя', action: 'Ничего. Сдвигаешь график, догоняешь в выходные по желанию.' },
  { lag: '2–3 недели', action: 'Сокращаешь опциональные пункты недель, не темы.' },
  { lag: '4+ недель', action: 'Вырезаешь целиком по приоритету: (1) Security Onion W36, (2) ELK W31–W32, (3) глубина Windows AD W12.' },
  { lag: 'НИКОГДА не резать', action: 'Networking Q1 · Python W14–W19 · Windows Event Logs W29 · Wazuh W27–W28 · THM SOC L1 Q4' },
  { lag: 'Больше квартала', action: 'Останавливаешься, делаешь честную ретроспективу и переписываешь план под реальный объём времени.' }
];

/* Совет «держи 2 VM, а не 4» был написан прописью под конкретный
   ASUS с 16 ГБ. Правило под ним есть, оно просто застыло в одной
   строке: ~4 ГБ забирает хост, дальше ~6 ГБ на рабочую VM с запасом
   на дисковый кеш. Считает его `Person.vars().vm`, здесь остаётся
   только место, куда подставить число. */
const HARDWARE_RAW = [
  { name: '{{daily}}', role: 'DAILY DRIVER', ok: true,
    text: 'Повседневная машина, система — {{os}}. Всё, что не требует виртуализации, живёт здесь: конспекты, код, браузерные платформы, разбор трафика. Лабораторию на ней не держат — гипервизор и учебная работа на одном экране мешают друг другу.',
    use: 'Obsidian · VS Code + Python · браузер (THM, LetsDefend) · Wireshark · Anki · лёгкие контейнеры' },
  { name: '{{lab}}', role: 'LAB BOX', ok: true,
    text: 'Машина под лабораторию: {{ram}} ГБ памяти. Около 4 ГБ забирает хост, дальше примерно 6 ГБ на рабочую VM с запасом на дисковый кеш — значит одновременно держи {{vm}} VM, а не сколько влезет. Виртуализация в BIOS должна быть включена: без неё гипервизор не поднимется вовсе.',
    use: 'Гипервизор на голое железо (Proxmox VE 8 или аналог). {{vm}} VM разом: Ubuntu + Wazuh (4 ГБ) плюс цель под текущую задачу — Windows Server AD, Kali/REMnux или pfSense. Остальное гаси и поднимай из снапшотов: на SSD это быстро.' }
];
const HARDWARE = [];

/* Установка стека — это инструкция ТРЕКА, а личным был выбор системы.
   Поэтому вариантов три, а параметром остаётся один ключ `os`.
   Ключи `macos / linux / windows` хранимые: они лежат в параметрах
   человека, и переименование орфанит уже сохранённый выбор (§3.8). */
const SETUP_CMDS = {
  macos: `# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install --cask wireshark obsidian visual-studio-code anki utm
brew install nmap tcpdump git python@3.12 jq tmux
brew install --cask docker`,
  linux: `# Debian / Ubuntu
sudo apt update
sudo apt install -y wireshark nmap tcpdump git python3 python3-venv python3-pip jq tmux

# Obsidian, VS Code и Anki — из flatpak или .deb с сайтов проектов
sudo apt install -y flatpak
flatpak install -y flathub md.obsidian.Obsidian net.ankiweb.Anki com.visualstudio.code

# Docker Engine
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"`,
  windows: `# winget, встроен в Windows 10 21H1+ и Windows 11
winget install --id WiresharkFoundation.Wireshark
winget install --id Insecure.Nmap
winget install --id Obsidian.Obsidian
winget install --id Microsoft.VisualStudioCode
winget install --id Anki.Anki
winget install --id Git.Git
winget install --id Python.Python.3.12
winget install --id jqlang.jq
winget install --id Docker.DockerDesktop

# WSL2 — Linux-инструменты без второй машины
wsl --install -d Ubuntu-24.04`
};

const BUDGET = {
  required: [
    { item: 'TryHackMe Premium', when: 'W27–W52, 7 месяцев', cost: '~$14/мес = $98', prio: 'Обязательно' }
  ],
  recommended: [
    { item: 'LetsDefend / HTB', when: 'W43–W44', cost: '$20–30/мес × 2', prio: 'Высокий' },
    { item: 'italki speaking, 1 урок в 2 недели', when: 'W40–W52', cost: '~$60 суммарно', prio: 'Высокий' },
    { item: 'BTLO Pro', when: 'W44, 1 месяц', cost: '£15', prio: 'Средний' },
    { item: 'Внешний SSD для снапшотов VM', when: 'Q3', cost: '$30', prio: 'Средний' }
  ],
  certs: [
    { name: 'CompTIA Security+ (SY0-701)', cost: '~$400–600', verdict: 'Лучший ROI, но в Year 2', pro: 'Максимальная узнаваемость у HR, часто прямо в требованиях', con: 'Дорого, теоретический, экзамен на английском' },
    { name: 'BTL1 (Security Blue Team)', cost: '~$399', verdict: 'Лучший по содержанию', pro: 'Практический, 24-часовой лабораторный экзамен, ровно про blue team', con: 'Меньше узнаваемость у неспециализированных HR' },
    { name: 'Google Cybersecurity (Coursera)', cost: '~$49/мес × 3–6', verdict: 'Если бюджет узкий', pro: 'Дёшево, есть финансовая помощь', con: 'Слабый вес, воспринимается как начальный' },
    { name: 'Splunk Core Certified User', cost: '~$130', verdict: 'Опция для Year 2', pro: 'Дёшево и конкретно', con: 'Узко' }
  ],
  note: 'Не покупай ни один сертификат раньше W51. Портфолио и практические платформы в первый год дают больше отдачи на каждый доллар.'
};

/* Заметки к бюджету, зависящие от человека. Отдельно от BUDGET,
   потому что сам BUDGET — трек: это цены платформ, они одинаковы
   для всех и в долларах у самих платформ. Личное здесь — скидки,
   на которые человек имеет право, и потолок, который он себе назвал. */
const BUDGET_TEXT_RAW = [
  { t: '{{student_price}}.' },
  { t: 'Заявленный потолок — {{budget_own}} в месяц. Цены выше — в долларах у самих платформ, сравнивай сам: курса трекер не знает и знать не хочет. Всё, что дороже, помечай как «позже», а не как «нельзя».', when_: 'budget' }
];
const BUDGET_TEXT = [];

const MARKET_RAW = [
  { dir: 'SOC в городе: {{city}}', real: 'low', text: 'В небольшом городе операционных SOC-центров обычно нет вовсе. Промежуточный шаг — helpdesk или сисадмин с уклоном в ИБ. Это нормально и работает: год в поддержке инфраструктуры читается в резюме лучше, чем год без работы.' },
  { dir: 'SOC рядом — {{hub}} (гибрид или переезд)', real: 'high', text: 'Самое реалистичное направление: {{employers}}. Требования таких вакансий 1:1 совпадают с этим планом — читай их сейчас, а не в W48, и правь по ним приоритеты.' },
  { dir: '{{remote}} — L1-смена', real: 'mid', text: 'MSSP и аутсорс-SOC часто нанимают удалённо на ночные смены. Готовность к ночным сменам — реальный козырь: это дыра в укомплектованности почти любого SOC.' },
  { dir: '{{abroad}} — SSC и центры поддержки', real: 'low', text: 'Требуют English B2 и, как правило, права на работу в стране. Реальная цель на Year 2, а не на W52. Считать это направление основным на первый год — самая частая ошибка планирования.' },
  { dir: 'Стажировка от места учёбы — {{edu}}', real: 'high', text: 'Недооценённый канал. Учебное заведение обязано организовывать практику — направь этот механизм сам, с конкретным списком компаний, а не жди распределения по остаточному принципу.' }
];
const MARKET = [];

/* Вероятности пересчитываются от стартового уровня (`Person.vars`).
   Прежние цифры были посчитаны под старт «2 из 5» и застыли —
   правило под ними существовало, просто его не было видно. */
const OUTCOMES_RAW = [
  { s: 'Offer Junior SOC Analyst / L1', p: '{{out1}}', text: 'Отличный, но не гарантированный исход за 1 год со старта {{level}}/5' },
  { s: 'Стажировка / практика в ИБ', p: '{{out2}}', text: 'Полностью достаточный результат. Через 6 мес конвертируется в позицию' },
  { s: 'Смежная позиция (helpdesk, NOC)', p: '{{out3}}', text: 'Нормальный и очень частый путь входа в SOC' },
  { s: 'Портфолио и B1 English без оффера', p: '{{out4}}', text: 'Не провал. Year 2 с этой базой почти всегда закрывается оффером' }
];
const OUTCOMES = [];

const CV_TEXT_RAW = `{{name}} | Junior SOC Analyst
{{city}} · готов к переезду ({{hub}}), к удалённой работе и к сменному графику
email | Telegram | LinkedIn | GitHub

SUMMARY
2nd-year Information Security student with 700+ hours of hands-on blue team
training. Built and operate a home SOC lab (Wazuh, ELK, Sysmon) with 10 custom
detection rules mapped to MITRE ATT&CK. Seeking Junior SOC Analyst / L1 role.

TECHNICAL SKILLS
SIEM:         Wazuh, Elastic Stack (Kibana/KQL), Splunk (SPL)
Log Analysis: Windows Event Log, Sysmon, Linux syslog/auth.log, Apache/Nginx
Network:      Wireshark, tcpdump, Zeek, Suricata, TCP/IP, DNS, HTTP/TLS
Endpoint:     Velociraptor, Sysinternals, YARA, basic malware triage
Scripting:    Python, Bash, Regex, SQL
Frameworks:   MITRE ATT&CK, Cyber Kill Chain, NIST SP 800-61, OWASP Top 10
OS:           Linux (Ubuntu/Debian), Windows Server + Active Directory

PROJECTS   <- самый важный блок, выше EDUCATION
1. Home SOC Lab - deployed Wazuh + ELK; wrote 10 detection rules;
   simulated 3 attacks with Atomic Red Team and documented full IR reports.
2. Log Triage Tool (Python) - CLI parser for auth/access logs with IOC
   enrichment via AbuseIPDB API.
3. Detection Rules Repository - 10 Wazuh + 2 Sigma + 2 Suricata rules.

PRACTICAL TRAINING
TryHackMe SOC Level 1 (completed)  |  LetsDefend: 30+ alerts, 85% accuracy
Blue Team Labs Online: [rank]      |  Splunk BOTS v1 - full writeup

EDUCATION
{{edu}}, Information Security

LANGUAGES
English - B1 (technical reading B2)
{{lang2}} - A2`;

const CV_RULES = [
  'Одна страница. Всегда. Рекрутер смотрит 7 секунд.',
  'Блок PROJECTS выше блока EDUCATION — у тебя нет опыта, проекты его заменяют.',
  'Каждый глагол — action verb: deployed, configured, wrote, analyzed, investigated, automated. Не «familiar with».',
  'Цифры везде, где возможно: 10 detection rules, 30+ alerts, 700 hours.',
  'PDF, имя файла: Ivanov_Ivan_SOC_Analyst_CV.pdf'
];

const COLD_EMAIL_RAW = `Тема: Junior SOC Analyst — собственная лаборатория мониторинга

Здравствуйте, [Имя адресата]!

Меня зовут {{name}}, я учусь по специальности «Информационная
безопасность». Место учёбы: {{edu}}, город: {{city}}.

За последний год я самостоятельно построил домашнюю SOC-лабораторию:
развернул Wazuh и Elastic Stack, подключил агенты на Windows Server
с Active Directory и Linux, написал 10 собственных правил детектирования
с маппингом на MITRE ATT&CK и отработал на них 3 симулированные атаки
с полными отчётами об инцидентах. Прошёл TryHackMe SOC Level 1 и закрыл
30+ алертов на LetsDefend.

Знаю, что открытых вакансий Junior SOC Analyst у вас сейчас нет. Пишу
на будущее: если появится позиция уровня L1 или стажировка в направлении
мониторинга ИБ — буду рад пообщаться. Готов к сменному графику, включая
ночные смены (совмещаю с учёбой).

Портфолио: github.com/[username] · Резюме во вложении.

Спасибо за время,
{{name}}, [телефон]`;

/* ХРАНИМЫЕ ЗНАЧЕНИЯ, как статусы недели (§3.8). Категория лежит
   в `Store.d.apps[].category` и уже сохранена у тех, кто вёл отклики.
   Поэтому шаблоны подобраны так, чтобы при параметрах владельца
   («Минск», «СНГ», «Польша / ЕС», «Брест») подстановка дала ровно
   те шесть строк, что лежали здесь раньше, — тогда миграция данных
   не нужна вовсе, потому что данные не меняются. Это проверяется
   утверждением в стенде, а не глазами.

   Цена всё равно есть и записана в §13.2-bis: человек, сменивший
   город, осиротил бы старые отклики. Поэтому список выбора в app.js
   объединяется с категориями, которые уже встречаются в сохранённых
   откликах, — осиротевшая остаётся видимой и выбираемой. */
const APP_CATEGORIES_RAW = ['{{hub}}-офис', '{{remote}}', '{{abroad}}', '{{city}} / локально', 'Стажировка / практика', 'Холодное письмо'];
const APP_CATEGORIES = [];
const APP_STATUSES = ['Отправлен', 'Follow-up отправлен', 'Ответ получен', 'Тестовое задание', 'Интервью', 'Оффер', 'Отказ', 'Без ответа'];

const COMMANDS = [
  { group: 'Linux triage', items: [
    { cmd: 'last -f /var/log/wtmp | head -20', desc: 'последние логины' },
    { cmd: 'grep "Failed password" /var/log/auth.log | awk \'{print $11}\' | sort | uniq -c | sort -nr', desc: 'top IP по failed SSH' },
    { cmd: 'ss -tulpn', desc: 'открытые порты + процессы' },
    { cmd: 'ps auxf', desc: 'дерево процессов' },
    { cmd: 'find / -perm -4000 -type f 2>/dev/null', desc: 'SUID-бинарники' },
    { cmd: 'crontab -l; ls -la /etc/cron.*', desc: 'persistence через cron' },
    { cmd: 'journalctl -u ssh --since "1 hour ago"', desc: 'логи сервиса за час' },
    { cmd: 'stat /etc/passwd', desc: 'MAC-времена файла' }
  ]},
  { group: 'Network', items: [
    { cmd: 'tcpdump -i eth0 -nn -s0 -w capture.pcap', desc: 'запись трафика в файл' },
    { cmd: 'tcpdump -nn \'port 53\'', desc: 'только DNS-трафик' },
    { cmd: 'dig +trace example.com', desc: 'полная цепочка резолвинга' },
    { cmd: 'nmap -sV -Pn -p- 192.168.1.10', desc: 'только своя лаборатория!' },
    { cmd: 'tshark -r capture.pcap -Y "http.request" -T fields -e http.host -e http.request.uri', desc: 'HTTP-запросы из PCAP' }
  ]},
  { group: 'Zeek / Suricata', items: [
    { cmd: 'zeek -r capture.pcap', desc: 'разбор PCAP в логи Zeek' },
    { cmd: 'cat conn.log | zeek-cut id.orig_h id.resp_h id.resp_p duration | sort | uniq -c | sort -nr', desc: 'топ соединений' },
    { cmd: 'suricata -r capture.pcap -c /etc/suricata/suricata.yaml', desc: 'прогон PCAP через IDS' }
  ]},
  { group: 'Windows / PowerShell', items: [
    { cmd: "Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4625} -MaxEvents 50", desc: 'неудачные входы' },
    { cmd: "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; ID=1}", desc: 'создание процессов Sysmon' },
    { cmd: 'Get-Process | Where-Object {$_.Path -notlike "C:\\Windows\\*"}', desc: 'процессы вне системной папки' },
    { cmd: 'Get-ScheduledTask | Where-Object {$_.State -eq "Ready"}', desc: 'задачи планировщика' },
    { cmd: 'Get-ADUser -Filter * -Properties LastLogonDate | Sort LastLogonDate', desc: 'пользователи AD по активности' },
    { cmd: 'wevtutil qe Security /q:"*[System[(EventID=4720)]]" /f:text /c:10', desc: 'создание учётных записей' }
  ]},
  { group: 'Splunk SPL', items: [
    { cmd: 'index=* sourcetype=WinEventLog:Security EventCode=4625 | stats count by Account_Name, src_ip | sort -count', desc: 'брутфорс по аккаунтам' },
    { cmd: 'index=* sourcetype=access_combined status>=400 | timechart span=1h count by status', desc: 'всплески ошибок web-сервера' }
  ]}
];

const EVENT_IDS = [
  { id: '4624', desc: 'Успешный вход. Типы логона: 2 — интерактивный, 3 — сетевой, 10 — RDP. Разницу спрашивают на каждом интервью.' },
  { id: '4625', desc: 'Неудачный вход. Основа детекта брутфорса.' },
  { id: '4634 / 4647', desc: 'Выход из системы.' },
  { id: '4648', desc: 'Вход с явным указанием учётных данных — признак runas и lateral movement.' },
  { id: '4672', desc: 'При входе назначены привилегии администратора.' },
  { id: '4688', desc: 'Создание процесса + командная строка (нужно включить Command Line Auditing).' },
  { id: '4697', desc: 'Установлен сервис — классическая persistence.' },
  { id: '4720', desc: 'Создана учётная запись пользователя.' },
  { id: '4726', desc: 'Удалена учётная запись.' },
  { id: '4732', desc: 'Пользователь добавлен в локальную группу (например, Administrators).' },
  { id: '4768 / 4769', desc: 'Kerberos TGT / service ticket — база для детекта Kerberoasting.' },
  { id: '7045', desc: 'Установлен новый сервис (System log).' },
  { id: '1102', desc: 'Очищен журнал безопасности. Критично — почти всегда злонамеренно.' },
  { id: 'Sysmon 1', desc: 'Process create — с хешами и родительским процессом.' },
  { id: 'Sysmon 3', desc: 'Network connection от процесса.' },
  { id: 'Sysmon 7', desc: 'Image loaded — детект подгрузки DLL.' },
  { id: 'Sysmon 8', desc: 'CreateRemoteThread — process injection.' },
  { id: 'Sysmon 10', desc: 'Process access — например, доступ к LSASS.' },
  { id: 'Sysmon 11', desc: 'File create.' },
  { id: 'Sysmon 22', desc: 'DNS query от процесса.' }
];

const INTERVIEW = [
  { group: 'Сети', qs: [
    'Объясни трёхстороннее рукопожатие TCP.',
    'Разница TCP и UDP, примеры протоколов.',
    'Что происходит при вводе URL в браузере — полная цепочка.',
    'Как работает DNS-резолвинг? Что такое рекурсивный запрос?',
    'Порты: 22, 25, 53, 80, 88, 135, 139, 389, 443, 445, 3389, 3306, 5985.',
    'Что такое NAT и зачем он.',
    'Разница между IDS и IPS.',
    'Как выглядит DNS tunneling в логах.',
    'Что такое ARP spoofing.',
    'Как определить сканирование портов по трафику.'
  ]},
  { group: 'Windows', qs: [
    'Event ID 4624 — что это, какие бывают Logon Types, что означает Type 3 и Type 10.',
    'Разница между 4625 и 4771.',
    'Что означает Event ID 1102 и почему это критично.',
    'Где в Windows механизмы persistence.',
    'Что такое Sysmon и чем он лучше стандартного аудита.',
    'Sysmon Event ID 1, 3, 8, 11 — что означают.',
    'Что такое LSASS и почему его дампят.',
    'Как обнаружить подозрительный PowerShell: -enc, -nop, IEX, DownloadString.',
    'Что такое Pass-the-Hash.',
    'Как выглядит lateral movement через SMB в логах.'
  ]},
  { group: 'Linux', qs: [
    'Где живут логи аутентификации.',
    'Как найти все SUID-файлы и зачем.',
    'Что такое cron persistence.',
    'Как посмотреть открытые порты и связанные процессы.',
    'Что делает chmod 4755.',
    'Как проверить, что бинарник подменён.',
    '/etc/passwd vs /etc/shadow.',
    'Как выглядит reverse shell в ps aux.'
  ]},
  { group: 'SIEM и анализ', qs: [
    'Что такое SIEM и зачем нужна нормализация.',
    'Что такое корреляционное правило, приведи пример.',
    'Разница True Positive / False Positive / True Negative / False Negative.',
    'Что делать с алертом: опиши свой triage workflow пошагово.',
    'Когда эскалируешь на L2?',
    'Что такое EDR и чем отличается от антивируса.',
    'Что такое IOC и IOA, разница.',
    'Что такое Pyramid of Pain.',
    'Опиши MITRE ATT&CK: тактики, техники, процедуры.',
    'Что такое threat intelligence и как ты бы обогатил IP-адрес.'
  ]},
  { group: 'Инциденты и процессы', qs: [
    'Фазы IR по NIST.',
    'Что делать первым при подозрении на ransomware.',
    'Изолировать хост или наблюдать — как принять решение.',
    'Что такое chain of custody.',
    'Что такое volatile data и в каком порядке её собирать.',
    'Приходит алерт «подозрительный вход из другой страны» — твои действия.',
    'Как отличить настоящий фишинг от легитимной рассылки.'
  ]},
  { group: 'Про тебя — отвечать на английском', qs: [
    'Tell me about yourself.',
    'Walk me through your home lab.',
    'Describe the most interesting incident you investigated.',
    'Why blue team and not red team?',
    'Where do you see yourself in 2 years?'
  ]}
];

const IR_TEMPLATE = `# Incident Report — [ID] — [Краткое название]

| Поле | Значение |
|---|---|
| Analyst | |
| Date/Time (UTC) | |
| Severity | Low / Medium / High / Critical |
| Status | Open / Contained / Closed |
| Verdict | True Positive / False Positive / Benign |
| MITRE ATT&CK | T####.### |

## 1. Executive Summary
Три предложения. Что произошло, когда, каково влияние.

## 2. Timeline
| Time (UTC) | Event | Source |

## 3. Affected Assets
Хост / IP / пользователь / сервис.

## 4. Analysis
Что именно ты увидел и в каких данных. Запросы, фильтры, скриншоты.

## 5. Indicators of Compromise
| Type | Value | Context |
| IP | | |
| Domain | | |
| SHA256 | | |

## 6. Root Cause
Как злоумышленник вошёл.

## 7. Containment & Remediation
Что сделано / что рекомендуется.

## 8. Detection Improvement
Какое правило добавить, чтобы поймать это раньше в следующий раз.

## 9. Lessons Learned`;

const COURSE_FILTER = [
  'Он про defensive? Если пентест / «этичный хакинг» — откладываешь до Year 2.',
  'Он свежее 2023 года? Ландшафт SIEM и EDR меняется быстро.',
  'Какой артефакт останется? Нет файла в GitHub — курс не окупился.',
  'Какую неделю он ЗАМЕНЯЕТ? Не «дополняет». Нет ответа — нет времени.'
];

/* ═══════════════════════════════════════════════════════════════
   ДОСТИЖЕНИЯ

   Только за то, что реально меняет тебя как специалиста. Ничего
   за «зашёл три дня подряд»: награда за присутствие обесценивает
   награду за работу, и очень быстро перестаёт что-либо значить.

   Задачи ищутся по тексту, а не по номеру — содержание недель ещё
   правится, и привязка к индексам развалилась бы при первой же правке.
   ═══════════════════════════════════════════════════════════════ */
const ACHIEVEMENTS = [
  { id: 'pcap', icon: 'radar', name: 'Первый разобранный PCAP',
    desc: 'Ты вытащил историю из дампа трафика. Ровно это и делает аналитик в смену.',
    test: (t, S) => S.taskDoneMatching(/PCAP/i) },

  { id: 'rule', icon: 'bolt', name: 'Первое правило детектирования',
    desc: 'Не «прочитал про Sigma», а написал своё. С этого момента ты не потребитель алертов, а их автор.',
    test: (t, S) => S.taskDoneMatching(/написать[^"]*сво[^"]*правил/i) },

  { id: 'h100', icon: 'timer', name: '100 часов практики',
    desc: 'Сто часов руками. Здесь заканчивается «я посмотрел курс» и начинается опыт.',
    test: t => t.hoursFact >= 100 },

  { id: 'q1', icon: 'shield', name: 'Первый квартал закрыт',
    desc: 'Тринадцать недель подряд. Дальше этой отметки бросают редко.',
    test: (t, S) => S.quarterClosed(1) },

  { id: 'repo', icon: 'file', name: 'Первый репозиторий опубликован',
    desc: 'Портфолио начинается с первой ссылки, которую не стыдно дать рекрутёру.',
    test: t => t.repos >= 1 },

  { id: 'apply', icon: 'rocket', name: 'Первый отклик отправлен',
    desc: 'Самый тяжёлый отклик — первый. Дальше это просто рутина.',
    test: t => t.apps >= 1 }
];
