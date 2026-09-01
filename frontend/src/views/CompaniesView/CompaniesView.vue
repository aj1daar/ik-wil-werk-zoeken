<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR } from '../../stores/applications'
import { useAuthStore } from '../../stores/auth'
import type { SponsorCompany, Application } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'
import CompanyDetailModal from '../../components/CompanyDetailModal/CompanyDetailModal.vue'

const store    = useCompaniesStore()
const appsStore = useApplicationsStore()
const auth      = useAuthStore()

const isAdmin = computed(() => auth.user?.role === 'admin')

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
const listFilter          = ref<'all' | 'interested' | 'hidden'>('all')
const listError           = ref('')
let   listErrorTimer: ReturnType<typeof setTimeout> | null = null
const currentPage = ref(1)

// 16 tiles per page — two columns of eight. The grid stretches to fill the
// card exactly (see .company-grid), so the count is fixed regardless of how
// tall any one tile's content is.
const PAGE_SIZE = 16
const COLUMNS   = 2

onMounted(() => {
  store.load()
  store.loadLists()
  appsStore.load()
})

onUnmounted(() => { if (listErrorTimer) clearTimeout(listErrorTimer) })

function flashListError(msg: string) {
  listError.value = msg
  if (listErrorTimer) clearTimeout(listErrorTimer)
  listErrorTimer = setTimeout(() => { listError.value = '' }, 4000)
}

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

  if (listFilter.value === 'interested') {
    list = list.filter(c => store.interestedIds.has(c.id))
  } else if (listFilter.value === 'hidden') {
    list = list.filter(c => store.hiddenIds.has(c.id))
  } else if (store.hiddenIds.size > 0) {
    list = list.filter(c => !store.hiddenIds.has(c.id))
  }

  if (appliedFilter.value === 'applied') {
    return list.filter(c => mostRecentForCompany.value.has(c.id))
  }
  if (appliedFilter.value === 'not-applied') {
    return list.filter(c => !mostRecentForCompany.value.has(c.id))
  }
  return list
})

// Sort the WHOLE filtered set, then slice pages from it — so a page is a
// contiguous, correctly ordered run, not 16 arbitrary tiles ordered only
// among themselves.
const sortedCompanies = computed<SponsorCompany[]>(() => {
  const list = [...filteredRows.value]
  if (sortOrder.value === 'default') return list
  return list.sort((a, b) => {
    if (sortOrder.value === 'za') return b.name.localeCompare(a.name)
    if (sortOrder.value === 'city') return (a.city ?? '').localeCompare(b.city ?? '') || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  })
})

const pagedCompanies = computed<SponsorCompany[]>(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedCompanies.value.slice(start, start + PAGE_SIZE)
})

const pageCount = computed(() => Math.max(1, Math.ceil(sortedCompanies.value.length / PAGE_SIZE)))

// Rows the grid should render. A full page is 8; a short last page uses just
// enough rows to hold its tiles so they still stretch to fill the card.
const gridRows = computed(() => Math.max(1, Math.ceil(pagedCompanies.value.length / COLUMNS)))

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

watch([search, filterCity, filterWorkingLanguage, filterCompanySize, filterRemotePolicy, appliedFilter, includeTags, excludeTags, listFilter, sortOrder], () => {
  currentPage.value = 1
})
// Hiding a company or narrowing a filter can drop the page count below the
// page the user is on — clamp instead of leaving them on an empty page.
watch(pageCount, () => {
  if (currentPage.value > pageCount.value) currentPage.value = Math.max(1, pageCount.value)
})

function goToPage(page: number) {
  currentPage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const selectedCompany = computed<SponsorCompany | null>(() =>
  store.companies.find(c => c.id === selectedId.value) ?? null
)

const selectedCompanyApp = computed<Application | null>(() =>
  selectedId.value ? (mostRecentForCompany.value.get(selectedId.value) ?? null) : null
)

function openCompany(id: string) { selectedId.value = id }
function closeCompany() { selectedId.value = null }

// If a filter/sort change drops the open company out of the result set, close
// the modal so it isn't stranded on stale data.
watch(sortedCompanies, (list) => {
  if (selectedId.value && !list.some(c => c.id === selectedId.value)) selectedId.value = null
})

function startApplication() {
  const c = selectedCompany.value
  if (!c) return
  prefillCompany.value = c.name
  prefillSponsorId.value = c.id
  modalOpen.value = true
  selectedId.value = null
}

async function onToggleHidden() {
  const c = selectedCompany.value
  if (!c) return
  const next = store.hiddenIds.has(c.id) ? 'none' : 'hidden'
  selectedId.value = null                       // dismissing it closes the card
  try { await store.setListStatus(c.id, next) }
  catch (e) { flashListError(e instanceof Error ? e.message : 'Update failed.') }
}

async function onToggleInterested() {
  const c = selectedCompany.value
  if (!c) return
  const next = store.interestedIds.has(c.id) ? 'none' : 'interested'
  try { await store.setListStatus(c.id, next) }
  catch (e) { flashListError(e instanceof Error ? e.message : 'Update failed.') }
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
  listFilter.value = 'all'
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

        <!-- Application status -->
        <select v-model="appliedFilter" class="filter-input filter-select filter-select--auto" aria-label="Application status">
          <option value="all">Any status</option>
          <option value="applied">Applied</option>
          <option value="not-applied">Not applied</option>
        </select>

        <!-- Interested / hidden view -->
        <select v-model="listFilter" class="filter-input filter-select filter-select--md" aria-label="List view">
          <option value="all">All companies</option>
          <option value="interested">Interested only ({{ store.interestedIds.size }})</option>
          <option value="hidden">Hidden only ({{ store.hiddenIds.size }})</option>
        </select>

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

        <p v-if="listError" class="list-error" role="alert">{{ listError }}</p>

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

    <!-- Pagination lives on its own fixed-height, right-aligned strip so the
         company count never reflows the controls above it. -->
    <div class="pagination-bar">
      <div v-if="sortedCompanies.length > 0" class="pagination">
        <span class="pagination-info">{{ (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, sortedCompanies.length) }} of {{ sortedCompanies.length }}</span>
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
    </div>

    <div class="grid-wrap">
      <div v-if="store.loading" class="state-msg">Loading…</div>
      <div v-else-if="store.error" class="state-msg state-msg--error" role="alert">{{ store.error }}</div>
      <div v-else-if="pagedCompanies.length === 0" class="state-msg">
        {{ hasActiveFilters ? 'No companies match your filters.' : 'No IND sponsor companies loaded yet.' }}
      </div>

      <div v-else class="company-grid" :style="{ '--tile-rows': gridRows }">
        <div
          v-for="c in pagedCompanies"
          :key="c.id"
          role="button"
          tabindex="0"
          :aria-pressed="selectedId === c.id"
          :class="['company-tile', { 'company-tile--active': selectedId === c.id }]"
          @click="openCompany(c.id)"
          @keydown.enter.prevent="openCompany(c.id)"
          @keydown.space.prevent="openCompany(c.id)"
        >
          <div class="tile-name-line">
            <span v-if="store.interestedIds.has(c.id)" class="tile-star" title="On your interested list" aria-label="Interested">★</span>
            <span class="tile-name">{{ c.name }}</span>
            <span
              v-if="mostRecentForCompany.has(c.id)"
              :class="['status-chip', STATUS_COLOR[mostRecentForCompany.get(c.id)!.status]]"
            >{{ STATUS_LABELS[mostRecentForCompany.get(c.id)!.status] }}</span>
            <a
              v-if="c.websiteUrl"
              :href="c.websiteUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="tile-website"
              @click.stop
            >Website ↗</a>
          </div>

          <div v-if="c.city || c.coreIndustry || c.workingLanguage" class="tile-chips">
            <span v-if="c.city" class="tile-chip tile-chip--city">{{ c.city }}</span>
            <span v-if="c.coreIndustry" class="tile-chip">{{ c.coreIndustry }}</span>
            <span v-if="c.workingLanguage" class="tile-chip tile-chip--lang">{{ c.workingLanguage }}</span>
          </div>
          <p v-else class="tile-empty">No details yet</p>
        </div>
      </div>
    </div>

    <Transition name="modal">
      <CompanyDetailModal
        v-if="selectedCompany"
        :key="selectedCompany.id"
        :company="selectedCompany"
        :application="selectedCompanyApp"
        :is-admin="isAdmin"
        :is-hidden="store.hiddenIds.has(selectedCompany.id)"
        :is-interested="store.interestedIds.has(selectedCompany.id)"
        @close="closeCompany"
        @start-application="startApplication"
        @toggle-hidden="onToggleHidden"
        @toggle-interested="onToggleInterested"
      />
    </Transition>

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
.list-error { font-size: .75rem; color: var(--col-error); white-space: nowrap; margin: 0; }

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

/* split-panel's .filter-select--sm caps at 110px, which clips "Not applied". */
.filter-select--auto {
  width: auto;
  min-width: 7.5rem;
  max-width: none;
  flex: 0 0 auto;
}
/* Wide enough for "Interested only (12)". */
.filter-select--md {
  max-width: 190px;
  min-width: 9.5rem;
  flex: 0 0 auto;
}

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

/* ── company grid ─────────────────────────────────────────────────────────── */

.grid-wrap { flex: 1; min-height: 0; }

.company-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(var(--tile-rows, 8), minmax(0, 1fr));
  grid-auto-flow: column;
  gap: 1px;
  background: var(--col-border);
  height: 100%;
}

.company-tile {
  background: var(--col-bg);
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: .3rem;
  padding: .5rem 1rem;
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  transition: background .12s;
}
.company-tile:hover { background: var(--col-surface); }
.company-tile--active { background: var(--col-accent-lt); }
.company-tile:focus-visible { outline: 2px solid var(--col-accent); outline-offset: -2px; }

/* Header line: name (shrinks first), status chip, then the website link
   pushed to the far right — keeps the whole tile to just two rows. */
.tile-name-line { display: flex; align-items: center; gap: .4rem; min-width: 0; overflow: hidden; }
.tile-name {
  flex: 0 1 auto; min-width: 0;
  font-size: .875rem; font-weight: 600; color: var(--col-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tile-name-line > .status-chip { flex-shrink: 0; }
.tile-star { flex-shrink: 0; color: #f59e0b; font-size: .8rem; line-height: 1; }
.tile-website {
  flex-shrink: 0; margin-left: auto;
  font-size: .68rem; color: var(--col-accent); text-decoration: none; white-space: nowrap;
}
.tile-website:hover { text-decoration: underline; }

/* One row of chips, clipped at the right edge if they overrun — never a
   half-height pill clipped along the bottom. */
.tile-chips { display: flex; flex-wrap: nowrap; gap: .3rem; overflow: hidden; }
.tile-chip {
  flex-shrink: 0;
  font-size: .68rem; padding: .12rem .45rem; border-radius: 9999px; white-space: nowrap;
  background: var(--col-raised); color: var(--col-muted);
}
.tile-chip--city { background: var(--col-accent-lt); color: var(--col-accent-dk); }
.tile-chip--lang { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #1d4ed8; }
.tile-empty { font-size: .72rem; color: var(--col-subtle); font-style: italic; margin: 0; }

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
.chip-ghosted     { background: var(--col-raised); color: var(--col-subtle); }

@media (max-width: 767px) {
  /* One column, natural tile height, page scrolls. */
  .company-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-auto-flow: row;
    height: auto;
  }
  .company-tile { min-height: 60px; }
  .page-btn { min-width: 2.75rem; height: 2.75rem; }  /* Apple HIG 44pt tap target */
}

@media (min-width: 768px) {
  /* Fixed-height card: the grid fills it exactly, so 16 tiles are always the
     same total height regardless of any one tile's content — no scroll. */
  .dashboard { height: calc(100vh - 86px); }
  .grid-wrap { overflow: hidden; }
}

/* Own strip, right-aligned, fixed height — the company count changes what's
   inside .pagination but never moves the filter controls or the grid. */
.pagination-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 2.5rem;
  padding: .3rem 1.5rem;
  background: var(--col-surface);
  border-bottom: 1px solid var(--col-border);
}
.pagination {
  display: flex;
  align-items: center;
  gap: .25rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.pagination-info {
  font-size: .72rem;
  color: var(--col-subtle);
  margin-right: .4rem;
  white-space: nowrap;
  min-width: 5.5rem;
  text-align: right;
}

@media (max-width: 767px) {
  .pagination-bar { padding: .3rem 1rem; justify-content: center; }
  .pagination { justify-content: center; }
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
