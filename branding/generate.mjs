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
 * The part of the drawing the favicon uses.
 *
 * At 48px the whole scene turns to mush -- it is one connected line drawing
 * nearly three times wider than it is tall, so a tab strip gets grey soup.
 * A favicon needs one recognisable thing, so it takes a region instead.
 *
 * Fractions of the trimmed mark: `x` and `y` are the top-left corner, `w`
 * and `h` the size, all 0-1. `null` uses the whole mark.
 *
 * To find a region, run `npm run branding` and open
 * branding/logo/favicon-picker.png -- it is the mark under a labelled grid.
 * Nothing in this script knows what any shape is, so the numbers have to
 * come from looking.
 */
const FAVICON_CROP = process.env.CROP
  ? (([x, y, w, h]) => ({ x, y, w, h }))(process.env.CROP.split(',').map(Number))
  : null

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

/**
 * The ink, cropped to its own edges.
 *
 * Trimmed against the ink, which has real transparency, rather than the
 * original, which does not. Computed once: every asset below wants the same
 * mark, and the threshold pass is the slow part of this script.
 */
let trimmedMark = null
const mark = async () => (trimmedMark ??= await sharp(await inkOnly()).trim().toBuffer())

async function square(size, scale, background, source) {
  const trimmed = source ?? (await mark())
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

/** One region of the mark, lifted out and trimmed back to its own edges. */
async function detail(crop) {
  const source = await mark()
  const { width = 0, height = 0 } = await sharp(source).metadata()

  // Clamped so a hand-written region can never ask for pixels past the edge.
  const left = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)))
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)))

  return sharp(source)
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.round(crop.w * width))),
      height: Math.max(1, Math.min(height - top, Math.round(crop.h * height))),
    })
    .trim()
    .toBuffer()
}

/**
 * The mark under a labelled grid, so a region can be named out loud.
 *
 * This script judges the drawing by luminance alone and has no idea which
 * shape is which, so choosing what the favicon shows means someone looking
 * at it. The grid gives them words for it: "B2", which becomes CROP below.
 */
async function picker(size = 900) {
  const COLS = 6
  const ROWS = 4
  const shown = await square(size, 0.94, '#ffffff', await mark())

  const cw = size / COLS
  const ch = size / ROWS
  const lines = []

  for (let c = 1; c < COLS; c++) {
    lines.push(`<line x1="${c * cw}" y1="0" x2="${c * cw}" y2="${size}"/>`)
  }
  for (let r = 1; r < ROWS; r++) {
    lines.push(`<line x1="0" y1="${r * ch}" x2="${size}" y2="${r * ch}"/>`)
  }

  const labels = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const name = `${'ABCDEF'[c]}${r + 1}`
      // Corner-set and semi-transparent: a label over the middle of a cell
      // would hide the very thing being pointed at.
      labels.push(
        `<text x="${c * cw + 8}" y="${r * ch + 30}" fill="#d92d20" fill-opacity="0.65"` +
          ` font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="700">${name}</text>`,
      )
    }
  }

  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<g stroke="#d92d20" stroke-opacity="0.45" stroke-width="2">${lines.join('')}</g>` +
      labels.join('') +
      '</svg>',
  )

  return sharp(shown).composite([{ input: svg }]).png().toBuffer()
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

/*
 * Small enough that a transparent mark disappears against a dark tab strip,
 * so it sits on the brand colour like the app icon.
 *
 * At 48px the full scene is unreadable, so it shows one region of it --
 * see FAVICON_CROP. Until a region is chosen it falls back to the whole
 * mark, which is legible as a smudge of the right shape and colour rather
 * than as a drawing.
 */
const faviconMark = FAVICON_CROP ? await detail(FAVICON_CROP) : null
await write(join(ASSETS, 'favicon.png'), await square(48, 0.8, BRAND, faviconMark), {
  flatten: true,
})

// The same region big enough to actually check, since 48px tells you nothing.
await write(join(LOGO, 'favicon-preview.png'), await square(240, 0.8, BRAND, faviconMark), {
  flatten: true,
})

// Big, on white and on the brand colour, so the result can be judged at a
// glance rather than by opening eight files.
await write(join(LOGO, 'preview-on-white.png'), await square(600, 0.86, '#ffffff'), { flatten: true })
await write(join(LOGO, 'favicon-picker.png'), await picker(), { flatten: true })

console.log(`\nInk threshold: ${INK_THRESHOLD}. Too much left? INK=90 npm run branding`)
console.log(
  FAVICON_CROP
    ? `Favicon region: ${Object.values(FAVICON_CROP).join(', ')}. Check favicon-preview.png.`
    : 'Favicon: the whole mark. Pick a region in favicon-picker.png, then CROP=x,y,w,h npm run branding',
)
console.log('Check branding/logo/preview-on-white.png — nothing here can tell you it looks wrong.\n')
