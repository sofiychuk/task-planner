const AUTH_PATHS = /^\/(login|register|forgot-password|auth)(\/|\?|#|$)/i

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
 * Must run before the Supabase client is created, because supabase-js
 * consumes and may remove the implicit-flow hash.
 */
export function captureAuthUrlState() {
  if (typeof window === 'undefined') return

  const search = new URLSearchParams(window.location.search)
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hash = new URLSearchParams(rawHash)

  capturedState = {
    errorCode: hash.get('error_code') || search.get('error_code') || '',
    errorDescription:
      hash.get('error_description') ||
      search.get('error_description') ||
      hash.get('error') ||
      search.get('error') ||
      '',
    tokenHash: search.get('token_hash') || '',
    type: hash.get('type') || search.get('type') || '',
    recovery:
      search.get('recovery') === '1' ||
      hash.get('type') === 'recovery' ||
      search.get('type') === 'recovery',
    hasSessionTokens: Boolean(hash.get('access_token')),
  }
  recoveryRedirectConsumed = false

  // An error hash has no session to restore, so it is safe to clean it right away.
  if (capturedState.errorCode || capturedState.errorDescription) {
    search.delete('error')
    search.delete('error_code')
    search.delete('error_description')
    const query = search.toString()
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(window.history.state, '', cleanUrl)
  }
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
  if (candidate.startsWith('/login') || candidate.startsWith('/register')) return fallback
  if (AUTH_PATHS.test(candidate)) return fallback

  return candidate
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
