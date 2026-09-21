import { daysRemaining } from '@photobooth/shared'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import {
  api,
  type Event,
  type EventLiveStats,
  type GallerySession,
} from '../../src/api'
import { useLocale, useT } from '../../src/locale'
import { useActiveEvent } from '../../src/event-context'
import { useSession } from '../../src/session'
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
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId || !id) return
    try {
      const [e, s, list] = await Promise.all([
        api.getEvent(tenantId, id),
        api.eventStats(tenantId, id),
        api.listSessions(tenantId, id),
      ])
      setEvent(e)
      setStats(s)
      setSessions(list)
      setLoadError(null)
    } catch (err) {
      // Anything unhandled here left the screen on a permanent spinner with
      // no clue why -- which is how a missing endpoint looked like a hang.
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [tenantId, id])

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
          <Health
            label={t('dashboard.printer')}
            ok={stats.agentOnline && stats.printer?.state !== 'stopped'}
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
            label={t('dashboard.downloadAll', { count: ready.length })}
            onPress={() => {
              /* wired with the zip endpoint */
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
        <SessionRow
          key={session.id}
          session={session}
          onReprint={async () => {
            try {
              await api.reprint(tenantId!, session.id)
              await load()
            } catch (err) {
              setLoadError(err instanceof Error ? err.message : String(err))
            }
          }}
        />
      ))}
    </Screen>
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

function SessionRow({
  session,
  onReprint,
}: {
  session: GallerySession
  onReprint: () => void
}) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  return (
    <Card>
      <Row>
        {session.montageUrl ? (
          <Image
            source={{ uri: session.montageUrl }}
            style={{
              width: 90,
              height: 60,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.surface.sunken,
            }}
          />
        ) : (
          <View
            style={{
              width: 90,
              height: 60,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.surface.sunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.color.text.disabled, fontSize: theme.fontSize.xs }}>
              {session.status === 'failed' ? 'failed' : session.status}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text.primary, fontSize: theme.fontSize.sm, letterSpacing: 1 }}>
            {session.code}
          </Text>
          <Text style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.xs }}>
            {new Date(session.createdAt).toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {session.printCount > 0 ? ` · printed ${session.printCount}×` : ''}
            {session.emailedTo ? ' · emailed' : ''}
          </Text>
        </View>

        {session.status === 'ready' ? (
          <Pressable onPress={onReprint}>
            <Text
              style={{
                color: theme.color.action.bg,
                fontSize: theme.fontSize.sm,
                fontWeight: '600',
              }}
            >
              {t('dashboard.reprint')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
    </Card>
  )
}
