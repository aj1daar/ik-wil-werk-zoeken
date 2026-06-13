<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  title?:         string
  message:        string
  confirmLabel?:  string
  confirmClass?:  string
  cancelLabel?:   string
}>(), {
  title:         'Are you sure?',
  confirmLabel:  'OK',
  confirmClass:  'btn-primary',
  cancelLabel:   'Cancel',
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
}

onMounted(() => { document.addEventListener('keydown', onKey) })
onUnmounted(() => { document.removeEventListener('keydown', onKey) })
</script>

<template>
  <Teleport to="body">
    <div class="cd-backdrop" @mousedown.self="emit('cancel')">
      <div class="cd-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="'cd-title'" :aria-describedby="'cd-msg'">
        <h3 id="cd-title" class="cd-title">{{ title }}</h3>
        <p id="cd-msg" class="cd-message">{{ message }}</p>
        <div class="cd-actions">
          <button :class="['cd-cancel', 'btn-ghost']" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button :class="['cd-confirm', confirmClass]" @click="emit('confirm')" autofocus>{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: color-mix(in srgb, var(--col-text) 40%, transparent);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}

.cd-dialog {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.5rem;
  width: min(360px, calc(100vw - 2rem));
  box-shadow: 0 8px 32px color-mix(in srgb, var(--col-text) 18%, transparent);
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.cd-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0;
}

.cd-message {
  font-size: .875rem;
  color: var(--col-muted);
  margin: 0;
  line-height: 1.5;
}

.cd-actions {
  display: flex;
  justify-content: flex-end;
  gap: .5rem;
  margin-top: .25rem;
}
</style>
