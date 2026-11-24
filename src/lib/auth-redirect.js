const AUTH_PATHS = /^\/(login|register|forgot-password|auth)(\/|\?|#|$)/i
const AUTH_PARAMETERS = new Set([
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'token_hash', 'token', 'code', 'sb_flow_id', 'expires_in', 'expires_at', 'token_type',
  'error', 'error_code', 'error_description', 'type', 'recovery',
])

const emptyState = () => ({
  errorCode: '',
  errorDescription: '',
  tokenHash: '',
  type: '',
  recovery: false,
  hasSessionTokens: false,
  explicitAttempt: false,
  invalidAttempt: false,
})
let capturedState = emptyState()
let sessionCredentials = null
let recoveryRedirectConsumed = false

function splitPath(path) {
  const [, pathname, query = '', fragment = ''] = /^([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/.exec(path)
  return [pathname, query, fragment]
}

export function inspectAuthUrl(path) {
  const [pathname, query, fragment] = splitPath(path)
  const search = new URLSearchParams(query)
  const hash = new URLSearchParams(fragment.slice(1))
  const parameter = name => hash.get(name) || search.get(name) || ''
  const values = name => [...search.getAll(name), ...hash.getAll(name)]
  const has = name => search.has(name) || hash.has(name)
  const containsPairField = params => params.has('access_token') || params.has('refresh_token')
  const pair = containsPairField(hash) ? hash : search
  const hasSessionTokens = containsPairField(pair)
  const credentials = hasSessionTokens
    ? { access_token: pair.get('access_token') || '', refresh_token: pair.get('refresh_token') || '' }
    : null
  const tokenHash = parameter('token_hash')
  const type = parameter('type')
  const reset = /\/auth\/reset-password\/?$/i.test(pathname)
  const explicitAttempt = [...AUTH_PARAMETERS].some(has)
  const recovery = has('recovery') || values('type').some(value => value.toLowerCase() === 'recovery') ||
    (reset && explicitAttempt)
  const invalidAttempt = ['code', 'sb_flow_id', 'token', 'error', 'error_code', 'error_description'].some(has) ||
    ['access_token', 'refresh_token', 'token_hash', 'type', 'recovery'].some(name => values(name).length > 1) ||
    (has('recovery') && parameter('recovery') !== '1') ||
    (containsPairField(hash) && containsPairField(search)) ||
    (hasSessionTokens && (!credentials.access_token || !credentials.refresh_token || has('token_hash'))) ||
    (has('token_hash') && !tokenHash) ||
    ((recovery || reset) && has('type') && type !== 'recovery') ||
    ((recovery || reset) && explicitAttempt && !hasSessionTokens && !tokenHash)
  return {
    state: {
      errorCode: parameter('error_code'),
      errorDescription: parameter('error_description') || parameter('error'),
      tokenHash, type, recovery, hasSessionTokens, explicitAttempt, invalidAttempt,
    },
    credentials,
  }
}

// Capture and clean before constructing either the SDK client or router history.
export function captureAuthUrlState() {
  if (typeof window === 'undefined') return
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const { state, credentials } = inspectAuthUrl(current)
  capturedState = state
  sessionCredentials = credentials
  recoveryRedirectConsumed = false
  let cleanUrl = stripAuthParameters(current, true)
  if (state.recovery) {
    // A reload before verification finishes must not become a clean reset for
    // an older session. The reset view removes this marker only on success.
    const [path, query, hash] = splitPath(cleanUrl)
    cleanUrl = `${path}${query || '?'}${query && query !== '?' ? '&' : ''}recoveryAttempt=1${hash}`
  }
  // A path beginning with // would be interpreted as a host by replaceState.
  if (cleanUrl !== current) {
    window.history.replaceState(window.history.state, '', cleanUrl.startsWith('//')
      ? window.location.origin + cleanUrl
      : cleanUrl)
  }
}

export function takeSessionCredentials() {
  const credentials = sessionCredentials
  sessionCredentials = null
  return credentials
}

export function stripAuthParameters(path, preserveRedirect = false) {
  const [pathname, query, fragment] = splitPath(path)
  function clean(part, isQuery) {
    if (!part) return part
    const prefix = part.startsWith('#?') ? '#?' : part[0]
    const fields = part.slice(prefix.length).split('&')
    const redirects = []
    const remaining = fields.filter(field => {
      const [entry] = new URLSearchParams(`&${field}`)
      if (!entry) return true
      const [name, value] = entry
      if (AUTH_PARAMETERS.has(name)) return false
      if (isQuery && name === 'redirect') redirects.push(value)
      return true
    })
    if (redirects.length) {
      const redirect = preserveRedirect ? getSafeRedirectPath(redirects[0], '') : ''
      if (!redirect || redirects.length !== 1 || redirect !== redirects[0]) {
        const cleaned = remaining.filter(field => !new URLSearchParams(`&${field}`).has('redirect'))
        if (redirect) cleaned.push(new URLSearchParams({ redirect }).toString())
        return cleaned.some(Boolean) ? prefix + cleaned.join('&') : ''
      }
    }
    // Keep untouched fields byte-for-byte, including non-parameter anchors.
    if (fields.length === remaining.length) return part
    return remaining.some(Boolean) ? prefix + remaining.join('&') : ''
  }
  return pathname + clean(query, true) + clean(fragment, false)
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
  capturedState = emptyState()
}

export function getSafeRedirectPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback
  if (candidate.startsWith('/login') || candidate.startsWith('/register') || AUTH_PATHS.test(candidate)) return fallback

  const [path, query, hash] = splitPath(stripAuthParameters(candidate))
  const normalized = new URL(path, 'https://redirect.invalid').pathname
  if (normalized.startsWith('//') || AUTH_PATHS.test(normalized)) return fallback
  return normalized + query + hash
}

export function buildEmailRedirectTo(redirectPath) {
  if (typeof window === 'undefined') return undefined
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const url = new URL(`${normalizedBase}auth/callback`, window.location.origin)
  const target = getSafeRedirectPath(redirectPath, '')
  if (target && target !== '/') url.searchParams.set('redirect', target)
  return url.toString()
}

export function buildPasswordResetRedirectTo(redirectPath) {
  // Reuse the existing callback endpoint and distinguish recovery errors.
  const target = buildEmailRedirectTo(redirectPath)
  if (!target) return undefined
  const url = new URL(target)
  url.searchParams.set('recovery', '1')
  return url.toString()
}
