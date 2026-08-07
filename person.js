/* ============================================================
   person.js — параметры человека, отделённые от трека (§13.2 шаг 2).

   Зачем этот файл существует. Содержание трека уехало в
   `roadmaps.content` (§3.2-bis), но внутри него и рядом с ним
   продолжали жить параметры одного конкретного человека: его
   ноутбук, его город, его бюджет, его университет. Пока в задаче
   W1 написано «поставить Proxmox на ASUS», трек нельзя ни продать,
   ни подарить, ни собрать второй — у всех пользователей окажется
   ноутбук владельца.

   ── Где параметры живут и почему НЕ в `profiles` ──

   Отдельная таблица `public.person`, одна строка на аккаунт,
   ключ — `auth.users(id)`. Не `profiles` и не `progress.payload`,
   и оба отказа обоснованы, а не вкусовые.

   `profiles` отпадает по §3.1. Соблазн понятен: строка на человека
   там уже есть. Но политика на этой таблице — `for select to
   authenticated using (true)`: её читает КАЖДЫЙ вошедший, целиком
   и через обычный REST. Витрина `leaderboard` тут ни при чём —
   она не сужает доступ, она просто джойн поверх той же таблицы.
   То есть колонка «бюджет» в `profiles` — это бюджет, опубликованный
   всем. §3.1 разделяет приватное и публичное НА УРОВНЕ ТАБЛИЦ ровно
   для того, чтобы такая ошибка была невозможна физически, а не
   ловилась внимательностью.

   `progress.payload` отпадает по ключу. Прогресс ключуется парой
   (`user_id`, `roadmap_id`), а город, железо и бюджет принадлежат
   человеку, а не треку: они не меняются оттого, что он записался
   на второй трек. Положить их в payload значило бы завести вторую
   копию на шаге 3 §13.2 и получить два расходящихся города — тот же
   класс дефекта, что §12.1-ter, и такой же молчаливый.

   ── Что сервер проверяет, а что нет ──

   Границы (размер, число ключей, длина значений) стоят на сервере,
   блок 12 `supabase.sql`: клиент не граница (§11.1). А вот СПИСКА
   допустимых ключей на сервере намеренно нет. §11.5 уже заплатила
   за дублированный список аватаров в `auth.js` и в CHECK: списки
   разъезжаются, и сервер начинает отвергать то, что клиент считает
   нормальным. Здесь список полей будет расти при каждом новом треке,
   поэтому он живёт в одном месте — в `PERSON_FIELDS` ниже.

   ── Как трек читает параметры ──

   Подстановка по шаблону `{{ключ}}` в тексте задач, а не отдельное
   поле-примечание к неделе. Причина простая: одиннадцать мест — это
   куски предложений («Поставить Proxmox VE 8 на ASUS (NVMe и 16 ГБ
   уже стоят)»). Примечание такое предложение не чинит: «на ASUS»
   останется в тексте, а сноска будет ему противоречить. Это хуже,
   чем не делать ничего.

   Скобки двойные, и это не стиль. В задачах и в шпаргалке команд
   уже есть одинарные фигурные скобки — `awk '{print $1}'`. Одиночный
   `{...}` съел бы их. Пары `{{` в содержании не было ни одной,
   проверено грепом перед правкой.

   Подстановка идёт ПО МЕСТУ, тем же приёмом, что в `content.js`:
   живые массивы опустошаются и наполняются заново из сырых шаблонов.
   Поэтому ни одно из обращений в `app.js` переписывать не пришлось,
   а смена параметра в SETTINGS перерисовывает трек без перезагрузки.
   ============================================================ */

'use strict';

/* ── Анкета ───────────────────────────────────────────────────
   Восемнадцать полей. Больше §6 не спрашивает и меньше нельзя:
   каждое поле здесь читается хотя бы одним местом трека, иначе его
   бы тут не было. Порядок — от того, что спрашивают первым.

   У КАЖДОГО поля есть умолчание, и это требование, а не удобство:
   человек, который не заполнил ничего, обязан увидеть работающий
   интерфейс, а не дырки. Умолчания нейтральные — ни города,
   ни ноутбука, ни валюты владельца в них нет. */
const PERSON_FIELDS = [
  { id: 'name',      label: 'NAME',       type: 'text', max: 60,  def: '',  hint: 'для CV и холодного письма' },
  { id: 'city',      label: 'CITY',       type: 'text', max: 40,  def: '',  hint: 'где живёшь' },
  { id: 'hub',       label: 'HUB',        type: 'text', max: 40,  def: '',  hint: 'ближайший город с рынком ИБ' },
  { id: 'region',    label: 'REMOTE',     type: 'text', max: 40,  def: '',  hint: 'регион удалённой работы' },
  { id: 'abroad',    label: 'ABROAD',     type: 'text', max: 40,  def: '',  hint: 'зарубежное направление' },
  { id: 'employers', label: 'EMPLOYERS',  type: 'text', max: 200, def: '',  hint: 'кого смотреть на этом рынке' },
  { id: 'boards',    label: 'BOARDS',     type: 'text', max: 120, def: '',  hint: 'где искать вакансии' },
  { id: 'edu',       label: 'EDU',        type: 'text', max: 80,  def: '',  hint: 'учебное заведение' },
  { id: 'student',   label: 'STUDENT',    type: 'bool',           def: false, hint: 'учишься сейчас' },
  { id: 'level',     label: 'LEVEL',      type: 'num',  min: 1, max: 5,  def: 2, hint: 'стартовый уровень, 1–5' },
  { id: 'os',        label: 'OS',         type: 'sel',  opts: ['macos', 'linux', 'windows'], def: 'linux', hint: 'система повседневной машины' },
  { id: 'daily',     label: 'DAILY BOX',  type: 'text', max: 60,  def: '',  hint: 'повседневная машина' },
  { id: 'lab',       label: 'LAB BOX',    type: 'text', max: 60,  def: '',  hint: 'машина под лабораторию' },
  { id: 'ram',       label: 'LAB RAM',    type: 'num',  min: 2, max: 512, def: 16, hint: 'ГБ памяти на лабораторной' },
  { id: 'budget',    label: 'BUDGET',     type: 'num',  min: 0, max: 10000, def: 0, hint: '$ в месяц на обучение' },
  { id: 'dhours',    label: 'H / DAY',    type: 'num',  min: 0, max: 16,  def: 3,  hint: 'часов в день' },
  { id: 'wdays',     label: 'D / WEEK',   type: 'num',  min: 1, max: 7,   def: 5,  hint: 'дней в неделю' },
  { id: 'lang2',     label: '2ND LANG',   type: 'text', max: 30,  def: '',  hint: 'второй язык кроме английского' }
];

/** Подписи систем. Ключ хранится, подпись показывается — та же
 *  конвенция, что у статусов недели (§3.8): менять ключ нельзя. */
const OS_LABEL = { macos: 'macOS', linux: 'Linux', windows: 'Windows' };

/** Исходы за год по стартовому уровню. Цифры «25–35%» в data.js были
 *  посчитаны под конкретный старт «2 из 5» — то есть правило было,
 *  просто застыло в одной строке таблицы. Здесь оно распрямлено.
 *  Порядок значений совпадает с порядком строк в OUTCOMES_RAW. */
const OUTCOME_ODDS = {
  1: ['15–25%', '~35%', '~55%', '~25%'],
  2: ['25–35%', '~45%', '~60%', '~15%'],
  3: ['35–45%', '~55%', '~65%', '~10%'],
  4: ['45–60%', '~60%', '~70%', '~7%'],
  5: ['60–75%', '~65%', '~75%', '~5%']
};

const PERSON_KEY = 'soc365.person.v1';

/** Готовые тексты, зависящие от параметров. Объект, а не отдельные
 *  переменные: `const` наружу переприсвоить нельзя, а поле объекта —
 *  можно, и ссылка на объект при этом остаётся прежней. */
const PERSON_OUT = { cv: '', email: '', setup: '' };

const Person = {
  /** Текущие параметры. Только ключи из PERSON_FIELDS, ничего больше. */
  p: null,

  /** Был ли на этом устройстве сохранённый кеш параметров в момент
   *  загрузки. Нужен ровно одному месту — слиянию с облаком.
   *  Урок §12.5-bis дословно: у параметров нет «пустого» состояния,
   *  умолчания непустые, и решить «местное или облачное» по самому
   *  объекту нельзя. Признак обязан приходить снаружи. */
  cached: false,

  /** 'code' — умолчания, 'local' — кеш браузера, 'db' — база. */
  source: 'code',
  note: '',

  /** Отметка СЕРВЕРА: `updated_at` той строки, которую этот браузер
   *  считает уже уехавшей. Часы намеренно одни и чужие: триггер
   *  `person_guard` переписывает `updated_at` своим `now()`, поэтому
   *  местное время устройства с облачным несравнимо вовсе — браузер
   *  с уехавшими часами выигрывал бы всегда, молча и правдоподобно.
   *  Пусто — значит «не знаю, что на сервере». */
  stamp: '',

  /** Есть местные правки, которых сервер не подтверждал. Без этого
   *  признака отметка времени делает хуже, а не лучше: правка,
   *  сделанная без сети, оказалась бы «старее облака» и погибла бы
   *  при первой же удачной загрузке. */
  dirty: false,

  _timer: null,
  _raw: null,       // сырые шаблоны задач недель, снятые при первом apply
  _rawWeeks: 0,     // сколько недель было, когда их сняли
  _rawDaily: null,  // сырые подписи блоков дня

  /* ── Умолчания ──────────────────────────────────────────── */
  defaults() {
    const d = {};
    PERSON_FIELDS.forEach(f => { d[f.id] = f.def; });
    return d;
  },

  /** Разбор чужого объекта в свою форму. Поимённо через own(),
   *  как в content.js: pickShape здесь не годится — он подменяет
   *  объект целиком и внутрь не заглядывает (§12.5-bis).
   *  Ключ, которого нет в PERSON_FIELDS, не доходит до состояния
   *  вовсе, поэтому `__proto__` из разобранного JSON не попадает
   *  никуда. Одно дурное значение не роняет остальные: у каждого
   *  поля есть умолчание, и негодное просто им и остаётся. */
  parse(raw) {
    const out = this.defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    PERSON_FIELDS.forEach(f => {
      const v = own(raw, f.id, undefined);
      if (v === undefined || v === null) return;
      if (f.type === 'bool') { if (typeof v === 'boolean') out[f.id] = v; return; }
      if (f.type === 'num') {
        const n = Number(v);
        if (!isFinite(n)) return;
        out[f.id] = Math.min(f.max, Math.max(f.min, n));
        return;
      }
      if (typeof v !== 'string') return;
      if (f.type === 'sel') { if (f.opts.indexOf(v) !== -1) out[f.id] = v; return; }
      out[f.id] = v.slice(0, f.max);
    });
    return out;
  },

  val(id) { return own(this.p || {}, id, own(this.defaults(), id, '')); },

  /* ── Переменные подстановки ─────────────────────────────────
     Половина из них — не сами параметры, а производные от них.
     Это и есть «трек подстраивается под человека»: не текст
     владельца с заменёнными словами, а правило, посчитанное
     от чисел. Считается здесь, а не в шаблонах, потому что
     шаблон обязан оставаться текстом. */
  vars() {
    const p = this.p || this.defaults();
    const g = id => own(p, id, '');
    const s = (id, dflt) => { const v = String(g(id) || '').trim(); return v || dflt; };
    const ram = Number(g('ram')) || 16;
    const budget = Number(g('budget')) || 0;
    /* Имена полей НАРОЧНО не совпадают с ключами `Store.d` — там уже
       есть `days` (отметки по датам) и `langs`. Совпадение имён между
       прогрессом и параметрами ничего не сломало бы сегодня, объекты
       разные, — но это ровно та мина, на которую наступают через
       полгода, копируя строку не из того объекта. Имя подстановки
       при этом осталось коротким: `{{days}}`, а не `{{wdays}}`. */
    const hours = Number(g('dhours')) || 0;
    const days = Number(g('wdays')) || 0;
    const level = Math.min(5, Math.max(1, Math.round(Number(g('level')) || 2)));
    const student = g('student') === true;
    const lang2 = s('lang2', '');
    const odds = own(OUTCOME_ODDS, String(level), OUTCOME_ODDS[2]);

    /* Сколько тяжёлых VM тянет лабораторная машина. Правило, а не
       мнение: около 4 ГБ съедает хост, дальше по ~6 ГБ на рабочую VM
       с запасом на кеш диска. На 16 ГБ выходит 2 — ровно тот совет,
       который лежал в data.js прописью под конкретный ASUS. */
    const vm = Math.max(1, Math.floor((ram - 4) / 6));

    return {
      name:   s('name', '[Имя]'),
      city:   s('city', '[город]'),
      hub:    s('hub', '[ближайший крупный город]'),
      region: s('region', ''),
      abroad: s('abroad', '[зарубежный рынок]'),
      employers: s('employers', 'банки, телеком, интеграторы, MSSP'),
      boards: s('boards', 'локальные джоб-борды'),
      edu:    s('edu', '[учебное заведение]'),
      daily:  s('daily', '[повседневная машина]'),
      lab:    s('lab', '[машина под лабораторию]'),
      os:     own(OS_LABEL, String(g('os')), 'Linux'),
      ram:    String(ram),
      vm:     String(vm),
      level:  String(level),
      hours:  String(hours),
      days:   String(days),
      /* Ресурс времени ЧЕЛОВЕКА. Ни во что не пересчитывается:
         часы недель — это план трека, и по ним считает сервер (§13.2-bis). */
      weekly: (hours * days).toFixed(1).replace(/\.0$/, ''),
      /* Две подписи одного языка, и это не дубль. В шаблоне CV пустое
         поле обязано выглядеть как остальные его пропуски — в скобках;
         в подписи блока дня скобки смотрелись бы поломкой. */
      lang2:  lang2 || '[второй язык]',
      lang2t: lang2 || 'Second lang',
      restdays: String(Math.max(0, 7 - Math.round(days))),
      remote: region2(s('region', '')),
      budget: String(budget),
      budget_if: budget >= 15 ? 'бюджет это позволяет' : 'если появится бюджет',
      student_price: student
        ? 'проверь Student Pricing — по студенческому существенная скидка'
        : 'проверь действующие скидки и промо',
      out1: odds[0], out2: odds[1], out3: odds[2], out4: odds[3]
    };
  },

  /** Показывать ли пункт, помеченный этим условием. Список закрытый:
   *  свободное выражение в данных — это интерпретатор в шаблоне,
   *  а его тут быть не должно. */
  cond(name) {
    const p = this.p || this.defaults();
    if (name === 'student') return own(p, 'student', false) === true;
    if (name === 'lang2') return String(own(p, 'lang2', '') || '').trim() !== '';
    if (name === 'budget') return (Number(own(p, 'budget', 0)) || 0) > 0;
    return true;
  },

  /* ── Хранение ───────────────────────────────────────────────
     Две формы записи, и старая обязана читаться. До 07.08.2026
     в ключе лежал сам объект параметров; теперь — конверт
     `{ k: 1, p, stamp, dirty }`. Запись без `k` считается старой:
     параметры берутся, отметки нет, а «не знаю, что на сервере»
     означает `dirty` — то есть ровно прежнее поведение, местное
     побеждает. Регресса при обновлении клиента быть не должно. */
  loadLocal() {
    try {
      const raw = localStorage.getItem(PERSON_KEY);
      this.cached = !!raw;
      const box = raw ? safeParse(raw) : null;
      const boxed = !!box && typeof box === 'object' && !Array.isArray(box) && own(box, 'k', 0) === 1;
      this.p = this.parse(boxed ? own(box, 'p', null) : box);
      const st = boxed ? own(box, 'stamp', '') : '';
      this.stamp = typeof st === 'string' ? st.slice(0, 64) : '';
      this.dirty = boxed ? own(box, 'dirty', true) === true : !!raw;
      this.source = raw ? 'local' : 'code';
    } catch (e) {
      console.warn('person: кеш не прочитан', e);
      this.p = this.defaults();
      this.cached = false;
      this.stamp = '';
      this.dirty = false;
      this.source = 'code';
    }
    return this.p;
  },

  saveLocal() {
    try {
      localStorage.setItem(PERSON_KEY, JSON.stringify(
        { k: 1, p: this.p, stamp: this.stamp, dirty: this.dirty }));
      return true;
    } catch (e) { console.warn('person: кеш не записан', e); return false; }
  },

  /** Забрать из базы и слить. Не бросает никогда: офлайн для этого
   *  приложения рабочий режим (§10), а без параметров трек живёт
   *  на умолчаниях и остаётся читаемым. */
  async load(sb, user) {
    this.loadLocal();
    this.note = '';
    if (!sb || !user) { this.note = 'нет входа'; return this.source; }
    try {
      const { data, error } = await sb.from('person')
        .select('params, updated_at').eq('id', user.id).maybeSingle();
      if (error) throw error;
      const cloud = data ? own(data, 'params', null) : null;
      const cs = data ? own(data, 'updated_at', '') : '';
      const cstamp = typeof cs === 'string' ? cs : '';
      if (!cloud || typeof cloud !== 'object') { this.note = 'на сервере параметров нет'; return this.source; }

      /* Слияние ПООБЪЕКТНОЕ — по полям его делать нечем: сервер хранит
         один jsonb и меток на поле там нет (§13.2-bis). Но «кто новее»
         теперь спрашивается у сервера, а не решается по одному признаку
         «обжитое устройство». Три случая, и все три обязаны быть
         названы явно:

         1. Устройство чистое (`!cached`) — побеждает облако. Иначе
            «параметры следуют за аккаунтом» пустые слова: умолчания
            затрут введённое с другого ноутбука.
         2. Есть неотправленные правки (`dirty`) — побеждает местное.
            Всегда и независимо от времени: человек только что это
            напечатал, а облако его правки ещё не видело.
         3. Иначе решает отметка сервера. Облако новее того, что этот
            браузер отправлял сам, — значит правку сделали на другом
            устройстве, и она свежее. Именно этот случай раньше терялся:
            прежнее правило отдавало победу местному всегда.

         Часы одни и серверные. Сравнение через `Date.parse`, а не
         строкой: формат `updated_at` у PostgREST зависит от того,
         есть ли дробная часть, и лексикографическое сравнение держится
         на совпадении, а не на правиле. */
      const takeCloud = !this.cached || (!this.dirty && this._newer(cstamp, this.stamp));
      if (takeCloud) {
        this.p = this.parse(cloud);
        this.stamp = cstamp;
        this.dirty = false;
        this.saveLocal();
        this.source = 'db';
      } else {
        this.source = 'local';
      }
    } catch (e) {
      this.note = 'база недоступна: ' + (e && e.message ? e.message : String(e));
      console.warn('person: остаюсь на местных параметрах —', this.note);
    }
    return this.source;
  },

  /** Строго ли `a` позже `b`. Пустая отметка `b` означает «не знаю,
   *  что на сервере», и тогда любое облако считается новее — иначе
   *  устройство, обновившееся со старой формы кеша, не подхватило бы
   *  облако никогда. Нечитаемая дата — не повод отдать победу:
   *  «не знаю» здесь честнее, чем «наверное, новее». */
  _newer(a, b) {
    const ta = Date.parse(a);
    if (!isFinite(ta)) return false;
    if (!b) return true;
    const tb = Date.parse(b);
    return !isFinite(tb) ? false : ta > tb;
  },

  /** Отложенная отправка: поля текстовые, иначе запрос на каждую букву. */
  schedule(sb, user) {
    if (!sb || !user) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(sb, user), 1500);
  },

  /** Отправка. `updated_at` НЕ шлётся: триггер `person_guard`
   *  переписывает его своим `now()`, и посланное значение было бы
   *  красивой ложью в запросе. Зато оно читается обратно — это
   *  единственный способ узнать серверное время своей же записи
   *  и заводить отметку по тем же часам, что у облака. */
  async push(sb, user) {
    if (!sb || !user) return false;
    try {
      const { data, error } = await sb.from('person')
        .upsert({ id: user.id, params: this.p }, { onConflict: 'id' })
        .select('updated_at').maybeSingle();
      if (error) throw error;
      const st = data ? own(data, 'updated_at', '') : '';
      if (typeof st === 'string' && st) this.stamp = st;
      this.dirty = false;
      this.saveLocal();
      return true;
    } catch (e) {
      /* Не доехало — правка остаётся неотправленной, и это надо
         помнить: без `dirty` следующая удачная загрузка сочла бы
         облако новее и стёрла бы напечатанное без сети. */
      console.warn('person push', e && e.message ? e.message : e);
      return false;
    }
  },

  set(id, value) {
    const f = PERSON_FIELDS.find(x => x.id === id);
    if (!f) return false;                      // чужой ключ не пройдёт
    const one = {};
    one[id] = value;
    const clean = this.parse(Object.assign({}, this.p, one));
    this.p = clean;
    this.dirty = true;                         // сервер этого ещё не видел
    this.saveLocal();
    return true;
  },

  reset() {
    this.p = this.defaults();
    this.dirty = true;
    this.saveLocal();
  }
};

/** «Удалёнка» без региона выглядит лучше, чем «Удалёнка ». */
function region2(r) { return r ? 'Удалёнка ' + r : 'Удалёнка'; }

/* ── Подстановка ──────────────────────────────────────────────
   Один проход, без рекурсии по результату. Это не экономия:
   значение параметра, в котором окажется `{{...}}`, не должно
   запускать второй круг подстановки — иначе человек, вписавший
   в поле CITY текст `{{name}}`, получает интерпретатор.

   Неизвестный ключ ОСТАЁТСЯ в тексте видимым. Соблазн подставить
   пустую строку велик и неправилен: молча съеденный плейсхолдер —
   это дырка в предложении, которую не заметит никто, а видимый
   `{{tpyo}}` замечают на первой же отрисовке.

   Имя ключа обязано начинаться с буквы, поэтому `__proto__`
   до поиска не доходит вовсе, а `constructor` доходит — и его
   останавливает own(). Обе двери заперты намеренно: та, что
   выглядит опаснее, и та, что срабатывает (§3.2-bis). */
const TPL_RE = /\{\{([a-z][a-z0-9_]{0,23})\}\}/g;

function tplStr(s, vars) {
  if (typeof s !== 'string' || s.indexOf('{{') === -1) return s;
  return s.replace(TPL_RE, (whole, key) => {
    const v = own(vars, key, undefined);
    return typeof v === 'string' || typeof v === 'number' ? String(v) : whole;
  });
}

/** Глубокая подстановка по копии. Исходный шаблон не трогается
 *  никогда — иначе повторное применение работало бы по уже
 *  подставленному тексту, и второй заход в SETTINGS ничего
 *  бы не менял. */
function tplDeep(node, vars) {
  if (typeof node === 'string') return tplStr(node, vars);
  if (Array.isArray(node)) return node.map(x => tplDeep(x, vars));
  if (node && typeof node === 'object') {
    const out = {};
    Object.keys(node).forEach(k => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      out[k] = tplDeep(own(node, k, null), vars);
    });
    return out;
  }
  return node;
}

/* ── Применение к живым данным ────────────────────────────────
   Реестр пар «живой массив ← сырые шаблоны». Живой массив
   опустошается и наполняется заново, ссылки на него остаются
   валидными — тот же приём, что в Content.install(). Благодаря
   этому ни одно обращение вида `HARDWARE.forEach` в app.js
   переписывать не пришлось.

   `when` — необязательное условие показа пункта. Единственный
   его потребитель сейчас — красный флаг про оценки в университете:
   он осмыслен только для того, кто учится. */
function personTargets() {
  return [
    { live: HARDWARE,       raw: HARDWARE_RAW },
    { live: MARKET,         raw: MARKET_RAW },
    { live: OUTCOMES,       raw: OUTCOMES_RAW },
    { live: LANGS,          raw: LANGS_RAW },
    { live: RULES,          raw: RULES_RAW },
    { live: RED_FLAGS,      raw: RED_FLAGS_RAW },
    { live: APP_CATEGORIES, raw: APP_CATEGORIES_RAW },
    { live: BUDGET_TEXT,    raw: BUDGET_TEXT_RAW }
  ];
}

/** Пересобрать всё, что зависит от параметров.
 *
 *  `reseat` — «сырьё сменилось, сними его заново». Ровно один случай:
 *  `Content.load()` заменил недели теми, что приехали из базы. Число
 *  недель при этом совпадает, поэтому по длине подмену не поймать —
 *  признак приходит снаружи, от того, кто её сделал. Тот же урок, что
 *  у `Store.cached` (§12.5-bis): состояние, у которого нет пустого
 *  вида, снаружи и различают. */
function applyPerson(reseat) {
  const vars = Person.vars();
  if (reseat) { Person._raw = null; Person._rawDaily = null; }

  personTargets().forEach(t => {
    const built = [];
    t.raw.forEach(item => {
      const when = item && typeof item === 'object' ? own(item, 'when_', null) : null;
      if (when && !Person.cond(when)) return;
      const v = tplDeep(item, vars);
      if (v && typeof v === 'object' && !Array.isArray(v)) delete v.when_;
      built.push(v);
    });
    t.live.length = 0;
    built.forEach(x => t.live.push(x));
  });

  /* Лабораторная машина «годится» по памяти, а не по мнению.
     Порог 8 ГБ: ниже него не поднять Wazuh (4 ГБ) вместе с целью.
     Считается здесь, а не подставляется: `ok` — булево, а подстановка
     работает только со строками, и «false» строкой была бы истиной. */
  if (HARDWARE.length > 1) {
    HARDWARE[1].ok = (Number(Person.val('ram')) || 0) >= 8;
  }

  /* Тексты одной строкой — не массивы, поэтому по месту их не
     подменить. Их читают через PERSON_OUT, а не по имени. */
  PERSON_OUT.cv = tplStr(CV_TEXT_RAW, vars);
  PERSON_OUT.email = tplStr(COLD_EMAIL_RAW, vars);
  PERSON_OUT.setup = tplStr(own(SETUP_CMDS, String(Person.val('os')), SETUP_CMDS.linux), vars);

  /* Задачи недель. Сырые шаблоны снимаются ОДИН раз и именно здесь,
     а не в data-weeks.js: к этому моменту `Content.load()` уже мог
     заменить содержание тем, что лежит в базе, и запоминать надо
     то, что реально приехало. Второй вызов работает с той же
     сохранённой копией, поэтому правка параметра в SETTINGS
     подставляет заново, а не по уже подставленному. */
  if (!Person._raw || Person._rawWeeks !== WEEKS.length) {
    Person._raw = WEEKS.map(w => w.tasks.slice());
    Person._rawWeeks = WEEKS.length;
  }
  WEEKS.forEach((w, i) => {
    const src = Person._raw[i] || w.tasks;
    w.tasks = src.map(x => tplStr(x, vars));
  });

  /* Подписи блоков дня. `id` — хранимый ключ `Store.d.days`
     и трогать его нельзя (§3.2-bis), а вот подпись «Polish»
     у человека, который учит не польский, — это чужая жизнь
     в его трекере. */
  if (!Person._rawDaily || Person._rawDaily.length !== DAILY.length) {
    Person._rawDaily = DAILY.map(b => ({ name: b.name, desc: b.desc }));
  }
  DAILY.forEach((b, i) => {
    const r = Person._rawDaily[i];
    if (!r) return;
    b.name = tplStr(r.name, vars);
    b.desc = tplStr(r.desc, vars);
  });
}

/* Первый прогон — прямо при загрузке файла, на умолчаниях.
   Без него живые массивы стояли бы пустыми до `openApp()`, и любая
   отрисовка, случившаяся раньше, показала бы пустой HARDWARE вместо
   умолчаний. «У человека, который ничего не заполнял, интерфейс
   не должен опустеть» — это требование, а не пожелание. */
applyPerson(true);
