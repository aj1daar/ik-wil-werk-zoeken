<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useCompaniesStore, STATUSES } from '../stores/companies'
import type { CompanyRow } from '../stores/companies'

const props = defineProps<{ company: CompanyRow }>()
const emit = defineEmits<{ close: [] }>()

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
  status.value      = c.record?.status ?? 'Bookmarked'
  notes.value       = c.record?.notes ?? ''
  contactName.value = c.record?.contactPersonName ?? ''
  contactEmail.value = c.record?.contactPersonEmail ?? ''
  cities.value      = [...(c.record?.cities ?? [])]
  saveError.value   = ''
}, { immediate: false })

const isTracked = computed(() => !!props.company.record)

const allTags = computed(() => [
  ...(props.company.techStackTags ?? []),
  ...(props.company.functionalTags ?? [])
])

function addCity() {
  const c = cityInput.value.trim()
  if (c && !cities.value.includes(c)) cities.value.push(c)
  cityInput.value = ''
}

function removeCity(c: string) {
  cities.value = cities.value.filter(x => x !== c)
}

function onCityKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addCity()
  }
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
  <div class="flex flex-col h-full overflow-y-auto">
    <!-- Header -->
    <div class="flex items-start justify-between p-5 border-b border-slate-800 shrink-0">
      <div class="min-w-0 pr-4">
        <h2 class="text-lg font-semibold text-slate-100 truncate">{{ company.name }}</h2>
        <p class="text-xs text-slate-500 mt-0.5">KvK {{ company.kvKNumber }}</p>
      </div>
      <button @click="$emit('close')" class="text-slate-500 hover:text-slate-300 transition shrink-0 mt-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 p-5 space-y-5 overflow-y-auto">

      <!-- Status -->
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
        <select
          v-model="status"
          class="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm
                 text-slate-100 focus:outline-none focus:border-slate-500 transition"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <!-- AI summary -->
      <div v-if="company.summary">
        <label class="block text-xs font-medium text-slate-400 mb-1.5">About</label>
        <p class="text-sm text-slate-300 leading-relaxed">{{ company.summary }}</p>
      </div>

      <!-- Industry + tags -->
      <div v-if="company.coreIndustry || allTags.length">
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Tags</label>
        <div class="flex flex-wrap gap-1.5">
          <span v-if="company.coreIndustry"
            class="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300 border border-slate-600">
            {{ company.coreIndustry }}
          </span>
          <span v-for="tag in allTags" :key="tag"
            class="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700">
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Cities -->
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Cities</label>
        <div class="flex flex-wrap gap-1.5 mb-2">
          <span v-for="c in cities" :key="c"
            class="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700">
            {{ c }}
            <button @click="removeCity(c)" class="text-slate-500 hover:text-slate-300 leading-none">×</button>
          </span>
        </div>
        <input
          v-model="cityInput"
          @keydown="onCityKey"
          @blur="addCity"
          placeholder="Type city and press Enter…"
          class="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm
                 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 transition"
        />
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
        <textarea
          v-model="notes"
          rows="4"
          placeholder="Personal notes about this company…"
          class="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm
                 text-slate-100 placeholder-slate-600 resize-none focus:outline-none
                 focus:border-slate-500 transition"
        />
      </div>

      <!-- Contact person -->
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1.5">Contact person</label>
        <input
          v-model="contactName"
          placeholder="Name"
          class="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm
                 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 transition mb-2"
        />
        <input
          v-model="contactEmail"
          type="email"
          placeholder="Email"
          class="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm
                 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 transition"
        />
      </div>

    </div>

    <!-- Footer -->
    <div class="p-5 border-t border-slate-800 shrink-0 space-y-2">
      <p v-if="saveError" class="text-red-400 text-xs">{{ saveError }}</p>
      <div class="flex gap-2">
        <button
          @click="save"
          :disabled="saving"
          class="flex-1 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed
                 text-white text-sm font-medium py-2 rounded-md transition"
        >
          {{ saving ? 'Saving…' : isTracked ? 'Save changes' : 'Start tracking' }}
        </button>
        <button
          v-if="isTracked"
          @click="remove"
          class="px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30
                 rounded-md border border-red-900/40 transition"
          title="Remove from tracking"
        >
          Remove
        </button>
      </div>
    </div>
  </div>
</template>
