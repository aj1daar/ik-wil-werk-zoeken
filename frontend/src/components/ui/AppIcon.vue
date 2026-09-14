<script setup lang="ts">
import { ICONS, type IconName } from './icons'

defineProps<{ name: IconName }>()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Decorative by definition: an icon always sits beside a label, or inside a
         control that carries its own aria-label. Size it with a class (width and
         height); the stroke stays 1.5px at every size because it doesn't scale
         with the drawing — a 16px chevron and a 24px close button match. -->
    <path v-for="d in ICONS[name]" :key="d" :d="d" vector-effect="non-scaling-stroke" />
  </svg>
</template>
