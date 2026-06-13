<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from '../../composables/useTheme'
import { useApplicationsStore } from '../../stores/applications'
import AppLogo from '../AppLogo/AppLogo.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const apps   = useApplicationsStore()
const { theme, toggle } = useTheme()

const menuOpen = ref(false)

function signOut() {
  auth.logout()
  router.push('/login')
}

function closeMenu() { menuOpen.value = false }

const NAV_LINKS = [
  { to: '/',             label: 'Home' },
  { to: '/applications', label: 'My Applications' },
  { to: '/companies',    label: 'Companies' },
  { to: '/profile',      label: 'Profile' },
]

const TERMINAL = new Set(['Rejected', 'Withdrawn', 'Accepted'])
const activeCount = () =>
  apps.applications.filter(a => !TERMINAL.has(a.status)).length
</script>

<template>
  <nav class="app-nav" :class="{ 'menu-open': menuOpen }">
    <div class="nav-left">
      <router-link to="/" class="nav-logo-link" aria-label="Home" @click="closeMenu">
        <AppLogo :size="30" :dark="true" />
      </router-link>

      <ul class="nav-links" role="list">
        <li v-for="link in NAV_LINKS" :key="link.to">
          <router-link
            :to="link.to"
            :class="['nav-link', route.path === link.to && 'nav-link--active']"
          >
            {{ link.label }}
            <span v-if="link.to === '/applications' && activeCount() > 0" class="nav-badge">
              {{ activeCount() }}
            </span>
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
      <router-link v-if="auth.user?.role === 'admin'" to="/admin" class="btn-ghost nav-admin desktop-only">Admin Panel</router-link>
      <button class="nav-signout btn-ghost desktop-only" @click="signOut">Sign out</button>

      <!-- Hamburger (mobile only) -->
      <button
        class="btn-icon nav-hamburger"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen"
        aria-controls="mobile-menu"
        aria-label="Toggle navigation menu"
      >
        <svg v-if="!menuOpen" xmlns="http://www.w3.org/2000/svg" class="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="theme-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Mobile dropdown -->
    <div v-if="menuOpen" id="mobile-menu" class="mobile-menu" role="menu">
      <router-link
        v-for="link in NAV_LINKS"
        :key="link.to"
        :to="link.to"
        :class="['mobile-link', 'mobile-nav-link', route.path === link.to && 'mobile-link--active']"
        @click="closeMenu"
        role="menuitem"
      >
        {{ link.label }}
        <span v-if="link.to === '/applications' && activeCount() > 0" class="nav-badge">
          {{ activeCount() }}
        </span>
      </router-link>
      <router-link v-if="auth.user?.role === 'admin'" to="/admin" class="mobile-link" @click="closeMenu" role="menuitem">
        Admin Panel
      </router-link>
      <button class="mobile-signout" @click="signOut" role="menuitem">Sign out</button>
    </div>
  </nav>
</template>

<style src="./style.css" scoped></style>
