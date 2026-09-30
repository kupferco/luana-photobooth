import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { Label, Slider } from './index'

/**
 * Any colour, picked in one tap and then adjusted.
 *
 * The first version was two unlabelled sliders -- hue and lightness -- and
 * it was unusable: nothing said what either did, they were hard to aim at,
 * and the only visible effect of fiddling was that the party's name
 * changed to something unreadable. A grid is instantly legible and one tap
 * lands on it; the slider that survived is the one people actually reach
 * for, and it now says what it does.
 */

/** Twelve hues, each at three tones, plus the greys nobody can hit by hue. */
const HUES = [0, 20, 40, 145, 175, 200, 220, 260, 290, 320, 340, 15]
const TONES = [0.72, 0.52, 0.32]
const NEUTRALS = ['#ffffff', '#d4d4d8', '#a1a1aa', '#52525b', '#27272a', '#000000']

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
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function ColourPicker({
  label,
  value,
  onChange,
  onClear,
  clearLabel,
  brightnessLabel,
}: {
  label: string
  value: string | null
  onChange: (hex: string) => void
  onClear?: () => void
  clearLabel: string
  brightnessLabel: string
}) {
  const theme = useTheme()

  /** The hue last tapped, so the brightness slider has something to shift. */
  const [hue, setHue] = useState<number | null>(null)
  const [brightness, setBrightness] = useState(50)

  const swatch = (hex: string, onPress: () => void, key: string) => {
    const chosen = value?.toLowerCase() === hex.toLowerCase()
    return (
      <Pressable
        key={key}
        onPress={onPress}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityState={{ selected: chosen }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: hex,
          borderWidth: chosen ? 3 : 1,
          borderColor: chosen ? theme.color.action.bg : theme.color.border.strong,
        }}
      />
    )
  }

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Label>{label}</Label>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* What is currently in use, big enough to actually read. */}
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: value ?? 'transparent',
              borderWidth: 1,
              borderColor: theme.color.border.strong,
            }}
          />
          {onClear ? (
            <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
              <Text
                style={{
                  color: value === null ? theme.color.action.bg : theme.color.text.secondary,
                  fontSize: theme.fontSize.sm,
                }}
              >
                {clearLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {TONES.map((tone, row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {HUES.map((h) =>
            swatch(
              hslToHex(h, 0.7, tone),
              () => {
                setHue(h)
                setBrightness(Math.round(tone * 100))
                onChange(hslToHex(h, 0.7, tone))
              },
              `${row}-${h}`,
            ),
          )}
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {NEUTRALS.map((hex) =>
          swatch(
            hex,
            () => {
              setHue(null)
              onChange(hex)
            },
            hex,
          ),
        )}
      </View>

      {/* Only once a hue is chosen: brightening a grey through a hue slider
          would turn it into a colour, which is not what it says. */}
      {hue !== null ? (
        <View style={{ gap: 2 }}>
          <Label>{brightnessLabel}</Label>
          <Slider
            value={brightness}
            onChange={(v) => {
              setBrightness(v)
              onChange(hslToHex(hue, 0.7, Math.max(10, Math.min(90, v)) / 100))
            }}
          />
        </View>
      ) : null}
    </View>
  )
}
