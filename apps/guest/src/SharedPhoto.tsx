import { useEffect, useState } from 'react'
import type { createTranslator } from '@dk/i18n'
import { api, type SharedPhoto as Shared } from './api'

type Translator = ReturnType<typeof createTranslator>

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
    </main>
  )
}
