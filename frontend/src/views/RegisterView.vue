<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth   = useAuthStore()

const firstName  = ref('')
const lastName   = ref('')
const email      = ref('')
const password   = ref('')
const targetRole = ref('')
const location   = ref('')
const workType   = ref<'any'|'onsite'|'hybrid'|'remote'>('any')
const show       = ref(false)
const gdprConsent = ref(false)
const error      = ref('')
const loading    = ref(false)

const WORK_TYPES = [
  { value: 'any',    label: 'Any arrangement' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
]

async function submit() {
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
  if (err) {
    error.value = err
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-brand">
      <svg width="40" height="40" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect width="34" height="34" rx="9" fill="#B25E2A"/>
        <circle cx="15.5" cy="15.5" r="6" stroke="#FAF7F2" stroke-width="2" fill="none"/>
        <path d="M20 20L25 25" stroke="#FAF7F2" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M13.5 15.5h4M15.5 13.5l2 2-2 2" stroke="#FAF7F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="auth-brand-name">
        <span class="auth-brand-light">ik wil werk </span><span class="auth-brand-bold">zoeken</span>
      </span>
    </div>

    <div class="auth-card" style="max-width:480px;width:100%">
      <h1 class="auth-title">Create your account</h1>
      <p class="auth-subtitle">Track Dutch IND sponsors and manage your job search in one place.</p>

      <form @submit.prevent="submit" class="auth-form">

        <!-- Name row -->
        <div class="name-row">
          <div>
            <label class="field-label" for="firstName">First name</label>
            <input id="firstName" v-model="firstName" type="text" placeholder="Jan" autocomplete="given-name" class="auth-input" style="padding-right:1rem" required />
          </div>
          <div>
            <label class="field-label" for="lastName">Last name</label>
            <input id="lastName" v-model="lastName" type="text" placeholder="de Vries" autocomplete="family-name" class="auth-input" style="padding-right:1rem" required />
          </div>
        </div>

        <div>
          <label class="field-label" for="reg-email">Email</label>
          <input id="reg-email" v-model="email" type="email" placeholder="you@example.com" autocomplete="email" class="auth-input" style="padding-right:1rem" required />
        </div>

        <div>
          <label class="field-label" for="reg-password">Password</label>
          <div class="relative">
            <input id="reg-password" :type="show ? 'text' : 'password'" v-model="password" placeholder="At least 8 characters" autocomplete="new-password" class="auth-input" minlength="8" required />
            <button type="button" @click="show = !show" class="btn-icon eye-btn" :aria-label="show ? 'Hide' : 'Show'">
              <svg v-if="!show" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            </button>
          </div>
        </div>

        <hr class="form-divider" />
        <p class="form-section-label">Job search preferences <span class="optional">(optional — you can update these later)</span></p>

        <div>
          <label class="field-label" for="targetRole">Target role</label>
          <input id="targetRole" v-model="targetRole" type="text" placeholder="e.g. Software Engineer, Data Analyst" class="auth-input" style="padding-right:1rem" />
        </div>

        <div class="name-row">
          <div>
            <label class="field-label" for="location">Preferred location</label>
            <input id="location" v-model="location" type="text" placeholder="e.g. Amsterdam" class="auth-input" style="padding-right:1rem" />
          </div>
          <div>
            <label class="field-label" for="workType">Work arrangement</label>
            <select id="workType" v-model="workType" class="auth-input" style="padding-right:1rem">
              <option v-for="wt in WORK_TYPES" :key="wt.value" :value="wt.value">{{ wt.label }}</option>
            </select>
          </div>
        </div>

        <hr class="form-divider" />

        <!-- GDPR consent -->
        <label class="consent-row">
          <input type="checkbox" v-model="gdprConsent" required />
          <span class="consent-text">
            I agree to the collection and processing of my personal data as described in the
            <a href="/privacy" class="auth-link" target="_blank">Privacy Policy</a>.
            This tool uses AI-generated summaries (Google Gemini) for company descriptions.
          </span>
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button type="submit" :disabled="loading || !firstName || !lastName || !email || !password || !gdprConsent" class="btn-submit">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="auth-footer">
        Already have an account?
        <router-link to="/login" class="auth-link">Sign in</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  background: var(--col-bg);
}
.auth-brand { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 1.5rem; }
.auth-brand-name { font-size: 1rem; }
.auth-brand-light { font-weight: 400; color: var(--col-muted); }
.auth-brand-bold  { font-weight: 700; color: var(--col-accent); }

.auth-title    { font-size: 1.375rem; font-weight: 700; color: var(--col-text); margin: 0 0 0.25rem; }
.auth-subtitle { font-size: 0.875rem; color: var(--col-muted); margin: 0 0 1.5rem; }

.auth-form { display: flex; flex-direction: column; gap: 0.875rem; }

.name-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

.relative { position: relative; }
.eye-btn { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); }

.form-divider { border: none; border-top: 1px solid var(--col-border); margin: 0.25rem 0; }
.form-section-label { font-size: 0.8125rem; font-weight: 600; color: var(--col-text); margin: 0; }
.optional { font-weight: 400; color: var(--col-subtle); }

.consent-row {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
  cursor: pointer;
}
.consent-row input[type="checkbox"] {
  margin-top: 0.2rem;
  flex-shrink: 0;
  accent-color: var(--col-accent);
  width: 1rem;
  height: 1rem;
}
.consent-text { font-size: 0.8125rem; color: var(--col-muted); line-height: 1.5; }

.auth-error { font-size: 0.875rem; color: var(--col-error); margin: 0; padding: 0.5rem 0.75rem; background: var(--col-error-lt); border-radius: 6px; }
.auth-footer { margin-top: 1.25rem; font-size: 0.875rem; color: var(--col-muted); text-align: center; }
.auth-link { color: var(--col-accent); font-weight: 500; text-decoration: none; }
.auth-link:hover { text-decoration: underline; }
</style>
