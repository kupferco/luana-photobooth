import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from './locales/en-GB'
import { pt } from './locales/pt-BR'

/**
 * Writes every page in every language, as plain HTML files Vite can build.
 *
 * A page is written once, in pages/, with {{keys}} where the words go. The
 * words live in locales/. English comes out at /, Portuguese at /pt/, as
 * real files in real folders -- so the host needs no rewrite rule, nothing
 * is translated in the browser, and a search engine sees each language as
 * its own page.
 *
 * The output is generated and ignored by git. Edit pages/ and locales/.
 */

const here = dirname(fileURLToPath(import.meta.url))

/** Where the site is served, for the links that have to be absolute. */
const SITE = 'https://luminabooth.web.app'

const PAGES = ['home', 'setup', 'install', 'privacy', 'terms'] as const
type Page = (typeof PAGES)[number]

const LOCALES = [
  { lang: 'en-GB', base: '', copy: en },
  { lang: 'pt-BR', base: '/pt', copy: pt },
] as const

/** `home` is the folder itself; every other page is a folder inside it. */
const path = (base: string, page: Page) => `${base}/${page === 'home' ? '' : `${page}/`}`

function fill(template: string, values: Record<string, string>, where: string): string {
  let out = template

  // More than one pass, because copy can itself point at other copy: an
  // answer that links to the WhatsApp address, say.
  for (let pass = 0; pass < 4 && out.includes('{{'); pass++) {
    out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      if (!(key in values)) {
        // A missing word is a build failure, not a blank on the page.
        throw new Error(`${where}: nothing to put in {{${key}}}`)
      }
      return values[key]
    })
  }

  return out
}

/** Writes the pages and returns them as Rollup inputs. */
export function render(): Record<string, string> {
  const layout = readFileSync(join(here, 'pages', '_layout.html'), 'utf8')
  const inputs: Record<string, string> = {}

  for (const { lang, base, copy } of LOCALES) {
    const other = LOCALES.find((l) => l.lang !== lang)!

    for (const page of PAGES) {
      const body = readFileSync(join(here, 'pages', `${page}.html`), 'utf8')

      const html = fill(
        layout.replace('<!--body-->', body),
        {
          ...copy,
          lang,
          base,
          page,
          title: copy[`${page}.title`],
          description: copy[`${page}.description`],
          url: SITE + path(base, page),
          alt: path(other.base, page),
          'alt.lang': other.lang,
          'alt.url': SITE + path(other.base, page),
        },
        `${page} (${lang})`,
      )

      const file = join(here, path(base, page).slice(1), 'index.html')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, html)

      inputs[`${lang}-${page}`] = file
    }
  }

  return inputs
}
