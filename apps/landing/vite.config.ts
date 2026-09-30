import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { render } from './render'

/**
 * The landing page.
 *
 * No framework and no client-side routing: it is a few pages of text and
 * pictures that someone loads once, often from a phone on a bad connection
 * after following a link from a shared photo. React would be more bytes than
 * the content.
 *
 * The pages are written out by render.ts before Vite looks for them: one
 * index.html per page per language, each in its own folder, so /setup/ and
 * /pt/setup/ are real files on the host and need no rewrite rule.
 */

/**
 * Re-renders when a page template changes.
 *
 * The copy in locales/ needs no watching: it is imported by this config, so
 * Vite restarts the server when it changes and the pages are rendered again
 * on the way back up.
 */
function pages(): Plugin {
  const templates = join(__dirname, 'pages')

  return {
    name: 'lumina-pages',
    configureServer(server) {
      server.watcher.add(templates)
      server.watcher.on('change', (file) => {
        if (!file.startsWith(templates)) return
        render()
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export default defineConfig({
  plugins: [pages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: render() },
  },
})
