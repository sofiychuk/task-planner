const BLOCKED_PATHS = ['/login', '/register', '/forgot-password']

/**
 * Sanitizes a user-supplied redirect target so it can only point to a
 * same-origin in-app path. Protects against open redirects
 * (`//evil.com`, `/\evil.com`, `http://evil.com`) and redirect loops
 * (back to guest-only pages).
 *
 * @param {unknown} value - Candidate redirect target (usually `route.query.redirect`).
 * @param {string} [fallback='/'] - Value returned when the candidate is unsafe.
 * @returns {string} Safe in-app path.
 */
export function getSafeRedirect(value, fallback = '/') {
    if (typeof value !== 'string' || value.length === 0) {
        return fallback
    }

    // Must be an absolute in-app path: starts with a single slash and
    // contains no backslashes or whitespace (browsers strip tabs/newlines
    // from URLs, which could turn `/\t/evil.com` into `//evil.com`).
    if (
        !value.startsWith('/') ||
        value.startsWith('//') ||
        /[\s\\]/.test(value)
    ) {
        return fallback
    }

    const path = value.split(/[?#]/)[0]
    if (BLOCKED_PATHS.includes(path)) {
        return fallback
    }

    return value
}
