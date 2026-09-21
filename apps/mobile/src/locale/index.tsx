import {
  createTranslator,
  resolveLocale,
  type Locale,
  type Translator,
} from '@dk/i18n'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Language for the app.
 *
 * The device's own setting is the default, so someone in Brazil opens the app
 * in Portuguese without being asked. A manual override is kept in memory for
 * now; persisting it needs different storage on web and native, which is a
 * decision worth making once rather than guessing at twice.
 */

interface LocaleState {
  t: Translator
  locale: Locale
  setLocale(locale: Locale): void
}

const LocaleContext = createContext<LocaleState | null>(null)

function deviceLocale(): Locale {
  try {
    // Available on both platforms and needs no extra dependency.
    return resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return 'en-GB'
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(deviceLocale)

  const value = useMemo<LocaleState>(
    () => ({ t: createTranslator(locale), locale, setLocale }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleState {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale must be used inside a LocaleProvider.')
  return value
}

/** The common case: a screen just wants to translate something. */
export function useT(): Translator {
  return useLocale().t
}
