import type { Theme } from '@dk/ui-tokens'
import { CLASSIC_3UP, centreCrop, shotCount } from '@photobooth/shared'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CameraView, type CameraRef, type CapturedShot } from '../src/camera'
import { useTheme, weight } from '../src/theme'

/**
 * Day-1 de-risking screen. It exists to answer one question on the real
 * tripod iPhone: does the camera open, and does a capture come back at full
 * resolution?
 *
 * It reports what it finds rather than just working or not, because "it
 * didn't work" on someone else's phone is not a debuggable result. Delete
 * this screen once booth mode is real.
 */
export default function CameraSpike() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const cameraRef = useRef<CameraRef>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shots, setShots] = useState<CapturedShot[]>([])

  const target = CLASSIC_3UP

  const onCapture = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const shot = await cameraRef.current?.capture()
      if (shot) setShots((prev) => [...prev, shot].slice(-shotCount(target)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [target])

  const reset = useCallback(() => {
    shots.forEach((s) => {
      if (s.previewUri.startsWith('blob:')) URL.revokeObjectURL(s.previewUri)
    })
    setShots([])
    setError(null)
  }, [shots])

  const latest = shots[shots.length - 1]
  const crop = latest
    ? centreCrop(latest.width, latest.height, target.cells[0]!)
    : null

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.viewport}>
        <CameraView
          ref={cameraRef}
          mirrorPreview
          onReady={() => setReady(true)}
          onError={(e) => {
            setReady(false)
            setError(e.message)
          }}
          style={styles.cameraFill}
        />
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={onCapture}
          disabled={!ready || busy}
          style={[styles.button, (!ready || busy) && styles.buttonDisabled]}
        >
          {busy ? (
            <ActivityIndicator color={theme.color.action.fg} />
          ) : (
            <Text style={styles.buttonLabel}>Take a photo</Text>
          )}
        </Pressable>
        <Pressable
          onPress={reset}
          disabled={shots.length === 0}
          style={[
            styles.button,
            styles.buttonSecondary,
            shots.length === 0 && styles.buttonDisabled,
          ]}
        >
          <Text style={[styles.buttonLabel, styles.buttonLabelSecondary]}>
            Reset
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.heading}>What this device reports</Text>
      <Diagnostics ready={ready} shots={shots} styles={styles} />

      {latest && crop ? (
        <>
          <Text style={styles.heading}>Latest capture</Text>
          <Image
            source={{ uri: latest.previewUri }}
            style={styles.preview}
            resizeMode="contain"
          />
          <Row
            styles={styles}
            label="Captured"
            value={`${latest.width} x ${latest.height}px, ${(latest.blob.size / 1024).toFixed(0)} KB`}
          />
          <Row
            styles={styles}
            label="Crop for cell 1"
            value={`${crop.w} x ${crop.h} from (${crop.x}, ${crop.y})`}
          />
          <Row
            styles={styles}
            label="Print cell"
            value={`${target.cells[0]!.w} x ${target.cells[0]!.h} on ${target.canvas.w} x ${target.canvas.h}`}
          />
          <Row
            styles={styles}
            label="Enough for print?"
            value={
              crop.w >= target.cells[0]!.w
                ? 'Yes — capture exceeds the cell'
                : `No — short by ${target.cells[0]!.w - crop.w}px`
            }
          />
        </>
      ) : null}

      <Text style={styles.footnote}>
        {shots.length} of {shotCount(target)} shots held. Nothing is uploaded;
        this screen is local only.
      </Text>
    </ScrollView>
  )
}

type Styles = ReturnType<typeof makeStyles>

function Diagnostics({
  ready,
  shots,
  styles,
}: {
  ready: boolean
  shots: CapturedShot[]
  styles: Styles
}) {
  const isWeb = Platform.OS === 'web'
  const secure = isWeb ? String(globalThis.isSecureContext) : 'n/a (native)'
  const ua = isWeb ? (globalThis.navigator?.userAgent ?? 'unknown') : 'n/a (native)'

  return (
    <View style={styles.table}>
      <Row styles={styles} label="Platform" value={Platform.OS} />
      <Row styles={styles} label="Secure context" value={secure} />
      <Row styles={styles} label="Camera ready" value={ready ? 'yes' : 'no'} />
      <Row styles={styles} label="Shots taken" value={String(shots.length)} />
      <Row styles={styles} label="User agent" value={ua} />
    </View>
  )
}

function Row({
  label,
  value,
  styles,
}: {
  label: string
  value: string
  styles: Styles
}) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue} selectable>
        {value}
      </Text>
    </View>
  )
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: t.color.surface.base },
    content: {
      padding: t.space[4],
      paddingBottom: t.space[10],
      gap: t.space[3],
    },
    viewport: {
      width: '100%',
      aspectRatio: 3 / 2,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      backgroundColor: t.palette.neutral!['950']!,
    },
    cameraFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    row: { flexDirection: 'row', gap: t.space[3] },
    button: {
      flex: 1,
      backgroundColor: t.color.action.bg,
      paddingVertical: t.space[4],
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      // Comfortably above the 44pt minimum: this gets tapped by someone
      // holding a drink, at arm's length, on a tripod.
      minHeight: 56,
    },
    buttonSecondary: { backgroundColor: t.color.actionSecondary.bg },
    buttonDisabled: { opacity: 0.4 },
    buttonLabel: {
      fontSize: t.fontSize.md,
      fontWeight: weight(t.fontWeight.semibold),
      color: t.color.action.fg,
    },
    buttonLabelSecondary: { color: t.color.actionSecondary.fg },
    error: {
      color: t.color.danger.fg,
      backgroundColor: t.color.danger.bg,
      padding: t.space[3],
      borderRadius: t.radius.sm,
    },
    heading: {
      color: t.color.text.primary,
      fontSize: t.fontSize.xs,
      fontWeight: weight(t.fontWeight.bold),
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: t.space[2],
    },
    table: { gap: t.space[1] },
    tableRow: { flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' },
    tableLabel: {
      color: t.color.text.secondary,
      fontSize: t.fontSize.sm,
      width: 130,
    },
    tableValue: { color: t.color.text.primary, fontSize: t.fontSize.sm, flex: 1 },
    preview: {
      width: '100%',
      aspectRatio: 3 / 2,
      borderRadius: t.radius.lg,
      backgroundColor: t.palette.neutral!['950']!,
    },
    footnote: {
      color: t.color.text.secondary,
      fontSize: t.fontSize.xs,
      marginTop: t.space[2],
    },
  })
