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
    },

    allTagsByUsage(state): string[] {
      const counts = new Map<string, number>()
      for (const c of state.companies) {
        if (c.coreIndustry) counts.set(c.coreIndustry, (counts.get(c.coreIndustry) ?? 0) + 1)
        c.techStackTags?.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1))
        c.functionalTags?.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1))
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag)
    },

    allWorkingLanguages(state): string[] {
      const set = new Set<string>()
      for (const c of state.companies) {
        if (c.workingLanguage) set.add(c.workingLanguage)
      }
      return [...set].sort((a, b) => a.localeCompare(b))
    },

    allCompanySizes(state): string[] {
      const ORDER = ['startup', 'scaleup', 'mid', 'large', 'enterprise']
      const set = new Set<string>()
      for (const c of state.companies) {
        if (c.companySize) set.add(c.companySize)
      }
      return [...set].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    },

    allRemotePolicies(state): string[] {
      const ORDER = ['remote', 'hybrid', 'office', 'unknown']
      const set = new Set<string>()
      for (const c of state.companies) {
        if (c.remotePolicy) set.add(c.remotePolicy)
      }
      return [...set].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
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

    async updateSummary(id: string, summary: string) {
      const updated = await api.adminUpdateCompanySummary(id, summary)
      const idx = this.companies.findIndex(c => c.id === id)
      if (idx !== -1) this.companies[idx] = updated
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
      query:           string
      city:            string
      includeTags:     string[]
      excludeTags:     string[]
      workingLanguage?: string
      companySize?:    string
      remotePolicy?:   string
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

          if (opts.workingLanguage && c.workingLanguage !== opts.workingLanguage) return false
          if (opts.companySize && c.companySize !== opts.companySize) return false
          if (opts.remotePolicy && c.remotePolicy !== opts.remotePolicy) return false

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
