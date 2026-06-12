<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import AppLogo from '../../components/AppLogo/AppLogo.vue'
import PasswordField from '../../components/PasswordField/PasswordField.vue'

const auth = useAuthStore()

const firstName   = ref('')
const lastName    = ref('')
const email       = ref('')
const password    = ref('')
const targetRole  = ref('')
const location    = ref('')
const workType    = ref<'any'|'onsite'|'hybrid'|'remote'>('any')
const confirmPassword = ref('')
const gdprConsent = ref(false)
const error       = ref('')
const loading     = ref(false)
const submitted   = ref(false)

const WORK_TYPES = [
  { value: 'any',    label: 'Any arrangement' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
]

async function submit() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.'
    return
  }
  if (!gdprConsent.value) {
    error.value = 'You must agree to the privacy policy to create an account.'
    return
  }
  loading.value = true
  error.value   = ''
  const err = await auth.register({
    firstName:   firstName.value.trim(),
    lastName:    lastName.value.trim(),
    email:       email.value.trim().toLowerCase(),
    password:    password.value,
    preferences: {
      targetRole: targetRole.value.trim() || undefined,
      location:   location.value.trim() || undefined,
      workType:   workType.value,
    },
    gdprConsentAt: new Date().toISOString(),
  })
  loading.value = false
  if (err) error.value = err
  else submitted.value = true
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-brand-wrap">
      <AppLogo :size="40" />
    </div>

    <div v-if="submitted" class="auth-card register-card">
      <h1 class="auth-title">Check your inbox</h1>
      <p class="auth-subtitle">
        We sent a verification link to <strong>{{ email }}</strong>.
        Click the link in that email to activate your account.
      </p>
      <p class="auth-subtitle" style="margin-top: 0.5rem; font-size: 0.8125rem;">
        The link expires in 72 hours. Check your spam folder if you don't see it.
      </p>
      <p class="auth-footer" style="margin-top: 1.5rem;">
        Already have an account?
        <router-link to="/login" class="auth-link">Sign in</router-link>
      </p>
    </div>

    <div v-else class="auth-card register-card">
      <h1 class="auth-title">Create your account</h1>
      <p class="auth-subtitle">Track Dutch IND sponsors and manage your job search in one place.</p>

      <form @submit.prevent="submit" class="auth-form">
        <div class="name-row">
          <div>
            <label class="field-label" for="firstName">First name</label>
            <input id="firstName" v-model="firstName" type="text" placeholder="Jan" autocomplete="given-name" class="auth-input" required />
          </div>
          <div>
            <label class="field-label" for="lastName">Last name</label>
            <input id="lastName" v-model="lastName" type="text" placeholder="de Vries" autocomplete="family-name" class="auth-input" required />
          </div>
        </div>

        <div>
          <label class="field-label" for="reg-email">Email</label>
          <input id="reg-email" v-model="email" type="email" placeholder="you@example.com" autocomplete="email" class="auth-input" required />
        </div>

        <PasswordField
          id="reg-password"
          label="Password"
          placeholder="At least 8 characters"
          autocomplete="new-password"
          input-class="auth-input"
          v-model="password"
          :required="true"
          :minlength="8"
        />

        <div>
          <label class="field-label" for="reg-confirm-password">Confirm password</label>
          <input
            id="reg-confirm-password"
            v-model="confirmPassword"
            type="password"
            placeholder="Repeat your password"
            autocomplete="new-password"
            class="auth-input"
            :aria-invalid="error === 'Passwords do not match.' || undefined"
            aria-describedby="reg-error"
            required
          />
        </div>

        <hr class="form-divider" />
        <p class="section-label">Job search preferences <span class="optional">(optional — you can update these later)</span></p>

        <div>
          <label class="field-label" for="targetRole">Target role</label>
          <input id="targetRole" v-model="targetRole" type="text" placeholder="e.g. Software Engineer, Data Analyst" class="auth-input" />
        </div>

        <div class="name-row">
          <div>
            <label class="field-label" for="location">Preferred location</label>
            <input id="location" v-model="location" type="text" placeholder="e.g. Amsterdam" class="auth-input" />
          </div>
          <div>
            <label class="field-label" for="workType">Work arrangement</label>
            <select id="workType" v-model="workType" class="auth-input">
              <option v-for="wt in WORK_TYPES" :key="wt.value" :value="wt.value">{{ wt.label }}</option>
            </select>
          </div>
        </div>

        <hr class="form-divider" />

        <label class="consent-row">
          <input type="checkbox" v-model="gdprConsent" required />
          <span class="consent-text">
            I agree to the collection and processing of my personal data as described in the
            <a href="/privacy" class="auth-link" target="_blank">Privacy Policy</a>.
            This tool uses AI-generated summaries (Google Gemini) for company descriptions.
          </span>
        </label>

        <p v-if="error" id="reg-error" class="auth-error" role="alert">{{ error }}</p>

        <button type="submit" :disabled="loading || !firstName || !lastName || !email || !password || !confirmPassword || !gdprConsent" class="btn-submit">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="auth-footer">
        Already have an account?
        <router-link to="/login" class="auth-link">Sign in</router-link>
      </p>
    </div><!-- /v-else auth-card -->
  </div>
</template>

<style src="./style.css" scoped></style>
