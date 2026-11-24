<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthAlert from './components/auth/AuthAlert.vue'
import AppHeader from './components/layout/AppHeader.vue'
import AppSpinner from './components/ui/AppSpinner.vue'
import { getSafeRedirectPath } from './lib/auth-redirect'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const logoutError = ref('')

const isAuthLayout = computed(() => route.meta.layout === 'auth')
const showHeader = computed(() => auth.isAuthenticated && !isAuthLayout.value)
const isLoggingOut = computed(() => auth.pendingAction === 'signOut')

const mainClasses = computed(() =>
  isAuthLayout.value
    ? 'mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10 sm:py-16'
    : 'mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8',
)

async function handleLogout() {
  if (isLoggingOut.value) return

  logoutError.value = ''
  const result = await auth.signOut()

  if (!result.ok) {
    logoutError.value = result.message
    return
  }

  await router.replace({ name: 'login' })
}

// Covers session expiry, sign-out or sign-in in another tab while the page is open.
watch(
  () => auth.isAuthenticated,
  (authenticated) => {
    if (!auth.isReady) return

    if (authenticated && route.meta.guestOnly) {
      router.replace(getSafeRedirectPath(route.query.redirect))
      return
    }

    if (!authenticated && route.meta.requiresAuth) {
      router.replace({ name: 'login', query: { redirect: getSafeRedirectPath(route.fullPath) } })
    }
  },
)
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <div v-if="!auth.isReady" class="grid min-h-screen place-items-center px-4">
      <div class="flex items-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
        <AppSpinner class="size-5 text-blue-600" label="Завантажуємо планер" />
        Завантажуємо планер…
      </div>
    </div>

    <template v-else>
      <AppHeader
        v-if="showHeader"
        :email="auth.user?.email || ''"
        :is-logging-out="isLoggingOut"
        @logout="handleLogout"
      />

      <div v-if="logoutError" class="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <AuthAlert :message="logoutError" />
      </div>

      <main :class="mainClasses">
        <RouterView />
      </main>
    </template>
  </div>
</template>
