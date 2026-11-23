import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { getAuthErrorMessage } from '../lib/authErrors'

/**
 * Marker written when a password-reset email is requested. The recovery
 * link returns to `window.location.origin` (the same value `register`
 * uses), so the URL alone cannot tell the router that a page load is a
 * password-recovery callback: the PKCE exchange may strip `code` from the
 * URL before vue-router parses the initial location, and the
 * `PASSWORD_RECOVERY` event may fire before this store subscribes. A
 * marker in localStorage (shared across tabs, survives the email round
 * trip) is the only signal present in every case.
 */
const RECOVERY_REQUEST_KEY = 'planner:password-recovery-request'
const RECOVERY_REQUEST_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Records that a password-reset email was requested in this browser.
 * Never throws — with storage unavailable the flow degrades to "no marker".
 */
function markRecoveryRequested() {
    try {
        window.localStorage.setItem(
            RECOVERY_REQUEST_KEY,
            JSON.stringify({ at: Date.now() })
        )
    } catch {
        // Ignore — marker is optional.
    }
}

/**
 * Whether a password-reset email was requested recently (within TTL).
 * Expired markers are removed as a side effect.
 *
 * @returns {boolean}
 */
function hasRecentRecoveryRequest() {
    try {
        const raw = window.localStorage.getItem(RECOVERY_REQUEST_KEY)
        if (!raw) {
            return false
        }
        const at = JSON.parse(raw)?.at
        if (typeof at !== 'number' || Date.now() - at > RECOVERY_REQUEST_TTL_MS) {
            window.localStorage.removeItem(RECOVERY_REQUEST_KEY)
            return false
        }
        return true
    } catch {
        return false
    }
}

/**
 * Discards the password-reset marker (consumed by the router when the
 * recovery landing is handled, or by login/register so a later normal
 * sign-in is never mistaken for a recovery callback).
 */
function clearRecoveryRequest() {
    try {
        window.localStorage.removeItem(RECOVERY_REQUEST_KEY)
    } catch {
        // Ignore — the marker expires on its own.
    }
}

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
                clearRecoveryRequest()
                return { ok: true, needsConfirmation: true }
            }

            // Session established right away (confirmation disabled on project).
            clearRecoveryRequest()
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

            // A normal sign-in supersedes any pending password-reset request,
            // so the next page load is never treated as a recovery landing.
            clearRecoveryRequest()
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

    /**
     * Requests a password-reset email. The marker is written *before* the
     * network call so the landing can still be recognized as a recovery
     * callback even if the response is lost after the email was queued.
     * Supabase does not reveal whether the address exists (anti-enumeration):
     * `ok` only means the request was accepted.
     *
     * @param {string} email
     * @returns {Promise<{ ok: boolean, error?: string }>}
     */
    async function requestPasswordReset(email) {
        markRecoveryRequested()

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                // Same value as `register` — works with whatever is already
                // allowed in the project's Redirect URLs list.
                emailRedirectTo: window.location.origin,
            })

            if (error) {
                return { ok: false, error: getAuthErrorMessage(error) }
            }

            return { ok: true }
        } catch (err) {
            return { ok: false, error: getAuthErrorMessage(err) }
        }
    }

    /**
     * Sets a new password for the currently signed-in user. Used from the
     * password-recovery page, where the recovery link has already
     * established a session via the PKCE exchange.
     *
     * @param {string} password
     * @returns {Promise<{ ok: boolean, error?: string }>}
     */
    async function updatePassword(password) {
        try {
            const { error } = await supabase.auth.updateUser({ password })

            if (error) {
                return { ok: false, error: getAuthErrorMessage(error) }
            }

            clearRecoveryRequest()
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
        requestPasswordReset,
        updatePassword,
        hasRecentRecoveryRequest,
        clearRecoveryRequest,
    }
})
