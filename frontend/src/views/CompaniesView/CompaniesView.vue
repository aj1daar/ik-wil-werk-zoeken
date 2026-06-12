<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import type { SponsorCompany } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'

const store = useCompaniesStore()

const search     = ref('')
const selectedId = ref<string | null>(null)
const modalOpen  = ref(false)
const prefillCompany = ref('')

onMounted(() => store.load())

const rows = computed<SponsorCompany[]>(() => {
  if (search.value.trim()) return store.search(search.value)
  return store.companies.slice(0, 60)
})

const selectedCompany = computed<SponsorCompany | null>(() =>
  rows.value.find(c => c.id === selectedId.value) ?? null
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
  const d = new Date(iso)
  return d.toLocaleDateString('en-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by name, industry or tags…" class="filter-input pl-9" />
      </div>
      <p v-if="store.lastSyncedAt" class="sync-badge">
        IND data last synced {{ formatSyncDate(store.lastSyncedAt) }}
      </p>
    </div>

    <div class="main-split">
      <div :class="['company-list', selectedCompany ? 'hidden md:block' : '']">
        <div v-if="store.loading" class="state-msg">Loading…</div>
        <div v-else-if="store.error" class="state-msg state-msg--error" role="alert">{{ store.error }}</div>
        <div v-else-if="rows.length === 0" class="state-msg">
          {{ search ? 'No companies match your search.' : 'No IND sponsor companies loaded yet.' }}
        </div>

        <ul v-else>
          <li
            v-for="row in rows"
            :key="row.id"
            @click="selectRow(row.id)"
            :class="['company-row', { 'company-row--active': selectedId === row.id }]"
          >
            <div class="row-body">
              <p class="row-name">{{ row.name }}</p>
              <p v-if="row.coreIndustry" class="row-industry">{{ row.coreIndustry }}</p>
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
                <p class="panel-subtitle">KvK {{ selectedCompany.kvKNumber }}</p>
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
.panel { display: flex; flex-direction: column; height: 100%; }
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border); }
.panel-title-block { flex: 1; }
.panel-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); }
.panel-subtitle { font-size: .75rem; color: var(--col-subtle); margin-top: .125rem; }
.panel-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.panel-body-text { font-size: .875rem; color: var(--col-muted); line-height: 1.6; }
.ai-notice { font-size: .7rem; color: var(--col-subtle); margin-top: .5rem; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.tag { background: var(--col-accent-lt); color: var(--col-accent-dk); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 500; }
.tag--muted { background: var(--col-raised); color: var(--col-muted); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; }
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); }
.icon { width: 1.25rem; height: 1.25rem; }
.footer-primary { width: 100%; }
</style>
