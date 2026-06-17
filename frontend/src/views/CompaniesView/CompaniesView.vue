<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR } from '../../stores/applications'
import type { SponsorCompany, Application } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'

const store    = useCompaniesStore()
const appsStore = useApplicationsStore()

const search              = ref('')
const filterCity          = ref('')
const filterWorkingLanguage = ref('')
const filterCompanySize   = ref('')
const filterRemotePolicy  = ref('')
const appliedFilter       = ref<'all' | 'applied' | 'not-applied'>('all')
const includeTags         = ref<string[]>([])
const excludeTags         = ref<string[]>([])
const selectedId          = ref<string | null>(null)
const modalOpen           = ref(false)
const prefillCompany      = ref('')
const prefillSponsorId    = ref<string | undefined>(undefined)
const showFilters         = ref(false)
const showDropdownFilters = ref(false)
const tagSearch           = ref('')

const TAG_LIMIT = 60
const visibleTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  const all = store.allTagsByUsage
  if (!q) return all.slice(0, TAG_LIMIT)
  return all.filter(t => t.toLowerCase().includes(q))
})
const sortOrder           = ref<'default' | 'az' | 'za' | 'city'>('az')
const hiddenIds           = ref<Set<string>>((() => {
  try { return new Set<string>(JSON.parse(localStorage.getItem('iwwz_hidden_companies') ?? '[]')) }
  catch { return new Set<string>() }
})())
const showHidden          = ref(false)
const currentPage         = ref(1)

const PAGE_SIZE = 15

onMounted(() => {
  store.load()
  appsStore.load()
})

const mostRecentForCompany = computed((): Map<string, Application> => {
  const byId   = new Map<string, Application>()
  const byName = new Map<string, Application>()
  for (const app of appsStore.applications) {
    if (app.sponsorCompanyId) {
      const existing = byId.get(app.sponsorCompanyId)
      if (!existing || app.updatedAt > existing.updatedAt)
        byId.set(app.sponsorCompanyId, app)
    } else if (app.companyName) {
      const key = app.companyName.trim().toLowerCase()
      const existing = byName.get(key)
      if (!existing || app.updatedAt > existing.updatedAt)
        byName.set(key, app)
    }
  }
  const map = new Map<string, Application>(byId)
  for (const company of store.companies) {
    if (map.has(company.id)) continue
    const match = byName.get(company.name.trim().toLowerCase())
    if (match) map.set(company.id, match)
  }
  return map
})

const anyFilter = computed(() =>
  search.value.trim() !== '' || filterCity.value !== '' ||
  filterWorkingLanguage.value !== '' || filterCompanySize.value !== '' || filterRemotePolicy.value !== '' ||
  appliedFilter.value !== 'all' ||
  includeTags.value.length > 0 || excludeTags.value.length > 0
)

const filteredRows = computed<SponsorCompany[]>(() => {
  let list: SponsorCompany[]
  if (search.value.trim() !== '' || filterCity.value !== '' ||
      filterWorkingLanguage.value !== '' || filterCompanySize.value !== '' || filterRemotePolicy.value !== '' ||
      includeTags.value.length > 0 || excludeTags.value.length > 0) {
    list = store.filter({
      query:           search.value,
      city:            filterCity.value,
      workingLanguage: filterWorkingLanguage.value || undefined,
      companySize:     filterCompanySize.value || undefined,
      remotePolicy:    filterRemotePolicy.value || undefined,
      includeTags:     includeTags.value,
      excludeTags:     excludeTags.value,
    })
  } else {
    list = store.companies
  }

  if (!showHidden.value && hiddenIds.value.size > 0) {
    list = list.filter(c => !hiddenIds.value.has(c.id))
  }

  if (appliedFilter.value === 'applied') {
    return list.filter(c => mostRecentForCompany.value.has(c.id))
  }
  if (appliedFilter.value === 'not-applied') {
    return list.filter(c => !mostRecentForCompany.value.has(c.id))
  }
  return list
})

const rows = computed<SponsorCompany[]>(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredRows.value.slice(start, start + PAGE_SIZE)
})

const pageCount = computed(() => Math.ceil(filteredRows.value.length / PAGE_SIZE))

const visiblePages = computed((): (number | null)[] => {
  const total = pageCount.value
  const cur = currentPage.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const around = new Set([1, total, cur - 2, cur - 1, cur, cur + 1, cur + 2].filter(p => p >= 1 && p <= total))
  const sorted = [...around].sort((a, b) => a - b)
  const pages: (number | null)[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push(null)
    pages.push(sorted[i])
  }
  return pages
})

watch([search, filterCity, filterWorkingLanguage, filterCompanySize, filterRemotePolicy, appliedFilter, includeTags, excludeTags, showHidden], () => {
  currentPage.value = 1
})

function goToPage(page: number) {
  currentPage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Parent company grouping ──────────────────────────────────────────────────

interface ListItem {
  type: 'company' | 'group-header'
  key: string
  company?: SponsorCompany
  isSubsidiary?: boolean
  groupKey?: string
  parentName?: string
  groupCount?: number
}

const expandedGroups = ref(new Set<string>())

const listItems = computed<ListItem[]>(() => {
  const list = rows.value

  const grouped = new Map<string, SponsorCompany[]>()
  const ungrouped: SponsorCompany[] = []

  for (const c of list) {
    const parent = c.parentCompanyName?.trim()
    if (parent) {
      const key = parent.toLowerCase()
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(c)
    } else {
      ungrouped.push(c)
    }
  }

  const entries: Array<{ name: string; items: ListItem[] }> = []

  for (const [key, companies] of grouped) {
    if (companies.length === 1) {
      ungrouped.push(companies[0])
      continue
    }
    const parentName = companies[0].parentCompanyName!
    const groupItems: ListItem[] = [
      { type: 'group-header', key: `group:${key}`, groupKey: key, parentName, groupCount: companies.length }
    ]
    if (expandedGroups.value.has(key)) {
      for (const c of companies) {
        groupItems.push({ type: 'company', key: c.id, company: c, isSubsidiary: true })
      }
    }
    entries.push({ name: parentName, items: groupItems })
  }

  for (const c of ungrouped) {
    entries.push({ name: c.name, items: [{ type: 'company', key: c.id, company: c, isSubsidiary: false }] })
  }

  if (sortOrder.value !== 'default') {
    entries.sort((a, b) => {
      if (sortOrder.value === 'za') return b.name.localeCompare(a.name)
      if (sortOrder.value === 'city') {
        const ca = a.items.find(i => i.type === 'company')?.company?.city ?? ''
        const cb = b.items.find(i => i.type === 'company')?.company?.city ?? ''
        const cmp = ca.localeCompare(cb)
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })
  }
  return entries.flatMap(e => e.items)
})

function toggleGroup(groupKey: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(groupKey)) next.delete(groupKey)
  else next.add(groupKey)
  expandedGroups.value = next
}

const selectedCompany = computed<SponsorCompany | null>(() =>
  store.companies.find(c => c.id === selectedId.value) ?? null
)

const selectedCompanyApp = computed<Application | null>(() =>
  selectedId.value ? (mostRecentForCompany.value.get(selectedId.value) ?? null) : null
)

watch(rows, (newRows) => {
  if (selectedId.value && !newRows.find(c => c.id === selectedId.value))
    selectedId.value = null
})

function selectRow(id: string) { selectedId.value = selectedId.value === id ? null : id }

function startApplication(company: SponsorCompany) {
  prefillCompany.value = company.name
  prefillSponsorId.value = company.id
  modalOpen.value = true
}

function formatSyncDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function toggleIncludeTag(tag: string) {
  excludeTags.value = excludeTags.value.filter(t => t !== tag)
  const i = includeTags.value.indexOf(tag)
  if (i >= 0) includeTags.value.splice(i, 1)
  else includeTags.value.push(tag)
}

function toggleExcludeTag(tag: string) {
  includeTags.value = includeTags.value.filter(t => t !== tag)
  const i = excludeTags.value.indexOf(tag)
  if (i >= 0) excludeTags.value.splice(i, 1)
  else excludeTags.value.push(tag)
}

function tagState(tag: string): 'include' | 'exclude' | 'none' {
  if (includeTags.value.includes(tag)) return 'include'
  if (excludeTags.value.includes(tag)) return 'exclude'
  return 'none'
}

function clearFilters() {
  search.value = ''
  filterCity.value = ''
  filterWorkingLanguage.value = ''
  filterCompanySize.value = ''
  filterRemotePolicy.value = ''
  appliedFilter.value = 'all'
  includeTags.value = []
  excludeTags.value = []
  sortOrder.value = 'az'
}

function toggleHidden(id: string) {
  const next = new Set(hiddenIds.value)
  if (next.has(id)) next.delete(id)
  else { next.add(id); selectedId.value = null }
  hiddenIds.value = next
  try { localStorage.setItem('iwwz_hidden_companies', JSON.stringify([...next])) } catch { /* ignore */ }
}

const hasActiveFilters = computed(() => anyFilter.value)

const activeDropdownCount = computed(() =>
  [filterCity.value, filterWorkingLanguage.value, filterCompanySize.value, filterRemotePolicy.value]
    .filter(v => v !== '').length
)
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <!-- Row 1: search -->
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by name, city, industry or tags…" class="filter-input pl-9" aria-label="Search companies" />
      </div>

      <!-- Row 2: compact controls -->
      <div class="filter-controls-row">
        <!-- Dropdown filters toggle -->
        <button
          :class="['btn-filter-toggle', (showDropdownFilters || activeDropdownCount > 0) && 'btn-filter-toggle--active']"
          @click="showDropdownFilters = !showDropdownFilters"
          :aria-expanded="showDropdownFilters"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M7 12h10M11 18h2" />
          </svg>
          Filters
          <span v-if="activeDropdownCount > 0" class="filter-count">{{ activeDropdownCount }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" :class="['btn-icon-sm', 'btn-chevron', showDropdownFilters && 'btn-chevron--open']" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Sort -->
        <select v-model="sortOrder" class="filter-input filter-select filter-select--sm" aria-label="Sort companies">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="city">City A → Z</option>
          <option value="default">Default</option>
        </select>

        <!-- Applied toggle -->
        <div class="applied-toggle" role="group" aria-label="Applied filter">
          <button :class="['applied-toggle-btn', appliedFilter === 'all' && 'applied-toggle-btn--active']" @click="appliedFilter = 'all'">All</button>
          <button :class="['applied-toggle-btn', appliedFilter === 'applied' && 'applied-toggle-btn--active']" @click="appliedFilter = 'applied'">Applied</button>
          <button :class="['applied-toggle-btn', appliedFilter === 'not-applied' && 'applied-toggle-btn--active']" @click="appliedFilter = 'not-applied'">Not applied</button>
        </div>

        <!-- Tag filter -->
        <button
          :class="['btn-filter-toggle', showFilters && 'btn-filter-toggle--active']"
          @click="showFilters = !showFilters"
          :aria-expanded="showFilters"
          aria-controls="tag-filter-panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
          </svg>
          Tags
          <span v-if="includeTags.length + excludeTags.length > 0" class="filter-count">
            {{ includeTags.length + excludeTags.length }}
          </span>
        </button>

        <button v-if="hasActiveFilters" @click="clearFilters" class="btn-clear-filters" aria-label="Clear all filters">
          Clear
        </button>

        <button
          v-if="hiddenIds.size > 0"
          :class="['btn-filter-toggle', showHidden && 'btn-filter-toggle--active']"
          @click="showHidden = !showHidden"
        >
          {{ showHidden ? 'Showing hidden' : `Hidden (${hiddenIds.size})` }}
        </button>

        <p v-if="store.lastSyncedAt" class="sync-badge">
          IND data last synced {{ formatSyncDate(store.lastSyncedAt) }}
        </p>
      </div>
    </div>

    <!-- Collapsible dropdown filters panel -->
    <Transition name="filter-drop">
      <div v-if="showDropdownFilters" class="dropdown-filters-panel">
        <select v-model="filterCity" class="filter-input filter-select" aria-label="Filter by city">
          <option value="">All cities</option>
          <option v-for="city in store.allCities" :key="city" :value="city">{{ city }}</option>
        </select>
        <select v-model="filterWorkingLanguage" class="filter-input filter-select" aria-label="Filter by working language">
          <option value="">All languages</option>
          <option v-for="lang in store.allWorkingLanguages" :key="lang" :value="lang">{{ lang }}</option>
        </select>
        <select v-model="filterCompanySize" class="filter-input filter-select" aria-label="Filter by company size">
          <option value="">All sizes</option>
          <option v-for="size in store.allCompanySizes" :key="size" :value="size">{{ size }}</option>
        </select>
        <select v-model="filterRemotePolicy" class="filter-input filter-select" aria-label="Filter by remote policy">
          <option value="">All policies</option>
          <option v-for="policy in store.allRemotePolicies" :key="policy" :value="policy">{{ policy }}</option>
        </select>
      </div>
    </Transition>

    <div v-if="showFilters" id="tag-filter-panel" class="tag-filter-panel">
      <div class="tag-filter-header">
        <p class="tag-filter-hint">
          <strong>Click once</strong> to include (green), <strong>click again</strong> to exclude (red), <strong>third click</strong> to clear.
        </p>
        <div class="tag-search-wrap">
          <svg class="tag-search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            v-model="tagSearch"
            placeholder="Search tags…"
            class="tag-search-input"
            aria-label="Search tags"
          />
          <span class="tag-search-count">
            {{ visibleTags.length }} of {{ store.allTagsByUsage.length }}
          </span>
        </div>
      </div>
      <div class="tag-filter-grid">
        <button
          v-for="tag in visibleTags"
          :key="tag"
          :class="['tag-toggle', `tag-toggle--${tagState(tag)}`]"
          @click="tagState(tag) === 'none' ? toggleIncludeTag(tag) : tagState(tag) === 'include' ? toggleExcludeTag(tag) : (includeTags = includeTags.filter(t => t !== tag), excludeTags = excludeTags.filter(t => t !== tag))"
          :aria-pressed="tagState(tag) !== 'none'"
        >
          <span v-if="tagState(tag) === 'include'">✓ </span>
          <span v-else-if="tagState(tag) === 'exclude'">✕ </span>
          {{ tag }}
        </button>
      </div>
      <p v-if="!tagSearch && store.allTagsByUsage.length > TAG_LIMIT" class="tag-overflow-note">
        Showing top {{ TAG_LIMIT }} most-used tags. Search to find others.
      </p>
    </div>

    <div class="main-split">
      <div :class="['company-list', selectedCompany ? 'hidden md:block' : '']">
        <div v-if="store.loading" class="state-msg">Loading…</div>
        <div v-else-if="store.error" class="state-msg state-msg--error" role="alert">{{ store.error }}</div>
        <div v-else-if="rows.length === 0" class="state-msg">
          {{ hasActiveFilters ? 'No companies match your filters.' : 'No IND sponsor companies loaded yet.' }}
        </div>

        <ul v-else>
          <template v-for="item in listItems" :key="item.key">
            <!-- Group header row -->
            <li
              v-if="item.type === 'group-header'"
              class="company-row group-header-row"
              @click="toggleGroup(item.groupKey!)"
              :aria-expanded="expandedGroups.has(item.groupKey!)"
            >
              <div class="row-body">
                <div class="row-name-line">
                  <p class="row-name">{{ item.parentName }}</p>
                  <span class="group-count-badge">{{ item.groupCount }} entities</span>
                </div>
              </div>
              <svg
                class="row-chevron"
                :class="{ 'chevron-rotated': expandedGroups.has(item.groupKey!) }"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </li>

            <!-- Company row -->
            <li
              v-else
              @click="selectRow(item.company!.id)"
              :class="['company-row', item.isSubsidiary && 'company-row--subsidiary', { 'company-row--active': selectedId === item.company!.id }]"
              :aria-selected="selectedId === item.company!.id"
            >
              <div class="row-body">
                <div class="row-name-line">
                  <p class="row-name">{{ item.company!.name }}</p>
                  <span
                    v-if="mostRecentForCompany.has(item.company!.id)"
                    :class="['status-chip', STATUS_COLOR[mostRecentForCompany.get(item.company!.id)!.status]]"
                  >{{ STATUS_LABELS[mostRecentForCompany.get(item.company!.id)!.status] }}</span>
                </div>
                <p class="row-industry">
                  <span v-if="item.company!.city" class="row-city">{{ item.company!.city }}</span>
                  <span v-if="item.company!.city && item.company!.coreIndustry"> · </span>
                  <span v-if="item.company!.coreIndustry">{{ item.company!.coreIndustry }}</span>
                </p>
              </div>
              <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </li>
          </template>
        </ul>
      </div>

      <transition name="panel">
        <div v-if="selectedCompany" class="detail-panel">
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title-block">
                <h2 class="panel-title">{{ selectedCompany.name }}</h2>
                <p class="panel-subtitle">
                  <span v-if="selectedCompany.city">{{ selectedCompany.city }} · </span>
                  KvK {{ selectedCompany.kvKNumber }}
                  <template v-if="selectedCompany.websiteUrl">
                    · <a :href="selectedCompany.websiteUrl" target="_blank" rel="noopener noreferrer" class="panel-website-link">
                      website
                      <svg xmlns="http://www.w3.org/2000/svg" class="ext-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </template>
                </p>
              </div>
              <button @click="selectedId = null" class="btn-icon" aria-label="Close panel">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="panel-body">
              <div v-if="selectedCompanyApp" class="field">
                <label class="field-label">Your application</label>
                <div class="applied-badge-row">
                  <span :class="['status-chip', STATUS_COLOR[selectedCompanyApp.status]]">
                    {{ STATUS_LABELS[selectedCompanyApp.status] }}
                  </span>
                  <span class="applied-position">{{ selectedCompanyApp.position }}</span>
                </div>
              </div>

              <div
                v-if="selectedCompany.workingLanguage || selectedCompany.remotePolicy || selectedCompany.companySize || selectedCompany.targetMarket || selectedCompany.parentCompanyName"
                class="field"
              >
                <label class="field-label">Details</label>
                <div class="meta-chips">
                  <span v-if="selectedCompany.workingLanguage" class="meta-chip meta-chip--lang">{{ selectedCompany.workingLanguage }}</span>
                  <span v-if="selectedCompany.remotePolicy" class="meta-chip meta-chip--remote">{{ selectedCompany.remotePolicy }}</span>
                  <span v-if="selectedCompany.companySize" class="meta-chip meta-chip--size">{{ selectedCompany.companySize }}</span>
                  <span v-if="selectedCompany.targetMarket" class="meta-chip meta-chip--market">{{ selectedCompany.targetMarket }}</span>
                  <span v-if="selectedCompany.parentCompanyName" class="meta-chip meta-chip--parent" :title="`Part of ${selectedCompany.parentCompanyName}`">↑ {{ selectedCompany.parentCompanyName }}</span>
                </div>
              </div>

              <div v-if="selectedCompany.summary" class="field">
                <label class="field-label">About</label>
                <p class="panel-body-text">{{ selectedCompany.summary }}</p>
                <p class="ai-notice">AI-generated summary by Google Gemini. May contain errors.</p>
              </div>

              <div v-if="selectedCompany.coreIndustry || (selectedCompany.techStackTags?.length || selectedCompany.functionalTags?.length)" class="field">
                <label class="field-label">Tags</label>
                <div class="tag-row">
                  <span v-if="selectedCompany.coreIndustry" class="tag">{{ selectedCompany.coreIndustry }}</span>
                  <span v-for="t in selectedCompany.techStackTags" :key="t" class="tag--muted">{{ t }}</span>
                  <span v-for="t in selectedCompany.functionalTags" :key="t" class="tag--muted">{{ t }}</span>
                </div>
              </div>
            </div>

            <div class="panel-footer">
              <a
                v-if="selectedCompany.websiteUrl"
                :href="selectedCompany.websiteUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-ghost footer-website"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Visit website
              </a>
              <button @click="toggleHidden(selectedCompany.id)" class="btn-hide-company">
                {{ hiddenIds.has(selectedCompany.id) ? 'Unhide' : 'Not interested' }}
              </button>
              <button @click="startApplication(selectedCompany)" class="btn-primary footer-primary">
                {{ selectedCompanyApp ? 'Add Another Application' : 'Start Application' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <div v-if="filteredRows.length > 0" class="pagination">
      <span class="pagination-info">{{ (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filteredRows.length) }} of {{ filteredRows.length }}</span>
      <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" aria-label="Previous page">‹</button>
      <template v-for="(p, i) in visiblePages" :key="i">
        <span v-if="p === null" class="page-ellipsis">…</span>
        <button
          v-else
          :class="['page-btn', p === currentPage && 'page-btn--active']"
          @click="goToPage(p)"
          :aria-current="p === currentPage ? 'page' : undefined"
        >{{ p }}</button>
      </template>
      <button class="page-btn" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)" aria-label="Next page">›</button>
    </div>

    <Transition name="modal">
      <NewApplicationModal
        v-if="modalOpen"
        :prefill-company="prefillCompany"
        :prefill-sponsor-id="prefillSponsorId"
        @close="modalOpen = false"
      />
    </Transition>
  </div>
</template>

<style src="../../assets/split-panel.css" scoped></style>
<style scoped>
.dashboard { max-width: 1280px; margin: 10px auto 0; }

.sync-badge { font-size: .75rem; color: var(--col-subtle); white-space: nowrap; padding-left: .25rem; }

.btn-filter-toggle {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-surface); color: var(--col-muted);
  border: 1px solid var(--col-border); border-radius: .375rem;
  padding: .4rem .75rem; font-size: .8rem; cursor: pointer; white-space: nowrap;
  transition: background .15s, color .15s;
}
.btn-filter-toggle:hover { background: var(--col-raised); color: var(--col-text); }
.btn-filter-toggle--active { background: var(--col-accent-lt); color: var(--col-accent-dk); border-color: var(--col-accent-lt); }
.btn-icon-sm { width: .9rem; height: .9rem; }
.btn-chevron { transition: transform .2s ease; }
.btn-chevron--open { transform: rotate(180deg); }
.filter-count {
  background: var(--col-accent); color: #fff;
  border-radius: 9999px; font-size: .7rem; font-weight: 700;
  padding: .05rem .45rem; line-height: 1.4;
}

.btn-clear-filters {
  background: none; border: none; color: var(--col-error); font-size: .8rem;
  cursor: pointer; padding: .45rem .5rem; white-space: nowrap;
}
.btn-clear-filters:hover { text-decoration: underline; }

.applied-toggle {
  display: inline-flex; border: 1px solid var(--col-border); border-radius: .375rem;
  overflow: hidden; background: var(--col-surface);
}
.applied-toggle-btn {
  background: none; border: none; border-right: 1px solid var(--col-border);
  padding: .4rem .7rem; font-size: .8rem; cursor: pointer; color: var(--col-muted);
  white-space: nowrap; transition: background .12s, color .12s;
}
.applied-toggle-btn:last-child { border-right: none; }
.applied-toggle-btn:hover { background: var(--col-raised); color: var(--col-text); }
.applied-toggle-btn--active { background: var(--col-accent-lt); color: var(--col-accent-dk); font-weight: 600; }

.tag-filter-panel {
  background: var(--col-surface);
  border-bottom: 1px solid var(--col-border);
  padding: .75rem 1.5rem 1rem;
}
.tag-filter-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 1rem; margin-bottom: .625rem; flex-wrap: wrap;
}
.tag-filter-hint { font-size: .75rem; color: var(--col-muted); margin: 0; flex: 1; min-width: 180px; }
.tag-search-wrap {
  display: flex; align-items: center; gap: .375rem;
  flex-shrink: 0;
}
.tag-search-icon { width: .875rem; height: .875rem; color: var(--col-subtle); flex-shrink: 0; }
.tag-search-input {
  background: none; border: none; outline: none;
  font-size: .8rem; color: var(--col-text); width: 120px;
}
.tag-search-input::placeholder { color: var(--col-subtle); }
.tag-search-count { font-size: .7rem; color: var(--col-subtle); white-space: nowrap; }
.tag-filter-grid { display: flex; flex-wrap: wrap; gap: .375rem; }
.tag-overflow-note { font-size: .72rem; color: var(--col-subtle); margin: .5rem 0 0; }

.tag-toggle {
  padding: .2rem .65rem; border-radius: 9999px; font-size: .75rem; font-weight: 500;
  cursor: pointer; border: 1px solid var(--col-border);
  background: var(--col-raised); color: var(--col-muted);
  transition: background .12s, color .12s, border-color .12s;
}
.tag-toggle--include { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
.tag-toggle--exclude { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

.panel { display: flex; flex-direction: column; height: 100%; }
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border); }
.panel-title-block { flex: 1; }
.panel-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); }
.panel-subtitle { font-size: .75rem; color: var(--col-subtle); margin-top: .125rem; }
.panel-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.panel-body-text { font-size: .875rem; color: var(--col-muted); line-height: 1.6; }
.ai-notice { font-size: .7rem; color: var(--col-subtle); margin-top: .5rem; }
.meta-chips { display: flex; flex-wrap: wrap; gap: .375rem; }
.meta-chip {
  display: inline-flex; align-items: center;
  padding: .2rem .6rem; border-radius: 9999px; font-size: .72rem; font-weight: 500;
  background: var(--col-raised); color: var(--col-muted);
  border: 1px solid var(--col-border);
}
.meta-chip--lang   { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #1d4ed8; border-color: color-mix(in srgb, #3b82f6 25%, transparent); }
.meta-chip--remote { background: color-mix(in srgb, #10b981 12%, transparent); color: #065f46; border-color: color-mix(in srgb, #10b981 25%, transparent); }
.meta-chip--size   { background: color-mix(in srgb, #f59e0b 12%, transparent); color: #92400e; border-color: color-mix(in srgb, #f59e0b 25%, transparent); }
.meta-chip--market { background: color-mix(in srgb, #8b5cf6 12%, transparent); color: #4c1d95; border-color: color-mix(in srgb, #8b5cf6 25%, transparent); }
.meta-chip--parent { background: var(--col-subtle); color: var(--col-muted); font-style: italic; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.field-label { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--col-subtle); }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.tag { background: var(--col-accent-lt); color: var(--col-accent-dk); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 500; }
.tag--muted { background: var(--col-raised); color: var(--col-muted); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; }
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); display: flex; gap: .625rem; flex-wrap: wrap; }
.icon { width: 1.25rem; height: 1.25rem; }
.footer-primary { flex: 1; min-width: 140px; }
.footer-website {
  display: inline-flex; align-items: center; gap: .3rem;
  font-size: .875rem; white-space: nowrap; flex-shrink: 0;
}
.panel-website-link {
  color: var(--col-accent); text-decoration: none; font-size: .75rem;
  display: inline-flex; align-items: center; gap: .15rem;
}
.panel-website-link:hover { text-decoration: underline; }
.ext-icon { width: .7rem; height: .7rem; }
.row-city { color: var(--col-accent-dk); }

.row-name-line { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }

.status-chip {
  display: inline-block; padding: .15rem .5rem; border-radius: 9999px;
  font-size: .7rem; font-weight: 600; white-space: nowrap;
}
.chip-applied     { background: #dbeafe; color: #1e40af; }
.chip-interview   { background: #ede9fe; color: #5b21b6; }
.chip-offer       { background: #d1fae5; color: #065f46; }
.chip-hold        { background: #fef3c7; color: #92400e; }
.chip-rejected    { background: #fee2e2; color: #991b1b; }
.chip-withdrawn   { background: var(--col-raised); color: var(--col-muted); }
.chip-accepted    { background: #bbf7d0; color: #14532d; }

.applied-badge-row { display: flex; align-items: center; gap: .5rem; }
.applied-position { font-size: .8rem; color: var(--col-muted); }

.group-header-row {
  background: var(--col-raised);
  font-weight: 600;
  cursor: pointer;
}
.group-count-badge {
  font-size: .7rem; font-weight: 500; color: var(--col-accent-dk);
  background: var(--col-accent-lt); border-radius: 9999px; padding: .15rem .5rem;
}
.company-row--subsidiary {
  padding-left: 2rem;
  background: var(--col-bg);
}
.chevron-rotated { transform: rotate(90deg); }

/* load more */
.load-more-wrap { padding: .75rem 1rem; display: flex; gap: .5rem; justify-content: center; }
.btn-load-more {
  background: var(--col-surface); color: var(--col-muted);
  border: 1px solid var(--col-border); border-radius: .375rem;
  padding: .45rem 1.25rem; font-size: .8rem; cursor: pointer;
}
.btn-load-more:hover { background: var(--col-raised); color: var(--col-text); }

.btn-hide-company {
  background: none; border: 1px solid var(--col-border); color: var(--col-muted);
  border-radius: .375rem; padding: .45rem .875rem; font-size: .8rem; cursor: pointer;
  flex-shrink: 0; white-space: nowrap;
}
.btn-hide-company:hover { background: var(--col-raised); color: var(--col-error); }

@media (max-width: 767px) {
  .panel { height: auto; }
  .panel-body { overflow-y: visible; }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .25rem;
  padding: .625rem 1rem;
  flex-wrap: wrap;
  border-top: 1px solid var(--col-border-lt);
  background: var(--col-bg);
  flex-shrink: 0;
}
.pagination-info {
  width: 100%;
  text-align: center;
  font-size: .72rem;
  color: var(--col-subtle);
  margin-bottom: .2rem;
}
.page-btn {
  min-width: 2rem;
  height: 2rem;
  padding: 0 .4rem;
  border: 1px solid var(--col-border);
  border-radius: .375rem;
  background: var(--col-surface);
  color: var(--col-muted);
  font-size: .8rem;
  cursor: pointer;
  transition: background .12s, color .12s;
}
.page-btn:hover:not(:disabled) { background: var(--col-raised); color: var(--col-text); }
.page-btn--active { background: var(--col-accent); color: #fff; border-color: var(--col-accent); font-weight: 600; }
.page-btn:disabled { opacity: .35; cursor: default; }
.page-ellipsis { padding: 0 .15rem; color: var(--col-subtle); font-size: .8rem; line-height: 2rem; }
</style>
