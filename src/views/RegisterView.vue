<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth'
import { authErrorMessage } from '../lib/authErrors'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const confirmationSent = ref(false)
const registeredEmail = ref('')

async function onSubmit() {
    errorMessage.value = ''

    const normalizedEmail = email.value.trim()
    if (!normalizedEmail || !password.value) {
        errorMessage.value = 'Заповніть email і пароль.'
        return
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        errorMessage.value = 'Введіть коректний email.'
        return
    }
    if (password.value.length < 6) {
        errorMessage.value = 'Пароль має містити щонайменше 6 символів.'
        return
    }

    loading.value = true
    try {
        const { needsEmailConfirmation } = await auth.signUp(normalizedEmail, password.value)

        if (needsEmailConfirmation) {
            // Підтвердження email увімкнене: сесії ще немає, показуємо підказку.
            registeredEmail.value = normalizedEmail
            confirmationSent.value = true
        } else {
            // Підтвердження вимкнене: користувача одразу залогінено.
            await router.push('/')
        }
    } catch (error) {
        errorMessage.value = authErrorMessage(error)
    } finally {
        loading.value = false
    }
}
</script>

<template>
  <section class="mx-auto max-w-md">
    <template v-if="confirmationSent">
      <h1 class="text-3xl font-bold">Підтвердьте email</h1>
      <p class="mt-4 text-slate-600">
        Ми надіслали лист для підтвердження на
        <span class="font-medium text-slate-900">{{ registeredEmail }}</span>.
        Перейдіть за посиланням із листа, а потім увійдіть.
      </p>
      <RouterLink
        to="/login"
        class="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
      >
        До входу
      </RouterLink>
    </template>

    <template v-else>
      <h1 class="text-3xl font-bold">Реєстрація</h1>
      <p class="mt-2 text-slate-500">
        Створіть акаунт, щоб почати планувати.
      </p>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="onSubmit">
        <div>
          <label for="email" class="block text-sm font-medium">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium">Пароль</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
          <p class="mt-1 text-xs text-slate-400">
            Щонайменше 6 символів.
          </p>
        </div>

        <p
          v-if="errorMessage"
          role="alert"
          class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {{ loading ? 'Створюємо акаунт…' : 'Зареєструватися' }}
        </button>
      </form>

      <p class="mt-4 text-sm text-slate-500">
        Уже маєте акаунт?
        <RouterLink to="/login" class="text-blue-600 hover:underline">
          Увійти
        </RouterLink>
      </p>
    </template>
  </section>
</template>
