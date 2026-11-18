<script setup>
import AppSpinner from '../ui/AppSpinner.vue'

defineProps({
  email: {
    type: String,
    default: '',
  },
  isLoggingOut: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['logout'])

const navLinkClass =
  'shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
      <RouterLink
        to="/"
        class="mr-auto text-lg font-bold tracking-tight text-slate-900"
      >
        Planner
      </RouterLink>

      <nav class="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Основна навігація">
        <RouterLink
          to="/"
          :class="navLinkClass"
          active-class="bg-slate-100 text-slate-900"
          exact-active-class="bg-slate-100 text-slate-900"
        >
          Dashboard
        </RouterLink>
        <RouterLink
          to="/planner"
          :class="navLinkClass"
          active-class="bg-slate-100 text-slate-900"
        >
          Мої завдання
        </RouterLink>
        <RouterLink
          to="/settings"
          :class="navLinkClass"
          active-class="bg-slate-100 text-slate-900"
        >
          Налаштування
        </RouterLink>
      </nav>

      <span class="hidden max-w-[14rem] truncate text-sm text-slate-500 lg:inline">
        {{ email }}
      </span>

      <button
        type="button"
        class="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isLoggingOut"
        :aria-busy="isLoggingOut"
        @click="$emit('logout')"
      >
        <AppSpinner v-if="isLoggingOut" class="size-4" label="Виконуємо вихід" />
        {{ isLoggingOut ? 'Вихід…' : 'Вийти' }}
      </button>
    </div>
  </header>
</template>
