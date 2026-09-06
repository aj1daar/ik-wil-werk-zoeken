<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCompaniesStore } from '../../stores/companies'
import { STATUS_LABELS, STATUS_COLOR } from '../../stores/applications'
import { api, type Application, type SponsorCompany } from '../../api'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog.vue'

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
    name: '', summary: '', city: '', websiteUrl: '',
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
    name:              c.name,
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

  const name = form.name.trim()
  if (!name) {
    editError.value = 'Name is required.'
    return
  }

  savingEdit.value = true
  editError.value  = ''
  try {
    await store.updateCompany(props.company.id, {
      name,
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

// ── admin merge ─────────────────────────────────────────────────────────────

const mergeQuery       = ref('')
const mergeStaged      = ref<SponsorCompany[]>([])
const merging          = ref(false)
const mergeError       = ref('')
const mergeNotice      = ref('')
const showMergeConfirm = ref(false)
const mergedCompanies  = ref<SponsorCompany[]>([])
const unmergingId      = ref<string | null>(null)

// Live companies matching the search box, minus this company and anything the
// admin already staged for the merge.
const mergeResults = computed<SponsorCompany[]>(() => {
  const q = mergeQuery.value.trim()
  if (q.length < 2) return []
  const staged = new Set(mergeStaged.value.map(c => c.id))
  return store.search(q)
    .filter(c => c.id !== props.company.id && !staged.has(c.id))
    .slice(0, 8)
})

async function loadMerged() {
  if (!props.isAdmin) return
  try {
    mergedCompanies.value = (await api.adminGetMergedCompanies(props.company.id)) ?? []
  } catch {
    mergedCompanies.value = []
  }
}

function stageForMerge(company: SponsorCompany) {
  if (!mergeStaged.value.some(c => c.id === company.id)) mergeStaged.value.push(company)
  mergeQuery.value = ''
  mergeError.value = ''
}

function unstageFromMerge(id: string) {
  mergeStaged.value = mergeStaged.value.filter(c => c.id !== id)
}

function resetMerge() {
  mergeQuery.value       = ''
  mergeStaged.value      = []
  mergeError.value       = ''
  showMergeConfirm.value = false
}

async function confirmMerge() {
  showMergeConfirm.value = false
  if (mergeStaged.value.length === 0) return

  merging.value     = true
  mergeError.value  = ''
  mergeNotice.value = ''
  try {
    const result = await store.mergeCompanies(props.company.id, mergeStaged.value.map(c => c.id))
    mergeStaged.value = []
    mergeQuery.value  = ''
    const moved = result.movedApplications
    const lists = result.movedListEntries + result.droppedListEntries
    mergeNotice.value =
      `${result.message} ${moved} application${moved === 1 ? '' : 's'} and ` +
      `${lists} list entr${lists === 1 ? 'y' : 'ies'} moved across.`
    await loadMerged()
  } catch (e: unknown) {
    mergeError.value = e instanceof Error ? e.message : 'Merge failed. Please try again.'
  } finally {
    merging.value = false
  }
}

async function unmerge(id: string) {
  unmergingId.value = id
  mergeError.value  = ''
  mergeNotice.value = ''
  try {
    const restored = await store.unmergeCompany(id)
    mergeNotice.value = `${restored.name} is a separate company again.`
    await loadMerged()
  } catch (e: unknown) {
    mergeError.value = e instanceof Error ? e.message : 'Unmerge failed. Please try again.'
  } finally {
    unmergingId.value = null
  }
}

watch(() => props.company.id, () => { resetMerge(); mergeNotice.value = ''; loadMerged() })
onMounted(loadMerged)
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

          <div v-if="isAdmin && company.aliasNames?.length" class="field">
            <label class="field-label">Also known as</label>
            <div class="tag-row">
              <span v-for="a in company.aliasNames" :key="a" class="tag--muted">{{ a }}</span>
            </div>
          </div>

          <!-- admin merge panel -->
          <div v-if="isAdmin" class="field merge-panel">
            <label class="field-label" for="ce-merge-search">Merge duplicates into this company</label>
            <p class="field-hint">
              The companies you pick disappear from the register and their names become aliases of
              {{ company.name }}. Applications and everyone's lists move across. This can be undone.
            </p>

            <div v-if="mergeStaged.length" class="tag-row ce-chip-row">
              <span v-for="c in mergeStaged" :key="c.id" class="city-chip">
                {{ c.name }}
                <button type="button" class="city-remove" :aria-label="`Remove ${c.name}`" @click="unstageFromMerge(c.id)">&times;</button>
              </span>
            </div>

            <input
              id="ce-merge-search"
              v-model="mergeQuery"
              class="field-input"
              placeholder="Search a duplicate by name…"
              autocomplete="off"
              :disabled="merging"
            />

            <ul v-if="mergeResults.length" class="merge-results">
              <li v-for="c in mergeResults" :key="c.id">
                <button type="button" class="merge-result" @click="stageForMerge(c)">
                  <span class="merge-result-name">{{ c.name }}</span>
                  <span class="merge-result-meta">{{ c.city || 'Unknown city' }} · KvK {{ c.kvKNumber }}</span>
                </button>
              </li>
            </ul>
            <p v-else-if="mergeQuery.trim().length >= 2" class="field-hint">No other company matches that.</p>

            <button
              v-if="mergeStaged.length"
              type="button"
              class="btn-danger merge-submit"
              :disabled="merging"
              @click="showMergeConfirm = true"
            >
              {{ merging ? 'Merging…' : `Merge ${mergeStaged.length} ${mergeStaged.length === 1 ? 'company' : 'companies'}` }}
            </button>

            <div v-if="mergedCompanies.length" class="merged-list">
              <label class="field-label">Merged into this company</label>
              <ul class="merge-results">
                <li v-for="c in mergedCompanies" :key="c.id" class="merged-row">
                  <span class="merge-result-name">{{ c.name }}</span>
                  <button
                    type="button"
                    class="btn-list merge-undo"
                    :disabled="unmergingId === c.id"
                    @click="unmerge(c.id)"
                  >
                    {{ unmergingId === c.id ? 'Undoing…' : 'Unmerge' }}
                  </button>
                </li>
              </ul>
            </div>

            <p v-if="mergeError"  class="summary-error" role="alert">{{ mergeError }}</p>
            <p v-if="mergeNotice" class="merge-notice" role="status">{{ mergeNotice }}</p>
          </div>
        </template>

        <!-- ── admin edit form ─────────────────────────────────────────────── -->
        <template v-else>
          <div class="field">
            <label class="field-label" for="ce-name">Company name</label>
            <input id="ce-name" v-model="form.name" class="field-input" maxlength="200" required />
            <p class="field-hint">
              The old name is kept as an alias, so applications saved under it stay linked to this company.
            </p>
          </div>

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
          <button
            :class="['btn-list', { 'btn-list--on': isInterested }]"
            :aria-pressed="isInterested"
            @click="emit('toggle-interested')"
          >
            {{ isInterested ? 'Remove from interested' : 'Add to interested' }}
          </button>
          <button @click="emit('toggle-hidden')" class="btn-list">
            {{ isHidden ? 'Unhide' : 'Not interested' }}
          </button>
          <button @click="emit('start-application')" class="btn-primary footer-primary">
            {{ application ? 'Add Another Application' : 'Start Application' }}
          </button>
        </template>
      </div>
    </div>

    <ConfirmDialog
      v-if="showMergeConfirm"
      title="Merge companies?"
      :message="`${mergeStaged.map(c => c.name).join(', ')} will be folded into ${company.name}. Their applications and list entries move across, and they disappear from the register. You can unmerge them again from this panel.`"
      confirm-label="Merge"
      confirm-class="btn-danger"
      @confirm="confirmMerge"
      @cancel="showMergeConfirm = false"
    />
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
.btn-list {
  background: none; border: 1px solid var(--col-border); color: var(--col-muted);
  border-radius: .375rem; padding: .45rem .875rem; font-size: .8rem; cursor: pointer;
  flex-shrink: 0; white-space: nowrap;
}
.btn-list:hover { background: var(--col-raised); color: var(--col-text); }
.btn-list--on {
  border-color: color-mix(in srgb, #f59e0b 45%, transparent);
  color: #b45309; background: color-mix(in srgb, #f59e0b 10%, transparent);
}
.btn-list--on:hover { color: #b45309; background: color-mix(in srgb, #f59e0b 16%, transparent); }

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
.chip-ghosted     { background: var(--col-raised); color: var(--col-subtle); }

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

.field-hint { font-size: .75rem; color: var(--col-subtle); line-height: 1.5; margin: 0; }

.merge-panel { border-top: 1px solid var(--col-border); padding-top: 1rem; }
.merge-results { list-style: none; margin: .375rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .25rem; }
.merge-result {
  width: 100%; text-align: left; background: none; cursor: pointer;
  border: 1px solid var(--col-border); border-radius: .375rem; padding: .4rem .625rem;
  display: flex; flex-direction: column; gap: .1rem;
}
.merge-result:hover { background: var(--col-raised); }
.merge-result-name { font-size: .85rem; color: var(--col-text); }
.merge-result-meta { font-size: .72rem; color: var(--col-subtle); }
.merged-list { margin-top: .875rem; display: flex; flex-direction: column; gap: .375rem; }
.merged-row {
  display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  border: 1px solid var(--col-border); border-radius: .375rem; padding: .4rem .625rem;
}
.merge-undo { padding: .25rem .625rem; font-size: .72rem; }
.merge-submit { margin-top: .625rem; align-self: flex-start; }
.merge-notice { font-size: .8rem; color: #2a9d58; margin: 0; }
.btn-danger {
  background: var(--col-error); color: #fff; border: none; border-radius: .375rem;
  padding: .45rem 1rem; font-size: .8rem; font-weight: 600; cursor: pointer;
}
.btn-danger:disabled { opacity: .55; cursor: not-allowed; }
.btn-danger:not(:disabled):hover { opacity: .88; }
</style>
