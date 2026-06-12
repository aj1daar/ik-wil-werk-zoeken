<script setup lang="ts">
defineProps<{ message: { text: string; ok: boolean } | null }>()
</script>

<template>
  <div
    v-if="message"
    :class="['form-msg', message.ok ? 'form-msg--ok' : 'form-msg--err']"
    :role="message.ok ? 'status' : 'alert'"
  >
    {{ message.text }}
  </div>
</template>
