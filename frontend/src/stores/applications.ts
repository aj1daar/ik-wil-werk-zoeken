import { defineStore } from 'pinia'
import { api, type Application, type ApplicationStatus, type Stats } from '../api'

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  Applied:             'Applied',
  InterviewScheduled:  'Interviewing',
  OfferReceived:       'Offer Received',
  OnHold:              'On Hold',
  Rejected:            'Rejected',
  Withdrawn:           'Withdrawn',
  Accepted:            'Accepted',
}

export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  Applied:             'chip-applied',
  InterviewScheduled:  'chip-interview',
  OfferReceived:       'chip-offer',
  OnHold:              'chip-hold',
  Rejected:            'chip-rejected',
  Withdrawn:           'chip-withdrawn',
  Accepted:            'chip-accepted',
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
    statsError: null as string | null,
  }),

  getters: {
    appliedSponsorIds: (state): Set<string> =>
      new Set(
        state.applications
          .map(a => a.sponsorCompanyId)
          .filter((id): id is string => !!id)
      ),
  },

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
      this.statsError = null
      try {
        this.stats = await api.getStats(from, to)
      } catch {
        this.statsError = 'Could not load stats. Please try again.'
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
    },

    async bulkUpdate(ids: string[], status: string) {
      const updated = await api.bulkUpdateStatus(ids, status)
      for (const u of updated) {
        const idx = this.applications.findIndex(a => a.id === u.id)
        if (idx !== -1) this.applications[idx] = u
      }
      return updated
    }
  }
})
