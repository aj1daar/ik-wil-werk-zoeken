import type { Config } from 'tailwindcss'

// The panel pulls in the app's style.css, whose @layer components classes only
// survive the build if the class name appears literally in a scanned file — so
// the app's own sources are scanned too, not just the panel's.
export default {
  content: [
    './src/**/*.{vue,ts,html}',
    '../frontend/src/**/*.{vue,ts}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
