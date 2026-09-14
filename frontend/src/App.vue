<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNavbar from './components/AppNavbar/AppNavbar.vue'
import { useAuthStore } from './stores/auth'
import { useSessionExpiry } from './composables/useSessionExpiry'
import { useTokenRefresh } from './composables/useTokenRefresh'
import { supportsViewTransitions } from './router/viewTransition'
import AppIcon from './components/ui/AppIcon.vue'

const route = useRoute()
const auth  = useAuthStore()
const { isExpiringSoon } = useSessionExpiry()
const { refreshing, refreshError, extendSession } = useTokenRefresh()

const showNav = computed(() =>
  auth.isAuthenticated && route.path !== '/login' && route.path !== '/register'
)

const expiryDismissed = ref(false)

// The browser draws the page cross-fade itself when it can (router/viewTransition.ts);
// the CSS fade below is only for browsers that can't, and must not run on top of it.
const nativePageTransitions = supportsViewTransitions()
</script>

<template>
  <AppNavbar v-if="showNav" />
  <div
    v-if="showNav && isExpiringSoon && !expiryDismissed"
    class="session-expiry-banner"
    role="alert"
  >
    <span>Your session expires soon. <router-link to="/login" @click="auth.logout()">Sign in again</router-link> to stay logged in.</span>
    <button
      class="expiry-extend"
      :disabled="refreshing"
      @click="extendSession"
      aria-label="Extend session"
    >{{ refreshing ? 'Extending…' : 'Extend session' }}</button>
    <span v-if="refreshError" class="expiry-error" role="alert">{{ refreshError }}</span>
    <button @click="expiryDismissed = true" aria-label="Dismiss"><AppIcon name="close" class="icon-1em" /></button>
  </div>

  <RouterView v-slot="{ Component }">
    <component v-if="nativePageTransitions" :is="Component" :key="route.path" />
    <Transition v-else name="page" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
</template>

<style>
/* A quick cross-fade between routes — no slide, so pages don't appear to
   move under the pointer on every navigation. */
.page-enter-active,
.page-leave-active {
  transition: opacity var(--dur-base) var(--ease-standard);
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active { transition: none; }
}
.expiry-extend {
  padding: .25rem .625rem; font-size: .8rem; border-radius: var(--radius-sm);
  border: 1px solid currentColor; background: none; cursor: pointer; color: inherit;
}
.expiry-extend:disabled { opacity: .5; cursor: not-allowed; }
.expiry-error { font-size: .75rem; color: var(--col-error); }
</style>
