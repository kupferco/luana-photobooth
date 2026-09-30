import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { usingFixtures, type Event } from '../../src/api'
import { useActiveEvent } from '../../src/event-context'
import { useLocale, useT } from '../../src/locale'
import { useTheme } from '../../src/theme'
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Label,
  Notice,
  Row,
  Screen,
  Spinner,
} from '../../src/ui'

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

  const [query, setQuery] = useState('')
  const [year, setYear] = useState<number | null>(null)

  /** Newest first, which is the order the years are wanted in. */
  const years = useMemo(
    () =>
      [...new Set(past.map((e) => new Date(e.eventDate).getFullYear()))].sort(
        (a, b) => b - a,
      ),
    [past],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return past.filter(
      (e) =>
        (year === null || new Date(e.eventDate).getFullYear() === year) &&
        (needle === '' || e.name.toLowerCase().includes(needle)),
    )
  }, [past, query, year])

  /*
   * Filters appear once the list is long enough to need them.
   *
   * Someone with two finished parties can see both; a search box above
   * them is a control that answers a question they do not have. Three is
   * where a list starts running off a phone screen.
   */
  const showFilters = past.length >= 3

  const totals = useMemo(
    () =>
      events.reduce(
        (sum, e) => ({ photos: sum.photos + e.photos, prints: sum.prints + e.prints }),
        { photos: 0, prints: 0 },
      ),
    [events],
  )

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
            <Stat label={t('home.totalPhotos')} value={String(totals.photos)} />
            <Stat label={t('home.totalPrints')} value={String(totals.prints)} />
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

          {showFilters ? (
            <Card>
              <Field
                label={t('home.searchPast')}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="…"
              />
              {years.length > 1 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Chip
                    label={t('home.allYears')}
                    selected={year === null}
                    onPress={() => setYear(null)}
                  />
                  {years.map((y) => (
                    <Chip
                      key={y}
                      label={String(y)}
                      selected={year === y}
                      onPress={() => setYear(y)}
                    />
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          {filtered.length === 0 ? (
            <Card>
              <Body muted>{t('home.noMatches')}</Body>
              <Button
                label={t('home.clearFilters')}
                variant="secondary"
                onPress={() => {
                  setQuery('')
                  setYear(null)
                }}
              />
            </Card>
          ) : (
            filtered.map((event) => (
              <EventCard key={event.id} event={event} onPress={() => open(event)} />
            ))
          )}
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

/**
 * Anything on a finished party worth a second look, in one line.
 *
 * People giving up comes first: it is not a proxy for a problem, it is the
 * problem -- somebody joined the queue and went away without a photograph.
 *
 * Otherwise the worst queue anybody sat through, and deliberately not the
 * average. Parties are spiky; everyone goes after the speeches. A party can
 * average forty seconds and still have had an hour where the queue was
 * twelve minutes long, and that hour is the one guests remember. The
 * average calls it fine.
 *
 * Five minutes is the line. Below it nobody minds; above it they start
 * deciding it is not worth it.
 */
const NOTABLE_WAIT_SECONDS = 5 * 60

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  const waited = event.longestWaitSeconds
  const review =
    event.abandoned > 0
      ? t.plural('home.gaveUp', event.abandoned)
      : waited !== null && waited >= NOTABLE_WAIT_SECONDS
        ? t('home.queued', {
            time: `${Math.round(waited / 60)}m`,
          })
        : null

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

            {/* Only once there is something to say. A row of zeroes on a
                party that has not happened yet is noise. */}
            {event.photos > 0 ? (
              <Text
                style={{
                  color: theme.color.text.secondary,
                  fontSize: theme.fontSize.sm,
                }}
              >
                {t.plural('common.photos', event.photos)}
                {' · '}
                {t.plural('common.prints', event.prints)}
              </Text>
            ) : null}

            {/*
              * Only when there is something to say.
              *
              * A third number on every row becomes wallpaper, and the
              * question this list is scanned for is not "how big was it"
              * but "which of these went badly". So the good parties stay
              * quiet and the ones worth reviewing speak up.
              */}
            {review ? (
              <Text
                style={{ color: theme.color.status.ok, fontSize: theme.fontSize.sm }}
              >
                {review}
              </Text>
            ) : null}
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
