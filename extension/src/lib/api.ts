// The panel's own API client. Deliberately not the app's `frontend/src/api.ts`:
// that one reads the token from sessionStorage and redirects the page on a 401,
// neither of which exists here.
//
// No CORS setup is needed on the server for this. Fetches from an extension page
// bypass CORS for every origin in the manifest's host_permissions, which is why
// the API host is listed there.
import { getToken, clearToken } from './auth'

const API_BASE = (import.meta.env.VITE_IWWZ_API ?? 'https://api.nogoibay.org').replace(/\/$/, '')

export class UnauthorizedError extends Error {
  constructor() { super('Your session has ended. Sign in again.') }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    await clearToken()
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const parsed = await res.json()
      if (parsed?.message) message = parsed.message
    } catch { /* a body that is not JSON tells us nothing more */ }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface SponsorMatch {
  id: string
  name: string
  city?: string | null
  coreIndustry?: string | null
}

export interface SponsorLookup {
  query: string
  exact: SponsorMatch | null
  matches: SponsorMatch[]
}

export interface ParsedJobLink {
  company?: string | null
  position?: string | null
  locations?: string[]
  source: string
}

export interface ApplicationSummary {
  id: string
  companyName: string
  position: string
  status: string
  appliedAt: string
  sponsorCompanyId?: string | null
}

export interface NewApplication {
  companyName: string
  position: string
  appliedAt: string
  locations: string[]
  sponsorCompanyId?: string
  jobUrl?: string
  successRate?: number
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string }>('POST', '/api/auth/login', { email, password }),

  parseJobLink: (url: string) =>
    request<ParsedJobLink>('POST', '/api/dashboard/parse-job-link', { url }),

  lookupSponsors: (q: string, limit = 8) =>
    request<SponsorLookup>('GET', `/api/dashboard/sponsors/lookup?q=${encodeURIComponent(q)}&limit=${limit}`),

  getApplications: () =>
    request<ApplicationSummary[]>('GET', '/api/dashboard/applications'),

  createApplication: (application: NewApplication) =>
    request<ApplicationSummary>('POST', '/api/dashboard/applications', application),
}

export { API_BASE }
