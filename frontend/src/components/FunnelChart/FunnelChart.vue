<template>
  <div class="funnel-wrap">
    <h3 class="funnel-title">Application funnel</h3>
    <div v-if="isEmpty" class="funnel-empty">No applications to display.</div>
    <template v-else>
      <v-chart class="funnel-chart" :option="option" autoresize />
      <div v-if="didNotProceed > 0" class="funnel-aside">
        <span class="funnel-aside-count">{{ didNotProceed }}</span>
        <span class="funnel-aside-label">did not proceed (Rejected / Withdrawn / On Hold)</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { FunnelChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, FunnelChart, TooltipComponent])

const props = defineProps<{
  byStatus: Record<string, number>
}>()

const STAGES = [
  { key: 'Applied',             label: 'Applied' },
  { key: 'InterviewScheduled',  label: 'Interviewing' },
  { key: 'OfferReceived',       label: 'Offer Received' },
  { key: 'Accepted',            label: 'Accepted' },
] as const

const stageData = computed(() =>
  STAGES.map(s => ({ name: s.label, value: props.byStatus[s.key] ?? 0 }))
)

const isEmpty = computed(() => stageData.value.every(d => d.value === 0))

const didNotProceed = computed(() =>
  (props.byStatus['Rejected']  ?? 0) +
  (props.byStatus['Withdrawn'] ?? 0) +
  (props.byStatus['OnHold']    ?? 0)
)

const option = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c}' },
  series: [{
    type: 'funnel',
    sort: 'none',
    gap: 4,
    label: { show: true, position: 'inside', formatter: '{b}\n{c}' },
    data: stageData.value,
    color: ['#6366f1', '#8b5cf6', '#a78bfa', '#34d399'],
  }],
}))
</script>

<style scoped>
.funnel-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--col-text) 4%, transparent);
}

.funnel-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
  margin: 0 0 .75rem;
}

.funnel-chart { height: 260px; width: 100%; }

.funnel-empty {
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

.funnel-aside {
  margin-top: .75rem;
  padding-top: .75rem;
  border-top: 1px solid var(--col-border);
  display: flex;
  align-items: baseline;
  gap: .5rem;
}
.funnel-aside-count {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--col-text);
}
.funnel-aside-label {
  font-size: .8rem;
  color: var(--col-muted);
}
</style>
