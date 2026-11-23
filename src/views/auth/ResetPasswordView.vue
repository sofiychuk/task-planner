<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthAlert from '../../components/auth/AuthAlert.vue'
import AuthCard from '../../components/auth/AuthCard.vue'
import PasswordField from '../../components/auth/PasswordField.vue'
import AppSpinner from '../../components/ui/AppSpinner.vue'
import { clearCapturedAuthState, getCapturedAuthState, getSafeRedirectPath } from '../../lib/auth-redirect'
import { getAuthErrorMessage } from '../../lib/auth-errors'
import { validatePassword, validatePasswordConfirmation } from '../../lib/validation'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const status = ref('loading')
const message = ref('')
const password = ref('')
const confirmation = ref('')
const fieldErrors = ref({ password: '', confirmation: '' })
const formError = ref('')
const redirectTarget = computed(() => getSafeRedirectPath(route.query.redirect))
const recoveryQuery = computed(() => redirectTarget.value === '/' ? {} : { redirect: redirectTarget.value })
const isSubmitting = computed(() => auth.pendingAction === 'updatePassword')
// Bind the form to the account that was verified, not a subsequent cross-tab login.
const recoveryUserId = ref('')
const recoveryEmail = ref('')

watch([password, confirmation], () => {
  fieldErrors.value = { password: '', confirmation: '' }
  formError.value = ''
})

watch(() => auth.user?.id, (id) => {
  if (status.value === 'form' && id !== recoveryUserId.value) {
    fail(getAuthErrorMessage({ code: 'otp_expired' }))
  }
})

function fail(errorMessage) {
  password.value = ''
  confirmation.value = ''
  message.value = errorMessage
  status.value = 'error'
}

async function processRecovery() {
  const captured = getCapturedAuthState()
  await auth.initialize()

  try {
    if (captured.errorCode || captured.errorDescription) {
      fail(getAuthErrorMessage({ code: captured.errorCode, message: captured.errorDescription }))
      return
    }
    if (captured.hasSessionTokens && auth.initializationError) {
      fail(auth.initializationError)
      return
    }
    // Always verify a token hash, even if another account already has a session.
    if (captured.tokenHash) {
      if (captured.type !== 'recovery') {
        fail(getAuthErrorMessage({ code: 'otp_expired' }))
        return
      }
      const result = await auth.confirmEmailToken({ tokenHash: captured.tokenHash, type: 'recovery' })
      if (!result.ok) {
        fail(result.message)
        return
      }
    }
    if (!auth.isAuthenticated) {
      fail(getAuthErrorMessage({ code: 'otp_expired' }))
      return
    }
    // Supabase recovery creates a normal session. Accept that persisted session
    // on reload too; Supabase remains the authority for password updates.
    recoveryUserId.value = auth.user.id
    recoveryEmail.value = auth.user.email || ''
    status.value = 'form'
  } finally {
    clearCapturedAuthState()
    // Replace rather than push so secrets/errors are not retained in the URL.
    await router.replace({ name: 'reset-password', query: recoveryQuery.value })
  }
}

async function handleSubmit() {
  if (auth.isBusy) return
  if (!auth.isAuthenticated || auth.user.id !== recoveryUserId.value) {
    fail(getAuthErrorMessage({ code: 'otp_expired' }))
    return
  }
  formError.value = ''
  fieldErrors.value = {
    password: validatePassword(password.value),
    confirmation: validatePasswordConfirmation(password.value, confirmation.value),
  }
  const firstInvalid = Object.keys(fieldErrors.value).find((key) => fieldErrors.value[key])
  if (firstInvalid) {
    document.getElementById(`reset-${firstInvalid}`)?.focus()
    return
  }
  const result = await auth.updatePassword({ password: password.value })
  if (!result.ok) {
    if (result.sessionMissing || !auth.isAuthenticated ||
        ['session_not_found', 'session_expired', 'refresh_token_not_found',
          'reauthentication_needed', 'reauthentication_not_valid'].includes(result.code)) {
      fail(result.message)
    } else {
      formError.value = result.message
    }
    return
  }
  password.value = ''
  confirmation.value = ''
  status.value = 'success'
}

onMounted(processRecovery)
</script>

<template>
  <AuthCard v-if="status === 'loading'" title="Новий пароль" subtitle="Перевіряємо посилання.">
    <div class="flex items-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
      <AppSpinner class="size-5 text-blue-600" label="Перевіряємо посилання" />
      Перевіряємо посилання…
    </div>
  </AuthCard>
  <AuthCard
    v-else-if="status === 'form'"
    title="Новий пароль"
    :subtitle="recoveryEmail ? `Створіть новий пароль для ${recoveryEmail}.` : 'Створіть новий пароль для свого акаунта.'"
  >
    <form class="space-y-5" novalidate :aria-busy="isSubmitting" @submit.prevent="handleSubmit">
      <AuthAlert v-if="formError" :message="formError" />
      <PasswordField
        id="reset-password"
        v-model="password"
        label="Новий пароль"
        autocomplete="new-password"
        placeholder="Щонайменше 8 символів"
        hint="Мінімум 8 символів."
        :error="fieldErrors.password"
        :disabled="auth.isBusy"
        :maxlength="72"
        required
      />
      <PasswordField
        id="reset-confirmation"
        v-model="confirmation"
        label="Підтвердіть новий пароль"
        autocomplete="new-password"
        placeholder="Повторіть пароль"
        :error="fieldErrors.confirmation"
        :disabled="auth.isBusy"
        :maxlength="72"
        required
      />
      <button
        type="submit"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="auth.isBusy"
        :aria-busy="isSubmitting"
      >
        <AppSpinner v-if="isSubmitting" class="size-4" label="Зберігаємо пароль" />
        {{ isSubmitting ? 'Зберігаємо…' : 'Зберегти новий пароль' }}
      </button>
    </form>
  </AuthCard>
  <AuthCard v-else-if="status === 'success'" title="Пароль оновлено" subtitle="Новий пароль збережено.">
    <div class="space-y-5">
      <AuthAlert variant="success" message="Готово! Використовуйте новий пароль для наступного входу." />
      <RouterLink
        :to="redirectTarget"
        replace
        class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Продовжити
      </RouterLink>
    </div>
  </AuthCard>
  <AuthCard v-else title="Не вдалося відновити пароль" subtitle="Запросіть новий лист і відкрийте посилання ще раз.">
    <div class="space-y-5">
      <AuthAlert :message="message" />
      <RouterLink
        :to="{ name: 'forgot-password', query: recoveryQuery }"
        class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Запросити нове посилання
      </RouterLink>
      <RouterLink
        :to="{ name: 'login', query: recoveryQuery }"
        class="block text-center text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Повернутися до входу
      </RouterLink>
    </div>
  </AuthCard>
</template>
