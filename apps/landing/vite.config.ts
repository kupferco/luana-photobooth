import { defineConfig } from 'vite'

/**
 * The landing page.
 *
 * No framework and no client-side routing: it is one page of text and
 * pictures that someone loads once, often from a phone on a bad connection
 * after following a link from a shared photo. React would be more bytes than
 * the content.
 */
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
})
