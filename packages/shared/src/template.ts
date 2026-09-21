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
