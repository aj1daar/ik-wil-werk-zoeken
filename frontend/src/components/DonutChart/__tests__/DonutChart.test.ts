import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'

vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ PieChart: {} }))
vi.mock('echarts/components', () => ({ TooltipComponent: {} }))
vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="mock-chart" />',
  }),
}))

import DonutChart from '../DonutChart.vue'

function mountDonut(byStatus: Record<string, number> = {}) {
  return mount(DonutChart, { props: { byStatus } })
}

function getOption(w: VueWrapper<any>) {
  return w.findComponent({ name: 'VChart' }).props('option') as any
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('DonutChart – rendering', () => {
  it('renders without throwing', () => {
    expect(() => mountDonut()).not.toThrow()
  })

  it('renders the "Status breakdown" title', () => {
    expect(mountDonut({ Applied: 1 }).find('.chart-title').text()).toBe('Status breakdown')
  })

  it('shows empty state when all counts are zero', () => {
    const w = mountDonut({})
    expect(w.find('.chart-empty').exists()).toBe(true)
    expect(w.find('.mock-chart').exists()).toBe(false)
  })

  it('shows chart when at least one count is non-zero', () => {
    const w = mountDonut({ Applied: 3 })
    expect(w.find('.mock-chart').exists()).toBe(true)
    expect(w.find('.chart-empty').exists()).toBe(false)
  })

  it('renders 4 legend items', () => {
    const w = mountDonut({ Applied: 5 })
    expect(w.findAll('.donut-legend-item')).toHaveLength(4)
  })

  it('legend labels are Active, In Progress, Accepted, Declined', () => {
    const w = mountDonut({ Applied: 1 })
    const labels = w.findAll('.donut-legend-label').map(l => l.text())
    expect(labels).toEqual(['Active', 'In Progress', 'Accepted', 'Declined'])
  })
})

// ── bucket aggregation ────────────────────────────────────────────────────────

describe('DonutChart – bucket aggregation', () => {
  it('Active bucket = Applied + OnHold', () => {
    const w = mountDonut({ Applied: 4, OnHold: 2 })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[0]).toBe('6')
  })

  it('In Progress bucket = InterviewScheduled + OfferReceived', () => {
    const w = mountDonut({ InterviewScheduled: 3, OfferReceived: 1 })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[1]).toBe('4')
  })

  it('Accepted bucket = Accepted only', () => {
    const w = mountDonut({ Accepted: 2 })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[2]).toBe('2')
  })

  it('Declined bucket = Rejected + Withdrawn', () => {
    const w = mountDonut({ Rejected: 5, Withdrawn: 3 })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[3]).toBe('8')
  })

  it('missing keys default to 0 within a bucket', () => {
    const w = mountDonut({ Applied: 7 })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[0]).toBe('7')
    expect(counts[1]).toBe('0')
    expect(counts[2]).toBe('0')
    expect(counts[3]).toBe('0')
  })

  it('all buckets sum correctly across a full status set', () => {
    const w = mountDonut({
      Applied: 10, OnHold: 2,
      InterviewScheduled: 3, OfferReceived: 1,
      Accepted: 1,
      Rejected: 4, Withdrawn: 1,
    })
    const counts = w.findAll('.donut-legend-count').map(c => Number(c.text()))
    expect(counts[0]).toBe(12) // Active
    expect(counts[1]).toBe(4)  // In Progress
    expect(counts[2]).toBe(1)  // Accepted
    expect(counts[3]).toBe(5)  // Declined
  })
})

// ── chart option ──────────────────────────────────────────────────────────────

describe('DonutChart – chart option', () => {
  it('option series type is "pie"', () => {
    expect(getOption(mountDonut({ Applied: 1 })).series[0].type).toBe('pie')
  })

  it('series radius is donut-shaped (inner radius > 0)', () => {
    const radius = getOption(mountDonut({ Applied: 1 })).series[0].radius
    expect(Array.isArray(radius)).toBe(true)
    expect(radius[0]).toBeTruthy()
    expect(radius[1]).toBeTruthy()
  })

  it('chart data has 4 entries matching the 4 buckets', () => {
    const data = getOption(mountDonut({ Applied: 3 })).series[0].data
    expect(data).toHaveLength(4)
  })

  it('chart data names match bucket labels', () => {
    const names = getOption(mountDonut({ Applied: 1 })).series[0].data.map((d: any) => d.name)
    expect(names).toEqual(['Active', 'In Progress', 'Accepted', 'Declined'])
  })

  it('chart data values match computed bucket values', () => {
    const byStatus = { Applied: 5, OnHold: 1, InterviewScheduled: 2, Rejected: 3 }
    const data = getOption(mountDonut(byStatus)).series[0].data
    expect(data.find((d: any) => d.name === 'Active').value).toBe(6)
    expect(data.find((d: any) => d.name === 'In Progress').value).toBe(2)
    expect(data.find((d: any) => d.name === 'Declined').value).toBe(3)
  })

  it('each data entry has an itemStyle color', () => {
    const data = getOption(mountDonut({ Applied: 1 })).series[0].data
    for (const d of data) {
      expect(d.itemStyle?.color).toBeTruthy()
    }
  })

  it('has a tooltip', () => {
    expect(getOption(mountDonut({ Applied: 1 })).tooltip).toBeTruthy()
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('DonutChart – reactivity', () => {
  it('updates legend counts when byStatus prop changes', async () => {
    const w = mountDonut({ Applied: 2 })
    await w.setProps({ byStatus: { Applied: 10, Rejected: 5 } })
    const counts = w.findAll('.donut-legend-count').map(c => c.text())
    expect(counts[0]).toBe('10') // Active
    expect(counts[3]).toBe('5')  // Declined
  })

  it('switches from empty to chart when data arrives', async () => {
    const w = mountDonut({})
    expect(w.find('.chart-empty').exists()).toBe(true)
    await w.setProps({ byStatus: { Accepted: 1 } })
    expect(w.find('.mock-chart').exists()).toBe(true)
  })
})
