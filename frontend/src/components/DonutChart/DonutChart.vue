<template>
  <div class="donut-wrap">
    <h3 class="chart-title">Status breakdown</h3>
    <div v-if="isEmpty" class="chart-empty">No applications to display.</div>
    <template v-else>
      <v-chart class="donut-chart" :option="option" autoresize />
      <ul class="donut-legend">
        <li v-for="b in buckets" :key="b.label" class="donut-legend-item">
          <span class="donut-legend-dot" :style="{ background: b.color }" />
          <span class="donut-legend-label">{{ b.label }}</span>
          <span class="donut-legend-count">{{ b.value }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, PieChart, TooltipComponent])

const props = defineProps<{
  byStatus: Record<string, number>
}>()

const BUCKETS = [
  {
    label: 'Active',
    color: '#3b82f6',
    keys: ['Applied', 'OnHold'],
  },
  {
    label: 'In Progress',
    color: '#8b5cf6',
    keys: ['InterviewScheduled', 'OfferReceived'],
  },
  {
    label: 'Accepted',
    color: '#10b981',
    keys: ['Accepted'],
  },
  {
    label: 'Declined',
    color: '#ef4444',
    keys: ['Rejected', 'Withdrawn'],
  },
] as const

const buckets = computed(() =>
  BUCKETS.map(b => ({
    label: b.label,
    color: b.color,
    value: b.keys.reduce((sum, k) => sum + (props.byStatus[k] ?? 0), 0),
  }))
)

const isEmpty = computed(() => buckets.value.every(b => b.value === 0))

const option = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  series: [{
    type: 'pie',
    radius: ['45%', '72%'],
    avoidLabelOverlap: false,
    label: { show: false },
    emphasis: { label: { show: false } },
    data: buckets.value.map(b => ({ name: b.label, value: b.value, itemStyle: { color: b.color } })),
  }],
}))
</script>

<style scoped>
.donut-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--col-text) 4%, transparent);
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
  margin: 0 0 .75rem;
}

.donut-chart { height: 200px; width: 100%; }

.chart-empty {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

.donut-legend {
  list-style: none;
  margin: .75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .375rem;
}

.donut-legend-item {
  display: flex;
  align-items: center;
  gap: .5rem;
  font-size: .8125rem;
}

.donut-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.donut-legend-label { flex: 1; color: var(--col-text); }
.donut-legend-count { font-weight: 600; color: var(--col-text); }
</style>
