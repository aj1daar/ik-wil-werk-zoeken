import { defineStore } from 'pinia'
import { api, type Application, type ApplicationStatus, type Stats } from '../api'

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  Applied:             'Applied',
  InterviewScheduled:  'Interview Scheduled',
  OfferReceived:       'Offer Received',
  OnHold:              'On Hold',
  Rejected:            'Rejected',
  Withdrawn:           'Withdrawn',
  Accepted:            'Accepted',
}

export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  Applied:             'bg-blue-100 text-blue-800',
  InterviewScheduled:  'bg-purple-100 text-purple-800',
  OfferReceived:       'bg-green-100 text-green-800',
  OnHold:              'bg-yellow-100 text-yellow-800',
  Rejected:            'bg-red-100 text-red-800',
  Withdrawn:           'bg-gray-100 text-gray-600',
  Accepted:            'bg-emerald-100 text-emerald-800',
}

export const REJECTION_REASON_LABELS: Record<string, string> = {
  dutch_language:       'Dutch language requirement',
  another_candidate:    'Proceeded with another candidate',
  incompatible_profile: 'Incompatible profile',
  salary_mismatch:      'Salary expectations mismatch',
  internal_hire:        'Position filled internally',
  other:                'Other',
}

export const ALL_STATUSES = Object.keys(STATUS_LABELS) as ApplicationStatus[]

export const useApplicationsStore = defineStore('applications', {
  state: () => ({
    applications: [] as Application[],
    stats: null as Stats | null,
    loading: false,
    statsLoading: false,
    error: null as string | null,
  }),

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.applications = await api.getApplications()
      } catch {
        this.error = 'Could not load applications. Please try again later.'
      } finally {
        this.loading = false
      }
    },

    async loadStats(from?: string, to?: string) {
      this.statsLoading = true
      try {
        this.stats = await api.getStats(from, to)
      } finally {
        this.statsLoading = false
      }
    },

    async create(data: Omit<Application, 'id' | 'userId' | 'status' | 'updatedAt'>) {
      const created = await api.createApplication(data)
      this.applications.unshift(created)
      return created
    },

    async update(id: string, data: Partial<Application>) {
      const updated = await api.updateApplication(id, data)
      const idx = this.applications.findIndex(a => a.id === id)
      if (idx !== -1) this.applications[idx] = updated
      return updated
    },

    async remove(id: string) {
      await api.deleteApplication(id)
      this.applications = this.applications.filter(a => a.id !== id)
    }
  }
})
