import { onScopeDispose, ref, type Ref } from 'vue'

// CSS can switch animation off for a reader who asks for less motion (see the
// backstop at the end of style.css). Canvas can't read CSS, so ECharts needs
// the same answer in JavaScript — and live, because the setting can change
// while the page is open.
export function useReducedMotion(): Ref<boolean> {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
  const reduced = ref(!!query?.matches)
  if (!query?.addEventListener) return reduced

  const onChange = (e: MediaQueryListEvent) => { reduced.value = e.matches }
  query.addEventListener('change', onChange)
  onScopeDispose(() => query.removeEventListener('change', onChange))
  return reduced
}
