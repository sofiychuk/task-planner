const GENERIC_MESSAGE = 'Не вдалося виконати дію. Спробуйте ще раз.'
const NETWORK_MESSAGE = "Немає з'єднання з інтернетом. Перевірте мережу та спробуйте ще раз."
const LINK_MESSAGE = 'Посилання недійсне або прострочене. Запросіть новий лист.'

const AUTH_ERROR_MESSAGES = {
  invalid_credentials: 'Невірний email або пароль.',
  email_not_confirmed: 'Email ще не підтверджено. Перевірте пошту або надішліть лист ще раз.',
  user_already_exists: 'Акаунт з таким email вже існує. Увійдіть або відновіть пароль.',
  email_exists: 'Акаунт з таким email вже існує. Увійдіть або відновіть пароль.',
  weak_password: 'Пароль занадто слабкий. Використайте щонайменше 8 символів.',
  over_email_send_rate_limit: 'Забагато листів. Спробуйте ще раз через кілька хвилин.',
  over_request_rate_limit: 'Забагато спроб. Зачекайте трохи і спробуйте знову.',
  signup_disabled: 'Реєстрація тимчасово недоступна.',
  email_address_invalid: 'Введіть коректну email-адресу.',
  validation_failed: 'Перевірте введені дані та спробуйте ще раз.',
  same_password: 'Новий пароль має відрізнятися від поточного.',
  reauthentication_needed: 'Запросіть нове посилання для відновлення пароля та спробуйте ще раз.',
  reauthentication_not_valid: LINK_MESSAGE,
  otp_expired: LINK_MESSAGE,
  access_denied: LINK_MESSAGE,
  bad_code_verifier: LINK_MESSAGE,
  session_not_found: 'Сесія завершилася. Увійдіть знову.',
  refresh_token_not_found: 'Сесія завершилася. Увійдіть знову.',
  session_expired: 'Сесія завершилася. Увійдіть знову.',
  captcha_failed: 'Не вдалося пройти перевірку. Оновіть сторінку і спробуйте ще раз.',
}

export function isNetworkError(error) {
  if (!error) return false

  const name = String(error.name || '')
  const message = String(error.message || error || '')

  return (
    name === 'AuthRetryableFetchError' ||
    name === 'TypeError' ||
    /failed to fetch|networkerror|network request failed|load failed|timed out/i.test(message)
  )
}

export function getAuthErrorMessage(error) {
  if (!error) return GENERIC_MESSAGE
  if (isNetworkError(error)) return NETWORK_MESSAGE
  if (error.name === 'AuthSessionMissingError') return LINK_MESSAGE

  const code = typeof error === 'object' ? error.code : ''
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code]

  const message = String(error?.message || error || '')

  if (/invalid login credentials/i.test(message)) return AUTH_ERROR_MESSAGES.invalid_credentials
  if (/email not confirmed/i.test(message)) return AUTH_ERROR_MESSAGES.email_not_confirmed
  if (/user already registered/i.test(message)) return AUTH_ERROR_MESSAGES.user_already_exists
  if (/password should be at least|weak.?password/i.test(message)) {
    return AUTH_ERROR_MESSAGES.weak_password
  }
  if (/for security purposes|rate limit/i.test(message)) {
    return AUTH_ERROR_MESSAGES.over_email_send_rate_limit
  }
  if (/expired|invalid.*(token|link)/i.test(message)) return LINK_MESSAGE

  return GENERIC_MESSAGE
}
