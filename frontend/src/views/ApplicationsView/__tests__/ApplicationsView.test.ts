import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition, TransitionGroup } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationsView from '../ApplicationsView.vue'
import { useApplicationsStore } from '../../../stores/applications'

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

// ── row badges: success rate + HSM sponsor tag ────────────────────────────────

describe('ApplicationsView – row badges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success rate chip when successRate is set', async () => {
    const wrapper = mountView([makeApp({ successRate: 65 })])
    await flushPromises()
    expect(wrapper.find('.success-rate-chip').exists()).toBe(true)
    expect(wrapper.find('.success-rate-chip').text()).toBe('65%')
  })

  it('reserves the success rate chip slot (hidden, not removed) when successRate is unset', async () => {
    // Same reasoning as the follow-up badge below: an absent chip must not
    // remove its line, or rows with/without a success rate end up different
    // heights and break the desktop list's fixed-row-height PAGE_SIZE math.
    const wrapper = mountView([makeApp({ successRate: undefined })])
    await flushPromises()
    const chip = wrapper.find('.success-rate-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.classes()).toContain('success-rate-chip--none')
  })

  it('shows success rate chip for 0 without treating it as unset', async () => {
    const wrapper = mountView([makeApp({ successRate: 0 })])
    await flushPromises()
    expect(wrapper.find('.success-rate-chip').exists()).toBe(true)
    expect(wrapper.find('.success-rate-chip').text()).toBe('0%')
  })

  it('shows "HSM sponsor" tag when application has a sponsorCompanyId', async () => {
    const wrapper = mountView([makeApp({ sponsorCompanyId: 'co-1' })])
    await flushPromises()
    expect(wrapper.find('.sponsor-chip').text()).toBe('HSM sponsor')
    expect(wrapper.find('.sponsor-chip').classes()).toContain('sponsor-chip--yes')
  })

  it('shows "Not HSM sponsor" tag when application has no sponsorCompanyId', async () => {
    const wrapper = mountView([makeApp({ sponsorCompanyId: undefined })])
    await flushPromises()
    expect(wrapper.find('.sponsor-chip').text()).toBe('Not HSM sponsor')
    expect(wrapper.find('.sponsor-chip').classes()).toContain('sponsor-chip--no')
  })

  it('each row gets its own sponsor tag independent of other rows', async () => {
    const wrapper = mountView([
      makeApp({ id: 'a', companyName: 'Alpha', sponsorCompanyId: 'co-1' }),
      makeApp({ id: 'b', companyName: 'Beta',  sponsorCompanyId: undefined }),
    ])
    await flushPromises()
    const chips = wrapper.findAll('.sponsor-chip')
    expect(chips[0].text()).toBe('HSM sponsor')
    expect(chips[1].text()).toBe('Not HSM sponsor')
  })
})

// ── follow-up badge slot: every row reserves the same space ────────────────────
//
// Row height on desktop was measured empirically (via a live browser, not
// happy-dom) at 157.5px — but only for rows that actually show a follow-up
// badge. Rows without one measured 129px. A single ROW_HEIGHT constant can't
// be right for both, so whichever page happens to land a mix of overdue and
// non-overdue rows would still clip/hide a row near the bottom. Fixing this
// for real means every row reserves the *same* vertical space regardless of
// its data — the badge slot is always rendered, just invisible when unused.

describe('ApplicationsView – follow-up badge always reserves its row slot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a .followup-badge element even when there is no follow-up date at all', async () => {
    const wrapper = mountView([makeApp({ followUpDate: undefined })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('followup-badge--none')
  })

  it('renders a .followup-badge element for a future (not overdue, not due today) follow-up date', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const wrapper = mountView([makeApp({ followUpDate: future })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('followup-badge--none')
  })

  it('shows the overdue variant (not the empty slot) when the follow-up date is in the past', async () => {
    const wrapper = mountView([makeApp({ followUpDate: '2020-01-01T00:00:00Z' })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.classes()).toContain('followup-badge--overdue')
    expect(badge.classes()).not.toContain('followup-badge--none')
    expect(badge.text()).toContain('Follow up')
  })

  it('shows the due-today variant when the follow-up date is today', async () => {
    const today = new Date().toISOString()
    const wrapper = mountView([makeApp({ followUpDate: today })])
    await flushPromises()
    const badge = wrapper.find('.followup-badge')
    expect(badge.classes()).toContain('followup-badge--today')
    expect(badge.classes()).not.toContain('followup-badge--none')
  })

  it('every row renders exactly one .followup-badge element, whether or not it has a follow-up date', async () => {
    const wrapper = mountView([
      makeApp({ id: 'a', followUpDate: undefined }),
      makeApp({ id: 'b', followUpDate: '2020-01-01T00:00:00Z' }),
      makeApp({ id: 'c', followUpDate: new Date().toISOString() }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.followup-badge')).toHaveLength(3)
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

// ── pagination: fixed PAGE_SIZE of 10 (2-column desktop grid, 5 rows) ──────────
//
// PAGE_SIZE used to be measured dynamically against the viewport (a
// ResizeObserver on the list, sized against a real row's height) so that
// desktop's fixed-height, clipped list always showed exactly as many rows as
// fit. That measurement was a repeat source of bugs — clipped rows, stale
// row-height constants, resize-driven page resets. The list is now a 2-col
// x 5-row card grid (desktop) / single-column list (mobile) that always
// holds up to 10 applications per page, full stop — no measurement at all.

function makeManyApps(n: number): Application[] {
  return Array.from({ length: n }, (_, i) => makeApp({ id: `app-${i}`, companyName: `Company ${i}` }))
}

function activePageLabel(wrapper: ReturnType<typeof mount>): string | undefined {
  return wrapper.findAll('.page-btn--active')[0]?.text()
}

describe('ApplicationsView – fixed page size', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows exactly 10 applications on the first page when more than 10 exist', async () => {
    const wrapper = mountView(makeManyApps(25))
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(10)
    expect(wrapper.find('.pagination-info').text()).toContain('1–10 of 25')
  })

  it('shows the remainder on the last page', async () => {
    const wrapper = mountView(makeManyApps(25))
    await flushPromises()
    await wrapper.findAll('.page-btn').find(b => b.text() === '3')!.trigger('click')
    expect(wrapper.findAll('.company-row')).toHaveLength(5)
    expect(wrapper.find('.pagination-info').text()).toContain('21–25 of 25')
  })

  it('renders all applications on one page when there are 10 or fewer', async () => {
    const wrapper = mountView(makeManyApps(7))
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(7)
    expect(wrapper.findAll('.page-btn').filter(b => /^\d+$/.test(b.text()))).toHaveLength(1)
  })

  it('clamps the current page down when the page count shrinks (e.g. bulk delete) out from under it', async () => {
    const wrapper = mountView(makeManyApps(15))
    await flushPromises()
    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(activePageLabel(wrapper)).toBe('2')

    // Simulate the list shrinking under the current filter (e.g. after a
    // delete) so page 2 no longer exists.
    const store = useApplicationsStore()
    store.applications = store.applications.slice(0, 5)
    await flushPromises()

    expect(wrapper.find('.pagination-info').text()).toContain('1–5')
  })
})
