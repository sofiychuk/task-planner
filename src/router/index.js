
import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
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
                return getSafeRedirect(query.redirect)
            }
            return { name: 'login', query: { ...query, confirmFailed: '1' } }
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
