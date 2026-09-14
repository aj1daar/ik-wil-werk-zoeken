<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
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
  { to: '/applications', label: 'My applications' },
  { to: '/companies',    label: 'Companies' },
  { to: '/profile',      label: 'Profile' },
]

const TERMINAL = new Set(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])
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
            <!-- A real element, not ::after, so a page change can slide it to the new link -->
            <span v-if="route.path === link.to" class="nav-marker" aria-hidden="true" />
            <template v-if="link.to === '/applications' && activeCount() > 0">
              <span class="nav-badge" aria-hidden="true" :title="`${activeCount()} open applications`">{{ activeCount() }}</span>
              <span class="sr-only">({{ activeCount() }} open)</span>
            </template>
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
        <AppIcon name="sun" v-if="theme === 'dark'" class="theme-icon" />
        <AppIcon name="moon" v-else class="theme-icon" />
      </button>
      <router-link v-if="auth.user?.role === 'admin'" to="/admin" class="btn-ghost nav-admin desktop-only">Admin panel</router-link>
      <button class="nav-signout btn-ghost desktop-only" @click="signOut">Sign out</button>

      <!-- Hamburger (mobile only) -->
      <button
        class="btn-icon nav-hamburger"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen"
        aria-controls="mobile-menu"
        aria-label="Toggle navigation menu"
      >
        <AppIcon name="menu" v-if="!menuOpen" class="theme-icon" />
        <AppIcon name="close" v-else class="theme-icon" />
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
        <template v-if="link.to === '/applications' && activeCount() > 0">
          <span class="nav-badge" aria-hidden="true">{{ activeCount() }}</span>
          <span class="sr-only">({{ activeCount() }} open)</span>
        </template>
      </router-link>
      <router-link v-if="auth.user?.role === 'admin'" to="/admin" class="mobile-link" @click="closeMenu" role="menuitem">
        Admin panel
      </router-link>
      <button class="mobile-signout" @click="signOut" role="menuitem">Sign out</button>
    </div>
  </nav>
</template>

<style src="./style.css" scoped></style>
