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
    request<void>('POST', '/api/auth/register', data),

  verifyEmail: (token: string) =>
    request<{ token: string }>('GET', `/api/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email: string) =>
    request<void>('POST', '/api/auth/resend-verification', { email }),

  updateProfile: (data: { firstName: string; lastName: string; preferences: unknown }) =>
    request<{ token: string }>('PUT', '/api/auth/profile', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/api/auth/change-password', { currentPassword, newPassword }),

  deleteAccount: () =>
    request<void>('DELETE', '/api/auth/account'),

  forgotPassword: (email: string) =>
    request<void>('POST', '/api/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    request<void>('POST', '/api/auth/reset-password', { token, newPassword }),

  changeEmail: (currentPassword: string, newEmail: string) =>
    request<void>('POST', '/api/auth/change-email', { currentPassword, newEmail }),

  confirmEmailChange: (token: string) =>
    request<{ token: string }>('GET', `/api/auth/confirm-email-change?token=${encodeURIComponent(token)}`),

  adminListUsers: () =>
    request<AdminUserSummary[]>('GET', '/api/admin/users'),

  adminPromote: (email: string) =>
    request<AdminUserSummary>('POST', '/api/admin/promote', { email }),

  adminReloadSponsors: () =>
    request<{ message: string }>('POST', '/api/admin/reload-sponsors'),

  getCompanies: () =>
    request<SponsorCompany[]>('GET', '/api/dashboard/sponsors'),

  getApplications: () =>
    request<Application[]>('GET', '/api/dashboard/applications'),

  createApplication: (data: Omit<Application, 'id' | 'userId' | 'status' | 'updatedAt'>) =>
    request<Application>('POST', '/api/dashboard/applications', data),

  updateApplication: (id: string, data: Partial<Application>) =>
    request<Application>('PUT', `/api/dashboard/applications/${id}`, data),

  deleteApplication: (id: string) =>
    request<void>('DELETE', `/api/dashboard/applications/${id}`),

  getStats: (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    const qs = params.toString()
    return request<Stats>('GET', `/api/dashboard/stats${qs ? `?${qs}` : ''}`)
  },

  getActivityLog: (applicationId: string) =>
    request<ActivityLog[]>('GET', `/api/dashboard/activity/${applicationId}`),

  bulkUpdateStatus: (ids: string[], status: string) =>
    request<Application[]>('PATCH', '/api/dashboard/applications', { ids, status }),
}

export interface SponsorCompany {
  id: string
  name: string
  kvKNumber: string
  city?: string
  lastVerifiedAt: string
  summary?: string
  coreIndustry?: string
  techStackTags?: string[]
  functionalTags?: string[]
  enrichedAt?: string
}

export interface Application {
  id: string
  userId: string
  companyName: string
  position: string
  appliedAt: string
  status: ApplicationStatus
  rejectionReason?: RejectionReason
  rejectionNote?: string
  notes?: string
  contactPersonName?: string
  contactPersonEmail?: string
  locations: string[]
  followUpDate?: string
  updatedAt: string
}

export interface ActivityLog {
  id: string
  applicationId: string
  field: string
  oldValue?: string
  newValue?: string
  changedAt: string
}

export type ApplicationStatus =
  | 'Applied'
  | 'InterviewScheduled'
  | 'OfferReceived'
  | 'OnHold'
  | 'Rejected'
  | 'Withdrawn'
  | 'Accepted'

export type RejectionReason =
  | 'dutch_language'
  | 'another_candidate'
  | 'incompatible_profile'
  | 'salary_mismatch'
  | 'internal_hire'
  | 'other'

export interface Stats {
  total: number
  byStatus: Partial<Record<ApplicationStatus, number>>
}

export interface AdminUserSummary {
  userId:        string
  email:         string
  firstName:     string
  lastName:      string
  role:          string
  emailVerified: boolean
  createdAt:     string
}
