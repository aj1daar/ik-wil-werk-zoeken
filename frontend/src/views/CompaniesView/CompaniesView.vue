<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import type { SponsorCompany } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'

const store = useCompaniesStore()

const search      = ref('')
const filterCity  = ref('')
const includeTags = ref<string[]>([])
const excludeTags = ref<string[]>([])
const selectedId  = ref<string | null>(null)
const modalOpen   = ref(false)
const prefillCompany = ref('')
const showFilters = ref(false)

onMounted(() => store.load())

const rows = computed<SponsorCompany[]>(() => {
  const anyFilter = search.value.trim() || filterCity.value || includeTags.value.length > 0 || excludeTags.value.length > 0
  if (anyFilter) {
    return store.filter({
      query:       search.value,
      city:        filterCity.value,
      includeTags: includeTags.value,
      excludeTags: excludeTags.value,
    })
  }
  return store.companies.slice(0, 60)
})

const selectedCompany = computed<SponsorCompany | null>(() =>
  store.companies.find(c => c.id === selectedId.value) ?? null
)

watch(rows, (newRows) => {
  if (selectedId.value && !newRows.find(c => c.id === selectedId.value))
    selectedId.value = null
})

function selectRow(id: string) { selectedId.value = selectedId.value === id ? null : id }

function startApplication(name: string) {
  prefillCompany.value = name
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
  includeTags.value = []
  excludeTags.value = []
}

const hasActiveFilters = computed(() =>
  search.value.trim() !== '' || filterCity.value !== '' ||
  includeTags.value.length > 0 || excludeTags.value.length > 0
)
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
          <li
            v-for="row in rows"
            :key="row.id"
            @click="selectRow(row.id)"
            :class="['company-row', { 'company-row--active': selectedId === row.id }]"
            :aria-selected="selectedId === row.id"
          >
            <div class="row-body">
              <p class="row-name">{{ row.name }}</p>
              <p class="row-industry">
                <span v-if="row.city" class="row-city">{{ row.city }}</span>
                <span v-if="row.city && row.coreIndustry"> · </span>
                <span v-if="row.coreIndustry">{{ row.coreIndustry }}</span>
              </p>
            </div>
            <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </li>
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
                </p>
              </div>
              <button @click="selectedId = null" class="btn-icon" aria-label="Close panel">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="panel-body">
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
              <button @click="startApplication(selectedCompany.name)" class="btn-primary footer-primary">
                Start Application
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <NewApplicationModal
      v-if="modalOpen"
      :prefill-company="prefillCompany"
      @close="modalOpen = false"
    />
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
.field { display: flex; flex-direction: column; gap: .375rem; }
.field-label { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--col-subtle); }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.tag { background: var(--col-accent-lt); color: var(--col-accent-dk); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 500; }
.tag--muted { background: var(--col-raised); color: var(--col-muted); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; }
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); }
.icon { width: 1.25rem; height: 1.25rem; }
.footer-primary { width: 100%; }
.row-city { color: var(--col-accent-dk); }
</style>
