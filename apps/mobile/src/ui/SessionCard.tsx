import { memo, useState } from 'react'
import { Image, Text, TextInput, View } from 'react-native'
import type { GallerySession } from '../api'
import { useLocale, useT } from '../locale'
import { useTheme } from '../theme'
import { Button, Card, Row } from './index'

/**
 * One montage in the gallery.
 *
 * Memoised, and compared on the fields that actually change. The dashboard
 * polls every few seconds and hands down a fresh array each time; without
 * this every card re-rendered, and with it only the one that changed does.
 * That is most of what stops the list flickering while a party is running.
 */

interface Props {
  session: GallerySession
  onPrint(): Promise<void>
  onEmail(to: string): Promise<void>
}

function areEqual(a: Props, b: Props): boolean {
  return (
    a.session.id === b.session.id &&
    a.session.status === b.session.status &&
    a.session.printCount === b.session.printCount &&
    a.session.emailedTo === b.session.emailedTo &&
    // The signed URL is quantised to the hour, so this stays equal across
    // polls and the <Image> is never asked to reload.
    a.session.montageUrl === b.session.montageUrl
  )
}

export const SessionCard = memo(function SessionCard({
  session,
  onPrint,
  onEmail,
}: Props) {
  const t = useTheme()
  const tr = useT()
  const { locale } = useLocale()

  const [busy, setBusy] = useState<'print' | 'email' | null>(null)
  const [emailing, setEmailing] = useState(false)
  const [to, setTo] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = session.status === 'ready'

  const run = async (kind: 'print' | 'email', action: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await action()
      setDone(kind === 'print' ? tr('dashboard.printQueued') : tr('dashboard.emailSent'))
      setEmailing(false)
      setTo('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

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
              {session.status}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: t.color.text.primary,
              fontSize: t.fontSize.sm,
              letterSpacing: 1,
            }}
          >
            {session.code}
          </Text>
          <Text style={{ color: t.color.text.secondary, fontSize: t.fontSize.xs }}>
            {new Date(session.createdAt).toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {/* What was asked for, not what came out of the printer -- the
                app never learns whether paper actually appeared. */}
            {session.printCount > 0
              ? ` · ${tr.plural('dashboard.printedCount', session.printCount)}`
              : ''}
            {session.emailedTo ? ` · ${tr('dashboard.emailSent').toLowerCase()}` : ''}
          </Text>
        </View>
      </Row>

      {ready ? (
        <Row>
          <View style={{ flex: 1 }}>
            <Button
              label={tr('dashboard.print')}
              variant="secondary"
              busy={busy === 'print'}
              onPress={() => void run('print', onPrint)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={tr('dashboard.email')}
              variant="secondary"
              onPress={() => setEmailing((v) => !v)}
            />
          </View>
        </Row>
      ) : null}

      {emailing ? (
        <>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder={tr('dashboard.emailPrompt')}
            placeholderTextColor={t.color.text.disabled}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="email"
            style={{
              backgroundColor: t.color.surface.sunken,
              borderWidth: 1,
              borderColor: t.color.border.subtle,
              borderRadius: t.radius.md,
              padding: t.space[3],
              color: t.color.text.primary,
              fontSize: t.fontSize.md,
              minHeight: 48,
            }}
          />
          <Button
            label={tr('dashboard.email')}
            busy={busy === 'email'}
            disabled={!to.includes('@')}
            onPress={() => void run('email', () => onEmail(to.trim()))}
          />
        </>
      ) : null}

      {done ? (
        <Text style={{ color: t.color.status.good, fontSize: t.fontSize.sm }}>{done}</Text>
      ) : null}
      {error ? (
        <Text style={{ color: t.color.status.bad, fontSize: t.fontSize.sm }}>{error}</Text>
      ) : null}
    </Card>
  )
},
areEqual)
