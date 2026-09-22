import { defineConfig } from 'tsup'

/**
 * Two entry points, both fully bundled.
 *
 * The Pi runs `node dist/index.js` and nothing else -- no npm install, no
 * node_modules, no workspace. A deploy is rsync plus a restart, which is what
 * keeps iterating on a machine in a cupboard bearable. tsup leaves
 * dependencies external by default, which would have quietly broken that.
 *
 * pair.js is its own entry because pairing is a thing a person runs once, by
 * hand, over SSH. onboard.js is a third because it runs before there is any
 * network at all, and must not depend on the agent having started.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/pair.ts', 'src/onboard.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: [/.*/],
})
