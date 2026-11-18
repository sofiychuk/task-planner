<script setup>
import { computed } from 'vue'

const props = defineProps({
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
  type: {
    type: String,
    default: 'text',
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
  inputmode: {
    type: String,
    default: undefined,
  },
  autocapitalize: {
    type: String,
    default: undefined,
  },
  spellcheck: {
    type: [Boolean, String],
    default: undefined,
  },
  inputClass: {
    type: String,
    default: '',
  },
})

defineEmits(['update:modelValue', 'blur'])

const hintId = computed(() => `${props.id}-hint`)
const errorId = computed(() => `${props.id}-error`)

const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

const inputClasses = computed(() => [
  'block h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
  props.error
    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-100'
    : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
  props.inputClass,
])
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-slate-700">
      {{ label }}
    </label>

    <div class="relative mt-1.5">
      <input
        :id="id"
        :name="name || id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :required="required"
        :disabled="disabled"
        :maxlength="maxlength"
        :inputmode="inputmode"
        :autocapitalize="autocapitalize"
        :spellcheck="spellcheck"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :class="inputClasses"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="$emit('blur')"
      />

      <slot name="trailing" />
    </div>

    <p v-if="hint && !error" :id="hintId" class="mt-1.5 text-xs leading-relaxed text-slate-500">
      {{ hint }}
    </p>
    <p v-if="error" :id="errorId" class="mt-1.5 text-sm text-red-600" role="alert">
      {{ error }}
    </p>
  </div>
</template>
