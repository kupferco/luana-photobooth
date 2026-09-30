import type { FontName } from '@photobooth/shared'

export * from '@photobooth/shared'

/**
 * The families the *preview* uses.
 *
 * Deliberately separate from the renderer's table in the API, and
 * deliberately the same typefaces: a phone names them one way and a Debian
 * container names them another, and the two lists are how they meet. Change
 * one and the printed artwork stops matching what was designed.
 */
export const FONTS: Record<FontName, { family?: string; weight: '400' | '600' | '700' }> = {
  sans: { family: 'Helvetica Neue', weight: '700' },
  serif: { family: 'Georgia', weight: '700' },
  mono: { family: 'Courier New', weight: '700' },
}
