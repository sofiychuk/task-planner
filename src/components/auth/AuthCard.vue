<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <section class="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <h1 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
      {{ title }}
    </h1>
    <p v-if="subtitle" class="mt-2 text-sm leading-relaxed text-slate-500">
      {{ subtitle }}
    </p>

    <div class="mt-6">
      <slot />
    </div>

    <div v-if="$slots.footer" class="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
      <slot name="footer" />
    </div>
  </section>
</template>
