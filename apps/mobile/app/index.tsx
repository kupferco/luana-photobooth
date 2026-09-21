import { CLASSIC_3UP, retentionNotice, retentionUntil } from '@photobooth/shared'
import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

/**
 * Placeholder home screen. Becomes the owner's event list once auth lands;
 * for now it is a way into the day-1 camera check and a smoke test that the
 * shared package resolves from inside Expo.
 */
export default function Home() {
  const until = retentionUntil(new Date())

  return (
    <View style={styles.page}>
      <View style={styles.block}>
        <Text style={styles.title}>Photo Booth</Text>
        <Text style={styles.subtitle}>
          Nothing here yet. Scaffolding is in place.
        </Text>
      </View>

      <Link href="/spike" style={styles.link}>
        Run the camera check
      </Link>

      <View style={styles.block}>
        <Text style={styles.label}>Shared package smoke test</Text>
        <Text style={styles.mono}>
          template {CLASSIC_3UP.canvas.w}x{CLASSIC_3UP.canvas.h},{' '}
          {CLASSIC_3UP.cells.length} cells
        </Text>
        <Text style={styles.mono}>{retentionNotice(until)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#111', padding: 24, gap: 28 },
  block: { gap: 6 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#8e8e93', fontSize: 15 },
  label: {
    color: '#8e8e93',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  mono: { color: '#fff', fontSize: 13 },
  link: {
    color: '#111',
    backgroundColor: '#f5c518',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 10,
    textAlign: 'center',
    overflow: 'hidden',
  },
})
