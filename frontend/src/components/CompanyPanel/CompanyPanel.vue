<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useCompaniesStore, STATUSES } from '../../stores/companies'
import type { CompanyRow } from '../../stores/companies'

const props = defineProps<{ company: CompanyRow }>()
const emit  = defineEmits<{ close: [] }>()

const store = useCompaniesStore()

const status         = ref(props.company.record?.status ?? 'Bookmarked')
const notes          = ref(props.company.record?.notes ?? '')
const contactName    = ref(props.company.record?.contactPersonName ?? '')
const contactEmail   = ref(props.company.record?.contactPersonEmail ?? '')
const cities         = ref<string[]>([...(props.company.record?.cities ?? [])])
const cityInput      = ref('')
const saving         = ref(false)
const saveError      = ref('')

watch(() => props.company, (c) => {
  status.value       = c.record?.status ?? 'Bookmarked'
  notes.value        = c.record?.notes ?? ''
  contactName.value  = c.record?.contactPersonName ?? ''
  contactEmail.value = c.record?.contactPersonEmail ?? ''
  cities.value       = [...(c.record?.cities ?? [])]
  saveError.value    = ''
}, { immediate: false })

const isTracked = computed(() => !!props.company.record)
const allTags   = computed(() => [
  ...(props.company.techStackTags ?? []),
  ...(props.company.functionalTags ?? [])
])

function addCity() {
  const c = cityInput.value.trim()
  if (c && !cities.value.includes(c)) cities.value.push(c)
  cityInput.value = ''
}

function removeCity(c: string) { cities.value = cities.value.filter(x => x !== c) }

function onCityKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCity() }
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await store.upsertRecord(props.company.id, {
      status: status.value,
      notes: notes.value || undefined,
      contactPersonName: contactName.value || undefined,
      contactPersonEmail: contactEmail.value || undefined,
      cities: cities.value
    })
  } catch {
    saveError.value = 'Save failed. Please try again.'
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!isTracked.value) return
  await store.removeRecord(props.company.id)
  emit('close')
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <div class="panel-title-block">
        <h2 class="panel-title">{{ company.name }}</h2>
        <p class="panel-subtitle">KvK {{ company.kvKNumber }}</p>
      </div>
      <button @click="$emit('close')" class="btn-icon" aria-label="Close panel">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="panel-body">
      <div class="field">
        <label class="field-label">Status</label>
        <select v-model="status" class="field-input">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div v-if="company.summary" class="field">
        <label class="field-label">About</label>
        <p class="panel-body-text">{{ company.summary }}</p>
        <p class="ai-notice">AI-generated summary by Google Gemini. May contain errors.</p>
      </div>

      <div v-if="company.coreIndustry || allTags.length" class="field">
        <label class="field-label">Tags</label>
        <div class="tag-row">
          <span v-if="company.coreIndustry" class="tag">{{ company.coreIndustry }}</span>
          <span v-for="t in allTags" :key="t" class="tag--muted">{{ t }}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Cities</label>
        <div class="tag-row mb-2">
          <span v-for="c in cities" :key="c" class="city-chip">
            {{ c }}
            <button @click="removeCity(c)" class="city-remove" aria-label="Remove city">×</button>
          </span>
        </div>
        <input v-model="cityInput" @keydown="onCityKey" @blur="addCity" placeholder="Type city and press Enter…" class="field-input" />
      </div>

      <div class="field">
        <label class="field-label">Notes</label>
        <textarea v-model="notes" rows="4" placeholder="Personal notes about this company…" class="field-input notes-textarea" />
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
        <button @click="save" :disabled="saving" class="btn-primary footer-primary">
          {{ saving ? 'Saving…' : isTracked ? 'Save changes' : 'Start tracking' }}
        </button>
        <button v-if="isTracked" @click="remove" class="btn-danger">Remove</button>
      </div>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
