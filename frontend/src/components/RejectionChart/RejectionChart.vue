<template>
  <div class="reasons-wrap">
    <h3 class="chart-title">Rejection reasons</h3>
    <div v-if="isEmpty" class="chart-empty">{{ emptyMessage }}</div>
    <!-- A ranked list of bars rather than a donut: comparing a handful of
         counts is what bars are for, and plain text rows need no colour key. -->
    <ol v-else class="reason-list">
      <li
        v-for="r in rows"
        :key="r.key"
        :class="['reason-row', { 'reason-row--neutral': r.neutral }]"
      >
        <span class="reason-label">{{ r.label }}</span>
        <span class="reason-count">{{ r.value }}</span>
        <span class="reason-track" aria-hidden="true">
          <span class="reason-bar" :style="{ width: `${(r.value / maxValue) * 100}%` }" />
        </span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Application } from '../../api'

const props = defineProps<{
  applications: Application[]
  from?: string
  to?: string
}>()

// Declaration order breaks ties between reasons with the same count. The two
// "no real reason" buckets are drawn in a muted tone so they don't read as
// findings.
const REASON_META = [
  { key: 'another_candidate',    label: 'Another candidate selected' },
  { key: 'incompatible_profile', label: 'Incompatible profile' },
  { key: 'dutch_language',       label: 'Dutch language requirement' },
  { key: 'salary_mismatch',      label: 'Salary mismatch' },
  { key: 'internal_hire',        label: 'Filled internally' },
  { key: 'failed_assessment',    label: 'Did not pass assessment' },
  { key: 'no_vacancies',         label: 'No vacancies at the moment' },
  { key: 'no_hsm_sponsorship',   label: 'No HSM visa sponsorship' },
  { key: 'other',                label: 'Other' },
  { key: 'unknown',              label: 'No reason given' },
] as const

const NEUTRAL = new Set(['other', 'unknown'])

const rejected = computed(() => {
  const fromMs = props.from ? new Date(props.from).getTime() : -Infinity
  const toMs   = props.to   ? new Date(props.to).getTime()   :  Infinity
  return props.applications.filter(a => {
    if (a.status !== 'Rejected') return false
    const t = new Date(a.appliedAt).getTime()
    return t >= fromMs && t <= toMs
  })
})

const rows = computed(() => {
  const counts: Record<string, number> = {}
  for (const a of rejected.value) {
    const key = a.rejectionReason ?? 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return REASON_META
    .map(m => ({ key: m.key, label: m.label, value: counts[m.key] ?? 0, neutral: NEUTRAL.has(m.key) }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value) // stable: ties keep REASON_META order
})

const maxValue = computed(() => Math.max(1, ...rows.value.map(r => r.value)))

const isEmpty = computed(() => rejected.value.length === 0)

const emptyMessage = computed(() =>
  props.from || props.to ? 'No rejections in this period.' : 'No rejections yet.'
)
</script>

<style scoped>
.reasons-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border-lt);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1rem 1rem;
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: .9375rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0 0 .75rem;
}

.chart-empty {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

.reason-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.reason-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "label count" "track track";
  row-gap: .3rem;
  column-gap: .75rem;
  font-size: .875rem;
}
.reason-label { grid-area: label; color: var(--col-text); }
.reason-count { grid-area: count; font-weight: 600; color: var(--col-text); font-variant-numeric: tabular-nums; }

.reason-track { grid-area: track; display: block; height: 6px; }
.reason-bar {
  display: block;
  height: 100%;
  min-width: 4px;
  background: var(--col-accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.reason-row--neutral .reason-label { color: var(--col-muted); }
.reason-row--neutral .reason-bar   { background: var(--col-subtle); }
</style>
