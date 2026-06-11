<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCompaniesStore, STATUS_COLORS } from '../stores/companies'

const store = useCompaniesStore()
onMounted(() => store.load())

const bookmarked = computed(() =>
  store.tracked.filter(r => r.record?.status === 'Bookmarked')
)

const inProgress = computed(() =>
  store.tracked.filter(r =>
    r.record && !['Bookmarked','Abandoned','Rejected','Declined Offer'].includes(r.record.status)
  )
)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Bookmarked</h1>
      <p class="page-subtitle">Companies you've saved and applications in progress.</p>
    </div>

    <!-- Loading / error -->
    <div v-if="store.loading" class="state-msg">Loading…</div>
    <div v-else-if="store.error" class="state-msg state-msg--error">{{ store.error }}</div>

    <template v-else>
      <!-- In progress -->
      <section v-if="inProgress.length" class="section">
        <h2 class="section-title">In progress <span class="count">{{ inProgress.length }}</span></h2>
        <ul class="company-grid">
          <li v-for="row in inProgress" :key="row.id" class="company-card">
            <div class="company-card-header">
              <span class="company-name">{{ row.name }}</span>
              <span :class="['chip', STATUS_COLORS[row.record!.status] ?? 'status-viewed']">
                {{ row.record!.status }}
              </span>
            </div>
            <p v-if="row.coreIndustry" class="company-industry">{{ row.coreIndustry }}</p>
            <p v-if="row.record?.notes" class="company-notes">{{ row.record.notes }}</p>
            <div v-if="row.record?.cities?.length" class="company-cities">
              <span v-for="c in row.record.cities" :key="c" class="tag--muted">{{ c }}</span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Bookmarked -->
      <section v-if="bookmarked.length" class="section">
        <h2 class="section-title">Saved <span class="count">{{ bookmarked.length }}</span></h2>
        <ul class="company-grid">
          <li v-for="row in bookmarked" :key="row.id" class="company-card">
            <div class="company-card-header">
              <span class="company-name">{{ row.name }}</span>
              <span class="chip status-bookmarked">Bookmarked</span>
            </div>
            <p v-if="row.coreIndustry" class="company-industry">{{ row.coreIndustry }}</p>
            <p v-if="row.summary" class="company-summary">{{ row.summary }}</p>
          </li>
        </ul>
      </section>

      <!-- Empty -->
      <div v-if="!bookmarked.length && !inProgress.length" class="empty-state">
        <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <p class="empty-title">No bookmarks yet</p>
        <p class="empty-body">
          Search for companies on the <router-link to="/" class="auth-link">Home</router-link> page
          and start tracking ones you're interested in.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }

.page-header { margin-bottom: 2rem; }
.page-title  { font-size: 1.5rem; font-weight: 700; color: var(--col-text); margin: 0 0 0.25rem; }
.page-subtitle { font-size: 0.875rem; color: var(--col-muted); margin: 0; }

.state-msg { padding: 2rem; text-align: center; color: var(--col-subtle); font-size: 0.875rem; }
.state-msg--error { color: var(--col-error); }

.section { margin-bottom: 2.5rem; }
.section-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.count {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--col-raised);
  color: var(--col-muted);
}

.company-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.company-card {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: 10px;
  padding: 1rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: box-shadow 0.15s;
}
.company-card:hover { box-shadow: 0 2px 12px color-mix(in srgb, var(--col-text) 8%, transparent); }

.company-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.company-name     { font-size: 0.9375rem; font-weight: 600; color: var(--col-text); flex: 1; }
.company-industry { font-size: 0.75rem; color: var(--col-subtle); margin: 0; }
.company-notes    { font-size: 0.8125rem; color: var(--col-muted); margin: 0; line-height: 1.5; }
.company-summary  { font-size: 0.8125rem; color: var(--col-muted); margin: 0; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.company-cities   { display: flex; flex-wrap: wrap; gap: 0.375rem; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4rem 2rem;
  text-align: center;
}
.empty-icon  { width: 3rem; height: 3rem; color: var(--col-subtle); margin-bottom: 1rem; }
.empty-title { font-size: 1rem; font-weight: 600; color: var(--col-text); margin: 0 0 0.5rem; }
.empty-body  { font-size: 0.875rem; color: var(--col-muted); margin: 0; max-width: 360px; line-height: 1.6; }
.auth-link   { color: var(--col-accent); text-decoration: none; font-weight: 500; }
</style>
