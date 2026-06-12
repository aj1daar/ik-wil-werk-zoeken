<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from '../../composables/useTheme'
import AppLogo from '../AppLogo/AppLogo.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const { theme, toggle } = useTheme()

function signOut() {
  auth.logout()
  router.push('/login')
}

const NAV_LINKS = [
  { to: '/',             label: 'Home' },
  { to: '/applications', label: 'My Applications' },
  { to: '/companies',    label: 'Companies' },
  { to: '/profile',      label: 'Profile' },
]
</script>

<template>
  <nav class="app-nav">
    <div class="nav-left">
      <router-link to="/" class="nav-logo-link" aria-label="Home">
        <AppLogo :size="30" :dark="true" />
      </router-link>

      <ul class="nav-links" role="list">
        <li v-for="link in NAV_LINKS" :key="link.to">
          <router-link
            :to="link.to"
            :class="['nav-link', route.path === link.to && 'nav-link--active']"
          >
            {{ link.label }}
          </router-link>
        </li>
      </ul>
    </div>

    <div class="nav-right">
      <button
        class="btn-icon nav-theme"
        @click="toggle"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <svg v-if="theme === 'dark'" xmlns="http://www.w3.org/2000/svg" class="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      </button>
      <button class="nav-signout btn-ghost" @click="signOut">Sign out</button>
    </div>
  </nav>
</template>

<style src="./style.css" scoped></style>
