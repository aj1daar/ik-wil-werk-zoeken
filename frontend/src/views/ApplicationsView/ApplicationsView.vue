<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { Application, ApplicationStatus } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'
import ApplicationPanel from '../../components/ApplicationPanel/ApplicationPanel.vue'

const store = useApplicationsStore()

type SortKey = 'newest' | 'oldest' | 'updated' | 'company' | 'followup'

const viewMode = ref<'list' | 'board'>((() => {
  try { return (localStorage.getItem('iwwz_apps_view') as 'list' | 'board') ?? 'list' } catch { return 'list' }
})())
const showEmptyColumns = ref(false)

function setViewMode(mode: 'list' | 'board') {
  viewMode.value = mode
  try { localStorage.setItem('iwwz_apps_view', mode) } catch { /* ignore */ }
}

watch(viewMode, () => {
  clearSelection()
  selectedId.value = null
})

const boardColumns = computed(() =>
  ALL_STATUSES
    .map(status => ({
      status,
      label:  STATUS_LABELS[status],
      color:  STATUS_COLOR[status],
      cards:  filtered.value.filter(a => a.status === status),
    }))
    .filter(col => showEmptyColumns.value || col.cards.length > 0)
)

const search            = ref('')
const filterStatus      = ref<ApplicationStatus | ''>('')
const sortBy            = ref<SortKey>('newest')
const selectedId        = ref<string | null>(null)
const modalOpen         = ref(false)
const showFiltersPanel  = ref(false)

const activeFilterCount = computed(() =>
  (filterStatus.value !== '' ? 1 : 0) +
  (sortBy.value !== 'newest' ? 1 : 0)
)

// Bulk selection
const checkedIds   = ref<Set<string>>(new Set())
const bulkStatus   = ref<ApplicationStatus | ''>('')
const bulkSaving   = ref(false)
const bulkError    = ref('')

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName.toUpperCase()
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); modalOpen.value = true }
  if (e.key === 'Escape') { selectedId.value = null; clearSelection() }
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
      a.position.toLowerCase().includes(q) ||
      (a.notes ?? '').toLowerCase().includes(q) ||
      (a.contactPersonName ?? '').toLowerCase().includes(q) ||
      (a.contactPersonEmail ?? '').toLowerCase().includes(q)
    )
  }
  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest':  return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      case 'oldest':  return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime()
      case 'updated': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      case 'company': return a.companyName.localeCompare(b.companyName)
      case 'followup': {
        const ad = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity
        const bd = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity
        return ad - bd
      }
    }
  })
  return list
})

const selected = computed<Application | null>(() =>
  store.applications.find(a => a.id === selectedId.value) ?? null
)

const allFilteredChecked = computed(() =>
  filtered.value.length > 0 && filtered.value.every(a => checkedIds.value.has(a.id))
)

function selectRow(id: string) {
  if (checkedIds.value.size > 0) {
    toggleCheck(id)
  } else {
    selectedId.value = id
  }
}

function toggleCheck(id: string) {
  const s = new Set(checkedIds.value)
  if (s.has(id)) s.delete(id)
  else           s.add(id)
  checkedIds.value = s
}

function toggleAll() {
  if (allFilteredChecked.value) {
    checkedIds.value = new Set()
  } else {
    checkedIds.value = new Set(filtered.value.map(a => a.id))
  }
}

function clearSelection() {
  checkedIds.value = new Set()
  bulkStatus.value = ''
  bulkError.value  = ''
}

async function applyBulkStatus() {
  if (!bulkStatus.value || checkedIds.value.size === 0) return
  bulkSaving.value = true
  bulkError.value  = ''
  try {
    await store.bulkUpdate([...checkedIds.value], bulkStatus.value)
    clearSelection()
    store.loadStats()
  } catch {
    bulkError.value = 'Bulk update failed. Please try again.'
  } finally {
    bulkSaving.value = false
  }
}

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

function isOverdue(app: Application) {
  if (!app.followUpDate) return false
  return new Date(app.followUpDate) < new Date(new Date().toDateString())
}

function isDueToday(app: Application) {
  if (!app.followUpDate) return false
  return app.followUpDate.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function exportCsv() {
  const cols = ['Company', 'Position', 'Status', 'Applied', 'Follow-up', 'Updated', 'Locations', 'Notes', 'Contact name', 'Contact email']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = store.applications.map(a => [
    a.companyName,
    a.position,
    STATUS_LABELS[a.status],
    a.appliedAt.slice(0, 10),
    a.followUpDate?.slice(0, 10) ?? '',
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

function printPage() {
  window.print()
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

      <div class="filter-controls-row">
        <button
          :class="['btn-filter-toggle', (showFiltersPanel || activeFilterCount > 0) && 'btn-filter-toggle--active']"
          @click="showFiltersPanel = !showFiltersPanel"
          :aria-expanded="showFiltersPanel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M7 12h10M11 18h2" />
          </svg>
          Filters
          <span v-if="activeFilterCount > 0" class="filter-count">{{ activeFilterCount }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" :class="['btn-icon-sm', 'btn-chevron', showFiltersPanel && 'btn-chevron--open']" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div class="view-toggle-group" role="group" aria-label="View mode">
          <button :class="['view-toggle-btn', viewMode === 'list' && 'view-toggle-btn--active']" @click="setViewMode('list')" title="List view">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <button :class="['view-toggle-btn', viewMode === 'board' && 'view-toggle-btn--active']" @click="setViewMode('board')" title="Board view">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </button>
        </div>

        <label v-if="viewMode === 'board'" class="show-empty-label">
          <input type="checkbox" v-model="showEmptyColumns" class="show-empty-check" />
          Show empty
        </label>

        <button @click="modalOpen = true" class="btn-new" title="New application (N)">
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Application
        </button>
      </div>
    </div>

    <Transition name="filter-drop">
      <div v-if="showFiltersPanel" class="dropdown-filters-panel">
        <select v-model="filterStatus" class="filter-input filter-select" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>

        <select v-model="sortBy" class="filter-input filter-select" aria-label="Sort order">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="company">Company A→Z</option>
          <option value="followup">Follow-up date ↑</option>
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

        <button
          v-if="store.applications.length > 0"
          @click="printPage"
          class="btn-export"
          title="Print / Save as PDF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="btn-new-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>
    </Transition>

    <!-- List -->
    <div v-if="viewMode === 'list'" class="list-area">
      <div class="list-col">
        <!-- Select-all bar shown when list is non-empty -->
        <div v-if="filtered.length > 0" class="select-bar">
          <label class="select-all-label">
            <input
              type="checkbox"
              :checked="allFilteredChecked"
              :indeterminate="checkedIds.size > 0 && !allFilteredChecked"
              @change="toggleAll"
              aria-label="Select all visible applications"
            />
            <span class="select-all-text">
              {{ checkedIds.size > 0 ? `${checkedIds.size} selected` : 'Select all' }}
            </span>
          </label>
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

          <TransitionGroup v-else tag="ul" name="list">
            <li
              v-for="(app, index) in filtered"
              :key="app.id"
              :style="{ '--i': Math.min(index, 9) }"
              @click="selectRow(app.id)"
              :class="['company-row', { 'company-row--active': selectedId === app.id, 'company-row--checked': checkedIds.has(app.id) }]"
              role="button"
              tabindex="0"
              :aria-label="`${app.companyName} — ${app.position}`"
              @keydown.enter="selectRow(app.id)"
              @keydown.space.prevent="selectRow(app.id)"
            >
              <input
                type="checkbox"
                class="row-checkbox"
                :checked="checkedIds.has(app.id)"
                @click.stop="toggleCheck(app.id)"
                :aria-label="`Select ${app.companyName}`"
              />
              <div class="row-body">
                <p class="row-name">{{ app.companyName }}</p>
                <p class="row-industry">{{ app.position }}</p>
              </div>
              <div class="row-meta">
                <span v-if="store.savingIds.includes(app.id)" class="row-saving">Saving…</span>
                <span v-else :class="['chip', STATUS_COLOR[app.status]]">{{ STATUS_LABELS[app.status] }}</span>
                <span class="row-date">{{ formatDate(app.appliedAt) }}</span>
                <span v-if="isOverdue(app)" class="followup-badge followup-badge--overdue" title="Follow-up overdue">⚠ Follow up</span>
                <span v-else-if="isDueToday(app)" class="followup-badge followup-badge--today" title="Follow-up due today">📅 Today</span>
              </div>
              <svg class="row-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </li>
          </TransitionGroup>
        </div>
      </div>

    </div>

    <!-- Board (Kanban) view -->
    <div v-else class="board-view">
      <div v-if="store.loading" class="state-msg">Loading…</div>
      <div v-else-if="store.error" class="state-msg state-msg--error">{{ store.error }}</div>
      <template v-else>
        <div v-if="boardColumns.length === 0" class="state-msg">No applications match your filters.</div>
        <div v-for="col in boardColumns" :key="col.status" class="board-col">
          <div class="board-col-header">
            <span :class="['chip', col.color]">{{ col.label }}</span>
            <span class="board-col-count">{{ col.cards.length }}</span>
          </div>
          <div class="board-cards">
            <div
              v-for="app in col.cards"
              :key="app.id"
              :class="['board-card', { 'board-card--active': selectedId === app.id }]"
              @click="selectedId = app.id"
              role="button"
              tabindex="0"
              :aria-label="`${app.companyName} — ${app.position}`"
              @keydown.enter="selectedId = app.id"
            >
              <p class="board-card-company">{{ app.companyName }}</p>
              <p class="board-card-position">{{ app.position }}</p>
              <div class="board-card-meta">
                <span v-if="store.savingIds.includes(app.id)" class="board-card-saving">Saving…</span>
                <span class="board-card-date">{{ formatDate(app.appliedAt) }}</span>
                <span v-if="isOverdue(app)" class="followup-badge followup-badge--overdue" title="Follow-up overdue">⚠</span>
                <span v-else-if="isDueToday(app)" class="followup-badge followup-badge--today" title="Today">📅</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Bulk action bar (list mode only) -->
    <transition name="bulk-bar">
      <div v-if="checkedIds.size > 0 && viewMode === 'list'" class="bulk-bar" role="region" aria-label="Bulk actions">
        <span class="bulk-count">{{ checkedIds.size }} selected</span>
        <select v-model="bulkStatus" class="bulk-select" aria-label="New status for selected">
          <option value="">Change status…</option>
          <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
        <button
          @click="applyBulkStatus"
          :disabled="!bulkStatus || bulkSaving"
          class="bulk-apply"
        >{{ bulkSaving ? 'Saving…' : 'Apply' }}</button>
        <button @click="clearSelection" class="bulk-clear">Cancel</button>
        <span v-if="bulkError" class="bulk-error" role="alert">{{ bulkError }}</span>
      </div>
    </transition>

    <!-- Application detail modal (board mode always; list non-split or mobile) -->
    <teleport to="body">
      <Transition name="app-detail">
        <div v-if="selected" class="modal-backdrop" @click.self="onPanelClose" role="dialog" aria-modal="true" :aria-label="`Edit application: ${selected.companyName}`">
          <div class="modal-box">
            <ApplicationPanel :application="selected" @close="onPanelClose" />
          </div>
        </div>
      </Transition>
    </teleport>

    <Transition name="modal">
      <NewApplicationModal v-if="modalOpen" @close="onModalClose" />
    </Transition>

    <!-- Background-save error toast -->
    <teleport to="body">
      <Transition name="toast">
        <div v-if="store.toastError" class="toast-error" role="alert">
          <span>{{ store.toastError }}</span>
          <button @click="store.dismissToast()" class="toast-close" aria-label="Dismiss">×</button>
        </div>
      </Transition>
    </teleport>
  </div>
</template>

<style src="../../assets/split-panel.css" scoped></style>

<style scoped>
/* layout wrappers */
.dashboard { max-width: 1280px; margin: 10px auto 0; }
.list-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.list-col  { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.app-list-wrapper {
  flex: 1;
  overflow-y: auto;
}

/* sticky filter bar */
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--col-bg);
  border-bottom: 1px solid var(--col-border);
}

/* select-all bar */
.select-bar {
  padding: .375rem 1rem;
  background: var(--col-raised);
  border-bottom: 1px solid var(--col-border);
  display: flex;
  align-items: center;
  gap: .5rem;
}
.select-all-label { display: flex; align-items: center; gap: .5rem; cursor: pointer; font-size: .8rem; color: var(--col-muted); }
.select-all-text { user-select: none; }

/* row checkbox */
.row-checkbox {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  accent-color: var(--col-accent);
}
.company-row--checked { background: color-mix(in srgb, var(--col-accent) 8%, transparent); }

/* follow-up badges */
.followup-badge { font-size: .65rem; font-weight: 700; padding: .1rem .4rem; border-radius: 9999px; white-space: nowrap; }
.followup-badge--overdue { background: #fee2e2; color: #b91c1c; }
.followup-badge--today   { background: #fef3c7; color: #92400e; }

/* bulk action bar */
.bulk-bar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  background: var(--col-invert-bg);
  color: var(--col-invert-text);
  display: flex;
  align-items: center;
  gap: .75rem;
  padding: .625rem 1rem;
  flex-wrap: wrap;
}
.bulk-count { font-size: .875rem; font-weight: 600; white-space: nowrap; }
.bulk-select {
  background: var(--col-bg); color: var(--col-text);
  border: 1px solid var(--col-border); border-radius: .375rem;
  padding: .35rem .5rem; font-size: .8rem; flex: 1; min-width: 140px; max-width: 220px;
}
.bulk-apply {
  background: var(--col-accent); color: #fff; border: none; border-radius: .375rem;
  padding: .35rem .75rem; font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.bulk-apply:disabled { opacity: .5; cursor: not-allowed; }
.bulk-clear {
  background: none; border: 1px solid rgba(255,255,255,.3); color: var(--col-invert-text);
  border-radius: .375rem; padding: .35rem .75rem; font-size: .8rem; cursor: pointer;
}
.bulk-clear:hover { background: rgba(255,255,255,.1); }
.bulk-error { font-size: .8rem; color: #fca5a5; }
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: transform .18s ease, opacity .18s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { transform: translateY(100%); opacity: 0; }

/* modal */
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
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}
/* Application detail panel — slide from right (desktop), slide up (mobile) */
.app-detail-enter-active,
.app-detail-leave-active { transition: opacity 0.2s ease; }
.app-detail-enter-from,
.app-detail-leave-to     { opacity: 0; }
.app-detail-enter-active .modal-box,
.app-detail-leave-active .modal-box { transition: transform 0.2s ease, opacity 0.2s ease; }
.app-detail-enter-from .modal-box,
.app-detail-leave-to   .modal-box   { transform: translateX(24px); opacity: 0; }
@media (max-width: 480px) {
  .app-detail-enter-from .modal-box,
  .app-detail-leave-to   .modal-box { transform: translateY(24px); }
}
@media (prefers-reduced-motion: reduce) {
  .app-detail-enter-active,
  .app-detail-leave-active { transition: none; }
  .app-detail-enter-active .modal-box,
  .app-detail-leave-active .modal-box { transition: none; }
}

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
.btn-filter-toggle {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-surface); color: var(--col-muted);
  border: 1px solid var(--col-border); border-radius: .375rem;
  padding: .45rem .75rem; font-size: .875rem; cursor: pointer; white-space: nowrap;
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

.btn-export {
  display: inline-flex; align-items: center; gap: .375rem;
  background: var(--col-surface); color: var(--col-muted); border: 1px solid var(--col-border);
  border-radius: .375rem; padding: .5rem 1rem; font-size: .875rem; cursor: pointer; white-space: nowrap;
}
.btn-export:hover { background: var(--col-raised); }

/* view mode toggle */
.view-toggle-group {
  display: inline-flex; border: 1px solid var(--col-border); border-radius: .375rem; overflow: hidden;
}
.view-toggle-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--col-surface); color: var(--col-muted); border: none;
  padding: .45rem .625rem; cursor: pointer; transition: background .12s, color .12s;
}
.view-toggle-btn:hover { background: var(--col-raised); color: var(--col-text); }
.view-toggle-btn--active { background: var(--col-accent-lt); color: var(--col-accent-dk); }

.show-empty-label {
  display: inline-flex; align-items: center; gap: .35rem;
  font-size: .8rem; color: var(--col-muted); cursor: pointer; white-space: nowrap;
}
.show-empty-check { accent-color: var(--col-accent); }

/* board (kanban) view */
.board-view {
  flex: 1; overflow-x: auto; overflow-y: hidden;
  display: flex; align-items: flex-start; gap: .875rem;
  padding: 1rem; background: var(--col-bg);
}
.board-col {
  width: 220px; flex-shrink: 0; display: flex; flex-direction: column;
  max-height: 100%; background: var(--col-surface);
  border: 1px solid var(--col-border); border-radius: .625rem; overflow: hidden;
}
.board-col-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .625rem .875rem; border-bottom: 1px solid var(--col-border); flex-shrink: 0;
}
.board-col-count {
  font-size: .72rem; font-weight: 700; color: var(--col-muted);
  background: var(--col-raised); border-radius: 9999px; padding: .1rem .4rem;
}
.board-cards { overflow-y: auto; flex: 1; padding: .5rem; display: flex; flex-direction: column; gap: .5rem; }
.board-card {
  background: var(--col-bg); border: 1px solid var(--col-border);
  border-radius: .5rem; padding: .625rem .75rem; cursor: pointer;
  transition: box-shadow .12s, border-color .12s;
}
.board-card:hover { box-shadow: 0 2px 8px color-mix(in srgb, var(--col-text) 8%, transparent); border-color: var(--col-accent); }
.board-card--active { border-color: var(--col-accent); background: var(--col-accent-lt); }
.board-card-company { font-size: .8rem; font-weight: 600; color: var(--col-text); margin: 0 0 .2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.board-card-position { font-size: .75rem; color: var(--col-muted); margin: 0 0 .375rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.board-card-meta { display: flex; align-items: center; gap: .375rem; flex-wrap: wrap; }
.board-card-date { font-size: .7rem; color: var(--col-subtle); }

@media (max-width: 480px) {
  .modal-box { max-height: 100vh; border-radius: 16px 16px 0 0; align-self: flex-end; }
  .modal-backdrop { align-items: flex-end; padding: 0; }
}

/* saving indicators */
.row-saving { font-size: .7rem; font-weight: 600; color: var(--col-muted); animation: pulse .9s ease-in-out infinite; }
.board-card-saving { font-size: .7rem; font-weight: 600; color: var(--col-muted); animation: pulse .9s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

/* background-save error toast */
.toast-error {
  position: fixed; bottom: 5rem; left: 50%; transform: translateX(-50%);
  background: var(--col-error); color: #fff;
  padding: .75rem 1rem; border-radius: .5rem;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
  display: flex; align-items: center; gap: .75rem;
  font-size: .875rem; font-weight: 500; z-index: 200;
  max-width: 480px; min-width: 280px;
}
.toast-close { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0; }
.toast-close:hover { opacity: .75; }
.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* print styles */
@media print {
  .filter-bar, .dropdown-filters-panel, .select-bar, .bulk-bar, .btn-export, .btn-new { display: none !important; }
  .app-list-wrapper { overflow: visible; }
  .modal-backdrop { display: none !important; }
  .company-row { break-inside: avoid; }
}
</style>
