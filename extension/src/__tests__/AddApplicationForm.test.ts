import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AddApplicationForm from '../sidepanel/AddApplicationForm.vue'
import type { ApplicationSummary, ParsedJobLink } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    lookupSponsors: vi.fn(),
    createApplication: vi.fn(),
  },
}))

import { api } from '../lib/api'

const ACME = { id: 'c1', name: 'Acme B.V.', city: 'Amsterdam', coreIndustry: 'Fintech' }

function parsed(overrides: Partial<ParsedJobLink> = {}): ParsedJobLink {
  return { company: null, position: null, locations: [], source: 'jsonld', ...overrides }
}

function mountForm(props: {
  jobUrl?: string
  parsed?: ParsedJobLink | null
  applications?: ApplicationSummary[]
} = {}) {
  return mount(AddApplicationForm, {
    props: {
      jobUrl: props.jobUrl ?? 'https://acme.nl/job/1',
      parsed: props.parsed ?? null,
      applications: props.applications ?? [],
    },
    attachTo: document.body,
  })
}

type Wrapper = ReturnType<typeof mountForm>

const field   = (w: Wrapper, id: string) => w.find(`#${id}`)
const submit  = (w: Wrapper) => w.find('button[type="submit"]')
const error   = (w: Wrapper) => w.find('.save-error')
const created = () => vi.mocked(api.createApplication).mock.calls[0]?.[0]

beforeEach(() => {
  // The module mock lives for the whole file, so its call history has to be
  // cleared per test or a count from an earlier one leaks into the next.
  vi.clearAllMocks()
  vi.mocked(api.lookupSponsors).mockResolvedValue({ query: '', exact: null, matches: [] })
  vi.mocked(api.createApplication).mockResolvedValue({
    id: 'a1', companyName: 'Acme B.V.', position: 'Engineer', status: 'Applied',
    appliedAt: '2026-10-09T00:00:00.000Z',
  })
})

// ── what the link filled in ──────────────────────────────────────────────────

describe('AddApplicationForm – prefill', () => {
  it('fills the company the parser read', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect((field(w, 'panel-company').element as HTMLInputElement).value).toBe('Acme B.V.')
  })

  it('fills the position', () => {
    const w = mountForm({ parsed: parsed({ position: 'Senior Backend Engineer' }) })
    expect((field(w, 'panel-position').element as HTMLInputElement).value).toBe('Senior Backend Engineer')
  })

  it('fills the locations as removable tags', () => {
    const w = mountForm({ parsed: parsed({ locations: ['Amsterdam', 'Utrecht'] }) })
    expect(w.findAll('.city-chip')).toHaveLength(2)
  })

  it('keeps at most ten locations, however many the page listed', () => {
    const many = Array.from({ length: 14 }, (_, i) => `City ${i}`)
    const w = mountForm({ parsed: parsed({ locations: many }) })
    expect(w.findAll('.city-chip')).toHaveLength(10)
  })

  it('carries the link into the job link field', () => {
    const w = mountForm({ jobUrl: 'https://acme.nl/job/7' })
    expect((field(w, 'panel-url').element as HTMLInputElement).value).toBe('https://acme.nl/job/7')
  })

  it('defaults the date to today', () => {
    const w = mountForm()
    const today = new Date().toISOString().slice(0, 10)
    expect(w.html()).toContain(today.slice(0, 4))
  })

  it('leaves every field editable, since a parsed name is a guess', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.', position: 'Engineer' }) })
    await flushPromises()
    await field(w, 'panel-position').setValue('Staff Engineer')
    expect((field(w, 'panel-position').element as HTMLInputElement).value).toBe('Staff Engineer')
  })

  it('looks the parsed company up, so it can be linked and judged', async () => {
    mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect(api.lookupSponsors).toHaveBeenCalledWith('Acme B.V.')
  })

  it('looks nothing up when the parser found no company', async () => {
    mountForm({ parsed: parsed() })
    await flushPromises()
    expect(api.lookupSponsors).not.toHaveBeenCalled()
  })
})

// ── the sponsor verdict ──────────────────────────────────────────────────────

describe('AddApplicationForm – sponsor verdict', () => {
  it('says so when the company is in the register', async () => {
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'Acme B.V.', exact: ACME, matches: [ACME] })
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect(w.find('.verdict--sponsor').text()).toContain('HSM sponsor')
  })

  it('names the city alongside it', async () => {
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'Acme B.V.', exact: ACME, matches: [ACME] })
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect(w.find('.verdict--sponsor').text()).toContain('Amsterdam')
  })

  it('warns when the company is not in the register', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Some Startup' }) })
    await flushPromises()
    expect(w.find('.verdict--none').text()).toContain('cannot hire on an HSM permit')
  })

  it('stays quiet while the name is still being typed', async () => {
    const w = mountForm()
    await field(w, 'panel-company').trigger('focusin')
    await field(w, 'panel-company').setValue('Acm')
    await flushPromises()
    expect(w.find('.verdict').exists()).toBe(false)
  })

  it('stays quiet once the name no longer matches the verdict it has', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect(w.find('.verdict').exists()).toBe(true)

    await field(w, 'panel-company').setValue('Acme B.V. and Partners')
    await flushPromises()
    expect(w.find('.verdict').exists()).toBe(false)
  })

  it('ignores a slow answer about a name that has since changed', async () => {
    vi.useFakeTimers()
    vi.mocked(api.lookupSponsors).mockImplementation(async query =>
      ({ query, exact: query === 'Acme' ? ACME : null, matches: [] }))

    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme')
    await vi.advanceTimersByTimeAsync(300)
    await field(w, 'panel-company').setValue('Zeta')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(w.find('.verdict--sponsor').exists()).toBe(false)
    vi.useRealTimers()
  })
})

// ── suggestions ──────────────────────────────────────────────────────────────

describe('AddApplicationForm – suggestions', () => {
  it('waits for typing to settle before asking', async () => {
    vi.useFakeTimers()
    const w = mountForm()
    await field(w, 'panel-company').setValue('A')
    await field(w, 'panel-company').setValue('Ac')
    await field(w, 'panel-company').setValue('Acm')
    expect(api.lookupSponsors).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(api.lookupSponsors).toHaveBeenCalledTimes(1)
    expect(api.lookupSponsors).toHaveBeenCalledWith('Acm')
    vi.useRealTimers()
  })

  it('asks nothing once the field is cleared', async () => {
    vi.useFakeTimers()
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme')
    await vi.advanceTimersByTimeAsync(300)
    await field(w, 'panel-company').setValue('')
    await vi.advanceTimersByTimeAsync(300)
    expect(api.lookupSponsors).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('offers what came back', async () => {
    vi.useFakeTimers()
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'acme', exact: null, matches: [ACME] })
    const w = mountForm()
    await field(w, 'panel-company').setValue('acme')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(w.findAll('.combobox-option')).toHaveLength(1)
    vi.useRealTimers()
  })

  // Nothing was asked, so nothing should open over the field below it.
  it('offers nothing for the name the parser read', async () => {
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'Acme B.V.', exact: ACME, matches: [ACME] })
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }) })
    await flushPromises()
    expect(w.find('.combobox-dropdown').exists()).toBe(false)
    expect(w.find('.verdict--sponsor').exists()).toBe(true)
  })

  it('takes the company name, the sponsor link and the city from a pick', async () => {
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'acme', exact: null, matches: [ACME] })
    const w = mountForm()
    await field(w, 'panel-company').setValue('acme')
    await new Promise(resolve => setTimeout(resolve, 320))
    await flushPromises()
    await w.find('.combobox-option').trigger('mousedown')
    await flushPromises()

    expect((field(w, 'panel-company').element as HTMLInputElement).value).toBe('Acme B.V.')
    expect(w.find('.city-chip').text()).toContain('Amsterdam')

    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    await flushPromises()
    expect(created().sponsorCompanyId).toBe('c1')
  })

  it('does not add the city twice when the link already found it', async () => {
    vi.mocked(api.lookupSponsors).mockResolvedValue({ query: 'acme', exact: null, matches: [ACME] })
    const w = mountForm({ parsed: parsed({ locations: ['Amsterdam'] }) })
    await field(w, 'panel-company').setValue('acme')
    await new Promise(resolve => setTimeout(resolve, 320))
    await flushPromises()
    await w.find('.combobox-option').trigger('mousedown')
    expect(w.findAll('.city-chip')).toHaveLength(1)
  })
})

// ── locations ────────────────────────────────────────────────────────────────

describe('AddApplicationForm – locations', () => {
  it('adds a city on Enter', async () => {
    const w = mountForm()
    await field(w, 'panel-location').setValue('Rotterdam')
    await field(w, 'panel-location').trigger('keydown', { key: 'Enter' })
    expect(w.find('.city-chip').text()).toContain('Rotterdam')
  })

  it('adds a city on a comma, the other way people type lists', async () => {
    const w = mountForm()
    await field(w, 'panel-location').setValue('Delft')
    await field(w, 'panel-location').trigger('keydown', { key: ',' })
    expect(w.find('.city-chip').text()).toContain('Delft')
  })

  it('adds whatever is left in the box when the field loses focus', async () => {
    const w = mountForm()
    await field(w, 'panel-location').setValue('Eindhoven')
    await field(w, 'panel-location').trigger('blur')
    expect(w.find('.city-chip').text()).toContain('Eindhoven')
  })

  it('refuses a duplicate', async () => {
    const w = mountForm({ parsed: parsed({ locations: ['Utrecht'] }) })
    await field(w, 'panel-location').setValue('Utrecht')
    await field(w, 'panel-location').trigger('keydown', { key: 'Enter' })
    expect(w.findAll('.city-chip')).toHaveLength(1)
  })

  it('ignores an empty entry', async () => {
    const w = mountForm()
    await field(w, 'panel-location').setValue('   ')
    await field(w, 'panel-location').trigger('keydown', { key: 'Enter' })
    expect(w.findAll('.city-chip')).toHaveLength(0)
  })

  it('removes one on its own button', async () => {
    const w = mountForm({ parsed: parsed({ locations: ['Amsterdam', 'Utrecht'] }) })
    await w.findAll('.city-remove')[0].trigger('click')
    expect(w.findAll('.city-chip')).toHaveLength(1)
    expect(w.text()).toContain('Utrecht')
  })
})

// ── saving ───────────────────────────────────────────────────────────────────

describe('AddApplicationForm – saving', () => {
  async function fillAndSubmit(w: Wrapper, company = 'Acme B.V.', position = 'Engineer') {
    await field(w, 'panel-company').setValue(company)
    await field(w, 'panel-position').setValue(position)
    await submit(w).trigger('submit')
    await flushPromises()
  }

  it('sends what the form holds', async () => {
    const w = mountForm({ jobUrl: 'https://acme.nl/job/1', parsed: parsed({ locations: ['Amsterdam'] }) })
    await fillAndSubmit(w)
    expect(created()).toMatchObject({
      companyName: 'Acme B.V.',
      position: 'Engineer',
      locations: ['Amsterdam'],
      jobUrl: 'https://acme.nl/job/1',
    })
  })

  it('sends the date as an instant, which is what the API stores', async () => {
    const w = mountForm()
    await fillAndSubmit(w)
    expect(created().appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('trims the company and position', async () => {
    const w = mountForm()
    await fillAndSubmit(w, '  Acme B.V.  ', '  Engineer  ')
    expect(created()).toMatchObject({ companyName: 'Acme B.V.', position: 'Engineer' })
  })

  it('leaves out an empty job link rather than sending a blank one', async () => {
    const w = mountForm({ jobUrl: '' })
    await fillAndSubmit(w)
    expect(created().jobUrl).toBeUndefined()
  })

  it('sends the success rate as a number', async () => {
    const w = mountForm()
    await field(w, 'panel-rate').setValue('60')
    await fillAndSubmit(w)
    expect(created().successRate).toBe(60)
  })

  it('reports the saved row to the panel', async () => {
    const w = mountForm()
    await fillAndSubmit(w)
    expect(w.emitted('saved')![0][0]).toMatchObject({ id: 'a1' })
  })

  it('says it is saving while the request is out', async () => {
    let finish!: (value: ApplicationSummary) => void
    vi.mocked(api.createApplication).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    expect(submit(w).text()).toBe('Saving…')
    expect(submit(w).attributes('disabled')).toBeDefined()
    finish({ id: 'a1', companyName: 'Acme B.V.', position: 'Engineer', status: 'Applied', appliedAt: '' })
    await flushPromises()
  })
})

// ── what it refuses to send ──────────────────────────────────────────────────

describe('AddApplicationForm – validation', () => {
  it('needs a company name', async () => {
    const w = mountForm()
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    expect(error(w).text()).toBe('Company name is required.')
    expect(api.createApplication).not.toHaveBeenCalled()
  })

  it('does not accept spaces as a company name', async () => {
    const w = mountForm()
    await field(w, 'panel-company').setValue('   ')
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    expect(error(w).text()).toBe('Company name is required.')
  })

  it('needs a position', async () => {
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await submit(w).trigger('submit')
    expect(error(w).text()).toBe('Position is required.')
  })

  it.each([['-1'], ['101']])('refuses a success rate of %s', async value => {
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await field(w, 'panel-rate').setValue(value)
    await submit(w).trigger('submit')
    expect(error(w).text()).toBe('Success rate must be between 0 and 100.')
  })

  it.each([['0'], ['100']])('accepts a success rate of %s', async value => {
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await field(w, 'panel-rate').setValue(value)
    await submit(w).trigger('submit')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalled()
  })

  it('shows what the server said when the save fails', async () => {
    vi.mocked(api.createApplication).mockRejectedValue(new Error('Company name must not exceed 200 characters'))
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    await flushPromises()
    expect(error(w).text()).toBe('Company name must not exceed 200 characters')
  })

  it('hands an ended session back to the panel instead of showing an error', async () => {
    vi.mocked(api.createApplication).mockRejectedValue(new Error('Your session has ended. Sign in again.'))
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    await flushPromises()
    expect(w.emitted('unauthorized')).toHaveLength(1)
    expect(error(w).exists()).toBe(false)
  })

  it('lets a second attempt through after a failure', async () => {
    vi.mocked(api.createApplication)
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ id: 'a2', companyName: 'Acme B.V.', position: 'Engineer', status: 'Applied', appliedAt: '' })
    const w = mountForm()
    await field(w, 'panel-company').setValue('Acme B.V.')
    await field(w, 'panel-position').setValue('Engineer')
    await submit(w).trigger('submit')
    await flushPromises()
    await submit(w).trigger('submit')
    await flushPromises()
    expect(w.emitted('saved')).toHaveLength(1)
    expect(error(w).exists()).toBe(false)
  })
})

// ── the duplicate warning ────────────────────────────────────────────────────

describe('AddApplicationForm – duplicates', () => {
  const open: ApplicationSummary = {
    id: 'a9', companyName: 'Acme B.V.', position: 'Backend Engineer',
    status: 'Applied', appliedAt: '2026-10-03T00:00:00.000Z',
  }

  it('warns about an open application at the same company', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }), applications: [open] })
    await flushPromises()
    const warning = w.find('.dup-warning')
    expect(warning.text()).toContain('Acme B.V.')
    expect(warning.text()).toContain('Backend Engineer')
  })

  it('still lets the application be saved', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Acme B.V.' }), applications: [open] })
    await flushPromises()
    await field(w, 'panel-position').setValue('Staff Engineer')
    await submit(w).trigger('submit')
    await flushPromises()
    expect(api.createApplication).toHaveBeenCalled()
  })

  it('says nothing for a company with no open application', async () => {
    const w = mountForm({ parsed: parsed({ company: 'Other B.V.' }), applications: [open] })
    await flushPromises()
    expect(w.find('.dup-warning').exists()).toBe(false)
  })
})
