<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useRouter } from 'vue-router'
import PasswordField from '../../components/PasswordField/PasswordField.vue'
import FormMessage from '../../components/FormMessage/FormMessage.vue'

const auth   = useAuthStore()
const router = useRouter()

const firstName  = ref(auth.user?.firstName ?? '')
const lastName   = ref(auth.user?.lastName ?? '')
const targetRole = ref(auth.user?.preferences?.targetRole ?? '')
const location   = ref(auth.user?.preferences?.location ?? '')
const workType   = ref(auth.user?.preferences?.workType ?? 'any')

const currentPw  = ref('')
const newPw      = ref('')
const confirmPw  = ref('')

const emailCurrentPw = ref('')
const newEmail       = ref('')
const emailSaving    = ref(false)
const emailMsg       = ref<{text:string;ok:boolean}|null>(null)

const profileSaving  = ref(false)
const profileMsg     = ref<{text:string;ok:boolean}|null>(null)
const passwordSaving = ref(false)
const passwordMsg    = ref<{text:string;ok:boolean}|null>(null)
const deleteConfirm  = ref(false)
const deleteError    = ref('')
const deleting       = ref(false)

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

async function requestEmailChange() {
  const trimmed = newEmail.value.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    emailMsg.value = { text: 'Please enter a valid email address.', ok: false }
    return
  }
  emailSaving.value = true
  emailMsg.value = null
  const err = await auth.changeEmail(emailCurrentPw.value, trimmed)
  emailSaving.value = false
  if (err) {
    emailMsg.value = { text: err, ok: false }
  } else {
    emailMsg.value = { text: `A confirmation link has been sent to ${trimmed}. Click it to confirm the change.`, ok: true }
    emailCurrentPw.value = ''
    newEmail.value = ''
  }
}

async function deleteAccount() {
  deleting.value = true
  deleteError.value = ''
  const err = await auth.deleteAccount()
  if (err) {
    deleteError.value = err
    deleting.value = false
    deleteConfirm.value = false
  } else {
    await router.push('/login')
  }
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
            <input
              id="conf-pw"
              type="password"
              v-model="confirmPw"
              class="field-input"
              autocomplete="new-password"
              aria-describedby="pw-form-msg"
              :aria-invalid="passwordMsg !== null && !passwordMsg.ok || undefined"
              required
            />
          </div>

          <FormMessage id="pw-form-msg" :message="passwordMsg" />

          <div class="form-actions">
            <button type="submit" :disabled="passwordSaving" class="btn-primary">
              {{ passwordSaving ? 'Updating…' : 'Update password' }}
            </button>
          </div>
        </form>
      </section>

      <section class="card">
        <h2 class="section-title">Change email address</h2>
        <p class="section-hint">A confirmation link will be sent to your new address. The change takes effect when you click it.</p>
        <form @submit.prevent="requestEmailChange" class="profile-form">
          <div>
            <label class="field-label" for="em-new">New email address</label>
            <input
              id="em-new"
              v-model="newEmail"
              type="email"
              class="field-input"
              autocomplete="email"
              aria-describedby="email-form-msg"
              :aria-invalid="emailMsg !== null && !emailMsg.ok || undefined"
              required
            />
          </div>
          <PasswordField
            id="em-pw"
            label="Current password (to confirm)"
            autocomplete="current-password"
            v-model="emailCurrentPw"
            :required="true"
            aria-describedby="email-form-msg"
            :aria-invalid="emailMsg !== null && !emailMsg.ok || undefined"
          />

          <FormMessage id="email-form-msg" :message="emailMsg" />

          <div class="form-actions">
            <button type="submit" :disabled="emailSaving || !newEmail || !emailCurrentPw" class="btn-primary">
              {{ emailSaving ? 'Sending…' : 'Send confirmation link' }}
            </button>
          </div>
        </form>
      </section>

      <section class="card danger-zone">
        <h2 class="section-title section-title--danger">Danger zone</h2>
        <p class="danger-description">
          Permanently delete your account and all your application records. This cannot be undone.
        </p>
        <p v-if="deleteError" class="danger-error" role="alert">{{ deleteError }}</p>
        <div v-if="!deleteConfirm" class="form-actions">
          <button @click="deleteConfirm = true" class="btn-danger">Delete my account</button>
        </div>
        <div v-else class="delete-confirm">
          <p class="danger-confirm-text">Are you sure? All your data will be erased permanently.</p>
          <div class="form-actions">
            <button @click="deleteAccount" :disabled="deleting" class="btn-danger">
              {{ deleting ? 'Deleting…' : 'Yes, delete my account' }}
            </button>
            <button @click="deleteConfirm = false" :disabled="deleting" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
