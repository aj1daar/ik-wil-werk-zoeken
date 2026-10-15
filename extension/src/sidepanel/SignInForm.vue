<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../lib/api'
import { setToken } from '../lib/auth'

// The fallback way in. The quick way is the Connect button on the Profile page in
// the app, which hands the panel the session it already has; this is for when the
// app is not open, or after Chrome has restarted and the stored session is gone.
const emit = defineEmits<{ signedIn: [] }>()

const email    = ref('')
const password = ref('')
const busy     = ref(false)
const error    = ref('')

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Email and password are both needed.'
    return
  }

  busy.value = true
  try {
    const { token } = await api.login(email.value.trim(), password.value)
    await setToken(token)
    // Nothing keeps the password after this point, here or anywhere else.
    password.value = ''
    emit('signedIn')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="signin" @submit.prevent="submit">
    <p class="signin-lead">Sign in to save job postings to your tracker.</p>

    <div class="field">
      <label class="field-label" for="panel-email">Email</label>
      <input
        id="panel-email"
        v-model="email"
        class="field-input"
        type="email"
        autocomplete="username"
        inputmode="email"
      />
    </div>

    <div class="field">
      <label class="field-label" for="panel-password">Password</label>
      <input
        id="panel-password"
        v-model="password"
        class="field-input"
        type="password"
        autocomplete="current-password"
      />
    </div>

    <p v-if="error" class="save-error" role="alert">{{ error }}</p>

    <button type="submit" class="btn-primary panel-submit" :disabled="busy">
      {{ busy ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>

<style scoped>
.signin { display: flex; flex-direction: column; gap: 1rem; }
.signin-lead { font-size: .875rem; color: var(--col-muted); margin: 0; }
.field { display: flex; flex-direction: column; gap: .375rem; }
.save-error { color: var(--col-error); font-size: .875rem; margin: 0; }
.panel-submit { width: 100%; justify-content: center; }
</style>
