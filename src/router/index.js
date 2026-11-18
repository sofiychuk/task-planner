import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '../stores/auth'
import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import NotFoundView from '../views/NotFoundView.vue'

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
        name: 'not-found',
        component: NotFoundView,
    },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
})

router.beforeEach(async (to) => {
    const auth = useAuthStore()

    // Одноразове відновлення сесії до першого рішення про редирект,
    // щоб не викидати користувача на логін під час завантаження застосунку.
    await auth.initialize()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } }
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
        return { name: 'dashboard' }
    }
})

export default router
