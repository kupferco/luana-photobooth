import { CLASSIC_3UP, retentionNotice, type Template } from '@photobooth/shared'
import { useKeepAwake } from 'expo-keep-awake'
import QRCode from 'react-native-qrcode-svg'
import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { api, usingFixtures } from '../src/api'
import { ApiError } from '../src/api/types'
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

/**
 * Where the QR sends a guest. Baked in per environment at build time, like
 * the API URL, so a staging booth cannot send people to production.
 */
const GUEST_BASE =
  process.env.EXPO_PUBLIC_GUEST_URL ?? 'http://localhost:5173'

const guestUrl = (joinCode: string) => `${GUEST_BASE}/${joinCode}`

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
  const { width, height } = useWindowDimensions()
  const { active, loading: loadingEvents, error: eventsError } = useActiveEvent()
  const { tenantId } = useSession()

  useKeepAwake()

  const cameraRef = useRef<CameraRef>(null)
  const [paired, setPaired] = useState<boolean | null>(null)
  const [pairing, setPairing] = useState(false)
  const [poll, setPoll] = useState<BoothPoll | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [shots, setShots] = useState<CapturedShot[]>([])
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [finished, setFinished] = useState<{ id: string; canPrint: boolean } | null>(
    null,
  )
  const [printState, setPrintState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [confirmExit, setConfirmExit] = useState(false)
  /**
   * Set when the owner stopped this booth from their phone.
   *
   * Distinguished from "never set up" because the two need different words:
   * a booth that was switched off deliberately should say so, or whoever is
   * standing at the tripod will think it broke.
   */
  const [stopped, setStopped] = useState(false)

  // A run in progress must not be interrupted by the poll loop starting
  // another, and the tap handler must not start a second sequence.
  const running = useRef(false)

  const template: Template = poll?.template ?? CLASSIC_3UP
  const landscape = width > height

  /**
   * How wide the montage can be and still leave room for what sits under it.
   *
   * `reserved` is the caption, code and hint plus their gaps. The montage is
   * 3:2, so the height left over caps the width at 1.5x it.
   */
  const montageWidth = (reserved: number) =>
    Math.max(
      180,
      Math.min(width * 0.55, (height - reserved) * (3 / 2), 520),
    )

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
    setStopped(false)
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
          void run(result.next.id, result.next.shotsExpected, result.next.code)
        }
      } catch (e) {
        if (cancelled) return

        /*
         * A 401 here means the device is gone, not that the network blipped.
         * The owner pressed "stop photo booth", or ended and rebuilt the
         * event. The client has already dropped the token, so every later
         * call would fail the same way -- staying on this screen would show
         * a booth that can never recover.
         *
         * Dropping back to the setup screen makes it recoverable: whoever is
         * at the tripod can start it again, or hand the phone back.
         */
        if (e instanceof ApiError && (e.status === 401 || e.code === 'unpaired')) {
          // A capture interrupted half way leaves this latched, which would
          // block every future run after re-pairing.
          running.current = false
          setStopped(true)
          setPaired(false)
          setPoll(null)
          setPhase({ kind: 'setup' })
          return
        }

        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
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
    async (sessionId: string, shotsExpected: number, code?: string) => {
      if (running.current) return
      running.current = true
      setShots([])
      setLastCode(code ?? null)

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

        const done = await booth.complete(
          sessionId,
          taken.map((shot, idx) => ({
            idx,
            width: shot.width,
            height: shot.height,
          })),
        )

        setFinished({ id: done.id, canPrint: done.canPrint })
        setPrintState('idle')
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
    setFinished(null)
    setPrintState('idle')
    setPhase({ kind: 'idle' })
  }, [])

  const printFinished = useCallback(async () => {
    if (!finished || printState !== 'idle') return
    setPrintState('sending')
    try {
      await booth.print(finished.id)
      setPrintState('sent')
    } catch {
      // The booth is unattended and the guest is standing there; a failed
      // print is not worth a dialog they cannot act on. The owner sees the
      // job's state on the dashboard.
      setPrintState('idle')
    }
  }, [finished, printState])

  const startLocal = useCallback(async () => {
    if (running.current) return
    try {
      const session = await booth.startLocal()
      await run(session.id, session.shotsExpected, session.code)
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

        {stopped ? <Notice tone="warn">{t('booth.stoppedByOwner')}</Notice> : null}

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

  // Ending the event from the dashboard is how the owner stops the booth, so
  // the booth has to notice. Without this it kept polling a finished party
  // and still offered to take photos into it.
  if (poll && poll.event.status !== 'live' && !running.current) {
    return (
      <Screen>
        <Heading>{poll.event.name}</Heading>
        <Notice tone="warn">{t('booth.eventEnded')}</Notice>
        <Button label={t('common.back')} onPress={() => router.back()} />
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
            <Text
              style={[
                styles.big,
                { color: '#fff', fontSize: height < 420 ? 30 : 44 },
              ]}
            >
              {t('booth.tapToStart')}
            </Text>

            {poll?.event.joinCode ? (
              <View style={styles.joinBlock}>
                <Text style={[styles.hint, { color: 'rgba(255,255,255,0.85)' }]}>
                  {t('booth.scanToTrigger')}
                </Text>

                {/* White quiet zone: scanners need the contrast, and on a dark
                    booth screen a bare QR reads poorly from a metre away. */}
                <View style={styles.qrPlate}>
                  <QRCode
                    value={guestUrl(poll.event.joinCode)}
                    size={height < 420 ? 104 : 148}
                  />
                </View>

                {/* The code stays as the fallback for a phone that will not
                    scan, not as the main instruction. */}
                <Text style={[styles.codeSmall, { color: 'rgba(255,255,255,0.65)' }]}>
                  {t('booth.orEnterCode', { code: poll.event.joinCode })}
                </Text>
              </View>
            ) : null}

            {retention ? (
              <Text style={[styles.retention, { color: 'rgba(255,255,255,0.75)' }]}>
                {retention}
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
            width={montageWidth(64)}
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
        <Pressable style={[styles.fill, styles.scrim, styles.centre]} onPress={reset}>
          <View style={styles.tilt}>
            <MontagePreview
              template={template}
              shotUris={template.cells.map((_, i) => shots[i]?.previewUri ?? null)}
              width={montageWidth(200)}
            />
          </View>

          <Text style={[styles.caption, { color: '#fff' }]}>{t('guest.ready')}</Text>

          {/* Only for a session started here. A guest who triggered from
              their own phone prints from there, and printing it at the booth
              as well would produce copies nobody asked for. */}
          {finished?.canPrint ? (
            <View style={{ width: '60%', maxWidth: 360 }}>
              <Button
                label={
                  printState === 'sent' ? t('booth.printSent') : t('dashboard.print')
                }
                busy={printState === 'sending'}
                disabled={printState === 'sent'}
                onPress={() => void printFinished()}
              />
            </View>
          ) : null}

          {lastCode ? (
            <View style={styles.centreRow}>
              <Text style={[styles.codeLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                {t('booth.yourCode')}
              </Text>
              <Text style={[styles.code, { color: theme.color.action.bg }]}>
                {lastCode}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.hint, { color: 'rgba(255,255,255,0.6)' }]}>
            {t('booth.tapToContinue')}
          </Text>
        </Pressable>
      ) : null}

      {/* Exit handle. Small, cornered and long-press only, so a guest cannot
          leave booth mode by fumbling -- but the owner is never trapped. */}
      <Pressable
        style={styles.exitHandle}
        onLongPress={() => setConfirmExit(true)}
        delayLongPress={1500}
        accessibilityLabel={t('booth.exit')}
      />

      {confirmExit ? (
        <View style={[styles.fill, styles.scrim, styles.centre, { padding: 24 }]}>
          <Text style={[styles.caption, { color: '#fff' }]}>{t('booth.exitConfirm')}</Text>
          <View style={{ width: '100%', maxWidth: 420, gap: 12 }}>
            <Button
              label={t('booth.exit')}
              onPress={() => {
                setConfirmExit(false)
                router.back()
              }}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setConfirmExit(false)}
            />
          </View>
        </View>
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
    gap: 10,
    paddingVertical: 12,
  },
  big: { fontSize: 44, fontWeight: weight('700') },
  code: { fontSize: 28, fontWeight: weight('700'), letterSpacing: 8 },
  count: { fontSize: 180, fontWeight: weight('700') },
  // Sits like a print dropped on a table rather than filling the screen.
  tilt: { transform: [{ rotate: '-3deg' }] },
  scrim: { backgroundColor: 'rgba(0,0,0,0.72)' },
  centreRow: { alignItems: 'center', gap: 2 },
  codeLabel: { fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  hint: { fontSize: 14 },
  exitHandle: { position: 'absolute', top: 0, left: 0, width: 72, height: 72 },
  caption: { fontSize: 20, fontWeight: weight('600') },
  retention: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  joinBlock: { alignItems: 'center', gap: 10 },
  qrPlate: { backgroundColor: '#fff', padding: 12, borderRadius: 12 },
  codeSmall: { fontSize: 14, letterSpacing: 2 },
})
