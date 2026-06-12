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
      return state.companies.reduce((best, c) =>
        c.lastVerifiedAt > best ? c.lastVerifiedAt : best,
        state.companies[0].lastVerifiedAt
      )
    },

    allCities(state): string[] {
      const set = new Set<string>()
      for (const c of state.companies) {
        if (c.city) set.add(c.city)
      }
      return [...set].sort((a, b) => a.localeCompare(b))
    },

    allTags(state): string[] {
      const set = new Set<string>()
      for (const c of state.companies) {
        if (c.coreIndustry) set.add(c.coreIndustry)
        c.techStackTags?.forEach(t => set.add(t))
        c.functionalTags?.forEach(t => set.add(t))
      }
      return [...set].sort((a, b) => a.localeCompare(b))
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
          c.city?.toLowerCase().includes(q) ||
          c.coreIndustry?.toLowerCase().includes(q) ||
          c.techStackTags?.some(t => t.toLowerCase().includes(q)) ||
          c.functionalTags?.some(t => t.toLowerCase().includes(q))
        )
        .slice(0, 60)
    },

    filter(opts: {
      query:       string
      city:        string
      includeTags: string[]
      excludeTags: string[]
    }): SponsorCompany[] {
      const q = opts.query.trim().toLowerCase()
      return this.companies
        .filter(c => {
          if (q && !(
            c.name.toLowerCase().includes(q) ||
            c.city?.toLowerCase().includes(q) ||
            c.coreIndustry?.toLowerCase().includes(q) ||
            c.techStackTags?.some(t => t.toLowerCase().includes(q)) ||
            c.functionalTags?.some(t => t.toLowerCase().includes(q))
          )) return false

          if (opts.city && c.city !== opts.city) return false

          if (opts.includeTags.length > 0) {
            const tags = companyTags(c)
            if (!opts.includeTags.every(tag => tags.includes(tag))) return false
          }

          if (opts.excludeTags.length > 0) {
            const tags = companyTags(c)
            if (opts.excludeTags.some(tag => tags.includes(tag))) return false
          }

          return true
        })
        .slice(0, 100)
    }
  }
})

function companyTags(c: SponsorCompany): string[] {
  return [
    ...(c.coreIndustry ? [c.coreIndustry] : []),
    ...(c.techStackTags ?? []),
    ...(c.functionalTags ?? []),
  ]
}
