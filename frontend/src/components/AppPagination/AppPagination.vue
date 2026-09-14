<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../ui/AppIcon.vue'

// One pagination for every list. My applications and Companies each used to
// carry their own copy; a phone fix landed in one and not the other, and the
// "next" arrow went on wrapping onto a line of its own in the second.
const props = defineProps<{
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{ 'update:page': [page: number] }>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

// Desktop shows first, last, and up to two pages either side of the current
// one. Phones show only first, current and last, so five 44px buttons at most
// fit the narrowest phone in use (360px) on one line. Both rows live in one
// list: every item says which of the two it belongs to, and each row gets its
// own "…" wherever it skips pages, so a trimmed phone row never reads "1 3 10".
interface Item { page: number | null; desktop: boolean; phone: boolean }

const items = computed((): Item[] => {
  const total = pageCount.value
  const cur = Math.min(Math.max(1, props.page), total)
  const desktop = total <= 7
    ? Array.from({ length: total }, (_, i) => i + 1)
    : [...new Set([1, total, cur - 2, cur - 1, cur, cur + 1, cur + 2])].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const phone = new Set([1, cur, total])

  const out: Item[] = []
  let prevDesktop = 0
  let prevPhone = 0
  for (const p of desktop) {
    const desktopGap = prevDesktop > 0 && p - prevDesktop > 1
    const onPhone = phone.has(p)
    const phoneGap = onPhone && prevPhone > 0 && p - prevPhone > 1
    if (desktopGap || phoneGap) out.push({ page: null, desktop: desktopGap, phone: phoneGap })
    out.push({ page: p, desktop: true, phone: onPhone })
    prevDesktop = p
    if (onPhone) prevPhone = p
  }
  return out
})

// "12,790", not "12790"
const fmt = (n: number) => n.toLocaleString('en-GB')
const first = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const last  = computed(() => Math.min(props.page * props.pageSize, props.total))

function go(page: number) {
  const clamped = Math.min(Math.max(1, page), pageCount.value)
  if (clamped !== props.page) emit('update:page', clamped)
}
</script>

<template>
  <nav class="pagination" aria-label="Pages">
    <span class="pagination-info">{{ fmt(first) }}–{{ fmt(last) }} of {{ fmt(total) }}</span>
    <span class="pagination-buttons">
      <button type="button" class="page-btn" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)">
        <AppIcon name="chevron-left" class="page-arrow" />
      </button>
      <template v-for="(item, i) in items" :key="i">
        <span
          v-if="item.page === null"
          :class="['page-ellipsis', { 'desktop-only': !item.phone, 'phone-only': !item.desktop }]"
          aria-hidden="true"
        >…</span>
        <button
          v-else
          type="button"
          :class="['page-btn', { 'page-btn--active': item.page === page, 'desktop-only': !item.phone }]"
          :aria-current="item.page === page ? 'page' : undefined"
          @click="go(item.page)"
        >{{ item.page }}</button>
      </template>
      <button type="button" class="page-btn" :disabled="page >= pageCount" aria-label="Next page" @click="go(page + 1)">
        <AppIcon name="chevron-right" class="page-arrow" />
      </button>
    </span>
  </nav>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  gap: .4rem;
}
.pagination-info {
  font-size: .72rem;
  color: var(--col-subtle);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* The buttons never wrap among themselves: on a phone the row is trimmed to
   fit instead (see below), so "next" can't end up alone on a line */
.pagination-buttons {
  display: flex;
  align-items: center;
  gap: .25rem;
  flex-wrap: nowrap;
}
.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 .4rem;
  border: 1px solid var(--col-border);
  border-radius: var(--radius);
  background: var(--col-bg);
  color: var(--col-muted);
  font: inherit;
  font-size: .8rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--dur-instant) var(--ease-standard), color var(--dur-instant) var(--ease-standard);
}
.page-btn:hover:not(:disabled) { background: var(--col-raised); color: var(--col-text); }
.page-btn--active { background: var(--col-invert-bg); color: var(--col-invert-text); border-color: var(--col-invert-bg); font-weight: 600; }
.page-btn:disabled { opacity: .35; cursor: default; }
.page-arrow { width: 1rem; height: 1rem; }
.page-ellipsis { padding: 0 .15rem; color: var(--col-subtle); font-size: .8rem; }
.phone-only { display: none; }

/* Phones: the count on a line of its own, then one line of buttons trimmed to
   first, current and last with the arrows (see `items`) */
@media (max-width: 767px) {
  .pagination { flex-wrap: wrap; justify-content: center; row-gap: .375rem; }
  .pagination-info { flex-basis: 100%; text-align: center; font-size: .8125rem; }
  .page-btn { min-width: 2.75rem; height: 2.75rem; }  /* Apple HIG 44pt tap target */
  .desktop-only { display: none; }
  .phone-only { display: inline; }
}
</style>
