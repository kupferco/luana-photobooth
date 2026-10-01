import type { Template } from '@photobooth/shared'
import { Text, View } from 'react-native'
import { useT } from '../locale'
import { useTheme } from '../theme'

/**
 * Where the photographs land, drawn over a background.
 *
 * The background on its own is not what anyone is choosing. Three
 * photographs cover most of it, and a card that shows the picture alone
 * invites someone to pick one whose best part is the part nobody will ever
 * see. So every place a background is shown -- the studio preview, the
 * enlarged view, the card on the event screen -- shows the slots too.
 *
 * Positioned as percentages of the canvas rather than scaled pixels, so it
 * can be laid over an image sized by its container as easily as over a
 * preview of a known width. The parent needs a size and `overflow: hidden`;
 * everything here is absolute.
 */
export function PhotoSlots({
  template,
  /** Smaller type for a thumbnail, where the labels are decoration. */
  compact,
}: {
  template: Template
  compact?: boolean
}) {
  const theme = useTheme()
  const t = useT()
  const { w, h } = template.canvas

  const percent = (value: number, of: number) => `${(value / of) * 100}%` as const

  return (
    <>
      {template.cells.map((cell, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: percent(cell.x, w),
            top: percent(cell.y, h),
            width: percent(cell.w, w),
            height: percent(cell.h, h),
            // Dark and nearly opaque: this is what the background will not
            // be seen through, and saying so softly would be a lie.
            backgroundColor: 'rgba(24,24,27,0.82)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: compact ? 10 : theme.fontSize.xs,
            }}
          >
            {t('artwork.photoSlot', { n: String(i + 1) })}
          </Text>
        </View>
      ))}
    </>
  )
}
