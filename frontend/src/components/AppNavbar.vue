<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

function logout() {
  auth.logout()
  router.push('/login')
}

const navLinks = [
  { to: '/',           label: 'Home' },
  { to: '/bookmarked', label: 'Bookmarked' },
  { to: '/profile',    label: 'Profile' },
]

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <nav class="app-nav">
    <!-- Left: logo -->
    <router-link to="/" class="nav-logo" aria-label="ik wil werk zoeken home">
      <!-- Compass-search icon -->
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect width="34" height="34" rx="9" fill="#B25E2A"/>
        <!-- Magnifying glass body -->
        <circle cx="15.5" cy="15.5" r="6" stroke="#FAF7F2" stroke-width="2" fill="none"/>
        <!-- Lens handle -->
        <path d="M20 20L25 25" stroke="#FAF7F2" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Arrow inside lens — representing forward direction -->
        <path d="M13.5 15.5h4M15.5 13.5l2 2-2 2" stroke="#FAF7F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="nav-logo-text">
        <span class="nav-logo-light">ik wil werk </span><span class="nav-logo-bold">zoeken</span>
      </span>
    </router-link>

    <!-- Center: nav links -->
    <div class="nav-links">
      <router-link
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        :class="['nav-link', { 'nav-link--active': isActive(link.to) }]"
      >
        {{ link.label }}
      </router-link>
    </div>

    <!-- Right: sign out -->
    <button @click="logout" class="nav-signout">Sign out</button>
  </nav>
</template>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 1.5rem;
  height: 60px;
  background: var(--col-nav);
  border-bottom: 1px solid color-mix(in srgb, var(--col-nav-text) 10%, transparent);
}

/* Logo */
.nav-logo {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
  flex-shrink: 0;
}
.nav-logo-text {
  font-size: 0.9rem;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--col-nav-text);
}
.nav-logo-light { font-weight: 400; opacity: 0.85; }
.nav-logo-bold  { font-weight: 700; color: var(--col-nav-active); }

/* Nav links */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
}
.nav-link {
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--col-nav-muted);
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}
.nav-link:hover {
  color: var(--col-nav-text);
  background: color-mix(in srgb, var(--col-nav-text) 8%, transparent);
}
.nav-link--active {
  color: var(--col-nav-active);
  background: color-mix(in srgb, var(--col-nav-active) 12%, transparent);
}

/* Sign out */
.nav-signout {
  margin-left: auto;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--col-nav-muted) 50%, transparent);
  border-radius: 6px;
  padding: 0.3rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--col-nav-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.nav-signout:hover {
  color: var(--col-nav-text);
  border-color: var(--col-nav-muted);
}

/* Mobile: hide link labels, show icons-only would go here */
@media (max-width: 480px) {
  .nav-logo-text { display: none; }
  .nav-links { gap: 0; }
  .nav-link { padding: 0.375rem 0.625rem; font-size: 0.8125rem; }
}
</style>
