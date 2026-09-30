import { defineConfig } from 'vite'

/**
 * The landing page.
 *
 * No framework and no client-side routing: it is a few pages of text and
 * pictures that someone loads once, often from a phone on a bad connection
 * after following a link from a shared photo. React would be more bytes than
 * the content.
 *
 * Each page is its own index.html in its own folder, so /setup/ and /install/
 * are real files on the host and need no rewrite rule.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        setup: 'setup/index.html',
        install: 'install/index.html',
      },
    },
  },
})
