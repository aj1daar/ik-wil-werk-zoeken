<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  id?: string
}>(), { placeholder: 'Pick a date' })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const wrapperRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef   = ref<HTMLElement | null>(null)

const open      = ref(false)
const panelPos  = ref<Record<string, string>>({})
const viewYear  = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())
const focusDay  = ref<number | null>(null)

const todayYmd = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()

function pad(n: number) { return String(n).padStart(2, '0') }

function toYmd(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

function formatDisplay(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su']

const cells = computed(() => {
  const y = viewYear.value, m = viewMonth.value
  const firstDow   = new Date(y, m, 1).getDay()
  const offset     = (firstDow + 6) % 7       // Monday-first
  const daysInMon  = new Date(y, m + 1, 0).getDate()
  const prevDaysIn = new Date(y, m, 0).getDate()
  const out: { ymd: string; day: number; cur: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const pos = i - offset
    if (pos < 0) {
      const d = prevDaysIn + pos + 1
      const [py, pm] = m === 0 ? [y - 1, 11] : [y, m - 1]
      out.push({ ymd: toYmd(py, pm, d), day: d, cur: false })
    } else if (pos < daysInMon) {
      out.push({ ymd: toYmd(y, m, pos + 1), day: pos + 1, cur: true })
    } else {
      const d = pos - daysInMon + 1
      const [ny, nm] = m === 11 ? [y + 1, 0] : [y, m + 1]
      out.push({ ymd: toYmd(ny, nm, d), day: d, cur: false })
    }
  }
  return out
})

// Sync view to selected value when it changes externally
watch(() => props.modelValue, (val) => {
  if (val) {
    const d = new Date(val + 'T00:00:00')
    viewYear.value  = d.getFullYear()
    viewMonth.value = d.getMonth()
  }
})

function positionPanel() {
  const r = triggerRef.value?.getBoundingClientRect()
  if (!r) return
  const W = 280
  let left = r.left + window.scrollX
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8
  const top = r.bottom + window.scrollY + 4
  panelPos.value = { position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${W}px`, zIndex: '9999' }
}

async function openPanel() {
  if (props.modelValue) {
    const d = new Date(props.modelValue + 'T00:00:00')
    viewYear.value  = d.getFullYear()
    viewMonth.value = d.getMonth()
    focusDay.value  = d.getDate()
  } else {
    const d = new Date()
    viewYear.value  = d.getFullYear()
    viewMonth.value = d.getMonth()
    focusDay.value  = d.getDate()
  }
  open.value = true
  await nextTick()
  positionPanel()
  panelRef.value?.focus({ preventScroll: true })
}

function closePanel() {
  open.value = false
  focusDay.value = null
}

function toggle() { open.value ? closePanel() : openPanel() }

function select(ymd: string) { emit('update:modelValue', ymd); closePanel() }
function clear()             { emit('update:modelValue', ''); closePanel() }

function prevMonth() {
  if (viewMonth.value === 0) { viewYear.value--; viewMonth.value = 11 }
  else viewMonth.value--
  clampFocusDay()
}

function nextMonth() {
  if (viewMonth.value === 11) { viewYear.value++; viewMonth.value = 0 }
  else viewMonth.value++
  clampFocusDay()
}

function clampFocusDay() {
  const max = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  if (focusDay.value !== null) focusDay.value = Math.min(focusDay.value, max)
}

function daysInCurMonth() { return new Date(viewYear.value, viewMonth.value + 1, 0).getDate() }

function onPanelKey(e: KeyboardEvent) {
  const fd = focusDay.value ?? 1

  if (e.key === 'Escape') {
    e.preventDefault(); closePanel(); triggerRef.value?.focus(); return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (focusDay.value !== null) select(toYmd(viewYear.value, viewMonth.value, focusDay.value))
    return
  }
  if (e.key === 'PageUp')   { e.preventDefault(); prevMonth(); return }
  if (e.key === 'PageDown') { e.preventDefault(); nextMonth(); return }

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (fd >= daysInCurMonth()) { nextMonth(); focusDay.value = 1 }
    else focusDay.value = fd + 1
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (fd <= 1) { prevMonth(); focusDay.value = daysInCurMonth() }
    else focusDay.value = fd - 1
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = fd + 7
    if (next > daysInCurMonth()) { const over = next - daysInCurMonth(); nextMonth(); focusDay.value = over }
    else focusDay.value = next
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = fd - 7
    if (prev < 1) { prevMonth(); focusDay.value = daysInCurMonth() + prev }
    else focusDay.value = prev
  }
}

function onDocMousedown(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (wrapperRef.value?.contains(t)) return
  if (panelRef.value?.contains(t)) return
  closePanel()
}

onMounted(()  => document.addEventListener('mousedown', onDocMousedown))
onUnmounted(() => document.removeEventListener('mousedown', onDocMousedown))
</script>

<template>
  <div class="dp-wrap" ref="wrapperRef">
    <button
      ref="triggerRef"
      type="button"
      :id="id"
      class="dp-trigger field-input"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span :class="modelValue ? 'dp-val' : 'dp-ph'">
        {{ modelValue ? formatDisplay(modelValue) : placeholder }}
      </span>
      <svg class="dp-cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="dp-panel"
        :style="panelPos"
        role="dialog"
        aria-label="Choose a date"
        tabindex="-1"
        @keydown="onPanelKey"
        @mousedown.prevent
      >
        <!-- Month navigation -->
        <div class="dp-hd">
          <button class="dp-nav" type="button" @click="prevMonth" aria-label="Previous month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span class="dp-month">{{ MONTHS[viewMonth] }} {{ viewYear }}</span>
          <button class="dp-nav" type="button" @click="nextMonth" aria-label="Next month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- Weekday headers -->
        <div class="dp-wds">
          <span v-for="d in DAYS" :key="d" class="dp-wd">{{ d }}</span>
        </div>

        <!-- Day grid -->
        <div class="dp-grid">
          <button
            v-for="cell in cells"
            :key="cell.ymd"
            type="button"
            class="dp-day"
            :class="{
              'dp-day--dim':      !cell.cur,
              'dp-day--today':    cell.ymd === todayYmd && cell.cur,
              'dp-day--sel':      cell.ymd === modelValue,
              'dp-day--focus':    cell.cur && cell.day === focusDay,
            }"
            tabindex="-1"
            :aria-pressed="cell.ymd === modelValue"
            @click="select(cell.ymd)"
            @mouseover="cell.cur && (focusDay = cell.day)"
          >{{ cell.day }}</button>
        </div>

        <!-- Footer -->
        <div class="dp-ft">
          <button type="button" class="dp-ft-btn btn-ghost" @click="clear">Clear</button>
          <button type="button" class="dp-ft-btn btn-ghost" @click="select(todayYmd)">Today</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dp-wrap { position: relative; }

/* Trigger — looks exactly like a field-input */
.dp-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  width: 100%;
  cursor: pointer;
  text-align: left;
  font-size: inherit;
}
.dp-ph       { color: var(--col-subtle); }
.dp-val      { color: var(--col-text); }
.dp-cal-icon { width: 1.1rem; height: 1.1rem; color: var(--col-subtle); flex-shrink: 0; }

/* Panel */
.dp-panel {
  background: var(--col-bg);
  border: 1px solid var(--col-border);
  border-radius: .875rem;
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--col-text) 8%, transparent),
    0 16px 48px color-mix(in srgb, var(--col-text) 10%, transparent);
  padding: .875rem;
  outline: none;
  user-select: none;
}

/* Header */
.dp-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .625rem;
}
.dp-month { font-weight: 600; font-size: .875rem; color: var(--col-text); }
.dp-nav {
  display: flex; align-items: center; justify-content: center;
  width: 1.875rem; height: 1.875rem;
  border-radius: .5rem; border: none; background: none;
  cursor: pointer; color: var(--col-muted);
  transition: background .12s, color .12s;
}
.dp-nav:hover { background: var(--col-surface); color: var(--col-text); }
.dp-nav svg   { width: 1rem; height: 1rem; }

/* Weekday labels */
.dp-wds {
  display: grid; grid-template-columns: repeat(7, 1fr);
  margin-bottom: .25rem;
}
.dp-wd {
  text-align: center; font-size: .6875rem; font-weight: 600;
  color: var(--col-subtle); text-transform: uppercase; letter-spacing: .05em;
  padding: .2rem 0;
}

/* Day grid */
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }

.dp-day {
  display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1; border-radius: .375rem; border: none; background: none;
  cursor: pointer; font-size: .8125rem; color: var(--col-text);
  transition: background .1s, color .1s;
  outline: none;
}
.dp-day--dim { color: var(--col-subtle); }

.dp-day:hover:not(.dp-day--sel) {
  background: var(--col-surface);
}
.dp-day--today:not(.dp-day--sel) {
  font-weight: 700; color: var(--col-accent);
}
.dp-day--focus:not(.dp-day--sel) {
  background: var(--col-raised);
  box-shadow: inset 0 0 0 2px var(--col-accent);
}
.dp-day--sel {
  background: var(--col-invert-bg);
  color: var(--col-invert-text);
  font-weight: 600;
}

/* Footer */
.dp-ft {
  display: flex; justify-content: space-between;
  margin-top: .625rem; padding-top: .625rem;
  border-top: 1px solid var(--col-border-lt);
}
.dp-ft-btn { font-size: .8125rem; padding: .25rem .625rem; }

@media (max-width: 767px) {
  /* Apple HIG minimum 44pt tap target */
  .dp-nav { width: 2.75rem; height: 2.75rem; }
  .dp-day { min-height: 2.75rem; }
  .dp-ft-btn { min-height: 2.75rem; padding: .25rem .875rem; }
}
</style>
