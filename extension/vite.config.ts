import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))

// Two entries: the side panel page and the service worker. Chrome loads both by
// a fixed path out of the manifest, so nothing may carry a content hash.
export default defineConfig({
  root: resolve(here, 'src'),
  publicDir: resolve(here, 'public'),
  plugins: [vue()],
  resolve: {
    // The panel reuses the app's own tokens and controls instead of a second copy
    // of AppIcon, DatePicker and the company combobox that would drift from them.
    alias: { '@app': resolve(here, '../frontend/src') },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        sidepanel: resolve(here, 'src/sidepanel/index.html'),
        'service-worker': resolve(here, 'src/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
