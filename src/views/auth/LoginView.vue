<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthAlert from '../../components/auth/AuthAlert.vue'
import AuthCard from '../../components/auth/AuthCard.vue'
import FormField from '../../components/auth/FormField.vue'
import PasswordField from '../../components/auth/PasswordField.vue'
import AppSpinner from '../../components/ui/AppSpinner.vue'
import { useResendCooldown } from '../../composables/useResendCooldown'
import { getSafeRedirectPath } from '../../lib/auth-redirect'
import { validateEmail } from '../../lib/validation'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const fieldErrors = ref({ email: '', password: '' })
const formError = ref('')
const formSuccess = ref('')
const canResend = ref(false)

const { secondsLeft, isCoolingDown, start: startCooldown } = useResendCooldown()

const requestedRedirect = computed(() => {
  const raw = route.query.redirect
  if (typeof raw !== 'string') return ''

  const safe = getSafeRedirectPath(raw, '')
  return safe === '/' ? '' : safe
})

const redirectTarget = computed(() => requestedRedirect.value || '/')

const registerLink = computed(() =>
  requestedRedirect.value
    ? { name: 'register', query: { redirect: requestedRedirect.value } }
    : { name: 'register' },
)

const isSubmitting = computed(() => auth.pendingAction === 'signIn')
const forgotLink = computed(() => ({
  name: 'forgot-password',
  query: requestedRedirect.value ? { redirect: requestedRedirect.value } : {},
}))
const isResending = computed(() => auth.pendingAction === 'resend')

watch(email, () => {
  if (fieldErrors.value.email) fieldErrors.value = { ...fieldErrors.value, email: '' }
  if (formError.value) formError.value = ''
  if (canResend.value) canResend.value = false
})

watch(password, () => {
  if (fieldErrors.value.password) fieldErrors.value = { ...fieldErrors.value, password: '' }
  if (formError.value) formError.value = ''
})

function focusField(id) {
  document.getElementById(id)?.focus()
}

async function handleSubmit() {
  if (auth.isBusy) return

  formError.value = ''
  formSuccess.value = ''
  canResend.value = false

  const trimmedEmail = email.value.trim()
  const nextErrors = {
    email: validateEmail(trimmedEmail),
    password: password.value ? '' : 'Введіть пароль.',
  }
  fieldErrors.value = nextErrors

  if (nextErrors.email) {
    focusField('login-email')
    return
  }

  if (nextErrors.password) {
    focusField('login-password')
    return
  }

  const result = await auth.signIn({ email: trimmedEmail, password: password.value })

  if (!result.ok) {
    formError.value = result.message
    canResend.value = result.code === 'email_not_confirmed'
    return
  }

  await router.replace(redirectTarget.value)
}

async function handleResend() {
  if (auth.isBusy || isCoolingDown.value) return

  const trimmedEmail = email.value.trim()
  const emailError = validateEmail(trimmedEmail)

  if (emailError) {
    fieldErrors.value = { ...fieldErrors.value, email: emailError }
    focusField('login-email')
    return
  }

  formError.value = ''
  formSuccess.value = ''

  const result = await auth.resendConfirmation({
    email: trimmedEmail,
    redirectTo: redirectTarget.value,
  })

  if (!result.ok) {
    formError.value = result.message
    return
  }

  startCooldown()
  formSuccess.value = `Лист із підтвердженням надіслано на ${trimmedEmail}.`
}
</script>

<template>
  <AuthCard title="Вхід" subtitle="Увійдіть, щоб продовжити роботу з планером.">
    <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <AuthAlert v-if="formError" :message="formError" />
      <AuthAlert v-if="formSuccess" variant="success" :message="formSuccess" />

      <FormField
        id="login-email"
        v-model="email"
        label="Email"
        type="email"
        autocomplete="email"
        inputmode="email"
        autocapitalize="none"
        :spellcheck="false"
        placeholder="you@example.com"
        :error="fieldErrors.email"
        :disabled="isSubmitting"
        required
      />

      <PasswordField
        id="login-password"
        v-model="password"
        label="Пароль"
        autocomplete="current-password"
        placeholder="Введіть пароль"
        :error="fieldErrors.password"
        :disabled="isSubmitting"
        required
      />

      <div class="text-right">
        <RouterLink :to="forgotLink" class="text-sm font-medium text-blue-600 hover:text-blue-700">
          Забули пароль?
        </RouterLink>
      </div>

      <button
        type="submit"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="auth.isBusy"
        :aria-busy="isSubmitting"
      >
        <AppSpinner v-if="isSubmitting" class="size-4" label="Виконуємо вхід" />
        {{ isSubmitting ? 'Входимо…' : 'Увійти' }}
      </button>

      <div v-if="canResend" class="text-center">
        <button
          type="button"
          class="text-sm font-medium text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
          :disabled="isResending || isCoolingDown"
          @click="handleResend"
        >
          <template v-if="isResending">Надсилаємо…</template>
          <template v-else-if="isCoolingDown">
            Надіслати ще раз можна через {{ secondsLeft }} с
          </template>
          <template v-else>Надіслати лист із підтвердженням ще раз</template>
        </button>
      </div>
    </form>

    <template #footer>
      Ще не маєте акаунта?
      <RouterLink :to="registerLink" class="font-medium text-blue-600 hover:text-blue-700">
        Зареєструватися
      </RouterLink>
    </template>
  </AuthCard>
</template>
