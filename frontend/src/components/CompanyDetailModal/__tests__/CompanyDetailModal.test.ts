import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompanyDetailModal from '../CompanyDetailModal.vue'
import { useCompaniesStore } from '../../../stores/companies'
import type { Application, SponsorCompany } from '../../../api'

vi.mock('../../../api', () => ({
  api: {
    adminUpdateCompany:      vi.fn(),
    adminGetMergedCompanies: vi.fn(),
    adminMergeCompanies:     vi.fn(),
    adminUnmergeCompany:     vi.fn(),
    getCompanies:            vi.fn(),
    getCompanyLists:         vi.fn(),
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
  isInterested: boolean
}> = {}) {
  setActivePinia(createPinia())
  return mount(CompanyDetailModal, {
    props: {
      company: makeCompany(),
      application: null,
      isAdmin: false,
      isHidden: false,
      isInterested: false,
      ...props,
    },
  })
}

beforeEach(() => vi.clearAllMocks())

// The two ghost buttons in the footer share .btn-list; pick by label.
const listBtn = (w: ReturnType<typeof mountModal>, text: string) =>
  w.findAll('.btn-list').find(b => b.text().includes(text))

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
    const btn = listBtn(w, 'Not interested')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(w.emitted('toggle-hidden')).toBeTruthy()
  })

  it('shows "Unhide" when the company is hidden', () => {
    const w = mountModal({ isHidden: true })
    expect(listBtn(w, 'Unhide')).toBeTruthy()
  })
})

// ── interested button ────────────────────────────────────────────────────────

describe('CompanyDetailModal – interested button', () => {
  it('reads "Add to interested" when not on the list', () => {
    const w = mountModal({ isInterested: false })
    const btn = listBtn(w, 'Add to interested')
    expect(btn).toBeTruthy()
    expect(btn!.classes()).not.toContain('btn-list--on')
  })

  it('reads "Remove from interested" and is highlighted when interested', () => {
    const w = mountModal({ isInterested: true })
    const btn = listBtn(w, 'Remove from interested')
    expect(btn).toBeTruthy()
    expect(btn!.classes()).toContain('btn-list--on')
  })

  it('emits toggle-interested', async () => {
    const w = mountModal()
    await listBtn(w, 'Add to interested')!.trigger('click')
    expect(w.emitted('toggle-interested')).toBeTruthy()
  })

  it('the interested button is gone while the admin edit form is open', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ summary: 'x' }) })
    await w.find('.panel-edit-btn').trigger('click')
    expect(listBtn(w, 'Add to interested')).toBeUndefined()
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


// ── admin rename ─────────────────────────────────────────────────────────────

describe('CompanyDetailModal – admin rename', () => {
  it('the edit form is pre-filled with the current name', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ name: 'Acme B.V.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    expect((w.find('#ce-name').element as HTMLInputElement).value).toBe('Acme B.V.')
  })

  it('Save sends the trimmed new name', async () => {
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(makeCompany({ name: 'Acme Netherlands' }))
    const w = mountModal({ isAdmin: true, company: makeCompany({ name: 'Acme B.V.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.find('#ce-name').setValue('  Acme Netherlands  ')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('sp-1', expect.objectContaining({ name: 'Acme Netherlands' }))
  })

  it('an unchanged name is still sent, so the server keeps it as-is', async () => {
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(makeCompany({}))
    const w = mountModal({ isAdmin: true, company: makeCompany({ name: 'Acme B.V.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('sp-1', expect.objectContaining({ name: 'Acme B.V.' }))
  })

  it('a blank name is refused before anything is sent', async () => {
    const w = mountModal({ isAdmin: true, company: makeCompany({ name: 'Acme B.V.' }) })
    await w.find('.panel-edit-btn').trigger('click')
    await w.find('#ce-name').setValue('   ')
    await w.findAll('button').find(b => b.text() === 'Save changes')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompany).not.toHaveBeenCalled()
    expect(w.text()).toContain('Name is required.')
    expect(w.find('#ce-name').exists()).toBe(true)
  })

  it('shows previous names to an admin only', () => {
    const company = makeCompany({ aliasNames: ['Acme B.V.', 'Acme Holland'] })
    expect(mountModal({ isAdmin: true, company }).text()).toContain('Acme Holland')
    expect(mountModal({ isAdmin: false, company }).text()).not.toContain('Acme Holland')
  })
})

// ── admin merge ──────────────────────────────────────────────────────────────

describe('CompanyDetailModal – admin merge', () => {
  function mountAdmin(companies: SponsorCompany[] = [], company = makeCompany()) {
    setActivePinia(createPinia())
    const store = useCompaniesStore()
    store.$patch({ companies: [company, ...companies] })
    const wrapper = mount(CompanyDetailModal, {
      props: { company, application: null, isAdmin: true, isHidden: false, isInterested: false },
      global: { stubs: { teleport: true } },
    })
    return { wrapper, store }
  }

  const mergeResult = (overrides: Record<string, unknown> = {}) => ({
    target: makeCompany({ aliasNames: ['Acme Netherlands'] }),
    mergedIds: ['sp-2'],
    movedApplications: 0,
    movedListEntries: 0,
    droppedListEntries: 0,
    message: 'Merged 1 company into Acme B.V.',
    ...overrides,
  })

  beforeEach(() => {
    vi.mocked(api.adminGetMergedCompanies).mockResolvedValue([])
  })

  it('the merge panel is admin-only', async () => {
    expect(mountModal({ isAdmin: false }).find('#ce-merge-search').exists()).toBe(false)
    const { wrapper } = mountAdmin()
    await flushPromises()
    expect(wrapper.find('#ce-merge-search').exists()).toBe(true)
  })

  it('searching lists other companies but never this one', async () => {
    const { wrapper } = mountAdmin([
      makeCompany({ id: 'sp-2', name: 'Acme Netherlands' }),
      makeCompany({ id: 'sp-3', name: 'Bigcorp' }),
    ])
    await wrapper.find('#ce-merge-search').setValue('acme')
    const names = wrapper.findAll('.merge-result-name').map(n => n.text())
    expect(names).toEqual(['Acme Netherlands'])
  })

  it('a one-character query searches nothing', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('a')
    expect(wrapper.findAll('.merge-result')).toHaveLength(0)
  })

  it('picking a result stages it and clears the search box', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    expect(wrapper.find('.city-chip').text()).toContain('Acme Netherlands')
    expect((wrapper.find('#ce-merge-search').element as HTMLInputElement).value).toBe('')
  })

  it('a staged company is not offered again', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('#ce-merge-search').setValue('acme')
    expect(wrapper.findAll('.merge-result')).toHaveLength(0)
  })

  it('a staged company can be removed again', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('.city-remove').trigger('click')
    expect(wrapper.find('.city-chip').exists()).toBe(false)
    expect(wrapper.find('.merge-submit').exists()).toBe(false)
  })

  it('nothing is merged until the confirmation is accepted', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('.merge-submit').trigger('click')
    expect(api.adminMergeCompanies).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Merge companies?')
  })

  it('confirming merges the staged companies into this one', async () => {
    vi.mocked(api.adminMergeCompanies).mockResolvedValue(mergeResult({ movedApplications: 2, movedListEntries: 1 }))
    const { wrapper, store } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('.merge-submit').trigger('click')
    await wrapper.find('.cd-confirm').trigger('click')
    await flushPromises()

    expect(api.adminMergeCompanies).toHaveBeenCalledWith('sp-1', ['sp-2'])
    expect(store.companies.map(c => c.id)).toEqual(['sp-1'])
    expect(wrapper.find('.merge-notice').text()).toContain('2 applications')
    expect(wrapper.find('.city-chip').exists()).toBe(false)
  })

  it('cancelling the confirmation keeps the staged companies', async () => {
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('.merge-submit').trigger('click')
    await wrapper.find('.cd-cancel').trigger('click')
    await flushPromises()
    expect(api.adminMergeCompanies).not.toHaveBeenCalled()
    expect(wrapper.find('.city-chip').text()).toContain('Acme Netherlands')
  })

  it('reports a failed merge and keeps the staged companies', async () => {
    vi.mocked(api.adminMergeCompanies).mockRejectedValue(new Error('403 Forbidden'))
    const { wrapper } = mountAdmin([makeCompany({ id: 'sp-2', name: 'Acme Netherlands' })])
    await wrapper.find('#ce-merge-search').setValue('acme')
    await wrapper.find('.merge-result').trigger('click')
    await wrapper.find('.merge-submit').trigger('click')
    await wrapper.find('.cd-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.summary-error').text()).toContain('403 Forbidden')
    expect(wrapper.find('.city-chip').text()).toContain('Acme Netherlands')
  })

  it('lists the companies already merged into this one', async () => {
    vi.mocked(api.adminGetMergedCompanies).mockResolvedValue([makeCompany({ id: 'sp-9', name: 'Acme Holland' })])
    const { wrapper } = mountAdmin()
    await flushPromises()
    expect(wrapper.find('.merged-row').text()).toContain('Acme Holland')
  })

  it('unmerging restores the company and refreshes the list', async () => {
    vi.mocked(api.adminGetMergedCompanies)
      .mockResolvedValueOnce([makeCompany({ id: 'sp-9', name: 'Acme Holland' })])
      .mockResolvedValueOnce([])
    vi.mocked(api.adminUnmergeCompany).mockResolvedValue(makeCompany({ id: 'sp-9', name: 'Acme Holland' }))
    vi.mocked(api.getCompanies).mockResolvedValue([makeCompany(), makeCompany({ id: 'sp-9', name: 'Acme Holland' })])

    const { wrapper } = mountAdmin()
    await flushPromises()
    await wrapper.find('.merge-undo').trigger('click')
    await flushPromises()

    expect(api.adminUnmergeCompany).toHaveBeenCalledWith('sp-9')
    expect(wrapper.find('.merge-notice').text()).toContain('Acme Holland')
    expect(wrapper.find('.merged-row').exists()).toBe(false)
  })

  it('reports a failed unmerge', async () => {
    vi.mocked(api.adminGetMergedCompanies).mockResolvedValue([makeCompany({ id: 'sp-9', name: 'Acme Holland' })])
    vi.mocked(api.adminUnmergeCompany).mockRejectedValue(new Error('404 Not Found'))

    const { wrapper } = mountAdmin()
    await flushPromises()
    await wrapper.find('.merge-undo').trigger('click')
    await flushPromises()

    expect(wrapper.find('.summary-error').text()).toContain('404 Not Found')
    expect(wrapper.find('.merged-row').exists()).toBe(true)
  })

  it('the merge panel is hidden while the edit form is open', async () => {
    const { wrapper } = mountAdmin()
    await flushPromises()
    await wrapper.find('.panel-edit-btn').trigger('click')
    expect(wrapper.find('#ce-merge-search').exists()).toBe(false)
  })
})
