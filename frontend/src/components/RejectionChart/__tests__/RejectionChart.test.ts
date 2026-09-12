import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Application } from '../../../api'
import RejectionChart from '../RejectionChart.vue'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    companyName: 'Acme',
    position: 'Dev',
    appliedAt: '2025-01-15T00:00:00Z',
    status: 'Rejected',
    locations: [],
    updatedAt: '2025-01-20T00:00:00Z',
    ...overrides,
  }
}

function mountChart(applications: Application[] = [], from?: string, to?: string) {
  return mount(RejectionChart, { props: { applications, from, to } })
}

const labels = (w: ReturnType<typeof mountChart>) => w.findAll('.reason-label').map(l => l.text())
const counts = (w: ReturnType<typeof mountChart>) => w.findAll('.reason-count').map(c => c.text())
const countOf = (w: ReturnType<typeof mountChart>, label: string) => counts(w)[labels(w).indexOf(label)]
const barWidths = (w: ReturnType<typeof mountChart>) =>
  w.findAll('.reason-bar').map(b => (b.attributes('style') ?? '').match(/width:\s*([\d.]+)%/)?.[1])

// ── rendering ─────────────────────────────────────────────────────────────────

describe('RejectionChart – rendering', () => {
  it('renders without throwing', () => {
    expect(() => mountChart()).not.toThrow()
  })

  it('renders the "Rejection reasons" title', () => {
    expect(mountChart().find('.chart-title').text()).toBe('Rejection reasons')
  })

  it('shows generic empty state when no applications at all', () => {
    const w = mountChart([])
    expect(w.find('.chart-empty').text()).toBe('No rejections yet.')
    expect(w.find('.reason-list').exists()).toBe(false)
  })

  it('shows generic empty state when applications exist but none are Rejected', () => {
    const w = mountChart([makeApp({ status: 'Applied' }), makeApp({ status: 'Accepted' })])
    expect(w.find('.chart-empty').text()).toBe('No rejections yet.')
  })

  it('shows period empty state when a date range is set', () => {
    const w = mountChart([], '2025-01-01T00:00:00Z')
    expect(w.find('.chart-empty').text()).toBe('No rejections in this period.')
  })

  it('shows the list when at least one Rejected application exists', () => {
    const w = mountChart([makeApp()])
    expect(w.find('.reason-list').exists()).toBe(true)
    expect(w.find('.chart-empty').exists()).toBe(false)
  })

  it('is a real ordered list that reads without colour or a key', () => {
    const w = mountChart([makeApp({ rejectionReason: 'dutch_language' })])
    expect(w.find('ol.reason-list').exists()).toBe(true)
    expect(w.find('.reason-row').text()).toContain('Dutch language requirement')
    expect(w.find('.reason-row').text()).toContain('1')
  })

  it('hides the decorative bar from assistive tech', () => {
    const w = mountChart([makeApp()])
    expect(w.find('.reason-track').attributes('aria-hidden')).toBe('true')
  })

  it('no longer draws a canvas chart', () => {
    expect(mountChart([makeApp()]).findComponent({ name: 'VChart' }).exists()).toBe(false)
  })
})

// ── rejection counting ────────────────────────────────────────────────────────

describe('RejectionChart – rejection counting', () => {
  it('counts rejections by known reason', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'another_candidate' }),
      makeApp({ rejectionReason: 'another_candidate' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
    ])
    expect(countOf(w, 'Another candidate selected')).toBe('2')
    expect(countOf(w, 'Salary mismatch')).toBe('1')
  })

  it('groups applications with no reason under "No reason given"', () => {
    const w = mountChart([makeApp(), makeApp()])
    expect(countOf(w, 'No reason given')).toBe('2')
  })

  it('only lists reasons that occurred', () => {
    const w = mountChart([makeApp({ rejectionReason: 'other' })])
    expect(labels(w)).toEqual(['Other'])
  })

  it('ignores non-Rejected applications', () => {
    const w = mountChart([
      makeApp({ status: 'Applied' }),
      makeApp({ status: 'Accepted' }),
      makeApp({ status: 'Rejected', rejectionReason: 'internal_hire' }),
    ])
    expect(labels(w)).toEqual(['Filled internally'])
    expect(counts(w)).toEqual(['1'])
  })

  it('ignores a leftover rejection reason on an application that is no longer Rejected', () => {
    const w = mountChart([makeApp({ status: 'Applied', rejectionReason: 'dutch_language' })])
    expect(w.find('.chart-empty').exists()).toBe(true)
  })

  it('lists every reason that occurred, all nine plus "No reason given"', () => {
    const reasons = ['dutch_language', 'another_candidate', 'incompatible_profile', 'salary_mismatch', 'internal_hire', 'failed_assessment', 'no_vacancies', 'no_hsm_sponsorship', 'other'] as const
    const w = mountChart([...reasons.map(r => makeApp({ rejectionReason: r })), makeApp()])
    expect(w.findAll('.reason-row')).toHaveLength(10)
  })

  it('failed_assessment is counted separately from other', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'failed_assessment' }),
      makeApp({ rejectionReason: 'failed_assessment' }),
      makeApp({ rejectionReason: 'other' }),
    ])
    expect(countOf(w, 'Did not pass assessment')).toBe('2')
    expect(countOf(w, 'Other')).toBe('1')
  })

  it('no_hsm_sponsorship is not conflated with no_vacancies', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'no_hsm_sponsorship' }),
      makeApp({ rejectionReason: 'no_hsm_sponsorship' }),
      makeApp({ rejectionReason: 'no_vacancies' }),
    ])
    expect(countOf(w, 'No HSM visa sponsorship')).toBe('2')
    expect(countOf(w, 'No vacancies at the moment')).toBe('1')
  })

  it('an unrecognised reason from the API does not crash or invent a row', () => {
    const w = mountChart([makeApp({ rejectionReason: 'made_up_reason' as never }), makeApp({ rejectionReason: 'other' })])
    expect(labels(w)).toEqual(['Other'])
  })
})

// ── ranking and bars ──────────────────────────────────────────────────────────

describe('RejectionChart – ranking and bars', () => {
  it('ranks reasons by count, largest first', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'other' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
    ])
    expect(counts(w)).toEqual(['3', '2', '1'])
    expect(labels(w)[0]).toBe('Dutch language requirement')
  })

  it('breaks ties in a fixed reason order, not input order', () => {
    const a = mountChart([makeApp({ rejectionReason: 'salary_mismatch' }), makeApp({ rejectionReason: 'another_candidate' })])
    const b = mountChart([makeApp({ rejectionReason: 'another_candidate' }), makeApp({ rejectionReason: 'salary_mismatch' })])
    expect(labels(a)).toEqual(['Another candidate selected', 'Salary mismatch'])
    expect(labels(b)).toEqual(labels(a))
  })

  it('sizes each bar relative to the most common reason', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
      makeApp({ rejectionReason: 'salary_mismatch' }),
      makeApp({ rejectionReason: 'other' }),
    ])
    expect(barWidths(w)).toEqual(['100', '50', '25'])
  })

  it('a single reason fills the full bar', () => {
    expect(barWidths(mountChart([makeApp({ rejectionReason: 'other' })]))).toEqual(['100'])
  })

  it('mutes "Other" and "No reason given" so they do not read as findings', () => {
    const w = mountChart([
      makeApp({ rejectionReason: 'dutch_language' }),
      makeApp({ rejectionReason: 'other' }),
      makeApp(),
    ])
    const neutral = w.findAll('.reason-row--neutral').map(r => r.find('.reason-label').text())
    expect(neutral.sort()).toEqual(['No reason given', 'Other'])
  })
})

// ── date range filtering ──────────────────────────────────────────────────────

describe('RejectionChart – date range filtering', () => {
  const inside  = makeApp({ appliedAt: '2025-06-01T00:00:00Z', rejectionReason: 'other' })
  const outside = makeApp({ appliedAt: '2025-01-01T00:00:00Z', rejectionReason: 'other' })

  it('includes applications within the range', () => {
    const w = mountChart([inside, outside], '2025-05-01T00:00:00Z', '2025-07-01T00:00:00Z')
    expect(counts(w)).toEqual(['1'])
  })

  it('shows empty state when all rejections fall outside the range', () => {
    const w = mountChart([outside], '2025-05-01T00:00:00Z', '2025-07-01T00:00:00Z')
    expect(w.find('.chart-empty').exists()).toBe(true)
  })

  it('applies no filter when from/to are omitted', () => {
    expect(counts(mountChart([inside, outside]))).toEqual(['2'])
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('RejectionChart – reactivity', () => {
  it('updates when applications prop changes', async () => {
    const w = mountChart([makeApp({ rejectionReason: 'other' })])
    expect(w.findAll('.reason-row')).toHaveLength(1)

    await w.setProps({
      applications: [
        makeApp({ rejectionReason: 'other' }),
        makeApp({ rejectionReason: 'salary_mismatch' }),
      ],
    })
    expect(w.findAll('.reason-row')).toHaveLength(2)
  })

  it('switches from the list to empty when all rejections are removed', async () => {
    const w = mountChart([makeApp()])
    expect(w.find('.reason-list').exists()).toBe(true)

    await w.setProps({ applications: [makeApp({ status: 'Applied' })] })
    expect(w.find('.chart-empty').exists()).toBe(true)
  })
})
