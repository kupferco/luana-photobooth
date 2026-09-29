import type { Template } from '@photobooth/shared'
import { Image, View, type ViewStyle } from 'react-native'

/**
 * The montage as the guest sees it, seconds before the server has built the
 * real one.
 *
 * No canvas: it is the background with the shots absolutely positioned from
 * the same template JSON, scaled down. That renders identically on web and
 * native with no platform code, and it means the preview cannot drift from
 * the print, because both read the same numbers.
 *
 * The server still composes the file that reaches the printer. This exists so
 * nobody stands in front of a spinner while it does.
 */
export function MontagePreview({
  template,
  shotUris,
  width,
  backgroundUri,
  style,
}: {
  template: Template
  /** In capture order, one per cell. Missing entries render as empty cells. */
  shotUris: (string | null)[]
  width: number
  backgroundUri?: string | null
  style?: ViewStyle
}) {
  const scale = width / template.canvas.w
  const height = template.canvas.h * scale

  return (
    <View
      style={[
        {
          width,
          height,
          backgroundColor: template.backgroundColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {backgroundUri ? (
        <Image
          source={{ uri: backgroundUri }}
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
          resizeMode="cover"
        />
      ) : null}

      {template.cells.map((cell, index) => {
        const uri = shotUris[index]
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: cell.x * scale,
              top: cell.y * scale,
              width: cell.w * scale,
              height: cell.h * scale,
              // Shows through as an empty slot while shots are still being
              // taken, so the layout is legible from the first countdown.
              backgroundColor: uri ? 'transparent' : 'rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                // 'cover' centre-crops, which is what centreCrop() does
                // server-side -- so the preview frames the shot the same way
                // the print will.
                resizeMode="cover"
              />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
