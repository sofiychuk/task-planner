<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AuthAlert from '../../components/auth/AuthAlert.vue'
import AuthCard from '../../components/auth/AuthCard.vue'
import FormField from '../../components/auth/FormField.vue'
import AppSpinner from '../../components/ui/AppSpinner.vue'
import { useResendCooldown } from '../../composables/useResendCooldown'
import { getSafeRedirectPath } from '../../lib/auth-redirect'
import { validateEmail } from '../../lib/validation'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const email = ref('')
const emailError = ref('')
const formError = ref('')
const sentEmail = ref('')
const sent = ref(false)
const { secondsLeft, isCoolingDown, start } = useResendCooldown()
const redirectTarget = computed(() => getSafeRedirectPath(route.query.redirect))
const loginLink = computed(() => ({
  name: 'login',
  query: redirectTarget.value === '/' ? {} : { redirect: redirectTarget.value },
}))
const isSubmitting = computed(() => auth.pendingAction === 'resetPassword')

watch(email, () => {
  emailError.value = ''
  formError.value = ''
})

async function handleSubmit() {
  if (auth.isBusy || isCoolingDown.value) return
  formError.value = ''
  const targetEmail = sent.value ? sentEmail.value : email.value.trim()
  emailError.value = validateEmail(targetEmail)
  if (emailError.value) {
    document.getElementById('forgot-email')?.focus()
    return
  }

  const result = await auth.requestPasswordReset({
    email: targetEmail,
    redirectTo: redirectTarget.value,
  })
  if (!result.ok) {
    formError.value = result.message
    return
  }

  sentEmail.value = targetEmail
  sent.value = true
  start()
}

async function editEmail() {
  sent.value = false
  formError.value = ''
  await nextTick()
  document.getElementById('forgot-email')?.focus()
}
</script>

<template>
  <AuthCard
    title="Відновлення пароля"
    :subtitle="sent ? 'Перевірте пошту, щоб продовжити.' : 'Введіть email свого акаунта, і ми надішлемо посилання для створення нового пароля.'"
  >
    <form class="space-y-5" novalidate :aria-busy="isSubmitting" @submit.prevent="handleSubmit">
      <AuthAlert v-if="formError" :message="formError" />
      <template v-if="sent">
        <AuthAlert
          variant="success"
          :message="`Якщо акаунт з адресою ${sentEmail} існує, лист із посиланням для відновлення пароля надійде протягом кількох хвилин.`"
        />
        <p class="text-sm leading-relaxed text-slate-600">
          Перевірте вхідні та теку «Спам». Відкрийте посилання в листі, щоб створити новий пароль.
        </p>
      </template>
      <FormField
        v-else
        id="forgot-email"
        v-model="email"
        label="Email"
        type="email"
        autocomplete="email"
        inputmode="email"
        autocapitalize="none"
        :spellcheck="false"
        placeholder="you@example.com"
        :error="emailError"
        :disabled="auth.isBusy"
        required
      />
      <button
        type="submit"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="auth.isBusy || isCoolingDown"
        :aria-busy="isSubmitting"
      >
        <AppSpinner v-if="isSubmitting" class="size-4" label="Надсилаємо лист" />
        <template v-if="isSubmitting">Надсилаємо…</template>
        <template v-else-if="isCoolingDown">Надіслати ще раз через {{ secondsLeft }} с</template>
        <template v-else>{{ sent ? 'Надіслати лист ще раз' : 'Надіслати посилання' }}</template>
      </button>
      <button
        v-if="sent"
        type="button"
        class="block w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
        :disabled="auth.isBusy"
        @click="editEmail"
      >
        Ввести іншу адресу
      </button>
    </form>
    <template #footer>
      <RouterLink :to="loginLink" class="font-medium text-blue-600 hover:text-blue-700">
        Повернутися до входу
      </RouterLink>
    </template>
  </AuthCard>
</template>
