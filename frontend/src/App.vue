<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { usePipelineStore, type ApplicationStage } from './stores/pipeline'

const stages: ApplicationStage[] = ['Bookmarked', 'Applied', 'Interviewing', 'Offered', 'Rejected']
const pipelineStore = usePipelineStore()

onMounted(() => {
  pipelineStore.seed()
})

const groupedCards = computed(() =>
  stages.map((stage) => ({
    stage,
    cards: pipelineStore.cards.filter((card) => card.stage === stage)
  }))
)
</script>

<template>
  <main class="min-h-screen bg-slate-950 text-slate-100 p-8">
    <div class="mx-auto max-w-7xl">
      <h1 class="text-3xl font-bold mb-2">HSM Sponsor Pipeline Dashboard</h1>
      <p class="text-slate-300 mb-8">Track applications for companies listed in the Dutch IND sponsor register.</p>
      <section class="grid gap-4 md:grid-cols-5">
        <article v-for="column in groupedCards" :key="column.stage" class="rounded-lg bg-slate-900 p-4 border border-slate-800">
          <h2 class="font-semibold mb-3">{{ column.stage }}</h2>
          <ul class="space-y-2">
            <li v-for="card in column.cards" :key="card.id" class="rounded bg-slate-800 p-3 text-sm">
              {{ card.companyName }}
            </li>
            <li v-if="column.cards.length === 0" class="text-sm text-slate-400">No entries</li>
          </ul>
        </article>
      </section>
    </div>
  </main>
</template>
