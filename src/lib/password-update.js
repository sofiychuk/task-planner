/**
 * Supported Supabase Auth HTTP API: PUT /auth/v1/user.
 * Unlike auth.updateUser(), this request uses the explicitly verified JWT,
 * never reloads shared storage, never refreshes, and never persists a session.
 */
async function requestUser({
  supabaseUrl, publishableKey, accessToken, method, password, signal,
  fetchImpl = globalThis.fetch,
}) {
  const authUrl = new URL('auth/v1/user', `${supabaseUrl.replace(/\/+$/, '')}/`)
  const response = await fetchImpl(authUrl.href, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'X-Supabase-Api-Version': '2024-01-01',
      ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify({ password }) } : {}),
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  const body = await response.json().catch(() => null)
  const string = (value) => typeof value === 'string' ? value : ''
  if (!response.ok) {
    return {
      error: {
        code: string(body?.code) || string(body?.error_code) ||
          (response.status === 429 ? 'over_request_rate_limit' : ''),
        status: response.status,
        // Used only by the friendly error mapper; never logged verbatim.
        message: string(body?.msg) || string(body?.message) || string(body?.error_description),
      },
    }
  }
  const user = body?.user ?? body
  if (typeof user?.id !== 'string' || !user.id) return { error: { status: response.status } }
  return { data: { user }, error: null }
}

// The shared SDK's getUser(jwt) can remove the current session on session_not_found.
export function getUserWithToken(options) {
  return requestUser({ ...options, method: 'GET' })
}

export async function updatePasswordWithToken(options) {
  const { data, error } = await requestUser({ ...options, method: 'PUT' })
  return { error: error ?? (data.user.id === options.expectedUserId ? null : { code: 'account_changed' }) }
}
