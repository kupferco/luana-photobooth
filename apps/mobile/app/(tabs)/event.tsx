import { daysRemaining } from '@photobooth/shared'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  api,
  type Device,
  type Event,
  type EventLiveStats,
  type GallerySession,
} from '../../src/api'
import { useLocale, useT } from '../../src/locale'
import { useActiveEvent } from '../../src/event-context'
import { useSession } from '../../src/session'
import { copy } from '../../src/clipboard'
import { saveZip } from '../../src/download'
import { shareLink } from '../../src/share'
import { useTheme } from '../../src/theme'
import {
  Body,
  Button,
  Card,
  Heading,
  Label,
  Notice,
  Row,
  Screen,
  Spinner,
} from '../../src/ui'
import { SessionCard } from '../../src/ui/SessionCard'

/**
 * Where a guest link points. Baked in per environment at build time, exactly
 * as the booth's QR code is, so a staging dashboard cannot hand out links to
 * production.
 */
const GUEST_BASE = process.env.EXPO_PUBLIC_GUEST_URL ?? 'http://localhost:5173'
const guestUrl = (joinCode: string) => `${GUEST_BASE}/${joinCode}`

/**
 * The owner's view during a party: is it working, what has it made, and the
 * two things they will actually reach for -- reprint, and download everything
 * before it expires.
 */
export default function EventTab() {
  const { active, loading: loadingEvents, refresh } = useActiveEvent()
  const id = active?.id
  const { tenantId } = useSession()
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  const [event, setEvent] = useState<Event | null>(null)
  const [stats, setStats] = useState<EventLiveStats | null>(null)
  const [sessions, setSessions] = useState<GallerySession[] | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [available, setAvailable] = useState<Device[]>([])
  const [moving, setMoving] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Which device is mid-confirmation, and which is being removed. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null)
  const [pairingBusy, setPairingBusy] = useState(false)
  /**
   * Setup is collapsed once there is anything set up.
   *
   * Pairing a printer and choosing a booth phone happen once, before the
   * party. Leaving that open for the next six hours repeats information that
   * has stopped being the point -- during an event the only things that
   * matter are the two dots above it.
   *
   * Open by default when nothing is paired, because then it *is* the point.
   */
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  const [endingConfirm, setEndingConfirm] = useState(false)
  const [ending, setEnding] = useState(false)
  const [sharedLink, setSharedLink] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadNote, setDownloadNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId || !id) return
    try {
      const [e, s, list, connected, all] = await Promise.all([
        api.getEvent(tenantId, id),
        api.eventStats(tenantId, id),
        api.listSessions(tenantId, id),
        api.listDevices(tenantId, id),
        api.listAllDevices(tenantId),
      ])
      setEvent(e)
      setStats(s)
      setDevices((previous) =>
        JSON.stringify(previous) === JSON.stringify(connected) ? previous : connected,
      )

      /*
       * Printers paired to this account but not attached to any event.
       *
       * Ending a party releases its printers back here, so this is where a
       * printer lives between events. Offering "a printer from another
       * event" was the wrong idea -- it read as taking something from a
       * party that might still be running, when in fact the hardware was
       * simply idle.
       */
      setAvailable(
        all.filter((d) => d.kind === 'agent' && d.paired && d.eventId === null),
      )

      // A code that has been spent, replaced or expired is worse than
      // useless on screen: it invites someone to type it and be told no.
      if (!connected.some((d) => d.pairingPending)) setPairing(null)
      setSessions((previous) =>
        previous && JSON.stringify(previous) === JSON.stringify(list)
          ? previous
          : list,
      )
      setLoadError(null)
    } catch (err) {
      // Anything unhandled here left the screen on a permanent spinner with
      // no clue why -- which is how a missing endpoint looked like a hang.
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [tenantId, id])

  /**
   * Stops a booth, or unpairs a printer.
   *
   * The row goes at once rather than on the next poll: the owner pressed the
   * button, and a list that still shows the booth for five seconds reads as
   * a button that did nothing.
   */
  const removeDevice = useCallback(
    async (deviceId: string) => {
      if (!tenantId) return
      setRemoving(deviceId)
      try {
        await api.removeDevice(tenantId, deviceId)
        setConfirming(null)
        setDevices((current) => current.filter((d) => d.id !== deviceId))
        await load()
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        setRemoving(null)
      }
    },
    [tenantId, load],
  )

  useEffect(() => {
    void load()
  }, [load])

  // While a party is live the dashboard refreshes itself; an owner watching
  // the room should not have to pull to refresh to notice the printer died.
  useEffect(() => {
    if (event?.status !== 'live') return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [event?.status, load])

  // The tab is contextual, so it needs something to say when nothing is
  // selected -- first run, or every event deleted.
  if (!loadingEvents && !active) {
    return (
      <Screen>
        <Card>
          <Body>{t('event.none')}</Body>
          <Body muted>{t('event.noneHint')}</Body>
        </Card>
        <Button label={t('events.new')} onPress={() => router.push('/events/new')} />
      </Screen>
    )
  }

  if (loadError) {
    return (
      <Screen>
        <Notice tone="bad">{loadError}</Notice>
        <Button label={t('common.retry')} onPress={() => void load()} />
      </Screen>
    )
  }

  if (!event || !stats || !sessions) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    )
  }

  const ready = sessions.filter((s) => s.status === 'ready')
  const open = setupOpen ?? devices.length === 0
  const expiring = daysRemaining(new Date(event.retentionUntil))

  return (
    <Screen>
      <Heading>{event.name}</Heading>

      {/* Anything wrong with the hardware comes first: during a party this is
          the only part of the screen that matters. */}
      {event.status === 'live' ? (
        <Card>
          <Label>{t('dashboard.rightNow')}</Label>
          <Row>
            <Stat label={t('dashboard.inQueue')} value={String(stats.queueDepth)} />
            <Stat label={t('dashboard.photosTaken')} value={String(stats.sessionsToday)} />
          </Row>
          <Health label={t('dashboard.booth')} ok={stats.boothOnline} />
          {/* Ready means ready to print, which 'unknown' is not: a Pi that is
              online with no printer attached was reporting "Ready" and would
              have been believed right up until someone pressed Print. */}
          <Health
            label={t('dashboard.printer')}
            ok={
              stats.agentOnline &&
              (stats.printer?.state === 'idle' || stats.printer?.state === 'printing')
            }
            detail={
              stats.printer?.state === 'printing'
                ? t('dashboard.printing')
                : stats.agentOnline
                  ? (stats.printer?.message ?? null)
                  : null
            }
          />
        </Card>
      ) : null}

      {event.status === 'ended' ? (
        <Card>
          <Notice tone={expiring <= 3 ? 'bad' : 'warn'}>
            {expiring === 0
              ? t('retention.deletedToday')
              : t('retention.ownerCountdown', {
                  date: new Date(event.retentionUntil).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })}
          </Notice>
          <Button
            label={downloading ? t('dashboard.downloading') : t('dashboard.downloadAll', { count: ready.length })}
            busy={downloading}
            disabled={ready.length === 0}
            onPress={async () => {
              setDownloading(true)
              setDownloadNote(null)
              try {
                const blob = await api.downloadAll(tenantId!, event.id)
                const outcome = await saveZip(blob, `${zipName(event.name)}.zip`)
                if (outcome === 'unsupported') {
                  setDownloadNote(t('dashboard.downloadOnWeb'))
                }
              } catch (err) {
                setDownloadNote(
                  err instanceof Error ? err.message : t('dashboard.downloadFailed'),
                )
              } finally {
                setDownloading(false)
              }
            }}
          />
          {ready.length === 0 ? <Body muted>{t('dashboard.downloadEmpty')}</Body> : null}
          {downloadNote ? <Notice tone="warn">{downloadNote}</Notice> : null}
        </Card>
      ) : null}

      {/* Hardware the owner can act on, which is different from the health
          readout above: that says whether it is working, this says whose
          phone it is and lets them have it back. */}
      {event.status !== 'ended' ? (
        <Card>
          <Pressable
            onPress={() => setSetupOpen((open) => !(open ?? devices.length === 0))}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            hitSlop={8}
          >
            <Label>{t('dashboard.setup')}</Label>
            <Text style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.sm }}>
              {open ? t('dashboard.hideSetup') : t('dashboard.showSetup')}
            </Text>
          </Pressable>

          {!open ? null : devices.length === 0 ? (
            <Body muted>{t('dashboard.noDevices')}</Body>
          ) : (
            devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                index={devices.filter((d) => d.kind === device.kind).indexOf(device)}
                confirming={confirming === device.id}
                busy={removing === device.id}
                onAsk={() => setConfirming(device.id)}
                onCancel={() => setConfirming(null)}
                onConfirm={() => void removeDevice(device.id)}
              />
            ))
          )}

          {open && devices.some((d) => d.kind === 'booth') ? (
            <Body muted>{t('dashboard.devicesHint')}</Body>
          ) : null}

          {/* The code is what a headless Pi authenticates with, so there has
              to be a way to mint one without an SSH session. */}
          {/*
            * A code on its own is not instructions.
            *
            * This showed six characters and "enter this on the printer setup
            * page", which assumes you know there is a setup page, that it
            * lives on a wifi network the printer is broadcasting, and that
            * you have to leave your own network to reach it. Nobody knows
            * that the first time. The steps are the feature; the code is one
            * line of it.
            */}
          {open && pairing ? (
            <View style={{ gap: 10, paddingTop: 12 }}>
              <Label>{t('dashboard.pairingCode')}</Label>

              {/*
                * With the steps, not before them.
                *
                * It sat above the button and vanished the moment a code
                * existed -- gone exactly when it mattered. Step 2 takes you
                * off your own network, and the setup page then asks for the
                * venue's wifi password; going back to look it up closes the
                * page. We cannot supply it: neither iOS nor Android exposes
                * saved wifi passwords to an app, by design.
                */}
              <Notice tone="warn">{t('dashboard.wifiWarning')}</Notice>

              {/* Tapping copies it: the next thing anyone does with this code
                  is paste it into a page on another network, and retyping six
                  characters after switching wifi is where mistakes happen. */}
              <Pressable
                onPress={async () => {
                  if (await copy(pairing.code)) {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1800)
                  }
                }}
              >
                <Text
                  selectable
                  style={{
                    color: theme.color.text.primary,
                    fontSize: theme.fontSize['2xl'],
                    fontWeight: '700',
                    letterSpacing: 5,
                    textAlign: 'center',
                  }}
                >
                  {pairing.code}
                </Text>
                <Text
                  style={{
                    color: copied ? theme.color.status.good : theme.color.text.secondary,
                    fontSize: theme.fontSize.xs,
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                >
                  {copied ? t('dashboard.codeCopied') : t('dashboard.tapToCopy')}
                </Text>
              </Pressable>

              <View style={{ gap: 8 }}>
                {[
                  t('dashboard.pairStep1'),
                  t('dashboard.pairStep2'),
                  t('dashboard.pairStep3'),
                  t('dashboard.pairStep4'),
                ].map((step, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <Text
                      style={{
                        color: theme.color.text.secondary,
                        fontSize: theme.fontSize.sm,
                        fontWeight: '700',
                        width: 16,
                      }}
                    >
                      {i + 1}
                    </Text>
                    <Text
                      style={{
                        color: theme.color.text.secondary,
                        fontSize: theme.fontSize.sm,
                        flex: 1,
                        lineHeight: 20,
                      }}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>

              <Body muted>{t('dashboard.pairingCodeHint')}</Body>
            </View>
          ) : null}

          {open && available.length > 0 ? (
            <View style={{ gap: 6, paddingTop: 8 }}>
              <Label>{t('dashboard.availablePrinters')}</Label>
              <Body muted>{t('dashboard.availablePrintersHint')}</Body>
              {available.map((device) => (
                <View
                  key={device.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: theme.color.text.primary,
                        fontSize: theme.fontSize.sm,
                        fontWeight: '600',
                      }}
                      numberOfLines={1}
                    >
                      {device.label ?? t('dashboard.printer')}
                    </Text>
                    <Text
                      style={{
                        color: theme.color.text.secondary,
                        fontSize: theme.fontSize.xs,
                      }}
                      numberOfLines={1}
                    >
                      {lastSeen(t, device.lastSeenAt)}
                    </Text>
                  </View>
                  <View style={{ width: 96 }}>
                    <Button
                      label={t('dashboard.addToEvent')}
                      variant="secondary"
                      busy={moving === device.id}
                      onPress={async () => {
                        setMoving(device.id)
                        try {
                          await api.moveDevice(tenantId!, device.id, event.id)
                          await load()
                        } catch (err) {
                          setLoadError(err instanceof Error ? err.message : String(err))
                        } finally {
                          setMoving(null)
                        }
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {open ? (
          <Button
            label={t('dashboard.setUpNewPrinter')}
            variant="secondary"
            busy={pairingBusy}
            onPress={async () => {
              setPairingBusy(true)
              try {
                setPairing(await api.createPairingCode(tenantId!, event.id))
                await load()
              } catch (err) {
                setLoadError(err instanceof Error ? err.message : String(err))
              } finally {
                setPairingBusy(false)
              }
            }}
          />
          ) : null}
          {/* The hotspot only appears on a printer that has never been set
              up. One already on the wifi has nothing to broadcast and is
              added from the list above, so saying this stops people hunting
              for a network that will never appear. */}
          {open && !pairing ? <Body muted>{t('dashboard.newPrinterOnly')}</Body> : null}
        </Card>
      ) : null}

      <Card>
        {/*
          * The link, not the code.
          *
          * This used to show the join code in 34pt with nothing to do with
          * it -- no link, no QR, despite being labelled "Guest QR code". A
          * code alone asks someone to write six characters down and then
          * work out where to type them, which is a puzzle, not an
          * invitation. What people actually want is something they can send.
          *
          * The code stays, small, because it is the fallback when a camera
          * will not scan and the one thing that can be read aloud across a
          * room.
          */}
        <Label>{t('dashboard.guestLink')}</Label>
        {/* The guest page looks the event up by join code and only finds live
            ones, so sending this to anyone before the party starts hands them
            a link that says the event does not exist. */}
        {event.status === 'draft' ? (
          <Notice tone="warn">{t('dashboard.guestLinkNotYet')}</Notice>
        ) : null}
        <Text
          selectable
          style={{
            color: theme.color.text.primary,
            fontSize: theme.fontSize.md,
            fontWeight: '600',
          }}
          numberOfLines={1}
        >
          {guestUrl(event.joinCode)}
        </Text>
        <Body muted>{t('dashboard.guestLinkHint')}</Body>
        <Button
          label={sharedLink ? t('dashboard.linkShared') : t('dashboard.share')}
          variant="secondary"
          disabled={event.status === 'draft'}
          onPress={async () => {
            const outcome = await shareLink(
              guestUrl(event.joinCode),
              event.name,
              t('dashboard.guestLinkHint'),
            )
            if (outcome !== 'dismissed') {
              setSharedLink(true)
              setTimeout(() => setSharedLink(false), 2000)
            }
          }}
        />
        {/*
          * The join code is deliberately not here.
          *
          * It is shown on the booth screen, beside the QR, to the people who
          * might need to type it. On the owner's dashboard it answered no
          * question anyone was asking -- there was nowhere for *them* to use
          * it -- and a six-character code with no destination reads as a
          * puzzle. The link is the thing to hand out.
          */}
      </Card>

      {event.status === 'draft' ? (
        <Button
          label={t('events.start')}
          onPress={async () => {
            setEvent(await api.setEventStatus(tenantId!, event.id, 'live'))
            await refresh()
          }}
        />
      ) : null}

      {event.status === 'live' ? (
        <>
          <Button label={t('events.useAsBooth')} onPress={() => router.push('/booth')} />
          {/* Ending is irreversible and sits directly under a button people
              press all evening. One tap should not close a party. */}
          {endingConfirm ? (
            <>
              <Notice tone="warn">{t('events.endConfirm')}</Notice>
              <Button
                label={t('events.end')}
                variant="danger"
                busy={ending}
                onPress={async () => {
                  setEnding(true)
                  try {
                    setEvent(await api.setEventStatus(tenantId!, event.id, 'ended'))
                    await refresh()
                  } finally {
                    setEnding(false)
                    setEndingConfirm(false)
                  }
                }}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setEndingConfirm(false)}
              />
            </>
          ) : (
            <Button
              label={t('events.end')}
              variant="secondary"
              onPress={() => setEndingConfirm(true)}
            />
          )}
        </>
      ) : null}

      <Label>{t.plural('common.photos', ready.length)}</Label>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onPrint={async () => {
            await api.printMontage(tenantId!, event.id, session.id)
            await load()
          }}
          onEmail={async (to) => {
            await api.emailMontage(tenantId!, event.id, session.id, to)
            await load()
          }}
          onShare={async () => {
            const { url, title } = await api.shareLink(tenantId!, event.id, session.id)
            return shareLink(url, title, t('dashboard.shareText', { name: event.name }))
          }}
        />
      ))}
    </Screen>
  )
}

/**
 * One booth or printer, with the button that removes it.
 *
 * The confirmation is inline rather than an Alert because this screen runs on
 * the web too, where React Native's Alert does nothing at all -- an ignored
 * tap on "stop the booth" is the worst possible way to find that out.
 */
/**
 * One booth or printer, and the one thing you can do to it.
 *
 * Laid out on a single baseline: dot, name and state in a column that fills
 * the row, action on the right. Previously the name, the state and a bare
 * red "Unpair printer" floated at whatever width their text happened to be,
 * which is what made a list of two devices look untidy.
 *
 * Colour means what it says. Red is for something wrong -- a device that has
 * stopped answering, a printer that has stopped. Amber is for waiting, which
 * is what a pairing code is doing: nothing is broken, nobody need act. And
 * the action is a plain secondary button, because unpairing a working
 * printer is a normal thing to do, not a destructive one. It is red only
 * once you have asked for it and are being asked to confirm.
 */
function DeviceRow({
  device,
  index,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  device: Device
  /** Position among devices of the same kind, for the display number. */
  index: number
  confirming: boolean
  busy: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const theme = useTheme()
  const t = useT()

  const isBooth = device.kind === 'booth'
  /*
   * Numbered for display, not just at creation.
   *
   * Devices made before numbering existed are still called "Booth" and
   * "Printer", and two rows with the same name make the stop button a coin
   * flip. A name someone actually chose is left alone; the generic defaults
   * are replaced with a position, which is what the owner is looking for
   * when deciding which of two phones to stop.
   */
  const generic = !device.label || device.label === 'Booth' || device.label === 'Printer'
  const name = generic
    ? `${isBooth ? t('dashboard.booth') : t('dashboard.printer')} ${index + 1}`
    : device.label

  const silentFor = device.lastSeenAt ? Date.now() - new Date(device.lastSeenAt).getTime() : null
  const printer = device.printerState

  // Three states, not two. "Waiting to be paired" is not a fault.
  const tone: 'good' | 'warn' | 'bad' = device.pairingPending
    ? 'warn'
    : silentFor === null || silentFor > 2 * 60_000
      ? 'bad'
      : printer?.state === 'stopped'
        ? 'bad'
        : printer?.state === 'unknown'
          ? 'warn'
          : 'good'

  const detail = device.pairingPending
    ? t('dashboard.waitingToPair')
    : tone === 'bad' && silentFor !== null && silentFor > 2 * 60_000
      ? lastSeen(t, device.lastSeenAt)
      : (printer?.message ?? lastSeen(t, device.lastSeenAt))

  const dotColour =
    tone === 'bad'
      ? theme.color.status.bad
      : tone === 'warn'
        ? theme.color.status.poor
        : theme.color.status.good

  if (confirming) {
    return (
      <View style={{ gap: 8, paddingVertical: 10 }}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.fontSize.sm,
            fontWeight: '600',
          }}
        >
          {t(isBooth ? 'dashboard.stopBoothConfirm' : 'dashboard.unpairPrinterConfirm')}
        </Text>
        <Body muted>
          {t(isBooth ? 'dashboard.stopBoothHint' : 'dashboard.unpairPrinterHint')}
        </Body>
        <Button
          label={t(isBooth ? 'dashboard.stopBooth' : 'dashboard.unpairPrinter')}
          variant="danger"
          busy={busy}
          onPress={onConfirm}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColour }} />

      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.fontSize.sm,
            fontWeight: '600',
          }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={{
            color: tone === 'bad' ? theme.color.status.bad : theme.color.text.secondary,
            fontSize: theme.fontSize.xs,
          }}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>

      {/* Fixed width so two rows line up, however long the names are. */}
      <View style={{ width: 96 }}>
        <Button
          label={t(isBooth ? 'dashboard.stopShort' : 'dashboard.unpairShort')}
          variant="secondary"
          onPress={onAsk}
        />
      </View>
    </View>
  )
}

/**
 * How long ago a device last called in.
 *
 * Rounded and relative, because the exact timestamp answers a question
 * nobody asks: during a party the only thing worth knowing is whether it is
 * still there.
 */
function lastSeen(t: ReturnType<typeof useT>, iso: string | null): string {
  if (!iso) return t('dashboard.neverSeen')

  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return t('dashboard.lastSeenJustNow')
  if (minutes < 60) return t('dashboard.lastSeenMinutes', { count: minutes })
  return t('dashboard.lastSeenHours', { count: Math.floor(minutes / 60) })
}

/**
 * The event name, made safe for a filename.
 *
 * The server sends the same name in Content-Disposition, but a web download
 * started from an object URL takes its name from the anchor instead, so the
 * sanitising has to happen on both sides.
 */
function zipName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+/, '')
      .slice(0, 60) || 'photos'
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: theme.color.text.primary, fontSize: theme.fontSize['2xl'], fontWeight: '700' }}>
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  )
}

/**
 * One piece of hardware, at a glance.
 *
 * The dot carries the state and the label says what it is. No "Connected"
 * beside a green dot and no "Not connected" beside a red one: that is the
 * same fact stated twice, and a screen of red words reads as alarm when most
 * of it is only information.
 *
 * `detail` is for what a dot cannot say. "Out of paper" earns the room;
 * "Ready" does not.
 */
function Health({
  label,
  ok,
  detail,
}: {
  label: string
  ok: boolean
  detail?: string | null
}) {
  const theme = useTheme()
  return (
    <Row>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: ok ? theme.color.status.good : theme.color.status.bad,
        }}
      />
      <Text style={{ color: theme.color.text.primary, fontSize: theme.fontSize.sm }}>
        {label}
      </Text>
      {detail ? (
        <Text
          style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.sm, flex: 1 }}
          numberOfLines={1}
        >
          {detail}
        </Text>
      ) : null}
    </Row>
  )
}
