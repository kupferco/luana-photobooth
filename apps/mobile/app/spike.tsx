import { CLASSIC_3UP, centreCrop, shotCount } from '@photobooth/shared'
import { useCallback, useRef, useState } from 'react'
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

/**
 * Day-1 de-risking screen. It exists to answer one question on the real
 * tripod iPhone, in Safari, over https: does the camera open and does a
 * capture come back at full resolution?
 *
 * It reports what it finds rather than just working or not, because "it
 * didn't work" on someone else's phone is not a debuggable result. Delete
 * this screen once booth mode is real.
 */
export default function CameraSpike() {
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
            <ActivityIndicator color="#111" />
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
      <Diagnostics ready={ready} shots={shots} />

      {latest && crop ? (
        <>
          <Text style={styles.heading}>Latest capture</Text>
          <Image
            source={{ uri: latest.previewUri }}
            style={styles.preview}
            resizeMode="contain"
          />
          <Row
            label="Captured"
            value={`${latest.width} x ${latest.height}px, ${(latest.blob.size / 1024).toFixed(0)} KB`}
          />
          <Row
            label="Crop for cell 1"
            value={`${crop.w} x ${crop.h} from (${crop.x}, ${crop.y})`}
          />
          <Row
            label="Print cell"
            value={`${target.cells[0]!.w} x ${target.cells[0]!.h} on ${target.canvas.w} x ${target.canvas.h}`}
          />
          <Row
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

function Diagnostics({ ready, shots }: { ready: boolean; shots: CapturedShot[] }) {
  const isWeb = Platform.OS === 'web'
  const secure = isWeb ? String(globalThis.isSecureContext) : 'n/a (native)'
  const ua = isWeb ? globalThis.navigator?.userAgent ?? 'unknown' : 'n/a (native)'

  return (
    <View style={styles.table}>
      <Row label="Platform" value={Platform.OS} />
      <Row label="Secure context" value={secure} />
      <Row label="Camera ready" value={ready ? 'yes' : 'no'} />
      <Row label="Shots taken" value={String(shots.length)} />
      <Row label="User agent" value={ua} />
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue} selectable>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#111' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  viewport: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  row: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    backgroundColor: '#f5c518',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonSecondary: { backgroundColor: '#2c2c2e' },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  buttonLabelSecondary: { color: '#fff' },
  error: {
    color: '#ff6b6b',
    backgroundColor: '#2a1215',
    padding: 12,
    borderRadius: 8,
  },
  heading: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  table: { gap: 6 },
  tableRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tableLabel: { color: '#8e8e93', fontSize: 13, width: 130 },
  tableValue: { color: '#fff', fontSize: 13, flex: 1 },
  preview: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  footnote: { color: '#8e8e93', fontSize: 12, marginTop: 8 },
})
