import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition, TransitionGroup } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    const apps = Array.from({ length: 15 }, (_, i) =>
      makeApp({ id: `app-${i}`, companyName: `Co ${i}` })
    )
    const wrapper = mountView(apps)
    await flushPromises()
    const rows = wrapper.findAll('.company-row')
    expect(rows).toHaveLength(15)
    // First 10 rows get 0–9, remaining rows are capped at 9
    expect(rows[0].attributes('style')).toContain('--i: 0')
    expect(rows[9].attributes('style')).toContain('--i: 9')
    expect(rows[14].attributes('style')).toContain('--i: 9')
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
