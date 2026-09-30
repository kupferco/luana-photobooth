import type { Artwork, Template } from '@photobooth/shared'

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
 * What we ask for.
 *
 * Their words lead. An earlier version buried them under a brief demanding
 * low contrast, an even composition and a quiet centre -- the reasoning
 * being that a background sits under photographs and should not compete.
 * The reasoning was sound and the result was that "constellation with
 * colourful star systems" came back as faint cream nothing, which is not a
 * background anybody asked for. Taste belongs to whoever is throwing the
 * party; if they want it loud, the fade control is right there.
 *
 * What is left are the two things that are not taste. Text comes out as
 * garbled pseudo-lettering next to a real title, and faces in a background
 * are confusing on a print whose whole subject is faces.
 */
export function buildPrompt(
  wish: string,
  _artwork: Artwork,
  template: Template,
): string {
  const { w, h } = template.canvas

  return [
    `A background image, ${w}x${h} pixels, landscape.`,
    `${wish}.`,
    'Fill the whole frame.',
    'No text, no letters, no numbers, no logos, no watermarks.',
    'No people and no faces.',
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
