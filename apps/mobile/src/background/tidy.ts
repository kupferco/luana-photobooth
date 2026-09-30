import { PALETTES, type Artwork } from '@photobooth/shared'

/**
 * Our taste, as a button somebody presses rather than a rule they cannot
 * escape.
 *
 * Everything this sets is something they can immediately move. That is the
 * whole arrangement: the product has an opinion and offers it, and whoever
 * is throwing the party overrules it whenever they like. The earlier
 * version enforced the same opinion inside the generation prompt, where it
 * could not be argued with and produced artwork nobody wanted.
 */
export function tidy(artwork: Artwork, hasPicture: boolean): Artwork {
  const palette = PALETTES[artwork.palette]

  if (!hasPicture) {
    // Nothing to compete with, so the only advice is to let the palette
    // choose the ink it was designed with.
    return { ...artwork, ink: null, tint: null }
  }

  return {
    ...artwork,
    /*
     * Far enough back that faces win.
     *
     * A photograph at full strength behind three photographs is two
     * pictures fighting, and the one that matters is the one with the
     * guests in it.
     */
    backgroundOpacity: 55,
    /*
     * A light wash in the palette's paper colour.
     *
     * Not the accent: washing a picture in the bright colour is a filter,
     * and washing it in the paper is what makes a photograph and a printed
     * page look like they belong to each other.
     */
    tint: palette.paper,
    tintOpacity: 35,
    // The palette's ink, which is chosen to sit on its paper.
    ink: null,
  }
}
