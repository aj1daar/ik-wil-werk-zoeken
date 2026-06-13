import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompaniesView from '../CompaniesView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    getCompanies:      vi.fn(),
  },
}))

import { api } from '../../../api'
import type { SponsorCompany } from '../../../api'

function makeSponsor(overrides: Partial<SponsorCompany> = {}): SponsorCompany {
  return {
    id: 'sp-1', name: 'Acme B.V.', kvKNumber: '12345678',
    lastVerifiedAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

function mountView(sponsors: SponsorCompany[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getCompanies).mockResolvedValue(sponsors)
  return mount(CompaniesView, { global: { plugins: [pinia] } })
}

function modalTransitions(wrapper: ReturnType<typeof mount>) {
  return (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[])
    .filter(t => t.props('name') === 'modal')
}

// ── modal transition wrapper ──────────────────────────────────────────────────

describe('CompaniesView – modal transition', () => {
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

  it('NewApplicationModal opens after selecting a company and clicking Start Application', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(true)
  })

  it('prefill company name is passed to the modal', async () => {
    const wrapper = mountView([makeSponsor({ name: 'TechCorp' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).props('prefillCompany')).toBe('TechCorp')
  })

  it('NewApplicationModal closes when it emits close', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    await wrapper.findComponent({ name: 'NewApplicationModal' }).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(false)
  })
})

// ── company list & selection ──────────────────────────────────────────────────

describe('CompaniesView – company list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state while fetching', async () => {
    vi.mocked(api.getCompanies).mockReturnValue(new Promise(() => {}))
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(CompaniesView, { global: { plugins: [pinia] } })
    await nextTick() // let onMounted fire and loading=true propagate to DOM
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders company rows after load', async () => {
    const wrapper = mountView([makeSponsor({ name: 'Alpha B.V.' }), makeSponsor({ id: 'sp-2', name: 'Beta N.V.' })])
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(2)
  })

  it('shows empty state when no companies are loaded', async () => {
    const wrapper = mountView([])
    await flushPromises()
    expect(wrapper.text()).toContain('No IND sponsor companies loaded yet')
  })

  it('selecting a row opens the detail panel', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(true)
  })

  it('clicking the same row again deselects the panel', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    const row = wrapper.find('.company-row')
    await row.trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(true)
    await row.trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(false)
  })

  it('detail panel shows the company name', async () => {
    const wrapper = mountView([makeSponsor({ name: 'Bigcorp International' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.detail-panel').text()).toContain('Bigcorp International')
  })
})
