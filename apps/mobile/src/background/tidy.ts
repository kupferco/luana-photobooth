import { PALETTES, type Artwork } from '@photobooth/shared'

/**
 * Our taste, as a button somebody presses rather than a rule they cannot
 * escape.
 *
 * Everything this sets is something they can immediately move. That is the
 * arrangement: the product has an opinion and offers it, and whoever is
 * throwing the party overrules it. An earlier version enforced the same
 * opinion inside the generation prompt, where it could not be argued with
 * and produced artwork nobody wanted.
 *
 * It looks at the picture rather than applying a fixed set. The one thing
 * that decides whether a party's name survives is how light the picture
 * behind it is, which is measured when the picture arrives.
 */
export function tidy(
  artwork: Artwork,
  picture: { luminance: number | null } | null,
): Artwork {
  const palette = PALETTES[artwork.palette]

  if (!picture) {
    // Nothing to compete with. The palette's own ink is chosen to sit on
    // its own paper, so the advice is to stop overriding it.
    return { ...artwork, ink: null, tint: null }
  }

  /*
   * Unmeasured pictures are treated as middling.
   *
   * Uploaded backgrounds have no luminance recorded, and guessing "light"
   * would put black letters on what might be a night sky.
   */
  const light = picture.luminance ?? 50

  /*
   * Faded far enough that faces win.
   *
   * A picture at full strength behind three photographs is two pictures
   * competing, and the one that matters has the guests in it. A dark
   * picture needs more fading than a light one, because the print is on
   * white paper and dark ink over dark artwork is where a name disappears.
   */
  const backgroundOpacity = light < 35 ? 40 : light > 75 ? 70 : 55

  /*
   * Washed towards the paper, not the accent.
   *
   * Washing a photograph in the bright colour is a filter; washing it in
   * the paper is what makes a photograph and a printed page look like they
   * belong together. Heavier over a dark picture, for the same reason.
   */
  const tintOpacity = light < 35 ? 45 : 30

  /*
   * The palette's own ink, always.
   *
   * There was a branch here choosing white letters over a dark picture,
   * and working out the numbers showed it could never run: fading towards
   * the paper and then washing towards it again leaves the surface behind
   * the words between 70% and 93% light for every picture from black to
   * white. Tidy cannot produce a dark surface, so it cannot need light
   * letters -- and dead code that looks thoughtful is worse than none.
   *
   * Somebody who wants white letters can still pick them. This is advice.
   */
  return {
    ...artwork,
    backgroundOpacity,
    tint: palette.paper,
    tintOpacity,
    ink: null,
  }
}
