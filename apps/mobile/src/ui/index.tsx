import type { Theme } from '@dk/ui-tokens'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useT } from '../locale'
import { useTheme, weight } from '../theme'

/**
 * The handful of primitives these screens actually need, built on the tokens
 * rather than a component library.
 *
 * Radix was the obvious candidate and cannot be used: it is React DOM only,
 * with no React Native build, so it could not run in this app at all.
 */

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode
  scroll?: boolean
}) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])

  if (!scroll) {
    return (
      <View style={s.screen}>
        <View style={[s.screenContent, { flex: 1, padding: 0 }]}>{children}</View>
      </View>
    )
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent}>
      {children}
    </ScrollView>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return <Text style={s.heading}>{children}</Text>
}

export function Body({
  children,
  muted,
}: {
  children: ReactNode
  muted?: boolean
}) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return <Text style={muted ? s.bodyMuted : s.body}>{children}</Text>
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return <Text style={s.label}>{children}</Text>
}

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: ViewStyle
}) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return <View style={[s.card, style]}>{children}</View>
}

/**
 * A card that can be folded away.
 *
 * The event screen accumulated a card per thing the owner might want to do
 * -- setup, artwork, the guest link, who else can help -- and during a party
 * none of them are what you are looking at. Folded, the screen is a list of
 * headings and the photos underneath; opened, it is the one thing you came
 * for.
 *
 * The open state is the caller's, not this component's. Which cards start
 * open depends on the event, and only the screen knows that.
 */
export function CollapsibleCard({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const t = useTheme()
  const tr = useT()

  return (
    <Card>
      <Pressable
        onPress={onToggle}
        // The whole header is the target, not just the word: it is a small
        // word, and this is pressed at a party.
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Label>{label}</Label>
        <Text style={{ color: t.color.text.secondary, fontSize: t.fontSize.sm }}>
          {open ? tr('common.hide') : tr('common.show')}
        </Text>
      </Pressable>

      {open ? children : null}
    </Card>
  )
}

/**
 * A small, round, one-tap choice.
 *
 * For picking from a handful of things that fit on a line -- a year, a
 * typeface, a colour. Not for a list: a screen of chips is a menu that has
 * lost its structure.
 */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: selected
          ? t.color.action.bg
          : t.color.actionSecondary.bg,
        borderWidth: 1,
        borderColor: selected ? 'transparent' : t.color.actionSecondary.border,
      }}
    >
      <Text
        style={{
          color: selected ? t.color.action.fg : t.color.text.primary,
          fontSize: t.fontSize.sm,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * One choice in a short list of them, with its consequence written on it.
 *
 * For settings where the options are not self-describing. A row of equal
 * buttons works for Retakes, because "Off / 1 / 2" answers the question in
 * the heading. It failed badly for the booth lock, which offered "Allow"
 * and "Lock" -- two verbs with no object, under a heading that did not
 * supply one either, so the only way to find out what either did was to
 * press one and go and look at the booth.
 *
 * Stacked rather than side by side: a consequence needs a line of text, and
 * two lines of text side by side on a phone is four words per line.
 */
export function Choice({
  title,
  description,
  selected,
  onPress,
}: {
  title: string
  description: string
  selected: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${description}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: selected ? t.color.surface.sunken : 'transparent',
        // Two, so the row does not change size when it is chosen.
        borderWidth: 2,
        borderColor: selected ? t.color.action.bg : t.color.border.subtle,
      }}
    >
      {/* A filled dot rather than a tick: this is one of several, not a
          box that is on or off. */}
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          marginTop: 2,
          borderWidth: 2,
          borderColor: selected ? t.color.action.bg : t.color.border.strong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: t.color.action.bg,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: t.color.text.primary,
            fontSize: t.fontSize.md,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: t.color.text.secondary,
            fontSize: t.fontSize.sm,
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * A value between 0 and 100, dragged.
 *
 * Hand-rolled rather than a dependency: the one control needed here is a
 * horizontal track, and @react-native-community/slider is a native module
 * to install, link and ship on three platforms for that.
 *
 * Responds to a tap as well as a drag, because on a narrow sheet the track
 * is short and people aim at a position rather than pick up the handle.
 */
export function Slider({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const t = useTheme()
  const [width, setWidth] = useState(0)

  /*
   * The handlers read the latest callback through a ref.
   *
   * The first version memoised the PanResponder on the measured width,
   * and its handlers closed over `onChange` -- which is a new arrow every
   * render. So it kept calling the one captured when the track was first
   * measured, and that closure held the artwork as it was at mount. Every
   * drag wrote a whole stale object back, which is why moving the wash's
   * brightness reset its strength to 30: not a reset, a resurrection.
   *
   * A ref rather than wider deps because a PanResponder rebuilt mid-drag
   * loses the gesture.
   */
  const latest = useRef({ width, onChange })
  latest.current = { width, onChange }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => emit(e.nativeEvent.locationX),
        onPanResponderMove: (e) => emit(e.nativeEvent.locationX),
      }),
    [],
  )

  function emit(x: number) {
    const { width: w, onChange: fire } = latest.current
    if (w <= 0) return
    fire(Math.round(Math.max(0, Math.min(1, x / w)) * 100))
  }

  return (
    <View
      {...responder.panHandlers}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      // Generous vertical padding: the track is 6pt and a thumb is not.
      style={{ paddingVertical: 12, justifyContent: 'center' }}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: value }}
    >
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: t.color.actionSecondary.bg,
        }}
      >
        <View
          style={{
            width: `${value}%`,
            height: 6,
            borderRadius: 3,
            backgroundColor: t.color.action.bg,
          }}
        />
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${value}%`,
          marginLeft: -11,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: t.color.action.bg,
          borderWidth: 2,
          borderColor: t.color.surface.base,
        }}
      />
    </View>
  )
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  busy?: boolean
}) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])

  const bg =
    variant === 'primary'
      ? t.color.action.bg
      : variant === 'danger'
        ? t.color.danger.bg
        : t.color.actionSecondary.bg
  const fg =
    variant === 'primary'
      ? t.color.action.fg
      : variant === 'danger'
        ? t.color.danger.fg
        : t.color.actionSecondary.fg

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: disabled || busy ? 0.4 : pressed ? 0.85 : 1 },
        variant === 'secondary' && {
          borderWidth: 1,
          borderColor: t.color.actionSecondary.border,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[s.buttonLabel, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  )
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput
        {...props}
        placeholderTextColor={t.color.text.disabled}
        style={[s.input, props.style]}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  )
}

/**
 * Notices, including the retention line. `tone` maps onto the theme's status
 * roles rather than picking colours, so a rebrand carries it along.
 */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'good' | 'warn' | 'bad'
}) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])

  const accent =
    tone === 'good'
      ? t.color.status.good
      : tone === 'warn'
        ? t.color.status.poor
        : tone === 'bad'
          ? t.color.status.bad
          : t.color.border.strong

  return (
    <View style={[s.notice, { borderLeftColor: accent }]}>
      <Text style={s.noticeText}>{children}</Text>
    </View>
  )
}

export function Row({ children }: { children: ReactNode }) {
  const t = useTheme()
  const s = useMemo(() => makeStyles(t), [t])
  return <View style={s.row}>{children}</View>
}

export function Spinner() {
  const t = useTheme()
  return <ActivityIndicator color={t.color.text.secondary} />
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.color.surface.base },
    screenContent: {
      padding: t.space[5],
      paddingBottom: t.space[10],
      gap: t.space[4],
      /*
       * A column on a desktop window.
       *
       * The tab screens are already inside one, so this changes nothing
       * there. It is for the screens that sit outside the tabs -- signing
       * in, creating an event, and the booth's own setup states -- which
       * would otherwise stretch a short form across a whole monitor.
       *
       * Matches MAX_WIDTH in the tabs layout. They are the same column.
       */
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    heading: {
      color: t.color.text.primary,
      fontSize: t.fontSize['2xl'],
      fontWeight: weight(t.fontWeight.bold),
    },
    body: { color: t.color.text.primary, fontSize: t.fontSize.md, lineHeight: 22 },
    bodyMuted: { color: t.color.text.secondary, fontSize: t.fontSize.sm, lineHeight: 20 },
    label: {
      color: t.color.text.secondary,
      fontSize: t.fontSize.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    card: {
      backgroundColor: t.color.surface.raised,
      borderRadius: t.radius.lg,
      padding: t.space[4],
      gap: t.space[3],
      borderWidth: 1,
      borderColor: t.color.border.subtle,
    },
    button: {
      paddingVertical: t.space[4],
      paddingHorizontal: t.space[5],
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      // Tapped by someone holding a drink, at arm's length.
      minHeight: 52,
    },
    buttonLabel: { fontSize: t.fontSize.md, fontWeight: weight(t.fontWeight.semibold) },
    field: { gap: t.space[2] },
    input: {
      backgroundColor: t.color.surface.sunken,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
      borderRadius: t.radius.md,
      paddingVertical: t.space[4],
      paddingHorizontal: t.space[4],
      color: t.color.text.primary,
      fontSize: t.fontSize.lg,
      minHeight: 52,
    },
    hint: { color: t.color.text.secondary, fontSize: t.fontSize.xs },
    notice: {
      backgroundColor: t.color.surface.sunken,
      borderLeftWidth: 3,
      borderRadius: t.radius.sm,
      paddingVertical: t.space[3],
      paddingHorizontal: t.space[4],
    },
    noticeText: { color: t.color.text.secondary, fontSize: t.fontSize.sm, lineHeight: 20 },
    row: { flexDirection: 'row', gap: t.space[3], alignItems: 'center' },
  })
