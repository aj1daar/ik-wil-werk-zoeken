import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompanyDetailModal from '../CompanyDetailModal.vue'
import type { Application, SponsorCompany } from '../../../api'

vi.mock('../../../api', () => ({
  api: {
    adminUpdateCompany: vi.fn(),
    getCompanies:       vi.fn(),
  },
}))

import { api } from '../../../api'

function makeCompany(overrides: Partial<SponsorCompany> = {}): SponsorCompany {
  return {
    id: 'sp-1', name: 'Acme B.V.', kvKNumber: '12345678',
    lastVerifiedAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme B.V.', position: 'Engineer',
    appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-06-01T00:00:00Z', sponsorCompanyId: 'sp-1', ...overrides,
  }
}

function mountModal(props: Partial<{
  company: SponsorCompany
  application: Application | null
  isAdmin: boolean
  isHidden: boolean
}> = {}) {
  setActivePinia(createPinia())
  return mount(CompanyDetailModal, {
    props: {
      company: makeCompany(),
      application: null,
      isAdmin: false,
      isHidden: false,
      ...props,
    },
  })
}

beforeEach(() => vi.clearAllMocks())

// ── rendering ────────────────────────────────────────────────────────────────

describe('CompanyDetailModal – rendering', () => {
  it('shows the company name and KvK', () => {
    const w = mountModal({ company: makeCompany({ name: 'Bigcorp International', kvKNumber: '99887766' }) })
    expect(w.find('.modal-title').text()).toBe('Bigcorp International')
    expect(w.find('.modal-subtitle').text()).toContain('99887766')
  })

  it('shows a website link in the subtitle when present', () => {
    const w = mountModal({ company: makeCompany({ websiteUrl: 'https://acme.example' }) })
    expect(w.find('.subtitle-link').attributes('href')).toBe('https://acme.example')
  })

  it('renders detail chips for the fields that are set', () => {
    const w = mountModal({ company: makeCompany({ workingLanguage: 'English', companySize: 'mid', targetMarket: 'B2C', remotePolicy: 'hybrid' }) })
    const text = w.find('.meta-chips').text()
    expect(text).toContain('English')
    expect(text).toContain('mid')
    expect(text).toContain('B2C')
    expect(text).toContain('hybrid')
  })

  it('lists other locations', () => {
    const w = mountModal({ company: makeCompany({ locations: ['Utrecht', 'Delft'] }) })
    expect(w.text()).toContain('Utrecht')
    expect(w.text()).toContain('Delft')
  })

  it('shows the about text', () => {
    const w = mountModal({ company: makeCompany({ summary: 'A great company.' }) })
    expect(w.find('.body-text').text()).toBe('A great company.')
  })

  it('non-admin sees no "About" section when there is no summary', () => {
    const w = mountModal({ company: makeCompany({ summary: undefined }), isAdmin: false })
    expect(w.text()).not.toContain('No description yet.')
  })

  it('admin sees the "About" placeholder when there is no summary', () => {
    const w = mountModal({ company: makeCompany({ summary: undefined }), isAdmin: true })
    expect(w.text()).toContain('No description yet.')
  })

  it('shows the "Your application" block when an application is passed', () => {
    const w = mountModal({ application: makeApp({ status: 'InterviewScheduled', position: 'Senior Engineer' }) })
    expect(w.text()).toContain('Interviewing')
    expect(w.text()).toContain('Senior Engineer')
  })
})

// ── footer actions ───────────────────────────────────────────────────────────

describe('CompanyDetailModal – footer actions', () => {
  it('"Start Application" when there is no application', () => {
    const w = mountModal({ application: null })
    expect(w.find('.footer-primary').text()).toContain('Start Application')
  })

  it('"Add Another Application" when there is one', () => {
    const w = mountModal({ application: makeApp() })
    expect(w.find('.footer-primary').text()).toContain('Add Another Application')
  })

  it('emits start-application', async () => {
    const w = mountModal()
    await w.find('.footer-primary').trigger('click')
    expect(w.emitted('start-application')).toBeTruthy()
  })

  it('emits toggle-hidden and shows the right label', async () => {
    const w = mountModal({ isHidden: false })
    expect(w.find('.btn-hide-company').text()).toContain('Not interested')
    await w.find('.btn-hide-company').trigger('click')
    expect(w.emitted('toggle-hidden')).toBeTruthy()
  })

  it('shows "Unhide" when the company is hidden', () => {
    const w = mountModal({ isHidden: true })
    expect(w.find('.btn-hide-company').text()).toContain('Unhide')
  })
})

// ── closing ──────────────────────────────────────────────────────────────────

describe('CompanyDetailModal – closing', () => {
  it('✕ button emits close', async () => {
    const w = mountModal()
    await w.find('button[aria-label="Close"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('clicking the backdrop emits close', async () => {
    const w = mountModal()
    await w.find('.modal-backdrop').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('Escape emits close', async () => {
    const w = mountModal()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.emitted('close')).toBeTruthy()
  })
})

// ── admin edit ───────────────────────────────────────────────────────────────

describe('CompanyDetailModal – admin edit', () => {
  it('no Edit button for a non-admin', () => {
    expect(mountModal({ isAdmin: false }).find('.panel-edit-btn').exists()).toBe(false)
  })

  it('shows an Edit button for an admin', () => {
    expect(mountModal({ isAdmin: true }).find('.panel-edit-btn').exists()).toBe(true)
  })

  it('clicking Edit opens the form pre-filled', async () => {
    const w = mountModal({
      isAdmin: true,
      company: makeCompany({ summary: 'Original.', city: 'Amsterdam', websiteUrl: 'https://acme.example', techStackTags: ['Go'] }),
    })
    await w.find('.panel-edit-btn').trigger('click')
    expect((w.find('.summary-textarea').element as HTMLTextAreaElement).value).toBe('Original.')
    expect((w.find('#ce-city').element as HTMLInputElement).value).toBe('Amsterdam')
    expect((w.find('#ce-website').element as HTMLInputElement).value).toBe('https://acme.example')
    expect(w.text()).toContain('Go')
  })

  it('the Edit button disappears while editing', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'x' }) })
    await w.find('.panel-edit-btn').trigger('click')
    expect(w.find('.panel-edit-btn').exists()).toBe(false)
  })

  it('Cancel discards changes without saving', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'Original.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.find('.summary-textarea').setValue('Edited but not saved.')
    await w.findAll('button').find(b => b.text() === 'Cancel')!.trigger('click')
    expect(w.find('.summary-textarea').exists()).toBe(false)
    expect(w.text()).toContain('Original.')
    expect(api.adminUpdateCompany).not.toHaveBeenCalled()
  })

  it('Save sends every field trimmed and closes the form', async () => {
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(makeCompany({ summary: 'Edited and saved.', city: 'Delft' }))
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'Original.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.find('.summary-textarea').setValue('  Edited and saved.  ')
    await w.find('#ce-city').setValue('  Delft ')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('sp-1', expect.objectContaining({
      summary: 'Edited and saved.', city: 'Delft', websiteUrl: null, locations: null,
    }))
    expect(w.find('.summary-textarea').exists()).toBe(false)
  })

  it('added chips are included in the save payload', async () => {
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(makeCompany({ locations: ['Delft'] }))
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'x' }) })
    await w.find('.panel-edit-btn').trigger('click')
    const locInput = w.findAll('input').find(i => (i.element as HTMLInputElement).placeholder.startsWith('Add a location'))!
    await locInput.setValue('Delft')
    await locInput.trigger('keydown', { key: 'Enter' })
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('sp-1', expect.objectContaining({ locations: ['Delft'] }))
  })

  it('a half-typed chip left in the input is still saved', async () => {
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(makeCompany({}))
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'x' }) })
    await w.find('.panel-edit-btn').trigger('click')
    const techInput = w.findAll('input').find(i => (i.element as HTMLInputElement).placeholder.startsWith('Add a tag'))!
    await techInput.setValue('Rust')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('sp-1', expect.objectContaining({ techStackTags: ['Rust'] }))
  })

  it('duplicate chips (case-insensitive) are not added twice', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'x', techStackTags: ['Go'] }) })
    await w.find('.panel-edit-btn').trigger('click')
    const techInput = w.findAll('input').find(i => (i.element as HTMLInputElement).placeholder.startsWith('Add a tag'))!
    await techInput.setValue('go')
    await techInput.trigger('keydown', { key: 'Enter' })
    expect(w.findAll('.city-chip').filter(c => /go/i.test(c.text()))).toHaveLength(1)
  })

  it('shows an error and keeps the form open when the save fails', async () => {
    vi.mocked(api.adminUpdateCompany).mockRejectedValue(new Error('403 Forbidden'))
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'Original.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.find('.summary-textarea').setValue('New text.')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('403 Forbidden')
    expect(w.find('.summary-textarea').exists()).toBe(true)
  })
})
