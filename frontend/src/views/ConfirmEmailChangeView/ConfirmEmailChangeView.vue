<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

const status = ref<'loading' | 'ok' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  const token = route.query.token as string | undefined
  if (!token) {
    status.value = 'error'
    message.value = 'No confirmation token found in the link. Please request a new email change.'
    return
  }
  const err = await auth.confirmEmailChange(token)
  if (err) {
    status.value = 'error'
    message.value = err
  } else {
    status.value = 'ok'
    message.value = `Your email address has been updated to ${auth.user?.email}.`
    setTimeout(() => router.push('/profile'), 3000)
  }
})
</script>

<template>
  <div class="page auth-page">
    <div class="auth-card">
      <div v-if="status === 'loading'" class="state-msg" role="status">
        Confirming your new email address…
      </div>

      <template v-else-if="status === 'ok'">
        <div class="state-msg state-msg--ok" role="status">
          <svg xmlns="http://www.w3.org/2000/svg" class="state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p>{{ message }}</p>
          <p class="redirect-note">Redirecting to your profile…</p>
        </div>
      </template>

      <template v-else>
        <div class="state-msg state-msg--error" role="alert">
          <p>{{ message }}</p>
          <router-link to="/profile" class="auth-link">Back to profile</router-link>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth-page { display: flex; justify-content: center; align-items: flex-start; padding-top: 4rem; }
.auth-card  { background: var(--col-surface); border: 1px solid var(--col-border); border-radius: 10px; padding: 2rem; width: 100%; max-width: 420px; }
.state-msg  { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; text-align: center; font-size: 0.9375rem; color: var(--col-muted); }
.state-msg--ok    { color: var(--col-accent-dk); }
.state-msg--error { color: var(--col-error); }
.state-icon { width: 2.5rem; height: 2.5rem; }
.redirect-note { font-size: 0.8125rem; color: var(--col-subtle); }
.auth-link { color: var(--col-accent); text-decoration: none; font-size: 0.875rem; }
.auth-link:hover { text-decoration: underline; }
</style>
