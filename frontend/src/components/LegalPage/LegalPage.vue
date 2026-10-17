<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppLogo from '../AppLogo/AppLogo.vue'

// The frame both legal pages sit in: the privacy notice and the terms. They are
// read in the same situation, by somebody deciding whether to make an account,
// so they are laid out once here rather than twice in two views that drift.
defineProps<{ title: string; version: string }>()

const router = useRouter()
const goBack = () => (window.history.length > 1 ? router.back() : router.push('/login'))
</script>

<template>
  <div class="legal-page">
    <div class="legal-brand">
      <AppLogo :size="40" />
    </div>

    <article class="card legal-card">
      <h1 class="legal-title">{{ title }}</h1>
      <p class="legal-meta">Version {{ version }}</p>

      <slot />

      <button type="button" class="btn-secondary legal-back" @click="goBack">Go back</button>
    </article>
  </div>
</template>

<style scoped>
.legal-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.legal-card { width: 100%; }

.legal-title { font-size: 1.5rem; font-weight: 600; color: var(--col-text); margin: 0; }
.legal-meta  { font-size: .8125rem; color: var(--col-subtle); margin: .25rem 0 1.5rem; }

/* The sections come in through the slot, so they carry the view's scope and
   not this component's: :slotted reaches them. */
.legal-card :slotted(p) {
  font-size: .875rem; line-height: 1.6; color: var(--col-muted); margin: 0 0 1rem;
}

.legal-card :slotted(ul) {
  list-style: disc; padding-left: 1.25rem; margin: 0 0 1rem;
  display: flex; flex-direction: column; gap: .375rem;
  font-size: .875rem; line-height: 1.6; color: var(--col-muted);
}

.legal-back { margin-top: .5rem; }

@media (max-width: 767px) {
  .legal-page { padding: 1rem .75rem 2rem; }
  .legal-back { width: 100%; justify-content: center; }
}
</style>
