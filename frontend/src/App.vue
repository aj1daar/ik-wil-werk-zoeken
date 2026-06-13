<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNavbar from './components/AppNavbar/AppNavbar.vue'
import { useAuthStore } from './stores/auth'
import { useSessionExpiry } from './composables/useSessionExpiry'

const route = useRoute()
const auth  = useAuthStore()
const { isExpiringSoon } = useSessionExpiry()

const showNav = computed(() =>
  auth.isAuthenticated && route.path !== '/login' && route.path !== '/register'
)

const expiryDismissed = ref(false)
</script>

<template>
  <AppNavbar v-if="showNav" />
  <div
    v-if="showNav && isExpiringSoon && !expiryDismissed"
    class="session-expiry-banner"
    role="alert"
  >
    <span>Your session expires in less than 24 hours. <router-link to="/login" @click="auth.logout()">Sign in again</router-link> to stay logged in.</span>
    <button @click="expiryDismissed = true" aria-label="Dismiss">✕</button>
  </div>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active { transition: none; }
}
</style>
