import { defineStore } from 'pinia'
import { api, type SponsorCompany, type ApplicationRecord } from '../api'

export const STATUSES = [
  'Bookmarked', 'Viewed', 'Abandoned', 'Applied',
  'Ongoing Interview', 'Rejected', 'Declined Offer',
  'Offer Proposed', 'Offer Accepted'
] as const

export type AppStatus = typeof STATUSES[number]

export const STATUS_COLORS: Record<string, string> = {
  'Bookmarked':        'status-bookmarked',
  'Viewed':            'status-viewed',
  'Abandoned':         'status-abandoned',
  'Applied':           'status-applied',
  'Ongoing Interview': 'status-interview',
  'Rejected':          'status-rejected',
  'Declined Offer':    'status-declined',
  'Offer Proposed':    'status-proposed',
  'Offer Accepted':    'status-accepted',
}

export const STATUS_DOT: Record<string, string> = {
  'Bookmarked':        '#B25E2A',
  'Viewed':            '#A8958A',
  'Abandoned':         '#C0B09E',
  'Applied':           '#C0A030',
  'Ongoing Interview': '#2E8060',
  'Rejected':          '#C04A30',
  'Declined Offer':    '#9E3828',
  'Offer Proposed':    '#8040A8',
  'Offer Accepted':    '#2E6E4A',
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
        this.error = 'Could not load company data. Please try again later.'
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
