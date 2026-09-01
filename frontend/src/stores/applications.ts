import { defineStore } from 'pinia'
import { api, type Application, type ApplicationStatus, type Stats } from '../api'

export interface HistoryChanges {
  toDelete: string[]
  toAdd:    { status: string; statusDate: string }[]
  toUpdate: { id: string; status: string; statusDate: string }[]
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  Applied:             'Applied',
  InterviewScheduled:  'Interviewing',
  Assessment:          'Assessment',
  OfferReceived:       'Offer Received',
  OnHold:              'On Hold',
  Rejected:            'Rejected',
  Withdrawn:           'Withdrawn',
  Accepted:            'Accepted',
  Ghosted:             'Ghosted',
}

export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  Applied:             'chip-applied',
  InterviewScheduled:  'chip-interview',
  Assessment:          'chip-assessment',
  OfferReceived:       'chip-offer',
  OnHold:              'chip-hold',
  Rejected:            'chip-rejected',
  Withdrawn:           'chip-withdrawn',
  Accepted:            'chip-accepted',
  Ghosted:             'chip-ghosted',
}

export const REJECTION_REASON_LABELS: Record<string, string> = {
  dutch_language:       'Dutch language requirement',
  another_candidate:    'Proceeded with another candidate',
  incompatible_profile: 'Incompatible profile',
  salary_mismatch:      'Salary expectations mismatch',
  internal_hire:        'Position filled internally',
  failed_assessment:    'Did not pass the assessment',
  no_vacancies:         'No vacancies at the moment',
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
    savingIds: [] as string[],
    toastError: null as string | null,
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

    async update(id: string, data: Partial<Application> & { statusDate?: string }) {
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
    },

    dismissToast() {
      this.toastError = null
    },

    backgroundSave(id: string, appPayload: Partial<Application>, changes: HistoryChanges) {
      this.savingIds.push(id)
      const deletes  = changes.toDelete.map(hid => api.deleteStatusHistory(hid))
      const adds     = changes.toAdd.map(h => api.addStatusHistory(id, h))
      const updates  = changes.toUpdate.map(h => api.updateStatusHistory(h.id, { status: h.status, statusDate: h.statusDate }))
      Promise.all([api.updateApplication(id, appPayload), ...deletes, ...adds, ...updates])
        .then(([updated]) => {
          const idx = this.applications.findIndex(a => a.id === id)
          if (idx !== -1) this.applications[idx] = updated as Application
        })
        .catch(() => {
          this.toastError = 'Save failed — reopen the application and try again.'
        })
        .finally(() => {
          this.savingIds = this.savingIds.filter(x => x !== id)
        })
    },
  }
})
