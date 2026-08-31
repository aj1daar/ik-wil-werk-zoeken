<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import { STATUS_LABELS, STATUS_COLOR } from '../../stores/applications'
import type { Application, SponsorCompany } from '../../api'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'

const props = defineProps<{
  company:      SponsorCompany
  application:  Application | null
  isAdmin:      boolean
  isHidden:     boolean
  isInterested: boolean
}>()
const emit = defineEmits<{
  close: []
  'start-application': []
  'toggle-hidden': []
  'toggle-interested': []
}>()

const store = useCompaniesStore()
useBodyScrollLock()

// ── admin edit form ─────────────────────────────────────────────────────────

type ChipField = 'locations' | 'techStackTags' | 'functionalTags'

const chipFields: { field: ChipField; label: string; placeholder: string }[] = [
  { field: 'locations',      label: 'Other locations', placeholder: 'Add a location and press Enter…' },
  { field: 'techStackTags',  label: 'Tech-stack tags', placeholder: 'Add a tag and press Enter…' },
  { field: 'functionalTags', label: 'Functional tags', placeholder: 'Add a tag and press Enter…' },
]

function blankForm() {
  return {
    summary: '', city: '', websiteUrl: '',
    coreIndustry: '', workingLanguage: '', companySize: '', remotePolicy: '',
    targetMarket: '', parentCompanyName: '',
    locations: [] as string[], techStackTags: [] as string[], functionalTags: [] as string[],
  }
}

const editing    = ref(false)
const savingEdit = ref(false)
const editError  = ref('')
const form       = reactive(blankForm())
const chipInput  = reactive<Record<ChipField, string>>({ locations: '', techStackTags: '', functionalTags: '' })

watch(() => props.company.id, () => { editing.value = false; editError.value = '' })

function requestClose() {
  if (!savingEdit.value) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') requestClose()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function startEdit() {
  const c = props.company
  Object.assign(form, blankForm(), {
    summary:           c.summary ?? '',
    city:              c.city ?? '',
    websiteUrl:        c.websiteUrl ?? '',
    coreIndustry:      c.coreIndustry ?? '',
    workingLanguage:   c.workingLanguage ?? '',
    companySize:       c.companySize ?? '',
    remotePolicy:      c.remotePolicy ?? '',
    targetMarket:      c.targetMarket ?? '',
    parentCompanyName: c.parentCompanyName ?? '',
    locations:         [...(c.locations ?? [])],
    techStackTags:     [...(c.techStackTags ?? [])],
    functionalTags:    [...(c.functionalTags ?? [])],
  })
  chipInput.locations = chipInput.techStackTags = chipInput.functionalTags = ''
  editError.value = ''
  editing.value   = true
}

function cancelEdit() {
  editing.value   = false
  editError.value = ''
}

function addChip(field: ChipField, raw: string) {
  const v = raw.trim()
  if (v && !form[field].some(x => x.toLowerCase() === v.toLowerCase())) form[field].push(v)
  chipInput[field] = ''
}

function removeChip(field: ChipField, i: number) {
  form[field].splice(i, 1)
}

function onChipKey(e: KeyboardEvent, field: ChipField) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(field, chipInput[field]) }
}

async function saveEdit() {
  // Fold any half-typed chip text in so a user who typed a tag but didn't press
  // Enter doesn't silently lose it.
  ;(['locations', 'techStackTags', 'functionalTags'] as ChipField[])
    .forEach(f => { if (chipInput[f].trim()) addChip(f, chipInput[f]) })

  savingEdit.value = true
  editError.value  = ''
  try {
    await store.updateCompany(props.company.id, {
      summary:           form.summary.trim()           || null,
      city:              form.city.trim()              || null,
      websiteUrl:        form.websiteUrl.trim()         || null,
      coreIndustry:      form.coreIndustry.trim()       || null,
      workingLanguage:   form.workingLanguage.trim()    || null,
      companySize:       form.companySize.trim()        || null,
      remotePolicy:      form.remotePolicy.trim()       || null,
      targetMarket:      form.targetMarket.trim()       || null,
      parentCompanyName: form.parentCompanyName.trim()  || null,
      locations:         form.locations.length      ? [...form.locations]      : null,
      techStackTags:     form.techStackTags.length   ? [...form.techStackTags]  : null,
      functionalTags:    form.functionalTags.length  ? [...form.functionalTags] : null,
    })
    editing.value = false
  } catch (e: unknown) {
    editError.value = e instanceof Error ? e.message : 'Failed to save. Please try again.'
  } finally {
    savingEdit.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="requestClose">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="company-modal-title">
      <div class="modal-header">
        <div class="modal-title-block">
          <h2 id="company-modal-title" class="modal-title">{{ company.name }}</h2>
          <p class="modal-subtitle">
            <span v-if="company.city">{{ company.city }} · </span>
            KvK {{ company.kvKNumber }}
            <template v-if="company.websiteUrl">
              · <a :href="company.websiteUrl" target="_blank" rel="noopener noreferrer" class="subtitle-link">
                website
                <svg xmlns="http://www.w3.org/2000/svg" class="ext-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </template>
          </p>
        </div>
        <div class="modal-header-actions">
          <button
            v-if="!editing"
            type="button"
            :class="['star-btn', { 'star-btn--on': isInterested }]"
            :aria-pressed="isInterested"
            :title="isInterested ? 'Remove from interested' : 'Add to interested'"
            @click="emit('toggle-interested')"
          >{{ isInterested ? '★' : '☆' }}</button>
          <button v-if="isAdmin && !editing" type="button" class="panel-edit-btn" @click="startEdit">Edit</button>
          <button @click="requestClose" class="btn-icon" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="application" class="field">
          <label class="field-label">Your application</label>
          <div class="applied-badge-row">
            <span :class="['status-chip', STATUS_COLOR[application.status]]">{{ STATUS_LABELS[application.status] }}</span>
            <span class="applied-position">{{ application.position }}</span>
          </div>
        </div>

        <!-- ── read-only view ──────────────────────────────────────────────── -->
        <template v-if="!editing">
          <div
            v-if="company.workingLanguage || company.remotePolicy || company.companySize || company.targetMarket || company.parentCompanyName"
            class="field"
          >
            <label class="field-label">Details</label>
            <div class="meta-chips">
              <span v-if="company.workingLanguage" class="meta-chip meta-chip--lang">{{ company.workingLanguage }}</span>
              <span v-if="company.remotePolicy" class="meta-chip meta-chip--remote">{{ company.remotePolicy }}</span>
              <span v-if="company.companySize" class="meta-chip meta-chip--size">{{ company.companySize }}</span>
              <span v-if="company.targetMarket" class="meta-chip meta-chip--market">{{ company.targetMarket }}</span>
              <span v-if="company.parentCompanyName" class="meta-chip meta-chip--parent" :title="`Part of ${company.parentCompanyName}`">↑ {{ company.parentCompanyName }}</span>
            </div>
          </div>

          <div v-if="company.locations?.length" class="field">
            <label class="field-label">Other locations</label>
            <div class="tag-row">
              <span v-for="l in company.locations" :key="l" class="tag--muted">{{ l }}</span>
            </div>
          </div>

          <div v-if="company.summary || isAdmin" class="field">
            <label class="field-label">About</label>
            <p v-if="company.summary" class="body-text">{{ company.summary }}</p>
            <p v-else class="body-text body-text--empty">No description yet.</p>
          </div>

          <div v-if="company.coreIndustry || (company.techStackTags?.length || company.functionalTags?.length)" class="field">
            <label class="field-label">Tags</label>
            <div class="tag-row">
              <span v-if="company.coreIndustry" class="tag">{{ company.coreIndustry }}</span>
              <span v-for="t in company.techStackTags" :key="t" class="tag--muted">{{ t }}</span>
              <span v-for="t in company.functionalTags" :key="t" class="tag--muted">{{ t }}</span>
            </div>
          </div>
        </template>

        <!-- ── admin edit form ─────────────────────────────────────────────── -->
        <template v-else>
          <div class="field">
            <label class="field-label" for="ce-summary">About</label>
            <textarea
              id="ce-summary"
              v-model="form.summary"
              class="field-input summary-textarea"
              rows="4"
              maxlength="2000"
              placeholder="Write a short description of this company…"
            />
          </div>

          <div class="ce-grid">
            <div class="field">
              <label class="field-label" for="ce-city">City</label>
              <input id="ce-city" v-model="form.city" class="field-input" maxlength="200" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-website">Website URL</label>
              <input id="ce-website" v-model="form.websiteUrl" type="url" class="field-input" placeholder="https://…" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-lang">Working language</label>
              <input id="ce-lang" v-model="form.workingLanguage" class="field-input" maxlength="200" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-size">Company size</label>
              <input id="ce-size" v-model="form.companySize" class="field-input" maxlength="200" placeholder="startup / scaleup / mid / large / enterprise" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-remote">Remote policy</label>
              <input id="ce-remote" v-model="form.remotePolicy" class="field-input" maxlength="200" placeholder="remote / hybrid / office" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-market">Target market</label>
              <input id="ce-market" v-model="form.targetMarket" class="field-input" maxlength="200" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-parent">Parent company</label>
              <input id="ce-parent" v-model="form.parentCompanyName" class="field-input" maxlength="200" />
            </div>
            <div class="field">
              <label class="field-label" for="ce-industry">Core industry</label>
              <input id="ce-industry" v-model="form.coreIndustry" class="field-input" maxlength="200" />
            </div>
          </div>

          <div v-for="chip in chipFields" :key="chip.field" class="field">
            <label class="field-label">{{ chip.label }}</label>
            <div v-if="form[chip.field].length" class="tag-row ce-chip-row">
              <span v-for="(v, i) in form[chip.field]" :key="v" class="city-chip">
                {{ v }}
                <button type="button" class="city-remove" :aria-label="`Remove ${v}`" @click="removeChip(chip.field, i)">×</button>
              </span>
            </div>
            <input
              v-model="chipInput[chip.field]"
              class="field-input"
              :placeholder="chip.placeholder"
              @keydown="onChipKey($event, chip.field)"
              @blur="addChip(chip.field, chipInput[chip.field])"
            />
          </div>

          <p v-if="editError" class="summary-error" role="alert">{{ editError }}</p>
        </template>
      </div>

      <div class="modal-footer">
        <template v-if="editing">
          <button type="button" class="btn-ghost" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
          <button type="button" class="btn-primary footer-primary" :disabled="savingEdit" @click="saveEdit">
            {{ savingEdit ? 'Saving…' : 'Save changes' }}
          </button>
        </template>
        <template v-else>
          <a
            v-if="company.websiteUrl"
            :href="company.websiteUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-ghost footer-website"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Visit website
          </a>
          <button @click="emit('toggle-hidden')" class="btn-hide-company">
            {{ isHidden ? 'Unhide' : 'Not interested' }}
          </button>
          <button @click="emit('start-application')" class="btn-primary footer-primary">
            {{ application ? 'Add Another Application' : 'Start Application' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; z-index: 50;
  padding: 1rem;
}
.modal {
  background: var(--col-bg); border-radius: .75rem; width: 100%; max-width: 560px;
  box-shadow: 0 8px 32px color-mix(in srgb, var(--col-text) 12%, transparent),
              0 24px 64px color-mix(in srgb, var(--col-text) 16%, transparent);
  display: flex; flex-direction: column;
  max-height: 90vh;
  max-height: 90dvh;
  overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--col-border); gap: 1rem;
}
.modal-title-block { flex: 1; min-width: 0; }
.modal-title { font-size: 1.125rem; font-weight: 700; color: var(--col-text); }
.modal-subtitle { font-size: .75rem; color: var(--col-subtle); margin-top: .125rem; }
.subtitle-link { color: var(--col-accent); text-decoration: none; display: inline-flex; align-items: center; gap: .15rem; }
.subtitle-link:hover { text-decoration: underline; }
.ext-icon { width: .7rem; height: .7rem; }
.modal-header-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
.panel-edit-btn {
  background: none; border: 1px solid var(--col-border); cursor: pointer;
  color: var(--col-accent); font-size: .72rem; font-weight: 600;
  padding: .25rem .6rem; border-radius: .375rem;
  text-transform: uppercase; letter-spacing: .05em;
}
.panel-edit-btn:hover { background: var(--col-raised); }
.star-btn {
  background: none; border: 1px solid var(--col-border); cursor: pointer;
  color: var(--col-subtle); font-size: 1rem; line-height: 1;
  padding: .15rem .4rem; border-radius: .375rem;
}
.star-btn:hover { background: var(--col-raised); color: #f59e0b; }
.star-btn--on { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 45%, transparent); }
.icon { width: 1.25rem; height: 1.25rem; }

.modal-body {
  padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem;
  overflow-y: auto; overscroll-behavior: contain;
}
.body-text { font-size: .875rem; color: var(--col-muted); line-height: 1.6; }
.body-text--empty { font-style: italic; color: var(--col-subtle); }

.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--col-border); display: flex; gap: .625rem; flex-wrap: wrap; }
.footer-primary { flex: 1; min-width: 140px; }
.footer-website { display: inline-flex; align-items: center; gap: .3rem; font-size: .875rem; white-space: nowrap; flex-shrink: 0; }
.btn-icon-sm { width: .9rem; height: .9rem; }
.btn-hide-company {
  background: none; border: 1px solid var(--col-border); color: var(--col-muted);
  border-radius: .375rem; padding: .45rem .875rem; font-size: .8rem; cursor: pointer;
  flex-shrink: 0; white-space: nowrap;
}
.btn-hide-company:hover { background: var(--col-raised); color: var(--col-error); }

.field { display: flex; flex-direction: column; gap: .375rem; }
.field-label { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--col-subtle); }

.applied-badge-row { display: flex; align-items: center; gap: .5rem; }
.applied-position { font-size: .8rem; color: var(--col-muted); }

.status-chip { display: inline-block; padding: .15rem .5rem; border-radius: 9999px; font-size: .7rem; font-weight: 600; white-space: nowrap; }
.chip-applied     { background: #dbeafe; color: #1e40af; }
.chip-interview   { background: #ede9fe; color: #5b21b6; }
.chip-offer       { background: #d1fae5; color: #065f46; }
.chip-hold        { background: #fef3c7; color: #92400e; }
.chip-rejected    { background: #fee2e2; color: #991b1b; }
.chip-withdrawn   { background: var(--col-raised); color: var(--col-muted); }
.chip-accepted    { background: #bbf7d0; color: #14532d; }

.meta-chips { display: flex; flex-wrap: wrap; gap: .375rem; }
.meta-chip {
  display: inline-flex; align-items: center;
  padding: .2rem .6rem; border-radius: 9999px; font-size: .72rem; font-weight: 500;
  background: var(--col-raised); color: var(--col-muted); border: 1px solid var(--col-border);
}
.meta-chip--lang   { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #1d4ed8; border-color: color-mix(in srgb, #3b82f6 25%, transparent); }
.meta-chip--remote { background: color-mix(in srgb, #10b981 12%, transparent); color: #065f46; border-color: color-mix(in srgb, #10b981 25%, transparent); }
.meta-chip--size   { background: color-mix(in srgb, #f59e0b 12%, transparent); color: #92400e; border-color: color-mix(in srgb, #f59e0b 25%, transparent); }
.meta-chip--market { background: color-mix(in srgb, #8b5cf6 12%, transparent); color: #4c1d95; border-color: color-mix(in srgb, #8b5cf6 25%, transparent); }
.meta-chip--parent { background: var(--col-subtle); color: var(--col-muted); font-style: italic; }

.tag-row { display: flex; flex-wrap: wrap; gap: .375rem; }
.tag { background: var(--col-accent-lt); color: var(--col-accent-dk); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 500; }
.tag--muted { background: var(--col-raised); color: var(--col-muted); padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; }

.summary-textarea { resize: vertical; width: 100%; font-family: inherit; }
.summary-error { color: var(--col-error); font-size: .8rem; margin: 0; }
.ce-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
@media (max-width: 520px) { .ce-grid { grid-template-columns: 1fr; } }
.ce-chip-row { margin-bottom: .375rem; }
.city-chip {
  display: inline-flex; align-items: center; gap: .25rem;
  background: var(--col-raised); border-radius: 9999px;
  padding: .2rem .6rem; font-size: .8rem; color: var(--col-muted);
}
.city-remove { background: none; border: none; cursor: pointer; color: var(--col-subtle); font-size: 1rem; line-height: 1; padding: 0; }
.city-remove:hover { color: var(--col-error); }
</style>
