import {
  ARTWORK_PADDING,
  PALETTES,
  artworkArea,
  formatEventDate,
  scatter,
  type Artwork,
  type FontName,
  type Template,
} from '@photobooth/shared'
import sharp from 'sharp'

/**
 * Turning a party's description into the picture the printer uses.
 *
 * The studio in the app draws a preview of this; here is where the same
 * description becomes an actual 1800x1200 image. Both read the spec from
 * `@photobooth/shared`, which is the only reason they agree.
 *
 * The output is an ordinary PNG uploaded to the same place an uploaded
 * background goes. docs/backgrounds.md is firm about that boundary: nothing
 * downstream -- the composer, the printer, the retention job -- needs to
 * know whether a background was made here or dragged in from a phone.
 */

/*
 * The families the container has, which is not the same list as a phone's.
 *
 * Liberation is metric-compatible with Arial, Times and Courier, which is
 * what the preview asks for. DejaVu is the fallback that is always present
 * on Debian, so a missing package degrades to the wrong face rather than to
 * no text at all.
 *
 * Installed in the Dockerfile. Without them librsvg silently draws nothing.
 */
const FAMILIES: Record<FontName, string> = {
  sans: "'Liberation Sans', 'DejaVu Sans', sans-serif",
  serif: "'Liberation Serif', 'DejaVu Serif', serif",
  mono: "'Liberation Mono', 'DejaVu Sans Mono', monospace",
}

const WEIGHTS: Record<FontName, number> = { sans: 700, serif: 700, mono: 700 }

/** XML has five characters that cannot appear raw, and party names have them. */
const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * Roughly how wide a string will be, so it can be shrunk before it overflows.
 *
 * An estimate rather than a measurement: librsvg will not tell us, and
 * shipping a text-measuring library to find out would be a lot of machinery
 * for a box whose only job is to not be overflowed. The factor is per family
 * because a monospace face is much wider than a proportional one at the same
 * size, and the estimate errs large so the result is a size too small rather
 * than a name running off the paper.
 */
const WIDTH_FACTOR: Record<FontName, number> = { sans: 0.58, serif: 0.55, mono: 0.62 }

function fitFontSize(
  text: string,
  font: FontName,
  maxWidth: number,
  maxSize: number,
): number {
  if (!text) return maxSize
  const estimated = text.length * WIDTH_FACTOR[font] * maxSize
  return estimated <= maxWidth
    ? maxSize
    : Math.max(24, Math.floor((maxWidth / (text.length * WIDTH_FACTOR[font])) * 1))
}

/** The decorative pattern, as SVG elements. Faint: photographs sit on it. */
function decoration(artwork: Artwork, w: number, h: number, accent: string): string {
  if (artwork.theme === 'plain') return ''
  const dots = scatter(7, 60)
  const parts: string[] = []

  if (artwork.theme === 'stripes') {
    for (let i = 0; i < 24; i += 1) {
      parts.push(
        `<rect x="${((i * 2 + 0.5) / 48) * w}" y="0" width="${w / 48}" height="${h}" fill="${accent}" opacity="0.18"/>`,
      )
    }
  }

  if (artwork.theme === 'confetti') {
    for (const d of dots) {
      const x = d.x * w
      const y = d.y * h
      parts.push(
        `<rect x="${x}" y="${y}" width="${10 + d.r * 16}" height="${5 + d.r * 7}" rx="2" fill="${accent}" opacity="${(0.2 + d.r * 0.35).toFixed(3)}" transform="rotate(${Math.round(d.r * 180)} ${x} ${y})"/>`,
      )
    }
  }

  if (artwork.theme === 'bokeh') {
    for (const d of dots.slice(0, 28)) {
      parts.push(
        `<circle cx="${d.x * w}" cy="${d.y * h}" r="${10 + d.r * 46}" fill="${accent}" opacity="${(0.08 + d.r * 0.12).toFixed(3)}"/>`,
      )
    }
  }

  if (artwork.theme === 'clouds') {
    for (const d of dots.slice(0, 16)) {
      parts.push(
        `<circle cx="${d.x * w}" cy="${d.y * h * 0.75}" r="${26 + d.r * 60}" fill="${accent}" opacity="0.1"/>`,
      )
    }
  }

  if (artwork.theme === 'constellation') {
    const stars = dots.slice(0, 26)
    stars.forEach((d, i) => {
      const nextDot = stars[i + 1]
      if (nextDot && d.r > 0.45) {
        parts.push(
          `<line x1="${d.x * w}" y1="${d.y * h}" x2="${nextDot.x * w}" y2="${nextDot.y * h}" stroke="${accent}" stroke-width="1" opacity="0.25"/>`,
        )
      }
    })
    for (const d of stars) {
      parts.push(
        `<circle cx="${d.x * w}" cy="${d.y * h}" r="${1.5 + d.r * 3}" fill="${accent}" opacity="0.55"/>`,
      )
    }
  }

  return parts.join('')
}

/**
 * The finished background, at the template's own size.
 *
 * `base` is an optional picture to draw underneath everything -- generated
 * artwork, once that exists. The words go on top of it either way, because
 * the words are the point and a background that covers them has failed.
 */
export async function renderArtwork(
  template: Template,
  artwork: Artwork,
  eventDate: string,
  locale = 'en-GB',
  base?: Buffer,
): Promise<Buffer> {
  const { w, h } = template.canvas
  const palette = PALETTES[artwork.palette]
  const area = artworkArea(template)

  // The same padding the preview uses, from the same constant.
  const pad = ARTWORK_PADDING
  const boxWidth = area.w - pad * 2

  const title = artwork.title.trim()
  const date = formatEventDate(eventDate, artwork.dateStyle, locale)

  const titleSize = fitFontSize(title, artwork.font, boxWidth, 86)
  const dateSize = Math.min(34, titleSize * 0.42)

  // Centred in the free area, with the date under the name. Two lines are
  // laid out by hand rather than by a text engine: there are only ever two.
  const centreX = area.x + area.w / 2
  const block = title && date ? titleSize + 18 + dateSize : title ? titleSize : dateSize
  const top = area.y + (area.h - block) / 2

  const words: string[] = []
  if (title) {
    words.push(
      `<text x="${centreX}" y="${top + titleSize * 0.82}" text-anchor="middle"` +
        ` font-family="${FAMILIES[artwork.font]}" font-weight="${WEIGHTS[artwork.font]}"` +
        ` font-size="${titleSize}" fill="${palette.ink}">${escape(title)}</text>`,
    )
  }
  if (date) {
    const y = title ? top + titleSize + 18 + dateSize * 0.82 : top + dateSize * 0.82
    words.push(
      `<text x="${centreX}" y="${y}" text-anchor="middle"` +
        ` font-family="${FAMILIES[artwork.font]}" font-weight="400"` +
        ` font-size="${dateSize}" fill="${palette.ink}" opacity="0.7">${escape(date)}</text>`,
    )
  }

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      // No paper rectangle when there is a picture underneath: the point of
      // a generated background is to see it.
      (base ? '' : `<rect width="${w}" height="${h}" fill="${palette.paper}"/>`) +
      decoration(artwork, w, h, palette.accent) +
      words.join('') +
      '</svg>',
  )

  const canvas = base
    ? sharp(base).resize(w, h, { fit: 'cover' })
    : sharp({ create: { width: w, height: h, channels: 4, background: palette.paper } })

  return canvas.composite([{ input: svg }]).png().toBuffer()
}
