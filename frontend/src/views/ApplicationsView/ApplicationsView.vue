<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { Application, ApplicationStatus } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'
import ApplicationPanel from '../../components/ApplicationPanel/ApplicationPanel.vue'

const store = useApplicationsStore()

type SortKey = 'newest' | 'oldest' | 'updated' | 'company'

const search       = ref('')
const filterStatus = ref<ApplicationStatus | ''>('')
const sortBy       = ref<SortKey>('newest')
const selectedId   = ref<string | null>(null)
const modalOpen    = ref(false)

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName.toUpperCase()
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); modalOpen.value = true }
  if (e.key === 'Escape') selectedId.value = null
}

onMounted(() => { store.load(); window.addEventListener('keydown', onKey) })
onUnmounted(() => window.removeEventListener('keydown', onKey))

const filtered = computed<Application[]>(() => {
  let list = [...store.applications]
  if (filterStatus.value) list = list.filter(a => a.status === filterStatus.value)
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(a =>
      a.companyName.toLowerCase().includes(q) ||
      a.position.toLowerCase().includes(q)
    )
  }
  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest':  return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      case 'oldest':  return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime()
      case 'updated': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      case 'company': return a.companyName.localeCompare(b.companyName)
    }
  })
  return list
})

const selected = computed<Application | null>(() =>
  store.applications.find(a => a.id === selectedId.value) ?? null
)

function selectRow(id: string) { selectedId.value = id }

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

function exportCsv() {
  const cols = ['Company', 'Position', 'Status', 'Applied', 'Updated', 'Locations', 'Notes', 'Contact name', 'Contact email']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = store.applications.map(a => [
    a.companyName,
    a.position,
    STATUS_LABELS[a.status],
    a.appliedAt.slice(0, 10),
    a.updatedAt.slice(0, 10),
    a.locations.join('; '),
    a.notes ?? '',
    a.contactPersonName ?? '',
    a.contactPersonEmail ?? '',
  ].map(esc).join(','))
  const csv = [cols.map(esc).join(','), ...rows].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="dashboard">
    <div class="filter-bar">
      <div class="filter-search">
        <svg class="filter-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input v-model="search" placeholder="Search by company or position…" class="filter-input pl-9" aria-label="Search applications" />
      </div>

      <select v-model="filterStatus" class="filter-input filter-select" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
      </select>

      <select v-model="sortBy" class="filter-input filter-select" aria-label="Sort order">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="updated">Recently updated</option>
        <option value="company">Company A→Z</option>
      </select>

      <button
        v-if="store.applications.length > 0"
        @click="exportCsv"
        class="btn-export"
        title="Export all applications as CSV"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export CSV
      </button>

      <button @click="modalOpen = true" class="btn-new" title="New application (N)">
        <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Application
      </button>
    </div>

    <div class="app-list-wrapper">
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
          role="button"
          tabindex="0"
          :aria-label="`${app.companyName} — ${app.position}`"
          @keydown.enter="selectRow(app.id)"
          @keydown.space.prevent="selectRow(app.id)"
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

    <!-- Application detail modal -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="selected" class="modal-backdrop" @click.self="onPanelClose" role="dialog" aria-modal="true" :aria-label="`Edit application: ${selected.companyName}`">
          <div class="modal-box">
            <ApplicationPanel :application="selected" @close="onPanelClose" />
          </div>
        </div>
      </transition>
    </teleport>

    <NewApplicationModal v-if="modalOpen" @close="onModalClose" />
  </div>
</template>

<style src="../../assets/split-panel.css" scoped></style>
<style scoped>
.app-list-wrapper {
  flex: 1;
  overflow-y: auto;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-box {
  background: var(--col-bg);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: translateY(8px) scale(0.98); }

.btn-new {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-invert-bg); color: var(--col-invert-text); border: none; border-radius: .375rem;
  padding: .5rem 1rem; font-size: .875rem; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.btn-new:hover { opacity: .85; }
.btn-new-icon { width: 1rem; height: 1rem; }
.row-meta { display: flex; flex-direction: column; align-items: flex-end; gap: .25rem; flex-shrink: 0; }
.row-date { font-size: .7rem; color: var(--col-subtle); }
.chip { display: inline-block; padding: .2rem .6rem; border-radius: 9999px; font-size: .7rem; font-weight: 600; white-space: nowrap; }
.add-first-link { background: none; border: none; color: var(--col-text); cursor: pointer; font-size: .875rem; text-decoration: underline; margin-left: .25rem; }
.btn-export {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-surface); color: var(--col-muted); border: 1px solid var(--col-border);
  border-radius: .375rem; padding: .5rem 1rem; font-size: .875rem; cursor: pointer; white-space: nowrap;
}
.btn-export:hover { background: var(--col-raised); }

@media (max-width: 480px) {
  .modal-box { max-height: 100vh; border-radius: 16px 16px 0 0; align-self: flex-end; }
  .modal-backdrop { align-items: flex-end; padding: 0; }
}
</style>
