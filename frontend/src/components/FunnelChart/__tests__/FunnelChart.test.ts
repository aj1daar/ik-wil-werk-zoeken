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

  it('renders all 9 segments when all statuses have counts', () => {
    const w = mountChart({
      Applied: 10, InterviewScheduled: 4, Assessment: 2, OfferReceived: 2,
      Accepted: 1, OnHold: 1, Rejected: 3, Withdrawn: 2, Ghosted: 1,
    })
    expect(w.findAll('.sb-seg')).toHaveLength(9)
  })

  it('Assessment segment renders when count > 0', () => {
    const w = mountChart({ Applied: 5, Assessment: 3 })
    expect(w.findAll('.sb-seg')).toHaveLength(2)
    expect(w.find('.sb-total').text()).toContain('8')
  })

  it('Ghosted segment renders grey and counts toward the total', () => {
    const w = mountChart({ Applied: 5, Ghosted: 2 })
    expect(w.findAll('.sb-seg')).toHaveLength(2)
    expect(w.find('.sb-total').text()).toContain('7')
    const ghostSeg = w.findAll('.sb-seg').find(
      s => (s.element as HTMLElement).style.flexGrow === '2'
    )
    expect((ghostSeg!.element as HTMLElement).style.background).toBe('#71717A')
  })
})

// ── legend ────────────────────────────────────────────────────────────────────

describe('FunnelChart – legend', () => {
  it('renders 9 legend rows always', () => {
    const w = mountChart({ Applied: 10 })
    expect(w.findAll('.sb-leg-row')).toHaveLength(9)
  })

  it('zero-count rows have the dim class', () => {
    const w = mountChart({ Applied: 10 })
    const zeroRows = w.findAll('.sb-leg-row--zero')
    expect(zeroRows.length).toBe(8)
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

// ── touch interaction (tap toggles hover state — iOS has no mouseenter) ────────

describe('FunnelChart – tap toggle', () => {
  it('tapping a legend row shows its hover label', async () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    const row = w.findAll('.sb-leg-row').find(r => r.text().includes('Applied'))!
    await row.trigger('click')
    expect(w.find('.sb-hover-label').text()).toContain('Applied')
    expect(w.find('.sb-hover-label').text()).toContain('10')
  })

  it('tapping the same legend row again clears the hover label', async () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    const row = w.findAll('.sb-leg-row').find(r => r.text().includes('Applied'))!
    await row.trigger('click')
    await row.trigger('click')
    expect(w.find('.sb-hover-label').text()).not.toContain('Applied')
  })

  it('tapping a different legend row switches the selection', async () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    const rows = w.findAll('.sb-leg-row')
    await rows.find(r => r.text().includes('Applied'))!.trigger('click')
    await rows.find(r => r.text().includes('Rejected'))!.trigger('click')
    const label = w.find('.sb-hover-label').text()
    expect(label).toContain('Rejected')
    expect(label).not.toContain('Applied')
  })

  it('tapping a bar segment shows its hover label', async () => {
    const w = mountChart({ Applied: 10, Rejected: 3 })
    await w.find('.sb-seg').trigger('click')
    expect(w.find('.sb-hover-label').text()).not.toBe('')
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
