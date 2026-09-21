import { daysRemaining } from '@photobooth/shared'
import { Link, router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { api, usingFixtures, type Event } from '../../src/api'
import { useLocale, useT } from '../../src/locale'
import { useSession } from '../../src/session'
import { Body, Button, Card, Heading, Label, Notice, Row, Screen, Spinner } from '../../src/ui'
import { useTheme } from '../../src/theme'

export default function EventsList() {
  const { tenantId, user } = useSession()
  const t = useT()
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
        <Heading>{t('app.name')}</Heading>
        <Body muted>{t('auth.signInToStart')}</Body>
        <Button label={t('auth.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    )
  }

  return (
    <Screen>
      {usingFixtures ? (
        <Notice tone="warn">
{t('dev.fixtures')}</Notice>
      ) : null}

      {events === null ? (
        <Spinner />
      ) : events.length === 0 ? (
        <Card>
          <Body>{t('events.none')}</Body>
<Body muted>{t('events.noneHint')}</Body>
        </Card>
      ) : (
        events.map((event) => <EventRow key={event.id} event={event} />)
      )}

      <Button label={t('events.new')} onPress={() => router.push('/events/new')} />
      <Button
        label={t('nav.settings')}
        variant="secondary"
        onPress={() => router.push('/settings')}
      />
    </Screen>
  )
}

function EventRow({ event }: { event: Event }) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()
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
                  color: theme.color.text.primary,
                  fontSize: theme.fontSize.lg,
                  fontWeight: '600',
                }}
              >
                {event.name}
              </Text>
              <Text style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.sm }}>
                {new Date(event.eventDate).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Text
              style={{
                color: theme.color.text.secondary,
                fontSize: theme.fontSize.sm,
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
                ? t('retention.deletedToday')
                : t.plural('retention.daysLeftAction', expiring)}
            </Notice>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  )
}

function StatusDot({ status }: { status: Event['status'] }) {
  const theme = useTheme()
  const t = useT()
  const colour =
    status === 'live'
      ? theme.color.status.good
      : status === 'draft'
        ? theme.color.text.disabled
        : theme.color.text.secondary

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
      <Label>{t(`events.status.${status}`)}</Label>
    </View>
  )
}
