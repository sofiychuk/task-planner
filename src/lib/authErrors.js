// Переклад найпоширеніших помилок Supabase Auth для користувача.
// Повідомлення Supabase повертаються англійською, тому зіставляємо їх із текстами UI.
const messages = {
    'Invalid login credentials': 'Неправильна пошта або пароль.',
    'Email not confirmed': 'Спочатку підтвердьте email — ми надіслали лист із посиланням.',
    'User already registered': 'Користувач із такою поштою вже зареєстрований.',
    'Password should be at least 6 characters': 'Пароль має містити щонайменше 6 символів.',
    'For security purposes, you can only request this once every 60 seconds':
        'Занадто часто. Спробуйте ще раз за хвилину.',
}

export function authErrorMessage(error) {
    if (!error?.message) {
        return 'Сталася невідома помилка. Спробуйте ще раз.'
    }
    return messages[error.message] ?? error.message
}
