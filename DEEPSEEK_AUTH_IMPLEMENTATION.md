# Supabase Email/Password Authentication — звіт про імплементацію

Документ описує реалізацію email/password автентифікації через Supabase у проєкті Planner (Vue 3 + Vite + Pinia + vue-router). Зміни не закомічені та не запушені в Git.

## 1. Що реалізовано

- **Реєстрація email/password** через `supabase.auth.signUp` з `emailRedirectTo` на `/auth/callback`.
- **Підтвердження email** через лист Supabase; підтримка implicit-flow (токени в hash) і `token_hash` + `verifyOtp` для кастомізованих шаблонів листів.
- **Вхід** через `signInWithPassword` з повтором надсилання листа підтвердження для `email_not_confirmed`.
- **Вихід** через `signOut` з коректною обробкою помилок і станом завантаження.
- **Персистентні сесії**: `persistSession`, `autoRefreshToken`, `detectSessionInUrl`; сесія переживає reload і перезапуск браузера.
- **Стан автентифікації в Pinia**: `session`, `user`, `isReady`, `pendingAction`, `isAuthenticated`, `isBusy` та actions.
- **Захищені маршрути** (`/`, `/planner`, `/settings`) через `meta.requiresAuth` і `router.beforeEach`.
- **Guest-only маршрути** (`/login`, `/register`) через `meta.guestOnly`.
- **Повернення на початково запитану сторінку** після входу, реєстрації та підтвердження email через `redirect` query + безпечна валідація.
- **Зрозумілі українські повідомлення** для типових помилок Supabase, мережевих збоїв, прострочених посилань і rate limits.
- **Loading states**: bootstrap-loader, spinner і `aria-busy` у формах, під час resend, logout і callback-обробки, cooldown 60 с для повторного листа.
- **Mobile-first UI**: картка `max-w-md`, inputs `h-11` і `text-base` (без iOS-зуму), responsive header, touch-targets, коректні `autocomplete`/`inputmode`.
- **Доступність**: `label`/`for`, `aria-invalid`, `aria-describedby`, `role="alert"`/`role="status"`, `aria-pressed` для показу пароля, фокус на першому невалідному полі.
- **Виправлено базові стилі**: видалено CSS Vite-шаблону, який перебивав Tailwind (unlayered-стилі, root font-size 18px, фіксована ширина `#app`).

## 2. Створені файли

| Файл | Призначення |
|---|---|
| `.env.example` | Шаблон `VITE_SUPABASE_URL` і `VITE_SUPABASE_PUBLISHABLE_KEY` без секретів |
| `src/stores/index.js` | Єдиний `pinia` instance для `main.js` і router guards |
| `src/stores/auth.js` | Pinia setup-store: ініціалізація сесії, sign in/up/out, resend, verifyOtp |
| `src/lib/auth-redirect.js` | Захоплення auth-параметрів URL, безпечний redirect, `emailRedirectTo` |
| `src/lib/auth-errors.js` | Мапінг Supabase/network помилок у зрозумілі українські повідомлення |
| `src/lib/validation.js` | Валідація email, пароля та підтвердження пароля |
| `src/composables/useResendCooldown.js` | Cooldown для повторного надсилання листа |
| `src/components/ui/AppSpinner.vue` | Спільний spinner |
| `src/components/auth/AuthCard.vue` | Спільна картка auth-екранів |
| `src/components/auth/AuthAlert.vue` | Error/success/info alert з ARIA-ролями |
| `src/components/auth/FormField.vue` | Label + input + hint + field error |
| `src/components/auth/PasswordField.vue` | Password input із show/hide toggle |
| `src/components/layout/AppHeader.vue` | Навігація, email користувача, logout, responsive layout |
| `src/views/auth/LoginView.vue` | Форма входу, resend, redirect після входу |
| `src/views/auth/RegisterView.vue` | Форма реєстрації, success-стан «перевірте пошту», resend |
| `src/views/auth/AuthCallbackView.vue` | Обробка підтвердження email, помилок і cleanup URL |

## 3. Змінені файли

| Файл | Зміни |
|---|---|
| `src/lib/supabase.js` | Явні auth-опції (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`, `flowType: 'implicit'`); `captureAuthUrlState()` до `createClient`; зрозуміліша помилка відсутніх env |
| `src/main.js` | Використання спільного `pinia`; ранній `initialize()` auth store |
| `src/router/index.js` | Auth-маршрути, meta, guards, safe redirect, lazy imports, titles, scroll behavior, 404 redirect |
| `src/App.vue` | Bootstrap-loader, умовний header, auth layout, logout, реакція на зміну сесії |
| `src/style.css` | Мінімальні base-стилі в `@layer base`, root 16px, `color-scheme: light`, прибрано шаблонний CSS |
| `index.html` | `lang="uk"`, title, description, theme-color |
| `.gitignore` | Виняток `!.env.example` |

`src/views/DashboardView.vue`, `PlannerView.vue`, `SettingsView.vue` не змінювалися. `SettingsView.vue` залишається порожнім placeholder (це було до задачі). `DEEPSEEK_AUTH_PLAN.md` створений раніше і залишений у корені.

## 4. Важливі архітектурні рішення

1. **Implicit flow для SPA.** `flowType: 'implicit'` дозволяє підтвердити email навіть в іншому браузері чи на телефоні: токени приходять у hash і обробляються `detectSessionInUrl`. PKCE вимагав би `code_verifier` у тому самому браузері, тому для SPA без SSR обрано implicit. `token_hash` + `verifyOtp` додатково підтримується.

2. **Захоплення auth-параметрів до створення клієнта.** `captureAuthUrlState()` викликається в `src/lib/supabase.js` перед `createClient`. Це дозволяє зберегти `error_code`/`error_description` з hash навіть після того, як supabase-js очистить URL. Error-hash очищається одразу через `history.replaceState`, успішний hash не чіпається до обробки клієнтом.

3. **Єдиний memoized `initialize()`.** Guard і UI очікують той самий promise, тому reload захищеної сторінки не дає хибного редіректу на `/login` і не показує flash форми. Підписка `onAuthStateChange` створюється до `getSession()`, callback залишається синхронним (без `await` усередині, щоб уникнути deadlock).

4. **Сесія встановлюється безпосередньо з відповідей Supabase.** Після `signInWithPassword`, `signUp` (коли підтвердження вимкнене) і `verifyOtp` store одразу оновлює `session`. Це усуває гонку між auth-event і навігацією, яку ініціює view.

5. **Store не залежить від router.** Усі навігаційні рішення — у guards, `App.vue` або views. Це уникає циклічного імпорту та дозволяє тестувати store окремо.

6. **Anti-enumeration.** При увімкненому підтвердженні email `signUp` для вже існуючого email не повертає помилку. UI завжди показує нейтральний success-екран «Перевірте пошту», незалежно від існування акаунта.

7. **Безпечний redirect.** Дозволені лише внутрішні шляхи, що починаються з одного `/`; відхиляються `//`, backslash, `/login`, `/register`, `/auth/*`. Це захищає від open redirect і циклів.

8. **Один source of truth для персистентності.** Використовується `localStorage` самого supabase-js; `pinia-plugin-persistedstate` не додавався, щоб не дублювати сесію.

9. **Клієнтська політика пароля — 8 символів, максимум 72.** Це узгоджено з UI-підказками; серверна політика має бути налаштована в Dashboard окремо.

10. **Стилі.** Шаблонний CSS видалено, оскільки unlayered-правила перебивали Tailwind-утиліти (`text-3xl`, `mt-2`) і задавали root font-size 18px. Auth-екрани свідомо світлі; `color-scheme: light` запобігає темним нативним контролам.

## 5. Відомі обмеження та незавершені питання

1. **Налаштування Supabase Dashboard не змінювалися** (за вимогою). Для повного flow потрібно:
   - `Authentication → Providers → Email`: увімкнено, `Confirm email = ON`;
   - `Site URL` = актуальний origin;
   - `Redirect URLs` містить `http://localhost:5173/**` і production-варіант `https://<domain>/auth/callback` (або `/**`).
   Якщо `/auth/callback` не дозволений, Supabase може повернути користувача на `Site URL`; тоді сесія все одно відновиться на `/`, але `redirect` query буде втрачено.

2. **SPA fallback на хостингу.** Для `createWebHistory` і `/auth/callback` потрібен rewrite усіх шляхів на `index.html` (Netlify/Vercel/Nginx). Інакше посилання з листа дасть 404.

3. **Лише implicit flow.** Якщо проєкт колись переведуть на PKCE (`?code=...`), потрібен `exchangeCodeForSession`; зараз така гілка не реалізована.

4. **Logout scope.** Використовується стандартний global `signOut`. При мережевій помилці користувач залишається в сесії та бачить повідомлення (свідомий вибір: не вдавати успішний вихід). Якщо серверна сесія вже недійсна, локальна сесія очищається і вихід вважається успішним.

5. **Відсутній forgot/reset password.** Не входив у вимоги; архітектура (`AuthCard`, `auth-errors`, callback) готова до додавання.

6. **Автоматичних тестів немає.** У проєкті відсутні test runner і E2E-інфраструктура. Перевірені `npm run build` і чисті helper-функції через окремий Node-скрипт (redirect, error mapping, validation).

7. **Політика пароля.** Клієнт вимагає 8 символів. Якщо в Dashboard мінімум 6, це суворіше за сервер; якщо більше 8 — сервер поверне `weak_password` з відповідним повідомленням. Рекомендовано виставити 8 у Dashboard.

8. **Порожня `SettingsView.vue`** і невідповідність заголовка в `PlannerView.vue` («Settings») — попередні проблеми, не пов'язані з auth; не виправлялися, щоб не змішувати скоуп.

9. **Світла тема.** Повноцінний dark mode не реалізований; попередні dark-змінні шаблону видалені.

10. **Захоплення auth-state відбувається при старті застосунку.** Якщо в межах уже завантаженого SPA вручну перейти на `/auth/callback` з новими токенами, capture не оновиться; для штатного переходу з листа (повне завантаження сторінки) все працює.

## 6. Що перевірити вручну

### Реєстрація та підтвердження

- Зареєструвати новий email → з'являється екран «Перевірте пошту».
- Повторна реєстрація того самого email → той самий нейтральний екран (без розкриття існування акаунта).
- Перейти за посиланням із листа в тому самому браузері → `/auth/callback` → сесія → редірект.
- Відкрити посилання в іншому браузері/на телефоні → підтвердження працює (implicit flow).
- Прострочене/повторно використане посилання → зрозуміле повідомлення, кнопки «Увійти» і «Зареєструватися повторно».
- Перевірити кнопку «Надіслати лист ще раз» і 60-секундний cooldown.

### Вхід / вихід

- Вхід із правильними даними → редірект на початково запитану сторінку.
- Невірний пароль → «Невірний email або пароль.»
- Непідтверджений email → повідомлення + кнопка повторного листа.
- Порожні поля, некоректний email, короткий пароль, неспівпадіння паролів → field-level помилки з фокусом на першому невалідному полі.
- Logout → `/login`, кнопка «Назад» не відкриває захищений контент.
- Logout без мережі → повідомлення про помилку, сесія не втрачається.

### Маршрути та redirect

- Відкрити `/planner?x=1` без сесії → `/login?redirect=...`; після входу → `/planner?x=1`.
- Зареєструватися з `/login?redirect=/planner` → після підтвердження email → `/planner`.
- Авторизований відкриває `/login` або `/register` → редірект на `/` або на безпечний `redirect`.
- Спроби `?redirect=https://evil.com`, `?redirect=//evil.com`, `?redirect=/login`, `?redirect=/auth/callback` → `/`.
- Невідомий URL → редірект на `/` (далі guard).

### Персистентність

- Reload захищеної сторінки → сесія збережена, без flash логіна.
- Повністю закрити й відкрити браузер → сесія збережена.
- Відкрити другу вкладку → стан автентифікації узгоджений.
- Вихід у другій вкладці → перша вкладка реагує й веде на `/login`.

### UI / responsive / a11y

- 360px і 390px: немає горизонтального скролу, картка не виходить за екран.
- iOS Safari: фокус на input не зумить сторінку (16px).
- Перемикач показу пароля працює з клавіатури, має `aria-pressed`.
- Форми проходяться Tab, помилки озвучуються screen reader.
- Кнопки під час запитів disabled і мають spinner/`aria-busy`.

### Збірка та деплой

- `npm run build` — успішно (перевірено, Vite 8.3.7, 99 modules).
- `npm run preview` з env-змінними.
- Прямий перехід на `/auth/callback` на хостингу працює завдяки SPA rewrite.

## 7. Результат перевірки

- `npm run build` — успішно, без помилок.
- Додатково прогнано Node-скрипт для чистих функцій: `getSafeRedirectPath`, `getAuthErrorMessage`, `validateEmail`, `validatePassword`, `validatePasswordConfirmation` — усі перевірки пройдені.
- `git status` містить лише очікувані зміни; коміт і push не виконувалися. `.env.local` не змінювався.
