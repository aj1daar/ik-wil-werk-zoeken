<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCompaniesStore, STATUS_COLORS, STATUS_DOT } from '../stores/companies'
import type { CompanyRow } from '../stores/companies'
import CompanyPanel from '../components/CompanyPanel.vue'

const store = useCompaniesStore()

const search       = ref('')
const selectedId   = ref<string | null>(null)
const filterStatus = ref<string>('')
const filterCity   = ref('')

onMounted(() => store.load())

const rows = computed<CompanyRow[]>(() => {
  let base: CompanyRow[]
  if (search.value.trim()) {
    const results = store.search(search.value)
    const tracked   = results.filter(r => r.record)
    const untracked = results.filter(r => !r.record)
    base = [...tracked, ...untracked]
  } else {
    base = [...store.tracked]
  }
  if (filterStatus.value)
    base = base.filter(r => r.record?.status === filterStatus.value)
  if (filterCity.value.trim()) {
    const city = filterCity.value.trim().toLowerCase()
    base = base.filter(r => r.record?.cities.some(c => c.toLowerCase().includes(city)))
  }
  return base
})

const selectedCompany = computed<CompanyRow | null>(() =>
  rows.value.find(r => r.id === selectedId.value) ?? null
)

watch(rows, (newRows) => {
  if (selectedId.value && !newRows.find(r => r.id === selectedId.value))
    selectedId.value = null
})

function selectRow(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}

const allCities = computed(() =>
  [...new Set(store.tracked.flatMap(r => r.record?.cities ?? []))].sort()
)

function statusDotColor(status: string | undefined): string {
  if (!status) return '#C0B09E'
  return STATUS_DOT[status] ?? '#C0B09E'
}
</script>

<template>
  <div class="dashboard">

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="relative flex-1 min-w-48">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by name, industry or tags…" class="filter-input pl-9" />
      </div>

      <select v-model="filterStatus" class="filter-input w-auto">
        <option value="">All statuses</option>
        <option v-for="s in ['Bookmarked','Viewed','Abandoned','Applied','Ongoing Interview','Rejected','Declined Offer','Offer Proposed','Offer Accepted']" :key="s" :value="s">{{ s }}</option>
      </select>

      <input v-model="filterCity" placeholder="Filter by city…" list="city-list" class="filter-input w-36" />
      <datalist id="city-list">
        <option v-for="c in allCities" :key="c" :value="c" />
      </datalist>
    </div>

    <!-- Main split -->
    <div class="main-split">

      <!-- Company list -->
      <div :class="['company-list', selectedCompany ? 'hidden md:block' : '']">
        <div v-if="store.loading" class="state-msg">Loading…</div>
        <div v-else-if="store.error" class="state-msg state-msg--error">{{ store.error }}</div>
        <div v-else-if="rows.length === 0" class="state-msg">
          {{ search ? 'No companies match your search.' : 'No tracked companies yet. Use the search to find IND sponsor companies.' }}
        </div>

        <ul v-else>
          <li
            v-for="row in rows"
            :key="row.id"
            @click="selectRow(row.id)"
            :class="['company-row', { 'company-row--active': selectedId === row.id }]"
          >
            <!-- Status dot -->
            <span
              class="status-dot"
              :style="{ backgroundColor: statusDotColor(row.record?.status) }"
            />

            <!-- Name + industry -->
            <div class="row-body">
              <p class="row-name">{{ row.name }}</p>
              <p v-if="row.coreIndustry" class="row-industry">{{ row.coreIndustry }}</p>
            </div>

            <!-- Status chip -->
            <span v-if="row.record" :class="['chip', STATUS_COLORS[row.record.status] ?? 'status-viewed']">
              {{ row.record.status }}
            </span>
            <span v-else class="row-untracked">not tracked</span>

            <!-- Chevron -->
            <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </li>
        </ul>
      </div>

      <!-- Detail panel -->
      <transition name="panel">
        <div v-if="selectedCompany" class="detail-panel">
          <CompanyPanel :company="selectedCompany" @close="selectedId = null" />
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--col-bg);
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--col-border);
  background: var(--col-surface);
  flex-shrink: 0;
}

.filter-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  color: var(--col-subtle);
  pointer-events: none;
}

.main-split {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* List */
.company-list {
  flex: 1;
  overflow-y: auto;
}

.state-msg {
  padding: 2rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--col-subtle);
}
.state-msg--error { color: var(--col-error); }

.company-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--col-border-lt);
  cursor: pointer;
  transition: background 0.12s;
}
.company-row:hover    { background: var(--col-surface); }
.company-row--active  { background: var(--col-accent-lt); }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.row-body { flex: 1; min-width: 0; }
.row-name     { font-size: 0.875rem; font-weight: 500; color: var(--col-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-industry { font-size: 0.75rem; color: var(--col-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-untracked { font-size: 0.75rem; color: var(--col-subtle); flex-shrink: 0; }
.row-chevron   { width: 1rem; height: 1rem; color: var(--col-subtle); flex-shrink: 0; }

/* Detail panel */
.detail-panel {
  width: 100%;
  max-width: 420px;
  border-left: 1px solid var(--col-border);
  background: var(--col-bg);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-enter-active,
.panel-leave-active { transition: max-width 0.2s ease, opacity 0.2s ease; }
.panel-enter-from,
.panel-leave-to     { max-width: 0; opacity: 0; }
</style>
