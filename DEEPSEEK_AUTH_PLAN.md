# Supabase Email/Password Authentication — аналіз і план імплементації

Документ підготовлено на основі read-only інспекції проєкту. Жодні файли застосунку не змінювалися; це лише аналіз, архітектурні рішення та план майбутніх змін.

## 1. Поточний стан проєкту

**Stack (фактичний, з `package.json` / `npm ls`):**

- Vue `3.5.45`, Vite `8.3.7`, `vue-router` `4.6.4`, Pinia `4.1.0`
- `@supabase/supabase-js` `2.119.1`
- Tailwind CSS `4.3.5` через `@tailwindcss/vite`
- JavaScript без TypeScript, без ESLint/Prettier, без тестів, без CI
- `@supabase/ssr` **не встановлений** — і він не потрібен, бо це чистий SPA без SSR

**Структура:**

```text
src/
  main.js                 createApp + createPinia + router
  App.vue                 header + <RouterView>
  lib/supabase.js         createClient (без auth-опцій)
  router/index.js         3 flat routes, без meta і guards
  views/                  Dashboard, Planner, Settings (порожній)
  components/HelloWorld.vue  (залишок Vite-шаблону)
  style.css               CSS Vite-шаблону + @import "tailwindcss"
```

**Конвенції, які варто зберегти:**

- `.js` — 4 пробіли, одинарні лапки, без крапок з комою; `.vue` — 2 пробіли
- `<script setup>`, PascalCase + суфікс `View` для сторінок
- UI-тексти українською, технічні ідентифікатори англійською
- Tailwind-утиліти прямо в шаблонах, без окремих CSS-модулів
- Supabase-клієнт уже ізольований у `src/lib/supabase.js` — гарна точка розширення

**Чого немає:** жодного store, жодного auth-коду, meta-полів, guards, обробки помилок, `.env.example`. Специфікації/мастер-плану в репозиторії немає — план побудований виключно на коді та вимогах.

---

## 2. Виявлені проблеми та ризики

### Критичні (без виправлення auth працюватиме некоректно)

1. **Гонка при відновленні сесії.** `getSession()` асинхронний. Якщо guard перевіряє `user` до завершення ініціалізації, то при reload захищеної сторінки з валідною сесією користувача викине на `/login`, а на `/login` можливий зворотний flicker. Потрібен єдиний memoized `initialize()` promise, який очікують і guard, і bootstrap UI.

2. **`src/style.css` ламає Tailwind.** CSS після `@import "tailwindcss"` — **unlayered**, а unlayered-стилі мають вищий пріоритет за Tailwind `@layer utilities`:
   - `h1 { font-size: 56px }` (рядки 66–74) перебиває `text-3xl` у `DashboardView.vue`;
   - `p { margin: 0 }` (84–86) перебиває `mt-2`;
   - `:root { font: 18px/145% ... }` задає root font-size **18px**, тому всі rem-утиліти Tailwind масштабуються на ~12.5% (на екранах >1024px);
   - `#app { width: 1126px; text-align: center; border-inline: ... }` (161–171) фіксує ширину й центрує текст — погано для mobile-first і для auth-карток;
   - `color-scheme: light dark` + dark-палітра конфліктує з hardcoded `bg-slate-50` / `text-slate-900` у `App.vue`.

   Для auth-екранів це критично: форми, header і `max-w-md` картка виглядатимуть зламаними.

3. **Немає callback-маршруту та обробки помилок у URL.** За замовчуванням supabase-js використовує implicit flow: після підтвердження email токени приходять у hash (`#access_token=...`), а прострочене посилання — теж у hash (`#error=...&error_code=otp_expired`). Потрібна сторінка `/auth/callback`, і параметри помилки треба **захопити до того**, як supabase-js їх прибере. Це робиться module-level кодом у `src/lib/supabase.js` (до `createClient`).

4. **Конфігурація Supabase Dashboard не відображена в репозиторії.** Потрібно: `Confirm email = ON`, `Site URL`, `Redirect URLs` (інакше посилання підтвердження веде не туди, а `redirect` губиться), а мінімальна довжина пароля в Dashboard має збігатися з клієнтською валідацією.

5. **Публічні env-змінні.** `.env.local` існує і ігнорується (`.env.*`), ключ не в git — це добре. Але `.env.example` за поточним `.gitignore` теж буде проігнорований; потрібен виняток `!.env.example`. Якщо env відсутні, `supabase.js` кидає помилку при імпорті → білий екран без пояснення.

### Середні

6. **`onAuthStateChange` deadlock.** Всередині callback не можна `await`-ити інші методи Supabase (`getSession`, запити до БД) — офіційно задокументована проблема. Callback має бути синхронним: лише оновити `session` у store.
7. **HMR-дублікати підписок.** При гарячій заміні модуля store може створитися другий listener. Потрібен module-level guard / `import.meta.hot.dispose`.
8. **Email enumeration.** При увімкненому підтвердженні `signUp` для вже існуючого email повертає **не помилку**, а фейкового user з порожнім `identities`. Не можна показувати «email вже зайнятий» — це витік інформації. UX: завжди нейтральне «Перевірте пошту».
9. **Logout при мережевій помилці.** `signOut()` за замовчуванням global; при помилці локальна сесія може залишитися. Потрібне коректне повідомлення і, за потреби, fallback `{ scope: 'local' }`.
10. **Open redirect / redirect loop.** `redirect` з query треба валідувати: тільки внутрішній шлях, що починається з `/`, не `//`, не `/login`, `/register`, `/auth/*`.
11. **SPA fallback на хостингу.** `createWebHistory` + посилання на `/auth/callback` вимагають rewrite на `index.html` (Netlify/Vercel/Nginx), інакше лист підтвердження дасть 404.
12. **Немає 404-маршруту** — одрук у URL зараз дає порожній екран.
13. **Стилі форм у dark mode.** Нативні input/autofill можуть стати темними на світлій картці; для auth краще явно зафіксувати `color-scheme: light`.

### Дрібні

14. `index.html` має `lang="en"` і title `planner` — при українському UI варто `lang="uk"`.
15. `PlannerView.vue` має заголовок «Settings» (copy-paste), навігація називає `/` «Planner», а view — «Dashboard».
16. Залишки шаблону: `HelloWorld.vue`, `hero.png`, `vite.svg`, `vue.svg`, `public/icons.svg`, великий шматок `style.css`.
17. Pinia не потребує `pinia-plugin-persistedstate`: персистентність сесії вже забезпечує supabase-js через `localStorage`.

---

## 3. Запропонована архітектура

```text
Supabase Auth (localStorage session, auto-refresh)
        │  onAuthStateChange
        ▼
src/lib/supabase.js ──► src/stores/auth.js (Pinia)
        │                     │
        │                     ├─► router guards (meta)
        │                     └─► views / App.vue
        ▼
src/lib/auth-errors.js   src/lib/auth-redirect.js
```

### 3.1. Supabase client (`src/lib/supabase.js`)

Залишити існуючий файл, додати явні auth-опції та захоплення стану URL:

```js
import { createClient } from '@supabase/supabase-js'
import { captureAuthUrlState } from './auth-redirect'

captureAuthUrlState() // ДО createClient, поки hash ще не очищений

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,      // localStorage → reload + restart браузера
    autoRefreshToken: true,    // оновлення access token
    detectSessionInUrl: true,  // обробка #access_token з листа
    flowType: 'implicit',      // свідомий вибір для SPA (див. нижче)
  },
})
```

**Чому implicit, а не PKCE:** PKCE зберігає `code_verifier` у localStorage браузера, де почалася реєстрація. Якщо користувач відкриє лист на телефоні/в іншому браузері, підтвердження зламається. Implicit-токени працюють у будь-якому браузері. Недолік — токени в URL hash; для SPA це прийнятно, URL очищається одразу після обробки. Якщо пізніше з'явиться SSR — перейдемо на `@supabase/ssr` + PKCE.

### 3.2. Pinia store (`src/stores/auth.js`)

Setup-store у стилі Composition API, узгоджений з `<script setup>`:

```text
state:   session, isReady, pendingAction ('signIn' | 'signUp' | 'signOut' | 'resend' | null)
getters: user, isAuthenticated, isBusy
actions: initialize(), signIn({ email, password }), signUp({ email, password, redirectTo }),
         resendConfirmation(email), signOut()
```

Ключові рішення:

- `initialize()` — ідемпотентний, повертає один memoized promise; спочатку підписка `onAuthStateChange`, потім `getSession()`, у `finally` — `isReady = true`. Помилку читання сховища не валимо фатально: сесія `null`, застосунок працює.
- `user` — `computed` від `session`, без дублювання об'єкта в окремому ref.
- Store **не знає про router** (інакше циклічний імпорт). Навігацію після logout робить компонент.
- Actions повертають `{ ok, message?, needsConfirmation? }`, а не кидають винятки; UI не бачить сирих повідомлень Supabase.
- `initialize()` викликається в `main.js` (без await) і повторно очікується в guard — той самий promise.

### 3.3. Router (`src/router/index.js`)

Нові маршрути та meta:

| Path | Name | Meta |
|---|---|---|
| `/` | `dashboard` | `requiresAuth: true` |
| `/planner` | `planner` | `requiresAuth: true` |
| `/settings` | `settings` | `requiresAuth: true` |
| `/login` | `login` | `guestOnly: true`, `layout: 'auth'` |
| `/register` | `register` | `guestOnly: true`, `layout: 'auth'` |
| `/auth/callback` | `auth-callback` | `layout: 'auth'`, **без** `guestOnly` |
| `/:pathMatch(.*)*` | `not-found` | redirect на `/` (опційно окремий view) |

Guard (спрощено):

```js
router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  await auth.initialize()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return getSafeRedirectPath(to.query.redirect) // '/' за замовчуванням
  }
})
```

- `pinia` передається явно з `src/stores/index.js`, щоб не залежати від active pinia.
- `redirect` — `to.fullPath` (path + query + hash), після входу `router.replace(target)`.
- Callback не `guestOnly`, бо під час обміну токенів сесія ще може бути не встановлена.
- `router.afterEach` — `document.title` з `meta.title`; `scrollBehavior` — `{ top: 0 }`.
- Auth-views підключаються lazy (`() => import(...)`), щоб не роздувати початковий bundle.

### 3.4. Потоки

**Реєстрація**

1. Валідація: email (trim, формат), password (min 8, узгодити з Dashboard), confirm password, `maxlength` 72.
2. `signUp({ email, password, options: { emailRedirectTo } })`, де `emailRedirectTo = origin + BASE_URL + 'auth/callback'` + `?redirect=<safe path>`.
3. Якщо `data.session` існує (підтвердження вимкнене) — `replace(target)`.
4. Інакше — success-панель «Перевірте пошту» з кнопкою повторного надсилання (cooldown 60 с). Для вже існуючого email — **той самий** екран.

**Підтвердження email**

1. Лист → Supabase verify → redirect на `/auth/callback?redirect=...` + hash-токени.
2. supabase-js сам створює сесію (`detectSessionInUrl`).
3. Callback view після `await auth.initialize()`:
   - є захоплена помилка (`otp_expired`, `access_denied`) → дружнє повідомлення + посилання «Увійти» / «Надіслати лист ще раз»;
   - є сесія → короткий success-стан і `router.replace(safeRedirect)`;
   - немає сесії → «Посилання недійсне або прострочене».
4. URL очищається через `router.replace`, токени не залишаються в історії.
5. Додатково підтримати `token_hash` + `type` через `verifyOtp` — на випадок кастомізованих шаблонів листів.

**Логін**

`signInWithPassword` → при успіху `router.replace(safeRedirect || '/')`. При `email_not_confirmed` — повідомлення + кнопка повторного листа. Поля не очищаються при помилці пароля, помилка знімається при редагуванні.

**Logout**

Кнопка в header → `auth.signOut()` (global) → `router.replace({ name: 'login' })`. При помилці — alert, сесія не очищається насильно (безпечніше), або fallback `scope: 'local'` з попередженням.

**Reload / restart браузера**

`localStorage` + `autoRefreshToken` + `getSession()` у guard → сесія відновлюється. `isReady` гарантує відсутність flash і хибних редіректів. Окремий persisted-store плагін не потрібен.

**Guest-only**

Авторизований на `/login` або `/register` → `replace(safeRedirect || '/')`.

### 3.5. Помилки (`src/lib/auth-errors.js`)

Єдина функція `getAuthErrorMessage(error)` з пріоритетом `error.code`, fallback — `error.status` / `error.name` / `error.message`. Українські тексти:

| Code | Повідомлення |
|---|---|
| `invalid_credentials` | Невірний email або пароль. |
| `email_not_confirmed` | Email ще не підтверджено. Перевірте пошту. |
| `user_already_exists` / `email_exists` | Акаунт з таким email вже існує. Увійдіть. |
| `weak_password` | Пароль занадто слабкий (мінімум 8 символів). |
| `over_email_send_rate_limit` | Забагато листів. Спробуйте пізніше. |
| `over_request_rate_limit` | Забагато спроб. Зачекайте. |
| `signup_disabled` | Реєстрація тимчасово недоступна. |
| `otp_expired` / `access_denied` | Посилання недійсне або прострочене. |
| `session_not_found` / `refresh_token_not_found` | Сесія завершилася. Увійдіть знову. |
| `email_address_invalid` / `validation_failed` | Перевірте формат email. |
| `AuthRetryableFetchError` / `Failed to fetch` | Немає з'єднання. Перевірте мережу. |
| fallback | Не вдалося виконати дію. Спробуйте ще раз. |

Сирий текст помилки — лише `console.error` у dev. Field-level помилки — окремо від server-level (валідація в `src/lib/validation.js`).

### 3.6. Loading states

- **Bootstrap:** `App.vue` показує full-page loader, поки `!auth.isReady` — жодного flash форми/контенту.
- **Submit:** `pendingAction` → `disabled` на inputs/кнопці, spinner, `aria-busy="true"`, текст «Входимо…» / «Створюємо акаунт…».
- **Resend:** таймер 60 с зі зворотним відліком, кнопка disabled.
- **Logout:** окремий pending у header.
- **Callback:** статус `loading → success | error` з `aria-live="polite"`.

### 3.7. Responsive / mobile-first / a11y

- Прибрати фіксовану ширину й `text-align: center` з `#app`, повернути root font-size 16px, перенести базові стилі в `@layer base`.
- Auth-картка: `w-full max-w-md`, `p-5 sm:p-8`, `rounded-2xl`, `border`, `bg-white`.
- Inputs: висота ≥44px, `text-base` (16px — інакше iOS зумує при фокусі), `autocomplete`/`inputmode`/`autocapitalize`/`spellcheck` правильно.
- Header: `flex-wrap` або дворівневий на mobile, email із `truncate`, touch-targets ≥44px, активні посилання через `active-class`.
- A11y: `<label for>`, `aria-invalid`, `aria-describedby`, `role="alert"` для помилок, `role="status"` для success, toggle пароля з `aria-pressed`, фокус на першому невалідному полі, помітний `focus-visible`.

---

## 4. Файли: створити та змінити

### Створити

| Файл | Призначення |
|---|---|
| `src/stores/index.js` | Єдиний `createPinia()` instance для `main.js` і guard |
| `src/stores/auth.js` | Стан сесії, `initialize`, `signIn`, `signUp`, `signOut`, `resendConfirmation` |
| `src/lib/auth-errors.js` | `getAuthErrorMessage(error)` + словник UA-повідомлень |
| `src/lib/auth-redirect.js` | `captureAuthUrlState`, `getCapturedAuthState`, `getSafeRedirectPath`, `buildEmailRedirectTo` |
| `src/lib/validation.js` | `validateEmail`, `validatePassword`, `validatePasswordConfirmation` |
| `src/components/ui/AppSpinner.vue` | Спільний spinner (розмір, `aria-hidden`) |
| `src/components/auth/AuthCard.vue` | Картка: title, subtitle, slot, footer-link |
| `src/components/auth/AuthAlert.vue` | Error/success/info banner з коректними ARIA-ролями |
| `src/components/auth/FormField.vue` | Label + input + hint + error + `aria-*` |
| `src/components/auth/PasswordField.vue` | FormField + show/hide toggle |
| `src/components/layout/AppHeader.vue` | Навігація, email користувача, logout |
| `src/views/auth/LoginView.vue` | Форма входу, редирект, resend при непідтвердженому email |
| `src/views/auth/RegisterView.vue` | Форма реєстрації + success-стан «перевірте пошту» |
| `src/views/auth/AuthCallbackView.vue` | Обробка підтвердження/помилок, cleanup URL |
| `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (без значень) |

### Змінити

| Файл | Зміни |
|---|---|
| `src/lib/supabase.js` | явні auth-опції; `captureAuthUrlState()` до `createClient`; зрозуміліша помилка env |
| `src/main.js` | `app.use(pinia)` перед router; `auth.initialize()`; (опційно) `router.isReady()` |
| `src/router/index.js` | auth-маршрути, meta, guards, lazy imports, `afterEach` title, `scrollBehavior`, 404 |
| `src/App.vue` | bootstrap-loader, умовний header, auth-layout без header, `<script setup>` |
| `src/style.css` | видалити шаблонний CSS, перенести base-стилі в `@layer base`, root 16px, `color-scheme: light` |
| `index.html` | `lang="uk"`, `title`, `meta name="description"` |
| `.gitignore` | `!.env.example` |
| `src/views/SettingsView.vue` | (опційно) секція «Акаунт»: email, logout |

### Опційне прибирання (окремим комітом)

`src/components/HelloWorld.vue`, `src/assets/hero.png`, `vite.svg`, `vue.svg`, `public/icons.svg`; виправлення заголовка в `PlannerView.vue`.

**Нових npm-залежностей не потрібно.**

---

## 5. Що налаштувати в Supabase Dashboard і на хостингу

1. **Authentication → Providers → Email:** увімкнено, `Confirm email = ON`, мінімальна довжина пароля = 8 (як у клієнті).
2. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:5173` (dev), далі production origin;
   - Redirect URLs: `http://localhost:5173/**`, `https://<prod-domain>/auth/callback` (і `/**`).
3. **Email Templates:** перевірити, що Confirm signup використовує `{{ .ConfirmationURL }}`; за бажанням — український текст. Для production — власний SMTP (вбудований має жорсткі ліміти).
4. **Rate limits:** знати ліміти на signup/email; UI має cooldown.
5. **Хостинг:** SPA rewrite усіх шляхів на `index.html`, інакше `/auth/callback` → 404.
6. **Env:** ті самі `VITE_*` змінні в CI/hosting; `service_role` ключ у фронтенді — ніколи.
7. **RLS:** зараз таблиць немає, але всі майбутні таблиці мають мати RLS; client-side guards — лише UX, не безпека.

---

## 6. Порядок реалізації

1. **Foundation:** `supabase.js` + `auth-errors.js` + `auth-redirect.js` + `stores/auth.js` + `stores/index.js`. Перевірка: сесія відновлюється після reload, listener не дублюється, logout очищає стан.
2. **Routing:** meta, guards, redirect-валідація, callback route, 404, title. Перевірка: неавторизований `/planner?x=1` → `/login?redirect=...`; після входу — назад на `/planner?x=1`.
3. **UI:** `AuthCard`, `FormField`, `PasswordField`, `AppSpinner`, `AuthAlert`, `LoginView`, `RegisterView`. Перевірка: валідація, loading, server errors, mobile 360px.
4. **Confirmation:** `AuthCallbackView`, success/error-стани, cleanup URL, resend.
5. **App shell:** `AppHeader`, умовний layout, logout, bootstrap-loader.
6. **Cleanup/polish:** `style.css`, `index.html`, `.gitignore`, a11y-фокус, видалення шаблонних файлів, `npm run build`.

---

## 7. Тест-план (ручний, бо тестів у проєкті немає)

- Реєстрація → лист → callback → сесія → redirect на початково запитану сторінку.
- Reload захищеної сторінки; повне закриття/відкриття браузера — сесія збережена.
- `/login` і `/register` для авторизованого → редірект на `/`.
- Logout → `/login`; back-кнопка не повертає в захищений контент.
- Невалідний пароль, неіснуючий email, непідтверджений email, дублікат email, прострочене посилання, offline.
- Спроба open redirect: `?redirect=https://evil.com`, `?redirect=//evil.com`, `?redirect=/login` → `/`.
- Довге посилання на підтвердження на іншому пристрої (implicit flow).
- Mobile 360px/390px: немає горизонтального скролу, iOS не зумить inputs, touch-targets ≥44px.
- Keyboard-only навігація, screen reader для помилок, `aria-busy` під час submit.
- `npm run build` + `npm run preview` з env-змінними; прямий перехід на `/auth/callback` на хостингу.

---

## 8. Рішення, які варто підтвердити перед імплементацією

1. **Поле «Підтвердіть пароль»** у реєстрації — рекомендую додати (клієнтська перевірка, у Supabase не надсилається).
2. **Forgot/reset password** — зараз поза скоупом; структура `auth-errors` і callback дозволить додати пізніше. Підтвердити.
3. **Тема:** рекомендую світлу для auth-екранів і прибрати dark-змінні шаблону; повноцінний dark mode — окрема задача.
4. **Прибирання шаблонних файлів** (`HelloWorld`, assets, зайвий CSS) — робити в межах цієї задачі чи окремим комітом?
5. **Header:** показувати email (з truncate) чи ім'я з `user_metadata`? Рекомендую email, бо реєстрація без name.
6. **Callback UX:** автоперехід після успіху (через ~1 с) + кнопка «Продовжити» — рекомендую.
7. **Політика пароля:** 8 символів на клієнті та в Dashboard — підтвердити.
