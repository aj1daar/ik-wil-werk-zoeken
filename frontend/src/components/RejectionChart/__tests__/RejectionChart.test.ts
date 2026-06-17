import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import type { Application } from '../../../api'

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

import RejectionChart from '../RejectionChart.vue'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    companyName: 'Acme',
    position: 'Dev',
    appliedAt: '2025-01-15T00:00:00Z',
    status: 'Rejected',
    locations: [],
    updatedAt: '2025-01-20T00:00:00Z',
    ...overrides,
  }
}

function mountChart(applications: Application[] = [], from?: string, to?: string) {
  return mount(RejectionChart, { props: { applications, from, to } })
}

function getOption(w: VueWrapper<any>) {
  return w.findComponent({ name: 'VChart' }).props('option') as any
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('RejectionChart – rendering', () => {
  it('renders without throwing', () => {
    expect(() => mountChart()).not.toThrow()
  })

  it('renders the "Rejection breakdown" title', () => {
    expect(mountChart().find('.chart-title').text()).toBe('Rejection breakdown')
  })

  it('shows generic empty state when no applications at all', () => {
    const w = mountChart([])
    expect(w.find('.chart-empty').exists()).toBe(true)
    expect(w.find('.chart-empty').text()).toBe('No rejections yet.')
    expect(w.find('.mock-chart').exists()).toBe(false)
  })

  it('shows generic empty state when applications exist but none are Rejected', () => {
    const w = mountChart([makeApp({ status: 'Applied' }), makeApp({ status: 'Accepted' })])
    expect(w.find('.chart-empty').exists()).toBe(true)
    expect(w.find('.chart-empty').text()).toBe('No rejections yet.')
  })

  it('shows period empty state when a date range is set', () => {
    const w = mountChart([], '2025-01-01T00:00:00Z')
    expect(w.find('.chart-empty').text()).toBe('No rejections in this period.')
  })

  it('shows chart when at least one Rejected application exists', () => {
    const w = mountChart([makeApp()])
    expect(w.find('.mock-chart').exists()).toBe(true)
    expect(w.find('.chart-empty').exists()).toBe(false)
  })
})

// ── rejection counting ────────────────────────────────────────────────────────

describe('RejectionChart – rejection counting', () => {
  it('counts rejections by known reason', () => {
    const apps = [
      makeApp({ rejectionReason: 'another_candidate' }),
      makeApp({ rejectionReason: 'another_candidate' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
    ]
    const w = mountChart(apps)
    const items = w.findAll('.donut-legend-item')
    const labels = items.map(i => i.find('.donut-legend-label').text())
    const counts = items.map(i => i.find('.donut-legend-count').text())
    expect(labels).toContain('Another candidate selected')
    expect(counts[labels.indexOf('Another candidate selected')]).toBe('2')
    expect(labels).toContain('Salary mismatch')
    expect(counts[labels.indexOf('Salary mismatch')]).toBe('1')
  })

  it('groups applications with no reason under "No reason given"', () => {
    const apps = [makeApp(), makeApp()]
    const w = mountChart(apps)
    const items = w.findAll('.donut-legend-item')
    const labels = items.map(i => i.find('.donut-legend-label').text())
    const counts = items.map(i => i.find('.donut-legend-count').text())
    expect(labels).toContain('No reason given')
    expect(counts[labels.indexOf('No reason given')]).toBe('2')
  })

  it('only renders legend items with value > 0', () => {
    const apps = [makeApp({ rejectionReason: 'other' })]
    const w = mountChart(apps)
    const labels = w.findAll('.donut-legend-label').map(l => l.text())
    expect(labels).toContain('Other')
    expect(labels).not.toContain('Dutch language requirement')
    expect(labels).not.toContain('Salary mismatch')
  })

  it('ignores non-Rejected applications', () => {
    const apps = [
      makeApp({ status: 'Applied' }),
      makeApp({ status: 'Accepted' }),
      makeApp({ status: 'Rejected', rejectionReason: 'internal_hire' }),
    ]
    const w = mountChart(apps)
    const items = w.findAll('.donut-legend-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.donut-legend-label').text()).toBe('Filled internally')
    expect(items[0].find('.donut-legend-count').text()).toBe('1')
  })

  it('legend shows only top 2 when more than 2 reasons exist', () => {
    const reasons = ['dutch_language', 'another_candidate', 'incompatible_profile', 'salary_mismatch', 'internal_hire', 'failed_assessment', 'no_vacancies', 'other'] as const
    const apps = reasons.map(r => makeApp({ rejectionReason: r }))
    const w = mountChart(apps)
    expect(w.findAll('.donut-legend-item')).toHaveLength(2)
  })

  it('failed_assessment is recognised as a distinct rejection reason', () => {
    const w = mountChart([makeApp({ rejectionReason: 'failed_assessment' })])
    const items = w.findAll('.donut-legend-item')
    const labels = items.map(i => i.find('.donut-legend-label').text())
    expect(labels).toContain('Did not pass assessment')
    expect(items[labels.indexOf('Did not pass assessment')].find('.donut-legend-count').text()).toBe('1')
  })

  it('failed_assessment and other are counted independently', () => {
    const apps = [
      makeApp({ rejectionReason: 'failed_assessment' }),
      makeApp({ rejectionReason: 'failed_assessment' }),
      makeApp({ rejectionReason: 'other' }),
    ]
    const w = mountChart(apps)
    const items = w.findAll('.donut-legend-item')
    const labels = items.map(i => i.find('.donut-legend-label').text())
    const counts = items.map(i => i.find('.donut-legend-count').text())
    expect(counts[labels.indexOf('Did not pass assessment')]).toBe('2')
    expect(counts[labels.indexOf('Other')]).toBe('1')
  })
})

// ── date range filtering ──────────────────────────────────────────────────────

describe('RejectionChart – date range filtering', () => {
  const inside  = makeApp({ appliedAt: '2025-06-01T00:00:00Z', rejectionReason: 'other' })
  const outside = makeApp({ appliedAt: '2025-01-01T00:00:00Z', rejectionReason: 'other' })

  it('includes applications within the range', () => {
    const w = mountChart([inside, outside], '2025-05-01T00:00:00Z', '2025-07-01T00:00:00Z')
    const counts = w.findAll('.donut-legend-count')
    expect(counts[0].text()).toBe('1')
  })

  it('shows empty state when all rejections fall outside the range', () => {
    const w = mountChart([outside], '2025-05-01T00:00:00Z', '2025-07-01T00:00:00Z')
    expect(w.find('.chart-empty').exists()).toBe(true)
  })

  it('applies no filter when from/to are omitted', () => {
    const w = mountChart([inside, outside])
    const counts = w.findAll('.donut-legend-count')
    expect(counts[0].text()).toBe('2')
  })
})

// ── chart option ──────────────────────────────────────────────────────────────

describe('RejectionChart – chart option', () => {
  it('option series type is "pie"', () => {
    expect(getOption(mountChart([makeApp()])).series[0].type).toBe('pie')
  })

  it('series radius is donut-shaped', () => {
    const radius = getOption(mountChart([makeApp()])).series[0].radius
    expect(Array.isArray(radius)).toBe(true)
    expect(radius[0]).toBeTruthy()
  })

  it('chart data contains all non-zero buckets', () => {
    const apps = [
      makeApp({ rejectionReason: 'other' }),
      makeApp({ rejectionReason: 'other' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
    ]
    const data = getOption(mountChart(apps)).series[0].data
    expect(data).toHaveLength(2)
    const names = data.map((d: any) => d.name)
    expect(names).toContain('Other')
    expect(names).toContain('Salary mismatch')
  })

  it('each data entry has an itemStyle color', () => {
    const data = getOption(mountChart([makeApp()])).series[0].data
    for (const d of data) {
      expect(d.itemStyle?.color).toBeTruthy()
    }
  })

  it('has a tooltip', () => {
    expect(getOption(mountChart([makeApp()])).tooltip).toBeTruthy()
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('RejectionChart – reactivity', () => {
  it('updates when applications prop changes', async () => {
    const w = mountChart([makeApp({ rejectionReason: 'other' })])
    expect(w.findAll('.donut-legend-item')).toHaveLength(1)

    await w.setProps({
      applications: [
        makeApp({ rejectionReason: 'other' }),
        makeApp({ rejectionReason: 'salary_mismatch' }),
      ],
    })
    expect(w.findAll('.donut-legend-item')).toHaveLength(2)
  })

  it('switches from chart to empty when all rejections are removed', async () => {
    const w = mountChart([makeApp()])
    expect(w.find('.mock-chart').exists()).toBe(true)

    await w.setProps({ applications: [makeApp({ status: 'Applied' })] })
    expect(w.find('.chart-empty').exists()).toBe(true)
  })
})
