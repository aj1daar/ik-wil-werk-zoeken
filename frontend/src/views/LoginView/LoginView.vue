<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { api } from '../../api'
import AppLogo from '../../components/AppLogo/AppLogo.vue'
import PasswordField from '../../components/PasswordField/PasswordField.vue'

const router = useRouter()
const auth   = useAuthStore()

const email    = ref('')
const password = ref('')
const error    = ref('')
const loading  = ref(false)
const expired      = ref(false)
const resetSuccess = ref(false)
const resendLoading = ref(false)
const resendSent    = ref(false)

const isUnverified = computed(() =>
  error.value.includes('verify your email')
)

onMounted(() => {
  if (sessionStorage.getItem('sessionExpired')) {
    expired.value = true
    sessionStorage.removeItem('sessionExpired')
  }
  if (sessionStorage.getItem('passwordReset')) {
    resetSuccess.value = true
    sessionStorage.removeItem('passwordReset')
  }
})

async function submit() {
  if (!email.value || !password.value) return
  loading.value  = true
  error.value    = ''
  resendSent.value = false
  const err = await auth.login(email.value.trim().toLowerCase(), password.value)
  loading.value = false
  if (err) {
    error.value = err === 'Unauthorized' ? 'Incorrect email or password' : err
    password.value = ''
  } else {
    router.push('/')
  }
}

async function resendVerification() {
  resendLoading.value = true
  try {
    await api.resendVerification(email.value.trim().toLowerCase())
  } catch { /* silently ignore — anti-enumeration */ }
  resendLoading.value = false
  resendSent.value = true
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-brand-wrap">
      <AppLogo :size="44" />
    </div>

    <div class="auth-card login-card">
      <h1 class="auth-title">Welcome back</h1>
      <p v-if="resetSuccess" class="auth-success">Password updated — please sign in with your new password.</p>
      <p v-else-if="expired" class="auth-expired">Your session expired — please sign in again.</p>
      <p v-else class="auth-subtitle">Sign in to your account to continue.</p>

      <form @submit.prevent="submit" class="auth-form">
        <div>
          <label class="field-label" for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            class="auth-input"
            required
          />
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          placeholder="Your password"
          autocomplete="current-password"
          input-class="auth-input"
          v-model="password"
          :required="true"
        />

        <template v-if="error">
          <p class="auth-error" role="alert">{{ error }}</p>
          <template v-if="isUnverified">
            <p v-if="resendSent" class="auth-success">Verification email sent — check your inbox.</p>
            <button v-else @click.prevent="resendVerification" :disabled="resendLoading" class="btn-resend">
              {{ resendLoading ? 'Sending…' : 'Resend verification email' }}
            </button>
          </template>
        </template>

        <button type="submit" :disabled="loading || !email || !password" class="btn-submit">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="auth-forgot">
          <router-link to="/forgot-password" class="auth-link">Forgot your password?</router-link>
        </p>
      </form>

      <p class="auth-footer">
        Don't have an account?
        <router-link to="/register" class="auth-link">Create one</router-link>
      </p>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
