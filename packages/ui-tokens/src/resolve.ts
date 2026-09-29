import { isTokenRef, type Theme } from './roles'

function lookup(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

/**
 * Resolves a recipe value against a theme.
 *
 * `{color.action.bg}` looks up the role, which may itself hold `{blue.600}`,
 * a reference into the palette. One further hop is allowed — deliberately
 * capped, so a theme cannot build an indirection maze.
 */
export function resolveToken(theme: Theme, value: unknown): unknown {
  if (!isTokenRef(value)) return value

  const path = value.slice(1, -1)
  const roleValue = lookup(theme, path)

  if (roleValue === undefined) {
    throw new Error(`Unknown token "${path}" in theme "${theme.name}"`)
  }
  if (isTokenRef(roleValue)) {
    const palettePath = roleValue.slice(1, -1)
    const raw = lookup(theme.palette, palettePath)
    if (raw === undefined) {
      throw new Error(
        `Token "${path}" in theme "${theme.name}" points at "${palettePath}", which is not in the palette`,
      )
    }
    return raw
  }
  return roleValue
}

/** Resolves every value in a flat style object. */
export function resolveStyle(
  theme: Theme,
  style: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(style)) {
    out[key] = resolveToken(theme, value)
  }
  return out
}

/**
 * A theme whose colour roles hold real values rather than references.
 *
 * Recipes go through `resolveStyle`, but a screen reaching for
 * `theme.color.border.subtle` directly used to get the string
 * `"{neutral.200}"` — not a colour, and silently ignored rather than an error.
 * Resolving once at the provider makes direct reads work, and costs recipes
 * nothing: an already-resolved value is returned unchanged.
 */
export function resolveTheme(theme: Theme): Theme {
  // Role values are already one hop in — `{neutral.100}` points at the
  // palette, not at another role — so they resolve against the palette
  // directly rather than back through resolveToken's role lookup.
  const resolve = (value: string): string => {
    if (!isTokenRef(value)) return value
    const path = value.slice(1, -1)
    const raw = lookup(theme.palette, path)
    if (raw === undefined) {
      throw new Error(`Theme "${theme.name}" references "${path}", which is not in its palette`)
    }
    return raw as string
  }

  const color = Object.fromEntries(
    Object.entries(theme.color).map(([role, values]) => [
      role,
      Object.fromEntries(
        Object.entries(values as Record<string, string>).map(([key, value]) => [key, resolve(value)]),
      ),
    ]),
  ) as unknown as Theme['color']

  return { ...theme, color }
}
