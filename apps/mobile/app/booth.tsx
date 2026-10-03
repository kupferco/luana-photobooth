import { CLASSIC_3UP, retentionNotice, type Template } from '@photobooth/shared'
import { useKeepAwake } from 'expo-keep-awake'
import QRCode from 'react-native-qrcode-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import {
  booth,
  forgetPairing,
  isPaired,
  savePairing,
  uploadShot,
  type BoothPoll,
} from '../src/booth/client'
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
  const insets = useSafeAreaInsets()
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

  /**
   * Deleting asks twice, on the button itself.
   *
   * The whole review screen is tap-anywhere-to-continue, so a single-tap
   * delete sitting in the middle of it would eventually catch someone who
   * meant to dismiss. A dialog would be the usual answer and is the wrong
   * one here: there is a queue behind this person, and the booth is a phone
   * on a tripod nobody wants to stand and read.
   */
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'deleting'>(
    'idle',
  )
  /**
   * Set when the owner stopped this booth from their phone.
   *
   * Distinguished from "never set up" because the two need different words:
   * a booth that was switched off deliberately should say so, or whoever is
   * standing at the tripod will think it broke.
   */
  const [stopped, setStopped] = useState(false)
  /** Set when the stored pairing turned out to belong to another event. */
  const [wrongEvent, setWrongEvent] = useState<string | null>(null)

  // A run in progress must not be interrupted by the poll loop starting
  // another, and the tap handler must not start a second sequence.
  const running = useRef(false)
  /**
   * Bumped whenever a session is finished with, so the tail of a run that
   * has been superseded knows not to tidy up after a newer one.
   */
  const generation = useRef(0)

  const template: Template = poll?.template ?? CLASSIC_3UP
  const landscape = width > height

  /*
   * Whether to draw a way out at all.
   *
   * Defaults to allowed while the first poll is in flight, so a booth that
   * cannot reach the server is not also a phone nobody can get out of. The
   * failure to protect against is being locked in by a network error, not
   * a guest who happens to try the corner during the two seconds before
   * the first poll lands.
   */
  const exitAllowed = poll?.event.boothExitAllowed ?? true

  /**
   * How wide the montage can be and still leave room for what sits under it.
   *
   * `reserved` is the height of everything below it plus the gaps. The
   * montage is 3:2, so the height left over caps the width at 1.5x it.
   *
   * The floor is low on purpose. A booth is a phone in landscape on a
   * tripod, so the short side is around 390pt, and the review screen is the
   * tallest thing this app draws: get the reserve wrong and the montage is
   * clipped by the top of the window rather than shrunk, because the column
   * is centred rather than scrolled.
   */
  const montageWidth = (reserved: number) =>
    Math.max(
      // Low enough that the shortest screen a booth plausibly runs on -- an
      // SE in landscape, 375pt -- shrinks rather than clips.
      120,
      Math.min(width * 0.55, (height - reserved) * (3 / 2), 520),
    )

  /*
   * What the review screen puts under the montage, added up.
   *
   * Derived rather than one tuned number, because it changed the moment a
   * second button was added: the reserve stayed at the figure that fitted
   * one, and the montage started overflowing the top of the screen. Counting
   * the pieces means the next thing added to this screen is accounted for by
   * changing the list rather than by noticing the bug.
   *
   * Approximate by design -- it decides how much to shrink a picture, and a
   * few points either way is invisible.
   */
  const GAP = 10
  const BUTTON = 52 // Button's minHeight
  const doneReserved =
    12 * 2 + // the column's own vertical padding
    30 + GAP + // "Here it is"
    (finished?.canPrint ? (BUTTON + GAP) * 2 : 0) + // print, then delete
    (lastCode ? 52 + GAP : 0) + // the label and the code under it
    20 + // "Tap to continue"
    16 // the tilt, which makes the card taller than it measures

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
    setWrongEvent(null)
    try {
      /*
       * Drop any previous pairing first.
       *
       * This phone may still hold a token from a different event -- last
       * week's party, or one that has since ended. Claiming on top of that
       * left the old token in place, so the booth polled the old event and
       * announced that it had finished, while the owner was looking at a
       * brand new one. Tapping "use this phone as the booth" means this
       * event, now.
       */
      await forgetPairing()
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

        /*
         * The token can outlive the event it was issued for.
         *
         * A phone paired to last week's party still authenticates perfectly;
         * it is simply attached to the wrong thing. Without this the booth
         * showed "this event has ended" while the owner had a live event
         * open in the same app, with no hint that the two were different
         * events and no way to act on it.
         */
        if (active && result.event.id !== active.id) {
          running.current = false
          await forgetPairing()
          setPaired(false)
          setPoll(null)
          setWrongEvent(result.event.name)
          setPhase({ kind: 'setup' })
          return
        }

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

        /*
         * Clear the result after a minute -- unless somebody got there
         * first.
         *
         * Without the check this tail fires regardless, so a guest who
         * deleted their photo and started another one would have that
         * second session wiped from under them a minute later, by a timer
         * belonging to a session that no longer exists.
         */
        const mine = generation.current
        await wait(RESULT_TIMEOUT_MS)
        if (generation.current === mine) reset()
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
    /*
     * The booth is free again, and that has to be said out loud.
     *
     * `running` covers the whole sequence including the minute the result
     * stays on screen, which is right -- it is what stops a queued guest
     * starting a countdown over somebody else's photo. But it was only
     * cleared when that minute elapsed, and leaving early does not wait for
     * it. Delete your photo, or tap to continue, and the booth looked idle
     * while every way of starting another one was still refused: the tap
     * returned at the first line, and the poll skipped the next guest.
     *
     * It came back by itself once the timer finished, which is why it read
     * as the camera being stuck rather than as a booth ignoring people.
     */
    generation.current += 1
    running.current = false

    setShots((previous) => {
      previous.forEach((s) => {
        if (s.previewUri.startsWith('blob:')) URL.revokeObjectURL(s.previewUri)
      })
      return []
    })
    setFinished(null)
    setPrintState('idle')
    setDeleteState('idle')
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

  const discardFinished = useCallback(async () => {
    if (!finished || deleteState === 'deleting') return

    if (deleteState === 'idle') {
      setDeleteState('confirm')
      return
    }

    setDeleteState('deleting')
    try {
      await booth.discard(finished.id)
    } catch {
      // Same reasoning as a failed print: nobody here can act on a dialog.
      // The photo stays, and the owner can delete it from the gallery.
    }
    // Either way the booth goes back to waiting. Leaving someone's photo on
    // screen after they asked for it to go is the worse failure, and on the
    // happy path it saves them a second tap to dismiss.
    reset()
  }, [finished, deleteState, reset])

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

        {wrongEvent ? (
          <Notice tone="warn">
            {t('booth.wrongEvent', { event: wrongEvent })}
          </Notice>
        ) : null}

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
      /*
       * Padded down past the status bar by hand.
       *
       * This route hides the header so the camera can have the whole
       * screen, and nothing else was putting the inset back -- so upright,
       * where there is no camera and the page starts at the very top, the
       * heading sat underneath the clock. Landscape never showed it because
       * there is nothing but camera up there.
       */
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <Screen>
          <Heading>{t('booth.rotate')}</Heading>
          <Body muted>{t('booth.rotateHint')}</Body>
          {/* Same trap as the pairing screen: without this, an error raised
              while the phone is upright stays invisible until someone
              happens to rotate it. */}
          {phase.kind === 'error' ? <Notice tone="bad">{phase.message}</Notice> : null}

          {/*
            * The only way out, now that the corner handle is gone.
            *
            * That handle was a 1.5s long press on an invisible 72pt square,
            * which on the web is also how you start selecting text -- so it
            * mostly highlighted the screen instead of leaving. Upright is a
            * better door anyway: the booth is on a tripod during a party, so
            * turning it over is already a deliberate act by somebody holding
            * the phone, and nothing a guest reaches by accident.
            */}
          {exitAllowed ? (
            <Button
              label={t('booth.exit')}
              variant="secondary"
              onPress={() => router.back()}
            />
          ) : null}
        </Screen>
      </View>
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
            backgroundUri={poll?.backgroundUrl ?? null}
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
              backgroundUri={poll?.backgroundUrl ?? null}
              width={montageWidth(doneReserved)}
            />
          </View>

          <Text style={[styles.caption, { color: '#fff' }]}>{t('guest.ready')}</Text>

          {/* Only for a session started here. A guest who triggered from
              their own phone prints from there, and printing it at the booth
              as well would produce copies nobody asked for. */}
          {/* `canPrint` is the server saying this session started here, so it
              gates deleting too: the next person at the booth must not be
              able to throw away the photo of whoever was before them. */}
          {finished?.canPrint ? (
            <View style={{ width: '60%', maxWidth: 360, gap: 10 }}>
              <Button
                label={
                  printState === 'sent' ? t('booth.printSent') : t('dashboard.print')
                }
                busy={printState === 'sending'}
                disabled={printState === 'sent'}
                onPress={() => void printFinished()}
              />

              {/* No retake here -- tapping again is a retake, and a second
                  word for it would only be something else to read. No share
                  either: typing an address on a tripod holds the queue. */}
              <Button
                label={
                  deleteState === 'confirm'
                    ? t('booth.deleteConfirm')
                    : t('booth.delete')
                }
                variant={deleteState === 'confirm' ? 'danger' : 'secondary'}
                busy={deleteState === 'deleting'}
                onPress={() => void discardFinished()}
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
  caption: { fontSize: 20, fontWeight: weight('600') },
  retention: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  joinBlock: { alignItems: 'center', gap: 10 },
  qrPlate: { backgroundColor: '#fff', padding: 12, borderRadius: 12 },
  codeSmall: { fontSize: 14, letterSpacing: 2 },
})
