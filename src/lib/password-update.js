/**
 * Supported Supabase Auth HTTP API: PUT /auth/v1/user.
 * Unlike auth.updateUser(), this request uses the explicitly verified JWT,
 * never reloads shared storage, never refreshes, and never persists a session.
 */
export async function updatePasswordWithToken({
  supabaseUrl, publishableKey, accessToken, password, expectedUserId, signal,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
    signal,
  })
  const body = await response.json()
  if (!response.ok) {
    return {
      error: {
        code: body.code || body.error_code || '',
        status: response.status,
        // Used only by the friendly error mapper; never logged verbatim.
        message: body.msg || body.message || body.error_description || '',
      },
    }
  }
  if (body.id !== expectedUserId) {
    return { error: { code: 'account_changed' } }
  }
  return { error: null }
}
