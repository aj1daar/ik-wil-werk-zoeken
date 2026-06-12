<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api'
import AppLogo from '../../components/AppLogo/AppLogo.vue'
import PasswordField from '../../components/PasswordField/PasswordField.vue'

const route  = useRoute()
const router = useRouter()

const token          = computed(() => (route.query.token as string) ?? '')
const newPassword    = ref('')
const confirmPassword = ref('')
const loading        = ref(false)
const error          = ref('')

onMounted(() => {
  if (!token.value) router.replace('/login')
})

async function submit() {
  if (!token.value || !newPassword.value) return
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  error.value   = ''
  try {
    await api.resetPassword(token.value, newPassword.value)
    sessionStorage.setItem('passwordReset', '1')
    router.push('/login')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not reset password. The link may have expired.'
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

    <div class="auth-card reset-card">
      <h1 class="auth-title">Set new password</h1>
      <p class="auth-subtitle">Choose a new password for your account.</p>

      <form @submit.prevent="submit" class="auth-form">
        <PasswordField
          id="new-password"
          label="New password"
          placeholder="At least 8 characters"
          autocomplete="new-password"
          input-class="auth-input"
          v-model="newPassword"
          :required="true"
          :minlength="8"
        />

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          placeholder="Repeat your new password"
          autocomplete="new-password"
          input-class="auth-input"
          v-model="confirmPassword"
          :required="true"
        />

        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading || !newPassword || !confirmPassword"
          class="btn-submit"
        >
          {{ loading ? 'Saving…' : 'Set new password' }}
        </button>
      </form>

      <p class="auth-footer">
        <router-link to="/login" class="auth-link">Back to sign in</router-link>
      </p>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
