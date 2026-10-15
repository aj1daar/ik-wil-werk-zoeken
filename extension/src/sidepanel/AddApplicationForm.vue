<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@app/components/ui/AppIcon.vue'
import DatePicker from '@app/components/DatePicker/DatePicker.vue'
import CompanyCombobox, { type CompanyOption } from '@app/components/CompanyCombobox/CompanyCombobox.vue'
import { api, type ApplicationSummary, type ParsedJobLink, type SponsorMatch } from '../lib/api'
import { findOpenApplication } from '../lib/duplicates'

// The app's new-application form, in a side panel. Same six fields, same order,
// same controls — what the link gave us is filled in and every one of them is
// still editable, because a parsed company name is a guess.
const props = defineProps<{
  jobUrl: string
  parsed: ParsedJobLink | null
  applications: readonly ApplicationSummary[]
}>()

const emit = defineEmits<{ saved: [ApplicationSummary]; unauthorized: [] }>()

const today = () => new Date().toISOString().slice(0, 10)

const companyName      = ref(props.parsed?.company ?? '')
const sponsorCompanyId = ref<string | undefined>(undefined)
const position         = ref(props.parsed?.position ?? '')
const appliedAt        = ref(today())
const locations        = ref<string[]>(props.parsed?.locations?.slice(0, 10) ?? [])
const locationInput    = ref('')
const jobUrl           = ref(props.jobUrl)
const successRate      = ref('')

const suggestions = ref<CompanyOption[]>([])
const sponsor     = ref<SponsorMatch | null>(null)
// Which spelling the verdict below belongs to. Without it, a verdict for "Acme"
// would sit under a field that now reads "Acme Hold" and claim to be about it.
const verdictFor  = ref<string | null>(null)
const focused     = ref(false)
const saving      = ref(false)
const error       = ref('')

let debounce: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (debounce) clearTimeout(debounce) })

const trimmedName = computed(() => companyName.value.trim())

// Shown once the lookup for the name actually in the field has come back and the
// user has moved on, so it never contradicts what they are still typing.
const showVerdict = computed(() =>
  !focused.value && trimmedName.value.length > 0 && verdictFor.value === trimmedName.value)

const duplicate = computed(() =>
  findOpenApplication(props.applications, companyName.value, sponsorCompanyId.value))

// One request answers both questions: `matches` fills the dropdown, `exact` says
// whether the register recognises this company today.
//
// `offer` is false for the name the parser read: that name is already in the
// field, so a list dropping open over the next control would be answering a
// question nobody asked. Typing is what opens it.
async function lookup(query: string, offer = true) {
  try {
    const result = await api.lookupSponsors(query)
    // A slow answer to an older query must not overwrite the field's current state.
    if (query !== trimmedName.value) return
    if (offer) suggestions.value = result.matches
    sponsor.value    = result.exact
    verdictFor.value = query
  } catch (e) {
    if (e instanceof Error && e.message.includes('session')) emit('unauthorized')
    if (offer) suggestions.value = []
  }
}

function onCompanyInput(value: string) {
  sponsorCompanyId.value = undefined
  sponsor.value          = null
  verdictFor.value       = null

  if (debounce) clearTimeout(debounce)
  const query = value.trim()
  if (query.length === 0) { suggestions.value = []; return }
  debounce = setTimeout(() => void lookup(query), 300)
}

function selectCompany(company: CompanyOption) {
  companyName.value      = company.name
  sponsorCompanyId.value = company.id
  sponsor.value          = company as SponsorMatch
  verdictFor.value       = company.name
  suggestions.value      = []
  if (debounce) clearTimeout(debounce)

  if (company.city && !locations.value.includes(company.city)) {
    locations.value = [company.city, ...locations.value]
  }
}

// A company the parser read off the page never went through the dropdown, so it
// needs the same lookup to earn a verdict and a sponsor link.
watch(() => props.parsed?.company, name => {
  const query = (name ?? '').trim()
  if (query.length === 0) return
  companyName.value = query
  void lookup(query, false).then(() => {
    if (sponsor.value && sponsor.value.name === companyName.value) {
      sponsorCompanyId.value = sponsor.value.id
    }
  })
}, { immediate: true })

function addLocation() {
  const value = locationInput.value.trim()
  if (value && !locations.value.includes(value)) locations.value.push(value)
  locationInput.value = ''
}

function removeLocation(value: string) {
  locations.value = locations.value.filter(l => l !== value)
}

function onLocationKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addLocation() }
}

async function submit() {
  error.value = ''
  if (!trimmedName.value)     { error.value = 'Company name is required.'; return }
  if (!position.value.trim()) { error.value = 'Position is required.'; return }
  if (!appliedAt.value)       { error.value = 'Application date is required.'; return }

  const rate = successRate.value === '' ? undefined : Number(successRate.value)
  if (rate !== undefined && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
    error.value = 'Success rate must be between 0 and 100.'
    return
  }

  saving.value = true
  try {
    const saved = await api.createApplication({
      companyName:      trimmedName.value,
      position:         position.value.trim(),
      appliedAt:        new Date(appliedAt.value).toISOString(),
      locations:        locations.value,
      sponsorCompanyId: sponsorCompanyId.value,
      jobUrl:           jobUrl.value.trim() || undefined,
      successRate:      rate,
    })
    emit('saved', saved)
  } catch (e) {
    if (e instanceof Error && e.message.includes('session')) { emit('unauthorized'); return }
    error.value = e instanceof Error ? e.message : 'Could not save. Try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="panel-form" @submit.prevent="submit">
    <div class="field">
      <label class="field-label" for="panel-company">Company name <span class="required">*</span></label>
      <CompanyCombobox
        v-model="companyName"
        :suggestions="suggestions"
        input-id="panel-company"
        @update:model-value="onCompanyInput"
        @select="selectCompany"
        @focusin="focused = true"
        @focusout="focused = false"
      />
      <p v-if="showVerdict && sponsor" class="verdict verdict--sponsor">
        <AppIcon name="check" class="verdict-icon" />
        <span>HSM sponsor<template v-if="sponsor.city">, {{ sponsor.city }}</template></span>
      </p>
      <p v-else-if="showVerdict" class="verdict verdict--none">
        <AppIcon name="info" class="verdict-icon" />
        Not in the IND register, so this company cannot hire on an HSM permit.
      </p>
    </div>

    <div class="field">
      <label class="field-label" for="panel-position">Position <span class="required">*</span></label>
      <input id="panel-position" v-model="position" class="field-input" placeholder="e.g. Senior Backend Engineer" />
    </div>

    <div class="field">
      <label class="field-label" for="panel-date">Application date <span class="required">*</span></label>
      <DatePicker id="panel-date" v-model="appliedAt" placeholder="Select date" />
    </div>

    <div class="field">
      <label class="field-label" for="panel-location">Locations <span class="optional">(optional)</span></label>
      <div v-if="locations.length" class="tag-row">
        <span v-for="l in locations" :key="l" class="city-chip">
          {{ l }}
          <button type="button" class="city-remove" :aria-label="`Remove ${l}`" @click="removeLocation(l)">
            <AppIcon name="close" class="icon-1em" />
          </button>
        </span>
      </div>
      <input
        id="panel-location"
        v-model="locationInput"
        class="field-input"
        placeholder="Type a city and press Enter…"
        @keydown="onLocationKey"
        @blur="addLocation"
      />
    </div>

    <div class="field">
      <label class="field-label" for="panel-url">Job posting link <span class="optional">(optional)</span></label>
      <input id="panel-url" v-model="jobUrl" class="field-input" placeholder="https://…" />
    </div>

    <div class="field">
      <label class="field-label" for="panel-rate">Success rate <span class="optional">(optional)</span></label>
      <input id="panel-rate" v-model="successRate" type="number" min="0" max="100" class="field-input" placeholder="e.g. 60" />
    </div>

    <p v-if="duplicate" class="dup-warning" role="status" aria-live="polite">
      You already have an open application to <strong>{{ duplicate.companyName }}</strong>
      for {{ duplicate.position }}. You can still add this one.
    </p>

    <p v-if="error" class="save-error" role="alert">{{ error }}</p>

    <button type="submit" class="btn-primary panel-submit" :disabled="saving">
      {{ saving ? 'Saving…' : 'Add application' }}
    </button>
  </form>
</template>

<style scoped>
.panel-form { display: flex; flex-direction: column; gap: 1rem; }

.field { display: flex; flex-direction: column; gap: .375rem; }
.required { color: var(--col-error); }
.optional { color: var(--col-subtle); font-weight: 400; text-transform: none; font-size: .7rem; }

.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.city-chip {
  display: inline-flex; align-items: center; gap: .25rem;
  background: var(--col-raised); border-radius: 9999px;
  padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted);
}
.city-remove { background: none; border: none; cursor: pointer; color: var(--col-subtle); padding: 0; line-height: 1; }
.city-remove:hover { color: var(--col-error); }

.verdict { display: flex; align-items: center; gap: .375rem; font-size: .75rem; margin: 0; }
.verdict--sponsor { color: var(--col-accent-dk); }
.verdict--none    { color: var(--col-warning); }
.verdict-icon { width: .875rem; height: .875rem; flex: none; }

.dup-warning {
  padding: .5rem .75rem; font-size: .8125rem; border-radius: var(--radius);
  background: var(--col-accent-lt);
  border: 1px solid color-mix(in srgb, var(--col-accent) 35%, transparent);
  color: var(--col-accent-dk);
}

.save-error { color: var(--col-error); font-size: .875rem; margin: 0; }

.panel-submit { width: 100%; justify-content: center; }
</style>
