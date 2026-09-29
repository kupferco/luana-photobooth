import { useEffect, useState } from 'react'
import type { createTranslator } from '@dk/i18n'
import { api, type SharedPhoto as Shared } from './api'

type Translator = ReturnType<typeof createTranslator>

/**
 * Where "Made with Lumina" goes.
 *
 * The app for now, because it is where someone who followed the link would
 * sign up. A marketing page would be a better answer and is one env var
 * away when there is one.
 */
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://luminabooth.web.app'

/**
 * One photo, shared by whoever was at the party.
 *
 * Reached from a link in a message or an email, by someone who was not
 * necessarily there and has nothing to sign in with. So: no session, no
 * code, no queue -- just the photograph, whose party it was, and when it
 * will be deleted.
 *
 * The link replaced a signed storage URL that ran to several hundred
 * characters, exposed the bucket layout, and stopped working after seven
 * days. People open these weeks later.
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
      <main className="screen">
        <h1>{t('shared.goneTitle')}</h1>
        <p className="muted">{t('shared.goneBody')}</p>
      </main>
    )
  }

  if (!photo) {
    return (
      <main className="screen">
        <p className="muted">{t('common.loading')}</p>
      </main>
    )
  }

  return (
    <main className="screen">
      {photo.eventName ? <h1>{photo.eventName}</h1> : null}

      <img className="montage" src={photo.montageUrl} alt="" />

      {/* A plain link, not a fetch-and-blob: on a phone this offers "save to
          photos", which is what someone opening a shared picture wants. */}
      <a className="button" href={photo.montageUrl} download="photo.jpg">
        {t('shared.save')}
      </a>

      {photo.retentionUntil ? (
        <p className="muted small">
          {t('shared.keptUntil', {
            date: new Date(photo.retentionUntil).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          })}
        </p>
      ) : null}

      {/* The only thing on the page that says what made this. A shared photo
          is forwarded to people who were not at the party, so this is the
          one place the link can travel to someone who has never heard of it. */}
      <a className="made-with" href={SITE_URL} target="_blank" rel="noreferrer">
        <img src="/icons/favicon-48.png" alt="" />
        {t('shared.madeWith')}
      </a>
    </main>
  )
}
