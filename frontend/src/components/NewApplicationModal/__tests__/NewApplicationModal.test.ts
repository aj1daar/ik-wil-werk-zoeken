import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewApplicationModal from '../NewApplicationModal.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
  }
}))

import { api } from '../../../api'

function makeCreatedApp() {
  return {
    id: 'new-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [], updatedAt: '2026-01-01T00:00:00Z',
  }
}

function mountModal(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(NewApplicationModal, { global: { plugins: [pinia] }, props })
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

  it('renders date input', () => {
    expect(mountModal().find('#applied-at').exists()).toBe(true)
  })

  it('date defaults to today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect((mountModal().find('#applied-at').element as HTMLInputElement).value).toBe(today)
  })

  it('prefillCompany prop pre-fills company name', () => {
    const w = mountModal({ prefillCompany: 'Booking.com' })
    expect((w.find('#company-name').element as HTMLInputElement).value).toBe('Booking.com')
  })

  it('company name is empty without prefillCompany', () => {
    expect((mountModal().find('#company-name').element as HTMLInputElement).value).toBe('')
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
