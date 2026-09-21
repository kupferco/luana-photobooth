/**
 * The token contract: the complete set of roles a recipe is allowed to
 * reference. Recipes name roles, never raw colours — that indirection is what
 * lets a theme change the palette without every recipe knowing about it.
 *
 * Adding a role here is a breaking change for every theme, which is the point:
 * ds-codegen fails the build when a theme is missing one.
 */

export interface ColorRoles {
  surface: { base: string; raised: string; sunken: string }
  text: { primary: string; secondary: string; inverse: string; disabled: string }
  /** Primary call to action. */
  action: { bg: string; bgPressed: string; fg: string }
  /** Lower-emphasis action: outlined or tinted rather than filled. */
  actionSecondary: { bg: string; bgPressed: string; fg: string; border: string }
  danger: { bg: string; bgPressed: string; fg: string }
  border: { subtle: string; strong: string }
  focus: { ring: string }
  /**
   * A judgement, not a decoration: a health score today, a price verdict
   * later. Named for what it means so both can use the same four.
   */
  status: { good: string; ok: string; poor: string; bad: string }
}

export interface Theme {
  name: string
  /** Raw values. Swap these alone to rebrand while keeping every mapping. */
  palette: Record<string, Record<string, string>>
  color: ColorRoles
  space: Record<string, number>
  radius: Record<string, number>
  fontSize: Record<string, number>
  fontWeight: Record<string, string>
}

/** Dotted paths into a theme, e.g. `color.action.bg`. */
type Paths<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? `${K}.${Paths<T[K]>}` : K }[keyof T & string]
  : never

export type TokenPath = Paths<Omit<Theme, 'name' | 'palette'>>

/** A reference as it appears in a recipe: `{color.action.bg}`. */
export type TokenRef = `{${string}}`

export const isTokenRef = (v: unknown): v is TokenRef =>
  typeof v === 'string' && v.startsWith('{') && v.endsWith('}')
