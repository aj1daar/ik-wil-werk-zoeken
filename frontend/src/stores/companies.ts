import { defineStore } from 'pinia'
import { api, type SponsorCompany } from '../api'

export const useCompaniesStore = defineStore('companies', {
  state: () => ({
    companies: [] as SponsorCompany[],
    loading: false,
    error: null as string | null
  }),

  getters: {
    lastSyncedAt(state): string | null {
      if (state.companies.length === 0) return null
      const max = state.companies.reduce((best, c) =>
        c.lastVerifiedAt > best ? c.lastVerifiedAt : best,
        state.companies[0].lastVerifiedAt
      )
      return max
    }
  },

  actions: {
    async load() {
      if (this.companies.length > 0) return
      this.loading = true
      this.error = null
      try {
        this.companies = await api.getCompanies()
      } catch {
        this.error = 'Could not load company data. Please try again later.'
      } finally {
        this.loading = false
      }
    },

    search(query: string): SponsorCompany[] {
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
    }
  }
})
