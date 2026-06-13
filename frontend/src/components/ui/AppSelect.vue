<template>
  <div class="app-select-wrapper">
    <select
      :id="id"
      class="app-select"
      :value="modelValue"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="" disabled :selected="modelValue === ''">
        {{ placeholder }}
      </option>
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <svg class="app-select-chevron" aria-hidden="true" viewBox="0 0 10 6" width="10" height="6">
      <path d="M0 0l5 6 5-6z" fill="currentColor" />
    </svg>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  placeholder?: string
  id?: string
  ariaLabel?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<style scoped>
.app-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.app-select {
  appearance: none;
  -webkit-appearance: none;
  border-radius: 0.5rem;
  border: 1px solid var(--col-border);
  background: var(--col-bg);
  color: var(--col-text);
  font-size: 0.875rem;
  font-family: inherit;
  padding: 0.5rem 2.25rem 0.5rem 0.75rem;
  outline: none;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.app-select:focus {
  border-color: var(--col-accent);
  box-shadow: 0 0 0 3px var(--col-accent-lt);
}

.app-select-chevron {
  position: absolute;
  right: 0.75rem;
  pointer-events: none;
  color: var(--col-subtle);
}
</style>
