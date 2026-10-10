import { describe, expect, it } from 'vitest'
import { findOpenApplication } from '../lib/duplicates'
import type { ApplicationSummary } from '../lib/api'

function app(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 'a1',
    companyName: 'Acme B.V.',
    position: 'Engineer',
    status: 'Applied',
    appliedAt: '2026-10-01T00:00:00.000Z',
    sponsorCompanyId: null,
    ...overrides,
  }
}

describe('findOpenApplication', () => {
  it('finds an open application at the same company', () => {
    expect(findOpenApplication([app()], 'Acme B.V.')?.id).toBe('a1')
  })

  it('ignores case and surrounding space, since the name may be typed', () => {
    expect(findOpenApplication([app()], '  acme b.v. ')?.id).toBe('a1')
  })

  it('matches on the sponsor id when the company came from the register', () => {
    const rows = [app({ companyName: 'Acme Holding', sponsorCompanyId: 'c1' })]
    expect(findOpenApplication(rows, 'Acme B.V.', 'c1')?.id).toBe('a1')
  })

  it('prefers the sponsor id over a same-name row, so a rename still matches', () => {
    const rows = [
      app({ id: 'byName' }),
      app({ id: 'bySponsor', companyName: 'Acme Holding', sponsorCompanyId: 'c1' }),
    ]
    expect(findOpenApplication(rows, 'Acme B.V.', 'c1')?.id).toBe('bySponsor')
  })

  it('falls back to the name when the sponsor id matches nothing', () => {
    expect(findOpenApplication([app()], 'Acme B.V.', 'c9')?.id).toBe('a1')
  })

  it.each(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])(
    'says nothing about a %s application, which is finished',
    status => {
      expect(findOpenApplication([app({ status })], 'Acme B.V.')).toBeNull()
    })

  it.each(['Applied', 'InterviewScheduled', 'OfferReceived'])(
    'warns about a %s application, which is still running',
    status => {
      expect(findOpenApplication([app({ status })], 'Acme B.V.')).not.toBeNull()
    })

  it('says nothing about a different company', () => {
    expect(findOpenApplication([app()], 'Other B.V.')).toBeNull()
  })

  it('says nothing while the field is empty', () => {
    expect(findOpenApplication([app()], '   ')).toBeNull()
  })

  it('says nothing when there are no applications at all', () => {
    expect(findOpenApplication([], 'Acme B.V.')).toBeNull()
  })

  it('returns the first open match when there are several', () => {
    const rows = [app({ id: 'first' }), app({ id: 'second' })]
    expect(findOpenApplication(rows, 'Acme B.V.')?.id).toBe('first')
  })

  it('skips a finished row to find the open one', () => {
    const rows = [app({ id: 'done', status: 'Rejected' }), app({ id: 'live' })]
    expect(findOpenApplication(rows, 'Acme B.V.')?.id).toBe('live')
  })
})
