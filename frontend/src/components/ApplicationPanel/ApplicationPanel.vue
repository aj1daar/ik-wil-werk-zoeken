<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES, REJECTION_REASON_LABELS } from '../../stores/applications'
import { useCompaniesStore } from '../../stores/companies'
import type { Application, ActivityLog, RejectionReason, SponsorCompany, StatusHistory } from '../../api'
import { api } from '../../api'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog.vue'
import DatePicker from '../DatePicker/DatePicker.vue'

const props = defineProps<{ application: Application }>()
const emit  = defineEmits<{ close: [] }>()

const store          = useApplicationsStore()
const companiesStore = useCompaniesStore()

const companyName      = ref(props.application.companyName)
const position         = ref(props.application.position)
const appliedAt        = ref(props.application.appliedAt.slice(0, 10))
const status           = ref(props.application.status)
const rejectionReason  = ref<RejectionReason | ''>(props.application.rejectionReason ?? '')
const rejectionNote    = ref(props.application.rejectionNote ?? '')
const notes            = ref(props.application.notes ?? '')
const contactName      = ref(props.application.contactPersonName ?? '')
const contactEmail     = ref(props.application.contactPersonEmail ?? '')
const locationInput    = ref('')
const locations        = ref<string[]>([...props.application.locations])
const followUpDate     = ref(props.application.followUpDate?.slice(0, 10) ?? '')
const jobUrl           = ref(props.application.jobUrl ?? '')
const saving           = ref(false)
const deleting         = ref(false)
const saveError        = ref('')
const chipFlash        = ref(false)
const showDiscardConfirm = ref(false)
const showDeleteConfirm  = ref(false)

const todayYmd = new Date().toISOString().slice(0, 10)

// Typeahead
const suggestions      = ref<SponsorCompany[]>([])
const highlightedIndex = ref(-1)
const showDropdown     = computed(() => suggestions.value.length > 0)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Activity log
const activityLogs     = ref<ActivityLog[]>([])
const activityLoading  = ref(false)
const showHistory      = ref(false)

// Status history
const statusHistory    = ref<StatusHistory[]>([])
const historyLoading   = ref(false)
const editingEntryId   = ref<string | null>(null)
const editStatus       = ref('')
const editDate         = ref('')
const historyError     = ref('')
const showDeleteHistoryConfirm = ref(false)
const pendingDeleteId  = ref<string | null>(null)
const addingEntry             = ref(false)
const newEntryStatus          = ref(ALL_STATUSES[0])
const newEntryDate            = ref(todayYmd)
const newEntryRejectionReason = ref<RejectionReason | ''>('')
const newEntryRejectionNote   = ref('')
const addError                = ref('')

const addDateWarning = computed(() =>
  newEntryDate.value && newEntryDate.value < appliedAt.value
    ? 'This date is before the application date.'
    : ''
)

watch(() => props.application, (a) => {
  companyName.value     = a.companyName
  position.value        = a.position
  appliedAt.value       = a.appliedAt.slice(0, 10)
  status.value          = a.status
  rejectionReason.value = a.rejectionReason ?? ''
  rejectionNote.value   = a.rejectionNote ?? ''
  notes.value           = a.notes ?? ''
  contactName.value     = a.contactPersonName ?? ''
  contactEmail.value    = a.contactPersonEmail ?? ''
  locations.value       = [...a.locations]
  followUpDate.value    = a.followUpDate?.slice(0, 10) ?? ''
  jobUrl.value          = a.jobUrl ?? ''
  saveError.value       = ''
  activityLogs.value    = []
  statusHistory.value   = []
  showHistory.value     = false
  loadStatusHistory()
})

const isRejected = computed(() => status.value === 'Rejected')

const isDirty = computed(() =>
  companyName.value     !== props.application.companyName ||
  position.value        !== props.application.position ||
  appliedAt.value       !== props.application.appliedAt.slice(0, 10) ||
  status.value          !== props.application.status ||
  rejectionReason.value !== (props.application.rejectionReason ?? '') ||
  rejectionNote.value   !== (props.application.rejectionNote ?? '') ||
  notes.value           !== (props.application.notes ?? '') ||
  contactName.value     !== (props.application.contactPersonName ?? '') ||
  contactEmail.value    !== (props.application.contactPersonEmail ?? '') ||
  followUpDate.value    !== (props.application.followUpDate?.slice(0, 10) ?? '') ||
  jobUrl.value          !== (props.application.jobUrl ?? '') ||
  JSON.stringify(locations.value) !== JSON.stringify([...props.application.locations])
)

const sortedHistory = computed(() =>
  [...statusHistory.value].sort((a, b) =>
    a.statusDate.localeCompare(b.statusDate) || a.createdAt.localeCompare(b.createdAt)
  )
)

function updateStatusFromHistory() {
  if (statusHistory.value.length === 0) return
  const latest = [...statusHistory.value].sort((a, b) =>
    b.statusDate.localeCompare(a.statusDate) || b.createdAt.localeCompare(a.createdAt)
  )[0]
  status.value = latest.status as typeof status.value
}

onMounted(() => { companiesStore.load(); loadStatusHistory() })
onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

function onCompanyInput() {
  highlightedIndex.value = -1
  if (debounceTimer) clearTimeout(debounceTimer)
  const q = companyName.value
  debounceTimer = setTimeout(() => {
    suggestions.value = q.trim().length >= 1 ? companiesStore.search(q) : []
  }, 300)
}

function selectCompany(company: SponsorCompany) {
  companyName.value     = company.name
  suggestions.value     = []
  highlightedIndex.value = -1
  if (company.city && !locations.value.includes(company.city)) {
    locations.value = [company.city, ...locations.value]
  }
}

function onCompanyKeydown(e: KeyboardEvent) {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    if (highlightedIndex.value >= 0) {
      e.preventDefault()
      selectCompany(suggestions.value[highlightedIndex.value])
    }
  } else if (e.key === 'Escape') {
    suggestions.value      = []
    highlightedIndex.value = -1
  }
}

function onCompanyBlur() {
  setTimeout(() => { suggestions.value = []; highlightedIndex.value = -1 }, 150)
}

function requestClose() {
  if (isDirty.value) { showDiscardConfirm.value = true; return }
  emit('close')
}

const isFollowUpOverdue = computed(() => {
  if (!followUpDate.value) return false
  return new Date(followUpDate.value) < new Date(new Date().toDateString())
})

const REJECTION_REASONS = Object.entries(REJECTION_REASON_LABELS) as [RejectionReason, string][]

function addLocation() {
  const l = locationInput.value.trim()
  if (l && !locations.value.includes(l)) locations.value.push(l)
  locationInput.value = ''
}

function removeLocation(l: string) { locations.value = locations.value.filter(x => x !== l) }

function onLocationKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLocation() }
}

function buildPayload(overrides: Partial<Application> & { statusDate?: string } = {}) {
  return {
    companyName:        companyName.value.trim(),
    position:           position.value.trim(),
    appliedAt:          new Date(appliedAt.value).toISOString(),
    status:             status.value,
    rejectionReason:    status.value === 'Rejected' && rejectionReason.value ? rejectionReason.value : undefined,
    rejectionNote:      status.value === 'Rejected' && rejectionNote.value   ? rejectionNote.value   : undefined,
    notes:              notes.value || undefined,
    contactPersonName:  contactName.value || undefined,
    contactPersonEmail: contactEmail.value || undefined,
    locations:          locations.value,
    followUpDate:       followUpDate.value ? new Date(followUpDate.value).toISOString() : undefined,
    jobUrl:             jobUrl.value || undefined,
    ...overrides,
  }
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await store.update(props.application.id, buildPayload())
    if (showHistory.value) await loadHistory()
    chipFlash.value = true
    setTimeout(() => { chipFlash.value = false }, 600)
  } catch {
    saveError.value = 'Save failed. Please try again.'
  } finally {
    saving.value = false
  }
}

async function remove() {
  deleting.value = true
  try {
    await store.remove(props.application.id)
    emit('close')
  } catch {
    saveError.value = 'Delete failed. Please try again.'
    deleting.value = false
  }
}

async function loadHistory() {
  activityLoading.value = true
  try {
    activityLogs.value = await api.getActivityLog(props.application.id)
  } catch {
    // silently ignore; history is non-critical
  } finally {
    activityLoading.value = false
  }
}

async function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value && activityLogs.value.length === 0) {
    await loadHistory()
  }
}

// ── status history ────────────────────────────────────────────────────────────

async function loadStatusHistory() {
  historyLoading.value = true
  try {
    statusHistory.value = await api.getStatusHistory(props.application.id)
    updateStatusFromHistory()
  } catch {
    // silently ignore
  } finally {
    historyLoading.value = false
  }
}

function startEdit(entry: StatusHistory) {
  editingEntryId.value = entry.id
  editStatus.value     = entry.status
  editDate.value       = entry.statusDate
  historyError.value   = ''
}

function cancelEdit() {
  editingEntryId.value = null
  historyError.value   = ''
}

async function saveEdit(entry: StatusHistory) {
  historyError.value = ''
  try {
    const updated = await api.updateStatusHistory(entry.id, {
      status:     editStatus.value,
      statusDate: editDate.value,
    })
    const idx = statusHistory.value.findIndex(h => h.id === entry.id)
    if (idx !== -1) statusHistory.value[idx] = updated
    statusHistory.value = [...statusHistory.value].sort((a, b) =>
      b.statusDate.localeCompare(a.statusDate) || b.createdAt.localeCompare(a.createdAt)
    )
    editingEntryId.value = null
    updateStatusFromHistory()
    await store.update(props.application.id, buildPayload())
  } catch {
    historyError.value = 'Save failed. Please try again.'
  }
}

function confirmDeleteEntry(id: string) {
  pendingDeleteId.value = id
  showDeleteHistoryConfirm.value = true
}

async function deleteEntry() {
  if (!pendingDeleteId.value) return
  historyError.value = ''
  try {
    await api.deleteStatusHistory(pendingDeleteId.value)
    statusHistory.value = statusHistory.value.filter(h => h.id !== pendingDeleteId.value)
    updateStatusFromHistory()
    await store.update(props.application.id, buildPayload())
  } catch {
    historyError.value = 'Delete failed. Please try again.'
  } finally {
    pendingDeleteId.value = null
    showDeleteHistoryConfirm.value = false
  }
}

function startAdd() {
  addingEntry.value             = true
  newEntryStatus.value          = ALL_STATUSES[0]
  newEntryDate.value            = todayYmd
  newEntryRejectionReason.value = ''
  newEntryRejectionNote.value   = ''
  addError.value                = ''
}

function cancelAdd() {
  addingEntry.value             = false
  newEntryRejectionReason.value = ''
  newEntryRejectionNote.value   = ''
  addError.value                = ''
}

async function saveAdd() {
  addError.value = ''
  try {
    const entry = await api.addStatusHistory(props.application.id, {
      status:     newEntryStatus.value,
      statusDate: newEntryDate.value,
    })
    statusHistory.value = [entry, ...statusHistory.value]
    updateStatusFromHistory()
    const isNewRejected = status.value === 'Rejected'
    if (isNewRejected) {
      rejectionReason.value = newEntryRejectionReason.value
      rejectionNote.value   = newEntryRejectionNote.value
    }
    await store.update(props.application.id, buildPayload({ statusDate: newEntryDate.value }))
    addingEntry.value = false
  } catch {
    addError.value = 'Failed to add entry. Please try again.'
  }
}

const FIELD_LABELS: Record<string, string> = {
  Status:             'Status',
  CompanyName:        'Company',
  Position:           'Position',
  AppliedAt:          'Applied date',
  RejectionReason:    'Rejection reason',
  Notes:              'Notes',
  ContactPersonName:  'Contact name',
  ContactPersonEmail: 'Contact email',
  FollowUpDate:       'Follow-up date',
  Locations:          'Locations',
  JobUrl:             'Job posting URL',
}

function formatLogDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatStatusDate(ymd: string) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

function fieldLabel(f: string) { return FIELD_LABELS[f] ?? f }
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title-block">
        <h2 class="panel-title">{{ application.companyName }}</h2>
        <p class="panel-subtitle">{{ application.position }}</p>
        <span :class="['chip', 'status-chip', STATUS_COLOR[status], { 'chip-updated': chipFlash }]">
          {{ STATUS_LABELS[status] }}
        </span>
      </div>
      <button @click="requestClose" class="btn-icon" aria-label="Close panel">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="panel-body">
      <div class="field">
        <label class="field-label" for="ap-company">Company name</label>
        <div class="combobox-wrapper">
          <input
            id="ap-company"
            v-model="companyName"
            class="field-input"
            autocomplete="off"
            role="combobox"
            :aria-expanded="showDropdown"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            :aria-activedescendant="highlightedIndex >= 0 ? `ap-suggestion-${highlightedIndex}` : undefined"
            @input="onCompanyInput"
            @keydown="onCompanyKeydown"
            @blur="onCompanyBlur"
          />
          <ul v-if="showDropdown" class="combobox-dropdown" role="listbox" aria-label="Company suggestions">
            <li
              v-for="(company, i) in suggestions"
              :key="company.id"
              :id="`ap-suggestion-${i}`"
              role="option"
              :class="['combobox-option', { 'combobox-option--active': i === highlightedIndex }]"
              :aria-selected="i === highlightedIndex"
              @mousedown.prevent="selectCompany(company)"
            >
              <span class="combobox-name">{{ company.name }}</span>
              <span v-if="company.city" class="combobox-city">{{ company.city }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="ap-position">Position</label>
        <input id="ap-position" v-model="position" class="field-input" />
      </div>

      <div class="field">
        <label class="field-label" for="ap-date">Application date</label>
        <input id="ap-date" v-model="appliedAt" type="date" class="field-input" />
      </div>

      <!-- Status journey (inline timeline) -->
      <div class="sj-section">
        <div class="sj-header">
          <span class="field-label">Status journey</span>
        </div>
        <div v-if="historyLoading" class="sj-empty">Loading…</div>
        <template v-else>
          <p v-if="historyError" class="sh-error">{{ historyError }}</p>
          <ul v-if="sortedHistory.length > 0" class="sj-list">
            <li v-for="entry in sortedHistory" :key="entry.id" class="sj-item">
              <div class="sj-line-col">
                <span class="sj-dot"></span>
                <span class="sj-line"></span>
              </div>
              <div class="sj-content">
                <template v-if="editingEntryId === entry.id">
                  <div class="sh-edit-row">
                    <select v-model="editStatus" class="field-input sh-edit-select">
                      <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
                    </select>
                    <DatePicker v-model="editDate" placeholder="Date" />
                  </div>
                  <div class="sh-edit-actions">
                    <button class="btn-primary sh-save-btn" @click="saveEdit(entry)">Save</button>
                    <button class="btn-ghost sh-cancel-btn" @click="cancelEdit">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <div class="sj-row">
                    <span :class="['chip', STATUS_COLOR[entry.status]]">{{ STATUS_LABELS[entry.status] }}</span>
                    <span class="sj-date">{{ formatStatusDate(entry.statusDate) }}</span>
                    <div class="sh-actions">
                      <button class="sh-btn" @click="startEdit(entry)" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" class="sh-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button class="sh-btn sh-btn--danger" @click="confirmDeleteEntry(entry.id)" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" class="sh-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </li>
          </ul>
          <div v-else class="sj-empty">No status changes yet.</div>

          <template v-if="addingEntry">
            <div class="sh-add-form">
              <div class="sh-edit-row">
                <select v-model="newEntryStatus" class="field-input sh-edit-select">
                  <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
                </select>
                <DatePicker v-model="newEntryDate" placeholder="Date" />
              </div>
              <p v-if="addDateWarning" class="sh-warning">{{ addDateWarning }}</p>
              <template v-if="newEntryStatus === 'Rejected'">
                <select v-model="newEntryRejectionReason" class="field-input sh-rejection-select">
                  <option value="">— Rejection reason (optional) —</option>
                  <option v-for="[val, label] in REJECTION_REASONS" :key="val" :value="val">{{ label }}</option>
                </select>
                <textarea
                  v-model="newEntryRejectionNote"
                  class="field-input sh-rejection-note"
                  rows="2"
                  placeholder="Additional note (optional)…"
                />
              </template>
              <p v-if="addError" class="sh-error">{{ addError }}</p>
              <div class="sh-edit-actions">
                <button class="btn-primary sh-save-btn" @click="saveAdd">Add</button>
                <button class="btn-ghost sh-cancel-btn" @click="cancelAdd">Cancel</button>
              </div>
            </div>
          </template>
          <button v-else class="sh-add-btn" @click="startAdd">
            <svg xmlns="http://www.w3.org/2000/svg" class="sh-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Change status
          </button>
        </template>
      </div>

      <template v-if="isRejected">
        <div class="field">
          <label class="field-label" for="ap-reason">Rejection reason</label>
          <select id="ap-reason" v-model="rejectionReason" class="field-input">
            <option value="">— Select a reason —</option>
            <option v-for="[val, label] in REJECTION_REASONS" :key="val" :value="val">{{ label }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="ap-reason-note">Additional note <span class="optional">(optional)</span></label>
          <textarea id="ap-reason-note" v-model="rejectionNote" rows="2" class="field-input" placeholder="Any additional details…" />
        </div>
      </template>

      <div class="field">
        <label class="field-label" for="ap-followup">
          Follow-up date
          <span class="optional">(optional)</span>
          <span v-if="isFollowUpOverdue" class="overdue-badge">overdue</span>
        </label>
        <input
          id="ap-followup"
          v-model="followUpDate"
          type="date"
          :class="['field-input', { 'input-overdue': isFollowUpOverdue }]"
        />
        <button
          v-if="followUpDate"
          type="button"
          class="clear-date-btn"
          @click="followUpDate = ''"
        >Clear</button>
      </div>

      <div class="field">
        <label class="field-label" for="ap-joburl">
          Job posting URL
          <span class="optional">(optional)</span>
        </label>
        <div class="joburl-row">
          <input
            id="ap-joburl"
            v-model="jobUrl"
            type="url"
            class="field-input"
            placeholder="https://…"
          />
          <a
            v-if="jobUrl && (jobUrl.startsWith('https://') || jobUrl.startsWith('http://'))"
            :href="jobUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="joburl-open-btn btn-icon"
            aria-label="Open job posting"
            title="Open job posting"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Locations</label>
        <div class="tag-row mb-2">
          <span v-for="l in locations" :key="l" class="city-chip">
            {{ l }}
            <button @click="removeLocation(l)" class="city-remove" aria-label="Remove">×</button>
          </span>
        </div>
        <input
          v-model="locationInput"
          @keydown="onLocationKey"
          @blur="addLocation"
          placeholder="Type city and press Enter…"
          class="field-input"
        />
      </div>

      <div class="field">
        <label class="field-label" for="ap-notes">Notes</label>
        <textarea id="ap-notes" v-model="notes" rows="4" placeholder="Personal notes…" class="field-input notes-textarea" />
      </div>

      <div class="field">
        <label class="field-label">Contact person</label>
        <input v-model="contactName"  placeholder="Name"  class="field-input mb-2" />
        <input v-model="contactEmail" type="email" placeholder="Email" class="field-input" />
        <a
          v-if="application.contactPersonEmail"
          :href="`mailto:${application.contactPersonEmail}`"
          class="mailto-link"
        >{{ application.contactPersonEmail }}</a>
      </div>

      <!-- Change history (activity log) -->
      <div class="history-section">
        <button class="history-toggle" @click="toggleHistory" :aria-expanded="showHistory">
          <svg xmlns="http://www.w3.org/2000/svg" class="history-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Change history
          <svg xmlns="http://www.w3.org/2000/svg" :class="['chevron', { 'chevron--open': showHistory }]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="showHistory" class="history-body">
          <div v-if="activityLoading" class="history-empty">Loading…</div>
          <div v-else-if="activityLogs.length === 0" class="history-empty">No changes recorded yet.</div>
          <ul v-else class="timeline">
            <li v-for="log in activityLogs" :key="log.id" class="timeline-item">
              <span class="timeline-dot"></span>
              <div class="timeline-content">
                <span class="timeline-field">{{ fieldLabel(log.field) }}</span>
                <div class="timeline-change">
                  <span class="timeline-old">{{ log.oldValue ?? '—' }}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" class="timeline-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span class="timeline-new">{{ log.newValue ?? '—' }}</span>
                </div>
                <span class="timeline-date">{{ formatLogDate(log.changedAt) }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <p v-if="saveError" id="ap-save-error" class="save-error" role="alert">{{ saveError }}</p>
      <div class="footer-actions">
        <button @click="save" :disabled="saving || deleting" class="btn-primary footer-primary" aria-describedby="ap-save-error">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button @click="showDeleteConfirm = true" :disabled="saving || deleting" class="btn-danger">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="showDiscardConfirm"
    title="Discard changes?"
    message="You have unsaved changes. They will be lost."
    confirm-label="Discard"
    confirm-class="btn-danger"
    @confirm="emit('close')"
    @cancel="showDiscardConfirm = false"
  />

  <ConfirmDialog
    v-if="showDeleteConfirm"
    title="Delete application?"
    message="This cannot be undone."
    confirm-label="Delete"
    confirm-class="btn-danger"
    @confirm="() => { showDeleteConfirm = false; remove() }"
    @cancel="showDeleteConfirm = false"
  />

  <ConfirmDialog
    v-if="showDeleteHistoryConfirm"
    title="Delete history entry?"
    message="This cannot be undone."
    confirm-label="Delete"
    confirm-class="btn-danger"
    @confirm="deleteEntry"
    @cancel="() => { showDeleteHistoryConfirm = false; pendingDeleteId = null }"
  />
</template>

<style scoped>
.panel { display: flex; flex-direction: column; height: 100%; }
.status-chip { display: inline-block; margin-top: .375rem; }
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border); flex-shrink: 0; }
.panel-title-block { flex: 1; min-width: 0; }
.panel-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-subtitle { font-size: .8rem; color: var(--col-muted); margin-top: .125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); flex-shrink: 0; }
.footer-actions { display: flex; gap: .75rem; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.optional { color: var(--col-subtle); font-weight: 400; text-transform: none; font-size: .7rem; }
.notes-textarea { resize: vertical; }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.mb-2 { margin-bottom: .5rem; }
.city-chip { display: inline-flex; align-items: center; gap: .25rem; background: var(--col-raised); border-radius: 9999px; padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted); }
.city-remove { background: none; border: none; cursor: pointer; color: var(--col-subtle); font-size: 1rem; line-height: 1; padding: 0; }
.city-remove:hover { color: var(--col-error); }
.save-error { color: var(--col-error); font-size: .875rem; margin-bottom: .5rem; }
.icon { width: 1.25rem; height: 1.25rem; }
.footer-primary { flex: 1; }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
.mailto-link { font-size: .8rem; color: var(--col-accent); text-decoration: none; margin-top: .125rem; }
.mailto-link:hover { text-decoration: underline; }

/* status journey */
.sj-section { display: flex; flex-direction: column; gap: .5rem; }
.sj-header { display: flex; align-items: center; justify-content: space-between; }
.sj-empty { font-size: .8rem; color: var(--col-subtle); padding: .125rem 0; }
.sj-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; }
.sj-item { display: flex; gap: .625rem; align-items: flex-start; }
.sj-line-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: .75rem; }
.sj-dot { width: .625rem; height: .625rem; border-radius: 50%; background: var(--col-accent); flex-shrink: 0; margin-top: .35rem; }
.sj-line { flex: 1; width: 2px; background: var(--col-border); min-height: .75rem; }
.sj-item:last-child .sj-line { display: none; }
.sj-content { flex: 1; padding-bottom: .625rem; }
.sj-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.sj-date { font-size: .8rem; color: var(--col-muted); flex: 1; }

/* follow-up date */
.overdue-badge { display: inline-block; background: var(--col-error); color: #fff; font-size: .65rem; font-weight: 700; border-radius: 9999px; padding: .1rem .4rem; margin-left: .375rem; vertical-align: middle; }
.input-overdue { border-color: var(--col-error) !important; }
.clear-date-btn { align-self: flex-start; background: none; border: none; color: var(--col-accent); font-size: .8rem; cursor: pointer; padding: 0; margin-top: .125rem; }
.joburl-row { display: flex; gap: .5rem; align-items: center; }
.joburl-row .field-input { flex: 1; }
.joburl-open-btn { flex-shrink: 0; color: var(--col-accent); }
.clear-date-btn:hover { text-decoration: underline; }

/* shared history section */
.history-section { border-top: 1px solid var(--col-border); margin-top: .25rem; padding-top: .75rem; }
.history-toggle { display: flex; align-items: center; gap: .4rem; background: none; border: none; cursor: pointer; color: var(--col-muted); font-size: .875rem; font-weight: 500; padding: 0; }
.history-toggle:hover { color: var(--col-text); }
.history-icon { width: 1rem; height: 1rem; flex-shrink: 0; }
.chevron { width: .875rem; height: .875rem; margin-left: auto; transition: transform .18s ease; }
.chevron--open { transform: rotate(180deg); }
.history-body { margin-top: .75rem; }
.history-empty { font-size: .8rem; color: var(--col-subtle); padding: .25rem 0; }

/* status history list */
.sh-list { list-style: none; padding: 0; margin: 0 0 .5rem; display: flex; flex-direction: column; gap: .375rem; }
.sh-item { display: flex; align-items: center; gap: .5rem; padding: .375rem .5rem; border-radius: .375rem; }
.sh-item:hover { background: var(--col-raised); }
.sh-date { font-size: .8rem; color: var(--col-muted); flex: 1; }
.sh-actions { display: flex; gap: .25rem; flex-shrink: 0; }
.sh-btn { background: none; border: none; cursor: pointer; padding: .25rem; border-radius: .25rem; color: var(--col-subtle); display: flex; align-items: center; }
.sh-btn:hover { color: var(--col-text); background: var(--col-surface); }
.sh-btn--danger:hover { color: var(--col-error); }
.sh-icon { width: .875rem; height: .875rem; }

.sh-edit-row { display: flex; gap: .5rem; align-items: center; }
.sh-edit-select { flex: 1; }
.sh-edit-actions { display: flex; gap: .5rem; margin-top: .375rem; }
.sh-save-btn { font-size: .8rem; padding: .3rem .75rem; }
.sh-cancel-btn { font-size: .8rem; padding: .3rem .75rem; }

.sh-add-form { border: 1px dashed var(--col-border); border-radius: .375rem; padding: .625rem; margin-top: .5rem; display: flex; flex-direction: column; gap: .375rem; }
.sh-rejection-select { width: 100%; }
.sh-rejection-note { resize: vertical; width: 100%; }
.sh-add-btn { display: flex; align-items: center; gap: .35rem; background: none; border: none; cursor: pointer; color: var(--col-accent); font-size: .8rem; font-weight: 500; padding: .25rem 0; margin-top: .25rem; }
.sh-add-btn:hover { text-decoration: underline; }
.sh-error { font-size: .8rem; color: var(--col-error); margin: .25rem 0; }
.sh-warning { font-size: .8rem; color: var(--col-warning, #b45309); margin: .25rem 0; }

/* activity timeline */
.timeline { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .625rem; }
.timeline-item { display: flex; gap: .625rem; align-items: flex-start; }
.timeline-dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--col-accent); flex-shrink: 0; margin-top: .3rem; }
.timeline-content { flex: 1; min-width: 0; }
.timeline-field { font-size: .75rem; font-weight: 600; color: var(--col-text); }
.timeline-change { display: flex; align-items: center; gap: .375rem; flex-wrap: wrap; margin-top: .125rem; }
.timeline-old { font-size: .75rem; color: var(--col-subtle); text-decoration: line-through; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-new { font-size: .75rem; color: var(--col-text); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-arrow { width: .75rem; height: .75rem; color: var(--col-subtle); flex-shrink: 0; }
.timeline-date { display: block; font-size: .7rem; color: var(--col-subtle); margin-top: .125rem; }

/* combobox */
.combobox-wrapper { position: relative; }
.combobox-dropdown {
  position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 50;
  background: var(--col-surface); border: 1px solid var(--col-border); border-radius: .375rem;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--col-text) 10%, transparent);
  list-style: none; margin: 0; padding: .25rem 0; max-height: 220px; overflow-y: auto;
}
.combobox-option {
  display: flex; align-items: center; gap: .5rem;
  padding: .5rem .75rem; cursor: pointer; font-size: .875rem;
}
.combobox-option:hover,
.combobox-option--active { background: var(--col-raised); }
.combobox-name { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.combobox-city { font-size: .75rem; color: var(--col-subtle); white-space: nowrap; flex-shrink: 0; }
</style>
