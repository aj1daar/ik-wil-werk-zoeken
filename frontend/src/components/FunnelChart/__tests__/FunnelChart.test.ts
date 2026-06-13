import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'

// Mock echarts internals so JSDOM doesn't throw on canvas operations
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ FunnelChart: {} }))
vi.mock('echarts/components', () => ({ TooltipComponent: {} }))
vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="mock-chart" />',
  }),
}))

import FunnelChart from '../FunnelChart.vue'

function mountFunnel(byStatus: Record<string, number> = {}) {
  return mount(FunnelChart, { props: { byStatus } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('FunnelChart – rendering', () => {
  it('renders the component without throwing', () => {
    expect(() => mountFunnel()).not.toThrow()
  })

  it('renders the "Application funnel" title', () => {
    const w = mountFunnel({ Applied: 5 })
    expect(w.find('.funnel-title').text()).toBe('Application funnel')
  })

  it('renders the mock VChart when there is data', () => {
    const w = mountFunnel({ Applied: 3 })
    expect(w.find('.mock-chart').exists()).toBe(true)
  })

  it('shows empty state when all stage counts are zero', () => {
    const w = mountFunnel({})
    expect(w.find('.funnel-empty').exists()).toBe(true)
    expect(w.find('.mock-chart').exists()).toBe(false)
  })

  it('shows empty state when byStatus has only non-funnel keys', () => {
    const w = mountFunnel({ Rejected: 3, Withdrawn: 2 })
    expect(w.find('.funnel-empty').exists()).toBe(true)
  })

  it('hides empty state when at least one stage has count > 0', () => {
    const w = mountFunnel({ Applied: 1 })
    expect(w.find('.funnel-empty').exists()).toBe(false)
  })
})

// ── did not proceed ───────────────────────────────────────────────────────────

describe('FunnelChart – did not proceed', () => {
  it('does not show the aside when no Rejected/Withdrawn/OnHold', () => {
    const w = mountFunnel({ Applied: 10 })
    expect(w.find('.funnel-aside').exists()).toBe(false)
  })

  it('shows the aside when there are Rejected applications', () => {
    const w = mountFunnel({ Applied: 10, Rejected: 3 })
    expect(w.find('.funnel-aside').exists()).toBe(true)
  })

  it('shows the aside when there are Withdrawn applications', () => {
    const w = mountFunnel({ Applied: 10, Withdrawn: 2 })
    expect(w.find('.funnel-aside').exists()).toBe(true)
  })

  it('shows the aside when there are OnHold applications', () => {
    const w = mountFunnel({ Applied: 10, OnHold: 1 })
    expect(w.find('.funnel-aside').exists()).toBe(true)
  })

  it('sums Rejected + Withdrawn + OnHold correctly', () => {
    const w = mountFunnel({ Applied: 10, Rejected: 3, Withdrawn: 2, OnHold: 1 })
    expect(w.find('.funnel-aside-count').text()).toBe('6')
  })

  it('shows correct count for only Rejected', () => {
    const w = mountFunnel({ Applied: 10, Rejected: 5 })
    expect(w.find('.funnel-aside-count').text()).toBe('5')
  })

  it('shows correct count for only Withdrawn', () => {
    const w = mountFunnel({ Applied: 8, Withdrawn: 4 })
    expect(w.find('.funnel-aside-count').text()).toBe('4')
  })

  it('shows correct count for only OnHold', () => {
    const w = mountFunnel({ Applied: 8, OnHold: 2 })
    expect(w.find('.funnel-aside-count').text()).toBe('2')
  })

  it('aside label mentions "did not proceed"', () => {
    const w = mountFunnel({ Applied: 5, Rejected: 1 })
    expect(w.find('.funnel-aside-label').text()).toContain('did not proceed')
  })
})

// ── chart option ──────────────────────────────────────────────────────────────

describe('FunnelChart – chart option prop', () => {
  function getOption(w: VueWrapper<any>) {
    return w.findComponent({ name: 'VChart' }).props('option') as any
  }

  it('passes option prop to VChart', () => {
    const w = mountFunnel({ Applied: 5 })
    expect(getOption(w)).toBeTruthy()
  })

  it('option includes a funnel series', () => {
    const w = mountFunnel({ Applied: 5 })
    const series = getOption(w).series
    expect(Array.isArray(series)).toBe(true)
    expect(series[0].type).toBe('funnel')
  })

  it('funnel data contains all four pipeline stages', () => {
    const w = mountFunnel({ Applied: 10, InterviewScheduled: 4, OfferReceived: 2, Accepted: 1 })
    const data: { name: string; value: number }[] = getOption(w).series[0].data
    const names = data.map(d => d.name)
    expect(names).toContain('Applied')
    expect(names).toContain('Interviewing')
    expect(names).toContain('Offer Received')
    expect(names).toContain('Accepted')
  })

  it('funnel data values match byStatus counts', () => {
    const w = mountFunnel({ Applied: 10, InterviewScheduled: 4, OfferReceived: 2, Accepted: 1 })
    const data: { name: string; value: number }[] = getOption(w).series[0].data
    expect(data.find(d => d.name === 'Applied')?.value).toBe(10)
    expect(data.find(d => d.name === 'Interviewing')?.value).toBe(4)
    expect(data.find(d => d.name === 'Offer Received')?.value).toBe(2)
    expect(data.find(d => d.name === 'Accepted')?.value).toBe(1)
  })

  it('missing stages default to 0 in the funnel data', () => {
    const w = mountFunnel({ Applied: 5 })
    const data: { name: string; value: number }[] = getOption(w).series[0].data
    expect(data.find(d => d.name === 'Interviewing')?.value).toBe(0)
    expect(data.find(d => d.name === 'Offer Received')?.value).toBe(0)
    expect(data.find(d => d.name === 'Accepted')?.value).toBe(0)
  })

  it('funnel series sort is "none" to preserve stage order', () => {
    const w = mountFunnel({ Applied: 5 })
    expect(getOption(w).series[0].sort).toBe('none')
  })

  it('option includes a tooltip', () => {
    const w = mountFunnel({ Applied: 5 })
    expect(getOption(w).tooltip).toBeTruthy()
  })

  it('Rejected is not included in the funnel series data', () => {
    const w = mountFunnel({ Applied: 10, Rejected: 5 })
    const data: { name: string; value: number }[] = getOption(w).series[0].data
    expect(data.find(d => d.name === 'Rejected')).toBeUndefined()
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('FunnelChart – reactivity', () => {
  it('updates chart data when byStatus prop changes', async () => {
    const w = mountFunnel({ Applied: 5 })
    await w.setProps({ byStatus: { Applied: 20, InterviewScheduled: 8 } })
    const data = w.findComponent({ name: 'VChart' }).props('option').series[0].data
    expect(data.find((d: any) => d.name === 'Applied').value).toBe(20)
    expect(data.find((d: any) => d.name === 'Interviewing').value).toBe(8)
  })

  it('switches from empty to showing chart when data arrives', async () => {
    const w = mountFunnel({})
    expect(w.find('.funnel-empty').exists()).toBe(true)
    await w.setProps({ byStatus: { Applied: 3 } })
    expect(w.find('.funnel-empty').exists()).toBe(false)
    expect(w.find('.mock-chart').exists()).toBe(true)
  })
})
