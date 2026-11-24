const OPERATIONS = new Set([
  'initialize', 'signIn', 'signUp', 'resend', 'resetPassword',
  'updatePassword', 'confirm', 'signOut',
])
const ERROR_NAMES = new Set([
  'AuthApiError', 'AuthSessionMissingError', 'AuthRetryableFetchError',
  'AuthUnknownError', 'AbortError', 'TypeError',
])

export function logAuthError(operation, error) {
  // Even "code" and "name" may be attacker-controlled. No messages, URLs,
  // arbitrary objects, token values, or unbounded strings reach diagnostics.
  console.error('[auth]', {
    operation: OPERATIONS.has(operation) ? operation : 'unknown',
    name: ERROR_NAMES.has(error?.name) ? error.name : 'UnknownError',
    status: Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status : undefined,
  })
}
