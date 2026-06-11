<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCompaniesStore, STATUS_COLORS, STATUS_DOT } from '../../stores/companies'
import type { CompanyRow } from '../../stores/companies'
import CompanyPanel from '../../components/CompanyPanel/CompanyPanel.vue'

const store = useCompaniesStore()

const search       = ref('')
const selectedId   = ref<string | null>(null)
const filterStatus = ref<string>('')
const filterCity   = ref('')

onMounted(() => store.load())

const rows = computed<CompanyRow[]>(() => {
  let base: CompanyRow[]
  if (search.value.trim()) {
    const results  = store.search(search.value)
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

function selectRow(id: string) { selectedId.value = selectedId.value === id ? null : id }

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
    <div class="filter-bar">
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by name, industry or tags…" class="filter-input pl-9" />
      </div>

      <select v-model="filterStatus" class="filter-input filter-select">
        <option value="">All statuses</option>
        <option v-for="s in ['Bookmarked','Viewed','Abandoned','Applied','Ongoing Interview','Rejected','Declined Offer','Offer Proposed','Offer Accepted']" :key="s" :value="s">{{ s }}</option>
      </select>

      <input v-model="filterCity" placeholder="Filter by city…" list="city-list" class="filter-input filter-city" />
      <datalist id="city-list">
        <option v-for="c in allCities" :key="c" :value="c" />
      </datalist>
    </div>

    <div class="main-split">
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
            <span class="status-dot" :style="{ backgroundColor: statusDotColor(row.record?.status) }" />
            <div class="row-body">
              <p class="row-name">{{ row.name }}</p>
              <p v-if="row.coreIndustry" class="row-industry">{{ row.coreIndustry }}</p>
            </div>
            <span v-if="row.record" :class="['chip', STATUS_COLORS[row.record.status] ?? 'status-viewed']">{{ row.record.status }}</span>
            <span v-else class="row-untracked">not tracked</span>
            <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </li>
        </ul>
      </div>

      <transition name="panel">
        <div v-if="selectedCompany" class="detail-panel">
          <CompanyPanel :company="selectedCompany" @close="selectedId = null" />
        </div>
      </transition>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
