const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72

export function validateEmail(value) {
  const email = String(value || '').trim()

  if (!email) return 'Введіть email.'
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Введіть коректну email-адресу.'

  return ''
}

export function validatePassword(value) {
  const password = String(value || '')

  if (!password) return 'Введіть пароль.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Пароль має містити не більше ${MAX_PASSWORD_LENGTH} символів.`
  }

  return ''
}

export function validatePasswordConfirmation(password, confirmation) {
  if (!confirmation) return 'Підтвердіть пароль.'
  if (password !== confirmation) return 'Паролі не збігаються.'

  return ''
}
