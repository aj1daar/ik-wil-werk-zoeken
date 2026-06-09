import { defineStore } from 'pinia'
import { api, type SponsorCompany, type ApplicationRecord } from '../api'

export const STATUSES = [
  'Bookmarked', 'Viewed', 'Abandoned', 'Applied',
  'Ongoing Interview', 'Rejected', 'Declined Offer',
  'Offer Proposed', 'Offer Accepted'
] as const

export type AppStatus = typeof STATUSES[number]

export const STATUS_COLORS: Record<string, string> = {
  'Bookmarked':        'bg-blue-900/60 text-blue-300 border-blue-700',
  'Viewed':            'bg-slate-700/60 text-slate-300 border-slate-600',
  'Abandoned':         'bg-slate-800/60 text-slate-500 border-slate-700',
  'Applied':           'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  'Ongoing Interview': 'bg-orange-900/60 text-orange-300 border-orange-700',
  'Rejected':          'bg-red-900/60 text-red-400 border-red-800',
  'Declined Offer':    'bg-rose-900/60 text-rose-300 border-rose-800',
  'Offer Proposed':    'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  'Offer Accepted':    'bg-green-900/60 text-green-300 border-green-700',
}

export interface CompanyRow extends SponsorCompany {
  record: ApplicationRecord | null
}

export const useCompaniesStore = defineStore('companies', {
  state: () => ({
    companies: [] as SponsorCompany[],
    records: {} as Record<string, ApplicationRecord>,
    loading: false,
    error: null as string | null
  }),

  getters: {
    tracked(state): CompanyRow[] {
      const result: CompanyRow[] = []
      for (const r of Object.values(state.records)) {
        const c = state.companies.find(c => c.id === r.sponsorCompanyId)
        if (c) result.push({ ...c, record: r })
      }
      return result
    },
    recordFor: (state) => (companyId: string) =>
      state.records[companyId] ?? null
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        const [companies, records] = await Promise.all([
          api.getCompanies(),
          api.getRecords()
        ])
        this.companies = companies
        this.records = Object.fromEntries(records.map(r => [r.sponsorCompanyId, r]))
      } catch {
        this.error = 'Could not reach the backend. Make sure Azure Functions is running.'
      } finally {
        this.loading = false
      }
    },

    search(query: string): CompanyRow[] {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return this.companies
        .filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.coreIndustry?.toLowerCase().includes(q) ||
          c.techStackTags?.some(t => t.toLowerCase().includes(q)) ||
          c.functionalTags?.some(t => t.toLowerCase().includes(q))
        )
        .slice(0, 60)
        .map(c => ({ ...c, record: this.records[c.id] ?? null }))
    },

    async upsertRecord(companyId: string, data: Partial<ApplicationRecord>) {
      const isNew = !this.records[companyId]
      const saved = await api.saveRecord(companyId, data, isNew)
      this.records[companyId] = saved
      return saved
    },

    async removeRecord(companyId: string) {
      await api.deleteRecord(companyId)
      delete this.records[companyId]
    }
  }
})
