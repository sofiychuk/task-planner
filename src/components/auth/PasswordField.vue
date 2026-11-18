<script setup>
import { computed, ref } from 'vue'

import FormField from './FormField.vue'

defineProps({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  modelValue: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: '',
  },
  autocomplete: {
    type: String,
    default: 'off',
  },
  placeholder: {
    type: String,
    default: '',
  },
  hint: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
  required: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  maxlength: {
    type: [String, Number],
    default: undefined,
  },
})

defineEmits(['update:modelValue', 'blur'])

const isVisible = ref(false)
const inputType = computed(() => (isVisible.value ? 'text' : 'password'))
</script>

<template>
  <FormField
    :id="id"
    :label="label"
    :model-value="modelValue"
    :type="inputType"
    :name="name || id"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :hint="hint"
    :error="error"
    :required="required"
    :disabled="disabled"
    :maxlength="maxlength"
    input-class="pr-12"
    @update:model-value="$emit('update:modelValue', $event)"
    @blur="$emit('blur')"
  >
    <template #trailing>
      <button
        type="button"
        class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-600"
        :aria-label="isVisible ? 'Приховати пароль' : 'Показати пароль'"
        :aria-pressed="isVisible"
        @click="isVisible = !isVisible"
      >
        <svg
          v-if="isVisible"
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.4A10.9 10.9 0 0 1 12 5.25c6 0 9.75 6.75 9.75 6.75a18.6 18.6 0 0 1-4.06 4.6M6.2 6.2A18.3 18.3 0 0 0 2.25 12S6 18.75 12 18.75c1.1 0 2.1-.22 3.03-.6"
          />
        </svg>
        <svg
          v-else
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M2.25 12S6 5.25 12 5.25 21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </button>
    </template>
  </FormField>
</template>
