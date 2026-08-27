import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition, TransitionGroup } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationsView from '../ApplicationsView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    bulkUpdateStatus:  vi.fn(),
  },
}))

import { api } from '../../../api'
import type { Application, Stats } from '../../../api'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-15T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

function makeStats(): Stats { return { total: 0, byStatus: {} } }

function mountView(apps: Application[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getApplications).mockResolvedValue(apps)
  vi.mocked(api.getStats).mockResolvedValue(makeStats())
  return mount(ApplicationsView, { global: { plugins: [pinia] } })
}

function transitionsByName(wrapper: ReturnType<typeof mount>, name: string) {
  return (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[])
    .filter(t => t.props('name') === name)
}

function pressKey(key: string) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

// ── modal transition wrapper ──────────────────────────────────────────────────

describe('ApplicationsView – new application modal transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a <Transition name="modal"> wrapping the new-application modal', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(transitionsByName(wrapper, 'modal').length).toBeGreaterThanOrEqual(1)
  })

  it('NewApplicationModal is absent by default', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(false)
  })

  it('NewApplicationModal appears when "New application" button is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button.btn-new').trigger('click')
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(true)
  })

  it('NewApplicationModal closes when it emits close', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button.btn-new').trigger('click')
    await wrapper.findComponent({ name: 'NewApplicationModal' }).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(false)
  })

  it('pressing N key opens the modal', async () => {
    const wrapper = mountView()
    await flushPromises()
    pressKey('n')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(true)
  })

  it('pressing N key (uppercase) also opens the modal', async () => {
    const wrapper = mountView()
    await flushPromises()
    pressKey('N')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(true)
  })
})

// ── application detail panel transition ──────────────────────────────────────

describe('ApplicationsView – application detail panel transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a <Transition name="app-detail"> wrapping the application panel', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(transitionsByName(wrapper, 'app-detail').length).toBeGreaterThanOrEqual(1)
  })
})

// ── application panel behaviour ───────────────────────────────────────────────

describe('ApplicationsView – application panel behaviour', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ApplicationPanel is absent when no application is selected', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ApplicationPanel' }).exists()).toBe(false)
  })

  it('ApplicationPanel appears when a row is clicked', async () => {
    const wrapper = mountView([makeApp()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.findComponent({ name: 'ApplicationPanel' }).exists()).toBe(true)
  })

  it('ApplicationPanel closes on Escape key', async () => {
    const wrapper = mountView([makeApp()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.findComponent({ name: 'ApplicationPanel' }).exists()).toBe(true)
    pressKey('Escape')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ApplicationPanel' }).exists()).toBe(false)
  })

  it('selecting a different row replaces the panel', async () => {
    const wrapper = mountView([makeApp({ id: 'a', companyName: 'Alpha' }), makeApp({ id: 'b', companyName: 'Beta' })])
    await flushPromises()
    const rows = wrapper.findAll('.company-row')
    await rows[0].trigger('click')
    await rows[1].trigger('click')
    const panel = wrapper.findComponent({ name: 'ApplicationPanel' })
    expect(panel.props('application').companyName).toBe('Beta')
  })
})

// ── row badges: success rate + HSM sponsor tag ────────────────────────────────

describe('ApplicationsView – row badges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success rate chip when successRate is set', async () => {
    const wrapper = mountView([makeApp({ successRate: 65 })])
    await flushPromises()
    expect(wrapper.find('.success-rate-chip').exists()).toBe(true)
    expect(wrapper.find('.success-rate-chip').text()).toBe('65%')
  })

  it('reserves the success rate chip slot (hidden, not removed) when successRate is unset', async () => {
    // Same reasoning as the follow-up badge below: an absent chip must not
    // remove its line, or rows with/without a success rate end up different
    // heights and break the desktop list's fixed-row-height PAGE_SIZE math.
    const wrapper = mountView([makeApp({ successRate: undefined })])
    await flushPromises()
    const chip = wrapper.find('.success-rate-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.classes()).toContain('success-rate-chip--none')
  })

  it('shows success rate chip for 0 without treating it as unset', async () => {
    const wrapper = mountView([makeApp({ successRate: 0 })])
    await flushPromises()
    expect(wrapper.find('.success-rate-chip').exists()).toBe(true)
    expect(wrapper.find('.success-rate-chip').text()).toBe('0%')
  })

  it('shows "HSM sponsor" tag when application has a sponsorCompanyId', async () => {
    const wrapper = mountView([makeApp({ sponsorCompanyId: 'co-1' })])
    await flushPromises()
    expect(wrapper.find('.sponsor-chip').text()).toBe('HSM sponsor')
    expect(wrapper.find('.sponsor-chip').classes()).toContain('sponsor-chip--yes')
  })

  it('shows "Not HSM sponsor" tag when application has no sponsorCompanyId', async () => {
    const wrapper = mountView([makeApp({ sponsorCompanyId: undefined })])
    await flushPromises()
    expect(wrapper.find('.sponsor-chip').text()).toBe('Not HSM sponsor')
    expect(wrapper.find('.sponsor-chip').classes()).toContain('sponsor-chip--no')
  })

  it('each row gets its own sponsor tag independent of other rows', async () => {
    const wrapper = mountView([
      makeApp({ id: 'a', companyName: 'Alpha', sponsorCompanyId: 'co-1' }),
      makeApp({ id: 'b', companyName: 'Beta',  sponsorCompanyId: undefined }),
    ])
    await flushPromises()
    const chips = wrapper.findAll('.sponsor-chip')
    expect(chips[0].text()).toBe('HSM sponsor')
    expect(chips[1].text()).toBe('Not HSM sponsor')
  })
})

// ── follow-up badge slot: every row reserves the same space ────────────────────
//
// Row height on desktop was measured empirically (via a live browser, not
// happy-dom) at 157.5px — but only for rows that actually show a follow-up
// badge. Rows without one measured 129px. A single ROW_HEIGHT constant can't
// be right for both, so whichever page happens to land a mix of overdue and
// non-overdue rows would still clip/hide a row near the bottom. Fixing this
// for real means every row reserves the *same* vertical space regardless of
// its data — the badge slot is always rendered, just invisible when unused.

describe('ApplicationsView – follow-up badge always reserves its row slot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a .followup-badge element even when there is no follow-up date at all', async () => {
    const wrapper = mountView([makeApp({ followUpDate: undefined })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('followup-badge--none')
  })

  it('renders a .followup-badge element for a future (not overdue, not due today) follow-up date', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const wrapper = mountView([makeApp({ followUpDate: future })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('followup-badge--none')
  })

  it('shows the overdue variant (not the empty slot) when the follow-up date is in the past', async () => {
    const wrapper = mountView([makeApp({ followUpDate: '2020-01-01T00:00:00Z' })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.classes()).toContain('followup-badge--overdue')
    expect(badge.classes()).not.toContain('followup-badge--none')
    expect(badge.text()).toContain('Follow up')
  })

  it('shows the due-today variant when the follow-up date is today', async () => {
    const today = new Date().toISOString()
    const wrapper = mountView([makeApp({ followUpDate: today })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.classes()).toContain('followup-badge--today')
    expect(badge.classes()).not.toContain('followup-badge--none')
  })

  it('every row renders exactly one .followup-badge element, whether or not it has a follow-up date', async () => {
    const wrapper = mountView([
      makeApp({ id: 'a', followUpDate: undefined }),
      makeApp({ id: 'b', followUpDate: '2020-01-01T00:00:00Z' }),
      makeApp({ id: 'c', followUpDate: new Date().toISOString() }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.followup-badge')).toHaveLength(3)
  })
})

// ── list stagger transition ───────────────────────────────────────────────────

describe('ApplicationsView – list stagger transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a <TransitionGroup name="list"> wrapping the application rows', async () => {
    const wrapper = mountView([makeApp()])
    await flushPromises()
    const groups = (wrapper.findAllComponents(TransitionGroup) as unknown as VueWrapper<any>[])
      .filter(t => t.props('name') === 'list')
    expect(groups.length).toBe(1)
  })

  it('TransitionGroup renders as a <ul> element', async () => {
    const wrapper = mountView([makeApp()])
    await flushPromises()
    const group = (wrapper.findAllComponents(TransitionGroup) as unknown as VueWrapper<any>[])
      .find(t => t.props('name') === 'list')
    expect(group?.props('tag')).toBe('ul')
  })

  it('each row has a --i CSS variable capped at 9', async () => {
    // PAGE_SIZE starts at 10 (ResizeObserver doesn't fire in jsdom)
    const apps = Array.from({ length: 10 }, (_, i) =>
      makeApp({ id: `app-${i}`, companyName: `Co ${i}` })
    )
    const wrapper = mountView(apps)
    await flushPromises()
    const rows = wrapper.findAll('.company-row')
    expect(rows).toHaveLength(10)
    expect(rows[0].attributes('style')).toContain('--i: 0')
    expect(rows[9].attributes('style')).toContain('--i: 9')
  })

  it('rows are hidden after search filter removes all matches', async () => {
    const wrapper = mountView([makeApp({ companyName: 'Acme' })])
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(1)
    await wrapper.find('input.filter-input').setValue('zzzzz')
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(0)
    expect(wrapper.text()).toContain('No applications match your filters')
  })

  it('rows reappear when filter is cleared', async () => {
    const wrapper = mountView([makeApp({ companyName: 'Acme' })])
    await flushPromises()
    const input = wrapper.find('input.filter-input')
    await input.setValue('zzzzz')
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(0)
    await input.setValue('')
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(1)
  })
})

// ── pagination / PAGE_SIZE resize ───────────────────────────────────────────────

class MockResizeObserver {
  static latest: MockResizeObserver | null = null
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb; MockResizeObserver.latest = this }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function fireResize(clientHeight: number, rowHeight: number, listEl: HTMLElement) {
  Object.defineProperty(listEl, 'clientHeight', { value: clientHeight, configurable: true })
  const firstRow = listEl.querySelector<HTMLElement>('.company-row')
  if (firstRow) Object.defineProperty(firstRow, 'offsetHeight', { value: rowHeight, configurable: true })
  MockResizeObserver.latest!.cb([] as unknown as ResizeObserverEntry[], MockResizeObserver.latest as unknown as ResizeObserver)
}

function makeManyApps(n: number): Application[] {
  return Array.from({ length: n }, (_, i) => makeApp({ id: `app-${i}`, companyName: `Company ${i}` }))
}

function activePageLabel(wrapper: ReturnType<typeof mount>): string | undefined {
  return wrapper.findAll('.page-btn--active')[0]?.text()
}

describe('ApplicationsView – pagination survives PAGE_SIZE resize (Chrome iOS toolbar collapse)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stays on page 2 when a resize fires but page 2 is still in range', async () => {
    const wrapper = mountView(makeManyApps(25))
    await flushPromises()

    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(activePageLabel(wrapper)).toBe('2')

    const listEl = wrapper.find('.app-list-wrapper').element as HTMLElement
    fireResize(600, 50, listEl) // -> PAGE_SIZE 12, pageCount ceil(25/12)=3, page 2 still valid
    await flushPromises()

    expect(activePageLabel(wrapper)).toBe('2')
  })

  it('clamps down to the last page when a resize makes page 2 go out of range', async () => {
    const wrapper = mountView(makeManyApps(15))
    await flushPromises()

    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(activePageLabel(wrapper)).toBe('2')

    const listEl = wrapper.find('.app-list-wrapper').element as HTMLElement
    fireResize(680, 34, listEl) // -> PAGE_SIZE 20, pageCount ceil(15/20)=1, page 2 no longer valid
    await flushPromises()

    expect(wrapper.find('.pagination-info').text()).toContain('1–15')
  })

  it('ignores resize-driven PAGE_SIZE recalculation on mobile widths, where .dashboard is height:auto and the measurement is circular', async () => {
    // window.innerWidth alone doesn't drive happy-dom's matchMedia — the
    // viewport has to be set through its dedicated API for `(max-width)"
    // queries (what the production guard uses) to actually match.
    ;(window as any).happyDOM.setViewport({ width: 375 })
    try {
      const wrapper = mountView(makeManyApps(25))
      await flushPromises()
      expect(wrapper.find('.pagination-info').text()).toContain('1–10') // stable default PAGE_SIZE=10

      const listEl = wrapper.find('.app-list-wrapper').element as HTMLElement
      fireResize(680, 34, listEl) // would otherwise push PAGE_SIZE to 20
      await flushPromises()

      expect(wrapper.find('.pagination-info').text()).toContain('1–10') // unchanged
    } finally {
      ;(window as any).happyDOM.setViewport({ width: 1024 })
    }
  })
})

// ── PAGE_SIZE sized correctly on the very first paint (no second pass) ─────────
//
// Regression #1: adding the success-rate/sponsor badges made rows taller.
// The ResizeObserver fires once immediately on observe() — before
// applications have loaded and before any .company-row exists — so that
// first callback falls back to the ROW_HEIGHT constant. If that constant is
// stale (too small), PAGE_SIZE overestimates how many rows fit and the last
// row on a page spills out from under the pagination bar (.app-list-wrapper
// clips with overflow: hidden).
//
// Regression #2 (introduced by the first fix attempt): re-measuring against
// a real row *after* the first batch had already painted and started its
// TransitionGroup enter animation caused PAGE_SIZE to grow on a second pass.
// The extra rows that popped in on that second pass could get stuck
// mid-transition (opacity: 0) until something else forced a re-render —
// e.g. changing page — matching the "last app is invisible until I switch
// pages" report. The fix is to size correctly on the first paint (from the
// ROW_HEIGHT constant, before any row exists) instead of correcting after.

describe('ApplicationsView – PAGE_SIZE sized correctly on the very first paint', () => {
  let restoreOffsetHeight: (() => void) | null = null
  let restoreClientHeight: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    // No resize ever fires in this scenario (mirrors production: the
    // container's own size doesn't change just because content inside it
    // got taller) — the first paint must already be sized correctly.
    vi.stubGlobal('ResizeObserver', MockResizeObserver)

    const offsetDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    // offsetHeight deliberately differs from the ROW_HEIGHT constant (158) —
    // it stands in for "a real row, if one existed yet", so a passing test
    // here can't be a coincidence of both numbers happening to match.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains('company-row') ? 50 : 0 },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      // 158 * 15, so "fits 15 rows" is an exact, easy-to-read expectation.
      get(this: HTMLElement) { return this.classList.contains('app-list-wrapper') ? 2370 : 0 },
    })
    restoreOffsetHeight = () => { if (offsetDesc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetDesc) }
    restoreClientHeight = () => { if (clientDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientDesc) }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    restoreOffsetHeight?.()
    restoreClientHeight?.()
  })

  it('sizes the first paint from the ROW_HEIGHT constant, not a post-load remeasure against the real row', async () => {
    const wrapper = mountView(makeManyApps(25))
    await flushPromises()

    // container 2370px / ROW_HEIGHT constant 158px = 15. If a second pass had
    // remeasured against the mocked "real" 50px row, this would read 47
    // (floor(2370/50)) instead — proving there's only ever one sizing pass.
    expect(wrapper.find('.pagination-info').text()).toContain('1–15')
    expect(wrapper.findAll('.company-row')).toHaveLength(15)
  })

  it('every row on the last page stays inside the clipped list — none get pushed under the pagination bar', async () => {
    const wrapper = mountView(makeManyApps(20))
    await flushPromises()

    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    // Page size 15 -> page 2 holds the remaining 5, all rendered (none clipped/lost).
    expect(wrapper.findAll('.company-row')).toHaveLength(5)
    expect(wrapper.find('.pagination-info').text()).toContain('16–20')
  })

  it('does not trigger a second PAGE_SIZE change after applications finish loading', async () => {
    const wrapper = mountView(makeManyApps(25))
    await flushPromises()
    const afterFirstLoad = wrapper.find('.pagination-info').text()

    // Give any lingering microtask/animation-frame-driven correction a
    // chance to run, then confirm nothing shifted.
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.find('.pagination-info').text()).toBe(afterFirstLoad)
  })
})
