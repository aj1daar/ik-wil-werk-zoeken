<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { Application, ApplicationStatus } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'
import ApplicationPanel from '../../components/ApplicationPanel/ApplicationPanel.vue'

const store = useApplicationsStore()

const search       = ref('')
const filterStatus = ref<ApplicationStatus | ''>('')
const selectedId   = ref<string | null>(null)
const modalOpen    = ref(false)

onMounted(() => store.load())

const filtered = computed<Application[]>(() => {
  let list = store.applications
  if (filterStatus.value) list = list.filter(a => a.status === filterStatus.value)
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(a =>
      a.companyName.toLowerCase().includes(q) ||
      a.position.toLowerCase().includes(q)
    )
  }
  return list
})

const selected = computed<Application | null>(() =>
  store.applications.find(a => a.id === selectedId.value) ?? null
)

function selectRow(id: string) { selectedId.value = selectedId.value === id ? null : id }

function onModalClose() {
  modalOpen.value = false
  store.loadStats()
}

function onPanelClose() {
  selectedId.value = null
  store.loadStats()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by company or position…" class="filter-input pl-9" />
      </div>

      <select v-model="filterStatus" class="filter-input filter-select">
        <option value="">All statuses</option>
        <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
      </select>

      <button @click="modalOpen = true" class="btn-new">
        <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Application
      </button>
    </div>

    <div class="main-split">
      <div :class="['company-list', selected ? 'hidden md:block' : '']">
        <div v-if="store.loading" class="state-msg">Loading…</div>
        <div v-else-if="store.error" class="state-msg state-msg--error">{{ store.error }}</div>
        <div v-else-if="filtered.length === 0" class="state-msg">
          <template v-if="store.applications.length === 0">
            No applications yet.
            <button @click="modalOpen = true" class="add-first-link">Add your first application →</button>
          </template>
          <template v-else>No applications match your filters.</template>
        </div>

        <ul v-else>
          <li
            v-for="app in filtered"
            :key="app.id"
            @click="selectRow(app.id)"
            :class="['company-row', { 'company-row--active': selectedId === app.id }]"
          >
            <div class="row-body">
              <p class="row-name">{{ app.companyName }}</p>
              <p class="row-industry">{{ app.position }}</p>
            </div>
            <div class="row-meta">
              <span :class="['chip', STATUS_COLOR[app.status]]">{{ STATUS_LABELS[app.status] }}</span>
              <span class="row-date">{{ formatDate(app.appliedAt) }}</span>
            </div>
            <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </li>
        </ul>
      </div>

      <transition name="panel">
        <div v-if="selected" class="detail-panel">
          <ApplicationPanel :application="selected" @close="onPanelClose" />
        </div>
      </transition>
    </div>

    <NewApplicationModal v-if="modalOpen" @close="onModalClose" />
  </div>
</template>

<style src="../../assets/split-panel.css" scoped></style>
<style scoped>
.btn-new {
  display: inline-flex; align-items: center; gap: .375rem;
  background: #1a1a1a; color: white; border: none; border-radius: .375rem;
  padding: .5rem 1rem; font-size: .875rem; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.btn-new:hover { background: #333; }
.btn-new-icon { width: 1rem; height: 1rem; }
.row-meta { display: flex; flex-direction: column; align-items: flex-end; gap: .25rem; flex-shrink: 0; }
.row-date { font-size: .7rem; color: #9ca3af; }
.chip { display: inline-block; padding: .2rem .6rem; border-radius: 9999px; font-size: .7rem; font-weight: 600; white-space: nowrap; }
.add-first-link { background: none; border: none; color: #1a1a1a; cursor: pointer; font-size: .875rem; text-decoration: underline; margin-left: .25rem; }
</style>
