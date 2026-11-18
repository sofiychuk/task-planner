<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'error',
    validator: (value) => ['error', 'success', 'info'].includes(value),
  },
  message: {
    type: String,
    default: '',
  },
})

const variantClasses = computed(() => {
  if (props.variant === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (props.variant === 'info') {
    return 'border-sky-200 bg-sky-50 text-sky-800'
  }

  return 'border-red-200 bg-red-50 text-red-700'
})

const role = computed(() => (props.variant === 'error' ? 'alert' : 'status'))
const isUrgent = computed(() => (props.variant === 'error' ? 'assertive' : 'polite'))
</script>

<template>
  <div
    v-if="message"
    class="rounded-lg border px-3.5 py-3"
    :class="variantClasses"
    :role="role"
    :aria-live="isUrgent"
  >
    <p class="text-sm leading-relaxed">{{ message }}</p>
  </div>
</template>
