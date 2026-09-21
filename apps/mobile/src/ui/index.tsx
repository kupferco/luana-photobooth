import type { Theme } from '@dk/ui-tokens'
import { useMemo, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
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

  if (!scroll) return <View style={s.screen}>{children}</View>

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
    screenContent: { padding: t.space[5], paddingBottom: t.space[10], gap: t.space[4] },
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
