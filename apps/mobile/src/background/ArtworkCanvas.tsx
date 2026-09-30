import {
  ARTWORK_PADDING,
  artworkArea,
  resolveArtwork,
  type Template,
} from '@photobooth/shared'
import { Image, Text, View } from 'react-native'
import Svg, { Circle, Line, Rect } from 'react-native-svg'
import {
  FONTS,
  PALETTES,
  formatEventDate,
  scatter,
  type Artwork,
} from './artwork'

/**
 * The background as it will be printed, drawn at whatever size is handy.
 *
 * Everything is placed in canvas units and scaled once, so the preview on a
 * phone and a full-size render are the same drawing at different sizes
 * rather than two implementations that will disagree.
 *
 * The words are confined to the area no photo covers -- one quadrant in
 * v1's layout, computed from the template. Letting them wander outside it
 * would look right here and come out of the printer with a photograph
 * pasted over the party's name.
 */
export function ArtworkCanvas({
  template,
  artwork,
  eventDate,
  locale,
  width,
  backgroundUri,
}: {
  template: Template
  artwork: Artwork
  eventDate: string
  locale: string
  width: number
  /** A generated candidate, drawn under everything. Null for a plain paper. */
  backgroundUri?: string | null
}) {
  const scale = width / template.canvas.w
  const height = template.canvas.h * scale
  const area = artworkArea(template)
  // Every derived value comes from the shared resolver, so the preview
  // cannot decide something the renderer has not.
  const resolved = resolveArtwork(artwork, Boolean(backgroundUri))
  const palette = PALETTES[artwork.palette]
  const ink = resolved.ink
  const font = FONTS[artwork.font]

  const date = formatEventDate(eventDate, artwork.dateStyle, locale)

  // The renderer's padding, scaled. Same constant, or the preview lies.
  const pad = ARTWORK_PADDING * scale
  const boxWidth = area.w * scale - pad * 2

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: palette.paper,
        overflow: 'hidden',
      }}
    >
      {/* Under the pattern and the words, exactly where the renderer puts
          it, so what is judged here is the finished print. */}
      {backgroundUri ? (
        <Image
          source={{ uri: backgroundUri }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            // The renderer fades the picture against the paper; here the
            // paper is the view's own background, so opacity does the same.
            opacity: resolved.pictureOpacity,
          }}
          resizeMode="cover"
        />
      ) : null}

      {/* Not over a picture. The pattern is what you have instead of one,
          and drawing both is how a generated background ends up looking
          like nothing at all. */}
      {backgroundUri ? null : (
        <Decoration
          theme={artwork.theme}
          accent={palette.accent}
          width={width}
          height={height}
        />
      )}

      {/* Above the picture and below the words, as the renderer does it. */}
      {resolved.tint && resolved.tintOpacity > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            backgroundColor: resolved.tint,
            opacity: resolved.tintOpacity,
          }}
        />
      ) : null}

      <View
        style={{
          position: 'absolute',
          left: area.x * scale + pad,
          top: area.y * scale + pad,
          width: boxWidth,
          height: area.h * scale - pad * 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {artwork.title.trim() ? (
          <Text
            // Shrinks rather than wraps forever: three lines of a long name
            // in a quadrant this size is unreadable at postcard scale.
            numberOfLines={3}
            adjustsFontSizeToFit
            style={{
              color: ink,
              fontFamily: font.family,
              fontWeight: font.weight,
              fontSize: 86 * scale,
              lineHeight: 96 * scale,
              textAlign: 'center',
            }}
          >
            {artwork.title.trim()}
          </Text>
        ) : null}

        {date ? (
          <Text
            numberOfLines={1}
            style={{
              color: ink,
              opacity: 0.7,
              fontFamily: font.family,
              fontWeight: '400',
              fontSize: 34 * scale,
              marginTop: 18 * scale,
              textAlign: 'center',
            }}
          >
            {date}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * The pattern behind everything.
 *
 * Drawn across the whole canvas rather than only the free quadrant: the
 * borders around the photos are part of what is seen, and a pattern that
 * stops where the photos begin draws attention to the join.
 *
 * Kept faint. It sits under three photographs and a party's name, and the
 * moment it competes with either it has stopped being decoration.
 */
function Decoration({
  theme,
  accent,
  width,
  height,
}: {
  theme: Artwork['theme']
  accent: string
  width: number
  height: number
}) {
  if (theme === 'plain') return null

  const dots = scatter(7, 60)

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
    >
      {theme === 'stripes'
        ? Array.from({ length: 24 }, (_, i) => (
            <Rect
              key={i}
              x={((i * 2 + 0.5) / 48) * width}
              y={0}
              width={width / 48}
              height={height}
              fill={accent}
              opacity={0.18}
            />
          ))
        : null}

      {theme === 'confetti'
        ? dots.map((d, i) => (
            <Rect
              key={i}
              x={d.x * width}
              y={d.y * height}
              width={10 + d.r * 16}
              height={5 + d.r * 7}
              rx={2}
              fill={accent}
              opacity={0.2 + d.r * 0.35}
              transform={`rotate(${Math.round(d.r * 180)} ${d.x * width} ${d.y * height})`}
            />
          ))
        : null}

      {theme === 'bokeh'
        ? dots.slice(0, 28).map((d, i) => (
            <Circle
              key={i}
              cx={d.x * width}
              cy={d.y * height}
              r={10 + d.r * 46}
              fill={accent}
              opacity={0.08 + d.r * 0.12}
            />
          ))
        : null}

      {theme === 'clouds'
        ? dots.slice(0, 16).map((d, i) => (
            <Circle
              key={i}
              cx={d.x * width}
              cy={d.y * height * 0.75}
              r={26 + d.r * 60}
              fill={accent}
              opacity={0.1}
            />
          ))
        : null}

      {theme === 'constellation' ? (
        <>
          {dots.slice(0, 26).map((d, i) => {
            const nextDot = dots[i + 1]
            return nextDot && d.r > 0.45 ? (
              <Line
                key={`l${i}`}
                x1={d.x * width}
                y1={d.y * height}
                x2={nextDot.x * width}
                y2={nextDot.y * height}
                stroke={accent}
                strokeWidth={1}
                opacity={0.25}
              />
            ) : null
          })}
          {dots.slice(0, 26).map((d, i) => (
            <Circle
              key={`d${i}`}
              cx={d.x * width}
              cy={d.y * height}
              r={1.5 + d.r * 3}
              fill={accent}
              opacity={0.55}
            />
          ))}
        </>
      ) : null}
    </Svg>
  )
}
