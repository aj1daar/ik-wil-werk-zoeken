import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationPanel from '../ApplicationPanel.vue'
import type { Application } from '../../../api'

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

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-15T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

function mountPanel(app: Application) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ApplicationPanel, { global: { plugins: [pinia] }, props: { application: app } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('ApplicationPanel – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows company name in header', () => {
    const w = mountPanel(makeApp({ companyName: 'Booking.com' }))
    expect(w.find('.panel-title').text()).toBe('Booking.com')
  })

  it('shows position in header subtitle', () => {
    const w = mountPanel(makeApp({ position: 'Senior Engineer' }))
    expect(w.find('.panel-subtitle').text()).toBe('Senior Engineer')
  })

  it('status select is pre-set to application status', () => {
    const w = mountPanel(makeApp({ status: 'OnHold' }))
    const select = w.find('#ap-status').element as HTMLSelectElement
    expect(select.value).toBe('OnHold')
  })

  it('rejection reason section is hidden when status is Applied', () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('#ap-reason').exists()).toBe(false)
  })

  it('rejection reason section is shown when status is Rejected', () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason').exists()).toBe(true)
  })

  it('rejection note textarea is shown when status is Rejected', () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason-note').exists()).toBe(true)
  })
})

// ── close ─────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – close', () => {
  it('close button emits close', async () => {
    const w = mountPanel(makeApp())
    await w.find('button[aria-label="Close panel"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

// ── rejection reason toggle ───────────────────────────────────────────────────

describe('ApplicationPanel – rejection reason toggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('changing status to Rejected shows rejection reason dropdown', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('#ap-reason').exists()).toBe(false)

    await w.find('#ap-status').setValue('Rejected')
    expect(w.find('#ap-reason').exists()).toBe(true)
  })

  it('changing status away from Rejected hides rejection section', async () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason').exists()).toBe(true)

    await w.find('#ap-status').setValue('Applied')
    expect(w.find('#ap-reason').exists()).toBe(false)
  })
})

// ── save ──────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – save', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking Save calls api.updateApplication with the application id', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ id: 'app-42' }))
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-42', expect.any(Object))
  })

  it('updated company name is passed to the API', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await w.find('#ap-company').setValue('NewCorp')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ companyName: 'NewCorp' })
    )
  })

  it('shows save error when API throws', async () => {
    vi.mocked(api.updateApplication).mockRejectedValue(new Error('oops'))
    const w = mountPanel(makeApp())
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(w.find('.save-error').exists()).toBe(true)
    expect(w.text()).toContain('Save failed')
  })
})

// ── delete ────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking Delete calls api.deleteApplication', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const w = mountPanel(makeApp({ id: 'app-99' }))
    await w.find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(api.deleteApplication).toHaveBeenCalledWith('app-99')
  })

  it('emits close after successful delete', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const w = mountPanel(makeApp())
    await w.find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows error and does not emit close when delete fails', async () => {
    vi.mocked(api.deleteApplication).mockRejectedValue(new Error('delete failed'))
    const w = mountPanel(makeApp())
    await w.find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
    expect(w.find('.save-error').exists()).toBe(true)
  })
})

// ── prop sync (watch) ─────────────────────────────────────────────────────────

describe('ApplicationPanel – prop watch', () => {
  it('updates companyName field when application prop changes', async () => {
    const w = mountPanel(makeApp({ companyName: 'Acme' }))
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('Acme')

    await w.setProps({ application: makeApp({ companyName: 'ASML' }) })
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('ASML')
  })

  it('updates status select when application prop changes', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.setProps({ application: makeApp({ status: 'Rejected' }) })
    expect((w.find('#ap-status').element as HTMLSelectElement).value).toBe('Rejected')
  })
})
