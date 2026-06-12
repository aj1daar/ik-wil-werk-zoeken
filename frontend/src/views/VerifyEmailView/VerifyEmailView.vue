<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { api } from '../../api'
import AppLogo from '../../components/AppLogo/AppLogo.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

type State = 'loading' | 'success' | 'error' | 'notoken'

const state = ref<State>('loading')
const error = ref('')
const resendEmail = ref('')
const resendLoading = ref(false)
const resendSent    = ref(false)

onMounted(async () => {
  const token = route.query.token as string | undefined
  if (!token) { state.value = 'notoken'; return }

  const err = await auth.verifyEmail(token)
  if (err) {
    state.value = 'error'
    error.value = err
  } else {
    state.value = 'success'
    setTimeout(() => router.replace('/'), 2000)
  }
})

async function resend() {
  if (!resendEmail.value.trim()) return
  resendLoading.value = true
  try {
    await api.resendVerification(resendEmail.value.trim().toLowerCase())
  } catch { /* anti-enumeration */ }
  resendLoading.value = false
  resendSent.value = true
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-brand-wrap">
      <AppLogo :size="44" />
    </div>

    <div class="auth-card verify-card">

      <!-- Loading -->
      <template v-if="state === 'loading'">
        <p class="verify-msg">Verifying your email…</p>
      </template>

      <!-- Success -->
      <template v-else-if="state === 'success'">
        <h1 class="auth-title verify-icon">Email verified!</h1>
        <p class="auth-subtitle">You're all set. Signing you in…</p>
      </template>

      <!-- No token in URL -->
      <template v-else-if="state === 'notoken'">
        <h1 class="auth-title">Invalid link</h1>
        <p class="auth-subtitle">This verification link is missing a token. Please use the link from your email.</p>
        <p class="auth-footer"><router-link to="/login" class="auth-link">Back to sign in</router-link></p>
      </template>

      <!-- Token invalid / expired -->
      <template v-else>
        <h1 class="auth-title">Link expired</h1>
        <p class="auth-subtitle">
          This verification link is invalid or has expired (links are valid for 72 hours).
          Enter your email below to receive a new one.
        </p>

        <form v-if="!resendSent" @submit.prevent="resend" class="auth-form">
          <div>
            <label class="field-label" for="resend-email">Email</label>
            <input
              id="resend-email"
              v-model="resendEmail"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              class="auth-input"
              required
            />
          </div>
          <button type="submit" :disabled="resendLoading || !resendEmail" class="btn-submit">
            {{ resendLoading ? 'Sending…' : 'Send new verification link' }}
          </button>
        </form>

        <p v-else class="resend-sent">
          If an account with that email exists and is unverified, a new link has been sent.
          Check your inbox.
        </p>

        <p class="auth-footer"><router-link to="/login" class="auth-link">Back to sign in</router-link></p>
      </template>

    </div>
  </div>
</template>

<style scoped>
.verify-card { width: 100%; max-width: 400px; }
.verify-msg  { color: var(--col-muted); text-align: center; padding: 1rem 0; }
.resend-sent { font-size: 0.875rem; color: var(--col-success); margin-top: 1rem; }
</style>
