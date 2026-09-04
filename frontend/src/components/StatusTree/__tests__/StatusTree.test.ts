import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusTree from '../StatusTree.vue'
import type { StatusFlow } from '../../../api'

function mountTree(flow: StatusFlow | null) {
  return mount(StatusTree, { props: { flow } })
}

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
