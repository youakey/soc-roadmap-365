/* Конфиг ESLint. Нужен только для проверок: сборки у проекта нет,
   package.json намеренно отсутствует, зависимости ставит CI на лету.
   Запуск локально:
     npm install --no-save eslint@9.13.0 eslint-plugin-security@3.0.1
     npx eslint *.js tools/*.mjs */
import security from 'eslint-plugin-security';

export default [
  /* Файлы страницы — обычные скрипты, не модули: сборки у проекта нет,
     всё грузится тегами <script> и делит одну глобальную область. */
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', location: 'readonly',
        localStorage: 'readonly', navigator: 'readonly', history: 'readonly',
        console: 'readonly', fetch: 'readonly', crypto: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', matchMedia: 'readonly',
        alert: 'readonly', confirm: 'readonly', Blob: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', supabase: 'readonly', process: 'readonly'
      }
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,

      /* Эти три — то, ради чего плагин здесь. Ронять сборку. */
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-child-process': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-proto': 'error',
      'no-prototype-builtins': 'error',

      /* detect-object-injection срабатывает на каждое обращение по индексу
         и в этом коде даёт десятки ложных попаданий: чтение по ключу из
         данных мы закрыли own() в security.js. Оставляем предупреждением,
         чтобы новые случаи было видно в логе, но сборку не роняем. */
      'security/detect-object-injection': 'warn',
      'security/detect-unsafe-regex': 'warn'
    }
  },

  /* Скрипты в tools/ — это ES-модули под node, у них свои глобалы. */
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly', fetch: 'readonly',
        Buffer: 'readonly', URL: 'readonly'
      }
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-unsafe-regex': 'warn'
    }
  }
];
