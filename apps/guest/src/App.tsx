import { createTranslator, resolveLocale } from '@dk/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionView } from '@photobooth/shared'
import {
  api,
  forgetLocal,
  recall,
  remember,
  type JoinInfo,
  type StartedSession,
} from './api'

/**
 * The guest page.
 *
 * One screen, four states, and no navigation: someone scans a code at a party
 * and everything happens in front of them. Anything that needs explaining has
 * already failed.
 */

const POLL_MS = 2000

/** The join code is the whole path: /ABCDEF, or /j/ABCDEF. */
function joinCodeFromPath(): string {
  const parts = window.location.pathname.split('/').filter(Boolean)
  return (parts[parts.length - 1] ?? '').toUpperCase()
}

export function App() {
  const t = useMemo(() => createTranslator(resolveLocale(navigator.language)), [])
  const joinCode = useMemo(joinCodeFromPath, [])

  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [session, setSession] = useState<StartedSession | null>(() =>
    joinCode ? recall(joinCode) : null,
  )
  const [view, setView] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const starts = useRef(false)

  // --- which party is this -------------------------------------------------

  useEffect(() => {
    if (!joinCode) return
    let cancelled = false
    api
      .join(joinCode)
      .then((result) => !cancelled && setInfo(result))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [joinCode])

  // --- follow the session --------------------------------------------------

  useEffect(() => {
    if (!session) return
    let cancelled = false

    const tick = async () => {
      try {
        const next = await api.session(session.code, session.token)
        if (!cancelled) {
          setView(next)
          setError(null)
        }
      } catch (e) {
        if (cancelled) return
        // A 404 means the session is gone -- deleted, or expired. Anything
        // else is probably the wifi, and the photos are still there.
        if (e instanceof Error && 'status' in e && e.status === 404) {
          forgetLocal(joinCode)
          setSession(null)
          setView(null)
        } else {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [session, joinCode])

  const start = useCallback(async () => {
    if (starts.current) return
    starts.current = true
    setStarting(true)
    setError(null)
    try {
      const started = await api.start(joinCode)
      remember(joinCode, started)
      setSession(started)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      starts.current = false
      setStarting(false)
    }
  }, [joinCode])

  const deleteMine = useCallback(async () => {
    if (!session) return
    await api.forget(session.code, session.token).catch(() => {})
    forgetLocal(joinCode)
    setSession(null)
    setView(null)
  }, [session, joinCode])

  const again = useCallback(() => {
    forgetLocal(joinCode)
    setSession(null)
    setView(null)
  }, [joinCode])

  // --- screens -------------------------------------------------------------

  if (!joinCode) {
    return (
      <Shell>
        <h1>{t('app.name')}</h1>
        <p className="muted">{t('guest.noCode')}</p>
      </Shell>
    )
  }

  if (error && !info) {
    return (
      <Shell>
        <h1>{t('app.name')}</h1>
        <p className="bad">{error}</p>
        <button onClick={() => window.location.reload()}>{t('common.retry')}</button>
      </Shell>
    )
  }

  if (!info) {
    return (
      <Shell>
        <div className="spinner" aria-label={t('common.loading')} />
      </Shell>
    )
  }

  // Not started yet.
  if (!session || !view) {
    return (
      <Shell>
        <h1>{info.event.name}</h1>
        <p className="muted">{t('guest.welcomeHint', { count: info.shotsExpected })}</p>

        {!info.boothOnline ? (
          <p className="notice">{t('guest.boothOfflineHint')}</p>
        ) : info.queueDepth > 0 ? (
          <p className="notice">{t.plural('guest.queuePosition', info.queueDepth)}</p>
        ) : null}

        {error ? <p className="bad">{error}</p> : null}

        <button className="primary big" onClick={start} disabled={starting}>
          {starting ? t('common.loading') : t('guest.start')}
        </button>

        <p className="fine">{info.event.retentionNoticeFull}</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>{info.event.name}</h1>

      {view.status === 'queued' ? (
        <>
          {/* A queue behind a booth that is switched off is not a queue, and
              saying "1 person ahead of you" when nothing is running is worse
              than saying nothing. */}
          {view.boothOnline ? (
            <>
              <p className="big-status">{t('guest.queued')}</p>
              <p className="muted">
                {view.queuePosition && view.queuePosition > 0
                  ? t.plural('guest.queuePosition', view.queuePosition)
                  : t('guest.youAreNext')}
              </p>
              <div className="spinner" />
            </>
          ) : (
            <>
              <p className="big-status">{t('guest.boothOffline')}</p>
              <p className="muted">{t('guest.boothOfflineHint')}</p>
            </>
          )}
        </>
      ) : null}

      {view.status === 'capturing' ? (
        <>
          <p className="big-status">{t('guest.capturing')}</p>
          <p className="muted">
            {t('booth.shotOf', {
              current: Math.min(view.shotsTaken + 1, view.shotCount),
              total: view.shotCount,
            })}
          </p>
        </>
      ) : null}

      {view.status === 'composing' ? (
        <>
          <p className="big-status">{t('guest.composing')}</p>
          <div className="spinner" />
        </>
      ) : null}

      {view.status === 'ready' && view.montageUrl ? (
        <>
          <img className="montage" src={view.montageUrl} alt={t('guest.ready')} />
          <p className="code">{view.code}</p>
          <button className="primary" onClick={() => window.open(view.montageUrl!, '_blank')}>
            {t('guest.save')}
          </button>
          <button onClick={again}>{t('guest.again')}</button>
        </>
      ) : null}

      {view.status === 'failed' || view.status === 'abandoned' ? (
        <>
          <p className="big-status">{t('guest.failed')}</p>
          {view.error ? <p className="muted">{view.error}</p> : null}
          <button className="primary" onClick={again}>
            {t('common.retry')}
          </button>
        </>
      ) : null}

      {error ? <p className="bad">{error}</p> : null}

      <p className="fine">{info.event.retentionNoticeFull}</p>
      <button className="quiet" onClick={deleteMine}>
        {t('retention.deleteMine')}
      </button>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="shell">{children}</main>
}
