import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { establishIncomingSession, getSupabase, updatePasswordForAccount, verifyPasswordAccount } from '../lib/supabase'
import { getAuthErrorMessage, isAccountExistenceError } from '../lib/auth-errors'
import { logAuthError } from '../lib/auth-diagnostics'
import { buildEmailRedirectTo, buildPasswordResetRedirectTo, getCapturedAuthState, takeSessionCredentials } from '../lib/auth-redirect'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const isReady = ref(false)
  const pendingAction = ref(null)
  const initializationError = ref('')
  const incomingSessionUserId = ref('')

  let initPromise = null
  let subscription = null
  let identityVersion = 0
  let signOutVersion = 0
  let passwordRequest = null
  let supabase = null

  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => Boolean(user.value))
  const isBusy = computed(() => pendingAction.value !== null)

  /**
   * Restores the persisted session and subscribes to auth changes.
   * The returned promise is shared, so guards and the app shell wait for
   * the exact same initialization.
   */
  function initialize() {
    if (initPromise) return initPromise

    initPromise = (async () => {
      const credentials = takeSessionCredentials()
      if (credentials) {
        try {
          const exchange = getCapturedAuthState().invalidAttempt
            ? { error: { code: 'otp_expired' } }
            : await establishIncomingSession(credentials)
          if (exchange.error) initializationError.value = getAuthErrorMessage(exchange.error)
          else incomingSessionUserId.value = exchange.userId
        } catch (error) {
          initializationError.value = getAuthErrorMessage(error)
          logAuthError('initialize', error)
        }
      }
      try {
        supabase = getSupabase()
        const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
          // Keep this callback synchronous: awaiting Supabase calls here can deadlock.
          if (event === 'SIGNED_OUT') signOutVersion += 1
          if (session.value?.user?.id !== nextSession?.user?.id) {
            identityVersion += 1
            passwordRequest?.abort()
          }
          session.value = nextSession
        })
        subscription = data.subscription
        const result = await supabase.auth.initialize()
        if (result.error && !initializationError.value) initializationError.value = getAuthErrorMessage(result.error)
        const version = identityVersion
        const { data: sessionData, error } = await supabase.auth.getSession()

        if (error) {
          if (!initializationError.value) initializationError.value = getAuthErrorMessage(error)
          logAuthError('initialize', error)
          if (version === identityVersion) session.value = null
        } else if (version === identityVersion) {
          session.value = sessionData.session ?? null
        }
      } catch (error) {
        initializationError.value = getAuthErrorMessage(error)
        logAuthError('initialize', error)
        session.value = null
      } finally {
        isReady.value = true
      }
    })()

    return initPromise
  }

  async function runAction(action, task) {
    if (pendingAction.value) {
      return { ok: false, message: 'Зачекайте завершення поточної дії.' }
    }

    pendingAction.value = action

    try {
      if (!isReady.value) await initialize()
      return await task()
    } catch (error) {
      logAuthError(action, error)
      return { ok: false, message: getAuthErrorMessage(error) }
    } finally {
      pendingAction.value = null
    }
  }

  async function signIn({ email, password }) {
    return runAction('signIn', async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email || '').trim(),
        password,
      })

      if (error) {
        if (isAccountExistenceError(error)) return {
          ok: false, message: getAuthErrorMessage({ code: 'invalid_credentials' }), code: 'invalid_credentials',
        }
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      // Do not rely solely on the auth event: navigation can happen right
      // after this promise resolves and the guard must already see the session.
      session.value = data.session ?? session.value
      return { ok: true }
    })
  }

  async function signUp({ email, password, redirectTo }) {
    return runAction('signUp', async () => {
      const normalizedEmail = String(email || '').trim()
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: buildEmailRedirectTo(redirectTo),
        },
      })

      if (error) {
        if (isAccountExistenceError(error)) {
          return { ok: true, email: normalizedEmail, needsConfirmation: true }
        }
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      if (data.session) {
        session.value = data.session
      }

      // Neutral presentation does not hide distinguishable backend responses.
      return {
        ok: true,
        email: normalizedEmail,
        needsConfirmation: !data.session,
      }
    })
  }

  async function resendConfirmation({ email, redirectTo }) {
    return runAction('resend', async () => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: String(email || '').trim(),
        options: {
          emailRedirectTo: buildEmailRedirectTo(redirectTo),
        },
      })

      if (error) {
        if (isAccountExistenceError(error)) return { ok: true }
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      return { ok: true }
    })
  }

  async function requestPasswordReset({ email, redirectTo }) {
    return runAction('resetPassword', async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: buildPasswordResetRedirectTo(redirectTo),
      })
      if (error) {
        if (isAccountExistenceError(error)) return { ok: true }
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }
      return { ok: true }
    })
  }

  async function updatePassword({ password, expectedUserId }) {
    return runAction('updatePassword', async () => {
      const changed = () => ({
        ok: false, code: 'account_changed',
        message: getAuthErrorMessage({ code: 'account_changed' }),
      })
      const failure = (error) => {
        const sessionMissing = error.name === 'AuthSessionMissingError' || error.status === 401 ||
          ['bad_jwt', 'session_not_found', 'session_expired'].includes(error.code)
        return {
          ok: false, code: error.code || '', sessionMissing,
          message: getAuthErrorMessage(sessionMissing ? { code: 'session_expired' } : error),
        }
      }
      if (!expectedUserId || user.value?.id !== expectedUserId) return changed()
      const version = identityVersion
      const controller = new AbortController()
      passwordRequest = controller
      const isCurrent = () => !controller.signal.aborted &&
        identityVersion === version && user.value?.id === expectedUserId
      try {
        // A fresh storage read detects a tab switch whose broadcast is delayed.
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (!isCurrent()) return changed()
        if (sessionError) return failure(sessionError)
        const snapshot = data.session
        const accessToken = snapshot?.access_token
        if (snapshot?.user?.id !== expectedUserId || !accessToken) return changed()
        // Verify this exact token with the server, not the local user object.
        const verified = await verifyPasswordAccount({ accessToken, signal: controller.signal })
        if (!isCurrent()) return changed()
        if (verified.error) return failure(verified.error)
        if (verified.data.user?.id !== expectedUserId) return changed()
        const { error } = await updatePasswordForAccount({
          accessToken,
          password, expectedUserId, signal: controller.signal,
        })
        if (!isCurrent()) return changed()
        if (error) return failure(error)
        // Password changes need no cached-user mutation. Never merge a late
        // response into another account or write an old session over a new one.
        return { ok: true }
      } catch (error) {
        if (!isCurrent()) return changed()
        throw error
      } finally {
        if (passwordRequest === controller) passwordRequest = null
      }
    })
  }

  async function confirmEmailToken({ tokenHash, type }) {
    return runAction('confirm', async () => {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      })

      if (error) {
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      if (!data.session?.user?.id) {
        return { ok: false, message: getAuthErrorMessage({ code: 'otp_expired' }), code: 'otp_expired' }
      }
      session.value = data.session
      return { ok: true, userId: data.session.user.id }
    })
  }

  async function signOut() {
    return runAction('signOut', async () => {
      const localSignOutAtStart = signOutVersion
      const identityAtStart = identityVersion
      const { error } = await supabase.auth.signOut({ scope: 'local' })

      if (error) {
        // A local removal is enough. Do not inspect/refresh a newer session
        // just because revocation of the old one failed.
        if (signOutVersion !== localSignOutAtStart) return { ok: true }
        if (identityVersion === identityAtStart) {
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (!sessionError && !data.session) {
            if (identityVersion === identityAtStart) session.value = null
            return { ok: true }
          }
        }

        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      // The SDK emitted local SIGNED_OUT before revocation. The user may
      // already have signed in again by the time that request completes.
      return { ok: true }
    })
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      subscription?.unsubscribe()
      subscription = null
    })
  }

  return {
    session,
    user,
    isReady,
    pendingAction,
    initializationError,
    incomingSessionUserId,
    isAuthenticated,
    isBusy,
    initialize,
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    confirmEmailToken,
    signOut,
  }
})
