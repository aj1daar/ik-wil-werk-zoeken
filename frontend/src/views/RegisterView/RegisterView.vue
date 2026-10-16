<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import AppLogo from '../../components/AppLogo/AppLogo.vue'
import PasswordField from '../../components/PasswordField/PasswordField.vue'
import GoogleSignIn from '../../components/GoogleSignIn/GoogleSignIn.vue'
import { PRIVACY_VERSION } from '../../utils/privacy'

const auth   = useAuthStore()
const router = useRouter()

// A Google sign-up is finished the moment it returns: there is no email to
// verify, so the account is ready and the app is where they wanted to be.
function onGoogleSignedIn() {
  router.push('/')
}

const email       = ref('')
const password    = ref('')
const confirmPassword = ref('')
const error       = ref('')
const loading     = ref(false)
const submitted   = ref(false)

const pwLongEnough  = computed(() => password.value.length >= 8)
const pwTouched     = computed(() => password.value.length > 0)
const isEmailTaken  = computed(() => error.value.toLowerCase().includes('already exists'))
const emailInvalid  = ref(false)

function checkEmail() {
  emailInvalid.value = !!email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())
}

async function submit() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  error.value   = ''
  const err = await auth.register({
    email:          email.value.trim().toLowerCase(),
    password:       password.value,
    // The moment of agreement, and the notice that was agreed to. The API
    // refuses any version but the one it is serving today.
    gdprConsentAt:  new Date().toISOString(),
    privacyVersion: PRIVACY_VERSION,
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
        <div>
          <label class="field-label" for="reg-email">Email</label>
          <input
            id="reg-email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            class="auth-input"
            :class="{ 'input-error': emailInvalid }"
            aria-describedby="reg-email-hint"
            :aria-invalid="emailInvalid || undefined"
            @blur="checkEmail"
            required
          />
          <p v-if="emailInvalid" id="reg-email-hint" class="field-hint field-hint--error">Enter a valid email address.</p>
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
          aria-describedby="reg-pw-reqs"
          :aria-invalid="pwTouched && !pwLongEnough || undefined"
        />
        <ul v-if="pwTouched" id="reg-pw-reqs" class="pw-reqs">
          <li :class="pwLongEnough ? 'req-ok' : 'req-fail'">At least 8 characters</li>
        </ul>

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

        <p class="consent-line">
          Creating an account means you accept the
          <router-link to="/privacy" class="auth-link">privacy notice</router-link>.
          It says what is stored, who else sees it, and how to get it back or have it deleted.
        </p>

        <div v-if="error" id="reg-error" role="alert">
          <p v-if="isEmailTaken" class="auth-error">
            This email is already registered.
            <router-link to="/login" class="auth-link">Sign in</router-link>
            or
            <router-link to="/forgot-password" class="auth-link">reset your password</router-link>.
          </p>
          <p v-else class="auth-error">{{ error }}</p>
        </div>

        <button type="submit" :disabled="loading || !email || emailInvalid || !pwLongEnough || !confirmPassword" class="btn-submit">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <GoogleSignIn text="signup_with" @signed-in="onGoogleSignedIn" />

      <p class="auth-footer">
        Already have an account?
        <router-link to="/login" class="auth-link">Sign in</router-link>
      </p>
    </div><!-- /v-else auth-card -->
  </div>
</template>

<style src="./style.css" scoped></style>
