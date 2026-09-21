import { resolveTheme, type Theme } from '@dk/ui-tokens'
import photoboothDark from '@dk/ui-tokens/themes/photobooth.dark.json'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { TextStyle } from 'react-native'

/**
 * Theme access for the app.
 *
 * The token package itself stays React-free so the API can use it too -- the
 * montage compositor needs the same palette the screens do. This file is the
 * only React-aware part.
 *
 * roles.ts is kept byte-identical to the copy in Housekeeper on purpose. The
 * palette is this project's; the *contract* is shared, and keeping it
 * unchanged is what makes pulling both into one package later a move rather
 * than a reconciliation.
 */

const ThemeContext = createContext<Theme | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Resolved once here so a screen reading theme.color.border.subtle directly
  // gets a colour rather than the string "{neutral.800}".
  const theme = useMemo(() => resolveTheme(photoboothDark as Theme), [])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme must be used inside a ThemeProvider.')
  return theme
}

/**
 * The theme types font weights as plain strings, which is right for a
 * platform-neutral token package -- CSS and React Native disagree about the
 * allowed set. React Native's TextStyle wants its own union, so narrow here
 * rather than widening the shared contract, which is kept identical to
 * Housekeeper's on purpose.
 */
export const weight = (value: string): TextStyle['fontWeight'] =>
  value as TextStyle['fontWeight']
