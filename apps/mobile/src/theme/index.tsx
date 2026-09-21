import { resolveTheme, type Theme } from '@dk/ui-tokens'
import photoboothDark from '@dk/ui-tokens/themes/photobooth.dark.json'
import photoboothLight from '@dk/ui-tokens/themes/photobooth.light.json'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme, type TextStyle } from 'react-native'

/**
 * Theme access for the app.
 *
 * The token package itself stays React-free so the API can use it too -- the
 * montage compositor needs the same palette the screens do. This file is the
 * only React-aware part.
 *
 * roles.ts is kept byte-identical to the copy in Housekeeper on purpose. The
 * palettes are this project's; the *contract* is shared, and keeping it
 * unchanged is what makes pulling both into one package later a move rather
 * than a reconciliation. Light and dark are two themes against that one
 * contract, not two sets of components.
 */

export type Appearance = 'system' | 'light' | 'dark'

interface ThemeState {
  theme: Theme
  appearance: Appearance
  /** What is actually on screen once 'system' is resolved. */
  resolved: 'light' | 'dark'
  setAppearance(appearance: Appearance): void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [appearance, setAppearance] = useState<Appearance>('system')

  const resolved: 'light' | 'dark' =
    appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance

  const value = useMemo<ThemeState>(() => {
    const source = resolved === 'light' ? photoboothLight : photoboothDark
    // Resolved once here so a screen reading theme.color.border.subtle
    // directly gets a colour rather than the string "{neutral.800}".
    return {
      theme: resolveTheme(source as Theme),
      appearance,
      resolved,
      setAppearance,
    }
  }, [resolved, appearance])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useThemeState(): ThemeState {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside a ThemeProvider.')
  return value
}

export function useTheme(): Theme {
  return useThemeState().theme
}

/** For the appearance control in Profile. */
export function useAppearance(): Omit<ThemeState, 'theme'> {
  const { appearance, resolved, setAppearance } = useThemeState()
  return { appearance, resolved, setAppearance }
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
