import { centreCrop, type Template } from '@photobooth/shared'
import sharp from 'sharp'

/**
 * Builds the printed montage.
 *
 * This runs on the server rather than the phone so the layout lives in one
 * place, old sessions can be re-rendered under a new template, and print
 * quality does not depend on whatever the client's canvas did. The phone
 * still composes its own preview for the guest, which is instant; this is the
 * file that reaches the printer.
 *
 * The geometry is v1's, carried over as data and confirmed against real
 * device output: 1800x1200 is 6x4in at 300dpi for the SELPHY's postcard size.
 */

/** Matches v1's canvas.toDataURL('image/jpeg') closely enough to print the same. */
const JPEG_QUALITY = 92

export interface ComposeInput {
  template: Template
  /** Shots in capture order, one per cell. */
  shots: Buffer[]
  /** Background artwork. Omitted renders the template's flat colour. */
  background?: Buffer
}

export async function composeMontage({
  template,
  shots,
  background,
}: ComposeInput): Promise<Buffer> {
  const { canvas, cells } = template

  if (shots.length !== cells.length) {
    throw new Error(
      `Template expects ${cells.length} shots but ${shots.length} were supplied.`,
    )
  }

  // The background is drawn first and fills the canvas; cells go over it. Any
  // part left uncovered stays visible, which is how the artwork shows through
  // -- in the classic layout, the whole top-right quadrant.
  const base = background
    ? sharp(background).resize(canvas.w, canvas.h, { fit: 'cover' })
    : sharp({
        create: {
          width: canvas.w,
          height: canvas.h,
          channels: 3,
          background: template.backgroundColor,
        },
      })

  const composites = await Promise.all(
    cells.map(async (cell, index) => {
      const shot = shots[index]!
      const meta = await sharp(shot).metadata()

      if (!meta.width || !meta.height) {
        throw new Error(`Shot ${index + 1} has no readable dimensions.`)
      }

      // Centre-crop to the cell's aspect ratio before scaling, so faces are
      // not squashed. Integer values throughout: fractional source rectangles
      // produced visible seams on v1's prints.
      const crop = centreCrop(meta.width, meta.height, cell)

      const resized = await sharp(shot)
        .extract({
          left: crop.x,
          top: crop.y,
          width: crop.w,
          height: crop.h,
        })
        .resize(cell.w, cell.h, { fit: 'fill' })
        .toBuffer()

      return { input: resized, left: cell.x, top: cell.y }
    }),
  )

  return base
    .composite(composites)
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

/**
 * A small version for the guest's phone and the owner's gallery.
 *
 * The print file is several megabytes; nobody on party wifi should download
 * that to look at a thumbnail.
 */
export async function montagePreview(montage: Buffer, width = 900): Promise<Buffer> {
  return sharp(montage).resize(width).jpeg({ quality: 82 }).toBuffer()
}
