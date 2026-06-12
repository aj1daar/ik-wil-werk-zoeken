<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import AppLogo from '../AppLogo/AppLogo.vue'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

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

    <button class="nav-signout btn-ghost" @click="signOut">Sign out</button>
  </nav>
</template>

<style src="./style.css" scoped></style>
