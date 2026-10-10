import { createApp } from 'vue'
import SidePanel from './SidePanel.vue'
// Bundled with the extension rather than fetched: extension pages may not load
// remote resources, and the app self-hosts these for GDPR in any case.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
// The app's own tokens, shared classes and controls, so the panel is the same
// design system rather than a lookalike.
import '@app/style.css'
import './panel.css'

// The app's theme is a choice stored in its own localStorage, which an
// extension page cannot read. A panel that sits beside whatever page is open
// follows the system instead, and keeps following it if it changes.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (isDark: boolean) =>
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')

applyTheme(dark.matches)
dark.addEventListener('change', event => applyTheme(event.matches))

createApp(SidePanel).mount('#app')
