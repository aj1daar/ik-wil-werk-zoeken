import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FunnelChart from '../FunnelChart.vue'

function mountChart(byStatus: Record<string, number> = {}) {
  return mount(FunnelChart, { props: { byStatus } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('FunnelChart – rendering', () => {
  it('renders without throwing', () => {
    expect(() => mountChart()).not.toThrow()
  })

  it('renders the "Application Status" title', () => {
    const w = mountChart({ Applied: 5 })
    expect(w.find('.sb-title').text()).toBe('Application Status')
  })

  it('shows empty state when byStatus is empty', () => {
    const w = mountChart({})
    expect(w.find('.sb-empty').exists()).toBe(true)
    expect(w.find('.sb-bar').exists()).toBe(false)
  })

  it('shows empty state when all counts are zero', () => {
    const w = mountChart({ Applied: 0, Rejected: 0 })
    expect(w.find('.sb-empty').exists()).toBe(true)
  })

  it('shows the bar when at least one status has count > 0', () => {
    const w = mountChart({ Applied: 5 })
    expect(w.find('.sb-empty').exists()).toBe(false)
    expect(w.find('.sb-bar').exists()).toBe(true)
  })

  it('shows total count in the header', () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    expect(w.find('.sb-total').text()).toContain('13')
  })

  it('shows empty state — not total — when byStatus has only non-zero terminal statuses', () => {
    const w = mountChart({ Rejected: 3 })
    expect(w.find('.sb-bar').exists()).toBe(true)
    expect(w.find('.sb-total').text()).toContain('3')
  })
})

// ── bar segments ──────────────────────────────────────────────────────────────

describe('FunnelChart – bar segments', () => {
  it('renders one segment per status with count > 0', () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    expect(w.findAll('.sb-seg')).toHaveLength(2)
  })

  it('renders no segments for zero-count statuses', () => {
    const w = mountChart({ Applied: 10 })
    expect(w.findAll('.sb-seg')).toHaveLength(1)
  })

  it('segment flex-grow reflects count', () => {
    const w = mountChart({ Applied: 10, Rejected: 5 })
    const segs = w.findAll('.sb-seg')
    const grows = segs.map(s => (s.element as HTMLElement).style.flexGrow)
    expect(grows).toContain('10')
    expect(grows).toContain('5')
  })

  it('renders all 7 segments when all statuses have counts', () => {
    const w = mountChart({
      Applied: 10, InterviewScheduled: 4, OfferReceived: 2, Accepted: 1,
      OnHold: 1, Rejected: 3, Withdrawn: 2,
    })
    expect(w.findAll('.sb-seg')).toHaveLength(7)
  })
})

// ── legend ────────────────────────────────────────────────────────────────────

describe('FunnelChart – legend', () => {
  it('renders 7 legend rows always', () => {
    const w = mountChart({ Applied: 10 })
    expect(w.findAll('.sb-leg-row')).toHaveLength(7)
  })

  it('zero-count rows have the dim class', () => {
    const w = mountChart({ Applied: 10 })
    const zeroRows = w.findAll('.sb-leg-row--zero')
    expect(zeroRows.length).toBe(6)
  })

  it('non-zero rows do not have the dim class', () => {
    const w = mountChart({ Applied: 10 })
    const activeRows = w.findAll('.sb-leg-row:not(.sb-leg-row--zero)')
    expect(activeRows).toHaveLength(1)
  })

  it('legend shows correct count for Applied', () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    const rows = w.findAll('.sb-leg-row')
    const appliedRow = rows.find(r => r.text().includes('Applied'))
    expect(appliedRow?.find('.sb-leg-count').text()).toBe('10')
  })

  it('legend shows — for percentage when count is 0', () => {
    const w = mountChart({ Applied: 5 })
    const rows = w.findAll('.sb-leg-row')
    const rejectedRow = rows.find(r => r.text().includes('Rejected'))
    expect(rejectedRow?.find('.sb-leg-pct').text()).toBe('—')
  })

  it('legend shows percentage for non-zero statuses', () => {
    const w = mountChart({ Applied: 1, Rejected: 1 })
    const rows = w.findAll('.sb-leg-row')
    const appliedRow = rows.find(r => r.text().includes('Applied'))
    expect(appliedRow?.find('.sb-leg-pct').text()).toBe('50%')
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('FunnelChart – reactivity', () => {
  it('updates segment count when prop changes', async () => {
    const w = mountChart({ Applied: 5 })
    expect(w.findAll('.sb-seg')).toHaveLength(1)
    await w.setProps({ byStatus: { Applied: 5, Rejected: 3 } })
    expect(w.findAll('.sb-seg')).toHaveLength(2)
  })

  it('switches from empty to bar when data arrives', async () => {
    const w = mountChart({})
    expect(w.find('.sb-empty').exists()).toBe(true)
    await w.setProps({ byStatus: { Applied: 3 } })
    expect(w.find('.sb-empty').exists()).toBe(false)
    expect(w.find('.sb-bar').exists()).toBe(true)
  })

  it('updates total when prop changes', async () => {
    const w = mountChart({ Applied: 5 })
    expect(w.find('.sb-total').text()).toContain('5')
    await w.setProps({ byStatus: { Applied: 5, Rejected: 3 } })
    expect(w.find('.sb-total').text()).toContain('8')
  })
})
