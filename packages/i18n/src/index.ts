import en from '../locales/en-GB.json'
import pt from '../locales/pt-BR.json'

export const locales = ['en-GB', 'pt-BR'] as const
export type Locale = (typeof locales)[number]

/**
 * en-GB is the reference catalogue: every other locale is typed against it, so
 * a missing or misspelled key in pt-BR is a compile error rather than a blank
 * label in the UI.
 *
 * Carried over from Housekeeper, with pluralisation added. This product counts
 * things people care about -- days until their photos are deleted, how many
 * are queued -- and "1 days left" is the kind of detail that makes software
 * feel unfinished.
 */
export type Catalogue = typeof en

const catalogues: Record<Locale, Catalogue> = {
  'en-GB': en,
  'pt-BR': pt satisfies Catalogue,
}

/** The shape a plural entry takes. Intl decides which arm is used. */
export interface PluralForms {
  zero?: string
  one: string
  two?: string
  few?: string
  many?: string
  other: string
}

type IsPlural<T> = T extends { one: string; other: string } ? true : false

/** Dotted paths whose value is a plain string. */
type StringLeaves<T> = T extends string
  ? ''
  : IsPlural<T> extends true
    ? never
    : {
        [K in keyof T & string]: StringLeaves<T[K]> extends ''
          ? K
          : `${K}.${StringLeaves<T[K]>}`
      }[keyof T & string]

/** Dotted paths whose value is a plural group. */
type PluralLeaves<T> = T extends string
  ? never
  : IsPlural<T> extends true
    ? ''
    : {
        [K in keyof T & string]: PluralLeaves<T[K]> extends never
          ? never
          : PluralLeaves<T[K]> extends ''
            ? K
            : `${K}.${PluralLeaves<T[K]>}`
      }[keyof T & string]

export type TranslationKey = StringLeaves<Catalogue>
export type PluralKey = PluralLeaves<Catalogue>

function lookup(catalogue: Catalogue, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' && part in acc
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      catalogue,
    )
}

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

export interface Translator {
  (key: TranslationKey, params?: Record<string, string | number>): string
  /**
   * Picks the right arm for `count` using the locale's own rules, so
   * Portuguese is not forced into English's one-or-many split.
   * `{count}` is available to the template.
   */
  plural(
    key: PluralKey,
    count: number,
    params?: Record<string, string | number>,
  ): string
  locale: Locale
}

export function createTranslator(locale: Locale): Translator {
  const catalogue = catalogues[locale]
  const pluralRules = new Intl.PluralRules(locale)

  const missing = (key: string): string => {
    // Loud on purpose: a missing key should be noticed in review, not ship as
    // a blank label. The key itself is rendered so it is obvious on screen.
    console.warn(`[i18n] missing key "${key}" in "${locale}"`)
    return key
  }

  const t = ((key: TranslationKey, params?: Record<string, string | number>) => {
    const value = lookup(catalogue, key) ?? lookup(catalogues['en-GB'], key)
    if (typeof value !== 'string') return missing(key)
    return fill(value, params)
  }) as Translator

  t.plural = (key, count, params) => {
    const value =
      (lookup(catalogue, key) as PluralForms | undefined) ??
      (lookup(catalogues['en-GB'], key) as PluralForms | undefined)

    if (!value || typeof value.other !== 'string') return missing(key)

    const category = pluralRules.select(count) as keyof PluralForms
    const template = value[category] ?? value.other

    return fill(template, { count, ...params })
  }

  t.locale = locale
  return t
}

/** Best match for a device language, falling back to en-GB. */
export function resolveLocale(preferred: string | null | undefined): Locale {
  if (!preferred) return 'en-GB'
  const exact = locales.find((l) => l.toLowerCase() === preferred.toLowerCase())
  if (exact) return exact
  const language = preferred.split('-')[0]?.toLowerCase()
  return locales.find((l) => l.split('-')[0]?.toLowerCase() === language) ?? 'en-GB'
}

export { en, pt }
