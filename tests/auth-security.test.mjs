import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { reactive } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import { getUserWithToken, updatePasswordWithToken } from '../src/lib/password-update.js'
import { createAuthStorage, importIncomingSession } from '../src/lib/incoming-session.js'
import { logAuthError } from '../src/lib/auth-diagnostics.js'
import {
  helpers, helperSource, dataModule, location, storeWith, deferred, sessionFor,
  authMock, mountView, flush,
} from './auth-test-utils.mjs'

test('URL capture replaces the sole history entry before routing, for query and fragment credentials', () => {
  for (const path of [
    '/auth/callback?redirect=%2Fplanner&token_hash=synthetic&type=signup',
    '/auth/callback?access_token=synthetic-A&refresh_token=synthetic&type=recovery',
    '/auth/callback?redirect=%2Fplanner#access_token=synthetic-A&refresh_token=synthetic&type=signup',
    '/auth/callback?token_hash=synthetic#error_code=otp_expired&error_description=synthetic',
    '/planner#refresh_token=synthetic',
  ]) {
    const entries = location(path)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].href, window.location.href)
    assert.doesNotMatch(window.location.href, /synthetic|access_token|refresh_token|token_hash|error_code/)
    assert.deepEqual(window.history.state, { audit: true })
    helpers.clearCapturedAuthState()
  }
  location('/auth/callback?redirect=%2Fplanner&token_hash=synthetic&type=signup')
  assert.equal(window.location.searchParams.get('redirect'), '/planner')
  assert.equal(helpers.getCapturedAuthState().tokenHash, 'synthetic')
  location('/planner?x=1#tasks')
  assert.equal(window.location.pathname + window.location.search + window.location.hash, '/planner?x=1#tasks')
})

test('redirects strip credentials, nested redirects and normalized auth destinations', () => {
  assert.equal(helpers.getSafeRedirectPath('/planner?access_token=synthetic&x=1#refresh_token=synthetic'), '/planner?x=1')
  assert.equal(helpers.getSafeRedirectPath('/planner?redirect=%2F%3Ftoken_hash%3Dsynthetic'), '/planner')
  for (const path of ['/x/../login', '/%2e%2e/auth/callback', '/\t/evil.example']) {
    assert.equal(helpers.getSafeRedirectPath(path), '/')
  }
})

test('startup explicitly exchanges captured credentials once and preserves failure independently of an older session', async () => {
  location('/auth/callback#access_token=synthetic-B&refresh_token=synthetic&type=signup')
  const mock = authMock()
  let calls = 0
  mock.auth.setSession = async credentials => {
    calls++
    assert.equal(credentials.access_token, 'synthetic-B')
    assert.equal(window.location.hash, '')
    return { error: { code: 'otp_expired' } }
  }
  const auth = await storeWith(mock)
  await Promise.all([auth.initialize(), auth.initialize()])
  assert.equal(calls, 1)
  assert.equal(auth.user.id, 'A')
  assert.ok(auth.initializationError)
  assert.equal(helpers.takeSessionCredentials(), null)
  helpers.clearCapturedAuthState()
})

test('incomplete incoming credentials fail without replacing an existing account', async () => {
  location('/auth/callback?refresh_token=synthetic&type=recovery')
  const auth = await storeWith(authMock())
  await auth.initialize()
  assert.equal(auth.user.id, 'A')
  assert.ok(auth.initializationError)
  helpers.clearCapturedAuthState()
})

test('actual SDK supports explicit implicit-session exchange without reading or changing the URL', async () => {
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({
    sub: 'A', exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')}.c3ludGhldGlj`
  location(`/auth/callback#access_token=${jwt}&refresh_token=synthetic&type=recovery`)
  const credentials = helpers.takeSessionCredentials()
  const original = window.location.href
  let requests = 0
  const client = createClient('https://auth.example.invalid', 'synthetic-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, options) => {
        requests++
        assert.ok(String(url).endsWith('/auth/v1/user'))
        assert.equal(options.headers.Authorization, `Bearer ${jwt}`)
        return new Response(JSON.stringify(sessionFor('A').user), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  })
  const { error } = await client.auth.setSession(credentials)
  assert.equal(error, null)
  assert.equal((await client.auth.getSession()).data.session.user.id, 'A')
  assert.equal(window.location.href, original)
  assert.equal(requests, 1)
  helpers.clearCapturedAuthState()
})

test('password mutation uses the fixed verified token and never another shared-storage account', async () => {
  location('/')
  const mock = authMock()
  const waiting = deferred()
  let request
  const auth = await storeWith(mock, async options => {
    request = options
    return waiting.promise
  })
  await auth.initialize()
  const action = auth.updatePassword({ password: 'synthetic-password', expectedUserId: 'A' })
  await flush()
  assert.equal(request.accessToken, 'synthetic-A')
  mock.emit(sessionFor('B'))
  assert.equal(request.signal.aborted, true)
  waiting.resolve({ error: null })
  assert.equal((await action).code, 'account_changed')
  assert.equal(auth.user.id, 'B')
  assert.equal(auth.session.access_token, 'synthetic-B')
})

test('delayed cross-tab broadcast cannot select a different account for password submission', async () => {
  location('/')
  const mock = authMock()
  let mutations = 0
  const auth = await storeWith(mock, async () => { mutations++; return { error: null } })
  await auth.initialize()
  mock.setStorage(sessionFor('B'))
  assert.equal(auth.user.id, 'A')
  assert.equal((await auth.updatePassword({ password: 'synthetic-password', expectedUserId: 'A' })).code, 'account_changed')
  assert.equal(mutations, 0)
})

test('account switch after storage read cannot change the JWT used by the mutation', async () => {
  location('/')
  const mock = authMock()
  const verified = deferred()
  mock.auth.getUser = async token => {
    assert.equal(token, 'synthetic-A')
    return verified.promise
  }
  let sentToken
  const auth = await storeWith(mock, async options => {
    sentToken = options.accessToken
    return { error: null }
  })
  await auth.initialize()
  const action = auth.updatePassword({ password: 'synthetic-password', expectedUserId: 'A' })
  await flush()
  mock.setStorage(sessionFor('B')) // Broadcast has not arrived.
  verified.resolve({ data: { user: sessionFor('A').user }, error: null })
  assert.equal((await action).ok, true)
  assert.equal(sentToken, 'synthetic-A')
  assert.equal(auth.user.id, 'A')
  // No response/session was saved over B's independently changed storage.
  assert.equal((await mock.auth.getSession()).data.session.user.id, 'B')
})

test('password mutation requires expected identity, server verification, and handles expiry', async () => {
  location('/')
  const mock = authMock()
  let mutations = 0
  const auth = await storeWith(mock, async () => { mutations++; return { error: null } })
  await auth.initialize()
  assert.equal((await auth.updatePassword({ password: 'synthetic' })).ok, false)
  mock.auth.getUser = async () => ({ data: { user: sessionFor('B').user }, error: null })
  assert.equal((await auth.updatePassword({ password: 'synthetic', expectedUserId: 'A' })).code, 'account_changed')
  mock.auth.getUser = async () => ({ data: { user: null }, error: { code: 'session_expired' } })
  assert.equal((await auth.updatePassword({ password: 'synthetic', expectedUserId: 'A' })).code, 'session_expired')
  assert.equal(mutations, 0)
  assert.equal(auth.isBusy, false)
})

test('supported Auth HTTP password API uses explicit JWT, maps errors, and validates response identity', async () => {
  const base = {
    supabaseUrl: 'https://auth.example.invalid/',
    publishableKey: 'synthetic-public', accessToken: 'synthetic-A',
    expectedUserId: 'A', password: 'synthetic-password',
  }
  const result = await updatePasswordWithToken({
    ...base,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://auth.example.invalid/auth/v1/user')
      assert.equal(options.method, 'PUT')
      assert.equal(options.headers.Authorization, 'Bearer synthetic-A')
      assert.equal(options.headers.apikey, base.publishableKey)
      assert.equal(options.headers['X-Supabase-Api-Version'], '2024-01-01')
      assert.equal(options.redirect, 'error')
      assert.deepEqual(JSON.parse(options.body), { password: base.password })
      return new Response(JSON.stringify({ id: 'A' }))
    },
  })
  assert.equal(result.error, null)
  const failure = await updatePasswordWithToken({
    ...base, fetchImpl: async () => new Response(JSON.stringify({ code: 'same_password', msg: 'synthetic' }), { status: 422 }),
  })
  assert.equal(failure.error.code, 'same_password')
  const mismatch = await updatePasswordWithToken({
    ...base, fetchImpl: async () => new Response(JSON.stringify({ id: 'B' })),
  })
  assert.equal(mismatch.error.code, 'account_changed')
})

test('local logout clears application state despite remote revocation network failure', async () => {
  location('/')
  const mock = authMock()
  let scope
  mock.auth.signOut = async options => {
    scope = options.scope
    // Mirrors supported SDK local sign-out ordering.
    mock.emit(null)
    return { error: { name: 'AuthRetryableFetchError' } }
  }
  const auth = await storeWith(mock)
  await auth.initialize()
  assert.equal((await auth.signOut()).ok, true)
  assert.equal(scope, 'local')
  assert.equal(auth.session, null)
})

test('actual SDK local logout clears its session before a failed revocation request finishes', async () => {
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({
    sub: 'A', exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')}.c3ludGhldGlj`
  const revoke = deferred()
  const client = createClient('https://auth.example.invalid', 'synthetic-public', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async url => {
      if (String(url).includes('/logout')) return revoke.promise
      return new Response(JSON.stringify(sessionFor('A').user))
    } },
  })
  await client.auth.setSession({ access_token: jwt, refresh_token: 'synthetic' })
  const logout = client.auth.signOut({ scope: 'local' })
  await flush()
  assert.equal((await client.auth.getSession()).data.session, null)
  // A non-retryable gateway response avoids SDK retry timers in the test.
  revoke.resolve(new Response(JSON.stringify({ code: 'unexpected_failure' }), { status: 418 }))
  assert.ok((await logout).error)
  assert.equal((await client.auth.getSession()).data.session, null)
})

test('confirmation verifies a token hash even when a different account is signed in', async () => {
  location('/auth/callback?token_hash=synthetic&type=signup')
  let verified = 0
  const auth = reactive({
    isAuthenticated: true, user: sessionFor('A').user,
    initialize: async () => {},
    confirmEmailToken: async args => {
      verified++
      assert.equal(args.type, 'signup')
      auth.user = sessionFor('B').user
      return { ok: true, userId: 'B' }
    },
  })
  const view = await mountView('AuthCallbackView', auth, ['status', 'confirmedEmail', 'goToTarget'])
  await flush()
  assert.equal(verified, 1)
  assert.equal(view.state.status.value, 'success')
  assert.equal(view.state.confirmedEmail.value, 'B@example.invalid')
  assert.equal(view.navigations.length, 0) // Explicit continue, no hidden timer.
  view.state.goToTarget()
  assert.equal(view.navigations.length, 1)
  view.unmount()
})

test('failed, reused, invalid-type, or absent confirmation credentials never succeed using an older session', async () => {
  for (const path of [
    '/auth/callback?token_hash=synthetic&type=signup',
    '/auth/callback?token_hash=synthetic&type=unsupported',
    '/auth/callback#access_token=synthetic&refresh_token=synthetic&type=signup',
    '/auth/callback#error_code=otp_expired',
    '/auth/callback',
  ]) {
    location(path)
    const auth = {
      isAuthenticated: true, user: sessionFor('A').user,
      initializationError: 'Invalid incoming session',
      initialize: async () => {},
      confirmEmailToken: async () => ({ ok: false, message: 'Expired or reused' }),
    }
    const view = await mountView('AuthCallbackView', auth, ['status'])
    await flush()
    assert.equal(view.state.status.value, 'error', path)
    assert.equal(view.navigations.length, 0)
    assert.equal(helpers.getCapturedAuthState().tokenHash, '')
    view.unmount()
  }
})

test('callback completion after unmount does not update state or navigate', async () => {
  location('/auth/callback?token_hash=synthetic&type=signup')
  const verification = deferred()
  const view = await mountView('AuthCallbackView', {
    isAuthenticated: true, user: sessionFor('A').user,
    initialize: async () => {}, confirmEmailToken: () => verification.promise,
  }, ['status'])
  await flush()
  view.unmount()
  verification.resolve({ ok: true })
  await flush()
  assert.equal(view.state.status.value, 'loading')
  assert.equal(view.navigations.length, 0)
})

test('recovery verifies token hash over older sessions and ignores completion after unmount', async () => {
  location('/auth/reset-password?token_hash=synthetic&type=recovery')
  const verification = deferred()
  const auth = reactive({
    isAuthenticated: true, user: sessionFor('A').user,
    initialize: async () => {}, confirmEmailToken: () => verification.promise,
  })
  const view = await mountView('ResetPasswordView', auth, ['status'])
  await flush()
  view.unmount()
  verification.resolve({ ok: true })
  await flush()
  assert.equal(view.state.status.value, 'loading')
  assert.equal(view.navigations.length, 0)
})

test('reset submission passes its bound identity and ignores late success after account change', async () => {
  location('/auth/reset-password')
  const update = deferred()
  let args
  const auth = reactive({
    isAuthenticated: true, user: sessionFor('A').user, isBusy: false,
    initialize: async () => {},
    updatePassword: options => { args = options; return update.promise },
  })
  const view = await mountView('ResetPasswordView', auth, ['status', 'password', 'confirmation', 'handleSubmit'])
  await flush()
  view.state.password.value = 'synthetic-password'
  view.state.confirmation.value = 'synthetic-password'
  const pending = view.state.handleSubmit()
  assert.equal(args.expectedUserId, 'A')
  auth.user = sessionFor('B').user
  await flush()
  update.resolve({ ok: true })
  await pending
  assert.equal(view.state.status.value, 'error')
  assert.equal(view.state.password.value, '')
  view.unmount()
})

test('reset submission completion after unmount does not display success', async () => {
  location('/auth/reset-password')
  const update = deferred()
  const view = await mountView('ResetPasswordView', {
    isAuthenticated: true, user: sessionFor('A').user, isBusy: false,
    initialize: async () => {}, updatePassword: () => update.promise,
  }, ['status', 'password', 'confirmation', 'handleSubmit'])
  await flush()
  view.state.password.value = 'synthetic-password'
  view.state.confirmation.value = 'synthetic-password'
  const pending = view.state.handleSubmit()
  view.unmount()
  update.resolve({ ok: true })
  await pending
  assert.equal(view.state.status.value, 'form')
})

test('registration clears passwords on success and late login/recovery results cannot navigate', async () => {
  location('/')
  const register = await mountView('RegisterView', {
    isBusy: false, signUp: async () => ({ ok: true, needsConfirmation: true, email: 'A@example.invalid' }),
  }, ['email', 'password', 'confirmation', 'handleSubmit', 'isRegistered'])
  register.state.email.value = 'A@example.invalid'
  register.state.password.value = 'synthetic-password'
  register.state.confirmation.value = 'synthetic-password'
  await register.state.handleSubmit()
  assert.equal(register.state.password.value, '')
  assert.equal(register.state.confirmation.value, '')
  assert.equal(register.state.isRegistered.value, true)
  register.unmount() // Also disposes the cooldown interval.

  for (const [name, method, fields] of [
    ['LoginView', 'signIn', ['email', 'password']],
    ['ForgotPasswordView', 'requestPasswordReset', ['email']],
    ['RegisterView', 'signUp', ['email', 'password', 'confirmation']],
  ]) {
    const response = deferred()
    const view = await mountView(name, { isBusy: false, [method]: () => response.promise },
      [...fields, 'handleSubmit'])
    for (const field of fields) view.state[field].value = field === 'email' ? 'A@example.invalid' : 'synthetic-password'
    const pending = view.state.handleSubmit()
    view.unmount()
    response.resolve({ ok: true, needsConfirmation: false })
    await pending
    assert.equal(view.navigations.length, 0)
  }
})

test('account-existence responses use neutral signup, resend, recovery, and login outcomes', async () => {
  location('/')
  const mock = authMock(null)
  for (const name of ['signUp', 'resend', 'resetPasswordForEmail', 'signInWithPassword']) {
    mock.auth[name] = async () => ({ error: { code: 'user_already_exists' } })
  }
  const auth = await storeWith(mock)
  await auth.initialize()
  const signup = await auth.signUp({ email: 'A@example.invalid', password: 'synthetic' })
  assert.deepEqual(signup, { ok: true, email: 'A@example.invalid', needsConfirmation: true })
  assert.equal((await auth.resendConfirmation({ email: 'A@example.invalid' })).ok, true)
  assert.equal((await auth.requestPasswordReset({ email: 'A@example.invalid' })).ok, true)
  assert.equal((await auth.signIn({ email: 'A@example.invalid', password: 'synthetic' })).code, 'invalid_credentials')
})

test('diagnostics never include arbitrary names, messages, codes, URLs, or nested secrets', () => {
  const previous = console.error
  const logged = []
  console.error = (...args) => logged.push(args)
  try {
    logAuthError('signIn', {
      name: 'synthetic-secret', code: 'synthetic-secret',
      message: 'https://example.invalid?access_token=synthetic-secret',
      session: { refresh_token: 'synthetic-secret' }, status: 401,
    })
  } finally { console.error = previous }
  assert.doesNotMatch(JSON.stringify(logged), /synthetic-secret|access_token|refresh_token/)
  assert.equal(logged[0][1].status, 401)
})

test('actual router guards await initialization, protect routes, sanitize redirects and intercept recovery', async () => {
  const source = (await readFile(new URL('../src/router/index.js', import.meta.url), 'utf8'))
    .replace("from 'vue-router'", `from '${import.meta.resolve('vue-router')}'`)
    .replace('createRouter, createWebHistory', 'createRouter')
    .replace(/^import (\w+) from '.*\.vue'\r?\n/gm, 'const $1 = {}\n')
    .replace("'../lib/auth-redirect'", `'${dataModule(helperSource)}'`)
    .replace("import { pinia } from '../stores'", 'const pinia = {}')
    .replace("import { useAuthStore } from '../stores/auth'", 'const useAuthStore = () => globalThis.__routerAuth')
    .replace('createWebHistory(import.meta.env.BASE_URL)', 'globalThis.__routerHistory')
    .replace(/\(\) => import\('[^']+'\)/g, '{}')
  location('/planner#access_token=synthetic&refresh_token=synthetic&type=signup')
  helpers.clearCapturedAuthState()
  globalThis.document = { title: '' }
  globalThis.__routerHistory = createMemoryHistory()
  let initialized = 0
  globalThis.__routerAuth = { isAuthenticated: false, initialize: async () => { initialized++ } }
  const { default: router } = await import(dataModule(source))
  try {
    await router.push('/planner?access_token=synthetic&x=1#refresh_token=synthetic')
    assert.equal(router.currentRoute.value.name, 'login')
    assert.equal(router.currentRoute.value.query.redirect, '/planner?x=1')
    assert.doesNotMatch(router.currentRoute.value.fullPath, /synthetic/)
    globalThis.__routerAuth.isAuthenticated = true
    await router.push('/login?redirect=%2Fplanner')
    assert.equal(router.currentRoute.value.name, 'planner')
    await router.push('/auth/callback?token_hash=synthetic&type=signup')
    assert.equal(router.currentRoute.value.name, 'auth-callback')
    assert.doesNotMatch(router.currentRoute.value.fullPath, /synthetic|token_hash/)
    await router.push({ path: '/planner', query: { label: "Sam's", filter: ['one', 'two'] }, hash: '#tasks' })
    assert.equal(router.currentRoute.value.query.label, "Sam's")
    assert.deepEqual(router.currentRoute.value.query.filter, ['one', 'two'])
    assert.equal(router.currentRoute.value.hash, '#tasks')
    await router.push("/planner?label=Sam's&access_token=synthetic#tasks&refresh_token=synthetic")
    assert.equal(router.currentRoute.value.fullPath, "/planner?label=Sam's#tasks")
    for (const path of [
      '/auth/callback?recovery=1&code=synthetic',
      '/auth/reset-password?refresh_token=synthetic',
      '/auth/callback?recovery=1&token_hash=synthetic&type=recovery',
    ]) {
      await router.push('/planner')
      await router.push(path)
      assert.equal(router.currentRoute.value.name, 'reset-password')
      assert.deepEqual(router.currentRoute.value.query, { invalidRecovery: '1' })
      assert.doesNotMatch(router.currentRoute.value.fullPath, /synthetic|code=|token/)
    }
    await router.push('/planner')
    location('/auth/callback?recovery=1&token_hash=synthetic&type=recovery')
    await router.push('/auth/callback')
    assert.equal(router.currentRoute.value.name, 'reset-password')
    assert.deepEqual(router.currentRoute.value.query, { recoveryAttempt: '1' })
    assert.ok(initialized >= 3)
  } finally {
    delete globalThis.__routerAuth
    delete globalThis.__routerHistory
    delete globalThis.document
    helpers.clearCapturedAuthState()
  }
})

test('startup success binds incoming implicit credentials to the exchanged account', async () => {
  location('/auth/callback#access_token=synthetic-B&refresh_token=synthetic&type=signup')
  const auth = await storeWith(authMock())
  await auth.initialize()
  assert.equal(auth.incomingSessionUserId, 'B')
  assert.equal(auth.user.id, 'B')
  assert.equal(auth.initializationError, '')
  const view = await mountView('AuthCallbackView', auth, ['status', 'confirmedEmail'])
  await flush()
  assert.equal(view.state.status.value, 'success')
  assert.equal(view.state.confirmedEmail.value, 'B@example.invalid')
  view.unmount()
})

test('successful token verification without a returned session is not confirmation success', async () => {
  location('/')
  const mock = authMock()
  mock.auth.verifyOtp = async () => ({ data: { session: null, user: sessionFor('B').user }, error: null })
  const auth = await storeWith(mock)
  await auth.initialize()
  assert.equal((await auth.confirmEmailToken({ tokenHash: 'synthetic', type: 'signup' })).ok, false)
  assert.equal(auth.user.id, 'A')
})

test('cross-browser token-hash confirmation works without any pre-existing session', async () => {
  location('/auth/callback?token_hash=synthetic&type=signup')
  const auth = reactive({
    isAuthenticated: false, user: null,
    initialize: async () => {},
    confirmEmailToken: async () => {
      auth.user = sessionFor('B').user
      auth.isAuthenticated = true
      return { ok: true, userId: 'B' }
    },
  })
  const view = await mountView('AuthCallbackView', auth, ['status', 'confirmedEmail'])
  await flush()
  assert.equal(view.state.status.value, 'success')
  assert.equal(view.state.confirmedEmail.value, 'B@example.invalid')
  view.unmount()
})

test('recovery supports new-browser token hashes and persisted-session reloads', async () => {
  for (const incoming of [true, false]) {
    location(incoming ? '/auth/reset-password?token_hash=synthetic&type=recovery' : '/auth/reset-password')
    const auth = reactive({
      isAuthenticated: !incoming, user: incoming ? null : sessionFor('B').user,
      initialize: async () => {},
      confirmEmailToken: async () => {
        auth.user = sessionFor('B').user
        auth.isAuthenticated = true
        return { ok: true, userId: 'B' }
      },
    })
    const view = await mountView('ResetPasswordView', auth, ['status', 'recoveryUserId'])
    await flush()
    assert.equal(view.state.status.value, 'form')
    assert.equal(view.state.recoveryUserId.value, 'B')
    view.unmount()
  }
})

test('invalid, expired and reused recovery links reject an older session', async () => {
  for (const path of [
    '/auth/reset-password?token_hash=synthetic&type=recovery',
    '/auth/reset-password?token_hash=synthetic&type=signup',
    '/auth/reset-password#access_token=synthetic&refresh_token=synthetic&type=recovery',
    '/auth/reset-password#error_code=otp_expired',
  ]) {
    location(path)
    const view = await mountView('ResetPasswordView', {
      isAuthenticated: true, user: sessionFor('A').user,
      initialize: async () => {}, initializationError: 'Invalid incoming link',
      confirmEmailToken: async () => ({ ok: false, message: 'Expired or reused' }),
    }, ['status'])
    await flush()
    assert.equal(view.state.status.value, 'error')
    assert.equal(view.navigations.length, 0)
    view.unmount()
  }
})

test('callback account changes disable continuation instead of forwarding the new account', async () => {
  location('/auth/callback#access_token=synthetic&refresh_token=synthetic&type=signup')
  const auth = reactive({
    isAuthenticated: true, user: sessionFor('A').user, incomingSessionUserId: 'A',
    initialize: async () => {},
  })
  const view = await mountView('AuthCallbackView', auth, ['status', 'goToTarget', 'isConfirmedAccount'])
  await flush()
  assert.equal(view.state.status.value, 'success')
  auth.user = sessionFor('B').user
  view.state.goToTarget()
  assert.equal(view.state.isConfirmedAccount.value, false)
  assert.equal(view.navigations.length, 0)
  view.unmount()
})

test('application watcher redirects on cross-tab sign-out/expiry and guest sign-in, with sanitized targets', async () => {
  const route = reactive({
    meta: { requiresAuth: true }, fullPath: '/planner?access_token=synthetic&x=1',
    query: {},
  })
  const auth = reactive({
    isAuthenticated: true, isReady: true, user: sessionFor('A').user,
    pendingAction: null,
  })
  const view = await mountView('App', auth, [], { useRoute: () => route })
  auth.isAuthenticated = false
  await flush()
  assert.deepEqual(view.navigations[0], { name: 'login', query: { redirect: '/planner?x=1' } })
  route.meta = { guestOnly: true }
  route.query = { redirect: '/settings' }
  auth.isAuthenticated = true
  await flush()
  assert.equal(view.navigations[1], '/settings')
  view.unmount()
})

test('refresh events preserve account identity and sign-out invalidates password updates', async () => {
  location('/')
  const mock = authMock()
  const auth = await storeWith(mock)
  await auth.initialize()
  mock.emit({ ...sessionFor('A'), access_token: 'synthetic-refreshed-A' }, 'TOKEN_REFRESHED')
  assert.equal(auth.isAuthenticated, true)
  assert.equal(auth.session.access_token, 'synthetic-refreshed-A')
  mock.emit(null)
  assert.equal(auth.isAuthenticated, false)
  assert.equal((await auth.updatePassword({ expectedUserId: 'A', password: 'synthetic' })).code, 'account_changed')
})

test('password network failures release the action lock without changing the session', async () => {
  location('/')
  const auth = await storeWith(authMock(), async () => { throw { name: 'AuthRetryableFetchError' } })
  await auth.initialize()
  const previous = console.error
  const logs = []
  console.error = (...args) => logs.push(args)
  let result
  try {
    result = await auth.updatePassword({ password: 'synthetic-secret-password', expectedUserId: 'A' })
  } finally { console.error = previous }
  assert.equal(result.ok, false)
  assert.equal(auth.isBusy, false)
  assert.equal(auth.user.id, 'A')
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret-password|synthetic-A/)
})

test('logout does not report success if a local session is still present', async () => {
  location('/')
  const mock = authMock()
  mock.auth.signOut = async () => ({ error: { name: 'AuthRetryableFetchError' } })
  const auth = await storeWith(mock)
  await auth.initialize()
  assert.equal((await auth.signOut()).ok, false)
  assert.equal(auth.isAuthenticated, true)
})

test('password token snapshot remains immutable if the returned session object is later mutated', async () => {
  location('/')
  const original = sessionFor('A')
  const mock = authMock(original)
  const verification = deferred()
  mock.auth.getUser = async token => {
    assert.equal(token, 'synthetic-A')
    return verification.promise
  }
  let sent
  const auth = await storeWith(mock, async options => { sent = options.accessToken; return { error: null } })
  await auth.initialize()
  const pending = auth.updatePassword({ expectedUserId: 'A', password: 'synthetic' })
  await flush()
  original.access_token = 'synthetic-B'
  verification.resolve({ data: { user: sessionFor('A').user }, error: null })
  assert.equal((await pending).ok, true)
  assert.equal(sent, 'synthetic-A')
})

const authUrl = 'https://auth.example.invalid'
const publishableKey = 'synthetic-public'
const storageKey = 'planner-synthetic-auth'
const bearer = (id, expiresIn = 3600) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({
  sub: id, exp: Math.floor(Date.now() / 1000) + expiresIn,
})).toString('base64url')}.c3ludGhldGlj`
const credentialsFor = (id, expiresIn) => ({
  access_token: bearer(id, expiresIn), refresh_token: `synthetic-refresh-${id}`,
})
const authResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
})
const sharedClient = (storage, fetch) => createClient(authUrl, publishableKey, {
  auth: { storage, storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch },
})

test('A1: an explicit session_not_found reply cannot clear a newer SDK session during password verification', async () => {
  location('/')
  const lookup = deferred()
  const response = deferred()
  const storage = createAuthStorage()
  const client = sharedClient(storage, async (_url, options) =>
    authResponse(options.headers.Authorization === `Bearer ${a.access_token}` ? { id: 'A' } : { id: 'B' }))
  const a = credentialsFor('A')
  const b = credentialsFor('B')
  const events = []
  client.auth.onAuthStateChange(event => { events.push(event) })
  try {
    assert.equal((await client.auth.setSession(a)).error, null)
    const auth = await storeWith(client, async () => assert.fail('Verification must prevent a mutation'), {
      verifyPasswordAccount: options => getUserWithToken({
        ...options, supabaseUrl: authUrl, publishableKey,
        fetchImpl: async (url, request) => {
          assert.equal(url, `${authUrl}/auth/v1/user`)
          assert.equal(request.method, 'GET')
          assert.equal(request.headers.Authorization, `Bearer ${a.access_token}`)
          assert.equal(request.cache, 'no-store')
          lookup.resolve()
          return response.promise
        },
      }),
    })
    await auth.initialize()
    const pending = auth.updatePassword({ expectedUserId: 'A', password: 'synthetic' })
    await lookup.promise
    assert.equal((await client.auth.setSession(b)).error, null)
    response.resolve(authResponse({ code: 'session_not_found' }, 403))
    assert.equal((await pending).code, 'account_changed')
    assert.equal(auth.user.id, 'B')
    assert.equal((await client.auth.getSession()).data.session.user.id, 'B')
    assert.ok(!events.includes('SIGNED_OUT'))
  } finally {
    await client.auth.dispose()
  }
})

test('A1: rejected implicit exchanges exercise real SDK lookup and refresh errors without touching a newer account', async () => {
  const storage = createAuthStorage()
  const client = sharedClient(storage, async (_url, options) =>
    authResponse(options.headers.Authorization === `Bearer ${a.access_token}` ? { id: 'A' } : { id: 'B' }))
  const a = credentialsFor('A')
  const b = credentialsFor('B')
  const oldLink = credentialsFor('old')
  const events = []
  client.auth.onAuthStateChange(event => { events.push(event) })
  try {
    assert.equal((await client.auth.setSession(a)).error, null)
    const lookup = deferred()
    const response = deferred()
    location(`/auth/callback?recovery=1#access_token=${oldLink.access_token}&refresh_token=${oldLink.refresh_token}&type=recovery`)
    const auth = await storeWith(client, undefined, {
      establishIncomingSession: credentials => importIncomingSession({
        storage, storageKey, credentials, supabaseUrl: authUrl, publishableKey,
        fetchImpl: async (url, request) => {
          assert.equal(url, `${authUrl}/auth/v1/user`)
          assert.equal(request.headers.Authorization, `Bearer ${oldLink.access_token}`)
          lookup.resolve()
          return response.promise
        },
      }),
    })
    const boot = auth.initialize()
    await lookup.promise
    assert.equal((await client.auth.setSession(b)).error, null)
    const newer = storage.getItem(storageKey)
    response.resolve(authResponse({ code: 'session_not_found' }, 403))
    await boot
    assert.ok(auth.initializationError)
    assert.equal(auth.incomingSessionUserId, '')
    assert.equal(auth.user.id, 'B')
    assert.equal(storage.getItem(storageKey), newer)

    const expired = await importIncomingSession({
      storage, storageKey, credentials: credentialsFor('expired', -60), supabaseUrl: authUrl, publishableKey,
      fetchImpl: async url => {
        assert.equal(url, `${authUrl}/auth/v1/token?grant_type=refresh_token`)
        return authResponse({ code: 'refresh_token_not_found' }, 400)
      },
    })
    assert.equal(expired.error.code, 'refresh_token_not_found')
    assert.equal(storage.getItem(storageKey), newer)
    assert.ok(!events.includes('SIGNED_OUT'))
    helpers.clearCapturedAuthState()
  } finally {
    await client.auth.dispose()
  }
})

test('A1: successful isolated exchange can bootstrap the shared SDK, but does not overwrite an intervening change', async () => {
  location('/')
  const storage = createAuthStorage()
  const options = { storage, storageKey, supabaseUrl: authUrl, publishableKey, credentials: credentialsFor('B') }
  const entered = deferred()
  const response = deferred()
  const pending = importIncomingSession({
    ...options,
    fetchImpl: async () => { entered.resolve(); return response.promise },
  })
  await entered.promise
  storage.setItem(storageKey, 'newer session')
  response.resolve(authResponse({ id: 'B' }))
  assert.equal((await pending).error.code, 'account_changed')
  assert.equal(storage.getItem(storageKey), 'newer session')

  storage.removeItem(storageKey)
  let refreshes = 0
  const result = await importIncomingSession({
    ...options,
    credentials: credentialsFor('B', -60),
    fetchImpl: async url => {
      refreshes++
      assert.equal(url, `${authUrl}/auth/v1/token?grant_type=refresh_token`)
      return authResponse({ ...options.credentials, user: { id: 'B' }, expires_in: 3600, token_type: 'bearer' })
    },
  })
  assert.deepEqual(result, { userId: 'B', error: null })
  const client = sharedClient(storage, async () => assert.fail('The shared SDK must not re-exchange the link'))
  try {
    assert.equal((await client.auth.getSession()).data.session.user.id, 'B')
    assert.equal(refreshes, 1)
  } finally {
    await client.auth.dispose()
  }
})

test('A1: SDK startup broadcasts a successfully imported session to an existing client', { timeout: 3000 }, async () => {
  location('/auth/callback')
  // Enter the actual SDK browser branch, using Node's BroadcastChannel and
  // synthetic browser globals. Native browser storage and events are separate.
  globalThis.document = { visibilityState: 'hidden' }
  const storage = createAuthStorage()
  const existing = sharedClient(storage, async () => authResponse({ id: 'A' }))
  let next
  try {
    assert.equal((await existing.auth.setSession(credentialsFor('A'))).error, null)
    const received = deferred()
    existing.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id === 'B') received.resolve()
    })
    const result = await importIncomingSession({
      storage, storageKey, credentials: credentialsFor('B'), supabaseUrl: authUrl, publishableKey,
      fetchImpl: async () => authResponse({ id: 'B' }),
    })
    assert.equal(result.userId, 'B')
    next = sharedClient(storage, async () => assert.fail('The shared SDK must not re-exchange the link'))
    assert.equal((await next.auth.getSession()).data.session.user.id, 'B')
    await received.promise
    assert.equal((await existing.auth.getSession()).data.session.user.id, 'B')
  } finally {
    await next?.auth.dispose()
    await existing.auth.dispose()
    delete globalThis.document
  }
})

test('A2: actual SDK logout completion neither overwrites a newer sign-in nor kicks it back to login', async () => {
  location('/')
  const entered = deferred()
  const revoke = deferred()
  const a = credentialsFor('A')
  const b = credentialsFor('B')
  const client = sharedClient(createAuthStorage(), async (url, request) => {
    if (String(url).includes('/logout')) {
      entered.resolve()
      return revoke.promise
    }
    return authResponse(request.headers.Authorization === `Bearer ${a.access_token}` ? { id: 'A' } : { id: 'B' })
  })
  try {
    assert.equal((await client.auth.setSession(a)).error, null)
    const auth = await storeWith(client)
    await auth.initialize()
    const route = reactive({ meta: { requiresAuth: true }, fullPath: '/planner', query: {} })
    const view = await mountView('App', auth, ['handleLogout'], { useRoute: () => route })
    try {
      const pending = view.state.handleLogout()
      await entered.promise
      await flush()
      assert.equal(auth.user, null)
      assert.equal(view.navigations.length, 1)
      assert.equal(view.navigations[0].name, 'login')
      assert.equal((await client.auth.setSession(b)).error, null)
      assert.equal(auth.user.id, 'B')
      revoke.resolve(new Response(null, { status: 204 }))
      await pending
      await flush()
      assert.equal(view.navigations.length, 1)
      assert.equal(auth.user.id, 'B')
      assert.equal((await client.auth.getSession()).data.session.user.id, 'B')
    } finally {
      view.unmount()
    }
  } finally {
    await client.auth.dispose()
  }
})

test('A2: failed revocation does not read a newer session after observing local sign-out', async () => {
  location('/')
  const mock = authMock()
  const revoke = deferred()
  mock.auth.signOut = () => {
    mock.emit(null)
    return revoke.promise
  }
  const auth = await storeWith(mock)
  await auth.initialize()
  mock.auth.getSession = async () => assert.fail('Revocation of A must not read or refresh B')
  const pending = auth.signOut()
  mock.emit(sessionFor('B'))
  revoke.resolve({ error: { name: 'AuthRetryableFetchError' } })
  assert.equal((await pending).ok, true)
  assert.equal(auth.user.id, 'B')
})

test('A3: malformed and unsupported recovery never fall back to A, including after address cleanup and reload', async () => {
  for (const path of [
    '/auth/callback?recovery=1',
    '/auth/callback?recovery=1&code=synthetic&sb_flow_id=synthetic',
    '/auth/reset-password?access_token=&refresh_token=',
    '/auth/reset-password?token_hash=synthetic&type=signup',
    '/auth/reset-password?access_token=synthetic#refresh_token=synthetic&type=recovery',
    '/auth/reset-password#?access_token=synthetic&refresh_token=synthetic&type=recovery&error=denied',
    '/auth/reset-password?recoveryAttempt=1',
    '/auth/reset-password?invalidRecovery=1',
  ]) {
    location(path)
    const route = { query: Object.fromEntries(window.location.searchParams) }
    assert.doesNotMatch(window.location.href, /synthetic|code=|access_token|refresh_token|token_hash/)
    const auth = await storeWith(authMock(), undefined, {
      establishIncomingSession: () => assert.fail('Malformed link must not be exchanged'),
    })
    const view = await mountView('ResetPasswordView', auth, ['status', 'recoveryUserId'], { useRoute: () => route })
    await flush()
    assert.equal(view.state.status.value, 'error', path)
    assert.equal(view.state.recoveryUserId.value, '', path)
    assert.equal(auth.user.id, 'A')
    assert.equal(view.navigations.length, 0, path)
    view.unmount()
  }
})

test('A3: a verified recovery clears its pending marker; a subsequent clean reset can reload', async () => {
  location('/auth/reset-password?token_hash=synthetic&type=recovery&redirect=%2Fplanner&x=1#tasks')
  const query = Object.fromEntries(window.location.searchParams)
  assert.equal(query.recoveryAttempt, '1')
  const auth = reactive({
    isAuthenticated: true, user: sessionFor('A').user,
    initialize: async () => {},
    confirmEmailToken: async () => {
      auth.user = sessionFor('B').user
      return { ok: true, userId: 'B' }
    },
  })
  const view = await mountView('ResetPasswordView', auth, ['status', 'recoveryUserId'], {
    useRoute: () => ({ query, hash: window.location.hash }),
  })
  await flush()
  assert.equal(view.state.status.value, 'form')
  assert.equal(view.state.recoveryUserId.value, 'B')
  assert.deepEqual(view.navigations, [{ name: 'reset-password', query: { redirect: '/planner', x: '1' }, hash: '#tasks' }])
  view.unmount()

  location('/auth/reset-password?redirect=%2Fplanner')
  const reload = await mountView('ResetPasswordView', auth, ['status', 'recoveryUserId'])
  await flush()
  assert.equal(reload.state.status.value, 'form')
  assert.equal(reload.state.recoveryUserId.value, 'B')
  reload.unmount()
})

test('A5: password API retains status for malformed bodies and rejects invalid success shapes', async () => {
  const options = { supabaseUrl: authUrl, publishableKey, accessToken: 'synthetic-A', expectedUserId: 'A', password: 'synthetic' }
  for (const [body, status, code] of [
    [null, 401, ''], ['<html>unavailable</html>', 502, ''], ['null', 429, 'over_request_rate_limit'],
    ['[]', 403, ''], ['{"code":{},"msg":42}', 403, ''], [null, 204, undefined],
    ['null', 200, undefined], ['{"user":{}}', 200, undefined],
  ]) {
    const result = await updatePasswordWithToken({ ...options, fetchImpl: async () => new Response(body, { status }) })
    assert.equal(result.error.status, status)
    assert.equal(result.error.code, code)
  }
  assert.equal((await updatePasswordWithToken({
    ...options, fetchImpl: async () => authResponse({ user: { id: 'A' } }),
  })).error, null)
  location('/')
  const auth = await storeWith(authMock(), args => updatePasswordWithToken({
    ...options, ...args, fetchImpl: async () => new Response(null, { status: 401 }),
  }))
  const result = await auth.updatePassword({ expectedUserId: 'A', password: 'synthetic' })
  assert.equal(result.ok, false)
  assert.equal(result.sessionMissing, true)
  assert.match(result.message, /Сесія/)
})
