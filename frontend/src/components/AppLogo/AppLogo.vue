<script setup lang="ts">
withDefaults(defineProps<{ size?: number; dark?: boolean }>(), { size: 34, dark: false })
</script>

<template>
  <div :class="['app-logo', dark && 'app-logo--dark']">
    <svg :width="size" :height="size" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#B25E2A"/>
      <circle cx="15.5" cy="15.5" r="6" stroke="#FAF7F2" stroke-width="2" fill="none"/>
      <path d="M20 20L25 25" stroke="#FAF7F2" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M13.5 15.5h4M15.5 13.5l2 2-2 2" stroke="#FAF7F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="app-logo-text">
      <span class="app-logo-light">ik wil werk </span><span class="app-logo-bold">zoeken</span>
    </span>
  </div>
</template>

<style src="./style.css" scoped></style>
