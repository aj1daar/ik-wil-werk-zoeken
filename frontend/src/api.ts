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
    if (window.location.pathname !== '/login') {
      sessionStorage.setItem('sessionExpired', '1')
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { const j = await res.json(); if (j.message) msg = j.message } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string }>('POST', '/api/auth/login', { email, password }),

  register: (data: {
    firstName: string; lastName: string; email: string; password: string
    preferences?: { targetRole?: string; location?: string; workType?: string }
    gdprConsentAt: string
  }) =>
    request<{ token: string }>('POST', '/api/auth/register', data),

  updateProfile: (data: { firstName: string; lastName: string; preferences: unknown }) =>
    request<{ token: string }>('PUT', '/api/auth/profile', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/api/auth/change-password', { currentPassword, newPassword }),

  deleteAccount: () =>
    request<void>('DELETE', '/api/auth/account'),

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
