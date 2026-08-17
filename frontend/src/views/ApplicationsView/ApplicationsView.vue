<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { Application, ApplicationStatus } from '../../api'
import NewApplicationModal from '../../components/NewApplicationModal/NewApplicationModal.vue'
import ApplicationPanel from '../../components/ApplicationPanel/ApplicationPanel.vue'

const store = useApplicationsStore()

const ROW_HEIGHT = 68
const listEl = ref<HTMLElement | null>(null)
const PAGE_SIZE = ref(10)
let _ro: ResizeObserver | null = null

type SortKey = 'newest' | 'oldest' | 'updated' | 'company' | 'followup'

const search            = ref('')
const filterStatus      = ref<ApplicationStatus | ''>('')
const sortBy            = ref<SortKey>('newest')
const selectedId        = ref<string | null>(null)
const modalOpen         = ref(false)
const showFiltersPanel  = ref(false)
const currentPage       = ref(1)

const activeFilterCount = computed(() =>
  (filterStatus.value !== '' ? 1 : 0) +
  (sortBy.value !== 'newest' ? 1 : 0)
)

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

onMounted(() => {
  store.load()
  window.addEventListener('keydown', onKey)
  _ro = new ResizeObserver(() => {
    if (!listEl.value) return
    const h = listEl.value.clientHeight
    const firstRow = listEl.value.querySelector<HTMLElement>('.company-row')
    const rowH = firstRow ? firstRow.offsetHeight : ROW_HEIGHT
    if (h > 0 && rowH > 0) PAGE_SIZE.value = Math.max(5, Math.floor(h / rowH))
  })
  if (listEl.value) _ro.observe(listEl.value)
})
onUnmounted(() => { window.removeEventListener('keydown', onKey); _ro?.disconnect() })

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

const pageCount = computed(() => Math.ceil(filtered.value.length / PAGE_SIZE.value))

const pagedFiltered = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE.value
  return filtered.value.slice(start, start + PAGE_SIZE.value)
})

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

watch([search, filterStatus, sortBy], () => { currentPage.value = 1 })
watch(PAGE_SIZE, () => { currentPage.value = 1 })

const selected = computed<Application | null>(() =>
  store.applications.find(a => a.id === selectedId.value) ?? null
)

const allPageChecked = computed(() =>
  pagedFiltered.value.length > 0 && pagedFiltered.value.every(a => checkedIds.value.has(a.id))
)

function goToPage(page: number) {
  currentPage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

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
  if (allPageChecked.value) {
    const s = new Set(checkedIds.value)
    pagedFiltered.value.forEach(a => s.delete(a.id))
    checkedIds.value = s
  } else {
    const s = new Set(checkedIds.value)
    pagedFiltered.value.forEach(a => s.add(a.id))
    checkedIds.value = s
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

    <div class="list-area">
      <div class="list-col">
        <div v-if="pagedFiltered.length > 0" class="select-bar">
          <label class="select-all-label">
            <input
              type="checkbox"
              :checked="allPageChecked"
              :indeterminate="checkedIds.size > 0 && !allPageChecked"
              @change="toggleAll"
              aria-label="Select all on this page"
            />
            <span class="select-all-text">
              {{ checkedIds.size > 0 ? `${checkedIds.size} selected` : 'Select all' }}
            </span>
          </label>
        </div>

        <div ref="listEl" class="app-list-wrapper">
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
              v-for="(app, index) in pagedFiltered"
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

        <div v-if="filtered.length > 0" class="pagination">
          <span class="pagination-info">{{ (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filtered.length) }} of {{ filtered.length }}</span>
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
      </div>
    </div>

    <transition name="bulk-bar">
      <div v-if="checkedIds.size > 0" class="bulk-bar" role="region" aria-label="Bulk actions">
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
.dashboard { max-width: 1280px; margin: 10px auto 0; }
.list-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.list-col  { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.app-list-wrapper {
  flex: 1;
  overflow: hidden;
}

.filter-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--col-bg);
  border-bottom: 1px solid var(--col-border);
}

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

.row-checkbox {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  accent-color: var(--col-accent);
}
.company-row--checked { background: color-mix(in srgb, var(--col-accent) 8%, transparent); }

.followup-badge { font-size: .65rem; font-weight: 700; padding: .1rem .4rem; border-radius: 9999px; white-space: nowrap; }
.followup-badge--overdue { background: #fee2e2; color: #b91c1c; }
.followup-badge--today   { background: #fef3c7; color: #92400e; }

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
  padding-bottom: calc(.625rem + env(safe-area-inset-bottom));
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
  .modal-box { max-height: 100vh; border-radius: 16px 16px 0 0; align-self: flex-end; }
  .modal-backdrop { align-items: flex-end; padding: 0; }
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

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .25rem;
  padding: .625rem 1rem;
  padding-bottom: calc(.625rem + env(safe-area-inset-bottom));
  flex-wrap: wrap;
  border-top: 1px solid var(--col-border-lt);
  background: var(--col-bg);
  flex-shrink: 0;
}
.pagination-info {
  width: 100%;
  text-align: center;
  font-size: .72rem;
  color: var(--col-subtle);
  margin-bottom: .2rem;
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

.row-saving { font-size: .7rem; font-weight: 600; color: var(--col-muted); animation: pulse .9s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

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

@media print {
  .filter-bar, .dropdown-filters-panel, .select-bar, .bulk-bar, .btn-export, .btn-new, .pagination { display: none !important; }
  .app-list-wrapper { overflow: visible; }
  .modal-backdrop { display: none !important; }
  .company-row { break-inside: avoid; }
}
</style>
