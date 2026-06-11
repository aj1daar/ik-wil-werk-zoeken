<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const firstName   = ref(auth.user?.firstName ?? '')
const lastName    = ref(auth.user?.lastName ?? '')
const targetRole  = ref(auth.user?.preferences?.targetRole ?? '')
const location    = ref(auth.user?.preferences?.location ?? '')
const workType    = ref(auth.user?.preferences?.workType ?? 'any')

const currentPw   = ref('')
const newPw       = ref('')
const confirmPw   = ref('')
const showCurrent = ref(false)
const showNew     = ref(false)

const profileSaving  = ref(false)
const profileMsg     = ref<{text:string;ok:boolean}|null>(null)
const passwordSaving = ref(false)
const passwordMsg    = ref<{text:string;ok:boolean}|null>(null)

const WORK_TYPES = [
  { value: 'any',    label: 'Any arrangement' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
]

async function saveProfile() {
  profileSaving.value = true
  profileMsg.value = null
  const err = await auth.updateProfile({
    firstName:   firstName.value.trim(),
    lastName:    lastName.value.trim(),
    preferences: { targetRole: targetRole.value.trim(), location: location.value.trim(), workType: workType.value },
  })
  profileSaving.value = false
  profileMsg.value = err
    ? { text: err, ok: false }
    : { text: 'Profile saved.', ok: true }
}

async function changePassword() {
  if (newPw.value !== confirmPw.value) {
    passwordMsg.value = { text: 'Passwords do not match.', ok: false }
    return
  }
  if (newPw.value.length < 8) {
    passwordMsg.value = { text: 'Password must be at least 8 characters.', ok: false }
    return
  }
  passwordSaving.value = true
  passwordMsg.value = null
  const err = await auth.changePassword(currentPw.value, newPw.value)
  passwordSaving.value = false
  passwordMsg.value = err
    ? { text: err, ok: false }
    : { text: 'Password updated.', ok: true }
  if (!err) { currentPw.value = ''; newPw.value = ''; confirmPw.value = '' }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Profile</h1>
      <p class="page-subtitle">Manage your account and job search preferences.</p>
    </div>

    <!-- Account info notice -->
    <div class="notice">
      <svg xmlns="http://www.w3.org/2000/svg" class="notice-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>
        Signed in as <strong>{{ auth.user?.email }}</strong>.
        Your data is processed under GDPR. AI-generated company summaries are provided by Google Gemini.
      </p>
    </div>

    <div class="sections">

      <!-- Personal info -->
      <section class="card section-card">
        <h2 class="section-title">Personal information</h2>
        <form @submit.prevent="saveProfile" class="form">
          <div class="name-row">
            <div>
              <label class="field-label" for="p-firstName">First name</label>
              <input id="p-firstName" v-model="firstName" type="text" class="field-input" required />
            </div>
            <div>
              <label class="field-label" for="p-lastName">Last name</label>
              <input id="p-lastName" v-model="lastName" type="text" class="field-input" required />
            </div>
          </div>

          <hr class="form-divider" />
          <p class="subsection-label">Job search preferences</p>

          <div>
            <label class="field-label" for="p-role">Target role</label>
            <input id="p-role" v-model="targetRole" type="text" placeholder="e.g. Software Engineer" class="field-input" />
          </div>
          <div class="name-row">
            <div>
              <label class="field-label" for="p-loc">Preferred location</label>
              <input id="p-loc" v-model="location" type="text" placeholder="e.g. Amsterdam" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="p-work">Work arrangement</label>
              <select id="p-work" v-model="workType" class="field-input">
                <option v-for="wt in WORK_TYPES" :key="wt.value" :value="wt.value">{{ wt.label }}</option>
              </select>
            </div>
          </div>

          <div v-if="profileMsg" :class="['form-msg', profileMsg.ok ? 'form-msg--ok' : 'form-msg--err']">
            {{ profileMsg.text }}
          </div>

          <div class="form-actions">
            <button type="submit" :disabled="profileSaving" class="btn-primary">
              {{ profileSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      </section>

      <!-- Change password -->
      <section class="card section-card">
        <h2 class="section-title">Change password</h2>
        <form @submit.prevent="changePassword" class="form">
          <div>
            <label class="field-label" for="cur-pw">Current password</label>
            <div class="relative">
              <input id="cur-pw" :type="showCurrent ? 'text' : 'password'" v-model="currentPw" class="field-input" style="padding-right:2.5rem" autocomplete="current-password" required />
              <button type="button" @click="showCurrent = !showCurrent" class="btn-icon eye-btn"><svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
            </div>
          </div>
          <div>
            <label class="field-label" for="new-pw">New password</label>
            <div class="relative">
              <input id="new-pw" :type="showNew ? 'text' : 'password'" v-model="newPw" class="field-input" style="padding-right:2.5rem" autocomplete="new-password" minlength="8" required />
              <button type="button" @click="showNew = !showNew" class="btn-icon eye-btn"><svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
            </div>
          </div>
          <div>
            <label class="field-label" for="conf-pw">Confirm new password</label>
            <input id="conf-pw" :type="showNew ? 'text' : 'password'" v-model="confirmPw" class="field-input" autocomplete="new-password" required />
          </div>

          <div v-if="passwordMsg" :class="['form-msg', passwordMsg.ok ? 'form-msg--ok' : 'form-msg--err']">
            {{ passwordMsg.text }}
          </div>

          <div class="form-actions">
            <button type="submit" :disabled="passwordSaving" class="btn-primary">
              {{ passwordSaving ? 'Updating…' : 'Update password' }}
            </button>
          </div>
        </form>
      </section>

    </div>
  </div>
</template>

<style scoped>
.page { max-width: 700px; margin: 0 auto; padding: 2rem 1.5rem; }
.page-header   { margin-bottom: 1.5rem; }
.page-title    { font-size: 1.5rem; font-weight: 700; color: var(--col-text); margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.875rem; color: var(--col-muted); margin: 0; }

.notice {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.875rem 1rem;
  background: var(--col-accent-lt);
  border: 1px solid color-mix(in srgb, var(--col-accent) 25%, transparent);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.8125rem;
  color: var(--col-muted);
  line-height: 1.5;
}
.notice-icon { width: 1.25rem; height: 1.25rem; color: var(--col-accent); flex-shrink: 0; margin-top: 0.1rem; }

.sections { display: flex; flex-direction: column; gap: 1.25rem; }

.section-card { }
.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0 0 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--col-border);
}
.form { display: flex; flex-direction: column; gap: 0.875rem; }
.name-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.form-divider { border: none; border-top: 1px solid var(--col-border); margin: 0.25rem 0; }
.subsection-label { font-size: 0.8125rem; font-weight: 600; color: var(--col-muted); margin: 0; }
.form-actions { display: flex; justify-content: flex-end; }

.form-msg {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
}
.form-msg--ok  { background: var(--col-success-lt); color: var(--col-success); }
.form-msg--err { background: var(--col-error-lt);   color: var(--col-error); }

.relative { position: relative; }
.eye-btn { position: absolute; right: 0.625rem; top: 50%; transform: translateY(-50%); }
</style>
