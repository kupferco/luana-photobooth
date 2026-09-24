import { memo, useState } from 'react'
import { Image, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native'
import type { GallerySession } from '../api'
import { useLocale, useT } from '../locale'
import { useTheme } from '../theme'
import type { ShareOutcome } from '../share'
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
  onShare(): Promise<ShareOutcome>
}

function areEqual(a: Props, b: Props): boolean {
  return (
    a.session.id === b.session.id &&
    a.session.status === b.session.status &&
    a.session.printCount === b.session.printCount &&
    // Without this the card would not re-render as a print progresses, and
    // the status it exists to show would never change.
    a.session.printStatus === b.session.printStatus &&
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
  onShare,
}: Props) {
  const t = useTheme()
  const tr = useT()
  const { locale } = useLocale()

  /**
   * The stage a print has reached, or nothing once it is done.
   *
   * 'printed' deliberately shows nothing: the count beside the timestamp
   * already says so, and a card that keeps announcing a finished print is
   * noise on a screen that will hold fifty of them.
   */
  const progress = (() => {
    switch (session.printStatus) {
      case 'queued':
        return { label: tr('dashboard.printQueuedFor'), bad: false }
      case 'sent':
        return { label: tr('dashboard.printSending'), bad: false }
      case 'printing':
        return { label: tr('dashboard.printInProgress'), bad: false }
      case 'failed':
        return {
          label: session.printError ?? tr('dashboard.printFailed'),
          bad: true,
        }
      default:
        return null
    }
  })()

  const [zoomed, setZoomed] = useState(false)
  const { width: screenW, height: screenH } = useWindowDimensions()
  const [busy, setBusy] = useState<'print' | 'email' | 'share' | null>(null)
  const [emailing, setEmailing] = useState(false)
  const [to, setTo] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = session.status === 'ready'

  /**
   * Sharing has three honest outcomes and they are not interchangeable.
   * Cancelling the sheet should say nothing at all -- a confirmation after
   * someone backed out is noise. Falling back to the clipboard must say so,
   * because a silent copy is indistinguishable from a dead button.
   */
  const share = async () => {
    setBusy('share')
    setError(null)
    try {
      const outcome = await onShare()
      if (outcome === 'copied') setDone(tr('dashboard.linkCopied'))
      else if (outcome === 'unsupported') setError(tr('dashboard.shareUnsupported'))
      else if (outcome === 'shared') setDone(tr('dashboard.shared'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const run = async (
    kind: 'print' | 'email' | 'share',
    action: () => Promise<void>,
  ) => {
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

  /*
   * The montage is 3:2 landscape. Rather than telling anyone to rotate their
   * phone, the image is simply fitted to whatever shape the screen is now --
   * turning it is something people do without being asked, and the layout
   * follows because useWindowDimensions re-renders on rotation.
   */
  const viewW = Math.min(screenW - 32, (screenH - 140) * 1.5)

  return (
    <Card>
      <Modal
        visible={zoomed}
        transparent
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setZoomed(false)}
      >
        {/* The whole backdrop dismisses: a close button is one more thing to
            aim at on a photo someone is holding up to show a friend. */}
        <Pressable
          onPress={() => setZoomed(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          {session.montageUrl ? (
            <Image
              source={{ uri: session.montageUrl }}
              resizeMode="contain"
              style={{ width: viewW, height: viewW / 1.5, borderRadius: t.radius.sm }}
            />
          ) : null}
          <Text
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: t.fontSize.sm,
              marginTop: 16,
            }}
          >
            {tr('dashboard.tapToClose')}
          </Text>
        </Pressable>
      </Modal>

      <Row>
        {session.montageUrl ? (
          /* A 90x60 thumbnail is enough to recognise a photo and not enough
             to look at one. Tapping opens it as large as the screen allows. */
          <Pressable onPress={() => setZoomed(true)} accessibilityLabel={tr('dashboard.viewPhoto')}>
            <Image
              source={{ uri: session.montageUrl }}
              style={{
                width: 90,
                height: 60,
                borderRadius: t.radius.sm,
                backgroundColor: t.color.surface.sunken,
              }}
            />
          </Pressable>
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
            {session.printCount > 0
              ? ` · ${tr.plural('dashboard.printedCount', session.printCount)}`
              : ''}
            {session.emailedTo ? ` · ${tr('dashboard.emailSent').toLowerCase()}` : ''}
          </Text>
        </View>
      </Row>

      {/*
       * A print takes about a minute on a SELPHY, most of it silent. Showing
       * the stage it has reached is the difference between "is this working?"
       * and watching it work -- and it is the window in which someone would
       * otherwise press Print a second time and spend another sheet.
       */}
      {progress ? (
        <Row>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: progress.bad ? t.color.status.bad : t.color.status.poor,
            }}
          />
          <Text
            style={{
              color: progress.bad ? t.color.status.bad : t.color.text.secondary,
              fontSize: t.fontSize.sm,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {progress.label}
          </Text>
        </Row>
      ) : null}

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
              label={tr('dashboard.share')}
              variant="secondary"
              busy={busy === 'share'}
              onPress={() => void share()}
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
