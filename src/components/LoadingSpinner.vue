<script setup>
// Small inline spinner. A `class` passed by the parent is merged into the
// root element automatically (e.g. <LoadingSpinner class="h-4 w-4" />).
</script>

<template>
  <svg
    class="inline-block h-4 w-4 animate-spin"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      class="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="4"
    />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
</template>
