import { defineConfig } from 'tsup'

/**
 * Bundle the API into one file so the runtime image needs almost no
 * node_modules and Cloud Run starts fast -- a cold start is what a guest
 * waits on after scanning the QR.
 *
 * tsup leaves anything in `dependencies` external by default, which would
 * mean shipping nothing at all; noExternal reverses that. @photobooth/shared
 * has to be bundled regardless: it is workspace-only and not on any registry.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // A catch-all noExternal silently overrides `external`, which bundled
  // sharp's JavaScript without its native binding and crashed at import with
  // "Cannot read properties of undefined (reading 'output')". Excluding them
  // in the pattern itself leaves no room for that.
  noExternal: [/^(?!sharp$|@google-cloud\/storage)/],
  /**
   * Express and its CommonJS dependencies call require() for Node builtins.
   * esbuild's ESM output has no require, so those throw "Dynamic require of
   * path is not supported" at startup. Providing one built from
   * import.meta.url satisfies them -- esbuild's own shim uses a global
   * require when it finds one.
   */
  banner: {
    js: "import { createRequire as __nodeRequire } from 'node:module';\nconst require = __nodeRequire(import.meta.url);",
  },
  external: [
    // Platform-specific binaries; cannot be bundled.
    'sharp',
    // Resolves auth and transport plugins at runtime, which survives bundling
    // badly. Installed in the image instead.
    '@google-cloud/storage',
  ],
})
