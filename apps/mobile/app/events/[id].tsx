import { daysRemaining, ownerRetentionNotice } from '@photobooth/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import {
  api,
  type Event,
  type EventLiveStats,
  type GallerySession,
} from '../../src/api'
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
export default function EventDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { tenantId } = useSession()
  const t = useTheme()

  const [event, setEvent] = useState<Event | null>(null)
  const [stats, setStats] = useState<EventLiveStats | null>(null)
  const [sessions, setSessions] = useState<GallerySession[] | null>(null)

  const load = useCallback(async () => {
    if (!tenantId || !id) return
    const [e, s, list] = await Promise.all([
      api.getEvent(tenantId, id),
      api.eventStats(tenantId, id),
      api.listSessions(tenantId, id),
    ])
    setEvent(e)
    setStats(s)
    setSessions(list)
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
          <Label>Right now</Label>
          <Row>
            <Stat label="In the queue" value={String(stats.queueDepth)} />
            <Stat label="Photos taken" value={String(stats.sessionsToday)} />
          </Row>
          <Health label="Booth" ok={stats.boothOnline} okText="Connected" badText="Not connected" />
          <Health
            label="Printer"
            ok={stats.agentOnline && stats.printer?.state !== 'stopped'}
            okText={stats.printer?.state === 'printing' ? 'Printing' : 'Ready'}
            badText={stats.printer?.message ?? 'Not connected'}
          />
        </Card>
      ) : null}

      {event.status === 'ended' ? (
        <Card>
          <Notice tone={expiring <= 3 ? 'bad' : 'warn'}>
            {ownerRetentionNotice(new Date(event.retentionUntil))}
          </Notice>
          <Button
            label={`Download all ${ready.length} photos`}
            onPress={() => {
              /* wired with the zip endpoint */
            }}
          />
        </Card>
      ) : null}

      <Card>
        <Label>Guest QR code</Label>
        <Text
          style={{
            color: t.color.text.primary,
            fontSize: t.fontSize['3xl'],
            fontWeight: '700',
            letterSpacing: 6,
            textAlign: 'center',
          }}
        >
          {event.joinCode}
        </Text>
        <Body muted>
          Guests scan this to start the booth from their own phone. They can
          also just tap the booth screen.
        </Body>
      </Card>

      {event.status === 'draft' ? (
        <Button
          label="Start the party"
          onPress={async () => {
            setEvent(await api.setEventStatus(tenantId!, event.id, 'live'))
          }}
        />
      ) : null}

      {event.status === 'live' ? (
        <>
          <Button label="Use this phone as the booth" onPress={() => router.push('/booth')} />
          <Button
            label="End the party"
            variant="secondary"
            onPress={async () => {
              setEvent(await api.setEventStatus(tenantId!, event.id, 'ended'))
            }}
          />
        </>
      ) : null}

      <Label>{ready.length} photos</Label>
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onReprint={async () => {
            await api.reprint(tenantId!, session.id)
            await load()
          }}
        />
      ))}
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: t.color.text.primary, fontSize: t.fontSize['2xl'], fontWeight: '700' }}>
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
  const t = useTheme()
  return (
    <Row>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: ok ? t.color.status.good : t.color.status.bad,
        }}
      />
      <Text style={{ color: t.color.text.secondary, fontSize: t.fontSize.sm, width: 70 }}>
        {label}
      </Text>
      <Text
        style={{
          color: ok ? t.color.text.primary : t.color.status.bad,
          fontSize: t.fontSize.sm,
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
  const t = useTheme()

  return (
    <Card>
      <Row>
        {session.montageUrl ? (
          <Image
            source={{ uri: session.montageUrl }}
            style={{
              width: 90,
              height: 60,
              borderRadius: t.radius.sm,
              backgroundColor: t.color.surface.sunken,
            }}
          />
        ) : (
          <View
            style={{
              width: 90,
              height: 60,
              borderRadius: t.radius.sm,
              backgroundColor: t.color.surface.sunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: t.color.text.disabled, fontSize: t.fontSize.xs }}>
              {session.status === 'failed' ? 'failed' : session.status}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.color.text.primary, fontSize: t.fontSize.sm, letterSpacing: 1 }}>
            {session.code}
          </Text>
          <Text style={{ color: t.color.text.secondary, fontSize: t.fontSize.xs }}>
            {new Date(session.createdAt).toLocaleTimeString('en-GB', {
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
                color: t.color.action.bg,
                fontSize: t.fontSize.sm,
                fontWeight: '600',
              }}
            >
              Reprint
            </Text>
          </Pressable>
        ) : null}
      </Row>
    </Card>
  )
}
