import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'

import { getAuthErrorMessage } from '../src/lib/auth-errors.js'
import { validateEmail, validatePassword, validatePasswordConfirmation } from '../src/lib/validation.js'

// Load the Vite helper with its build-time BASE_URL replaced. No network or
// project environment values are used in these tests.
const helperSource = (await readFile(new URL('../src/lib/auth-redirect.js', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.BASE_URL', "'/'")
const helpers = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)

function setLocation(path) {
  const url = new URL(path, 'https://planner.example')
  globalThis.window = {
    location: url,
    history: {
      state: null,
      replaceState(_state, _title, nextUrl) {
        window.location = new URL(nextUrl, url)
      },
    },
  }
  helpers.captureAuthUrlState()
}

test('recovery URL capture and one-shot routing survive SDK hash cleanup', () => {
  setLocation('/#access_token=test&refresh_token=test&type=recovery')
  window.location.hash = ''
  assert.equal(helpers.getCapturedAuthState().type, 'recovery')
  assert.equal(helpers.getCapturedAuthState().hasSessionTokens, true)
  assert.equal(helpers.consumeRecoveryRedirect(), true)
  assert.equal(helpers.consumeRecoveryRedirect(), false)
  helpers.clearCapturedAuthState()
  assert.equal(helpers.getCapturedAuthState().hasSessionTokens, false)
})

test('callback marker captures expired links without retaining error parameters', () => {
  setLocation('/auth/callback?recovery=1&redirect=%2Fplanner#error=access_denied&error_code=otp_expired')
  assert.equal(helpers.consumeRecoveryRedirect(), true)
  assert.equal(helpers.getCapturedAuthState().errorCode, 'otp_expired')
  assert.equal(window.location.hash, '')
  assert.equal(window.location.searchParams.get('redirect'), '/planner')
})

test('token hash recovery is distinct from signup confirmation', () => {
  setLocation('/auth/callback?token_hash=example&type=recovery')
  assert.equal(helpers.getCapturedAuthState().tokenHash, 'example')
  assert.equal(helpers.consumeRecoveryRedirect(), true)
  setLocation('/auth/callback?token_hash=example&type=signup')
  assert.equal(helpers.consumeRecoveryRedirect(), false)
})

test('safe redirect and callback builders preserve existing signup behavior', () => {
  setLocation('/')
  for (const target of ['https://evil.example', '//evil.example', '/\\evil.example',
    '/login', '/register', '/forgot-password', '/auth/reset-password', '/AUTH/callback']) {
    assert.equal(helpers.getSafeRedirectPath(target), '/', target)
  }
  assert.equal(helpers.getSafeRedirectPath('/planner?x=1#tasks'), '/planner?x=1#tasks')
  const signup = new URL(helpers.buildEmailRedirectTo('/planner'))
  assert.equal(signup.pathname, '/auth/callback')
  assert.equal(signup.searchParams.has('recovery'), false)
  const reset = new URL(helpers.buildPasswordResetRedirectTo('/planner'))
  assert.equal(reset.pathname, '/auth/callback')
  assert.equal(reset.searchParams.get('recovery'), '1')
  assert.equal(reset.searchParams.get('redirect'), '/planner')
  assert.equal(new URL(helpers.buildPasswordResetRedirectTo('//evil.example')).searchParams.has('redirect'), false)
})

test('validation and friendly errors cover password recovery failures', () => {
  assert.ok(validateEmail(''))
  assert.ok(validateEmail('invalid'))
  assert.equal(validateEmail('user@example.com'), '')
  assert.ok(validatePassword('1234567'))
  assert.ok(validatePassword('x'.repeat(73)))
  assert.equal(validatePassword('12345678'), '')
  assert.ok(validatePasswordConfirmation('12345678', '87654321'))
  assert.equal(validatePasswordConfirmation('12345678', '12345678'), '')
  for (const code of ['same_password', 'weak_password', 'otp_expired',
    'over_email_send_rate_limit', 'reauthentication_needed']) {
    assert.notEqual(getAuthErrorMessage({ code }), getAuthErrorMessage({ code: 'unknown' }))
  }
  assert.match(getAuthErrorMessage({ name: 'AuthSessionMissingError' }), /Посилання/)
  assert.match(getAuthErrorMessage({ name: 'AuthRetryableFetchError' }), /інтернетом/)
})

test('store actions use Supabase recovery APIs and preserve existing auth', async () => {
  let authCallback
  let resetArgs
  let updateArgs
  let updateError = null
  let initializeCalls = 0
  const session = { user: { id: 'user-1', email: 'user@example.com' }, access_token: 'test' }
  const mock = {
    auth: {
      onAuthStateChange(callback) {
        authCallback = callback
        return { data: { subscription: { unsubscribe() {} } } }
      },
      initialize: async () => {
        initializeCalls += 1
        return { error: null }
      },
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      resetPasswordForEmail: async (...args) => {
        resetArgs = args
        return { error: null }
      },
      updateUser: async (args) => {
        updateArgs = args
        return { data: { user: { ...session.user, updated: true } }, error: updateError }
      },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      resend: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }
  globalThis.__recoveryTestSupabase = mock
  globalThis.__recoveryTestUpdate = async ({ password }) => {
    updateArgs = { password }
    return { error: updateError }
  }
  const storeSource = (await readFile(new URL('../src/stores/auth.js', import.meta.url), 'utf8'))
    .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
    .replace("import { supabase, updatePasswordForAccount } from '../lib/supabase'", 'const supabase = globalThis.__recoveryTestSupabase; const updatePasswordForAccount = globalThis.__recoveryTestUpdate')
    .replace("'../lib/auth-errors'", `'${new URL('../src/lib/auth-errors.js', import.meta.url).href}'`)
    .replace("'../lib/auth-diagnostics'", `'${new URL('../src/lib/auth-diagnostics.js', import.meta.url).href}'`)
    .replace("'../lib/auth-redirect'", `'data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}'`)
    .replaceAll('import.meta.hot', 'false')
  const { useAuthStore } = await import(`data:text/javascript;base64,${Buffer.from(storeSource).toString('base64')}`)
  setActivePinia(createPinia())
  const auth = useAuthStore()
  const firstInit = auth.initialize()
  await Promise.all([firstInit, auth.initialize()])
  assert.equal(initializeCalls, 1)
  assert.equal(auth.isAuthenticated, true)
  setLocation('/')
  assert.equal((await auth.requestPasswordReset({ email: ' user@example.com ', redirectTo: '/planner' })).ok, true)
  assert.equal(resetArgs[0], 'user@example.com')
  assert.equal(new URL(resetArgs[1].redirectTo).searchParams.get('recovery'), '1')
  assert.equal(auth.pendingAction, null)
  assert.equal((await auth.updatePassword({ password: 'new-password', expectedUserId: session.user.id })).ok, true)
  assert.deepEqual(updateArgs, { password: 'new-password' })
  assert.equal(auth.user.id, session.user.id)
  updateError = { code: 'same_password' }
  assert.equal((await auth.updatePassword({ password: 'new-password', expectedUserId: session.user.id })).code, 'same_password')
  assert.equal(auth.isBusy, false)
  assert.equal((await auth.signIn({ email: 'user@example.com', password: 'password' })).ok, true)
  assert.equal((await auth.signUp({ email: 'user@example.com', password: 'password' })).needsConfirmation, true)
  assert.equal((await auth.resendConfirmation({ email: 'user@example.com' })).ok, true)
  assert.equal((await auth.confirmEmailToken({ tokenHash: 'example', type: 'recovery' })).ok, true)
  authCallback('SIGNED_OUT', null)
  assert.equal(auth.isAuthenticated, false)
  assert.equal((await auth.signOut()).ok, true)

  // A failed implicit-link exchange must remain distinguishable from a valid
  // older session returned by getSession.
  mock.auth.initialize = async () => ({ error: { code: 'otp_expired' } })
  setActivePinia(createPinia())
  const oldSessionAuth = useAuthStore()
  await oldSessionAuth.initialize()
  assert.equal(oldSessionAuth.isAuthenticated, true)
  assert.match(oldSessionAuth.initializationError, /Посилання/)

  // Concurrent submits are blocked; network errors restore the loading state.
  let rejectRequest
  mock.auth.resetPasswordForEmail = () => new Promise((_resolve, reject) => {
    rejectRequest = reject
  })
  const pending = auth.requestPasswordReset({ email: 'user@example.com' })
  assert.equal(auth.isBusy, true)
  assert.equal((await auth.requestPasswordReset({ email: 'user@example.com' })).ok, false)
  // Return an API-style network error without throwing/logging test secrets.
  rejectRequest({ name: 'AuthRetryableFetchError' })
  const result = await pending
  assert.equal(result.ok, false)
  assert.match(result.message, /інтернетом/)
  assert.equal(auth.isBusy, false)
  delete globalThis.__recoveryTestSupabase
  delete globalThis.__recoveryTestUpdate
})
