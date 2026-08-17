<template>
  <div class="app-input-wrapper">
    <input
      :id="id"
      class="app-input"
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error && id ? `${id}-error` : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" :id="id ? `${id}-error` : undefined" class="app-input-error">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  type?: string
  placeholder?: string
  id?: string
  error?: string
  autocomplete?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<style scoped>
.app-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.app-input {
  width: 100%;
  background: var(--col-bg);
  border: 1px solid var(--col-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--col-text);
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
  box-sizing: border-box;
}

.app-input::placeholder {
  color: var(--col-subtle);
}

.app-input:focus {
  border-color: var(--col-accent);
  box-shadow: 0 0 0 3px var(--col-accent-lt);
}

.app-input[aria-invalid="true"] {
  border-color: var(--col-danger, #e53e3e);
}

.app-input-error {
  font-size: 0.8rem;
  color: var(--col-danger, #e53e3e);
  margin: 0;
}

/* iOS Safari zooms the viewport on focus of text inputs under 16px. */
@media (max-width: 767px) {
  .app-input { font-size: 16px; }
}
</style>
