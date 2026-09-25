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
 * Anything darker than this becomes the mark; everything else disappears.
 *
 * The source is a full-colour drawing on a white background, and what is
 * wanted from it is the black line work alone. Measured on the original:
 * 15% of it is darker than 70, 76% is near-white, and about 2% is saturated
 * colour. So a luminance cut separates the drawing from everything around it
 * without needing to know what any of the shapes are.
 *
 * Raise it to keep more of the softer greys, lower it to keep only the
 * densest black.
 */
const INK_THRESHOLD = Number(process.env.INK ?? 110)

/**
 * The logo, cropped to its own edges and centred on a square.
 *
 * `scale` is how much of the square the logo fills. Anything destined for an
 * Android adaptive icon needs to stay well inside, because the launcher will
 * crop it.
 */
/**
 * The line work, lifted off its background.
 *
 * The source arrives as a drawing on white, not as a transparent mark, so
 * `.trim()` alone finds nothing to remove -- the first pass at this produced
 * icons with a white box sitting on the brand colour.
 *
 * Every pixel becomes either black or nothing, judged on how dark it is. The
 * alpha is feathered rather than binary so the curves do not come out
 * jagged: a pixel at the threshold is half there, one well below it is
 * solid.
 */
async function inkOnly() {
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.alloc(info.width * info.height * 4)

  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma: matches how dark these read to an eye, which is what
    // "the black outline" means.
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const wasOpaque = data[i + 3] > 24

    // Fully opaque below the threshold, fading out over the 40 levels above
    // it, so edges stay smooth.
    const alpha = !wasOpaque
      ? 0
      : luma <= INK_THRESHOLD
        ? 255
        : Math.max(0, Math.round(255 * (1 - (luma - INK_THRESHOLD) / 40)))

    out[i] = 0
    out[i + 1] = 0
    out[i + 2] = 0
    out[i + 3] = alpha
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
}

async function square(size, scale, background) {
  // Trim against the ink, which has real transparency, rather than the
  // original, which does not.
  const trimmed = await sharp(await inkOnly()).trim().toBuffer()
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
  // Already a black silhouette, so this is the same mark at Android's size.
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

// Big, on white and on the brand colour, so the result can be judged at a
// glance rather than by opening eight files.
await write(join(LOGO, 'preview-on-white.png'), await square(600, 0.86, '#ffffff'), { flatten: true })

console.log(`\nInk threshold: ${INK_THRESHOLD}. Too much left? INK=90 npm run branding`)
console.log('Check branding/logo/preview-on-white.png — nothing here can tell you it looks wrong.\n')
