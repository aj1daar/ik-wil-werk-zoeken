<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR } from '../../stores/applications'
import { useAuthStore } from '../../stores/auth'
import type { SponsorCompany, Application } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'

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
const hiddenIds           = ref<Set<string>>((() => {
  try { return new Set<string>(JSON.parse(localStorage.getItem('iwwz_hidden_companies') ?? '[]')) }
  catch { return new Set<string>() }
})())
const showHidden          = ref(false)
const currentPage = ref(1)

// Flat page size. Kept small enough that a full page of rows plus the
// (inline, header-level) pagination control fits one viewport without the
// page scrolling — matches ApplicationsView.
const PAGE_SIZE = 8

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

// One list entry = one paginated slot: a standalone company, or a whole
// parent-company group (its header, plus its subsidiaries when expanded).
// Grouping and sorting happen here — across the FULL filtered set — so a page
// is a contiguous, correctly ordered slice, not 8 arbitrary rows sorted only
// among themselves.
interface Entry {
  key:       string
  sortName:  string
  sortCity:  string
  groupKey?: string
  parentName?: string
  companies: SponsorCompany[]
}

const allEntries = computed<Entry[]>(() => {
  const grouped = new Map<string, SponsorCompany[]>()
  const singles: SponsorCompany[] = []

  for (const c of filteredRows.value) {
    const parent = c.parentCompanyName?.trim()
    if (parent) {
      const key = parent.toLowerCase()
      const bucket = grouped.get(key) ?? (grouped.set(key, []), grouped.get(key)!)
      bucket.push(c)
    } else {
      singles.push(c)
    }
  }

  const entries: Entry[] = []
  for (const [key, companies] of grouped) {
    if (companies.length === 1) { singles.push(companies[0]); continue }
    const parentName = companies[0].parentCompanyName!
    entries.push({ key: `group:${key}`, sortName: parentName, sortCity: companies[0].city ?? '', groupKey: key, parentName, companies })
  }
  for (const c of singles) {
    entries.push({ key: c.id, sortName: c.name, sortCity: c.city ?? '', companies: [c] })
  }

  if (sortOrder.value !== 'default') {
    entries.sort((a, b) => {
      if (sortOrder.value === 'za') return b.sortName.localeCompare(a.sortName)
      if (sortOrder.value === 'city') return a.sortCity.localeCompare(b.sortCity) || a.sortName.localeCompare(b.sortName)
      return a.sortName.localeCompare(b.sortName)
    })
  }
  return entries
})

const pagedEntries = computed<Entry[]>(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return allEntries.value.slice(start, start + PAGE_SIZE)
})

const pageCount = computed(() => Math.max(1, Math.ceil(allEntries.value.length / PAGE_SIZE)))

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

watch([search, filterCity, filterWorkingLanguage, filterCompanySize, filterRemotePolicy, appliedFilter, includeTags, excludeTags, showHidden, sortOrder], () => {
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

const listItems = computed<ListItem[]>(() =>
  pagedEntries.value.flatMap((e): ListItem[] => {
    if (!e.groupKey) {
      return [{ type: 'company', key: e.companies[0].id, company: e.companies[0], isSubsidiary: false }]
    }
    const items: ListItem[] = [
      { type: 'group-header', key: e.key, groupKey: e.groupKey, parentName: e.parentName, groupCount: e.companies.length },
    ]
    if (expandedGroups.value.has(e.groupKey)) {
      for (const c of e.companies) {
        items.push({ type: 'company', key: c.id, company: c, isSubsidiary: true })
      }
    }
    return items
  })
)

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

// ── admin: edit the whole company detail panel ───────────────────────────────

type ChipField = 'locations' | 'techStackTags' | 'functionalTags'

function blankForm() {
  return {
    summary: '', city: '', websiteUrl: '',
    coreIndustry: '', workingLanguage: '', companySize: '', remotePolicy: '',
    targetMarket: '', parentCompanyName: '',
    locations: [] as string[], techStackTags: [] as string[], functionalTags: [] as string[],
  }
}

const chipFields: { field: ChipField; label: string; placeholder: string }[] = [
  { field: 'locations',      label: 'Other locations', placeholder: 'Add a location and press Enter…' },
  { field: 'techStackTags',  label: 'Tech-stack tags', placeholder: 'Add a tag and press Enter…' },
  { field: 'functionalTags', label: 'Functional tags', placeholder: 'Add a tag and press Enter…' },
]

const editing    = ref(false)
const savingEdit = ref(false)
const editError  = ref('')
const form       = reactive(blankForm())
const chipInput  = reactive<Record<ChipField, string>>({ locations: '', techStackTags: '', functionalTags: '' })

watch(selectedId, () => {
  editing.value   = false
  editError.value = ''
})

function startEdit() {
  const c = selectedCompany.value
  if (!c) return
  Object.assign(form, blankForm(), {
    summary:           c.summary ?? '',
    city:              c.city ?? '',
    websiteUrl:        c.websiteUrl ?? '',
    coreIndustry:      c.coreIndustry ?? '',
    workingLanguage:   c.workingLanguage ?? '',
    companySize:       c.companySize ?? '',
    remotePolicy:      c.remotePolicy ?? '',
    targetMarket:      c.targetMarket ?? '',
    parentCompanyName: c.parentCompanyName ?? '',
    locations:         [...(c.locations ?? [])],
    techStackTags:     [...(c.techStackTags ?? [])],
    functionalTags:    [...(c.functionalTags ?? [])],
  })
  chipInput.locations = chipInput.techStackTags = chipInput.functionalTags = ''
  editError.value = ''
  editing.value   = true
}

function cancelEdit() {
  editing.value   = false
  editError.value = ''
}

function addChip(field: ChipField, raw: string) {
  const v = raw.trim()
  if (v && !form[field].some(x => x.toLowerCase() === v.toLowerCase())) form[field].push(v)
  chipInput[field] = ''
}

function removeChip(field: ChipField, i: number) {
  form[field].splice(i, 1)
}

function onChipKey(e: KeyboardEvent, field: ChipField) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(field, chipInput[field]) }
}

async function saveEdit() {
  const c = selectedCompany.value
  if (!c) return
  // Fold any half-typed chip text in so a user who typed a tag but didn't press
  // Enter doesn't silently lose it.
  ;(['locations', 'techStackTags', 'functionalTags'] as ChipField[])
    .forEach(f => { if (chipInput[f].trim()) addChip(f, chipInput[f]) })

  savingEdit.value = true
  editError.value  = ''
  try {
    await store.updateCompany(c.id, {
      summary:           form.summary.trim()           || null,
      city:              form.city.trim()              || null,
      websiteUrl:        form.websiteUrl.trim()         || null,
      coreIndustry:      form.coreIndustry.trim()       || null,
      workingLanguage:   form.workingLanguage.trim()    || null,
      companySize:       form.companySize.trim()        || null,
      remotePolicy:      form.remotePolicy.trim()       || null,
      targetMarket:      form.targetMarket.trim()       || null,
      parentCompanyName: form.parentCompanyName.trim()  || null,
      locations:         form.locations.length      ? [...form.locations]      : null,
      techStackTags:     form.techStackTags.length   ? [...form.techStackTags]  : null,
      functionalTags:    form.functionalTags.length  ? [...form.functionalTags] : null,
    })
    editing.value = false
  } catch (e: unknown) {
    editError.value = e instanceof Error ? e.message : 'Failed to save. Please try again.'
  } finally {
    savingEdit.value = false
  }
}

// Close the detail panel if paging (or a filter change) moves the selected
// company off the current page. Collapsing its group keeps it open — the
// company is still on the page, just not rendered.
watch(pagedEntries, (entries) => {
  if (selectedId.value && !entries.some(e => e.companies.some(c => c.id === selectedId.value)))
    selectedId.value = null
})

function selectRow(id: string) { selectedId.value = selectedId.value === id ? null : id }

function startApplication(company: SponsorCompany) {
  prefillCompany.value = company.name
  prefillSponsorId.value = company.id
  modalOpen.value = true
}

// Primary location (city) followed by any extra office locations.
function locationText(c: SponsorCompany): string {
  return [c.city, ...(c.locations ?? [])].filter(Boolean).join(' · ')
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
        <!-- Pagination — inline in the header, not a bottom bar that grows
             the page and forces a scroll. Mirrors ApplicationsView. -->
        <div v-if="allEntries.length > 0" class="pagination">
          <span class="pagination-info">{{ (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, allEntries.length) }} of {{ allEntries.length }}</span>
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
        <div v-else-if="listItems.length === 0" class="state-msg">
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
                  <span v-if="locationText(item.company!)" class="row-city">{{ locationText(item.company!) }}</span>
                  <span v-if="locationText(item.company!) && item.company!.coreIndustry"> · </span>
                  <span v-if="item.company!.coreIndustry">{{ item.company!.coreIndustry }}</span>
                  <span v-if="!locationText(item.company!) && !item.company!.coreIndustry" class="row-industry--empty">No details yet</span>
                </p>
              </div>
              <a
                v-if="item.company!.websiteUrl"
                :href="item.company!.websiteUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="row-website"
                @click.stop
              >
                <svg class="row-website-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span class="row-website-label">Website</span>
              </a>
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
              <div class="panel-header-actions">
                <button
                  v-if="isAdmin && !editing"
                  type="button"
                  class="panel-edit-btn"
                  @click="startEdit"
                >Edit</button>
                <button @click="selectedId = null" class="btn-icon" aria-label="Close panel">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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

              <!-- ── read-only view ────────────────────────────────────────── -->
              <template v-if="!editing">
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

                <div v-if="selectedCompany.locations?.length" class="field">
                  <label class="field-label">Other locations</label>
                  <div class="tag-row">
                    <span v-for="l in selectedCompany.locations" :key="l" class="tag--muted">{{ l }}</span>
                  </div>
                </div>

                <div v-if="selectedCompany.summary || isAdmin" class="field">
                  <label class="field-label">About</label>
                  <p v-if="selectedCompany.summary" class="panel-body-text">{{ selectedCompany.summary }}</p>
                  <p v-else class="panel-body-text panel-body-text--empty">No description yet.</p>
                </div>

                <div v-if="selectedCompany.coreIndustry || (selectedCompany.techStackTags?.length || selectedCompany.functionalTags?.length)" class="field">
                  <label class="field-label">Tags</label>
                  <div class="tag-row">
                    <span v-if="selectedCompany.coreIndustry" class="tag">{{ selectedCompany.coreIndustry }}</span>
                    <span v-for="t in selectedCompany.techStackTags" :key="t" class="tag--muted">{{ t }}</span>
                    <span v-for="t in selectedCompany.functionalTags" :key="t" class="tag--muted">{{ t }}</span>
                  </div>
                </div>
              </template>

              <!-- ── admin edit form ──────────────────────────────────────── -->
              <template v-else>
                <div class="field">
                  <label class="field-label" for="ce-summary">About</label>
                  <textarea
                    id="ce-summary"
                    v-model="form.summary"
                    class="field-input summary-textarea"
                    rows="4"
                    maxlength="2000"
                    placeholder="Write a short description of this company…"
                  />
                </div>

                <div class="ce-grid">
                  <div class="field">
                    <label class="field-label" for="ce-city">City</label>
                    <input id="ce-city" v-model="form.city" class="field-input" maxlength="200" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-website">Website URL</label>
                    <input id="ce-website" v-model="form.websiteUrl" type="url" class="field-input" placeholder="https://…" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-lang">Working language</label>
                    <input id="ce-lang" v-model="form.workingLanguage" class="field-input" maxlength="200" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-size">Company size</label>
                    <input id="ce-size" v-model="form.companySize" class="field-input" maxlength="200" placeholder="startup / scaleup / mid / large / enterprise" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-remote">Remote policy</label>
                    <input id="ce-remote" v-model="form.remotePolicy" class="field-input" maxlength="200" placeholder="remote / hybrid / office" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-market">Target market</label>
                    <input id="ce-market" v-model="form.targetMarket" class="field-input" maxlength="200" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-parent">Parent company</label>
                    <input id="ce-parent" v-model="form.parentCompanyName" class="field-input" maxlength="200" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ce-industry">Core industry</label>
                    <input id="ce-industry" v-model="form.coreIndustry" class="field-input" maxlength="200" />
                  </div>
                </div>

                <div
                  v-for="chip in chipFields"
                  :key="chip.field"
                  class="field"
                >
                  <label class="field-label">{{ chip.label }}</label>
                  <div v-if="form[chip.field].length" class="tag-row ce-chip-row">
                    <span v-for="(v, i) in form[chip.field]" :key="v" class="city-chip">
                      {{ v }}
                      <button type="button" class="city-remove" :aria-label="`Remove ${v}`" @click="removeChip(chip.field, i)">×</button>
                    </span>
                  </div>
                  <input
                    v-model="chipInput[chip.field]"
                    class="field-input"
                    :placeholder="chip.placeholder"
                    @keydown="onChipKey($event, chip.field)"
                    @blur="addChip(chip.field, chipInput[chip.field])"
                  />
                </div>

                <p v-if="editError" class="summary-error" role="alert">{{ editError }}</p>
              </template>
            </div>

            <div class="panel-footer">
              <template v-if="editing">
                <button type="button" class="btn-ghost" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
                <button type="button" class="btn-primary footer-primary" :disabled="savingEdit" @click="saveEdit">
                  {{ savingEdit ? 'Saving…' : 'Save changes' }}
                </button>
              </template>
              <template v-else>
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
              </template>
            </div>
          </div>
        </div>
      </transition>
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
.panel-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.panel-body-text { font-size: .875rem; color: var(--col-muted); line-height: 1.6; }
.panel-body-text--empty { font-style: italic; color: var(--col-subtle); }
.panel-header-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
.panel-edit-btn {
  background: none; border: 1px solid var(--col-border); cursor: pointer;
  color: var(--col-accent); font-size: .72rem; font-weight: 600;
  padding: .25rem .6rem; border-radius: .375rem;
  text-transform: uppercase; letter-spacing: .05em;
}
.panel-edit-btn:hover { background: var(--col-raised); }
.summary-textarea { resize: vertical; width: 100%; font-family: inherit; }
.summary-error { color: var(--col-error); font-size: .8rem; margin: 0; }

/* admin edit form */
.ce-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
@media (max-width: 520px) { .ce-grid { grid-template-columns: 1fr; } }
.ce-chip-row { margin-bottom: .375rem; }
.city-chip {
  display: inline-flex; align-items: center; gap: .25rem;
  background: var(--col-raised); border-radius: 9999px;
  padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted);
}
.city-remove {
  background: none; border: none; cursor: pointer; color: var(--col-subtle);
  font-size: 1rem; line-height: 1; padding: 0;
}
.city-remove:hover { color: var(--col-error); }
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

/* Every list row occupies the same vertical range so a page of PAGE_SIZE
   entries is always the same height — name line + one meta line, centred. */
.company-row { box-sizing: border-box; height: 64px; padding-top: 0; padding-bottom: 0; }
.company-row .row-body { display: flex; flex-direction: column; justify-content: center; gap: .125rem; }

.row-website {
  display: inline-flex; align-items: center; gap: .3rem; flex-shrink: 0;
  font-size: .72rem; color: var(--col-accent); text-decoration: none;
}
.row-website:hover { text-decoration: underline; }
.row-website-icon { width: .8rem; height: .8rem; flex-shrink: 0; }
.row-industry--empty { color: var(--col-subtle); font-style: italic; }
@media (max-width: 400px) { .row-website-label { display: none; } }

.row-name-line { display: flex; align-items: center; gap: .5rem; flex-wrap: nowrap; min-width: 0; }
.row-name-line .row-name { min-width: 0; }
.row-name-line > :not(.row-name) { flex-shrink: 0; }

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

  /* Apple HIG minimum 44x44pt tap target */
  .page-btn { min-width: 2.75rem; height: 2.75rem; }
}

@media (min-width: 768px) {
  /* Flat PAGE_SIZE (8), pagination inline in the header: a full page of
     rows fits one viewport, so the page doesn't scroll — same as
     ApplicationsView. height:auto replaces split-panel.css's fixed-height,
     viewport-fit-clipped shell (that existed only for the old dynamic
     PAGE_SIZE measurement) while keeping .dashboard's inherited
     overflow:clip, which still rounds the filter bar's corners into the
     card. */
  .dashboard { height: auto; min-height: calc(100vh - 86px); }
  .main-split { overflow: visible; align-items: flex-start; }
  .company-list { overflow: visible; }
  /* Bound the panel to one viewport so its body keeps its own scrollbar for
     long content. */
  .detail-panel { height: calc(100vh - 86px); }
}

.pagination {
  display: flex;
  align-items: center;
  gap: .25rem;
  flex-wrap: wrap;
}
.pagination-info {
  font-size: .72rem;
  color: var(--col-subtle);
  margin-right: .4rem;
  white-space: nowrap;
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
