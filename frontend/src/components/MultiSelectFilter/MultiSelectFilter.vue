<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import AppIcon from '../ui/AppIcon.vue'

// A facet filter that takes several values at once. One component rather than
// four copies: the Companies toolbar needs it for city, language, size and
// policy, and a fix made to one copy never reaches the others.
const props = withDefaults(defineProps<{
  modelValue: string[]
  options: string[]
  /** Shown on the trigger when nothing is chosen, and as the clear-all row. */
  allLabel: string
  /** Accessible name for the trigger and the option group. */
  label: string
  /** Above this many options the panel gets its own search box. */
  searchThreshold?: number
}>(), { searchThreshold: 12 })

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open    = ref(false)
const search  = ref('')
const root    = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel   = ref<HTMLElement | null>(null)

const selected = computed(() => props.modelValue)

const searchable = computed(() => props.options.length > props.searchThreshold)

const visibleOptions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(o => o.toLowerCase().includes(q))
})

// "All cities" while empty, the value itself when it is one choice, and a count
// beyond that: a list of names truncated mid-word tells the user less than "3
// selected" does.
const summary = computed(() => {
  if (selected.value.length === 0) return props.allLabel
  if (selected.value.length === 1) return selected.value[0]
  return `${selected.value.length} selected`
})

function isSelected(option: string) {
  return selected.value.includes(option)
}

function toggle(option: string) {
  emit('update:modelValue', isSelected(option)
    ? selected.value.filter(v => v !== option)
    : [...selected.value, option])
}

function clear() {
  emit('update:modelValue', [])
}

function close(focusTrigger = true) {
  if (!open.value) return
  open.value = false
  if (focusTrigger) trigger.value?.focus()
}

async function toggleOpen() {
  open.value = !open.value
  if (!open.value) return
  search.value = ''
  // The search box is the first thing a long list needs; a short one puts the
  // caller straight on the first checkbox instead.
  await nextTick()
  const target = panel.value?.querySelector<HTMLElement>('input')
  target?.focus()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  if (root.value && !root.value.contains(event.target as Node)) close(false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    close()
  }
}

// The options can change under an open panel (the company list finishes
// loading), and a value that is no longer offered would otherwise stay selected
// with no way to see or remove it.
watch(() => props.options, opts => {
  if (selected.value.length === 0) return
  const kept = selected.value.filter(v => opts.includes(v))
  if (kept.length !== selected.value.length) emit('update:modelValue', kept)
})

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="multi-filter" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="filter-input multi-filter-trigger"
      :class="selected.length > 0 && 'multi-filter-trigger--active'"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="toggleOpen"
    >
      <span class="multi-filter-summary">{{ summary }}</span>
      <span v-if="selected.length > 1" class="filter-count">{{ selected.length }}</span>
      <AppIcon
        name="chevron-down"
        :class="['btn-icon-sm', 'btn-chevron', open && 'btn-chevron--open']"
      />
    </button>

    <Transition name="filter-drop">
      <div v-if="open" ref="panel" class="multi-filter-panel">
        <div v-if="searchable" class="multi-filter-search">
          <AppIcon name="search" class="multi-filter-search-icon" />
          <input
            v-model="search"
            class="filter-input multi-filter-search-input"
            :placeholder="`Search ${allLabel.toLowerCase()}…`"
            :aria-label="`Search ${label.toLowerCase()}`"
          />
        </div>

        <div class="multi-filter-options" role="group" :aria-label="label">
          <label v-for="option in visibleOptions" :key="option" class="multi-filter-option">
            <input
              type="checkbox"
              :checked="isSelected(option)"
              :value="option"
              @change="toggle(option)"
            />
            <span>{{ option }}</span>
          </label>
          <p v-if="visibleOptions.length === 0" class="multi-filter-empty">
            No match. Try fewer letters.
          </p>
        </div>

        <button
          v-if="selected.length > 0"
          type="button"
          class="btn-ghost multi-filter-clear"
          @click="clear"
        >
          {{ allLabel }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Takes an equal share of the filter row, the way the plain selects it replaced
   did through `.dropdown-filters-panel .filter-select`. Without a width of its
   own the trigger sizes to its content, which leaves the label nothing to sit
   in. align-self keeps it from stretching to the tallest item in the row. */
.multi-filter {
  position: relative;
  flex: 1;
  align-self: flex-start;
  min-width: 130px;
}

.multi-filter-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.multi-filter-trigger--active {
  border-color: var(--col-accent);
}

/* `flex: 1 1 auto` with `min-width: 0`, not `flex: 1`: a basis of 0 collapses the
   label to nothing and lets the ellipsis eat the whole value. */
.multi-filter-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The panel floats above the grid below it, so it is the one part of this that
   earns a shadow. */
.multi-filter-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.25rem);
  left: 0;
  width: 100%;
  min-width: 14rem;
  padding: 0.5rem;
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.multi-filter-search {
  position: relative;
  margin-bottom: 0.5rem;
}

.multi-filter-search-icon {
  position: absolute;
  top: 50%;
  left: 0.625rem;
  width: 1rem;
  height: 1rem;
  color: var(--col-subtle);
  transform: translateY(-50%);
  pointer-events: none;
}

.multi-filter-search-input {
  width: 100%;
  padding-left: 2rem;
}

.multi-filter-options {
  display: flex;
  flex-direction: column;
  max-height: 16rem;
  overflow-y: auto;
}

.multi-filter-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  padding: 0.25rem 0.375rem;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--col-text);
  cursor: pointer;
}

.multi-filter-option:hover {
  background: var(--col-raised);
}

.multi-filter-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-filter-empty {
  padding: 0.5rem 0.375rem;
  font-size: 0.875rem;
  color: var(--col-muted);
}

.multi-filter-clear {
  width: 100%;
  margin-top: 0.5rem;
}

/* Phones give the row less to share, the same allowance the plain selects get.
   After the base rule, not before it: a media query adds no specificity. */
@media (max-width: 767px) {
  .multi-filter {
    min-width: 0;
  }
}

/* A scoped min-height outranks the global 44px touch rule, so each control that
   sets one needs its own coarse-pointer override. */
@media (pointer: coarse) {
  .multi-filter-option {
    min-height: 44px;
  }
}
</style>
