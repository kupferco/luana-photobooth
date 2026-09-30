import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useT } from '../locale'
import { useTheme } from '../theme'
import { Label, Slider } from './index'

/**
 * Any colour, rather than one of ours.
 *
 * The palettes stay as a recommendation and this is the escape from them.
 * Somebody throwing their own party gets to make it whatever they like,
 * including something we would not have chosen -- which is the point. The
 * "Tidy up" button is where our opinion lives now.
 *
 * Two sliders rather than a wheel: a wheel is a gesture surface to build
 * and a fiddly one to hit on a phone, and hue plus lightness covers what
 * anybody is actually reaching for. The greys are shortcuts because they
 * are the hardest thing to land on with a hue slider and the most wanted.
 */

const NEUTRALS = ['#ffffff', '#d4d4d8', '#71717a', '#27272a', '#000000']

/** Hue 0-360, saturation and lightness 0-1, out as #rrggbb. */
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]

  const hex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function ColourPicker({
  label,
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  label: string
  /** Null means "whatever the palette says". */
  value: string | null
  onChange: (hex: string) => void
  onClear?: () => void
  clearLabel?: string
}) {
  const theme = useTheme()
  const t = useT()

  /*
   * The sliders hold their own positions.
   *
   * They were constants in the first version, which meant dragging
   * lightness snapped the hue back to red and dragging hue snapped
   * lightness back to the middle -- each slider quietly undoing the other.
   * Reading them back out of the hex would fight whoever is mid-drag, so
   * they are state and the hex is what falls out.
   */
  const [hue, setHue] = useState(0)
  const [lightness, setLightness] = useState(50)

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Label>{label}</Label>
        {onClear ? (
          <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
            <Text
              style={{
                color: value === null ? theme.color.action.bg : theme.color.text.secondary,
                fontSize: theme.fontSize.sm,
              }}
            >
              {clearLabel ?? t('artwork.colourDefault')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {NEUTRALS.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            hitSlop={4}
            accessibilityRole="button"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: hex,
              borderWidth: value?.toLowerCase() === hex ? 3 : 1,
              borderColor:
                value?.toLowerCase() === hex
                  ? theme.color.action.bg
                  : theme.color.border.strong,
            }}
          />
        ))}

        {/* What is currently chosen, so the sliders have something to aim at. */}
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            marginLeft: 'auto',
            backgroundColor: value ?? theme.color.surface.sunken,
            borderWidth: 1,
            borderColor: theme.color.border.strong,
          }}
        />
      </View>

      <Slider
        value={hue}
        onChange={(v) => {
          setHue(v)
          onChange(hslToHex((v / 100) * 360, 0.72, lightness / 100))
        }}
      />
      <Slider
        value={lightness}
        onChange={(v) => {
          setLightness(v)
          onChange(hslToHex((hue / 100) * 360, 0.72, Math.max(8, Math.min(92, v)) / 100))
        }}
      />
    </View>
  )
}
