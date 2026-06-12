<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useApplicationsStore, STATUS_LABELS, ALL_STATUSES, REJECTION_REASON_LABELS } from '../../stores/applications'
import type { Application, RejectionReason } from '../../api'

const props = defineProps<{ application: Application }>()
const emit  = defineEmits<{ close: [] }>()

const store = useApplicationsStore()

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
const saving           = ref(false)
const deleting         = ref(false)
const saveError        = ref('')

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
  saveError.value       = ''
})

const isRejected = computed(() => status.value === 'Rejected')

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

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await store.update(props.application.id, {
      companyName:        companyName.value.trim(),
      position:           position.value.trim(),
      appliedAt:          new Date(appliedAt.value).toISOString(),
      status:             status.value,
      rejectionReason:    isRejected.value && rejectionReason.value ? rejectionReason.value : undefined,
      rejectionNote:      isRejected.value && rejectionNote.value ? rejectionNote.value : undefined,
      notes:              notes.value || undefined,
      contactPersonName:  contactName.value || undefined,
      contactPersonEmail: contactEmail.value || undefined,
      locations:          locations.value,
    })
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
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title-block">
        <h2 class="panel-title">{{ application.companyName }}</h2>
        <p class="panel-subtitle">{{ application.position }}</p>
      </div>
      <button @click="$emit('close')" class="btn-icon" aria-label="Close panel">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="panel-body">
      <div class="field">
        <label class="field-label" for="ap-company">Company name</label>
        <input id="ap-company" v-model="companyName" class="field-input" />
      </div>

      <div class="field">
        <label class="field-label" for="ap-position">Position</label>
        <input id="ap-position" v-model="position" class="field-input" />
      </div>

      <div class="field">
        <label class="field-label" for="ap-date">Application date</label>
        <input id="ap-date" v-model="appliedAt" type="date" class="field-input" />
      </div>

      <div class="field">
        <label class="field-label" for="ap-status">Status</label>
        <select id="ap-status" v-model="status" class="field-input">
          <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
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
      </div>
    </div>

    <div class="panel-footer">
      <p v-if="saveError" class="save-error">{{ saveError }}</p>
      <div class="footer-actions">
        <button @click="save" :disabled="saving || deleting" class="btn-primary footer-primary">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button @click="remove" :disabled="saving || deleting" class="btn-danger">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; height: 100%; }
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.panel-title-block { flex: 1; min-width: 0; }
.panel-title { font-size: 1.125rem; font-weight: 700; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-subtitle { font-size: .8rem; color: #6b7280; margin-top: .125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.panel-footer { padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.footer-actions { display: flex; gap: .75rem; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.field-label { font-size: .75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
.field-input { border: 1px solid #d1d5db; border-radius: .375rem; padding: .5rem .75rem; font-size: .875rem; width: 100%; box-sizing: border-box; }
.field-input:focus { outline: none; border-color: #1a1a1a; }
.optional { color: #9ca3af; font-weight: 400; text-transform: none; font-size: .7rem; }
.notes-textarea { resize: vertical; }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.mb-2 { margin-bottom: .5rem; }
.city-chip { display: inline-flex; align-items: center; gap: .25rem; background: #f3f4f6; border-radius: 9999px; padding: .2rem .6rem; font-size: .8rem; color: #374151; }
.city-remove { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 1rem; line-height: 1; padding: 0; }
.city-remove:hover { color: #ef4444; }
.save-error { color: #ef4444; font-size: .875rem; margin-bottom: .5rem; }
.btn-icon { background: none; border: none; cursor: pointer; padding: .25rem; color: #6b7280; flex-shrink: 0; }
.btn-icon:hover { color: #1a1a1a; }
.icon { width: 1.25rem; height: 1.25rem; }
.btn-primary { background: #1a1a1a; color: white; border: none; border-radius: .375rem; padding: .5rem 1.25rem; font-size: .875rem; font-weight: 600; cursor: pointer; flex: 1; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.footer-primary { flex: 1; }
.btn-danger { background: white; color: #dc2626; border: 1px solid #fca5a5; border-radius: .375rem; padding: .5rem .875rem; font-size: .875rem; cursor: pointer; }
.btn-danger:hover { background: #fef2f2; }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
</style>
