import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { api } from '../api'
import type { EventReport } from '../api/types'
import { useT } from '../locale'
import { useTheme } from '../theme'
import { Body, Card, Label, Spinner } from '../ui'

/**
 * What a finished party did.
 *
 * Written for somebody deciding how many booths to bring next time, which
 * is two questions rather than one: what a booth managed, and whether that
 * was enough. Throughput answers the first and the wait answers the second,
 * and they can disagree -- a booth going flat out all evening with nobody
 * queuing is exactly right, and the same booth with a four-minute queue is
 * one booth short.
 *
 * Only for an event that has ended. While a party is running the useful
 * numbers are the live ones at the top of the screen, and an average taken
 * an hour in mostly measures how quiet the first hour was.
 */
export function EventReportCard({
  tenantId,
  eventId,
}: {
  tenantId: string
  eventId: string
}) {
  const t = useT()
  const theme = useTheme()
  const [report, setReport] = useState<EventReport | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .eventReport(tenantId, eventId)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch(() => {
        // A party's numbers are worth a blank space, not an error on a
        // screen someone opened to look at their photographs.
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, eventId])

  if (failed) return null
  if (!report) {
    return (
      <Card>
        <Label>{t('report.title')}</Label>
        <Spinner />
      </Card>
    )
  }

  /** Seconds as minutes and seconds, because a queue is measured in minutes. */
  const wait = (seconds: number | null) => {
    if (seconds === null) return null
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, '0')}s`
  }

  const averageWait = wait(report.averageWaitSeconds)
  const longestWait = wait(report.longestWaitSeconds)

  return (
    <Card>
      <Label>{t('report.title')}</Label>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
        <Figure label={t('report.photos')} value={String(report.photos)} />
        <Figure label={t('report.prints')} value={String(report.prints)} />
        <Figure label={t('report.guests')} value={String(report.guests)} />

        <Figure
          label={t('report.perHour')}
          value={report.photosPerHour === null ? '—' : String(report.photosPerHour)}
        />
        <Figure
          label={t('report.busiestHour')}
          value={report.busiestHour === null ? '—' : String(report.busiestHour)}
        />
        <Figure label={t('report.retakes')} value={String(report.retakes)} />

        <Figure label={t('report.averageWait')} value={averageWait ?? '—'} />
        <Figure label={t('report.longestWait')} value={longestWait ?? '—'} />
        {/* Keeps the last row aligned with the two above it. */}
        <View style={{ width: '33.33%' }} />
      </View>

      <Text
        style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.xs }}
      >
        {averageWait === null ? t('report.noWait') : t('report.busyHint')}
      </Text>

      {averageWait !== null ? <Body muted>{t('report.waitHint')}</Body> : null}
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  const theme = useTheme()
  return (
    <View style={{ width: '33.33%', gap: 2, paddingRight: 8 }}>
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.fontSize.xl,
          fontWeight: '700',
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  )
}
