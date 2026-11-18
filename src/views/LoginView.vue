<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth'
import { authErrorMessage } from '../lib/authErrors'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

function redirectTarget() {
    const redirect = route.query.redirect
    if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
        return redirect
    }
    return '/'
}

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

    loading.value = true
    try {
        await auth.signIn(normalizedEmail, password.value)
        await router.push(redirectTarget())
    } catch (error) {
        errorMessage.value = authErrorMessage(error)
    } finally {
        loading.value = false
    }
}
</script>

<template>
  <section class="mx-auto max-w-md">
    <h1 class="text-3xl font-bold">Вхід</h1>
    <p class="mt-2 text-slate-500">
      Увійдіть, щоб працювати зі своїми завданнями.
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
          autocomplete="current-password"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
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
        {{ loading ? 'Вхід…' : 'Увійти' }}
      </button>
    </form>

    <p class="mt-4 text-sm text-slate-500">
      Немає акаунта?
      <RouterLink to="/register" class="text-blue-600 hover:underline">
        Зареєструватися
      </RouterLink>
    </p>
  </section>
</template>
