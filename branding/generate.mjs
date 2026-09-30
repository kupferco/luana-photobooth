/**
 * Builds every icon the app needs from the source logos.
 *
 * There are two: logo-colour-source.png is the mark in full colour, used
 * wherever it sits on the icon yellow or on the landing page; logo-source.png
 * is the line drawing the single-colour versions are cut from.
 *
 * Run after changing either, in branding/logo/:
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

/**
 * The mark in full colour, already cut out: transparent around the figures.
 *
 * Its own file rather than something derived, because the line drawing has
 * no colour to recover and this has no clean line work to extract.
 */
const COLOUR_SOURCE = join(here, 'logo', 'logo-colour-source.png')
const LOGO = join(here, 'logo')
const ASSETS = join(here, '..', 'apps', 'mobile', 'assets')
const WEB = join(here, '..', 'apps', 'mobile', 'public', 'icons')
const GUEST_WEB = join(here, '..', 'apps', 'guest', 'public', 'icons')
const GUEST_BRAND = join(here, '..', 'apps', 'guest', 'public', 'brand')
const SITE_WEB = join(here, '..', 'apps', 'landing', 'public', 'icons')
const SITE_BRAND = join(here, '..', 'apps', 'landing', 'public', 'brand')

/** amber.500 — the same yellow as the primary button. */
const BRAND = '#f5c518'
/**
 * What the colour mark sits on, in icons.
 *
 * Paler than BRAND on purpose. The drawing has its own oranges and golds --
 * the hair, the sombrero -- and on the button yellow they merge into the
 * background. The buttons keep BRAND.
 */
const ICON_BG = '#fbd965'
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
async function inkOnly(file = SOURCE) {
  const { data, info } = await sharp(file)
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

/**
 * The colour mark, cropped to its own edges.
 *
 * The cut-out left a fringe of the colour it was cut from: edge pixels are
 * partly transparent and still tinted green, which shows as a halo on
 * anything that is not green. Those pixels are all outline, so they are
 * made black and keep their alpha.
 */
let trimmedColour = null
async function colourMark() {
  if (trimmedColour) return trimmedColour

  const { data, info } = await sharp(COLOUR_SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) data[i] = data[i + 1] = data[i + 2] = 0
  }

  return (trimmedColour = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim()
    .toBuffer())
}

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
 * The whole mark in a single colour, at its own proportions.
 *
 * The artwork is black line work, so on a dark surface it is a black
 * drawing on a nearly black page -- which is what the guest page is. This
 * keeps the shapes and throws away the colour, so the same mark works on
 * both.
 *
 * Not square: this one is used inline next to text, where padding it out to
 * a square would just be a large gap.
 */
async function tinted(width, colour) {
  const fitted = await sharp(await mark()).resize({ width }).toBuffer()
  const { width: w = width, height: h = width } = await sharp(fitted).metadata()
  const alpha = await sharp(fitted).extractChannel('alpha').toBuffer()

  return sharp({ create: { width: w, height: h, channels: 3, background: colour } })
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

console.log('\nBuilding icons from branding/logo/\n')

// Reusable masters, so anything else that needs the mark has one to take.
await write(join(LOGO, 'logo.png'), await square(1024, 0.92, TRANSPARENT))
const colour = await colourMark()
await write(join(LOGO, 'logo-colour.png'), colour)
await write(join(LOGO, 'logo-on-brand.png'), await square(1024, 0.8, ICON_BG, colour), {
  flatten: true,
})

// iOS and anywhere a single square icon is wanted. No transparency allowed.
await write(join(ASSETS, 'icon.png'), await square(1024, 0.8, ICON_BG, colour), { flatten: true })

// Android adaptive: the foreground is cropped, so it sits well inside.
await write(
  join(ASSETS, 'android-icon-foreground.png'),
  await square(1024, 0.58, TRANSPARENT, colour),
)
await write(
  join(ASSETS, 'android-icon-background.png'),
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_BG } })
    .png()
    .toBuffer(),
  { flatten: true },
)
await write(join(ASSETS, 'android-icon-monochrome.png'), await monochrome(1024))

// Expo draws this on the splash background, so it keeps its transparency.
await write(join(ASSETS, 'splash-icon.png'), await square(1024, 0.6, TRANSPARENT, colour))

/*
 * The tab icon: the whole mark, in colour, on the icon yellow.
 *
 * As a line drawing the three figures were a grey smudge at 48px and the
 * favicon showed one face instead. In colour they hold together -- three
 * blobs of hair and a hat is enough to recognise.
 */
const faviconMark = colour
await write(join(ASSETS, 'favicon.png'), await square(48, 0.92, ICON_BG, faviconMark), {
  flatten: true,
})

// The same thing big enough to actually check, since 48px tells you nothing.
await write(join(LOGO, 'favicon-preview.png'), await square(240, 0.92, ICON_BG, faviconMark), {
  flatten: true,
})

/*
 * Icons for "Add to Home Screen".
 *
 * Without these a saved page gets no icon at all: iOS uses a screenshot of
 * whatever was on screen, and Android draws the first letter in a circle.
 * The app icon above does not cover it -- a web page is asked for its icons
 * by <link> and by the manifest, and neither had one.
 *
 * Two shapes, because the platforms crop differently:
 *
 * - The plain ones are shown as-is. iOS rounds the corners itself, so an
 *   already-rounded icon would come out doubly so.
 * - The maskable ones may be cut to a circle, and the guarantee is only the
 *   middle 80%. They get the same generous padding as the Android adaptive
 *   icon, for the same reason.
 *
 * All flattened onto the brand colour: iOS fills transparency with black.
 */
// For the guest page and the landing page, both of which are nearly black.
const light = await tinted(640, '#ffffff')
await write(join(GUEST_BRAND, 'logo-light.png'), light)
await write(join(SITE_BRAND, 'logo-light.png'), light)
// The landing page's own mark, in colour, at the top of every page.
await write(join(SITE_BRAND, 'logo-colour.png'), colour)
// And the app's, above the sign-in form.
await write(join(ASSETS, 'logo-colour.png'), colour)
await write(join(LOGO, 'logo-light.png'), light)

// What a link to the landing page unfurls as in a message. Flattened onto
// the brand colour because a transparent mark lands on whatever colour the
// chat app happens to use, which is usually white and sometimes black.
await write(join(SITE_BRAND, 'logo-on-brand.png'), await square(1024, 0.8, ICON_BG, colour), {
  flatten: true,
})

for (const [dir, label] of [[WEB, 'app'], [GUEST_WEB, 'guest'], [SITE_WEB, 'landing']]) {
  // 180 is what iOS asks for; it downsamples from there for every other slot.
  await write(join(dir, 'apple-touch-icon.png'), await square(180, 0.8, ICON_BG, colour), {
    flatten: true,
  })
  for (const size of [192, 512]) {
    await write(join(dir, `icon-${size}.png`), await square(size, 0.8, ICON_BG, colour), {
      flatten: true,
    })
    await write(join(dir, `icon-${size}-maskable.png`), await square(size, 0.62, ICON_BG, colour), {
      flatten: true,
    })
  }
  // The tab icon, alongside the .ico Expo builds from assets/favicon.png.
  await write(join(dir, 'favicon-48.png'), await square(48, 0.92, ICON_BG, faviconMark), {
    flatten: true,
  })
  void label
}

// Big, on white and on the brand colour, so the result can be judged at a
// glance rather than by opening eight files.
await write(join(LOGO, 'preview-on-white.png'), await square(600, 0.86, '#ffffff'), { flatten: true })

console.log(`\nInk threshold: ${INK_THRESHOLD}. Too much left? INK=90 npm run branding`)
console.log('Check branding/logo/preview-on-white.png — nothing here can tell you it looks wrong.\n')
