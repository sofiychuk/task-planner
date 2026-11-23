
import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import { useAuthStore } from '../stores/auth'
import { getSafeRedirect } from '../lib/redirect'

const routes = [
    {
        path: '/',
        name: 'dashboard',
        component: DashboardView,
        meta: { requiresAuth: true },
    },
    {
        path: '/planner',
        name: 'planner',
        component: PlannerView,
        meta: { requiresAuth: true },
    },
    {
        path: '/settings',
        name: 'settings',
        component: SettingsView,
        meta: { requiresAuth: true },
    },
    {
        path: '/login',
        name: 'login',
        component: LoginView,
        meta: { guestOnly: true },
    },
    {
        path: '/register',
        name: 'register',
        component: RegisterView,
        meta: { guestOnly: true },
    },
    {
        path: '/forgot-password',
        name: 'forgot-password',
        component: ForgotPasswordView,
        meta: { guestOnly: true },
    },
    {
        // Deliberately public: an expired/foreign recovery link must land
        // here with a friendly "invalid link" state instead of being
        // bounced to /login by the guard.
        path: '/reset-password',
        name: 'reset-password',
        component: ResetPasswordView,
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/',
    },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
})

// The PKCE exchange only ever happens during the initial full page load,
// so the leftover-params check must not run on later in-app navigations
// (a future route could legitimately use `code`/`error` query params).
let isFirstNavigation = true

router.beforeEach(async (to) => {
    // Must be called inside the guard (not at module top level) so that
    // Pinia is already installed.
    const auth = useAuthStore()

    // Waits until the stored session has been restored — prevents a
    // logged-in user from being redirected to /login on a hard reload.
    await auth.initialize()

    if (isFirstNavigation) {
        isFirstNavigation = false

        const query = { ...to.query }

        // A recent password-reset request in this browser identifies the
        // landing as a password-recovery callback. Needed because `code` may
        // already be gone from the URL (auth-js strips it as soon as the
        // exchange succeeds, possibly before this navigation was parsed).
        const recoveryRequested = auth.hasRecentRecoveryRequest()

        // auth-js removes `code` from the URL only after a *successful* PKCE
        // exchange, so a leftover code here means the exchange failed (e.g.
        // the confirmation link was opened in a different browser). GoTrue may
        // also bounce back with `error` params (expired/invalid link).
        const exchangeFailed = 'code' in query || 'error' in query
        if (exchangeFailed) {
            delete query.code
            delete query.sb_flow_id
            delete query.error
            delete query.error_code
            delete query.error_description

            if (auth.isAuthenticated) {
                // Successful exchange: either an email confirmation or a
                // password recovery — the marker tells them apart.
                if (recoveryRequested) {
                    auth.clearRecoveryRequest()
                    return { name: 'reset-password' }
                }
                return getSafeRedirect(query.redirect)
            }

            // Failed exchange: a recovery landing gets its own message and
            // a direct path to requesting a fresh link.
            if (recoveryRequested) {
                auth.clearRecoveryRequest()
                return { name: 'forgot-password', query: { recoveryFailed: '1' } }
            }
            return { name: 'login', query: { ...query, confirmFailed: '1' } }
        }

        // No auth params in the URL: the exchange may have completed and
        // cleaned the URL before this navigation was parsed — the recovery
        // marker is then the only remaining signal.
        if (
            recoveryRequested &&
            auth.isAuthenticated &&
            to.name !== 'reset-password'
        ) {
            auth.clearRecoveryRequest()
            return { name: 'reset-password' }
        }
    }

    const isAuthed = auth.isAuthenticated

    if (to.meta.requiresAuth && !isAuthed) {
        // Remember the originally requested page and restore it after login.
        return { name: 'login', query: { redirect: to.fullPath } }
    }

    if (to.meta.guestOnly && isAuthed) {
        // Never redirect back to a guest-only page (prevents loops).
        return getSafeRedirect(to.query.redirect)
    }
})

export default router
