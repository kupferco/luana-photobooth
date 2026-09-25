/**
 * Builds every icon the app needs from one source logo.
 *
 * Run after changing branding/logo/logo-source.png:
 *
 *   npm run branding
 *
 * Kept as a script rather than hand-exported files so the sizes, padding and
 * background stay consistent, and so replacing the logo is one command rather
 * than an afternoon in an image editor.
 *
 * The rules each platform imposes are the reason this is not just a resize:
 *
 * - iOS app icons cannot be transparent. A transparent PNG renders black, so
 *   the logo is placed on the brand colour.
 * - Android adaptive icons are cropped to a circle, squircle or rounded
 *   square depending on the launcher, and only the middle ~66% is guaranteed
 *   visible. The foreground therefore gets generous padding.
 * - The splash keeps its transparency, because Expo draws it on the splash
 *   background colour itself.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(here, 'logo', 'logo-source.png')
const LOGO = join(here, 'logo')
const ASSETS = join(here, '..', 'apps', 'mobile', 'assets')

/** amber.500 — the same yellow as the primary button. */
const BRAND = '#f5c518'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * The logo, cropped to its own edges and centred on a square.
 *
 * `scale` is how much of the square the logo fills. Anything destined for an
 * Android adaptive icon needs to stay well inside, because the launcher will
 * crop it.
 */
async function square(size, scale, background) {
  const trimmed = await sharp(SOURCE).trim().toBuffer()
  const inner = Math.round(size * scale)

  const fitted = await sharp(trimmed)
    .resize(inner, inner, { fit: 'inside', background: TRANSPARENT })
    .toBuffer()

  const { width = inner, height = inner } = await sharp(fitted).metadata()

  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png()
    .toBuffer()
}

/** A flat silhouette, for Android's themed icons. */
async function monochrome(size) {
  const shape = await square(size, 0.58, TRANSPARENT)
  const alpha = await sharp(shape).extractChannel('alpha').toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 3, background: '#000000' },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer()
}

/**
 * `flatten` drops the alpha channel entirely.
 *
 * Not merely "fully opaque": sharp keeps an all-255 alpha channel, and the
 * App Store rejects an icon that has one at all. Anything drawn on the brand
 * colour therefore has it removed.
 */
const write = async (path, buffer, { flatten = false } = {}) => {
  await mkdir(dirname(path), { recursive: true })
  const image = sharp(buffer)
  await (flatten ? image.flatten({ background: BRAND }).removeAlpha() : image).toFile(path)
  console.log(`  ${path.replace(join(here, '..') + '/', '')}`)
}

console.log('\nBuilding icons from branding/logo/logo-source.png\n')

// Reusable masters, so anything else that needs the mark has one to take.
await write(join(LOGO, 'logo.png'), await square(1024, 0.92, TRANSPARENT))
await write(join(LOGO, 'logo-on-brand.png'), await square(1024, 0.72, BRAND), { flatten: true })

// iOS and anywhere a single square icon is wanted. No transparency allowed.
await write(join(ASSETS, 'icon.png'), await square(1024, 0.72, BRAND), { flatten: true })

// Android adaptive: the foreground is cropped, so it sits well inside.
await write(join(ASSETS, 'android-icon-foreground.png'), await square(1024, 0.58, TRANSPARENT))
await write(
  join(ASSETS, 'android-icon-background.png'),
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BRAND } })
    .png()
    .toBuffer(),
  { flatten: true },
)
await write(join(ASSETS, 'android-icon-monochrome.png'), await monochrome(1024))

// Expo draws this on the splash background, so it keeps its transparency.
await write(join(ASSETS, 'splash-icon.png'), await square(1024, 0.6, TRANSPARENT))

// Small enough that a transparent mark disappears against a dark tab strip.
await write(join(ASSETS, 'favicon.png'), await square(48, 0.8, BRAND), { flatten: true })

console.log('\nDone. Check them by eye — nothing here can tell you it looks wrong.\n')
