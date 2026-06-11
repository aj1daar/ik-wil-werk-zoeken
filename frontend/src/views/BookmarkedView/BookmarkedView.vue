<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCompaniesStore, STATUS_COLORS } from '../../stores/companies'

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

    <div v-if="store.loading" class="state-msg">Loading…</div>
    <div v-else-if="store.error" class="state-msg state-msg--error">{{ store.error }}</div>

    <template v-else>
      <section v-if="inProgress.length" class="bm-section">
        <h2 class="bm-section-title">In progress <span class="count">{{ inProgress.length }}</span></h2>
        <ul class="company-grid">
          <li v-for="row in inProgress" :key="row.id" class="company-card">
            <div class="company-card-header">
              <span class="company-name">{{ row.name }}</span>
              <span :class="['chip', STATUS_COLORS[row.record!.status] ?? 'status-viewed']">{{ row.record!.status }}</span>
            </div>
            <p v-if="row.coreIndustry" class="company-industry">{{ row.coreIndustry }}</p>
            <p v-if="row.record?.notes" class="company-notes">{{ row.record.notes }}</p>
            <div v-if="row.record?.cities?.length" class="company-cities">
              <span v-for="c in row.record.cities" :key="c" class="tag--muted">{{ c }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="bookmarked.length" class="bm-section">
        <h2 class="bm-section-title">Saved <span class="count">{{ bookmarked.length }}</span></h2>
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

<style src="./style.css" scoped></style>
