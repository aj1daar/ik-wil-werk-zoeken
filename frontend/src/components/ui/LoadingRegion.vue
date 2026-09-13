<script setup lang="ts">
defineProps<{
  // What is loading, for screen readers: "Loading your applications"
  label: string
}>()
</script>

<template>
  <div class="loading-region" role="status">
    <!-- Grey shapes in the layout of what's coming, instead of a "Loading…" line
         that the real content then shoves out of the way. Screen readers get the
         label; the shapes in the slot should carry aria-hidden="true". The whole
         region waits --dur-base before fading in, so a fast response never
         flashes placeholders at all. -->
    <span class="sr-only">{{ label }}</span>
    <slot />
  </div>
</template>
