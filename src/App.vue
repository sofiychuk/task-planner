<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppAlert from './components/AppAlert.vue'
import LoadingSpinner from './components/LoadingSpinner.vue'

const router = useRouter()
const auth = useAuthStore()

const loggingOut = ref(false)
const logoutError = ref('')

// Enforce protection when the session disappears while a protected page
// is open: logout in another tab, revoked/expired token, failed refresh.
watch(
  () => auth.isAuthenticated,
  (isAuthed) => {
    if (isAuthed) return
    const current = router.currentRoute.value
    if (current.meta.requiresAuth) {
      router.replace({ name: 'login', query: { redirect: current.fullPath } })
    }
  }
)

async function onLogout() {
  logoutError.value = ''
  loggingOut.value = true
  try {
    const result = await auth.logout()

    if (!result.ok) {
      // Local state is already cleared by the store, so the
      // `isAuthenticated` watcher above navigates to /login where this
      // warning stays visible in the header.
      logoutError.value = result.error
    }
    // On success the same watcher performs the navigation to /login —
    // a single navigation path avoids racing redirects.
  } finally {
    loggingOut.value = false
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

        <!-- Wait for the initial session before rendering auth-dependent
             links to avoid flashing the wrong state on page load. -->
        <template v-if="auth.initialized">
          <template v-if="auth.isAuthenticated">
            <RouterLink to="/planner" class="hover:text-blue-600">
              Мої завдання
            </RouterLink>

            <RouterLink to="/settings" class="hover:text-blue-600">
              Налаштування
            </RouterLink>

            <span class="ml-auto max-w-40 truncate text-sm text-slate-500">
              {{ auth.user?.email }}
            </span>

            <button
              type="button"
              :disabled="loggingOut"
              class="flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              @click="onLogout"
            >
              <LoadingSpinner v-if="loggingOut" class="mr-2" />
              {{ loggingOut ? 'Вихід…' : 'Вийти' }}
            </button>
          </template>

          <template v-else>
            <RouterLink to="/login" class="hover:text-blue-600">
              Увійти
            </RouterLink>

            <RouterLink to="/register" class="hover:text-blue-600">
              Реєстрація
            </RouterLink>
          </template>
        </template>

        <LoadingSpinner
          v-else
          class="ml-auto text-slate-400"
        />
      </nav>

      <div v-if="logoutError" class="mx-auto max-w-6xl px-6 pb-3">
        <AppAlert type="error">{{ logoutError }}</AppAlert>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
