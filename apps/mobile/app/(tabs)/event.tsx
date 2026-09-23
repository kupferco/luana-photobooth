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
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Which device is mid-confirmation, and which is being removed. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null)
  const [pairingBusy, setPairingBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadNote, setDownloadNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId || !id) return
    try {
      const [e, s, list, connected] = await Promise.all([
        api.getEvent(tenantId, id),
        api.eventStats(tenantId, id),
        api.listSessions(tenantId, id),
        api.listDevices(tenantId, id),
      ])
      setEvent(e)
      setStats(s)
      setDevices((previous) =>
        JSON.stringify(previous) === JSON.stringify(connected) ? previous : connected,
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
          <Health
            label={t('dashboard.booth')}
            ok={stats.boothOnline}
            okText={t('dashboard.connected')}
            badText={t('dashboard.notConnected')}
          />
          {/* Ready means ready to print, which 'unknown' is not: a Pi that is
              online with no printer attached was reporting "Ready" and would
              have been believed right up until someone pressed Print. */}
          <Health
            label={t('dashboard.printer')}
            ok={
              stats.agentOnline &&
              (stats.printer?.state === 'idle' || stats.printer?.state === 'printing')
            }
            okText={stats.printer?.state === 'printing' ? t('dashboard.printing') : t('dashboard.ready')}
            badText={stats.printer?.message ?? t('dashboard.notConnected')}
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
          <Label>{t('dashboard.devices')}</Label>

          {devices.length === 0 ? (
            <Body muted>{t('dashboard.noDevices')}</Body>
          ) : (
            devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                confirming={confirming === device.id}
                busy={removing === device.id}
                onAsk={() => setConfirming(device.id)}
                onCancel={() => setConfirming(null)}
                onConfirm={() => void removeDevice(device.id)}
              />
            ))
          )}

          {devices.some((d) => d.kind === 'booth') ? (
            <Body muted>{t('dashboard.devicesHint')}</Body>
          ) : null}

          {/* The code is what a headless Pi authenticates with, so there has
              to be a way to mint one without an SSH session. */}
          {pairing ? (
            <View style={{ gap: 4, paddingTop: 8 }}>
              <Label>{t('dashboard.pairingCode')}</Label>
              <Text
                selectable
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.fontSize['3xl'],
                  fontWeight: '700',
                  letterSpacing: 6,
                  textAlign: 'center',
                }}
              >
                {pairing.code}
              </Text>
              <Body muted>{t('dashboard.pairingCodeHint')}</Body>
            </View>
          ) : null}

          <Button
            label={t('dashboard.connectPrinter')}
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
        </Card>
      ) : null}

      <Card>
        <Label>{t('dashboard.qrTitle')}</Label>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.fontSize['3xl'],
            fontWeight: '700',
            letterSpacing: 6,
            textAlign: 'center',
          }}
        >
          {event.joinCode}
        </Text>
<Body muted>{t('dashboard.qrHint')}</Body>
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
          <Button
            label={t('events.end')}
            variant="secondary"
            onPress={async () => {
              setEvent(await api.setEventStatus(tenantId!, event.id, 'ended'))
              await refresh()
            }}
          />
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
function DeviceRow({
  device,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  device: Device
  confirming: boolean
  busy: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const theme = useTheme()
  const t = useT()

  const isBooth = device.kind === 'booth'
  const name = device.label ?? (isBooth ? t('dashboard.booth') : t('dashboard.printer'))

  /*
   * Two different questions, which were being answered with one dot.
   *
   * Is the device talking to us, and is the thing it drives healthy? A Pi
   * that is online and reporting "no printer attached" is not a failure --
   * it is a Pi doing its job. Showing that in the same red as a device that
   * has vanished told the owner their pairing had broken when it had not.
   */
  /*
   * Two minutes of silence means gone. The booth polls every 2 seconds and
   * the agent heartbeats every 10, so a minute is already conclusive -- but
   * a phone on venue wifi drops a beat now and then, and a dot that flickers
   * red is a dot people learn to ignore.
   */
  const silentFor = device.lastSeenAt ? Date.now() - new Date(device.lastSeenAt).getTime() : null
  const silent = device.pairingPending || silentFor === null || silentFor > 2 * 60_000

  const printer = device.printerState
  const tone: 'good' | 'warn' | 'bad' = silent
    ? 'bad'
    : printer?.state === 'stopped'
      ? 'bad'
      : printer?.state === 'unknown'
        ? 'warn'
        : 'good'

  // The printer's own words win over "active just now" whenever it has
  // something to say -- "Out of paper" is the more useful sentence.
  const detail = device.pairingPending
    ? t('dashboard.waitingToPair')
    : silent
      ? lastSeen(t, device.lastSeenAt)
      : (printer?.message ?? lastSeen(t, device.lastSeenAt))

  if (confirming) {
    return (
      <View style={{ gap: 8, paddingVertical: 8 }}>
        <Text style={{ color: theme.color.text.primary, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
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
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor:
            tone === 'bad'
              ? theme.color.status.bad
              : tone === 'warn'
                ? theme.color.status.poor
                : theme.color.status.good,
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ color: theme.color.text.primary, fontSize: theme.fontSize.sm, fontWeight: '600' }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={{
            color:
              tone === 'bad'
                ? theme.color.status.bad
                : tone === 'warn'
                  ? theme.color.status.poor
                  : theme.color.text.secondary,
            fontSize: theme.fontSize.xs,
          }}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
      <Pressable onPress={onAsk} hitSlop={8}>
        <Text style={{ color: theme.color.status.bad, fontSize: theme.fontSize.sm, fontWeight: '600' }}>
          {t(isBooth ? 'dashboard.stopBooth' : 'dashboard.unpairPrinter')}
        </Text>
      </Pressable>
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

function Health({
  label,
  ok,
  okText,
  badText,
}: {
  label: string
  ok: boolean
  okText: string
  badText: string
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
      <Text style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.sm, width: 70 }}>
        {label}
      </Text>
      <Text
        style={{
          color: ok ? theme.color.text.primary : theme.color.status.bad,
          fontSize: theme.fontSize.sm,
          fontWeight: ok ? '400' : '600',
        }}
      >
        {ok ? okText : badText}
      </Text>
    </Row>
  )
}
