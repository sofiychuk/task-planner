import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { getAuthErrorMessage } from '../lib/authErrors'

/**
 * Central authentication store. All auth state changes flow through
 * `onAuthStateChange`, which covers page reloads, silent token refresh,
 * cross-tab logout and the email-confirmation redirect landing.
 *
 * The store is router-agnostic: views perform navigation themselves
 * after an action resolves (avoids circular imports with the router).
 */
export const useAuthStore = defineStore('auth', () => {
    const user = ref(null)
    const session = ref(null)
    const initialized = ref(false)

    let initPromise = null

    const isAuthenticated = computed(() => Boolean(user.value))

    /**
     * Starts listening to auth events and resolves once the initial
     * session has been restored from storage (or determined absent).
     * Idempotent — safe to call from the router guard on every navigation.
     *
     * @returns {Promise<void>}
     */
    function initialize() {
        if (initPromise) {
            return initPromise
        }

        initPromise = (async () => {
            // Register the listener first so no auth events are missed.
            // Note: do NOT call supabase.auth.getSession() inside this
            // callback (documented deadlock hazard).
            supabase.auth.onAuthStateChange((event, newSession) => {
                session.value = newSession
                user.value = newSession?.user ?? null
            })

            // `getSession()` awaits the client's full initialization
            // (URL code exchange + session recovery from storage), so its
            // result is the authoritative initial state — independent of
            // the ordering of the INITIAL_SESSION event.
            try {
                const { data } = await supabase.auth.getSession()
                session.value = data.session ?? null
                user.value = data.session?.user ?? null
            } catch {
                // Keep defaults (logged out); initialization must never hang.
            } finally {
                initialized.value = true
            }
        })()

        return initPromise
    }

    /**
     * Creates a new account. When email confirmation is enabled on the
     * project, `needsConfirmation` is true and no session is established
     * until the user clicks the link from the email.
     *
     * @param {{ email: string, password: string }} credentials
     * @returns {Promise<{ ok: boolean, needsConfirmation?: boolean, error?: string }>}
     */
    async function register({ email, password }) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            })

            if (error) {
                return { ok: false, error: getAuthErrorMessage(error) }
            }

            // `session` is null when email confirmation is required.
            if (!data.session) {
                return { ok: true, needsConfirmation: true }
            }

            // Session established right away (confirmation disabled on project).
            return { ok: true, needsConfirmation: false }
        } catch (err) {
            return { ok: false, error: getAuthErrorMessage(err) }
        }
    }

    /**
     * Signs in with email and password.
     *
     * @param {{ email: string, password: string }} credentials
     * @returns {Promise<{ ok: boolean, error?: string, errorCode?: string }>}
     */
    async function login({ email, password }) {
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                const errorCode =
                    error.code ||
                    (/email not confirmed/i.test(error.message || '')
                        ? 'email_not_confirmed'
                        : '')
                return {
                    ok: false,
                    error: getAuthErrorMessage(error),
                    errorCode,
                }
            }

            return { ok: true }
        } catch (err) {
            return { ok: false, error: getAuthErrorMessage(err) }
        }
    }

    /**
     * Signs out. Local state is always cleared (even on network failure)
     * so the user is never stuck in a half-logged-in state.
     *
     * @returns {Promise<{ ok: boolean, error?: string }>}
     */
    async function logout() {
        let error = null

        try {
            const result = await supabase.auth.signOut()
            error = result.error
        } catch (err) {
            error = err
        } finally {
            // With the default `global` scope auth-js only removes the
            // stored session after a successful server revocation. If that
            // failed (network), fall back to a local sign-out so this
            // device stays signed out after a reload.
            if (error) {
                try {
                    await supabase.auth.signOut({ scope: 'local' })
                } catch {
                    // Ignore — state is cleared below regardless.
                }
            }

            // Ensure local state is cleared even if every attempt failed;
            // the SIGNED_OUT event normally handles this as well.
            session.value = null
            user.value = null
        }

        if (error) {
            return { ok: false, error: getAuthErrorMessage(error) }
        }

        return { ok: true }
    }

    /**
     * Re-sends the confirmation email.
     *
     * @param {string} email
     * @returns {Promise<{ ok: boolean, error?: string }>}
     */
    async function resendConfirmation(email) {
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email,
            })

            if (error) {
                return { ok: false, error: getAuthErrorMessage(error) }
            }

            return { ok: true }
        } catch (err) {
            return { ok: false, error: getAuthErrorMessage(err) }
        }
    }

    return {
        user,
        session,
        initialized,
        isAuthenticated,
        initialize,
        register,
        login,
        logout,
        resendConfirmation,
    }
})
