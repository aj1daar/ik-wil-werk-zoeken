<script setup lang="ts">
import { computed, ref } from 'vue'

// The company-name field with its suggestion list: one component because there
// are now two places that need it, the new-application form and the browser
// extension's side panel, and a copy of a keyboard-navigable listbox is exactly
// the kind of thing that drifts.
//
// It owns the typing, the highlight and the keyboard, and nothing else. Where
// the suggestions come from is the caller's business — the app filters a register
// it has already loaded, the extension asks the API per keystroke.
export interface CompanyOption {
  id: string
  name: string
  city?: string | null
  coreIndustry?: string | null
}

const props = withDefaults(defineProps<{
  modelValue: string
  suggestions: readonly CompanyOption[]
  inputId?: string
  placeholder?: string
}>(), { inputId: 'company-name', placeholder: 'e.g. Acme B.V.' })

const emit = defineEmits<{
  'update:modelValue': [string]
  select: [CompanyOption]
}>()

const highlightedIndex = ref(-1)
const dismissed        = ref(false)

const open = computed(() => props.suggestions.length > 0 && !dismissed.value)

// role="combobox" is only a complete pattern with aria-controls naming the list
// it opens, and the id has to be the caller's, since two of these can be on one
// page.
const listboxId = computed(() => `${props.inputId}-listbox`)

function onInput(event: Event) {
  dismissed.value        = false
  highlightedIndex.value = -1
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function choose(option: CompanyOption) {
  highlightedIndex.value = -1
  dismissed.value        = true
  emit('select', option)
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, props.suggestions.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    if (highlightedIndex.value >= 0) {
      event.preventDefault()
      choose(props.suggestions[highlightedIndex.value])
    }
  } else if (event.key === 'Escape') {
    dismissed.value        = true
    highlightedIndex.value = -1
  }
}

// Long enough for a click on an option to land before the list goes away, which
// mousedown alone does not guarantee once focus has moved.
function onBlur() {
  setTimeout(() => { dismissed.value = true; highlightedIndex.value = -1 }, 150)
}

// A fresh query re-opens the list the caller has just refilled.
function reopen() {
  dismissed.value = false
}

defineExpose({ reopen })
</script>

<template>
  <div class="combobox-wrapper">
    <input
      :id="inputId"
      :value="modelValue"
      class="field-input"
      :placeholder="placeholder"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      aria-autocomplete="list"
      :aria-controls="listboxId"
      :aria-activedescendant="highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <ul v-if="open" :id="listboxId" class="combobox-dropdown" role="listbox" aria-label="Company suggestions">
      <li
        v-for="(company, i) in suggestions"
        :id="`suggestion-${i}`"
        :key="company.id"
        :class="['combobox-option', { 'combobox-option--active': i === highlightedIndex }]"
        role="option"
        :aria-selected="i === highlightedIndex"
        @mousedown.prevent="choose(company)"
      >
        <span class="combobox-name">{{ company.name }}</span>
        <span v-if="company.city" class="city-chip combobox-city">{{ company.city }}</span>
        <span v-if="company.coreIndustry" class="industry-badge">{{ company.coreIndustry }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combobox-wrapper { position: relative; }
.combobox-dropdown {
  position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--col-bg); border: 1px solid var(--col-border);
  border-radius: var(--radius); box-shadow: var(--shadow-lg);
  max-height: 220px; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: .25rem 0;
}
.combobox-option {
  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
  padding: .5rem .75rem; font-size: .875rem; cursor: pointer; color: var(--col-text);
}
.combobox-option:hover,
.combobox-option--active { background: var(--col-raised); }
.combobox-name { font-weight: 500; }
.city-chip { display: inline-flex; align-items: center; gap: .25rem; background: var(--col-raised); border-radius: 9999px; padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted); }
.combobox-city { font-size: .75rem; }
.industry-badge {
  font-size: .7rem; background: color-mix(in srgb, var(--col-accent) 15%, transparent);
  color: var(--col-accent-dk); border-radius: 9999px; padding: .1rem .45rem;
}

/* A suggestion row is a touch target like any other. */
@media (pointer: coarse) {
  .combobox-option { min-height: 44px; }
}
</style>
