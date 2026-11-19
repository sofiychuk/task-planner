/**
 * Maps Supabase auth errors to friendly, human-readable Ukrainian messages.
 *
 * @param {unknown} error - Error returned by Supabase auth methods
 *     (`error` field of the `{ data, error }` result, or a thrown Error).
 * @returns {string} Localized message safe to show to the user.
 */
export function getAuthErrorMessage(error) {
    if (!error) {
        return 'Щось пійшло не так. Спробуйте ще раз.'
    }

    const message = typeof error === 'string' ? error : (error.message || '')
    const code = typeof error === 'object' && error !== null ? (error.code || '') : ''

    if (
        code === 'invalid_credentials' ||
        /invalid login credentials/i.test(message)
    ) {
        return 'Невірний email або пароль.'
    }

    if (
        code === 'email_not_confirmed' ||
        /email not confirmed/i.test(message)
    ) {
        return 'Спершу підтвердьте адресу електронної пошти.'
    }

    if (
        code === 'user_already_exists' ||
        code === 'email_exists' ||
        /already registered/i.test(message) ||
        /already been registered/i.test(message)
    ) {
        return 'Користувач з таким email вже існує.'
    }

    if (
        code === 'weak_password' ||
        code === 'password_too_short' ||
        /password should be at least/i.test(message) ||
        /password is too weak/i.test(message)
    ) {
        return 'Пароль надто простий. Використовуйте щонайменше 6 символів.'
    }

    if (
        code === 'over_email_send_rate_limit' ||
        code === 'over_request_rate_limit' ||
        /rate limit/i.test(message) ||
        /email rate limit/i.test(message)
    ) {
        return 'Забагато спроб. Спробуйте ще раз за кілька хвилин.'
    }

    if (
        /code verifier/i.test(message) ||
        /code challenge/i.test(message) ||
        /flow type/i.test(message)
    ) {
        return 'Не вдалося завершити підтвердження. Відкрийте лист підтвердження в тому самому браузері, у якому реєструвалися.'
    }

    if (code === 'validation_failed') {
        return 'Перевірте, будь ласка, введені дані.'
    }

    if (
        code === 'provider_email_needs_verification' ||
        /signups not allowed/i.test(message)
    ) {
        return 'Реєстрація зараз недоступна. Спробуйте пізніше.'
    }

    if (
        code === 'network_request_failed' ||
        /failed to fetch/i.test(message) ||
        /network/i.test(message) ||
        error instanceof TypeError
    ) {
        return 'Не вдалося зв\'язатися з сервером. Перевірте інтернет-з\'єднання.'
    }

    return 'Щось пійшло не так. Спробуйте ще раз.'
}
