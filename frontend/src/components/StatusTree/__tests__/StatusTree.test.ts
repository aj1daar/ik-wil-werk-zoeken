import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatusTree from '../StatusTree.vue'
import type { StatusFlow } from '../../../api'

function mountTree(flow: StatusFlow | null) {
  return mount(StatusTree, { props: { flow } })
}

// happy-dom never lays anything out, so fake the card width the tree sees
function stubContainerWidth(width: number) {
  vi.stubGlobal('ResizeObserver', class {
    cb: (entries: { contentRect: { width: number } }[]) => void
    constructor(cb: (entries: { contentRect: { width: number } }[]) => void) { this.cb = cb }
    observe() { this.cb([{ contentRect: { width } }]) }
    disconnect() {}
  })
}

// A wide tree: four statuses in the bottom row (svg width 4 × 168 + 88 = 760)
const WIDE_FLOW: StatusFlow = {
  nodes: [
    { status: 'Applied',   total: 10, current: 3 },
    { status: 'OnHold',    total: 1,  current: 1 },
    { status: 'Rejected',  total: 4,  current: 4 },
    { status: 'Withdrawn', total: 1,  current: 1 },
    { status: 'Ghosted',   total: 1,  current: 1 },
  ],
  edges: [
    { from: 'Applied', to: 'OnHold',    count: 1 },
    { from: 'Applied', to: 'Rejected',  count: 4 },
    { from: 'Applied', to: 'Withdrawn', count: 1 },
    { from: 'Applied', to: 'Ghosted',   count: 1 },
  ],
}

describe('StatusTree – narrow screens', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stops shrinking at 75% and scrolls instead of drawing unreadable labels', async () => {
    stubContainerWidth(300)
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    expect(Number(w.find('svg').attributes('width'))).toBeCloseTo(760 * 0.75)
  })

  it('shrinks to fit when the card is only a little narrower than the tree', async () => {
    stubContainerWidth(700)
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    expect(Number(w.find('svg').attributes('width'))).toBeCloseTo(700)
  })

  it('never scales the tree up past its natural size', async () => {
    stubContainerWidth(2000)
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    expect(Number(w.find('svg').attributes('width'))).toBeCloseTo(760)
  })

  it('adds a plain status list when the tree is cramped', async () => {
    stubContainerWidth(300)
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    const items = w.findAll('.st-list-item')
    expect(items.map(i => i.find('.st-list-label').text())).toEqual(['Applied', 'On hold', 'Rejected', 'Withdrawn', 'Ghosted'])
    expect(items[0].find('.st-list-total').text()).toBe('10')
    expect(items[0].find('.st-list-now').text()).toBe('3 there now')
    expect(items[2].find('.st-list-now').exists()).toBe(false) // total === current
  })

  it('leaves the list out when the tree fits comfortably', async () => {
    stubContainerWidth(1200)
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    expect(w.find('.st-list').exists()).toBe(false)
  })

  it('shows no list for an empty flow, however narrow the card', async () => {
    stubContainerWidth(200)
    const w = mountTree({ nodes: [], edges: [] })
    await flushPromises()
    expect(w.find('.st-list').exists()).toBe(false)
  })

  it('the scrolling area can take keyboard focus and has a name', async () => {
    const w = mountTree(WIDE_FLOW)
    await flushPromises()
    const scroll = w.find('.st-scroll')
    expect(scroll.attributes('tabindex')).toBe('0')
    expect(scroll.attributes('role')).toBe('region')
    expect(scroll.attributes('aria-label')).toBe('Application journey tree')
  })

  it('uses sentence-case status labels', async () => {
    stubContainerWidth(300)
    const w = mountTree({
      nodes: [{ status: 'Applied', total: 2, current: 0 }, { status: 'OfferReceived', total: 1, current: 1 }, { status: 'OnHold', total: 1, current: 1 }],
      edges: [{ from: 'Applied', to: 'OfferReceived', count: 1 }, { from: 'Applied', to: 'OnHold', count: 1 }],
    })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Offer received')
    expect(text).toContain('On hold')
    expect(text).not.toContain('Offer Received')
  })
})

// ── empty state ──────────────────────────────────────────────────────────────

describe('StatusTree – empty state', () => {
  it('renders without throwing', () => {
    expect(() => mountTree(null)).not.toThrow()
  })

  it('shows empty state when flow is null', () => {
    const w = mountTree(null)
    expect(w.find('.st-empty').exists()).toBe(true)
    expect(w.find('svg').exists()).toBe(false)
  })

  it('shows empty state when there are no nodes', () => {
    const w = mountTree({ nodes: [], edges: [] })
    expect(w.find('.st-empty').exists()).toBe(true)
  })

  it('shows empty state when Applied has zero total', () => {
    const w = mountTree({ nodes: [{ status: 'Applied', total: 0, current: 0 }], edges: [] })
    expect(w.find('.st-empty').exists()).toBe(true)
  })
})

// ── nodes ────────────────────────────────────────────────────────────────────

describe('StatusTree – nodes', () => {
  it('renders one node per status present in the data', () => {
    const w = mountTree({
      nodes: [
        { status: 'Applied', total: 10, current: 4 },
        { status: 'InterviewScheduled', total: 6, current: 6 },
      ],
      edges: [{ from: 'Applied', to: 'InterviewScheduled', count: 6 }],
    })
    expect(w.findAll('.st-node')).toHaveLength(2)
  })

  it('shows total count in the header', () => {
    const w = mountTree({ nodes: [{ status: 'Applied', total: 12, current: 12 }], edges: [] })
    expect(w.find('.st-total').text()).toContain('12')
  })

  it('shows a "N now" badge when current differs from total', () => {
    const w = mountTree({
      nodes: [
        { status: 'Applied', total: 10, current: 3 },
        { status: 'Rejected', total: 7, current: 7 },
      ],
      edges: [{ from: 'Applied', to: 'Rejected', count: 7 }],
    })
    const text = w.find('.st-node-current').text()
    expect(text).toContain('3')
    expect(text).toContain('now')
  })

  it('does not show a "now" badge for a terminal node where current equals total', () => {
    const w = mountTree({
      nodes: [
        { status: 'Applied', total: 5, current: 0 },
        { status: 'Rejected', total: 5, current: 5 },
      ],
      edges: [{ from: 'Applied', to: 'Rejected', count: 5 }],
    })
    expect(w.findAll('.st-node-current')).toHaveLength(1)
  })
})

// ── edges ────────────────────────────────────────────────────────────────────

describe('StatusTree – edges', () => {
  it('renders one path per edge with a count label', () => {
    const w = mountTree({
      nodes: [
        { status: 'Applied', total: 10, current: 2 },
        { status: 'InterviewScheduled', total: 5, current: 5 },
        { status: 'Rejected', total: 3, current: 3 },
      ],
      edges: [
        { from: 'Applied', to: 'InterviewScheduled', count: 5 },
        { from: 'Applied', to: 'Rejected', count: 3 },
      ],
    })
    expect(w.findAll('path')).toHaveLength(2)
    const labels = w.findAll('.st-edge-label').map(l => l.text())
    expect(labels).toContain('5')
    expect(labels).toContain('3')
  })

  it('skips an edge whose endpoint status has no node in this range', () => {
    const w = mountTree({
      nodes: [{ status: 'Applied', total: 5, current: 5 }],
      edges: [{ from: 'Applied', to: 'Rejected', count: 2 }],
    })
    expect(w.findAll('path')).toHaveLength(0)
  })
})

// ── hover / tap toggle ───────────────────────────────────────────────────────

describe('StatusTree – hover toggle', () => {
  it('tapping a node shows its hover label with total and current', async () => {
    const w = mountTree({
      nodes: [
        { status: 'Applied', total: 10, current: 4 },
        { status: 'OnHold', total: 6, current: 6 },
      ],
      edges: [{ from: 'Applied', to: 'OnHold', count: 6 }],
    })
    await w.findAll('.st-node')[0].trigger('click')
    expect(w.find('.st-hover-label').text()).toContain('Applied')
    expect(w.find('.st-hover-label').text()).toContain('10')
    expect(w.find('.st-hover-label').text()).toContain('4')
  })

  it('tapping the same node again clears the hover label', async () => {
    const w = mountTree({ nodes: [{ status: 'Applied', total: 10, current: 10 }], edges: [] })
    const node = w.findAll('.st-node')[0]
    await node.trigger('click')
    await node.trigger('click')
    expect(w.find('.st-hover-label').text()).not.toContain('Applied')
  })
})
