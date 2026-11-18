import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { supabase } from '../lib/supabase'
import { getAuthErrorMessage } from '../lib/auth-errors'
import { buildEmailRedirectTo } from '../lib/auth-redirect'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const isReady = ref(false)
  const pendingAction = ref(null)

  let initPromise = null
  let subscription = null

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
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        // Keep this callback synchronous: awaiting Supabase calls here can deadlock.
        session.value = nextSession
      })
      subscription = data.subscription

      try {
        const { data: sessionData, error } = await supabase.auth.getSession()

        if (error) {
          console.error('[auth] Failed to restore session:', error)
          session.value = null
        } else {
          session.value = sessionData.session ?? null
        }
      } catch (error) {
        console.error('[auth] Unexpected error while restoring session:', error)
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
      return await task()
    } catch (error) {
      console.error(`[auth] ${action} failed:`, error)
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
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      if (data.session) {
        session.value = data.session
      }

      // With email confirmation enabled Supabase does not reveal whether the
      // address is already registered, so the UI always shows the same state.
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
        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      return { ok: true }
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

      if (data.session) {
        session.value = data.session
      }

      return { ok: true }
    })
  }

  async function signOut() {
    return runAction('signOut', async () => {
      const { error } = await supabase.auth.signOut()

      if (error) {
        // The server session may already be gone (expired or revoked), while
        // the local session was cleared. Treat that as a successful sign-out.
        const { data } = await supabase.auth.getSession()

        if (!data.session) {
          session.value = null
          return { ok: true }
        }

        return { ok: false, message: getAuthErrorMessage(error), code: error.code || '' }
      }

      session.value = null
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
    isAuthenticated,
    isBusy,
    initialize,
    signIn,
    signUp,
    resendConfirmation,
    confirmEmailToken,
    signOut,
  }
})
