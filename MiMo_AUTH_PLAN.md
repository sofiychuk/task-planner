# План аналізу та реалізації аутентифікації (Supabase email/password)

> Статус: **планування**. Реалізація аутентифікації ще не виконувалася.
> Документ збережено як `MiMo_AUTH_PLAN.md` у корені проєкту.

---

## 1. Аналіз існуючого коду

### Що вже є

| Область | Статус |
|---|---|
| Vue 3.5 + `<script setup>` SFC, Vite 8, чистий JS (без TS) | ✅ |
| Pinia 4 встановлено, `createPinia()` підключено в `main.js` | ✅ але **store-ів ще немає** |
| `@supabase/supabase-js` 2.119.1 встановлено, клієнт створено в `src/lib/supabase.js` | ✅ але **auth options — усі за замовчуванням, коду аутентифікації немає** |
| Vue Router 4 з `createWebHistory`, 3 статичні маршрути (`/`, `/planner`, `/settings`), **без guard-ів, без `meta`, без 404** | ⚠️ |
| Tailwind CSS 4 через `@tailwindcss/vite`; інтерфейс **українською** ("Мої завдання", "Налаштування") | ✅ |
| `.env.local` містить `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (в ігнорі git) | ✅ |
| Lint/format/test інструменти | ❌ не налаштовано |
| Auth UI (login/register сторінки, стан auth у навігації, компоненти error/loading) | ❌ немає |

Перевірено з встановленого `@supabase/auth-js@2.119.1`: значення за замовчуванням — `flowType: 'implicit'`, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`. Тобто збереження сесії в localStorage працює «з коробки» — відсутня лише вся інтеграція на рівні застосунку.

### Наявні проблеми та обмеження, що впливають на реалізацію

1. **`flowType` за замовчуванням — `'implicit'`** — Supabase рекомендує **PKCE** для SPA, і налаштування flow у dashboard має збігатися з клієнтом. Якщо проєкт налаштований на PKCE (сучасний дефолт), а клієнт використовує implicit, посилання для підтвердження email ламаються через mismatch flow. → Клієнта потрібно налаштувати явно.
2. **Ризик гонки (race condition) при перезавантаженні** — відновлення сесії асинхронне. Без «initialized» gate у router guard користувач зі збереженою сесією при hard reload на protected-сторінці буде відправлений на `/login` до того, як прочитається localStorage. Це класичний баг саме для цього набору фіч.
3. **`PlannerView.vue` має неправильний контент** — його `<h1>` каже "Settings" з текстом про налаштування; `SettingsView.vue` — **порожній template**. Баг копіювання (існував раніше, не пов'язаний з auth — залишається як є, лише зафіксовано).
4. **Залишковий шаблонний CSS Vite у `style.css`** — глобальні правила для `#app` (`width: 1126px`, `border-inline`, **`text-align: center`**) та `h1 { font-size: 56px }` досі застосовуються до оболонки застосунку (контейнер `#app` з `index.html` залишається в DOM після mount). Нові форми мають використовувати `text-left` та явні розміри заголовків через Tailwind, щоб бути несприйнятливими до цього.
5. **Змішаний відступ (indentation)**: JS-файли — 4 пробіли (`router/`, `lib/`, `main.js`); `.vue` — 2 пробіли. Форматувального інструмента немає. → План: 4 пробіли для JS, 2 для SFC, відповідно до наявних «сусідів» кожного типу файлів.
6. **Ризик circular imports**: store не має імпортувати router (навігацію після виконання store-дій робитимуть view), щоб `router/index.js` міг імпортувати store для guard-ів.
7. **`useAuthStore()` потрібно викликати всередині guard-колбеків**, а не на top-level модуля `router/index.js`.
8. **Немає catch-all маршруту** — невідомі шляхи рендери порожню сторінку (існувало раніше; дешево додати redirect-fallback разом із guard).
9. **Мертвий код**: `HelloWorld.vue` (не використовується) — поза скоупом.
10. **Примітка про деплой**: `createWebHistory` потребує SPA-fallback на production-хості для deep links на `/login`; Vite dev server обробляє це автоматично.

---

## 2. План реалізації

### Архітектурні рішення

- **PKCE flow**, явно задано на клієнті (відповідає поточним рекомендаціям Supabase та сучасним дефолтам проєкту; працює з `detectSessionInUrl` для автоматичного обміну `?code=` з посилань підтвердження).
- **Єдиний Pinia store** `src/stores/auth.js` у **setup-стилі** (відповідає сучасним конвенціям `<script setup>`). Store **не залежить від router** — view викликатимуть `router.replace(...)` після виконання дій. Циклічних імпортів немає.
- **Ідемпотентний `initialize()`** у store, який очікує router guard; резолвиться на події Supabase `INITIAL_SESSION` (з fallback через `getSession()`, щоб ніколи не зависнути). Захищає від гонки при перезавантаженні.
- **Усі зміни стану проходять через `onAuthStateChange`** (а не ручне присвоєння після дій) — це автоматично покриває: перезавантаження сторінки, оновлення токена, **вихід в іншій вкладці** (auth-js синхронізує через BroadcastChannel) та приземлення після редіректу з підтвердження email.
- **Дружні помилки** централізовано в helper-модулі, повертаються з store-дій як готові до відображення **рядки українською** (відповідно до мови інтерфейсу); view лише рендерять їх.
- **Захист маршрутів через `meta`**: `meta.requiresAuth` / `meta.guestOnly` — жодних захардкоджених списків маршрутів.
- **Безпечний redirect**: приймаються лише same-origin абсолютні шляхи (починаються з одного `/`, не `//`, не `\`), і ніколи не редіректимо назад на `/login` чи `/register` (захист від loop).
- Залишаємо **статичні імпорти маршрутів** (наявний стиль проєкту); без code-splitting, без TypeScript, без нових залежностей.

### Зміни у файлах

#### Нові файли

**1. `src/lib/authErrors.js`** — `getAuthErrorMessage(error)`: мапінг кодів/повідомлень Supabase → дружні українські тексти:

- `invalid_credentials` → "Невірний email або пароль."
- `email_not_confirmed` → "Спершу підтвердьте адресу електронної пошти."
- `user_already_exists` → "Користувач з таким email вже існує."
- `weak_password` / `validation_failed` → підказки щодо політики пароля
- `over_email_send_rate_limit` / `over_request_rate_limit` → "Забагато спроб. Спробуйте за кілька хвилин."
- network / `Failed to fetch` → "Не вдалося зв'язатися з сервером. Перевірте інтернет."
- помилки обміну PKCE (відсутній code verifier — лист відкрито в іншому браузері) → "Відкрийте лист підтвердження в тому самому браузері, у якому реєструвалися."
- generic fallback → "Щось пійшло не так. Спробуйте ще раз."

**2. `src/lib/redirect.js`** — `getSafeRedirect(value, fallback = '/')`: повертає `value`, лише якщо це рядок, що починається з `/`, не починається з `//`, не містить `\`, а шлях не є `/login` чи `/register`; інакше `fallback`.

**3. `src/stores/auth.js`** — основний store:

```
state/refs:  user, session, initialized (bool)
getter:      isAuthenticated => !!user.value
actions:
  initialize()                   // ідемпотентний; резолвить promise на INITIAL_SESSION
  register({email,password})     -> { ok, needsConfirmation?, error? }
  login({email,password})        -> { ok, error? }
  logout()                       -> { ok, error? }
  resendConfirmation(email)      -> { ok, error? }
```

- Підписка на `supabase.auth.onAuthStateChange` один раз під час `initialize()`; кожна auth-подія оновлює `user`/`session` (встановлює `null` на `SIGNED_OUT`).
- `register` викликає `signUp({ email, password, options: { emailRedirectTo: window.location.origin } })`, щоб посилання підтвердження повертали на поточний origin (localhost у dev).
- Усі помилки дій проходять через `getAuthErrorMessage` перед поверненням; дії ніколи не кидають виняток у view.
- Явно **не** викликає `getSession()` всередині auth-колбеку (документована небезпека deadlock).

**4. `src/components/AppAlert.vue`** — переисп. банер: props `type: 'error' | 'success' | 'info'`, `role="alert"` для помилок / `aria-live="polite"` для успіху; стилі Tailwind (червоний/зелений/синій tinted box).

**5. `src/components/LoadingSpinner.vue`** — малий inline SVG-спінер зі стилями Tailwind (використовується всередині кнопок та під час boot застосунку).

**6. `src/views/LoginView.vue`**
- Поля: email, password (опційний toggle «показати пароль»); клієнтська валідація (не порожнє, формат email) до будь-якого мережевого виклику.
- `submitting` ref: блокує кнопку, підміняє на спінер, запобігає double-submit.
- Успіх → `router.replace(getSafeRedirect(route.query.redirect))`.
- Special-case `email_not_confirmed`: error alert + кнопка "Надіслати лист ще раз" (використовує `resendConfirmation`, власний pending стан + повідомлення про успіх).
- Посилання на `/register` **зі збереженням `redirect` query**.
- Контейнер форми має `text-left` (нечутливий до залишкового глобального CSS).

**7. `src/views/RegisterView.vue`**
- Поля: email, password, confirm-password; валідація: мінімальна довжина (6, дефолт Supabase), збігаються паролі, формат email — повідомлення на рівні полів до мережі.
- Успіх **без** session (підтвердження email увімкнено) → панель успіху: "Перевірте пошту. Ми надіслали лист для підтвердження…" + кнопка resend + посилання на вхід.
- Успіх **з** session (підтвердження вимкнено в проєкті) → redirect як у login (поведінка правильна в обох випадках).
- Помилки (`user_already_exists`, слабкий пароль, rate limits) через `AppAlert`.
- Посилання на `/login` зі збереженням `redirect`.

#### Модифіковані файли

**8. `src/lib/supabase.js`** — додати явні auth options:

```js
createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

(Пersistence/detection і так дефолти — явний запис документує інтенцію та захищає від тихого змінювання дефолтів у майбутніх версіях.)

**9. `src/router/index.js`**
- Додати `meta: { requiresAuth: true }` до `/`, `/planner`, `/settings`.
- Додати:
  - `/login` → `LoginView`, `meta: { guestOnly: true }`
  - `/register` → `RegisterView`, `meta: { guestOnly: true }`
- Додати `router.beforeEach(async (to) => ...)`:

```
await auth.initialize()                    // усуває гонку при перезавантаженні
if (to.meta.requiresAuth && !auth.isAuthenticated)
    return { name: 'login', query: { redirect: to.fullPath } }
if (to.meta.guestOnly && auth.isAuthenticated)
    return getSafeRedirect(to.query.redirect)   // '/' якщо немає/небезпечно
// опційний поліш: прибрати залишковий ?code= після PKCE-обміну
```

- Опційно: catch-all `/:pathMatch(.*)*` → redirect `/` (закриває прогалину «порожня сторінка»).
- `useAuthStore()` викликається **всередині** колбеку.

**10. `src/App.vue`** — auth-aware header:
- Поки `!auth.initialized` → рендерити лише логотип бренду + спінер (запобігає flash «розлогіненої» навігації під час boot; guard вже очікує init, але `App.vue` рендериться до завершення initial navigation).
- Розлогінений → посилання "Увійти" (`/login`) та "Реєстрація" (`/register`).
- Залогінений → email користувача + кнопка "Вийти" з pending станом `loggingOut` (disabled + спінер); при `signOut()`: store очищає стан через подію `SIGNED_OUT`, потім `router.replace('/login')`. Якщо `signOut()` падає (мережа) — показати warning alert, але все одно очистити локальний стан, щоб користувач не застряг.

**`main.js` — змін не потрібно.** Pinia вже встановлено до router, а guard запускає `initialize()`.

---

## 3. Потоки аутентифікації

### Реєстрація + підтвердження email

```
/register → валідація → signUp(email, password, emailRedirectTo=origin)
  → немає session  → панель успіху "перевірте пошту"
  → користувач клікає посилання з листа (PKCE ?code= на Site URL/origin)
  → detectSessionInUrl обмінює код → INITIAL_SESSION → user встановлено
  → якщо посилання відкрито з protected deep link (redirect збережено
    через emailRedirectTo або оригінальний URL) — користувач потрапляє туди;
    інакше на '/' → guard пропускає (authenticated)
```

### Вхід із редіректом на початково запитувану сторінку

```
/  (розлогінений) → guard → /login?redirect=%2Fplanner
/login submit → login() ok → router.replace('/planner') → guard пропускає
```

### Відскок із guest-only

```
залогінений користувач відкриває /login → guestOnly guard → getSafeRedirect(query.redirect) або '/'
```

### Персистентність сесії

- localStorage (дефолт auth-js) + `autoRefreshToken`; оновлення відбувається мовчки, `onAuthStateChange` тримає store у синхронізації; вихід між вкладками синхронізується автоматично.

### Вихід (logout)

```
клік "Вийти" → pending стан → signOut() → SIGNED_OUT очищує store
→ навігація перемикається на guest-посилання → redirect /login
```

---

## 4. Необхідні налаштування Supabase dashboard (вручну, поза репозиторієм)

Це має бути перевірено до/під час тестування — з коду змінити неможливо:
1. **Email provider увімкнено** з **"Confirm email" ON** (обов'язково за вимогою ТЗ).
2. **Site URL** та **Redirect URLs** містять `http://localhost:5173/` (і `/**`, якщо потрібне глибоке приземлення). Без цього посилання підтвердження нікуди не ведуть.
3. **PKCE flow** увімкнено (дефолт проєкту) — відповідає конфігурації клієнта вище.

---

## 5. Ризики та пом'якшення

| Ризик | Пом'якшення |
|---|---|
| Мismatch flow (клієнт PKCE vs проєкт implicit, або навпаки) ламає посилання підтвердження | Явний `flowType: 'pkce'` + чек-лист dashboard + end-to-end тест посилання підтвердження під час реалізації |
| Посилання підтвердження відкрито в іншому браузері/пристрої → відсутній PKCE verifier → обмін падає | Конкретне дружнє повідомлення + керівництво «відкрийте в тому ж браузері / надіслати ще раз» |
| Гонка при перезавантаженні → хибний редірект на login | Guard очікує `initialize()`; перевіряється тест-кейсом №4 нижче |
| Open redirect через `?redirect=//evil.com` | `getSafeRedirect` whitelist + loop-захист для `/login`, `/register` |
| Rate limits листів (`over_email_send_rate_limit`) | Дружнє повідомлення; кнопка resend отримує власний cooldown/pending стан |
| Залишковий глобальний CSS Vite (`text-align: center`, `h1` 56px) спотворює форми | `text-left` на контейнерах форм, явні розміри заголовків Tailwind; опційне окреме очищення `style.css` |
| `?code=` залишається в адресному рядку після обміну | Опційно: guard прибирає його через `router.replace` |
| Немає lint/тестів — регресії ловляться лише вручну | Фіксований чек-лист ручного QA нижче |
| 404 на production deep links (history mode) | Примітка про SPA-fallback конфігурацію хоста |

---

## 6. Порядок реалізації

1. `supabase.js` → конфігурація PKCE
2. `lib/authErrors.js`, `lib/redirect.js`
3. `stores/auth.js`
4. `components/AppAlert.vue`, `components/LoadingSpinner.vue`
5. `views/LoginView.vue`, `views/RegisterView.vue`
6. `router/index.js` → маршрути + guard
7. `App.vue` → auth-aware навігація
8. Ручний QA

---

## 7. Чек-лист ручного QA

1. Реєстрація → панель "перевірте пошту" → клік посилання з листа в тій самій вкладці → сесію створено → вхід у застосунок.
2. Невірний пароль → дружня помилка; кнопка знову активна.
3. Вхід з непідтвердженим email → конкретна помилка + resend працює (другий лист приходить).
4. Hard reload на `/settings` залогіненим → **залишається** на `/settings`, без flash на login.
5. Захід розлогіненого на `/planner` → `/login?redirect=/planner` → після логіну потрапляє на `/planner`.
6. Залогінений заходить на `/login` → відскок на `/` (або safe redirect).
7. `/login?redirect=//evil.com` → йде на `/`, а не на зовнішній сайт.
8. Logout → навігація перемикається на Увійти/Реєстрація; прямий URL на `/settings` → сторінка логіну.
9. Logout у вкладці A → вкладка B оновлюється без перезавантаження.
10. Логін офлайн → повідомлення про мережеву помилку, без крашу.
11. Подвійний клік по submit → один запит (кнопка disabled).
12. Повторна реєстрація → повідомлення "вже існує".

---

## 8. Явно поза скоупом

- Скидання пароля / "forgot password" (не вимагається ТЗ; `updateUser({password})` пізніше вставиться в той самий store)
- OAuth/social login, кастомізація email-шаблонів, таблиці user profiles/БД
- Виправлення бага контенту `PlannerView`/`SettingsView`, мертвого `HelloWorld.vue` чи залишкового шаблонного CSS у `style.css` (зафіксовано як наявні; auth-view пишуться несприйнятливими до них)
- TypeScript, лінтери, тести, lazy-loading маршрутів

---

## 9. Примітки

- Реалізація **не виконувалася**: жодне джерело застосунку не змінювалося; створено лише цей документ.
- План залежить від налаштувань Supabase dashboard, які неможливо перевірити з коду (toggle confirm-email, allow-list redirect URL, тип flow). Розділ «Необхідні налаштування Supabase dashboard» слід підтвердити під час тестування — якщо проєкт налаштований на implicit flow, єдина зміна в коді: `flowType: 'implicit'`.
- Мова інтерфейсу та повідомлень про помилки — **українська** (відповідає наявному контенту застосунку); технічні терміни та ідентифікатори коду — **English**.
