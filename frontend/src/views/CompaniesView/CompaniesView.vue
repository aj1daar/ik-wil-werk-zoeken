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
const displayCount        = ref(60)
const sortOrder           = ref<'default' | 'az' | 'za' | 'city'>('az')
const hiddenIds           = ref<Set<string>>((() => {
  try { return new Set<string>(JSON.parse(localStorage.getItem('iwwz_hidden_companies') ?? '[]')) }
  catch { return new Set<string>() }
})())
const showHidden          = ref(false)

const PAGE_SIZE = 60

onMounted(() => {
  store.load()
  appsStore.load()
})

const mostRecentForCompany = computed((): Map<string, Application> => {
  const map = new Map<string, Application>()
  for (const app of appsStore.applications) {
    if (!app.sponsorCompanyId) continue
    const existing = map.get(app.sponsorCompanyId)
    if (!existing || app.updatedAt > existing.updatedAt) {
      map.set(app.sponsorCompanyId, app)
    }
  }
  return map
})

const anyFilter = computed(() =>
  search.value.trim() !== '' || filterCity.value !== '' ||
  filterWorkingLanguage.value !== '' || filterCompanySize.value !== '' || filterRemotePolicy.value !== '' ||
  appliedFilter.value !== 'all' ||
  includeTags.value.length > 0 || excludeTags.value.length > 0
)

const rows = computed<SponsorCompany[]>(() => {
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
    list = store.companies.slice(0, displayCount.value)
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

const canLoadMore = computed(() =>
  !anyFilter.value && displayCount.value < store.companies.length
)

function loadMore() { displayCount.value += PAGE_SIZE }

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
  displayCount.value = PAGE_SIZE
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
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by name, city, industry or tags…" class="filter-input pl-9" aria-label="Search companies" />
      </div>

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

      <select v-model="sortOrder" class="filter-input filter-select" aria-label="Sort companies">
        <option value="az">A → Z</option>
        <option value="za">Z → A</option>
        <option value="city">City A → Z</option>
        <option value="default">Default order</option>
      </select>

      <div class="applied-toggle" role="group" aria-label="Applied filter">
        <button
          :class="['applied-toggle-btn', appliedFilter === 'all' && 'applied-toggle-btn--active']"
          @click="appliedFilter = 'all'"
        >All</button>
        <button
          :class="['applied-toggle-btn', appliedFilter === 'applied' && 'applied-toggle-btn--active']"
          @click="appliedFilter = 'applied'"
        >Applied</button>
        <button
          :class="['applied-toggle-btn', appliedFilter === 'not-applied' && 'applied-toggle-btn--active']"
          @click="appliedFilter = 'not-applied'"
        >Not applied</button>
      </div>

      <button
        :class="['btn-filter-toggle', showFilters && 'btn-filter-toggle--active']"
        @click="showFilters = !showFilters"
        :aria-expanded="showFilters"
        aria-controls="tag-filter-panel"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        Tag filter
        <span v-if="includeTags.length + excludeTags.length > 0" class="filter-count">
          {{ includeTags.length + excludeTags.length }}
        </span>
      </button>

      <button v-if="hasActiveFilters" @click="clearFilters" class="btn-clear-filters" aria-label="Clear all filters">
        Clear filters
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

    <div v-if="showFilters" id="tag-filter-panel" class="tag-filter-panel">
      <p class="tag-filter-hint">
        <strong>Click once</strong> to include (green), <strong>click again</strong> to exclude (red), <strong>third click</strong> to clear.
      </p>
      <div class="tag-filter-grid">
        <button
          v-for="tag in store.allTags"
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

        <div v-if="canLoadMore" class="load-more-wrap">
          <button @click="loadMore" class="btn-load-more">
            Load more ({{ store.companies.length - displayCount }} remaining)
          </button>
          <button @click="displayCount = store.companies.length" class="btn-load-more">
            Load all
          </button>
        </div>
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

    <Transition name="modal">
      <NewApplicationModal
        v-if="modalOpen"
        :prefill-company="prefillCompany"
        @close="modalOpen = false"
      />
    </Transition>
  </div>
</template>

<style src="../../assets/split-panel.css" scoped></style>
<style scoped>
.sync-badge { font-size: .75rem; color: var(--col-subtle); white-space: nowrap; padding-left: .25rem; }

.btn-filter-toggle {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-surface); color: var(--col-muted);
  border: 1px solid var(--col-border); border-radius: .375rem;
  padding: .45rem .85rem; font-size: .8rem; cursor: pointer; white-space: nowrap;
  transition: background .15s, color .15s;
}
.btn-filter-toggle:hover { background: var(--col-raised); color: var(--col-text); }
.btn-filter-toggle--active { background: var(--col-accent-lt); color: var(--col-accent-dk); border-color: var(--col-accent-lt); }
.btn-icon-sm { width: .9rem; height: .9rem; }
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
.tag-filter-hint { font-size: .75rem; color: var(--col-muted); margin: 0 0 .625rem; }
.tag-filter-grid { display: flex; flex-wrap: wrap; gap: .375rem; }

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
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); display: flex; gap: .625rem; }
.icon { width: 1.25rem; height: 1.25rem; }
.footer-primary { flex: 1; }
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
</style>
