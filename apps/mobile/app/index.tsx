import type { Theme } from '@dk/ui-tokens'
import { CLASSIC_3UP, retentionNotice, retentionUntil } from '@photobooth/shared'
import { Link } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme, weight } from '../src/theme'

/**
 * Placeholder home screen. Becomes the owner's event list once auth lands;
 * for now it is a way into the day-1 camera check and a smoke test that the
 * shared packages resolve from inside Expo.
 */
export default function Home() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
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
        <Text style={styles.body}>
          template {CLASSIC_3UP.canvas.w}x{CLASSIC_3UP.canvas.h},{' '}
          {CLASSIC_3UP.cells.length} cells
        </Text>
        <Text style={styles.body}>{retentionNotice(until)}</Text>
      </View>
    </View>
  )
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: t.color.surface.base,
      padding: t.space[6],
      gap: t.space[8],
    },
    block: { gap: t.space[1] },
    title: {
      color: t.color.text.primary,
      fontSize: t.fontSize['2xl'],
      fontWeight: weight(t.fontWeight.bold),
    },
    subtitle: { color: t.color.text.secondary, fontSize: t.fontSize.md },
    label: {
      color: t.color.text.secondary,
      fontSize: t.fontSize.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    body: { color: t.color.text.primary, fontSize: t.fontSize.sm },
    link: {
      color: t.color.action.fg,
      backgroundColor: t.color.action.bg,
      fontSize: t.fontSize.md,
      fontWeight: weight(t.fontWeight.semibold),
      paddingVertical: t.space[4],
      paddingHorizontal: t.space[5],
      borderRadius: t.radius.md,
      textAlign: 'center',
      overflow: 'hidden',
    },
  })
