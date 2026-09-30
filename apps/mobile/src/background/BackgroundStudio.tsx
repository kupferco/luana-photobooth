import { artworkArea, type Template } from '@photobooth/shared'
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useLocale, useT } from '../locale'
import { useTheme } from '../theme'
import { Body, Button, Chip, Field, Label, Notice } from '../ui'
import { ArtworkCanvas } from './ArtworkCanvas'
import {
  DEFAULT_ARTWORK,
  FONTS,
  PALETTES,
  type Artwork,
  type DateStyle,
  type FontName,
  type PaletteName,
  type ThemeName,
} from './artwork'

const DATE_STYLES: DateStyle[] = ['long', 'short', 'monthYear', 'none']
const FONT_NAMES: FontName[] = ['sans', 'serif', 'rounded', 'mono']
const THEMES: ThemeName[] = [
  'plain',
  'confetti',
  'constellation',
  'clouds',
  'stripes',
  'bokeh',
]
const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]

/**
 * Making the artwork for a party, instead of finding a picture of it.
 *
 * Most people setting up a booth have no artwork and no way to make any,
 * and "upload a background" quietly asks them to go and design one
 * somewhere else. This asks for the party's name instead.
 *
 * The preview shows the photographs on top, greyed, because the design area
 * is one quadrant of a postcard and everything outside it is covered. An
 * editor that hid that would let somebody centre their party's name and
 * find a photograph pasted over it when the first print came out.
 *
 * Nothing here is saved yet. It draws what would be made, which is the part
 * worth looking at before anything is wired to a renderer or a generator.
 */
export function BackgroundStudio({
  visible,
  template,
  eventDate,
  artwork,
  published,
  live,
  onChange,
  onPublish,
  onClose,
}: {
  visible: boolean
  template: Template
  eventDate: string
  /** The draft being edited. Owned by the screen, so closing keeps it. */
  artwork: Artwork
  /** What the party is actually using. Null until something is published. */
  published: Artwork | null
  /** A running party prints with this the moment it is published. */
  live: boolean
  onChange: (artwork: Artwork) => void
  onPublish: () => void
  onClose: () => void
}) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()
  const { width: screenWidth } = useWindowDimensions()

  const set = <K extends keyof Artwork>(key: K, value: Artwork[K]) =>
    onChange({ ...artwork, [key]: value })

  /*
   * Publishing is a separate act from editing, and not for tidiness.
   *
   * The composer reads the background afresh for every montage, so whatever
   * is published is on the next guest's print. Saving as somebody types
   * hands somebody a photograph captioned "Jill's 50th Birth".
   */
  const dirty =
    JSON.stringify(artwork) !== JSON.stringify(published ?? DEFAULT_ARTWORK)

  const previewWidth = Math.min(screenWidth - 72, 420)
  const area = artworkArea(template)
  const scale = previewWidth / template.canvas.w

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      // Announced as a sheet rather than a page, so a screen reader does not
      // read the screen behind it.
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        {/* Tapping the dimmed area behind the sheet closes it, which is what
            everyone tries first. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" />

        <View
          style={{
            backgroundColor: theme.color.surface.base,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            maxHeight: '92%',
            // The column the rest of the app sits in, so a desktop window
            // does not get a sheet the width of a monitor.
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.color.border.strong,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: theme.space[4],
            }}
          >
            <Label>{t('artwork.title')}</Label>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: theme.color.text.secondary, fontSize: theme.fontSize.md }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: theme.space[4],
              paddingBottom: theme.space[10],
              gap: theme.space[5],
            }}
          >
            {/* The print, as it would come out. */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  borderRadius: theme.radius.md,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: theme.color.border.subtle,
                }}
              >
                <ArtworkCanvas
                  template={template}
                  artwork={artwork}
                  eventDate={eventDate}
                  locale={locale}
                  width={previewWidth}
                />

                {/* Where the photographs land. Greyed rather than hidden:
                    the space left over is the whole design problem. */}
                {template.cells.map((cell, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: cell.x * scale,
                      top: cell.y * scale,
                      width: cell.w * scale,
                      height: cell.h * scale,
                      backgroundColor: 'rgba(24,24,27,0.82)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.65)',
                        fontSize: theme.fontSize.xs,
                      }}
                    >
                      {t('artwork.photoSlot', { n: String(i + 1) })}
                    </Text>
                  </View>
                ))}
              </View>

              <Body muted>
                {t('artwork.areaHint', {
                  w: String(area.w),
                  h: String(area.h),
                })}
              </Body>
            </View>

            <Field
              label={t('artwork.words')}
              value={artwork.title}
              onChangeText={(v) => set('title', v)}
              placeholder={t('artwork.wordsPlaceholder')}
              maxLength={40}
            />

            <Group label={t('artwork.date')}>
              {DATE_STYLES.map((style) => (
                <Chip
                  key={style}
                  label={t(`artwork.dateStyle.${style}`)}
                  selected={artwork.dateStyle === style}
                  onPress={() => set('dateStyle', style)}
                />
              ))}
            </Group>

            <Group label={t('artwork.font')}>
              {FONT_NAMES.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => set('font', name)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: artwork.font === name }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: theme.radius.md,
                    backgroundColor:
                      artwork.font === name
                        ? theme.color.action.bg
                        : theme.color.actionSecondary.bg,
                    borderWidth: 1,
                    borderColor:
                      artwork.font === name
                        ? 'transparent'
                        : theme.color.actionSecondary.border,
                  }}
                >
                  {/* Set in the face it chooses, because the name of a
                      typeface tells nobody anything. */}
                  <Text
                    style={{
                      fontFamily: FONTS[name].family,
                      fontWeight: FONTS[name].weight,
                      fontSize: theme.fontSize.md,
                      color:
                        artwork.font === name
                          ? theme.color.action.fg
                          : theme.color.text.primary,
                    }}
                  >
                    {t('artwork.fontSample')}
                  </Text>
                </Pressable>
              ))}
            </Group>

            <Group label={t('artwork.look')}>
              {THEMES.map((name) => (
                <Chip
                  key={name}
                  label={t(`artwork.theme.${name}`)}
                  selected={artwork.theme === name}
                  onPress={() => set('theme', name)}
                />
              ))}
            </Group>

            <Group label={t('artwork.colours')}>
              {PALETTE_NAMES.map((name) => {
                const palette = PALETTES[name]
                const selected = artwork.palette === name
                return (
                  <Pressable
                    key={name}
                    onPress={() => set('palette', name)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t(`artwork.palette.${name}`)}
                    accessibilityState={{ selected }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: palette.paper,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected
                        ? theme.color.action.bg
                        : theme.color.border.strong,
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: palette.accent,
                      }}
                    />
                  </Pressable>
                )
              })}
            </Group>

            {/*
              * Generated artwork.
              *
              * Present and not wired. It is left visible because the shape
              * of the screen depends on it -- a prompt box added later is a
              * redesign, not an addition -- and disabled because pretending
              * would be worse than admitting.
              */}
            <View style={{ gap: theme.space[2] }}>
              <Field
                label={t('artwork.describe')}
                value={artwork.prompt}
                onChangeText={(v) => set('prompt', v)}
                placeholder={t('artwork.describePlaceholder')}
                editable={false}
              />
              <Button label={t('artwork.generate')} variant="secondary" disabled onPress={() => {}} />
              <Body muted>{t('artwork.generateSoon')}</Body>
            </View>

            {/* Loud about it while a party is running, because it is the
                one moment this button changes something in somebody's
                hand rather than on a screen. */}
            {live && dirty ? (
              <Notice tone="warn">{t('artwork.liveWarning')}</Notice>
            ) : null}

            <Button
              label={t(live ? 'artwork.publishLive' : 'artwork.publish')}
              disabled={!dirty}
              onPress={onPublish}
            />

            <Body muted>
              {dirty ? t('artwork.draftKept') : t('artwork.noChanges')}
            </Body>
            <Body muted>{t('artwork.notWired')}</Body>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

/** A labelled row of choices that wraps. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  )
}
