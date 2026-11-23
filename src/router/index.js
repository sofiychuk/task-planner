import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'
import { consumeRecoveryRedirect, getSafeRedirectPath } from '../lib/auth-redirect'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'

const routes = [
    {
        path: '/',
        name: 'dashboard',
        component: DashboardView,
        meta: {
            requiresAuth: true,
            title: 'Dashboard',
        },
    },
    {
        path: '/planner',
        name: 'planner',
        component: PlannerView,
        meta: {
            requiresAuth: true,
            title: 'Мої завдання',
        },
    },
    {
        path: '/settings',
        name: 'settings',
        component: SettingsView,
        meta: {
            requiresAuth: true,
            title: 'Налаштування',
        },
    },
    {
        path: '/login',
        name: 'login',
        component: () => import('../views/auth/LoginView.vue'),
        meta: {
            guestOnly: true,
            layout: 'auth',
            title: 'Вхід',
        },
    },
    {
        path: '/register',
        name: 'register',
        component: () => import('../views/auth/RegisterView.vue'),
        meta: {
            guestOnly: true,
            layout: 'auth',
            title: 'Реєстрація',
        },
    },
    {
        path: '/forgot-password',
        name: 'forgot-password',
        component: () => import('../views/auth/ForgotPasswordView.vue'),
        meta: { layout: 'auth', title: 'Відновлення пароля' },
    },
    {
        path: '/auth/reset-password',
        name: 'reset-password',
        component: () => import('../views/auth/ResetPasswordView.vue'),
        meta: { layout: 'auth', title: 'Новий пароль' },
    },
    {
        path: '/auth/callback',
        name: 'auth-callback',
        component: () => import('../views/auth/AuthCallbackView.vue'),
        meta: {
            layout: 'auth',
            title: 'Підтвердження email',
        },
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/',
    },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
    const auth = useAuthStore(pinia)

    // Guards and the app shell share the same initialization promise, so a
    // reload with a persisted session never flashes the login page.
    await auth.initialize()

    // Recovery sessions are authenticated too: intercept before guest guards
    // and before the email-confirmation callback can redirect to the planner.
    const recovery = consumeRecoveryRedirect()
    if (to.name !== 'reset-password' &&
        (recovery || (to.name === 'auth-callback' && to.query.recovery === '1'))) {
        const redirect = getSafeRedirectPath(to.query.redirect)
        return { name: 'reset-password', query: redirect === '/' ? {} : { redirect }, replace: true }
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return {
            name: 'login',
            query: { redirect: to.fullPath },
        }
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
        return getSafeRedirectPath(to.query.redirect)
    }

    return true
})

router.afterEach((to) => {
    document.title = typeof to.meta.title === 'string' ? `${to.meta.title} — Planner` : 'Planner'
})

export default router
