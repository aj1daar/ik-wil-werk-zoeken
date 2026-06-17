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

  refreshToken: () =>
    request<{ token: string }>('POST', '/api/auth/refresh'),

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
    request<AdminUserSummary[]>('GET', '/api/mgmt/users'),

  adminPromote: (email: string) =>
    request<AdminUserSummary>('POST', '/api/mgmt/promote', { email }),

  adminReloadSponsors: () =>
    request<{ message: string }>('POST', '/api/mgmt/reload-sponsors'),

  adminEnrichSponsors: () =>
    request<{ enriched: number; remaining: number; message: string }>('POST', '/api/mgmt/enrich-sponsors'),

  adminGetSyncLogs: () =>
    request<SyncLog[]>('GET', '/api/mgmt/sync-logs'),

  getCompanies: () =>
    request<SponsorCompany[]>('GET', '/api/dashboard/sponsors'),

  getApplications: () =>
    request<Application[]>('GET', '/api/dashboard/applications'),

  createApplication: (data: Omit<Application, 'id' | 'userId' | 'status' | 'updatedAt'>) =>
    request<Application>('POST', '/api/dashboard/applications', data),

  updateApplication: (id: string, data: Partial<Application> & { statusDate?: string }) =>
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

  getStatusHistory: (applicationId: string) =>
    request<StatusHistory[]>('GET', `/api/dashboard/status-history/${applicationId}`),

  addStatusHistory: (applicationId: string, data: { status: string; statusDate: string }) =>
    request<StatusHistory>('POST', `/api/dashboard/status-history/${applicationId}`, data),

  updateStatusHistory: (historyId: string, data: { status?: string; statusDate?: string }) =>
    request<StatusHistory>('PUT', `/api/dashboard/status-history-item/${historyId}`, data),

  deleteStatusHistory: (historyId: string) =>
    request<void>('DELETE', `/api/dashboard/status-history-item/${historyId}`),
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
  workingLanguage?: string
  companySize?: string
  remotePolicy?: string
  parentCompanyName?: string
  websiteUrl?: string
  targetMarket?: string
  enrichedAt?: string
  enrichmentVersion?: number
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
  sponsorCompanyId?: string
  jobUrl?: string
}

export interface ActivityLog {
  id: string
  applicationId: string
  field: string
  oldValue?: string
  newValue?: string
  changedAt: string
}

export interface StatusHistory {
  id: string
  applicationId: string
  status: ApplicationStatus
  statusDate: string  // "YYYY-MM-DD"
  createdAt: string
}

export type ApplicationStatus =
  | 'Applied'
  | 'InterviewScheduled'
  | 'Assessment'
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
  | 'failed_assessment'
  | 'no_vacancies'
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

export interface SyncLog {
  id:            number
  syncedAt:      string
  triggerSource: string
  added:         number
  updated:       number
  removed:       number
  enriched:      number
  totalAfterSync: number
}
