import { z } from 'zod'

/**
 * A montage template describes how the individual shots are laid out over a
 * background image to produce the printed photo.
 *
 * Coordinates are in pixels on the output canvas, top-left origin. The
 * background is drawn first and fills the whole canvas; each shot is then
 * centre-cropped to its cell's aspect ratio and drawn over the top. Any part
 * of the background not covered by a cell stays visible, which is how the
 * artwork and branding show through.
 */
export const CellSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
})

export const TemplateSchema = z.object({
  /** Output size in pixels. */
  canvas: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  /** One cell per shot, in capture order. Its length defines shot count. */
  cells: z.array(CellSchema).min(1).max(6),
  /** Background artwork, drawn under the cells. Null renders a flat colour. */
  backgroundAssetId: z.string().uuid().nullable(),
  /** Used when there is no background asset. */
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
})

export type Cell = z.infer<typeof CellSchema>
export type Template = z.infer<typeof TemplateSchema>

/**
 * The layout used at Luana's party on 13 Sep 2025, carried over verbatim.
 *
 * 1800x1200 is 6x4in at 300dpi, which is the Canon SELPHY CP1500's postcard
 * size. Three shots occupy the left column and bottom-right; the remaining
 * top-right quadrant is deliberately left empty for the background artwork.
 *
 * These numbers were tuned against a real printer and real prints. Do not
 * adjust them casually -- create a new template instead.
 */
export const CLASSIC_3UP: Template = {
  canvas: { w: 1800, h: 1200 },
  cells: [
    { x: 36, y: 61, w: 845, h: 520 },
    { x: 36, y: 619, w: 845, h: 520 },
    { x: 919, y: 619, w: 845, h: 520 },
  ],
  backgroundAssetId: null,
  backgroundColor: '#ffffff',
}

/**
 * Three photos in a row along the bottom, and the whole top for artwork.
 *
 * The same three shots as CLASSIC_3UP, so nothing about the capture changes
 * -- but the photos are smaller and gathered, which leaves a band 1800x744
 * instead of a quadrant 919x619. That is 62% of the print rather than 26%.
 *
 * Worth the smaller photographs. The quadrant in v1's layout is enough for
 * "Ana is 5!" and not much else, and the thing people ask for is their
 * party's name across the top of the print.
 *
 * 560x420 is 4:3, which is the shape a phone camera gives without cropping
 * as hard as the wide cells above do.
 */
export const BANNER_3UP: Template = {
  canvas: { w: 1800, h: 1200 },
  cells: [
    { x: 36, y: 744, w: 560, h: 420 },
    { x: 620, y: 744, w: 560, h: 420 },
    { x: 1204, y: 744, w: 560, h: 420 },
  ],
  backgroundAssetId: null,
  backgroundColor: '#ffffff',
}

/** Every layout that ships, in the order they are offered. */
export const TEMPLATES: { name: string; template: Template }[] = [
  { name: 'Classic three-up', template: CLASSIC_3UP },
  { name: 'Banner three-up', template: BANNER_3UP },
]

/** Number of shots a template expects. */
export function shotCount(template: Template): number {
  return template.cells.length
}

/**
 * Work out the source rectangle to read from a shot so it fills `cell`
 * without distortion, cropping the overflowing axis evenly from both sides.
 *
 * Ported from v1's drawImageAtPosition(). Returned values are integers
 * because fractional source rectangles produced visible seams on the print.
 */
export function centreCrop(
  sourceWidth: number,
  sourceHeight: number,
  cell: Cell,
): { x: number; y: number; w: number; h: number } {
  const targetRatio = cell.w / cell.h
  const sourceRatio = sourceWidth / sourceHeight

  let w = sourceWidth
  let h = sourceHeight

  if (sourceRatio > targetRatio) {
    // Too wide: trim the sides.
    w = sourceHeight * targetRatio
  } else if (sourceRatio < targetRatio) {
    // Too tall: trim top and bottom.
    h = sourceWidth / targetRatio
  }

  return {
    x: Math.round((sourceWidth - w) / 2),
    y: Math.round((sourceHeight - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
  }
}

/**
 * The largest rectangle of the canvas no photo covers.
 *
 * Artwork and words have to live somewhere the photos will not be pasted
 * over, and in v1's layout that is one quadrant plus some thin borders.
 * Computed rather than written down, so a second template with roomier
 * cells gets a bigger design area without anyone remembering to update a
 * constant.
 *
 * Works by cutting the canvas along every cell edge and finding the biggest
 * block of resulting tiles that no cell touches. The grid is never more
 * than a handful of lines across, so checking every rectangle in it is
 * cheaper than being clever.
 */
export function artworkArea(template: Template): Cell {
  const { w, h } = template.canvas

  const xs = [...new Set([0, w, ...template.cells.flatMap((c) => [c.x, c.x + c.w])])]
    .filter((v) => v >= 0 && v <= w)
    .sort((a, b) => a - b)
  const ys = [...new Set([0, h, ...template.cells.flatMap((c) => [c.y, c.y + c.h])])]
    .filter((v) => v >= 0 && v <= h)
    .sort((a, b) => a - b)

  const covered = (x: number, y: number, right: number, bottom: number) =>
    template.cells.some(
      (c) => x < c.x + c.w && right > c.x && y < c.y + c.h && bottom > c.y,
    )

  let best: Cell = { x: 0, y: 0, w: 0, h: 0 }

  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let k = i + 1; k < xs.length; k += 1) {
        for (let l = j + 1; l < ys.length; l += 1) {
          const x = xs[i]!
          const y = ys[j]!
          const right = xs[k]!
          const bottom = ys[l]!
          if (covered(x, y, right, bottom)) continue

          const area = (right - x) * (bottom - y)
          if (area > best.w * best.h) best = { x, y, w: right - x, h: bottom - y }
        }
      }
    }
  }

  return best
}
