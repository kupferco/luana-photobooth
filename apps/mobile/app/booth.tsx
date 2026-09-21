import { CLASSIC_3UP, retentionNotice, type Template } from '@photobooth/shared'
import { useKeepAwake } from 'expo-keep-awake'
import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { api, usingFixtures } from '../src/api'
import { booth, isPaired, savePairing, uploadShot, type BoothPoll } from '../src/booth/client'
import { MontagePreview } from '../src/booth/MontagePreview'
import { CameraView, type CameraRef, type CapturedShot } from '../src/camera'
import { useActiveEvent } from '../src/event-context'
import { useT } from '../src/locale'
import { useSession } from '../src/session'
import { useTheme, weight } from '../src/theme'
import { Body, Button, Card, Heading, Notice, Screen, Spinner } from '../src/ui'

/**
 * Booth mode: the tripod phone.
 *
 * Timings are v1's, which ran a real party: a three-second countdown at one
 * second a number, then each shot held for two seconds before the live view
 * returns. They are not arbitrary -- people need the pause to see that the
 * photo happened.
 *
 * Built against the real API rather than fixtures on purpose. What can be
 * wrong here is camera timing and upload latency on venue wifi, and a
 * fixture upload always succeeds instantly.
 */

const COUNTDOWN_FROM = 3
const COUNT_INTERVAL_MS = 1000
const SHOT_PREVIEW_MS = 2000
const POLL_INTERVAL_MS = 2000
/** Back to idle after a montage, so the booth is never left on someone's face. */
const RESULT_TIMEOUT_MS = 20_000

type Phase =
  | { kind: 'setup' }
  | { kind: 'idle' }
  | { kind: 'counting'; count: number; shotIndex: number }
  | { kind: 'preview'; shotIndex: number }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

export default function Booth() {
  const t = useT()
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const { active, loading: loadingEvents, error: eventsError } = useActiveEvent()
  const { tenantId } = useSession()

  useKeepAwake()

  const cameraRef = useRef<CameraRef>(null)
  const [paired, setPaired] = useState<boolean | null>(null)
  const [pairing, setPairing] = useState(false)
  const [poll, setPoll] = useState<BoothPoll | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [shots, setShots] = useState<CapturedShot[]>([])

  // A run in progress must not be interrupted by the poll loop starting
  // another, and the tap handler must not start a second sequence.
  const running = useRef(false)

  const template: Template = poll?.template ?? CLASSIC_3UP
  const landscape = width > Dimensions.get('window').height

  // --- pairing ------------------------------------------------------------

  useEffect(() => {
    void isPaired().then(setPaired)
  }, [])

  const pair = useCallback(async () => {
    // Never return silently: a button that ends in nothing is indistinguishable
    // from a broken one, and this was reported as exactly that.
    if (!tenantId) {
      setPhase({ kind: 'error', message: t('booth.notSignedIn') })
      return
    }
    if (!active) {
      setPhase({ kind: 'error', message: t('event.none') })
      return
    }
    setPairing(true)
    try {
      const result = await api.claimBooth(tenantId, active.id)
      await savePairing(result.token)
      setPaired(true)
      setPhase({ kind: 'idle' })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setPairing(false)
    }
  }, [tenantId, active, t])

  // --- polling ------------------------------------------------------------

  useEffect(() => {
    if (!paired) return
    let cancelled = false

    const tick = async () => {
      try {
        const result = await booth.poll()
        if (cancelled) return
        setPoll(result)
        setPhase((current) => (current.kind === 'setup' ? { kind: 'idle' } : current))

        // A guest triggered from their phone. Same code path as a tap.
        if (!running.current && result.next && result.next.status === 'queued') {
          void run(result.next.id, result.next.shotsExpected)
        }
      } catch (e) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // `run` is stable for the life of the screen; re-subscribing on every
    // render would restart the interval constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired])

  // --- the sequence -------------------------------------------------------

  const countdown = (from: number, shotIndex: number) =>
    new Promise<void>((resolve) => {
      let n = from
      setPhase({ kind: 'counting', count: n, shotIndex })
      const timer = setInterval(() => {
        n -= 1
        if (n <= 0) {
          clearInterval(timer)
          resolve()
        } else {
          setPhase({ kind: 'counting', count: n, shotIndex })
        }
      }, COUNT_INTERVAL_MS)
    })

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const run = useCallback(
    async (sessionId: string, shotsExpected: number) => {
      if (running.current) return
      running.current = true
      setShots([])

      try {
        await booth.claim(sessionId)

        const taken: CapturedShot[] = []
        for (let i = 0; i < shotsExpected; i += 1) {
          await countdown(COUNTDOWN_FROM, i)
          const shot = await cameraRef.current?.capture()
          if (!shot) throw new Error('The camera did not return a photo.')

          taken.push(shot)
          setShots([...taken])
          setPhase({ kind: 'preview', shotIndex: i })
          await wait(SHOT_PREVIEW_MS)
        }

        setPhase({ kind: 'working' })

        const { uploads } = await booth.uploadTickets(sessionId, taken.length)
        await Promise.all(
          uploads.map((ticket) => uploadShot(ticket, taken[ticket.idx]!.blob)),
        )

        await booth.complete(
          sessionId,
          taken.map((shot, idx) => ({
            idx,
            width: shot.width,
            height: shot.height,
          })),
        )

        setPhase({ kind: 'done' })
        await wait(RESULT_TIMEOUT_MS)
        reset()
      } catch (e) {
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      } finally {
        running.current = false
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setShots((previous) => {
      previous.forEach((s) => {
        if (s.previewUri.startsWith('blob:')) URL.revokeObjectURL(s.previewUri)
      })
      return []
    })
    setPhase({ kind: 'idle' })
  }, [])

  const startLocal = useCallback(async () => {
    if (running.current) return
    try {
      const session = await booth.startLocal()
      await run(session.id, session.shotsExpected)
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [run])

  // --- screens ------------------------------------------------------------

  if (paired === null) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    )
  }

  if (!paired) {
    return (
      <Screen>
        <Heading>{t('booth.title')}</Heading>
        <Card>
          <Body>{active ? active.name : t('event.none')}</Body>
          <Body muted>{active ? t('booth.pairHint') : t('event.noneHint')}</Body>
        </Card>

        {eventsError ? <Notice tone="bad">{eventsError}</Notice> : null}
        {!tenantId && !loadingEvents ? (
          <Notice tone="bad">{t('booth.notSignedIn')}</Notice>
        ) : null}

        {/* Shown here too: this screen returns before the stage below, so an
            error raised while pairing would otherwise never appear and the
            button would look like it did nothing. */}
        {phase.kind === 'error' ? <Notice tone="bad">{phase.message}</Notice> : null}

        {usingFixtures ? <Notice tone="warn">{t('booth.needsLiveApi')}</Notice> : null}

        <Button
          label={t('booth.pair')}
          onPress={pair}
          disabled={!active}
          busy={pairing}
        />
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    )
  }

  // The web build cannot force orientation, so it asks. On a tripod this is
  // a one-time step, and portrait would crop most of the frame away.
  if (Platform.OS === 'web' && !landscape) {
    return (
      <Screen>
        <Heading>{t('booth.rotate')}</Heading>
        <Body muted>{t('booth.rotateHint')}</Body>
        {/* Same trap as the pairing screen: without this, an error raised
            while the phone is upright stays invisible until someone happens
            to rotate it. */}
        {phase.kind === 'error' ? <Notice tone="bad">{phase.message}</Notice> : null}
      </Screen>
    )
  }

  const retention = poll?.event.retentionUntil
    ? retentionNotice(new Date(poll.event.retentionUntil))
    : null

  return (
    <View style={[styles.stage, { backgroundColor: '#000' }]}>
      <CameraView
        ref={cameraRef}
        mirrorPreview
        onError={(e) => setPhase({ kind: 'error', message: e.message })}
        style={styles.fill}
      />

      {/* Everything below floats over the live view. */}
      {phase.kind === 'idle' ? (
        <Pressable style={styles.fill} onPress={startLocal}>
          <View style={styles.centre}>
            <Text style={[styles.big, { color: '#fff' }]}>{t('booth.tapToStart')}</Text>
            {poll?.event.joinCode ? (
              <Text style={[styles.code, { color: theme.color.action.bg }]}>
                {poll.event.joinCode}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {phase.kind === 'counting' ? (
        <View style={styles.centre} pointerEvents="none">
          <Text style={[styles.count, { color: theme.color.action.bg }]}>
            {phase.count}
          </Text>
          <Text style={[styles.caption, { color: '#fff' }]}>
            {t('booth.shotOf', {
              current: phase.shotIndex + 1,
              total: template.cells.length,
            })}
          </Text>
        </View>
      ) : null}

      {phase.kind === 'preview' ? (
        <View style={styles.centre} pointerEvents="none">
          <MontagePreview
            template={template}
            shotUris={template.cells.map((_, i) => shots[i]?.previewUri ?? null)}
            width={Math.min(width * 0.8, 720)}
          />
        </View>
      ) : null}

      {phase.kind === 'working' ? (
        <View style={styles.centre} pointerEvents="none">
          <Spinner />
          <Text style={[styles.caption, { color: '#fff' }]}>
            {t('guest.composing')}
          </Text>
        </View>
      ) : null}

      {phase.kind === 'done' ? (
        <Pressable style={[styles.fill, styles.centre]} onPress={reset}>
          <MontagePreview
            template={template}
            shotUris={template.cells.map((_, i) => shots[i]?.previewUri ?? null)}
            width={Math.min(width * 0.8, 720)}
          />
          <Text style={[styles.caption, { color: '#fff' }]}>{t('guest.ready')}</Text>
        </Pressable>
      ) : null}

      {phase.kind === 'error' ? (
        <View style={[styles.fill, styles.centre, { padding: 24 }]}>
          <Notice tone="bad">{phase.message}</Notice>
          <Button label={t('common.retry')} onPress={reset} />
          <Button
            label={t('common.back')}
            variant="secondary"
            onPress={() => router.back()}
          />
        </View>
      ) : null}

      {/* Visible to anyone standing in the queue, at every phase. */}
      {retention ? (
        <Text style={[styles.footer, { color: 'rgba(255,255,255,0.7)' }]}>
          {retention}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  big: { fontSize: 44, fontWeight: weight('700') },
  code: { fontSize: 28, fontWeight: weight('700'), letterSpacing: 8 },
  count: { fontSize: 180, fontWeight: weight('700') },
  caption: { fontSize: 20, fontWeight: weight('600') },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
  },
})
