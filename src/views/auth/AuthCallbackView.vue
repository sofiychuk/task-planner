<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthAlert from '../../components/auth/AuthAlert.vue'
import AuthCard from '../../components/auth/AuthCard.vue'
import AppSpinner from '../../components/ui/AppSpinner.vue'
import { getSafeRedirectPath, getCapturedAuthState, clearCapturedAuthState } from '../../lib/auth-redirect'
import { getAuthErrorMessage } from '../../lib/auth-errors'
import { useAuthStore } from '../../stores/auth'
import { useActiveView } from '../../composables/useActiveView'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const isActive = useActiveView()

const status = ref('loading')
const message = ref('')

const confirmedUserId = ref('')
const confirmedEmail = ref('')
const isConfirmedAccount = computed(() =>
  auth.isAuthenticated && auth.user?.id === confirmedUserId.value,
)

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
  if (isActive() && isConfirmedAccount.value) router.replace(redirectTarget.value)
}

async function processCallback() {
  const captured = getCapturedAuthState()
  const initialization = auth.initialize()
  // The URL is already clean. Consume captured credentials even on failure or
  // unmount, so a later view cannot accidentally reuse this operation.
  clearCapturedAuthState()
  try {
    await initialization
    if (!isActive()) return
    if (captured.errorCode || captured.errorDescription) {
      throw { code: captured.errorCode, message: captured.errorDescription }
    }
    if (captured.hasSessionTokens && auth.initializationError) {
      status.value = 'error'
      message.value = auth.initializationError
      return
    }
    let confirmedId = auth.incomingSessionUserId
    if (captured.tokenHash) {
      const type = captured.type || 'signup'
      if (!['signup', 'email', 'email_change', 'invite', 'magiclink'].includes(type)) {
        throw { code: 'otp_expired' }
      }
      const result = await auth.confirmEmailToken({ tokenHash: captured.tokenHash, type })
      if (!isActive()) return
      if (!result.ok) {
        status.value = 'error'
        message.value = result.message
        return
      }
      confirmedId = result.userId
    } else if (!captured.hasSessionTokens) {
      // An unrelated persisted session is not evidence of confirmation.
      throw { code: 'otp_expired' }
    }
    if (!auth.isAuthenticated || !confirmedId) throw { code: 'otp_expired' }
    if (auth.user.id !== confirmedId) throw { code: 'account_changed' }
    confirmedUserId.value = auth.user.id
    confirmedEmail.value = auth.user.email || ''
    status.value = 'success'
  } catch (error) {
    if (!isActive()) return
    status.value = 'error'
    message.value = getAuthErrorMessage(error)
  }
}

onMounted(processCallback)
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
    subtitle="Перевірте акаунт перед продовженням."
  >
    <div class="space-y-5">
      <AuthAlert variant="success" message="Все готово. Ласкаво просимо!" />
      <p class="break-words text-sm text-slate-600">
        Ви увійшли як <strong>{{ confirmedEmail || confirmedUserId }}</strong>.
      </p>
      <AuthAlert
        v-if="!isConfirmedAccount"
        message="Акаунт змінився. Відкрийте потрібне посилання ще раз."
      />

      <button
        type="button"
        :disabled="!isConfirmedAccount"
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
