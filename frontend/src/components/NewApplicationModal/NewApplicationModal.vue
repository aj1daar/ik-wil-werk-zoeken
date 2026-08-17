<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS } from '../../stores/applications'
import { useCompaniesStore } from '../../stores/companies'
import type { ApplicationStatus, SponsorCompany } from '../../api'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog.vue'
import DatePicker from '../DatePicker/DatePicker.vue'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'

const TERMINAL: Set<ApplicationStatus> = new Set(['Rejected', 'Withdrawn', 'Accepted'])

const props = defineProps<{ prefillCompany?: string; prefillSponsorId?: string }>()
const emit  = defineEmits<{ close: [] }>()

const store          = useApplicationsStore()
const companiesStore = useCompaniesStore()

const initialCompany = props.prefillCompany ?? ''
const companyName     = ref(initialCompany)
const sponsorCompanyId = ref<string | undefined>(props.prefillSponsorId)
const selectedCompany  = ref<SponsorCompany | null>(null)
const suggestions      = ref<SponsorCompany[]>([])
const highlightedIndex = ref(-1)
const showDropdown     = computed(() => suggestions.value.length > 0)

const position      = ref('')
const appliedAt     = ref(new Date().toISOString().slice(0, 10))
const locationInput = ref('')
const locations     = ref<string[]>([])
const jobUrl        = ref('')
const saving        = ref(false)
const error         = ref('')
const showDiscardConfirm = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const isDirty = computed(() =>
  companyName.value.trim() !== initialCompany ||
  position.value.trim() !== '' ||
  locations.value.length > 0
)

function requestClose() {
  if (isDirty.value) { showDiscardConfirm.value = true; return }
  emit('close')
}

onMounted(() => { companiesStore.load() })
onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })
useBodyScrollLock()

const activeMatch = computed(() => {
  if (sponsorCompanyId.value) {
    return store.applications.find(
      a => a.sponsorCompanyId === sponsorCompanyId.value && !TERMINAL.has(a.status)
    ) ?? null
  }
  const name = companyName.value.trim().toLowerCase()
  if (!name) return null
  return store.applications.find(
    a => a.companyName.toLowerCase() === name && !TERMINAL.has(a.status)
  ) ?? null
})

function onCompanyInput() {
  sponsorCompanyId.value = undefined
  selectedCompany.value  = null
  highlightedIndex.value = -1

  if (debounceTimer) clearTimeout(debounceTimer)
  const q = companyName.value
  debounceTimer = setTimeout(() => {
    suggestions.value = q.trim().length >= 1 ? companiesStore.search(q) : []
  }, 300)
}

function selectCompany(company: SponsorCompany) {
  companyName.value     = company.name
  sponsorCompanyId.value = company.id
  selectedCompany.value  = company
  suggestions.value      = []
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

function addLocation() {
  const l = locationInput.value.trim()
  if (l && !locations.value.includes(l)) locations.value.push(l)
  locationInput.value = ''
}

function removeLocation(l: string) { locations.value = locations.value.filter(x => x !== l) }

function onLocationKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLocation() }
}

async function submit() {
  error.value = ''
  if (!companyName.value.trim()) { error.value = 'Company name is required.'; return }
  if (!position.value.trim())    { error.value = 'Position is required.'; return }
  if (!appliedAt.value)          { error.value = 'Application date is required.'; return }

  saving.value = true
  try {
    await store.create({
      companyName:       companyName.value.trim(),
      position:          position.value.trim(),
      appliedAt:         new Date(appliedAt.value).toISOString(),
      locations:         locations.value,
      sponsorCompanyId:  sponsorCompanyId.value,
      jobUrl:            jobUrl.value.trim() || undefined,
    })
    emit('close')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="requestClose">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">New Application</h2>
        <button @click="requestClose" class="btn-icon" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label class="field-label" for="company-name">Company name <span class="required">*</span></label>
          <div class="combobox-wrapper">
            <input
              id="company-name"
              v-model="companyName"
              class="field-input"
              placeholder="e.g. Acme B.V."
              autocomplete="off"
              role="combobox"
              :aria-expanded="showDropdown"
              aria-haspopup="listbox"
              aria-autocomplete="list"
              :aria-activedescendant="highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined"
              @input="onCompanyInput"
              @keydown="onCompanyKeydown"
              @blur="onCompanyBlur"
            />
            <ul v-if="showDropdown" class="combobox-dropdown" role="listbox" aria-label="Company suggestions">
              <li
                v-for="(company, i) in suggestions"
                :id="`suggestion-${i}`"
                :key="company.id"
                :class="['combobox-option', { 'combobox-option--active': i === highlightedIndex }]"
                role="option"
                :aria-selected="i === highlightedIndex"
                @mousedown.prevent="selectCompany(company)"
              >
                <span class="combobox-name">{{ company.name }}</span>
                <span v-if="company.city" class="city-chip combobox-city">{{ company.city }}</span>
                <span v-if="company.coreIndustry" class="industry-badge">{{ company.coreIndustry }}</span>
              </li>
            </ul>
          </div>
          <div v-if="selectedCompany" class="company-context-card">
            <span class="context-ind-badge">IND sponsor</span>
            <span v-if="selectedCompany.coreIndustry" class="context-field">{{ selectedCompany.coreIndustry }}</span>
            <span v-if="selectedCompany.city" class="context-field">{{ selectedCompany.city }}</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="position">Position <span class="required">*</span></label>
          <input id="position" v-model="position" class="field-input" placeholder="e.g. Senior Backend Engineer" />
        </div>

        <div class="field">
          <label class="field-label">Application date <span class="required">*</span></label>
          <DatePicker v-model="appliedAt" placeholder="Select date" />
        </div>

        <div class="field">
          <label class="field-label">Locations <span class="optional">(optional)</span></label>
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
          <label class="field-label">Job posting URL <span class="optional">(optional)</span></label>
          <input v-model="jobUrl" type="url" class="field-input" placeholder="https://…" />
        </div>

        <div v-if="activeMatch" class="dup-warning" role="status" aria-live="polite">
          You already have an active <strong>{{ STATUS_LABELS[activeMatch.status] }}</strong> application to <strong>{{ activeMatch.companyName }}</strong>. You can still add another.
        </div>
      </div>

      <div class="modal-footer">
        <p v-if="error" class="save-error" role="alert">{{ error }}</p>
        <div class="footer-actions">
          <button @click="requestClose" class="btn-secondary">Cancel</button>
          <button @click="submit" :disabled="saving" class="btn-primary">
            {{ saving ? 'Saving…' : 'Add Application' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="showDiscardConfirm"
    title="Discard application?"
    message="Your data will be lost."
    confirm-label="Discard"
    confirm-class="btn-danger"
    @confirm="emit('close')"
    @cancel="showDiscardConfirm = false"
  />
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal {
  background: var(--col-bg); border-radius: .75rem; width: 100%; max-width: 480px;
  box-shadow: 0 8px 32px color-mix(in srgb, var(--col-text) 12%, transparent),
              0 24px 64px color-mix(in srgb, var(--col-text) 16%, transparent);
  display: flex; flex-direction: column;
  max-height: 90vh;
  max-height: 90dvh; /* tracks the visible viewport, not the toolbar-collapsed one on iOS Chrome */
  overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border);
}
.modal-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); }
.modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; overscroll-behavior: contain; }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); }
.footer-actions { display: flex; gap: .75rem; justify-content: flex-end; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.required { color: var(--col-error); }
.optional { color: var(--col-subtle); font-weight: 400; text-transform: none; font-size: .7rem; }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.mb-2 { margin-bottom: .5rem; }
.city-chip { display: inline-flex; align-items: center; gap: .25rem; background: var(--col-raised); border-radius: 9999px; padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted); }
.city-remove { background: none; border: none; cursor: pointer; color: var(--col-subtle); font-size: 1rem; line-height: 1; padding: 0; }
.city-remove:hover { color: var(--col-error); }
.save-error { color: var(--col-error); font-size: .875rem; margin-bottom: .5rem; }
.dup-warning {
  margin: 0 1.5rem;
  padding: .5rem .75rem;
  font-size: .8125rem;
  background: var(--col-accent-lt);
  border: 1px solid color-mix(in srgb, var(--col-accent) 35%, transparent);
  color: var(--col-accent-dk);
  border-radius: 6px;
}
.icon { width: 1.25rem; height: 1.25rem; }
.btn-secondary { background: var(--col-bg); color: var(--col-muted); border: 1px solid var(--col-border); border-radius: .375rem; padding: .5rem 1.25rem; font-size: .875rem; cursor: pointer; }
.btn-secondary:hover { background: var(--col-surface); }

.combobox-wrapper { position: relative; }
.combobox-dropdown {
  position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--col-bg); border: 1px solid var(--col-border);
  border-radius: .5rem; box-shadow: 0 4px 16px color-mix(in srgb, var(--col-text) 10%, transparent);
  max-height: 220px; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: .25rem 0;
}
.combobox-option {
  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
  padding: .5rem .75rem; font-size: .875rem; cursor: pointer; color: var(--col-text);
}
.combobox-option:hover,
.combobox-option--active { background: var(--col-raised); }
.combobox-name { font-weight: 500; }
.combobox-city { font-size: .75rem; }
.industry-badge {
  font-size: .7rem; background: color-mix(in srgb, var(--col-accent) 15%, transparent);
  color: var(--col-accent-dk); border-radius: 9999px; padding: .1rem .45rem;
}
.company-context-card {
  display: flex; flex-wrap: wrap; align-items: center; gap: .375rem;
  padding: .375rem .625rem; font-size: .775rem;
  background: var(--col-raised); border-radius: .375rem;
  border: 1px solid var(--col-border);
}
.context-ind-badge {
  font-size: .7rem; font-weight: 600;
  background: color-mix(in srgb, var(--col-accent) 18%, transparent);
  color: var(--col-accent-dk); border-radius: 9999px; padding: .1rem .5rem;
}
.context-field { color: var(--col-muted); }
</style>
