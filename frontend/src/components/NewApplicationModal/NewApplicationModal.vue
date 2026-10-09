<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApplicationsStore, STATUS_LABELS } from '../../stores/applications'
import { useCompaniesStore } from '../../stores/companies'
import { api } from '../../api'
import type { ApplicationStatus, SponsorCompany } from '../../api'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog.vue'
import DatePicker from '../DatePicker/DatePicker.vue'
import CompanyCombobox from '../CompanyCombobox/CompanyCombobox.vue'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'

const TERMINAL: Set<ApplicationStatus> = new Set(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])

const props = defineProps<{ prefillCompany?: string; prefillSponsorId?: string }>()
const emit  = defineEmits<{ close: [] }>()

const store          = useApplicationsStore()
const companiesStore = useCompaniesStore()

const initialCompany = props.prefillCompany ?? ''
const companyName     = ref(initialCompany)
const sponsorCompanyId = ref<string | undefined>(props.prefillSponsorId)
const selectedCompany  = ref<SponsorCompany | null>(null)
const suggestions      = ref<SponsorCompany[]>([])

const position      = ref('')
const appliedAt     = ref(new Date().toISOString().slice(0, 10))
const locationInput = ref('')
const locations     = ref<string[]>([])
const jobUrl        = ref('')
const successRate   = ref('')
const saving        = ref(false)
const error         = ref('')
const showDiscardConfirm = ref(false)

const parsingLink  = ref(false)
const linkHint     = ref('')
let   lastParsedUrl = ''

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

function onCompanyInput(value: string) {
  sponsorCompanyId.value = undefined
  selectedCompany.value  = null

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    suggestions.value = value.trim().length >= 1 ? companiesStore.search(value) : []
  }, 300)
}

function selectCompany(company: SponsorCompany) {
  companyName.value      = company.name
  sponsorCompanyId.value = company.id
  selectedCompany.value  = company
  suggestions.value      = []
  // The debounce started by the typing that led here must not re-open the list
  // a moment after the pick.
  if (debounceTimer) clearTimeout(debounceTimer)

  if (company.city && !locations.value.includes(company.city)) {
    locations.value = [company.city, ...locations.value]
  }
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

// When a job-posting URL is pasted, ask the backend to read the company and
// position off the page. Only fills fields the user hasn't touched — a picked
// sponsor or any typed value is never overwritten.
async function onJobUrlBlur() {
  const url = jobUrl.value.trim()
  if (!/^https?:\/\//i.test(url) || url === lastParsedUrl) return
  lastParsedUrl = url
  linkHint.value = ''
  parsingLink.value = true
  try {
    const r = await api.parseJobLink(url)
    const filled: string[] = []
    if (r.company && !sponsorCompanyId.value && !companyName.value.trim()) {
      companyName.value = r.company
      filled.push('company')
      // If the parsed name is in the IND register, link the sponsor so the
      // "IND sponsor" tag shows — the dropdown was bypassed here.
      const match = companiesStore.matchByName(r.company)
      if (match) {
        sponsorCompanyId.value = match.id
        selectedCompany.value  = match
      }
    }
    if (r.position && !position.value.trim()) {
      position.value = r.position
      filled.push('position')
    }
    if (r.locations?.length && locations.value.length === 0) {
      locations.value = r.locations.slice(0, 10)
      filled.push(r.locations.length > 1 ? 'locations' : 'location')
    }
    linkHint.value = filled.length
      ? `Filled ${filled.join(' and ')} from the link.`
      : 'Couldn’t read anything from that link.'
  } catch {
    linkHint.value = ''
  } finally {
    parsingLink.value = false
  }
}

async function submit() {
  error.value = ''
  if (!companyName.value.trim()) { error.value = 'Company name is required.'; return }
  if (!position.value.trim())    { error.value = 'Position is required.'; return }
  if (!appliedAt.value)          { error.value = 'Application date is required.'; return }
  const successRateNum = successRate.value === '' ? undefined : Number(successRate.value)
  if (successRateNum !== undefined && (successRateNum < 0 || successRateNum > 100)) {
    error.value = 'Success rate must be between 0 and 100.'; return
  }

  saving.value = true
  try {
    await store.create({
      companyName:       companyName.value.trim(),
      position:          position.value.trim(),
      appliedAt:         new Date(appliedAt.value).toISOString(),
      locations:         locations.value,
      sponsorCompanyId:  sponsorCompanyId.value,
      jobUrl:            jobUrl.value.trim() || undefined,
      successRate:       successRateNum,
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
        <h2 id="modal-title" class="modal-title">New application</h2>
        <button @click="requestClose" class="btn-icon" aria-label="Close">
          <AppIcon name="close" class="icon" />
        </button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label class="field-label" for="company-name">Company name <span class="required">*</span></label>
          <CompanyCombobox
            v-model="companyName"
            :suggestions="suggestions"
            input-id="company-name"
            @update:model-value="onCompanyInput"
            @select="selectCompany"
          />
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
              <button @click="removeLocation(l)" class="city-remove" aria-label="Remove"><AppIcon name="close" class="icon-1em" /></button>
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
          <label class="field-label" for="new-app-joburl">Job posting link or email <span class="optional">(optional)</span></label>
          <input
            id="new-app-joburl"
            v-model="jobUrl"
            type="text"
            class="field-input"
            placeholder="https://… or name@company.com"
            @blur="onJobUrlBlur"
          />
          <p v-if="parsingLink" class="link-hint" role="status">Reading the link…</p>
          <p v-else-if="linkHint" class="link-hint" role="status">{{ linkHint }}</p>
        </div>

        <div class="field">
          <label class="field-label" for="success-rate">Success rate <span class="optional">(optional)</span></label>
          <input
            id="success-rate"
            v-model="successRate"
            type="number"
            min="0"
            max="100"
            class="field-input"
            placeholder="e.g. 60"
          />
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
            {{ saving ? 'Saving…' : 'Add application' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Inside the one root element, not beside it: a component with two roots
         can't be animated by the <Transition> its parent wraps it in, so this
         modal used to appear and vanish with no transition at all. The dialog
         teleports to <body> and animates itself. -->
    <ConfirmDialog
      v-if="showDiscardConfirm"
      title="Discard application?"
      message="Your data will be lost."
      confirm-label="Discard"
      confirm-class="btn-danger"
      @confirm="emit('close')"
      @cancel="showDiscardConfirm = false"
    />
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: var(--col-overlay);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal {
  background: var(--col-bg); border-radius: var(--radius-lg); width: 100%; max-width: 480px;
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  max-height: 90vh;
  max-height: 90dvh; /* tracks the visible viewport, not the toolbar-collapsed one on iOS Chrome */
  overflow: hidden;
}
/* Phones: a sheet anchored to the bottom edge (it rises from there — see
   style.css), full width, with room for the home indicator */
@media (max-width: 767px) {
  .modal-backdrop { align-items: flex-end; padding: 0; }
  .modal { max-width: none; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border);
}
.modal-title { font-size: 1.125rem; font-weight: 600; color: var(--col-text); }
.modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; overscroll-behavior: contain; }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); }
.footer-actions { display: flex; gap: .75rem; justify-content: flex-end; }
/* Phones: two equal buttons across the sheet, primary on the thumb side */
@media (max-width: 767px) {
  .footer-actions > * { flex: 1 1 0; justify-content: center; }
  .modal-footer { padding-bottom: calc(1rem + env(safe-area-inset-bottom)); }
}
.field { display: flex; flex-direction: column; gap: .375rem; }
.required { color: var(--col-error); }
.optional { color: var(--col-subtle); font-weight: 400; text-transform: none; font-size: .7rem; }
.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.mb-2 { margin-bottom: .5rem; }
.city-chip { display: inline-flex; align-items: center; gap: .25rem; background: var(--col-raised); border-radius: 9999px; padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted); }
.city-remove { background: none; border: none; cursor: pointer; color: var(--col-subtle); font-size: 1rem; line-height: 1; padding: 0; }
.city-remove:hover { color: var(--col-error); }
.save-error { color: var(--col-error); font-size: .875rem; margin-bottom: .5rem; }
.link-hint { font-size: .75rem; color: var(--col-subtle); margin-top: .125rem; }
.dup-warning {
  margin: 0 1.5rem;
  padding: .5rem .75rem;
  font-size: .8125rem;
  background: var(--col-accent-lt);
  border: 1px solid color-mix(in srgb, var(--col-accent) 35%, transparent);
  color: var(--col-accent-dk);
  border-radius: var(--radius);
}
.icon { width: 1.25rem; height: 1.25rem; }

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
