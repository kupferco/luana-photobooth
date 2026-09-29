import { router } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { usingFixtures, type Event } from '../../src/api'
import { useActiveEvent } from '../../src/event-context'
import { useLocale, useT } from '../../src/locale'
import { useTheme } from '../../src/theme'
import { Body, Button, Card, Label, Notice, Row, Screen, Spinner } from '../../src/ui'

/**
 * Everything that has happened. Stats across all events, then the events
 * themselves -- upcoming first, because before a party the next one is what
 * someone came here for.
 *
 * Tapping an event makes it the one the Event tab shows.
 */
export default function Home() {
  const { events, loading, setActive } = useActiveEvent()
  const t = useT()

  const upcoming = useMemo(
    () => events.filter((e) => e.status !== 'ended'),
    [events],
  )
  const past = useMemo(() => events.filter((e) => e.status === 'ended'), [events])

  const open = (event: Event) => {
    setActive(event.id)
    router.push('/event')
  }

  if (loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    )
  }

  return (
    <Screen>
      {usingFixtures ? <Notice tone="warn">{t('dev.fixtures')}</Notice> : null}

      {events.length === 0 ? (
        <Card>
          <Body>{t('home.noEvents')}</Body>
          <Body muted>{t('home.noEventsHint')}</Body>
        </Card>
      ) : (
        <Card>
          <Row>
            <Stat label={t('home.totalEvents')} value={String(events.length)} />
            {/* Totals are per-event counts the API will serve; the shape is
                here so the layout is settled before it is wired. */}
            <Stat label={t('home.totalPhotos')} value="—" />
            <Stat label={t('home.totalPrints')} value="—" />
          </Row>
        </Card>
      )}

      {upcoming.length > 0 ? (
        <>
          <Label>{t('home.upcoming')}</Label>
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} onPress={() => open(event)} />
          ))}
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <Label>{t('home.past')}</Label>
          {past.map((event) => (
            <EventCard key={event.id} event={event} onPress={() => open(event)} />
          ))}
        </>
      ) : null}

      <Button label={t('events.new')} onPress={() => router.push('/events/new')} />
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.fontSize['2xl'],
          fontWeight: '700',
        }}
      >
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  )
}

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  const colour =
    event.status === 'live'
      ? theme.color.status.good
      : event.status === 'draft'
        ? theme.color.text.disabled
        : theme.color.text.secondary

  return (
    <Pressable onPress={onPress}>
      <Card>
        <Row>
          <View
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour }}
          />
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
            <Text
              style={{
                color: theme.color.text.secondary,
                fontSize: theme.fontSize.sm,
              }}
            >
              {new Date(event.eventDate).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {t(`events.status.${event.status}`)}
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
      </Card>
    </Pressable>
  )
}
