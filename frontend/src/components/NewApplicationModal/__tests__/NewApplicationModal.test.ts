import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import NewApplicationModal from '../NewApplicationModal.vue'
import type { SponsorCompany } from '../../../api'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    getCompanies:      vi.fn(),
    parseJobLink:      vi.fn(),
  }
}))

import { api, type Application } from '../../../api'
import { useCompaniesStore } from '../../../stores/companies'

// Always return an empty list so companiesStore.load() never sets companies = undefined
beforeEach(() => {
  vi.mocked(api.getCompanies).mockResolvedValue([])
})

function makeCreatedApp(): Application {
  return {
    id: 'new-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [], updatedAt: '2026-01-01T00:00:00Z',
  }
}

function makeCompany(overrides: Partial<SponsorCompany> = {}): SponsorCompany {
  return {
    id: 'co-1', name: 'Acme B.V.', kvKNumber: '12345678',
    lastVerifiedAt: '2026-01-01T00:00:00Z',
    city: 'Amsterdam', coreIndustry: 'Software',
    ...overrides,
  }
}

function mountModal(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(NewApplicationModal, { global: { plugins: [pinia] }, props })
}

function mountModalWithCompanies(companies: SponsorCompany[], props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getCompanies).mockResolvedValue(companies)
  const w = mount(NewApplicationModal, { global: { plugins: [pinia] }, props })
  const companiesStore = useCompaniesStore()
  companiesStore.$patch({ companies })
  return { w, companiesStore }
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('NewApplicationModal – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "New Application" title', () => {
    expect(mountModal().text()).toContain('New Application')
  })

  it('renders company name input', () => {
    expect(mountModal().find('#company-name').exists()).toBe(true)
  })

  it('renders position input', () => {
    expect(mountModal().find('#position').exists()).toBe(true)
  })

  it('renders date picker trigger', () => {
    expect(mountModal().find('.dp-trigger').exists()).toBe(true)
  })

  it('date defaults to today', () => {
    const today = new Date().toISOString().slice(0, 10)
    const expected = new Date(today + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    expect(mountModal().find('.dp-val').text()).toBe(expected)
  })

  it('prefillCompany prop pre-fills company name', () => {
    const w = mountModal({ prefillCompany: 'Booking.com' })
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Booking.com')
  })

  it('company name is empty without prefillCompany', () => {
    expect((mountModal().find('#company-name').element as HTMLInputElement).value).toBe('')
  })
})

// ── job posting: link or email ──────────────────────────────────────────────────

describe('NewApplicationModal – job posting link or email field', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders as free text, not constrained to URL format', () => {
    expect(mountModal().find('#new-app-joburl').attributes('type')).toBe('text')
  })

  it('accepts an email address as the value', async () => {
    const w = mountModal()
    await w.find('#new-app-joburl').setValue('hr@company.com')
    expect((w.find('#new-app-joburl').element as HTMLInputElement).value).toBe('hr@company.com')
  })

  it('submits an email value as jobUrl unchanged', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#new-app-joburl').setValue('hr@company.com')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ jobUrl: 'hr@company.com' })
    )
  })

  it('submits a URL value as jobUrl unchanged', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#new-app-joburl').setValue('https://example.com/jobs/1')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ jobUrl: 'https://example.com/jobs/1' })
    )
  })
})

// ── parse company + position from a pasted link ────────────────────────────────

describe('NewApplicationModal – parse job link', () => {
  beforeEach(() => vi.clearAllMocks())

  function parsed(over: Partial<import('../../../api').ParsedJobLink> = {}) {
    return { company: null, position: null, locations: [], source: 'none' as const, ...over }
  }

  async function pasteLink(w: ReturnType<typeof mountModal>, url: string) {
    const field = w.find('#new-app-joburl')
    await field.setValue(url)
    await field.trigger('blur')
    await flushPromises()
  }

  it('fills empty company and position from the parsed link', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({
      company: 'Acme B.V.', position: 'Senior Backend Engineer', source: 'jsonld',
    }))
    const w = mountModal()
    await pasteLink(w, 'https://boards.greenhouse.io/acme/jobs/123')
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Acme B.V.')
    expect((w.find('#position').element as HTMLInputElement).value).toBe('Senior Backend Engineer')
  })

  it('does not overwrite a company the user already typed', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({
      company: 'Parsed Corp', position: 'Parsed Role', source: 'jsonld',
    }))
    const w = mountModal()
    await w.find('#company-name').setValue('My Typed Co')
    await pasteLink(w, 'https://example.com/job/1')
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('My Typed Co')
    expect((w.find('#position').element as HTMLInputElement).value).toBe('Parsed Role')
  })

  it('does not overwrite company when a sponsor was picked from the dropdown', async () => {
    vi.useFakeTimers()
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({ company: 'Parsed Corp', source: 'url' }))
    const { w } = mountModalWithCompanies([makeCompany({ id: 'co-1', name: 'Acme B.V.' })])
    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()
    await w.find('.combobox-option').trigger('mousedown')
    await w.vm.$nextTick()
    vi.useRealTimers()

    await w.find('#new-app-joburl').setValue('https://jobs.lever.co/parsedcorp/abc')
    await w.find('#new-app-joburl').trigger('blur')
    await flushPromises()

    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Acme B.V.')
  })

  it('does not call the parser for an email address', async () => {
    const w = mountModal()
    await pasteLink(w, 'recruiter@acme.com')
    expect(api.parseJobLink).not.toHaveBeenCalled()
  })

  it('does not call the parser twice for the same URL', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed())
    const w = mountModal()
    await pasteLink(w, 'https://example.com/job/1')
    await w.find('#new-app-joburl').trigger('blur')
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenCalledTimes(1)
  })

  it('stays silent and usable when the parser call fails', async () => {
    vi.mocked(api.parseJobLink).mockRejectedValue(new Error('network'))
    const w = mountModal()
    await pasteLink(w, 'https://example.com/job/1')
    expect(w.find('.save-error').exists()).toBe(false)
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('')
  })

  it('shows a hint when nothing could be read', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed())
    const w = mountModal()
    await pasteLink(w, 'https://example.com/job/1')
    expect(w.find('.link-hint').exists()).toBe(true)
  })

  it('submits the parsed values through to createApplication', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({
      company: 'Acme B.V.', position: 'Engineer', source: 'jsonld',
    }))
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await pasteLink(w, 'https://example.com/job/1')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Acme B.V.', position: 'Engineer' })
    )
  })

  it('fills empty locations from the parsed link', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({
      company: 'Acme', position: 'Engineer', locations: ['Amsterdam', 'Remote'], source: 'jsonld',
    }))
    const w = mountModal()
    await pasteLink(w, 'https://example.com/job/1')
    expect(w.text()).toContain('Amsterdam')
    expect(w.text()).toContain('Remote')
  })

  it('does not touch locations the user already added', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue(parsed({
      company: 'Acme', locations: ['Rotterdam'], source: 'jsonld',
    }))
    const w = mountModal()
    const loc = w.find('input[placeholder="Type city and press Enter…"]')
    await loc.setValue('Utrecht')
    await loc.trigger('keydown', { key: 'Enter' })
    await pasteLink(w, 'https://example.com/job/1')
    expect(w.text()).toContain('Utrecht')
    expect(w.text()).not.toContain('Rotterdam')
  })
})

// ── close / cancel ────────────────────────────────────────────────────────────

describe('NewApplicationModal – close / cancel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Cancel button emits close', async () => {
    const w = mountModal()
    await w.find('button.btn-secondary').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('× button emits close', async () => {
    const w = mountModal()
    await w.find('button[aria-label="Close"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('clicking backdrop emits close', async () => {
    const w = mountModal()
    await w.find('.modal-backdrop').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

// ── validation errors ─────────────────────────────────────────────────────────

describe('NewApplicationModal – validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "Company name is required." when company is empty and submit clicked', async () => {
    const w = mountModal()
    await w.find('button.btn-primary').trigger('click')
    expect(w.text()).toContain('Company name is required.')
  })

  it('shows "Position is required." when company filled but position empty', async () => {
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('button.btn-primary').trigger('click')
    expect(w.text()).toContain('Position is required.')
  })

  it('does not call api.createApplication on validation failure', async () => {
    const w = mountModal()
    await w.find('button.btn-primary').trigger('click')
    expect(api.createApplication).not.toHaveBeenCalled()
  })
})

// ── successful submission ─────────────────────────────────────────────────────

describe('NewApplicationModal – successful submission', () => {
  beforeEach(() => vi.clearAllMocks())

  async function fillAndSubmit(w: ReturnType<typeof mountModal>) {
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
  }

  it('calls api.createApplication with trimmed company and position', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('  Acme  ')
    await w.find('#position').setValue('  Engineer  ')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Acme', position: 'Engineer' })
    )
  })

  it('emits close after successful create', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await fillAndSubmit(w)
    expect(w.emitted('close')).toBeTruthy()
  })

  it('does not emit close when api throws', async () => {
    vi.mocked(api.createApplication).mockRejectedValue(new Error('Server error'))
    const w = mountModal()
    await fillAndSubmit(w)
    expect(w.emitted('close')).toBeFalsy()
  })

  it('shows error message when api throws', async () => {
    vi.mocked(api.createApplication).mockRejectedValue(new Error('Failed'))
    const w = mountModal()
    await fillAndSubmit(w)
    expect(w.find('.save-error').exists()).toBe(true)
  })
})

// ── success rate ────────────────────────────────────────────────────────────

describe('NewApplicationModal – success rate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders success rate input', () => {
    expect(mountModal().find('#success-rate').exists()).toBe(true)
  })

  it('omits successRate from payload when left blank', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    const call = vi.mocked(api.createApplication).mock.calls[0][0]
    expect(call.successRate).toBeUndefined()
  })

  it('includes successRate as a number when filled in', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#success-rate').setValue('60')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ successRate: 60 })
    )
  })

  it('shows error and does not submit when successRate is negative', async () => {
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#success-rate').setValue('-5')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Success rate must be between 0 and 100.')
    expect(api.createApplication).not.toHaveBeenCalled()
  })

  it('shows error and does not submit when successRate exceeds 100', async () => {
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#success-rate').setValue('101')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Success rate must be between 0 and 100.')
    expect(api.createApplication).not.toHaveBeenCalled()
  })

  it('accepts boundary value 0', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#success-rate').setValue('0')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ successRate: 0 })
    )
  })

  it('accepts boundary value 100', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Acme')
    await w.find('#position').setValue('Engineer')
    await w.find('#success-rate').setValue('100')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ successRate: 100 })
    )
  })
})

// ── location chips ────────────────────────────────────────────────────────────

describe('NewApplicationModal – location chips', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pressing Enter on location input adds a chip', async () => {
    const w = mountModal()
    const input = w.find('input[placeholder="Type city and press Enter…"]')
    await input.setValue('Amsterdam')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.text()).toContain('Amsterdam')
  })

  it('pressing comma on location input adds a chip', async () => {
    const w = mountModal()
    const input = w.find('input[placeholder="Type city and press Enter…"]')
    await input.setValue('Rotterdam')
    await input.trigger('keydown', { key: ',' })
    expect(w.text()).toContain('Rotterdam')
  })

  it('× on a chip removes that location', async () => {
    const w = mountModal()
    const input = w.find('input[placeholder="Type city and press Enter…"]')
    await input.setValue('Utrecht')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.text()).toContain('Utrecht')

    await w.find('.city-remove').trigger('click')
    expect(w.text()).not.toContain('Utrecht')
  })

  it('duplicate location is not added twice', async () => {
    const w = mountModal()
    const input = w.find('input[placeholder="Type city and press Enter…"]')
    await input.setValue('Amsterdam')
    await input.trigger('keydown', { key: 'Enter' })
    await input.setValue('Amsterdam')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.findAll('.city-chip')).toHaveLength(1)
  })
})

// ── company typeahead – dropdown ──────────────────────────────────────────────

describe('NewApplicationModal – company typeahead dropdown', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('shows suggestions after debounce fires', async () => {
    vi.useFakeTimers()
    const { w, companiesStore } = mountModalWithCompanies([
      makeCompany({ id: 'co-1', name: 'Acme B.V.' }),
    ])
    companiesStore.$patch({ companies: [makeCompany({ id: 'co-1', name: 'Acme B.V.' })] })

    await w.find('#company-name').setValue('Acme')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    expect(w.find('.combobox-dropdown').exists()).toBe(true)
    expect(w.text()).toContain('Acme B.V.')
  })

  it('does not show dropdown before debounce fires', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([makeCompany()])

    await w.find('#company-name').setValue('Acme')
    await w.find('#company-name').trigger('input')
    // Do NOT advance timers
    await w.vm.$nextTick()

    expect(w.find('.combobox-dropdown').exists()).toBe(false)
  })

  it('hides dropdown when input is empty', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([makeCompany()])

    await w.find('#company-name').setValue('Acme')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    await w.find('#company-name').setValue('')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    expect(w.find('.combobox-dropdown').exists()).toBe(false)
  })

  it('shows city chip and industry badge in dropdown option', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([
      makeCompany({ city: 'Amsterdam', coreIndustry: 'Software' }),
    ])

    await w.find('#company-name').setValue('Acme')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    const option = w.find('.combobox-option')
    expect(option.text()).toContain('Amsterdam')
    expect(option.text()).toContain('Software')
  })
})

// ── company typeahead – selection ─────────────────────────────────────────────

describe('NewApplicationModal – company typeahead selection', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  async function openAndSelectFirst(companies: SponsorCompany[]) {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies(companies)
    await w.find('#company-name').setValue(companies[0].name.slice(0, 3))
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()
    const option = w.find('.combobox-option')
    await option.trigger('mousedown')
    await w.vm.$nextTick()
    return w
  }

  it('clicking an option populates company name', async () => {
    const w = await openAndSelectFirst([makeCompany({ name: 'Acme B.V.' })])
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Acme B.V.')
  })

  it('clicking an option hides the dropdown', async () => {
    const w = await openAndSelectFirst([makeCompany()])
    expect(w.find('.combobox-dropdown').exists()).toBe(false)
  })

  it('clicking an option prepends city to locations', async () => {
    const w = await openAndSelectFirst([makeCompany({ city: 'Amsterdam' })])
    expect(w.text()).toContain('Amsterdam')
    expect(w.find('.city-chip').exists()).toBe(true)
  })

  it('selecting a company shows the context card', async () => {
    const w = await openAndSelectFirst([makeCompany({ coreIndustry: 'Fintech' })])
    expect(w.find('.company-context-card').exists()).toBe(true)
  })

  it('context card shows "IND sponsor" badge', async () => {
    const w = await openAndSelectFirst([makeCompany()])
    expect(w.find('.context-ind-badge').text()).toContain('IND sponsor')
  })

  it('context card shows industry when available', async () => {
    const w = await openAndSelectFirst([makeCompany({ coreIndustry: 'Healthcare' })])
    expect(w.find('.company-context-card').text()).toContain('Healthcare')
  })

  it('submit includes sponsorCompanyId after selection', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = await openAndSelectFirst([makeCompany({ id: 'co-99' })])
    await w.find('#position').setValue('Engineer')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ sponsorCompanyId: 'co-99' })
    )
  })

  it('submit does not include sponsorCompanyId on free-text entry', async () => {
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const w = mountModal()
    await w.find('#company-name').setValue('Unknown Corp')
    await w.find('#position').setValue('Dev')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    const call = vi.mocked(api.createApplication).mock.calls[0][0]
    expect(call.sponsorCompanyId).toBeUndefined()
  })

  it('typing after selecting a company clears sponsorCompanyId', async () => {
    vi.useFakeTimers()
    vi.mocked(api.createApplication).mockResolvedValue(makeCreatedApp())
    const { w } = mountModalWithCompanies([makeCompany({ id: 'co-1' })])
    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()
    await w.find('.combobox-option').trigger('mousedown')
    await w.vm.$nextTick()

    // Now type more — this should clear the selection
    await w.find('#company-name').setValue('Acme edited')
    await w.find('#company-name').trigger('input')

    await w.find('#position').setValue('Dev')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()

    const call = vi.mocked(api.createApplication).mock.calls[0][0]
    expect(call.sponsorCompanyId).toBeUndefined()
    expect(w.find('.company-context-card').exists()).toBe(false)
  })
})

// ── company typeahead – keyboard navigation ───────────────────────────────────

describe('NewApplicationModal – typeahead keyboard navigation', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('ArrowDown highlights first option', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([makeCompany({ name: 'Acme B.V.' })])
    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    await w.find('#company-name').trigger('keydown', { key: 'ArrowDown' })
    await w.vm.$nextTick()

    expect(w.find('.combobox-option--active').exists()).toBe(true)
  })

  it('Enter on highlighted option selects it', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([makeCompany({ name: 'Acme B.V.' })])
    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    await w.find('#company-name').trigger('keydown', { key: 'ArrowDown' })
    await w.find('#company-name').trigger('keydown', { key: 'Enter' })
    await w.vm.$nextTick()

    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Acme B.V.')
    expect(w.find('.combobox-dropdown').exists()).toBe(false)
  })

  it('Escape dismisses the dropdown', async () => {
    vi.useFakeTimers()
    const { w } = mountModalWithCompanies([makeCompany()])
    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    expect(w.find('.combobox-dropdown').exists()).toBe(true)
    await w.find('#company-name').trigger('keydown', { key: 'Escape' })
    await w.vm.$nextTick()

    expect(w.find('.combobox-dropdown').exists()).toBe(false)
  })
})

// ── duplicate detection ───────────────────────────────────────────────────────

describe('NewApplicationModal – duplicate detection', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('shows dup-warning for free-text match on companyName', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(api.getCompanies).mockResolvedValue([])
    const w = mount(NewApplicationModal, { global: { plugins: [pinia] } })

    const { useApplicationsStore } = await import('../../../stores/applications')
    const appsStore = useApplicationsStore()
    appsStore.$patch({
      applications: [{
        id: 'existing', userId: 'u1', companyName: 'Acme', position: 'Dev',
        appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [], updatedAt: '2026-01-01T00:00:00Z',
      }]
    })

    await w.find('#company-name').setValue('acme')
    await w.vm.$nextTick()
    expect(w.find('.dup-warning').exists()).toBe(true)
  })

  it('shows dup-warning when sponsorCompanyId matches an active application', async () => {
    vi.useFakeTimers()
    const pinia = createPinia()
    setActivePinia(pinia)

    const company = makeCompany({ id: 'co-1', name: 'Acme B.V.' })
    vi.mocked(api.getCompanies).mockResolvedValue([company])
    const w = mount(NewApplicationModal, { global: { plugins: [pinia] } })

    const { useApplicationsStore } = await import('../../../stores/applications')
    const appsStore = useApplicationsStore()
    appsStore.$patch({
      applications: [{
        id: 'existing', userId: 'u1', companyName: 'Acme B.V.', position: 'Dev',
        appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [],
        updatedAt: '2026-01-01T00:00:00Z', sponsorCompanyId: 'co-1',
      }]
    })

    const { useCompaniesStore } = await import('../../../stores/companies')
    useCompaniesStore().$patch({ companies: [company] })

    await w.find('#company-name').setValue('Acm')
    await w.find('#company-name').trigger('input')
    vi.advanceTimersByTime(300)
    await w.vm.$nextTick()

    await w.find('.combobox-option').trigger('mousedown')
    await w.vm.$nextTick()

    expect(w.find('.dup-warning').exists()).toBe(true)
  })

  it('does not show dup-warning for a company in terminal status', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(api.getCompanies).mockResolvedValue([])
    const w = mount(NewApplicationModal, { global: { plugins: [pinia] } })

    const { useApplicationsStore } = await import('../../../stores/applications')
    useApplicationsStore().$patch({
      applications: [{
        id: 'done', userId: 'u1', companyName: 'Acme', position: 'Dev',
        appliedAt: '2026-01-01T00:00:00Z', status: 'Rejected', locations: [], updatedAt: '2026-01-01T00:00:00Z',
      }]
    })

    await w.find('#company-name').setValue('acme')
    await w.vm.$nextTick()
    expect(w.find('.dup-warning').exists()).toBe(false)
  })
})
