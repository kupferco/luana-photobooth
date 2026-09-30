/**
 * What an owner can say about their party, and how it looks.
 *
 * In the shared package because two things draw it and they must not
 * disagree: the preview in the app, and the renderer in the API that makes
 * the picture the printer uses. A description that lives in one of them is
 * a description the other one guesses at.
 *
 * docs/backgrounds.md is firm that the stored background stays a plain
 * picture whatever happens. This is a way of making one.
 */

export type FontName = 'sans' | 'serif' | 'mono'
export type ThemeName =
  | 'plain'
  | 'confetti'
  | 'constellation'
  | 'clouds'
  | 'stripes'
  | 'bokeh'
export type PaletteName = 'amber' | 'ink' | 'rose' | 'sea' | 'forest' | 'blossom'
export type DateStyle = 'none' | 'long' | 'short' | 'monthYear'

export interface Artwork {
  title: string
  dateStyle: DateStyle
  font: FontName
  theme: ThemeName
  palette: PaletteName
  /** For generated artwork. Carried now so the shape does not change later. */
  prompt: string
}

export const DEFAULT_ARTWORK: Artwork = {
  title: '',
  dateStyle: 'long',
  font: 'sans',
  theme: 'plain',
  palette: 'amber',
  prompt: '',
}

export interface Palette {
  /** The whole canvas, including the border around the photos. */
  paper: string
  ink: string
  accent: string
}

/*
 * Light papers on purpose.
 *
 * This is printed, not lit. A dark background looks striking on a phone and
 * costs a whole ribbon panel of ink to produce a print that comes out
 * muddier than it looked -- and the photos sit on it, so the paper is the
 * quiet part.
 */
export const PALETTES: Record<PaletteName, Palette> = {
  amber: { paper: '#fdf6e3', ink: '#3f2d00', accent: '#f5c518' },
  ink: { paper: '#f4f4f5', ink: '#18181b', accent: '#52525b' },
  rose: { paper: '#fff1f2', ink: '#5c1a2b', accent: '#fb7185' },
  sea: { paper: '#eff9ff', ink: '#0b3a52', accent: '#38bdf8' },
  forest: { paper: '#f1f8f2', ink: '#14351f', accent: '#4ade80' },
  blossom: { paper: '#faf5ff', ink: '#3b1a52', accent: '#c084fc' },
}

/**
 * How far the words stay back from the edge of the design area, in canvas
 * pixels.
 *
 * 60px is 5mm at 300dpi. The first attempt used 28, which is 2.4mm, and a
 * name set that close to the paper looked fine on screen and sat inside
 * where a borderless dye-sub print gets trimmed. There is no second chance
 * on a print: it comes out of the machine finished.
 */
export const ARTWORK_PADDING = 60

/** How the party's date reads under its name. */
export function formatEventDate(
  iso: string,
  style: DateStyle,
  locale: string,
): string | null {
  if (style === 'none') return null
  const date = new Date(iso)

  if (style === 'short') {
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }
  if (style === 'monthYear') {
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  }
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Deterministic scatter.
 *
 * The decorations are drawn from random-looking positions, and they have to
 * be the *same* random-looking positions every render -- otherwise the
 * confetti jumps about while somebody types their party's name, which
 * reads as a bug rather than as decoration.
 */
export function scatter(seed: number, count: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  let state = seed * 9301 + 49297

  const next = () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }

  for (let i = 0; i < count; i += 1) {
    out.push({ x: next(), y: next(), r: next() })
  }
  return out
}
