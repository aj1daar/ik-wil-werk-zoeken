<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import PasswordField from '../../components/PasswordField/PasswordField.vue'
import FormMessage from '../../components/FormMessage/FormMessage.vue'

const auth = useAuthStore()

const firstName  = ref(auth.user?.firstName ?? '')
const lastName   = ref(auth.user?.lastName ?? '')
const targetRole = ref(auth.user?.preferences?.targetRole ?? '')
const location   = ref(auth.user?.preferences?.location ?? '')
const workType   = ref(auth.user?.preferences?.workType ?? 'any')

const currentPw  = ref('')
const newPw      = ref('')
const confirmPw  = ref('')

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
  profileMsg.value = err ? { text: err, ok: false } : { text: 'Profile saved.', ok: true }
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
  passwordMsg.value = err ? { text: err, ok: false } : { text: 'Password updated.', ok: true }
  if (!err) { currentPw.value = ''; newPw.value = ''; confirmPw.value = '' }
}
</script>

<template>
  <div class="page profile-page">
    <div class="page-header">
      <h1 class="page-title">Profile</h1>
      <p class="page-subtitle">Manage your account and job search preferences.</p>
    </div>

    <div class="profile-notice">
      <svg xmlns="http://www.w3.org/2000/svg" class="notice-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>
        Signed in as <strong>{{ auth.user?.email }}</strong>.
        Your data is processed under GDPR. AI-generated company summaries are provided by Google Gemini.
      </p>
    </div>

    <div class="profile-sections">

      <section class="card">
        <h2 class="section-title">Personal information</h2>
        <form @submit.prevent="saveProfile" class="profile-form">
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

          <FormMessage :message="profileMsg" />

          <div class="form-actions">
            <button type="submit" :disabled="profileSaving" class="btn-primary">
              {{ profileSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      </section>

      <section class="card">
        <h2 class="section-title">Change password</h2>
        <form @submit.prevent="changePassword" class="profile-form">
          <PasswordField
            id="cur-pw"
            label="Current password"
            autocomplete="current-password"
            v-model="currentPw"
            :required="true"
          />
          <PasswordField
            id="new-pw"
            label="New password"
            autocomplete="new-password"
            v-model="newPw"
            :required="true"
            :minlength="8"
          />
          <div>
            <label class="field-label" for="conf-pw">Confirm new password</label>
            <input id="conf-pw" type="password" v-model="confirmPw" class="field-input" autocomplete="new-password" required />
          </div>

          <FormMessage :message="passwordMsg" />

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

<style src="./style.css" scoped></style>
