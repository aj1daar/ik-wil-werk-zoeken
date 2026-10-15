import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, UnauthorizedError } from '../lib/api'
import { getToken, setToken } from '../lib/auth'

function respond(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Test',
    json: async () => body,
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => respond({}))
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit]

// ── the request ──────────────────────────────────────────────────────────────

describe('api – requests', () => {
  it('calls the production API by default', async () => {
    await api.getApplications()
    expect(lastCall()[0]).toBe('https://api.nogoibay.org/api/dashboard/applications')
  })

  it('sends the stored token as a bearer header', async () => {
    await setToken('tok-123')
    await api.getApplications()
    const headers = lastCall()[1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-123')
  })

  it('sends no Authorization header before sign-in', async () => {
    await api.getApplications()
    const headers = lastCall()[1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('escapes the query so a company name with an ampersand still looks up', async () => {
    await api.lookupSponsors('Jones & Co')
    expect(lastCall()[0]).toContain('q=Jones%20%26%20Co')
  })

  it('asks for a short list of suggestions, not the register', async () => {
    await api.lookupSponsors('acme')
    expect(lastCall()[0]).toContain('limit=8')
  })

  it('posts the link to the parser', async () => {
    await api.parseJobLink('https://acme.nl/job/1')
    const [url, init] = lastCall()
    expect(url).toBe('https://api.nogoibay.org/api/dashboard/parse-job-link')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://acme.nl/job/1' })
  })

  it('posts the application as the API expects it', async () => {
    await api.createApplication({
      companyName: 'Acme B.V.',
      position: 'Engineer',
      appliedAt: '2026-10-09T00:00:00.000Z',
      locations: ['Amsterdam'],
    })
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({
      companyName: 'Acme B.V.',
      position: 'Engineer',
      appliedAt: '2026-10-09T00:00:00.000Z',
      locations: ['Amsterdam'],
    })
  })
})

// ── what comes back ──────────────────────────────────────────────────────────

describe('api – responses', () => {
  it('returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(respond({ exact: null, matches: [{ id: 'c1', name: 'Acme' }], query: 'acme' }))
    const result = await api.lookupSponsors('acme')
    expect(result.matches[0].name).toBe('Acme')
  })

  it('throws the message the server gave', async () => {
    fetchMock.mockResolvedValueOnce(respond({ message: 'Too many lookups — please wait a minute.' }, { status: 429 }))
    await expect(api.lookupSponsors('acme')).rejects.toThrow('Too many lookups — please wait a minute.')
  })

  it('falls back to the status when the body carries no message', async () => {
    fetchMock.mockResolvedValueOnce(respond({}, { status: 500 }))
    await expect(api.getApplications()).rejects.toThrow('500 Test')
  })

  it('survives an error body that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 502, statusText: 'Bad Gateway',
      json: async () => { throw new SyntaxError('not json') },
    } as unknown as Response)
    await expect(api.getApplications()).rejects.toThrow('502 Bad Gateway')
  })

  it('lets a network failure through as itself', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.getApplications()).rejects.toThrow('Failed to fetch')
  })
})

// ── an ended session ─────────────────────────────────────────────────────────

describe('api – 401', () => {
  it('reports the session as ended', async () => {
    await setToken('stale')
    fetchMock.mockResolvedValueOnce(respond({}, { status: 401 }))
    await expect(api.getApplications()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws away the token that was refused', async () => {
    await setToken('stale')
    fetchMock.mockResolvedValueOnce(respond({}, { status: 401 }))
    await api.getApplications().catch(() => undefined)
    expect(await getToken()).toBeNull()
  })

  it('says something a person can act on', async () => {
    fetchMock.mockResolvedValueOnce(respond({}, { status: 401 }))
    await expect(api.getApplications()).rejects.toThrow('Your session has ended. Sign in again.')
  })
})
