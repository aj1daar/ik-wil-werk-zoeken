import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition } from 'vue'
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

function modalTransitions(wrapper: ReturnType<typeof mount>) {
  return (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[])
    .filter(t => t.props('name') === 'modal')
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
    expect(modalTransitions(wrapper).length).toBeGreaterThanOrEqual(1)
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

// ── application panel transition wrapper ─────────────────────────────────────

describe('ApplicationsView – application panel transition', () => {
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
