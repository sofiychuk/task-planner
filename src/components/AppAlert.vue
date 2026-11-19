<script setup>
defineProps({
  type: {
    type: String,
    default: 'info',
  },
})

const typeClasses = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-green-200 bg-green-50 text-green-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
}
</script>

<template>
  <div
    class="rounded-md border px-4 py-3 text-sm"
    :class="typeClasses[type] ?? typeClasses.info"
    :role="type === 'error' ? 'alert' : 'status'"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <slot />
  </div>
</template>
