<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@app/components/ui/AppIcon.vue'
import AddApplicationForm from './AddApplicationForm.vue'
import SignInForm from './SignInForm.vue'
import { api, type ApplicationSummary, type ParsedJobLink } from '../lib/api'
import { clearToken, getLiveToken } from '../lib/auth'
import { asJobUrl, readClipboardUrl } from '../lib/clipboard'

// The panel in one place: who is signed in, which link we are working from, and
// what the server made of it. The form below only ever sees the result.
const APP_URL = import.meta.env.VITE_IWWZ_APP ?? 'https://iwwz.nogoibay.org'

type Stage = 'starting' | 'signed-out' | 'editing' | 'saved'

const stage        = ref<Stage>('starting')
const jobUrl       = ref('')
const pastedUrl    = ref('')
const parsed       = ref<ParsedJobLink | null>(null)
const parsing      = ref(false)
const applications = ref<ApplicationSummary[]>([])
const savedRow     = ref<ApplicationSummary | null>(null)
const notice       = ref('')

const canParse = computed(() => asJobUrl(pastedUrl.value) !== null)

onMounted(() => void start())

async function start() {
  if (!await getLiveToken()) { stage.value = 'signed-out'; return }
  stage.value = 'editing'
  // Not awaited together: the list is only needed for the duplicate warning, and
  // a slow list should not hold up the parse the whole panel is waiting on.
  void loadApplications()
  const copied = await readClipboardUrl()
  if (copied) await useUrl(copied)
  else notice.value = 'Nothing copied that looks like a link. Paste one below.'
}

async function loadApplications() {
  try {
    applications.value = await api.getApplications()
  } catch {
    // A missing list costs the duplicate warning and nothing else, so it is not
    // worth an error in front of the form.
    applications.value = []
  }
}

async function useUrl(url: string) {
  jobUrl.value = url
  notice.value = ''
  parsing.value = true
  try {
    parsed.value = await api.parseJobLink(url)
    if (!parsed.value.company && !parsed.value.position) {
      notice.value = 'Could not read anything from that link. Fill the fields in yourself.'
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('session')) { onUnauthorized(); return }
    parsed.value = null
    notice.value = 'Could not read that link. Fill the fields in yourself.'
  } finally {
    parsing.value = false
  }
}

async function readClipboardAgain() {
  const copied = await readClipboardUrl()
  if (copied) await useUrl(copied)
  else notice.value = 'Still nothing copied that looks like a link.'
}

async function usePastedUrl() {
  const url = asJobUrl(pastedUrl.value)
  if (!url) return
  pastedUrl.value = ''
  await useUrl(url)
}

function onSaved(row: ApplicationSummary) {
  savedRow.value = row
  stage.value    = 'saved'
}

function addAnother() {
  jobUrl.value   = ''
  parsed.value   = null
  savedRow.value = null
  notice.value   = ''
  stage.value    = 'editing'
  void loadApplications()
  void readClipboardAgain()
}

function onUnauthorized() {
  stage.value = 'signed-out'
  notice.value = 'Your session has ended. Sign in again.'
}

async function signOut() {
  await clearToken()
  stage.value = 'signed-out'
  notice.value = ''
}

async function onSignedIn() {
  notice.value = ''
  await start()
}
</script>

<template>
  <div class="panel">
    <header class="panel-header">
      <svg class="panel-mark" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="6" style="fill: var(--col-signal)" />
        <circle cx="15.5" cy="15.5" r="6" stroke-width="2.2" fill="none" style="stroke: var(--col-on-signal)" />
        <path d="M20 20L25 25" stroke-width="2.6" stroke-linecap="round" style="stroke: var(--col-on-signal)" />
        <path d="M13.5 15.5h4M15.5 13.5l2 2-2 2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--col-on-signal)" />
      </svg>
      <h1 class="panel-title">Add an application</h1>
      <button
        v-if="stage !== 'signed-out' && stage !== 'starting'"
        type="button"
        class="btn-ghost panel-signout"
        @click="signOut"
      >
        Sign out
      </button>
    </header>

    <main class="panel-body">
      <p v-if="stage === 'starting'" class="panel-note" role="status">Opening your tracker…</p>

      <SignInForm v-else-if="stage === 'signed-out'" @signed-in="onSignedIn" />

      <div v-else-if="stage === 'saved'" class="panel-saved">
        <p class="panel-saved-line">
          <!-- No full stop: a company name that already ends in one ("Acme B.V.")
               would otherwise read as "Acme B.V..". -->
          Saved <strong>{{ savedRow?.position }}</strong> at <strong>{{ savedRow?.companyName }}</strong>
        </p>
        <button type="button" class="btn-primary panel-submit" @click="addAnother">Add another</button>
        <a class="btn-secondary panel-link" :href="`${APP_URL}/applications`" target="_blank" rel="noreferrer">
          Open my applications
          <AppIcon name="external" class="panel-link-icon" />
        </a>
      </div>

      <template v-else>
        <p v-if="jobUrl" class="panel-source" :title="jobUrl">{{ jobUrl }}</p>

        <div v-if="!jobUrl" class="panel-paste">
          <p v-if="notice" class="panel-note" role="status">{{ notice }}</p>
          <label class="field-label" for="panel-paste">Job posting link</label>
          <input
            id="panel-paste"
            v-model="pastedUrl"
            class="field-input"
            placeholder="https://…"
            @keydown.enter.prevent="usePastedUrl"
          />
          <div class="panel-paste-actions">
            <button type="button" class="btn-primary" :disabled="!canParse" @click="usePastedUrl">Read link</button>
            <button type="button" class="btn-secondary" @click="readClipboardAgain">Use what I copied</button>
          </div>
        </div>

        <p v-if="parsing" class="panel-note" role="status">Reading the link…</p>
        <p v-else-if="jobUrl && notice" class="panel-note" role="status">{{ notice }}</p>

        <AddApplicationForm
          v-if="!parsing"
          :key="jobUrl"
          :job-url="jobUrl"
          :parsed="parsed"
          :applications="applications"
          @saved="onSaved"
          @unauthorized="onUnauthorized"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 100vh; background: var(--col-bg); }

.panel-header {
  display: flex; align-items: center; gap: .5rem;
  padding: .75rem 1rem;
  border-bottom: 1px solid var(--col-border);
  background: var(--col-surface);
}
.panel-mark { width: 1.5rem; height: 1.5rem; flex: none; }
.panel-title { flex: 1; font-size: 1rem; font-weight: 600; color: var(--col-text); margin: 0; }
.panel-signout { font-size: .75rem; }

.panel-body { flex: 1; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

.panel-note { font-size: .8125rem; color: var(--col-subtle); margin: 0; }

.panel-source {
  font-size: .75rem; color: var(--col-subtle);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin: 0;
}

.panel-paste { display: flex; flex-direction: column; gap: .5rem; }
.panel-paste-actions { display: flex; gap: .5rem; }
.panel-paste-actions > * { flex: 1 1 0; justify-content: center; }

.panel-saved { display: flex; flex-direction: column; gap: .75rem; }
.panel-saved-line { font-size: .875rem; color: var(--col-text); margin: 0; }
.panel-submit { width: 100%; justify-content: center; }
.panel-link { width: 100%; justify-content: center; gap: .375rem; text-decoration: none; }
.panel-link-icon { width: .875rem; height: .875rem; flex: none; }
</style>
