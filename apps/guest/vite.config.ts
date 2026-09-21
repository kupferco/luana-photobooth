import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The guest page is the only thing a stranger loads, on congested party wifi,
 * with no install. Keeping it small is the entire reason it is not part of
 * the Expo app, whose web export measures 305 KB gzipped.
 */
export default defineConfig({
  build: {
    target: 'es2020',
    // Small enough that splitting costs a round trip rather than saving one.
    rollupOptions: { output: { manualChunks: undefined } },
  },
  plugins: [react()],
})
