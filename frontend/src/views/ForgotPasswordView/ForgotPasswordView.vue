<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../../api'
import AppLogo from '../../components/AppLogo/AppLogo.vue'

const email     = ref('')
const loading   = ref(false)
const error     = ref('')
const submitted = ref(false)

async function submit() {
  if (!email.value) return
  loading.value = true
  error.value   = ''
  try {
    await api.forgotPassword(email.value.trim().toLowerCase())
    submitted.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-brand-wrap">
      <AppLogo :size="44" />
    </div>

    <div class="auth-card forgot-card">
      <template v-if="!submitted">
        <h1 class="auth-title">Forgot password</h1>
        <p class="auth-subtitle">Enter your email and we'll send you a reset link.</p>

        <form @submit.prevent="submit" class="auth-form">
          <div>
            <label class="field-label" for="fp-email">Email</label>
            <input
              id="fp-email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              class="auth-input"
              required
            />
          </div>

          <p v-if="error" class="auth-error">{{ error }}</p>

          <button type="submit" :disabled="loading || !email" class="btn-submit">
            {{ loading ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>
      </template>

      <template v-else>
        <h1 class="auth-title">Check your email</h1>
        <p class="auth-subtitle forgot-sent">
          If an account with <strong>{{ email }}</strong> exists, a password reset link has been sent.
          The link expires in 1 hour.
        </p>
      </template>

      <p class="auth-footer">
        <router-link to="/login" class="auth-link">Back to sign in</router-link>
      </p>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
