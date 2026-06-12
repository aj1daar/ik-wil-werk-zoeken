import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '../HomeView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
  }
}))

import { api } from '../../../api'

function makeStats(total = 0, byStatus = {}) {
  return { total, byStatus }
}

function mountHome() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(HomeView, { global: { plugins: [pinia] } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('HomeView – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Dashboard heading', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    expect(w.find('h1').text()).toBe('Dashboard')
  })

  it('renders all five range buttons', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const buttons = w.findAll('button.range-btn')
    expect(buttons).toHaveLength(5)
    const labels = buttons.map(b => b.text())
    expect(labels).toContain('Overall')
    expect(labels).toContain('Last 3 months')
    expect(labels).toContain('Last 6 months')
    expect(labels).toContain('Last year')
    expect(labels).toContain('Custom')
  })

  it('"Overall" button is active by default', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const overallBtn = w.findAll('button.range-btn').find(b => b.text() === 'Overall')
    expect(overallBtn?.classes()).toContain('range-btn--active')
  })

  it('custom date inputs are hidden until Custom is selected', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    expect(w.find('.custom-range').exists()).toBe(false)
  })
})

// ── range selection ───────────────────────────────────────────────────────────

describe('HomeView – range selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking a range button makes it active', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    expect(threeMonthBtn?.classes()).toContain('range-btn--active')
  })

  it('clicking "Custom" shows the date inputs', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    expect(w.find('.custom-range').exists()).toBe(true)
    expect(w.findAll('input[type="date"]')).toHaveLength(2)
  })

  it('clicking a range button calls api.getStats again', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const callsAfterMount = vi.mocked(api.getStats).mock.calls.length

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(api.getStats).mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('3m button passes from/to to getStats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()
  })

  it('"Overall" button passes no date params to getStats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    // Re-click Overall to trigger watch
    const overallBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await overallBtn!.trigger('click')
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    const overall = w.findAll('button.range-btn').find(b => b.text() === 'Overall')
    await overall!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeUndefined()
    expect(to).toBeUndefined()
  })
})

// ── stats display ─────────────────────────────────────────────────────────────

describe('HomeView – stats display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows total count from stats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(17, {}))
    const w = mountHome()
    await flushPromises()
    expect(w.find('.total-number').text()).toBe('17')
  })

  it('shows a stat card for each of the 7 statuses', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(0, {}))
    const w = mountHome()
    await flushPromises()
    expect(w.findAll('.stat-card')).toHaveLength(7)
  })

  it('shows 0 for statuses with no count', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(3, { Applied: 3 }))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.stat-card')
    const rejectedCard = cards.find(c => c.text().includes('Rejected'))
    expect(rejectedCard?.find('.stat-count').text()).toBe('0')
  })

  it('shows correct count for a status', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(5, { Applied: 5 }))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.stat-card')
    const appliedCard = cards.find(c => c.text().includes('Applied'))
    expect(appliedCard?.find('.stat-count').text()).toBe('5')
  })

  it('calls getStats once on mount', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    mountHome()
    await flushPromises()
    expect(api.getStats).toHaveBeenCalledTimes(1)
  })
})
