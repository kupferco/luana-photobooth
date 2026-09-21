import { daysRemaining } from '@photobooth/shared'
import { Link, router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { api, usingFixtures, type Event } from '../../src/api'
import { useSession } from '../../src/session'
import { Body, Button, Card, Heading, Label, Notice, Row, Screen, Spinner } from '../../src/ui'
import { useTheme } from '../../src/theme'

export default function EventsList() {
  const { tenantId, user } = useSession()
  const [events, setEvents] = useState<Event[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!tenantId) return
      let cancelled = false
      void api.listEvents(tenantId).then((rows) => {
        if (!cancelled) setEvents(rows)
      })
      return () => {
        cancelled = true
      }
    }, [tenantId]),
  )

  if (!user) {
    return (
      <Screen>
        <Heading>Photo Booth</Heading>
        <Body muted>Sign in to set up a party.</Body>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  return (
    <Screen>
      {usingFixtures ? (
        <Notice tone="warn">
          Fixture data. Set EXPO_PUBLIC_API_MODE=live to use the real API.
        </Notice>
      ) : null}

      <Heading>Your parties</Heading>

      {events === null ? (
        <Spinner />
      ) : events.length === 0 ? (
        <Card>
          <Body>No parties yet.</Body>
          <Body muted>
            Set one up, print its QR code, and put it on the table.
          </Body>
        </Card>
      ) : (
        events.map((event) => <EventRow key={event.id} event={event} />)
      )}

      <Button label="New party" onPress={() => router.push('/events/new')} />
    </Screen>
  )
}

function EventRow({ event }: { event: Event }) {
  const t = useTheme()
  const expiring = daysRemaining(new Date(event.retentionUntil))

  return (
    <Link href={`/events/${event.id}`} asChild>
      <Pressable>
        <Card>
          <Row>
            <StatusDot status={event.status} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: t.color.text.primary,
                  fontSize: t.fontSize.lg,
                  fontWeight: '600',
                }}
              >
                {event.name}
              </Text>
              <Text style={{ color: t.color.text.secondary, fontSize: t.fontSize.sm }}>
                {new Date(event.eventDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Text
              style={{
                color: t.color.text.secondary,
                fontSize: t.fontSize.sm,
                letterSpacing: 1,
              }}
            >
              {event.joinCode}
            </Text>
          </Row>

          {/* The countdown only appears when it is close enough to matter.
              A banner that is always there stops being read. */}
          {event.status === 'ended' && expiring <= 14 ? (
            <Notice tone={expiring <= 3 ? 'bad' : 'warn'}>
              {expiring === 0
                ? 'These photos are being deleted today.'
                : `${expiring} day${expiring === 1 ? '' : 's'} left — download them before they go.`}
            </Notice>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  )
}

function StatusDot({ status }: { status: Event['status'] }) {
  const t = useTheme()
  const colour =
    status === 'live'
      ? t.color.status.good
      : status === 'draft'
        ? t.color.text.disabled
        : t.color.text.secondary

  return (
    <View style={{ gap: 4, alignItems: 'center', width: 52 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colour,
        }}
      />
      <Label>{status}</Label>
    </View>
  )
}
