const AUTH_PATHS = /^\/(login|register|forgot-password|auth)(\/|\?|#|$)/i
const AUTH_PARAMETERS = [
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'token_hash', 'token', 'code', 'expires_in', 'expires_at', 'token_type',
  'error', 'error_code', 'error_description', 'type', 'recovery',
]
let sessionCredentials = null

let capturedState = {
  errorCode: '',
  errorDescription: '',
  tokenHash: '',
  type: '',
  recovery: false,
  hasSessionTokens: false,
}

let recoveryRedirectConsumed = false

/**
 * Reads auth-related parameters from the current URL.
 * Runs before both client and router creation. The SDK must NOT also consume
 * the URL: changing location.hash would create a token-bearing history entry.
 */
export function captureAuthUrlState() {
  if (typeof window === 'undefined') return

  const search = new URLSearchParams(window.location.search)
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hash = new URLSearchParams(rawHash)
  const parameter = (name) => hash.get(name) || search.get(name) || ''
  sessionCredentials = parameter('access_token') || parameter('refresh_token')
    ? { access_token: parameter('access_token'), refresh_token: parameter('refresh_token') }
    : null

  capturedState = {
    errorCode: hash.get('error_code') || search.get('error_code') || '',
    errorDescription:
      hash.get('error_description') ||
      search.get('error_description') ||
      hash.get('error') ||
      search.get('error') ||
      '',
    tokenHash: parameter('token_hash'),
    type: hash.get('type') || search.get('type') || '',
    recovery:
      search.get('recovery') === '1' ||
      hash.get('type') === 'recovery' ||
      search.get('type') === 'recovery',
    hasSessionTokens: Boolean(sessionCredentials),
  }
  recoveryRedirectConsumed = false

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const cleanUrl = stripAuthParameters(current, true)
  if (cleanUrl !== current) window.history.replaceState(window.history.state, '', cleanUrl)
}

export function takeSessionCredentials() {
  const credentials = sessionCredentials
  sessionCredentials = null
  return credentials
}

export function stripAuthParameters(path, preserveRedirect = false) {
  const url = new URL(path, 'https://redirect.invalid')
  for (const name of AUTH_PARAMETERS) {
    if (url.searchParams.has(name)) url.searchParams.delete(name)
  }
  // Do not reinterpret ordinary anchors (e.g. #tasks) as URL parameters.
  const hash = new URLSearchParams(url.hash.slice(1))
  if (AUTH_PARAMETERS.some((name) => hash.has(name))) {
    for (const name of AUTH_PARAMETERS) hash.delete(name)
    url.hash = hash.toString()
  }
  // Never forward an embedded, potentially credential-bearing redirect.
  if (url.searchParams.has('redirect')) {
    const original = url.searchParams.get('redirect')
    const redirect = preserveRedirect ? getSafeRedirectPath(original, '') : ''
    if (!preserveRedirect || original !== redirect || url.searchParams.getAll('redirect').length !== 1) {
      url.searchParams.delete('redirect')
      if (redirect) url.searchParams.set('redirect', redirect)
    }
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function getCapturedAuthState() {
  return { ...capturedState }
}

export function consumeRecoveryRedirect() {
  if (!capturedState.recovery || recoveryRedirectConsumed) return false
  recoveryRedirectConsumed = true
  return true
}

export function clearCapturedAuthState() {
  sessionCredentials = null
  capturedState = {
    errorCode: '',
    errorDescription: '',
    tokenHash: '',
    type: '',
    recovery: false,
    hasSessionTokens: false,
  }
}

/**
 * Only internal application paths are allowed as post-login redirects.
 */
export function getSafeRedirectPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback

  const candidate = value.trim()

  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  if (candidate.includes('\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback
  if (candidate.startsWith('/login') || candidate.startsWith('/register')) return fallback
  if (AUTH_PATHS.test(candidate)) return fallback

  const clean = stripAuthParameters(candidate)
  if (clean.startsWith('//') || AUTH_PATHS.test(clean)) return fallback
  return clean
}

export function buildEmailRedirectTo(redirectPath) {
  if (typeof window === 'undefined') return undefined

  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const url = new URL(`${normalizedBase}auth/callback`, window.location.origin)
  const target = getSafeRedirectPath(redirectPath, '')

  if (target && target !== '/') {
    url.searchParams.set('redirect', target)
  }

  return url.toString()
}

export function buildPasswordResetRedirectTo(redirectPath) {
  // Reuse the existing callback endpoint; no new Dashboard allowlist entry
  // is required when the existing callback URL is allowed with query strings.
  const target = buildEmailRedirectTo(redirectPath)
  if (!target) return undefined
  const url = new URL(target)
  url.searchParams.set('recovery', '1')
  return url.toString()
}
