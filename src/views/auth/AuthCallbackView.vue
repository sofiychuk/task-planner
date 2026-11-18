<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthAlert from '../../components/auth/AuthAlert.vue'
import AuthCard from '../../components/auth/AuthCard.vue'
import AppSpinner from '../../components/ui/AppSpinner.vue'
import { getSafeRedirectPath, getCapturedAuthState } from '../../lib/auth-redirect'
import { getAuthErrorMessage } from '../../lib/auth-errors'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const status = ref('loading')
const message = ref('')

let redirectTimer = null

const redirectTarget = computed(() => getSafeRedirectPath(route.query.redirect))

const requestedRedirect = computed(() => (redirectTarget.value === '/' ? '' : redirectTarget.value))

const loginLink = computed(() =>
  requestedRedirect.value
    ? { name: 'login', query: { redirect: requestedRedirect.value } }
    : { name: 'login' },
)

const registerLink = computed(() =>
  requestedRedirect.value
    ? { name: 'register', query: { redirect: requestedRedirect.value } }
    : { name: 'register' },
)

function goToTarget() {
  if (redirectTimer) {
    clearTimeout(redirectTimer)
    redirectTimer = null
  }

  router.replace(redirectTarget.value)
}

async function processCallback() {
  const captured = getCapturedAuthState()

  if (captured.errorCode || captured.errorDescription) {
    status.value = 'error'
    message.value = getAuthErrorMessage({
      code: captured.errorCode,
      message: captured.errorDescription,
    })
    return
  }

  await auth.initialize()

  if (!auth.isAuthenticated && captured.tokenHash) {
    const result = await auth.confirmEmailToken({
      tokenHash: captured.tokenHash,
      type: captured.type || 'signup',
    })

    if (!result.ok) {
      status.value = 'error'
      message.value = result.message
      return
    }
  }

  if (!auth.isAuthenticated) {
    status.value = 'error'
    message.value = getAuthErrorMessage({ code: 'otp_expired' })
    return
  }

  status.value = 'success'
  redirectTimer = setTimeout(goToTarget, 1200)
}

onMounted(processCallback)

onBeforeUnmount(() => {
  if (redirectTimer) clearTimeout(redirectTimer)
})
</script>

<template>
  <AuthCard
    v-if="status === 'loading'"
    title="Підтвердження email"
    subtitle="Перевіряємо посилання. Це займає лише кілька секунд."
  >
    <div class="flex items-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
      <AppSpinner class="size-5 text-blue-600" label="Підтверджуємо email" />
      Підтверджуємо email…
    </div>
  </AuthCard>

  <AuthCard
    v-else-if="status === 'success'"
    title="Email підтверджено"
    subtitle="Акаунт активовано. Зараз перейдемо до планеру."
  >
    <div class="space-y-5">
      <AuthAlert variant="success" message="Все готово. Ласкаво просимо!" />

      <button
        type="button"
        class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        @click="goToTarget"
      >
        Продовжити
      </button>
    </div>
  </AuthCard>

  <AuthCard
    v-else
    title="Не вдалося підтвердити email"
    subtitle="Посилання могло прострочитися або вже бути використаним."
  >
    <div class="space-y-5">
      <AuthAlert :message="message" />

      <RouterLink
        :to="loginLink"
        class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Увійти
      </RouterLink>

      <RouterLink
        :to="registerLink"
        class="block text-center text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Зареєструватися повторно
      </RouterLink>
    </div>
  </AuthCard>
</template>
