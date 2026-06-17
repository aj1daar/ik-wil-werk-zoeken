<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ byStatus: Record<string, number> }>()

const STATUSES = [
  { key: 'Applied',            label: 'Applied',        color: '#60A5FA' },
  { key: 'InterviewScheduled', label: 'Interviewing',   color: '#A78BFA' },
  { key: 'Assessment',         label: 'Assessment',     color: '#FB923C' },
  { key: 'OfferReceived',      label: 'Offer Received', color: '#34D399' },
  { key: 'Accepted',           label: 'Accepted',       color: '#10B981' },
  { key: 'OnHold',             label: 'On Hold',        color: '#FBBF24' },
  { key: 'Rejected',           label: 'Rejected',       color: '#F87171' },
  { key: 'Withdrawn',          label: 'Withdrawn',      color: '#9CA3AF' },
] as const

const total = computed(() =>
  STATUSES.reduce((sum, s) => sum + (props.byStatus[s.key] ?? 0), 0)
)

const rows = computed(() =>
  STATUSES.map(s => ({
    ...s,
    count: props.byStatus[s.key] ?? 0,
    pct:   total.value > 0
      ? (props.byStatus[s.key] ?? 0) / total.value * 100
      : 0,
  }))
)

const segments   = computed(() => rows.value.filter(r => r.count > 0))
const sortedRows = computed(() => [...rows.value].sort((a, b) => b.count - a.count))

const isEmpty  = computed(() => total.value === 0)
const hovered  = ref<string | null>(null)
const hoveredRow = computed(() => rows.value.find(r => r.key === hovered.value) ?? null)
</script>

<template>
  <div class="sb-wrap">
    <div class="sb-header">
      <h3 class="sb-title">Application Status</h3>
      <span v-if="!isEmpty" class="sb-total">
        <strong>{{ total }}</strong> total
      </span>
    </div>

    <div v-if="isEmpty" class="sb-empty">No applications to display.</div>

    <template v-else>
      <!-- Stacked bar -->
      <div
        class="sb-bar"
        role="img"
        :aria-label="`Application status breakdown across ${total} applications`"
      >
        <div
          v-for="seg in segments"
          :key="seg.key"
          class="sb-seg"
          :style="{ flexGrow: seg.count, background: seg.color }"
          :class="{ 'sb-seg--dim': hovered !== null && hovered !== seg.key }"
          @mouseenter="hovered = seg.key"
          @mouseleave="hovered = null"
        />
      </div>

      <!-- Hover label -->
      <div class="sb-hover-label">
        <template v-if="hoveredRow">
          <span class="sb-hover-dot" :style="{ background: hoveredRow.color }" />
          {{ hoveredRow.label }}:
          <strong>{{ hoveredRow.count }}</strong>
          &nbsp;·&nbsp;{{ Math.round(hoveredRow.pct) }}%
        </template>
        <template v-else>&nbsp;</template>
      </div>

      <!-- Legend -->
      <div class="sb-legend">
        <div
          v-for="row in sortedRows"
          :key="row.key"
          class="sb-leg-row"
          :class="{ 'sb-leg-row--zero': row.count === 0, 'sb-leg-row--hi': hovered === row.key }"
          @mouseenter="hovered = row.key"
          @mouseleave="hovered = null"
        >
          <span class="sb-dot" :style="{ background: row.color }" />
          <span class="sb-leg-label">{{ row.label }}</span>
          <span class="sb-leg-count">{{ row.count }}</span>
          <span class="sb-leg-pct">{{ row.count > 0 ? Math.round(row.pct) + '%' : '—' }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sb-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow:
    0 1px 3px  color-mix(in srgb, var(--col-text) 6%, transparent),
    0 4px 16px color-mix(in srgb, var(--col-text) 9%, transparent);
}

.sb-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.sb-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
  margin: 0;
}
.sb-total {
  font-size: .8125rem;
  color: var(--col-muted);
}
.sb-total strong {
  color: var(--col-text);
  font-weight: 700;
}

.sb-empty {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

/* Bar */
.sb-bar {
  display: flex;
  height: 28px;
  border-radius: 9999px;
  overflow: hidden;
  gap: 2px;
  background: var(--col-border);
}
.sb-seg {
  flex-shrink: 0;
  flex-basis: 0;
  height: 100%;
  transition: opacity .15s;
  cursor: default;
  min-width: 4px;
}
.sb-seg--dim { opacity: .3; }

/* Hover feedback row below bar */
.sb-hover-label {
  height: 1.375rem;
  margin-top: .5rem;
  font-size: .8rem;
  color: var(--col-muted);
  display: flex;
  align-items: center;
  gap: .375rem;
}
.sb-hover-dot {
  display: inline-block;
  width: .5rem;
  height: .5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Legend */
.sb-legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px .5rem;
  margin-top: .625rem;
  padding-top: .625rem;
  border-top: 1px solid var(--col-border-lt);
}
@media (max-width: 480px) {
  .sb-legend { grid-template-columns: 1fr; }
}
.sb-leg-row {
  display: flex;
  align-items: center;
  gap: .375rem;
  padding: .3rem .4rem;
  border-radius: .375rem;
  cursor: default;
  transition: background .1s;
}
.sb-leg-row:hover,
.sb-leg-row--hi { background: var(--col-raised); }
.sb-leg-row--zero { opacity: .45; }

.sb-dot {
  width: .5rem;
  height: .5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.sb-leg-label {
  font-size: .8125rem;
  color: var(--col-text);
  flex: 1;
  white-space: nowrap;
}
.sb-leg-count {
  font-size: .8125rem;
  font-weight: 600;
  color: var(--col-text);
  min-width: 1.25rem;
  text-align: right;
}
.sb-leg-pct {
  font-size: .75rem;
  color: var(--col-muted);
  min-width: 2.25rem;
  text-align: right;
}
</style>
