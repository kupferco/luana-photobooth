import type { Artwork, Template } from '@photobooth/shared'
import { PALETTES } from '@photobooth/shared'

/**
 * Making a background out of a sentence.
 *
 * Shaped after the same job in Tera: call the Gemini REST endpoint directly
 * rather than through an SDK, and return the bytes rather than storing
 * them. The difference here is where the bytes go afterwards -- a 1800x1200
 * PNG is too big to round-trip through a phone, so the route writes it to a
 * tmp tier the bucket expires after a day, and only an accepted candidate
 * is ever written as a real background.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Nano Banana. The cheapest of the image models and the most widely served,
 * which is what matters for something a party host presses on a whim.
 *
 * Image models are billing-only -- Google's free tier does not serve them --
 * so a key without billing fails with a specific, actionable message rather
 * than a generic failure.
 */
export const IMAGE_MODEL = 'gemini-2.5-flash-image'

/** About 4p a picture at the time of writing. Worth saying out loud. */
export const COST_PER_IMAGE_USD = 0.039

const TIMEOUT_MS = 120_000

export interface GeneratedImage {
  mimeType: string
  bytes: Buffer
}

/** The key is not billable, or the model is not served for it. */
export class GenerationUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'Generated artwork is not available on this key. Image models need ' +
        'billing enabled on the Google AI key; the free tier does not serve them.' +
        (detail ? ` (${detail})` : ''),
    )
    this.name = 'GenerationUnavailableError'
  }
}

/** The model refused the prompt, or returned words instead of a picture. */
export class GenerationRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationRefusedError'
  }
}

/**
 * What we ask for, rather than what the person typed.
 *
 * Their words are the subject; everything else here is the brief. A
 * background for this product has one job and it is not to be admired: it
 * sits under three photographs and a party's name, and anything with real
 * contrast in the middle wins a fight it should not be in.
 *
 * The photo cells are named as empty space so the model leaves the busy
 * detail where it will be covered rather than where the faces go.
 */
export function buildPrompt(
  wish: string,
  artwork: Artwork,
  template: Template,
): string {
  const palette = PALETTES[artwork.palette]
  const { w, h } = template.canvas

  return [
    `A decorative background image, ${w}x${h} pixels, landscape.`,
    `Theme: ${wish}.`,
    `Palette: soft ${palette.paper} paper with ${palette.accent} accents.`,
    'It must be very low contrast and softly lit, like patterned wrapping paper.',
    'No text, no letters, no numbers, no logos, no watermarks.',
    'No people, no faces, no hands.',
    'Keep the composition even and calm with no single dominant subject,',
    'because photographs and a title are printed on top of it.',
    'Leave the centre and lower area quiet and uncluttered.',
  ].join(' ')
}

/**
 * One picture, or a clear reason there isn't one.
 *
 * Deliberately no retry. A generation costs real money per attempt, and the
 * failures worth retrying (a dropped connection) are rarer than the ones
 * that would simply be paid for twice.
 */
export async function generateBackground(prompt: string): Promise<GeneratedImage> {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new GenerationUnavailableError('no key configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(
      `${ENDPOINT}/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // Image models answer with an inline image part; asking for both
          // is the form the flash-image family accepts most widely.
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      const body = await response.text()
      // 403 and 429 both mean "not served for this key" far more often than
      // they mean "try again later", and neither is worth paying twice for.
      if (
        response.status === 403 ||
        response.status === 429 ||
        /billing|quota|not.*enabled|permission/i.test(body)
      ) {
        throw new GenerationUnavailableError(`${response.status}`)
      }
      throw new Error(`Generation failed (${response.status}): ${body.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[]
      promptFeedback?: { blockReason?: string }
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    const image = parts.find((part) => part.inlineData?.data)

    if (!image?.inlineData?.data) {
      const blocked = data.promptFeedback?.blockReason
      const said = parts.find((part) => typeof part.text === 'string')?.text
      throw new GenerationRefusedError(
        blocked
          ? `That description was refused (${blocked}). Try describing it differently.`
          : `No picture came back${said ? `: ${said.slice(0, 160)}` : '.'}`,
      )
    }

    return {
      mimeType: image.inlineData.mimeType ?? 'image/png',
      bytes: Buffer.from(image.inlineData.data, 'base64'),
    }
  } finally {
    clearTimeout(timer)
  }
}
