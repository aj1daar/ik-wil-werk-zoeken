import { ref, watch } from 'vue'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'iwwz_theme'

const theme = ref<Theme>(
  (window.localStorage?.getItem(STORAGE_KEY) as Theme) ?? 'light'
)

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

apply(theme.value)

watch(theme, (t) => {
  apply(t)
  window.localStorage?.setItem(STORAGE_KEY, t)
})

export function useTheme() {
  return {
    theme,
    toggle() { theme.value = theme.value === 'dark' ? 'light' : 'dark' },
  }
}
