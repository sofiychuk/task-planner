import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'
import { getSafeRedirectPath } from '../lib/auth-redirect'
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
