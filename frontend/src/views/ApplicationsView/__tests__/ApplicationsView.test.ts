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
