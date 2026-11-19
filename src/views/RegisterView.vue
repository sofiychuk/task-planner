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
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)
const resending = ref(false)
const resendNotice = ref('')

// true after signUp succeeded and email confirmation is required
const confirmationSent = ref(false)

const redirectQuery = computed(() =>
  typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {}
)

function validate() {
  const trimmedEmail = email.value.trim()

  if (!trimmedEmail) {
    return 'Введіть email.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Введіть коректну адресу електронної пошти.'
  }
  if (password.value.length < 6) {
    return 'Пароль має містити щонайменше 6 символів.'
  }
  if (password.value !== confirmPassword.value) {
    return 'Паролі не збігаються.'
  }
  return ''
}

async function onSubmit() {
  error.value = ''
  resendNotice.value = ''

  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  submitting.value = true
  try {
    const result = await auth.register({
      email: email.value.trim(),
      password: password.value,
    })

    if (!result.ok) {
      error.value = result.error
      return
    }

    if (result.needsConfirmation) {
      confirmationSent.value = true
      return
    }

    // Email confirmation is disabled on the project — session already
    // established, continue to the originally requested page.
    await router.replace(getSafeRedirect(route.query.redirect))
  } finally {
    submitting.value = false
  }
}

async function onResend() {
  error.value = ''
  resendNotice.value = ''

  resending.value = true
  try {
    const result = await auth.resendConfirmation(email.value.trim())
    if (!result.ok) {
      error.value = result.error
      return
    }
    resendNotice.value = 'Лист підтвердження надіслано ще раз. Перевірте пошту.'
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md text-left">
    <h1 class="text-3xl font-bold">Реєстрація</h1>
    <p class="mt-2 text-slate-500">
      Створіть акаунт, щоб почати планувати завдання.
    </p>

    <!-- Success state: confirmation email sent -->
    <div v-if="confirmationSent" class="mt-6 space-y-4">
      <AppAlert type="success">
        Ми надіслали лист для підтвердження на
        <span class="font-medium">{{ email.trim() }}</span>.
        Перевірте пошту та перейдіть за посиланням з листа.
      </AppAlert>

      <AppAlert v-if="error" type="error">{{ error }}</AppAlert>
      <AppAlert v-if="resendNotice" type="info">{{ resendNotice }}</AppAlert>

      <button
        type="button"
        :disabled="resending"
        class="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        @click="onResend"
      >
        <LoadingSpinner v-if="resending" class="mr-2" />
        {{ resending ? 'Надсилаємо…' : 'Надіслати лист ще раз' }}
      </button>

      <p class="text-sm text-slate-600">
        Маєте акаунт?
        <RouterLink
          :to="{ name: 'login', query: redirectQuery }"
          class="font-medium text-blue-600 hover:underline"
        >
          Увійти
        </RouterLink>
      </p>
    </div>

    <!-- Registration form -->
    <form v-else class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
      <AppAlert v-if="error" type="error">{{ error }}</AppAlert>

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
          name="new-password"
          autocomplete="new-password"
          placeholder="Щонайменше 6 символів"
          :disabled="submitting"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
        />
      </div>

      <div>
        <label
          for="confirm-password"
          class="block text-sm font-medium text-slate-700"
        >
          Повторіть пароль
        </label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          name="new-password"
          autocomplete="new-password"
          placeholder="Ще раз пароль"
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
        {{ submitting ? 'Створюємо акаунт…' : 'Зареєструватися' }}
      </button>
    </form>

    <p v-if="!confirmationSent" class="mt-6 text-sm text-slate-600">
      Вже маєте акаунт?
      <RouterLink
        :to="{ name: 'login', query: redirectQuery }"
        class="font-medium text-blue-600 hover:underline"
      >
        Увійти
      </RouterLink>
    </p>
  </section>
</template>
