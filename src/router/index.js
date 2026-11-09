
import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import PlannerView from '../views/PlannerView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
    {
        path: '/',
        name: 'dashboard',
        component: DashboardView,
    },
    {
        path: '/planner',
        name: 'planner',
        component: PlannerView,
    },
    {
        path: '/settings',
        name: 'settings',
        component: SettingsView,
    },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
})

export default router
