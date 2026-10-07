<script setup lang="ts">
import AppIcon from '../../components/ui/AppIcon.vue'
import LoadingRegion from '../../components/ui/LoadingRegion.vue'
import AppPagination from '../../components/AppPagination/AppPagination.vue'
import MultiSelectFilter from '../../components/MultiSelectFilter/MultiSelectFilter.vue'
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
// Each facet holds the values chosen for it. Several cities at once is the
// normal case here: a search runs across the Randstad, not one town.
const filterCity          = ref<string[]>([])
const filterWorkingLanguage = ref<string[]>([])
const filterCompanySize   = ref<string[]>([])
const filterRemotePolicy  = ref<string[]>([])

// Counts chosen values, not facets in use: picking three cities reads as 3, which
// is the number the user is holding in their head. Declared with the refs it adds
// up, because the filtering below runs during setup and would otherwise reach a
// const that does not exist yet.
const activeDropdownCount = computed(() =>
  filterCity.value.length + filterWorkingLanguage.value.length +
  filterCompanySize.value.length + filterRemotePolicy.value.length
)
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
  search.value.trim() !== '' || activeDropdownCount.value > 0 ||
  appliedFilter.value !== 'all' ||
  includeTags.value.length > 0 || excludeTags.value.length > 0
)

const filteredRows = computed<SponsorCompany[]>(() => {
  let list: SponsorCompany[]
  if (search.value.trim() !== '' || activeDropdownCount.value > 0 ||
      includeTags.value.length > 0 || excludeTags.value.length > 0) {
    list = store.filter({
      query:           search.value,
      city:            filterCity.value,
      workingLanguage: filterWorkingLanguage.value,
      companySize:     filterCompanySize.value,
      remotePolicy:    filterRemotePolicy.value,
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
// Register names can open with quotes or symbols ('"AAE" Advanced…',
// '@EasePay'), which put them ahead of every A. Sort on the first letter or
// digit instead, ignore case and accents, and compare digits as numbers so
// "2 Getthere" files before "10X Genomics".
function nameKey(name: string) {
  return name.replace(/^[^\p{L}\p{N}]+/u, '')
}
function byName(a: SponsorCompany, b: SponsorCompany) {
  return nameKey(a.name).localeCompare(nameKey(b.name), undefined, { sensitivity: 'base', numeric: true })
}

const sortedCompanies = computed<SponsorCompany[]>(() => {
  const list = [...filteredRows.value]
  if (sortOrder.value === 'default') return list
  return list.sort((a, b) => {
    if (sortOrder.value === 'za') return byName(b, a)
    if (sortOrder.value === 'city') return (a.city ?? '').localeCompare(b.city ?? '') || byName(a, b)
    return byName(a, b)
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
  filterCity.value = []
  filterWorkingLanguage.value = []
  filterCompanySize.value = []
  filterRemotePolicy.value = []
  appliedFilter.value = 'all'
  includeTags.value = []
  excludeTags.value = []
  sortOrder.value = 'az'
  listFilter.value = 'all'
}

const hasActiveFilters = computed(() => anyFilter.value)
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <!-- Row 1: search -->
      <div class="filter-search">
        <AppIcon name="search" class="filter-icon" />
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
          <AppIcon name="filter" class="btn-icon-sm" />
          Filters
          <span v-if="activeDropdownCount > 0" class="filter-count">{{ activeDropdownCount }}</span>
          <AppIcon name="chevron-down" :class="['btn-icon-sm', 'btn-chevron', showDropdownFilters && 'btn-chevron--open']" />
        </button>

        <!-- Sort -->
        <select v-model="sortOrder" class="filter-input filter-select filter-select--sm" aria-label="Sort companies">
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
          <option value="city">City A–Z</option>
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
          <AppIcon name="sort" class="btn-icon-sm" />
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
        <MultiSelectFilter
          v-model="filterCity"
          :options="store.allCities"
          all-label="All cities"
          label="Filter by city"
        />
        <MultiSelectFilter
          v-model="filterWorkingLanguage"
          :options="store.allWorkingLanguages"
          all-label="All languages"
          label="Filter by working language"
        />
        <MultiSelectFilter
          v-model="filterCompanySize"
          :options="store.allCompanySizes"
          all-label="All sizes"
          label="Filter by company size"
        />
        <MultiSelectFilter
          v-model="filterRemotePolicy"
          :options="store.allRemotePolicies"
          all-label="All policies"
          label="Filter by remote policy"
        />
      </div>
    </Transition>

    <div v-if="showFilters" id="tag-filter-panel" class="tag-filter-panel">
      <div class="tag-filter-header">
        <p class="tag-filter-hint">
          <strong>Click once</strong> to include (green), <strong>click again</strong> to exclude (red), <strong>third click</strong> to clear.
        </p>
        <div class="tag-search-wrap">
          <AppIcon name="search" class="tag-search-icon" />
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
          <AppIcon v-if="tagState(tag) === 'include'" name="check" class="icon-1em" />
          <AppIcon v-else-if="tagState(tag) === 'exclude'" name="close" class="icon-1em" />
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
      <AppPagination
        v-if="sortedCompanies.length > 0"
        :page="currentPage"
        :page-size="PAGE_SIZE"
        :total="sortedCompanies.length"
        @update:page="goToPage"
      />
    </div>

    <div class="grid-wrap">
      <LoadingRegion v-if="store.loading" label="Loading companies">
        <!-- A full page of rows: gridRows counts loaded companies, which is none
             yet, and one row would lay the 16 tiles out as a single strip -->
        <div class="company-grid" :style="{ '--tile-rows': 8 }" aria-hidden="true">
          <div v-for="n in 16" :key="n" class="company-tile skeleton-tile">
            <span class="skeleton skeleton--title" :style="{ width: `${40 + (n * 17) % 35}%` }" />
            <span class="skeleton" :style="{ width: `${55 + (n * 23) % 35}%` }" />
          </div>
        </div>
      </LoadingRegion>
      <div v-else-if="store.error" class="state-msg state-msg--error" role="alert">{{ store.error }}</div>
      <div v-else-if="pagedCompanies.length === 0" class="state-msg">
        <template v-if="hasActiveFilters">
          No companies match your filters.
          <button @click="clearFilters" class="btn-ghost state-msg-action">Clear filters</button>
        </template>
        <template v-else>No IND sponsor companies loaded yet.</template>
      </div>

      <!-- A TransitionGroup, so changing a filter or turning a page fades the
           tiles instead of swapping all sixteen in one frame. The same `list`
           transition My applications uses on its rows. -->
      <TransitionGroup v-else tag="div" name="list" class="company-grid" :style="{ '--tile-rows': gridRows }">
        <div
          v-for="c in pagedCompanies"
          :key="c.id"
          :class="['company-tile', { 'company-tile--active': selectedId === c.id }]"
          @click="openCompany(c.id)"
        >
          <!-- The tile is a mouse target only; the name is the real button, so
               the website link inside the tile isn't nested in another control -->
          <div class="tile-name-line">
            <span v-if="store.interestedIds.has(c.id)" class="tile-star" role="img" aria-label="On your interested list" title="On your interested list"><AppIcon name="star" class="icon-1em" /></span>
            <button type="button" class="tile-name" @click.stop="openCompany(c.id)">{{ c.name }}</button>
            <span
              v-if="mostRecentForCompany.has(c.id)"
              :class="['chip', 'chip--sm', 'status-chip', STATUS_COLOR[mostRecentForCompany.get(c.id)!.status]]"
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
      </TransitionGroup>
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
  /* The height of the .filter-input dropdowns in the same row */
  min-height: 2.375rem;
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-bg); color: var(--col-muted);
  border: 1px solid var(--col-border); border-radius: var(--radius);
  padding: .4rem .75rem; font-size: .8rem; cursor: pointer; white-space: nowrap;
  transition: background var(--dur-instant) var(--ease-standard), color var(--dur-instant) var(--ease-standard);
}
/* Under a finger the dropdowns grow to 44px (style.css); the toggles follow them,
   or the rule above would leave them 6px shorter than their neighbours */
@media (pointer: coarse) {
  .btn-filter-toggle { min-height: 44px; }
}
.btn-filter-toggle:hover { background: var(--col-raised); color: var(--col-text); }
.btn-filter-toggle--active { background: var(--col-accent-lt); color: var(--col-accent-dk); border-color: var(--col-accent-lt); }

.btn-clear-filters {
  background: none; border: none; color: var(--col-muted); font-size: .8rem;
  cursor: pointer; padding: .45rem .5rem; white-space: nowrap;
  /* The height of the filter toggles it sits beside */
  min-height: 2.375rem;
}
@media (pointer: coarse) {
  .btn-clear-filters { min-height: 44px; }
}
.btn-clear-filters:hover { color: var(--col-text); text-decoration: underline; }

/* Positioned here, styled by .btn-ghost in style.css. */
.state-msg-action { display: block; margin: .75rem auto 0; }

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
  transition: background var(--dur-instant) var(--ease-standard), color var(--dur-instant) var(--ease-standard), border-color var(--dur-instant) var(--ease-standard);
}
.tag-toggle--include { background: var(--col-success-lt); color: var(--col-success); border-color: color-mix(in srgb, var(--col-success) 40%, transparent); }
.tag-toggle--exclude { background: var(--col-error-lt);   color: var(--col-error);   border-color: color-mix(in srgb, var(--col-error) 40%, transparent); text-decoration: line-through; }

/* ── company grid ─────────────────────────────────────────────────────────── */

/* overflow clips the hairline the right-hand column casts past the card edge. */
.grid-wrap { flex: 1; min-height: 0; overflow: hidden; }
/* The placeholder grid fills the fixed-height card the way the real one does */
.grid-wrap > .loading-region { height: 100%; }
.skeleton-tile { display: flex; flex-direction: column; justify-content: center; gap: .5rem; cursor: default; pointer-events: none; }

.company-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* A row is an eighth of the card whatever the page holds, so two companies
     draw the same tile as a full page of sixteen. `1fr` sized rows to the space
     available instead, which stretched a page of two into two half-card slabs. */
  grid-template-rows: repeat(var(--tile-rows, 8), calc(100% / 8));
  /* Row by row, so a short page fills the top line across both columns instead
     of stacking down the left one. It also means the sort order reads left to
     right, the way a table does, rather than down one column and up the next. */
  grid-auto-flow: row;
  /* Rows stay at the top; the card keeps its height and the leftover space below
     is plain background, so pagination never moves between pages. */
  align-content: start;
  gap: 0;
  background: var(--col-bg);
  height: 100%;
}

.company-tile {
  background: var(--col-bg);
  /* The hairlines between tiles belong to the tile, not to a 1px gap over a
     border-coloured grid: that version painted the whole empty area under a
     short page grey. A shadow does not survive here either, because the next
     tile's background paints over it. */
  border: 0;
  border-right: 1px solid var(--col-border);
  border-bottom: 1px solid var(--col-border);
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
  /* The hairlines between tiles. Drawn by the tile rather than by a 1px gap over
     a border-coloured grid, which painted the empty area under a short page
     grey, and a shadow rather than a border so it costs no layout. */
  transition: background var(--dur-instant) var(--ease-standard);
}
/* The right-hand column would otherwise draw a line against the card's own
   edge. */
.company-tile:nth-child(2n) { border-right: none; }
.company-tile:hover { background: var(--col-surface); }
.company-tile--active { background: var(--col-accent-lt); }

/* Header line: name (shrinks first), status chip, then the website link
   pushed to the far right — keeps the whole tile to just two rows. */
.tile-name-line { display: flex; align-items: center; gap: .4rem; min-width: 0; overflow: hidden; }
.tile-name {
  flex: 0 1 auto; min-width: 0;
  font-size: .875rem; font-weight: 600; color: var(--col-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: none; border: 0; padding: 0; margin: 0;
  font-family: inherit; text-align: left; cursor: pointer;
}
.tile-name:hover { text-decoration: underline; text-underline-offset: 2px; }
.tile-name-line > .status-chip { flex-shrink: 0; }
.tile-star { flex-shrink: 0; color: var(--col-star); font-size: .8rem; line-height: 1; }
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
  font-size: .7rem; padding: .1rem .45rem; border-radius: var(--radius-sm); white-space: nowrap;
  background: var(--col-raised); color: var(--col-muted);
}
.tile-chip--city { background: var(--col-accent-lt); color: var(--col-accent-dk); }
.tile-empty { font-size: .72rem; color: var(--col-subtle); font-style: italic; margin: 0; }


@media (max-width: 767px) {
  /* One column, natural tile height, page scrolls. */
  .company-tile { border-right: none; }

  .company-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-auto-flow: row;
    height: auto;
  }
  .company-tile { min-height: 60px; }
  /* Full-bleed on phones (the scoped margin above outranks style.css's) */
  .dashboard { margin: 0; }
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

@media (max-width: 767px) {
  .pagination-bar { padding: .5rem 1rem; justify-content: center; }
  .pagination { width: 100%; }

  /* Five controls wrapped into rows of uneven widths. A two-column grid lines
     them up (Tags pairs with Clear when there is something to clear), and the
     messages under them take the full width. */
  .filter-controls-row { display: grid; grid-template-columns: 1fr 1fr; }
  .filter-controls-row > * { width: 100%; max-width: none; min-width: 0; }
  .filter-controls-row > .sync-badge,
  .filter-controls-row > .list-error { grid-column: 1 / -1; }
  .btn-filter-toggle { justify-content: center; }
}
</style>
