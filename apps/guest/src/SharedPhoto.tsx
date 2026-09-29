import { useEffect, useState } from 'react'
import type { createTranslator } from '@dk/i18n'
import { api, type SharedPhoto as Shared } from './api'

type Translator = ReturnType<typeof createTranslator>

/**
 * Where "Made with Lumina" goes.
 *
 * The landing page, which is what a stranger following this link should
 * meet: it explains what made the photo they are looking at. It used to be
 * the app, because there was no landing page.
 */
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://luminabooth.web.app'

/** Long form, in the reader's own locale rather than the party's. */
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/**
 * One photo, shared by whoever was at the party.
 *
 * Reached from a link in a message or an email, by someone who was not
 * necessarily there and has nothing to sign in with. So: no session, no
 * code, no queue -- just the photograph, whose party it was and when, and
 * when it will be deleted.
 *
 * The link replaced a signed storage URL that ran to several hundred
 * characters, exposed the bucket layout, and stopped working after seven
 * days. People open these weeks later.
 *
 * Renders into the shell rather than wrapping itself in another element.
 * It used to nest a second <main> here, which had no styles, so the shell's
 * spacing stopped at it and the whole page ran together.
 */
export function SharedPhoto({ token, t }: { token: string; t: Translator }) {
  const [photo, setPhoto] = useState<Shared | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .shared(token)
      .then((result) => {
        if (!cancelled) setPhoto(result)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (error) {
    return (
      <>
        <h1>{t('shared.goneTitle')}</h1>
        <p className="muted">{t('shared.goneBody')}</p>
      </>
    )
  }

  if (!photo) {
    return <p className="muted">{t('common.loading')}</p>
  }

  return (
    <div className="shared">
      <header className="shared-header">
        {photo.eventName ? <h1>{photo.eventName}</h1> : null}
        {/* Falls back to when the shutter went, for a photo whose party has
            since been deleted and whose date came back null. */}
        {photo.eventDate ?? photo.takenAt ? (
          <span className="shared-when">
            {longDate(photo.eventDate ?? photo.takenAt)}
          </span>
        ) : null}
      </header>

      <img className="montage" src={photo.montageUrl} alt="" />

      <div className="shared-actions">
        {/* A plain link, not a fetch-and-blob: on a phone this offers "save to
            photos", which is what someone opening a shared picture wants. */}
        <a className="button primary" href={photo.montageUrl} download="photo.jpg">
          {t('shared.save')}
        </a>

        {photo.retentionUntil ? (
          <p className="fine">
            {t('shared.keptUntil', { date: longDate(photo.retentionUntil) })}
          </p>
        ) : null}
      </div>

      {/* The mark carries the name, so the label above it is only the verb. */}
      <a className="made-with" href={SITE_URL} target="_blank" rel="noreferrer">
        {t('shared.madeWith')}
        <img src="/brand/logo-light.png" alt="Lumina" />
      </a>
    </div>
  )
}
