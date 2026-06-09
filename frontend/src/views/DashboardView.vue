<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useCompaniesStore, STATUS_COLORS } from '../stores/companies'
import type { CompanyRow } from '../stores/companies'
import CompanyPanel from '../components/CompanyPanel.vue'

const router = useRouter()
const auth = useAuthStore()
const store = useCompaniesStore()

const search       = ref('')
const selectedId   = ref<string | null>(null)
const filterStatus = ref<string>('')
const filterCity   = ref('')

onMounted(() => store.load())

function logout() {
  auth.logout()
  router.push('/login')
}

// Rows shown in the left list
const rows = computed<CompanyRow[]>(() => {
  let base: CompanyRow[]

  if (search.value.trim()) {
    // Search mode: all matching companies, tracked ones first
    const results = store.search(search.value)
    const tracked = results.filter(r => r.record)
    const untracked = results.filter(r => !r.record)
    base = [...tracked, ...untracked]
  } else {
    // Default: tracked only
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
  if (selectedId.value && !newRows.find(r => r.id === selectedId.value)) {
    selectedId.value = null
  }
})

function selectRow(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}

// All cities from tracked records for the city filter hint
const allCities = computed(() =>
  [...new Set(store.tracked.flatMap(r => r.record?.cities ?? []))].sort()
)

function statusDot(status: string | undefined): string {
  if (!status) return 'bg-slate-700'
  const cls = STATUS_COLORS[status] ?? 'bg-slate-700'
  // Extract bg color from the compound class string
  return cls.split(' ')[0]
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

    <!-- Top bar -->
    <header class="border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-lg font-semibold text-slate-100">HSM Sponsor Pipeline</h1>
        <p class="text-xs text-slate-500">Dutch IND recognised sponsors</p>
      </div>
      <button @click="logout" class="btn-icon text-sm">Sign out</button>
    </header>

    <!-- Filters -->
    <div class="border-b border-slate-800 px-6 py-3 flex flex-wrap gap-3 items-center shrink-0">
      <!-- Search -->
      <div class="relative flex-1 min-w-48">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          v-model="search"
          placeholder="Search by name, industry or tags…"
          class="filter-input pl-9"
        />
      </div>

      <!-- Status filter -->
      <select v-model="filterStatus" class="filter-input w-auto text-slate-300">
        <option value="">All statuses</option>
        <option v-for="s in ['Bookmarked','Viewed','Abandoned','Applied','Ongoing Interview','Rejected','Declined Offer','Offer Proposed','Offer Accepted']" :key="s" :value="s">{{ s }}</option>
      </select>

      <!-- City filter -->
      <input
        v-model="filterCity"
        placeholder="Filter by city…"
        list="city-list"
        class="filter-input w-36"
      />
      <datalist id="city-list">
        <option v-for="c in allCities" :key="c" :value="c" />
      </datalist>
    </div>

    <!-- Main area -->
    <div class="flex flex-1 overflow-hidden">

      <!-- Company list -->
      <div :class="['flex-1 overflow-y-auto', selectedCompany ? 'hidden md:block' : '']">

        <!-- Loading / error states -->
        <div v-if="store.loading" class="p-8 text-slate-500 text-sm text-center">Loading…</div>
        <div v-else-if="store.error" class="p-8 text-amber-400 text-sm text-center">{{ store.error }}</div>

        <div v-else-if="rows.length === 0" class="p-8 text-center">
          <p class="text-slate-500 text-sm">
            {{ search ? 'No companies match your search.' : 'No tracked companies yet. Use the search to find IND sponsor companies.' }}
          </p>
        </div>

        <ul v-else>
          <li
            v-for="row in rows"
            :key="row.id"
            @click="selectRow(row.id)"
            :class="[
              'flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60 cursor-pointer transition',
              selectedId === row.id ? 'bg-slate-800' : 'hover:bg-slate-900'
            ]"
          >
            <!-- Status dot -->
            <span :class="['w-2 h-2 rounded-full shrink-0', statusDot(row.record?.status)]" />

            <!-- Name + industry -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-100 truncate">{{ row.name }}</p>
              <p v-if="row.coreIndustry" class="text-xs text-slate-500 truncate">{{ row.coreIndustry }}</p>
            </div>

            <!-- Status badge -->
            <span
              v-if="row.record"
              :class="['chip', STATUS_COLORS[row.record.status] ?? 'bg-slate-700 text-slate-400 border-slate-600']"
            >
              {{ row.record.status }}
            </span>
            <span v-else class="text-xs text-slate-600 shrink-0">not tracked</span>

            <!-- Chevron -->
            <svg class="h-4 w-4 text-slate-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </li>
        </ul>
      </div>

      <!-- Detail panel -->
      <transition name="panel">
        <div v-if="selectedCompany"
          class="w-full md:w-96 lg:w-[420px] border-l border-slate-800 bg-slate-950 shrink-0 flex flex-col overflow-hidden"
        >
          <CompanyPanel
            :company="selectedCompany"
            @close="selectedId = null"
          />
        </div>
      </transition>

    </div>
  </div>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active { transition: width 0.2s ease, opacity 0.2s ease; }
.panel-enter-from,
.panel-leave-to { width: 0; opacity: 0; }
</style>
