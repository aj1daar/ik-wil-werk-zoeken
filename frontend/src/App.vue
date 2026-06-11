<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNavbar from './components/AppNavbar.vue'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const auth  = useAuthStore()

const showNav = computed(() =>
  auth.isAuthenticated && route.path !== '/login' && route.path !== '/register'
)
</script>

<template>
  <AppNavbar v-if="showNav" />
  <RouterView />
</template>
