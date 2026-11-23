<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getSafeRedirect } from '../lib/redirect'
import AppAlert from '../components/AppAlert.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)

// true after the new password was saved
const passwordUpdated = ref(false)

function validate() {
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

  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  submitting.value = true
  try {
    const result = await auth.updatePassword(password.value)

    if (!result.ok) {
      error.value = result.error
      return
    }

    passwordUpdated.value = true
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-md text-left">
    <h1 class="text-3xl font-bold">Новий пароль</h1>
    <p class="mt-2 text-slate-500">
      Створіть новий пароль для вашого акаунту.
    </p>

    <!-- No session: the recovery link is missing, expired or was opened
         in a different browser than the one used to request the reset. -->
    <div v-if="!auth.isAuthenticated" class="mt-6 space-y-4">
      <AppAlert type="error">
        Посилання для відновлення пароля недійсне або застаріло. Запросіть
        новий лист — і перейдіть за посиланням у тому самому браузері, у якому
        його запрошували.
      </AppAlert>

      <RouterLink
        :to="{ name: 'forgot-password' }"
        class="block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Запросити новий лист
      </RouterLink>

      <p class="text-sm text-slate-600">
        Пам'ятаєте пароль?
        <RouterLink
          :to="{ name: 'login' }"
          class="font-medium text-blue-600 hover:underline"
        >
          Увійти
        </RouterLink>
      </p>
    </div>

    <!-- Success state: password updated -->
    <div v-else-if="passwordUpdated" class="mt-6 space-y-4">
      <AppAlert type="success">
        Пароль успішно оновлено. Новий пароль діятиме під час наступного входу.
      </AppAlert>

      <button
        type="button"
        class="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        @click="router.replace(getSafeRedirect(route.query.redirect))"
      >
        Перейти на головну
      </button>
    </div>

    <!-- New password form -->
    <form v-else class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
      <AppAlert v-if="error" type="error">{{ error }}</AppAlert>

      <p v-if="auth.user?.email" class="text-sm text-slate-500">
        Акаунт:
        <span class="font-medium text-slate-700">{{ auth.user.email }}</span>
      </p>

      <div>
        <label
          for="new-password"
          class="block text-sm font-medium text-slate-700"
        >
          Новий пароль
        </label>
        <input
          id="new-password"
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
          Повторіть новий пароль
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
        {{ submitting ? 'Зберігаємо…' : 'Зберегти пароль' }}
      </button>
    </form>
  </section>
</template>
