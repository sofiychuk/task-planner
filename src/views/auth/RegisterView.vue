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
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '../../lib/validation'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const confirmation = ref('')
const fieldErrors = ref({ email: '', password: '', confirmation: '' })
const formError = ref('')
const registeredEmail = ref('')
const isRegistered = ref(false)

const { secondsLeft, isCoolingDown, start: startCooldown } = useResendCooldown()

const requestedRedirect = computed(() => {
  const raw = route.query.redirect
  if (typeof raw !== 'string') return ''

  const safe = getSafeRedirectPath(raw, '')
  return safe === '/' ? '' : safe
})

const redirectTarget = computed(() => requestedRedirect.value || '/')

const loginLink = computed(() =>
  requestedRedirect.value
    ? { name: 'login', query: { redirect: requestedRedirect.value } }
    : { name: 'login' },
)

const isSubmitting = computed(() => auth.pendingAction === 'signUp')
const isResending = computed(() => auth.pendingAction === 'resend')

watch(email, () => {
  if (fieldErrors.value.email) fieldErrors.value = { ...fieldErrors.value, email: '' }
  if (formError.value) formError.value = ''
})

watch(password, () => {
  if (fieldErrors.value.password) fieldErrors.value = { ...fieldErrors.value, password: '' }
  if (fieldErrors.value.confirmation) {
    fieldErrors.value = { ...fieldErrors.value, confirmation: '' }
  }
  if (formError.value) formError.value = ''
})

watch(confirmation, () => {
  if (fieldErrors.value.confirmation) {
    fieldErrors.value = { ...fieldErrors.value, confirmation: '' }
  }
  if (formError.value) formError.value = ''
})

function focusField(id) {
  document.getElementById(id)?.focus()
}

async function handleSubmit() {
  if (auth.isBusy) return

  formError.value = ''

  const trimmedEmail = email.value.trim()
  const nextErrors = {
    email: validateEmail(trimmedEmail),
    password: validatePassword(password.value),
    confirmation: validatePasswordConfirmation(password.value, confirmation.value),
  }
  fieldErrors.value = nextErrors

  if (nextErrors.email) {
    focusField('register-email')
    return
  }

  if (nextErrors.password) {
    focusField('register-password')
    return
  }

  if (nextErrors.confirmation) {
    focusField('register-confirmation')
    return
  }

  const result = await auth.signUp({
    email: trimmedEmail,
    password: password.value,
    redirectTo: redirectTarget.value,
  })

  if (!result.ok) {
    formError.value = result.message
    return
  }

  if (!result.needsConfirmation) {
    await router.replace(redirectTarget.value)
    return
  }

  registeredEmail.value = result.email
  isRegistered.value = true
  startCooldown()
}

async function handleResend() {
  if (auth.isBusy || isCoolingDown.value) return

  formError.value = ''

  const result = await auth.resendConfirmation({
    email: registeredEmail.value,
    redirectTo: redirectTarget.value,
  })

  if (!result.ok) {
    formError.value = result.message
    return
  }

  startCooldown()
}
</script>

<template>
  <AuthCard
    v-if="isRegistered"
    title="Перевірте пошту"
    :subtitle="`Ми надіслали лист із посиланням для підтвердження на ${registeredEmail}.`"
  >
    <div class="space-y-5">
      <AuthAlert
        variant="success"
        message="Відкрийте лист і перейдіть за посиланням, щоб активувати акаунт."
      />

      <p class="text-sm leading-relaxed text-slate-600">
        Якщо листа немає, перевірте теку «Спам» або надішліть його ще раз.
      </p>

      <AuthAlert v-if="formError" :message="formError" />

      <button
        type="button"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isResending || isCoolingDown"
        :aria-busy="isResending"
        @click="handleResend"
      >
        <AppSpinner v-if="isResending" class="size-4" label="Надсилаємо лист" />
        <template v-if="isResending">Надсилаємо…</template>
        <template v-else-if="isCoolingDown">
          Надіслати ще раз через {{ secondsLeft }} с
        </template>
        <template v-else>Надіслати лист ще раз</template>
      </button>

      <RouterLink
        :to="loginLink"
        class="block text-center text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Повернутися до входу
      </RouterLink>
    </div>
  </AuthCard>

  <AuthCard
    v-else
    title="Реєстрація"
    subtitle="Створіть акаунт, щоб планувати свої завдання."
  >
    <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
      <AuthAlert v-if="formError" :message="formError" />

      <FormField
        id="register-email"
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
        id="register-password"
        v-model="password"
        label="Пароль"
        autocomplete="new-password"
        placeholder="Щонайменше 8 символів"
        hint="Мінімум 8 символів."
        :error="fieldErrors.password"
        :disabled="isSubmitting"
        :maxlength="72"
        required
      />

      <PasswordField
        id="register-confirmation"
        v-model="confirmation"
        label="Підтвердіть пароль"
        autocomplete="new-password"
        placeholder="Повторіть пароль"
        :error="fieldErrors.confirmation"
        :disabled="isSubmitting"
        :maxlength="72"
        required
      />

      <button
        type="submit"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="auth.isBusy"
        :aria-busy="isSubmitting"
      >
        <AppSpinner v-if="isSubmitting" class="size-4" label="Створюємо акаунт" />
        {{ isSubmitting ? 'Створюємо акаунт…' : 'Зареєструватися' }}
      </button>
    </form>

    <template #footer>
      Вже маєте акаунт?
      <RouterLink :to="loginLink" class="font-medium text-blue-600 hover:text-blue-700">
        Увійти
      </RouterLink>
    </template>
  </AuthCard>
</template>
