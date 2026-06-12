<script setup lang="ts">
import { ref } from 'vue'
import { useApplicationsStore } from '../../stores/applications'

const props = defineProps<{ prefillCompany?: string }>()
const emit  = defineEmits<{ close: [] }>()

const store = useApplicationsStore()

const companyName  = ref(props.prefillCompany ?? '')
const position     = ref('')
const appliedAt    = ref(new Date().toISOString().slice(0, 10))
const locationInput = ref('')
const locations    = ref<string[]>([])
const saving       = ref(false)
const error        = ref('')

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
      companyName:  companyName.value.trim(),
      position:     position.value.trim(),
      appliedAt:    new Date(appliedAt.value).toISOString(),
      locations:    locations.value,
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
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">New Application</h2>
        <button @click="$emit('close')" class="btn-icon" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label class="field-label" for="company-name">Company name <span class="required">*</span></label>
          <input id="company-name" v-model="companyName" class="field-input" placeholder="e.g. Acme B.V." />
        </div>

        <div class="field">
          <label class="field-label" for="position">Position <span class="required">*</span></label>
          <input id="position" v-model="position" class="field-input" placeholder="e.g. Senior Backend Engineer" />
        </div>

        <div class="field">
          <label class="field-label" for="applied-at">Application date <span class="required">*</span></label>
          <input id="applied-at" v-model="appliedAt" type="date" class="field-input" />
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
      </div>

      <div class="modal-footer">
        <p v-if="error" class="save-error">{{ error }}</p>
        <div class="footer-actions">
          <button @click="$emit('close')" class="btn-secondary">Cancel</button>
          <button @click="submit" :disabled="saving" class="btn-primary">
            {{ saving ? 'Saving…' : 'Add Application' }}
          </button>
        </div>
      </div>
    </div>
  </div>
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
  max-height: 90vh; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border);
}
.modal-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); }
.modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; }
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
.icon { width: 1.25rem; height: 1.25rem; }
.btn-secondary { background: var(--col-bg); color: var(--col-muted); border: 1px solid var(--col-border); border-radius: .375rem; padding: .5rem 1.25rem; font-size: .875rem; cursor: pointer; }
.btn-secondary:hover { background: var(--col-surface); }
</style>
