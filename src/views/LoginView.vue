<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getSafeRedirect } from '../lib/redirect'
import AppAlert from '../components/AppAlert.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const errorCode = ref('')
const notice = ref('')
const submitting = ref(false)
const resending = ref(false)

// Set by the router guard when a PKCE email-confirmation exchange failed
// (e.g. the link was opened in a different browser than the one used to
// register).
const confirmFailed = computed(() => route.query.confirmFailed === '1')

const redirectQuery = computed(() =>
  typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {}
)

const showResend = computed(() => errorCode.value === 'email_not_confirmed')

function validate() {
  const trimmedEmail = email.value.trim()

  if (!trimmedEmail) {
    return 'Введіть email.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Введіть коректну адресу електронної пошти.'
  }
  if (!password.value) {
    return 'Введіть пароль.'
  }
  return ''
}

async function onSubmit() {
  error.value = ''
  errorCode.value = ''
  notice.value = ''

  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  submitting.value = true
  try {
    const result = await auth.login({
      email: email.value.trim(),
      password: password.value,
    })

    if (!result.ok) {
      error.value = result.error
      errorCode.value = result.errorCode || ''
      return
    }

    await router.replace(getSafeRedirect(route.query.redirect))
  } finally {
    submitting.value = false
  }
}

async function onResend() {
  error.value = ''
  errorCode.value = ''
  notice.value = ''

  resending.value = true
  try {
    const result = await auth.resendConfirmation(email.value.trim())
    if (!result.ok) {
      error.value = result.error
      return
    }
    notice.value = 'Лист підтвердження надіслано ще раз. Перевірте пошту.'
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md text-left">
    <h1 class="text-3xl font-bold">Увійти</h1>
    <p class="mt-2 text-slate-500">
      Увійдіть, щоб продовжити роботу з планувальником.
    </p>

    <AppAlert v-if="confirmFailed" type="error" class="mt-4">
      Не вдалося підтвердити пошту. Відкрийте лист підтвердження в тому самому
      браузері, у якому реєструвалися.
    </AppAlert>

    <form class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
      <AppAlert v-if="error" type="error">{{ error }}</AppAlert>
      <AppAlert v-if="notice" type="success">{{ notice }}</AppAlert>

      <div>
        <label for="email" class="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          placeholder="you@example.com"
          :disabled="submitting"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-slate-700">
          Пароль
        </label>
        <input
          id="password"
          v-model="password"
          type="password"
          name="password"
          autocomplete="current-password"
          placeholder="••••••••"
          :disabled="submitting"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
        />
      </div>

      <button
        type="submit"
        :disabled="submitting"
        class="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LoadingSpinner v-if="submitting" class="mr-2 text-white" />
        {{ submitting ? 'Вхід…' : 'Увійти' }}
      </button>

      <button
        v-if="showResend"
        type="button"
        :disabled="resending"
        class="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        @click="onResend"
      >
        <LoadingSpinner v-if="resending" class="mr-2" />
        {{ resending ? 'Надсилаємо…' : 'Надіслати лист підтвердження ще раз' }}
      </button>
    </form>

    <p class="mt-6 text-sm text-slate-600">
      Ще не маєте акаунту?
      <RouterLink
        :to="{ name: 'register', query: redirectQuery }"
        class="font-medium text-blue-600 hover:underline"
      >
        Зареєструватися
      </RouterLink>
    </p>
  </section>
</template>
