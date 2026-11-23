<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppAlert from '../components/AppAlert.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const error = ref('')
const submitting = ref(false)
const resending = ref(false)
const resendNotice = ref('')

// true after the recovery email was accepted by Supabase
const emailSent = ref(false)

// Set by the router guard when a recovery link could not be exchanged
// (expired link, or opened in a different browser than the one used to
// request the reset).
const recoveryFailed = computed(() => route.query.recoveryFailed === '1')

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
    const result = await auth.requestPasswordReset(email.value.trim())

    if (!result.ok) {
      error.value = result.error
      return
    }

    emailSent.value = true
  } finally {
    submitting.value = false
  }
}

async function onResend() {
  error.value = ''
  resendNotice.value = ''

  resending.value = true
  try {
    const result = await auth.requestPasswordReset(email.value.trim())
    if (!result.ok) {
      error.value = result.error
      return
    }
    resendNotice.value = 'Лист відновлення надіслано ще раз. Перевірте пошту.'
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md text-left">
    <h1 class="text-3xl font-bold">Відновлення пароля</h1>
    <p class="mt-2 text-slate-500">
      Вкажіть email — надішлемо посилання для створення нового пароля.
    </p>

    <!-- Success state: recovery email sent -->
    <div v-if="emailSent" class="mt-6 space-y-4">
      <AppAlert type="success">
        Ми надіслали лист для відновлення пароля на
        <span class="font-medium">{{ email.trim() }}</span>.
        Перевірте пошту та перейдіть за посиланням з листа.
      </AppAlert>

      <AppAlert v-if="error" type="error">{{ error }}</AppAlert>
      <AppAlert v-if="resendNotice" type="info">{{ resendNotice }}</AppAlert>

      <p class="text-sm text-slate-500">
        Посилання діє обмежений час. Якщо лист не прийшов — перевірте папку
        «Спам» або надішліть лист ще раз.
      </p>

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
        Пам'ятаєте пароль?
        <RouterLink
          :to="{ name: 'login', query: redirectQuery }"
          class="font-medium text-blue-600 hover:underline"
        >
          Увійти
        </RouterLink>
      </p>
    </div>

    <!-- Request form -->
    <form v-else class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
      <AppAlert v-if="recoveryFailed" type="error">
        Посилання для відновлення пароля недійсне або застаріло. Запросіть
        новий лист.
      </AppAlert>
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

      <button
        type="submit"
        :disabled="submitting"
        class="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LoadingSpinner v-if="submitting" class="mr-2 text-white" />
        {{ submitting ? 'Надсилаємо…' : 'Надіслати лист відновлення' }}
      </button>
    </form>

    <p v-if="!emailSent" class="mt-6 text-sm text-slate-600">
      Пам'ятаєте пароль?
      <RouterLink
        :to="{ name: 'login', query: redirectQuery }"
        class="font-medium text-blue-600 hover:underline"
      >
        Увійти
      </RouterLink>
    </p>
  </section>
</template>
