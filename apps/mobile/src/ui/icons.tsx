import Svg, { Circle, Path } from 'react-native-svg'
import type { ColorValue } from 'react-native'

/**
 * The handful of icons the app needs, drawn rather than installed.
 *
 * react-native-svg is already here for the QR code, so three shapes cost
 * nothing. An icon font would add a megabyte and a native module to a build
 * that currently needs neither, for glyphs we can draw in four lines.
 *
 * Stroke-based and inheriting colour, so the tab bar's active and inactive
 * tints apply without a second set of assets.
 */

interface IconProps {
  color: ColorValue
  size?: number
}

export function HomeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function CameraIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5a2 2 0 0 1 2-2h2.2l1.3-2h6l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.6} stroke={color as string} strokeWidth={1.8} />
    </Svg>
  )
}

/** A printer: paper going in, a sheet coming out. */
export function PrinterIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 9V4h10v5"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 9h14a2 2 0 0 1 2 2v5h-4M7 16H3v-5a2 2 0 0 1 2-2"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7 13h10v7H7z"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function PersonIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.8} stroke={color as string} strokeWidth={1.8} />
      <Path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        stroke={color as string}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  )
}
