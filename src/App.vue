<script setup>
import { useRouter } from 'vue-router'

import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function handleSignOut() {
    try {
        await auth.signOut()
        router.push({ name: 'login' })
    } catch (error) {
        console.error('Не вдалося вийти:', error.message)
    }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="border-b border-slate-200 bg-white">
      <nav class="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <RouterLink to="/" class="font-bold">
          Planner
        </RouterLink>

        <template v-if="auth.ready && auth.isAuthenticated">
          <RouterLink to="/planner" class="hover:text-blue-600">
            Мої завдання
          </RouterLink>

          <RouterLink to="/settings" class="hover:text-blue-600">
            Налаштування
          </RouterLink>

          <div class="ml-auto flex items-center gap-4">
            <span class="text-sm text-slate-500">{{ auth.user?.email }}</span>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              @click="handleSignOut"
            >
              Вийти
            </button>
          </div>
        </template>

        <template v-else-if="auth.ready">
          <div class="ml-auto flex items-center gap-4">
            <RouterLink to="/login" class="hover:text-blue-600">
              Увійти
            </RouterLink>
            <RouterLink
              to="/register"
              class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              Зареєструватися
            </RouterLink>
          </div>
        </template>
      </nav>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
