const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function headers(): HeadersInit {
  const token = sessionStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  if (res.status === 401) {
    sessionStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  login: (password: string) =>
    request<{ token: string }>('POST', '/api/auth/login', { password }),

  getCompanies: () =>
    request<SponsorCompany[]>('GET', '/api/dashboard/sponsors'),

  getRecords: () =>
    request<ApplicationRecord[]>('GET', '/api/dashboard/stages'),

  saveRecord: (id: string, record: Partial<ApplicationRecord>, isNew: boolean) =>
    isNew
      ? request<ApplicationRecord>('POST', '/api/dashboard/stages', { ...record, id, sponsorCompanyId: id })
      : request<ApplicationRecord>('PUT', `/api/dashboard/stages/${id}`, { ...record, id, sponsorCompanyId: id }),

  deleteRecord: (id: string) =>
    request<void>('DELETE', `/api/dashboard/stages/${id}`)
}

export interface SponsorCompany {
  id: string
  name: string
  kvKNumber: string
  summary?: string
  coreIndustry?: string
  techStackTags?: string[]
  functionalTags?: string[]
  enrichedAt?: string
}

export interface ApplicationRecord {
  id: string
  sponsorCompanyId: string
  status: string
  notes?: string
  contactPersonName?: string
  contactPersonEmail?: string
  cities: string[]
  updatedAt: string
}
