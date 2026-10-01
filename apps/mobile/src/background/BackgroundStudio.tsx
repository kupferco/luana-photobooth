import { CLASSIC_3UP, artworkArea, type Template } from '@photobooth/shared'
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useLocale, useT } from '../locale'
import { useTheme } from '../theme'
import type { Background, Layout } from '../api/types'
import { Body, Button, Chip, Field, Label, Notice, Slider } from '../ui'
import { ColourPicker } from '../ui/ColourPicker'
import { tidy } from './tidy'
import { useState } from 'react'
import { ArtworkCanvas } from './ArtworkCanvas'
import { PhotoSlots } from './PhotoSlots'
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
/*
 * Three, not four.
 *
 * "Rounded" had no equivalent the renderer could name: a phone has Avenir
 * and a Debian container does not, so it would have previewed as one thing
 * and printed as another. A lettering choice that lies is worse than one
 * fewer choice. A real rounded face can come back when there is a font file
 * shipped to both sides.
 */
const FONT_NAMES: FontName[] = ['sans', 'serif', 'mono']
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
  layouts,
  templateId,
  onTemplateChange,
  eventDate,
  artwork,
  published,
  layoutChanged,
  live,
  publishing,
  onGenerate,
  candidateUrl,
  generating,
  generated,
  generationNote,
  onClearCandidate,
  backgrounds,
  onPickBackground,
  onChange,
  onPublish,
  onClose,
}: {
  visible: boolean
  /** Every layout the account can choose. Empty while they load. */
  layouts: Layout[]
  /** The layout being previewed, which is part of the draft. */
  templateId: string | null
  onTemplateChange: (id: string) => void
  eventDate: string
  /** The draft being edited. Owned by the screen, so closing keeps it. */
  artwork: Artwork
  /** What the party is actually using. Null until something is published. */
  published: Artwork | null
  /** True when the chosen layout differs from the one the party is on. */
  layoutChanged: boolean
  /** A running party prints with this the moment it is published. */
  live: boolean
  /** Rendering happens on the server and takes a moment. */
  publishing: boolean
  /** Asks the server for a candidate. Rejects with a message worth showing. */
  onGenerate: (prompt: string) => Promise<void>
  /** The candidate being previewed, if one has been made. */
  candidateUrl: string | null
  generating: boolean
  /** How many of this party's allowance is gone. */
  generated: { used: number; cap: number } | null
  generationNote: string | null
  onClearCandidate: () => void
  /** Everything this party has been offered. Newest first. */
  backgrounds: Background[]
  onPickBackground: (background: Background | null) => void
  onChange: (artwork: Artwork) => void
  onPublish: () => void
  onClose: () => void
}) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  /*
   * The layout is part of the draft, not a setting changed on the side.
   *
   * It decides how much room the words get -- a quarter of the print or
   * most of it -- so changing it is a design decision, and it lands on
   * prints exactly the way the background does. Same rule: nothing until
   * the button.
   */
  const [enlarged, setEnlarged] = useState(false)

  const chosen = layouts.find((l) => l.id === templateId) ?? layouts[0]
  const template = chosen?.template ?? CLASSIC_3UP
  const { width: screenWidth, height: windowHeight } = useWindowDimensions()

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
    layoutChanged ||
    JSON.stringify(artwork) !== JSON.stringify(published ?? DEFAULT_ARTWORK)

  /*
   * Sized by the window's height as well as its width.
   *
   * The print is 3:2 landscape, so width alone decides how tall this is --
   * and on a short window a 420pt preview leaves the controls a slot to
   * peer through. A third of the height is the most it may take.
   */
  const previewWidth = Math.min(
    screenWidth - 72,
    420,
    (windowHeight / 3) * (template.canvas.w / template.canvas.h),
  )
  const area = artworkArea(template)

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
            // Nothing should be drawn outside the sheet's rounded corners.
            overflow: 'hidden',
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

          {/*
            * Pinned, not scrolled with the controls.
            *
            * Everything below changes what this shows, and a preview that
            * slides off the top the moment somebody reaches the pattern
            * chips makes them pick blind and scroll back to check. It is
            * the whole reason the sheet exists, so it keeps its place.
            */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => setEnlarged(true)}
                accessibilityRole="button"
                accessibilityLabel={t('artwork.enlarge')}
                style={{
                  borderRadius: theme.radius.md,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: theme.color.border.subtle,
                }}
              >
                <Preview
                  template={template}
                  artwork={artwork}
                  backgroundUri={candidateUrl}
                  eventDate={eventDate}
                  locale={locale}
                  width={previewWidth}
                />
              </Pressable>

              <Body muted>
                {t('artwork.areaHint', {
                  w: String(area.w),
                  h: String(area.h),
                })}
              </Body>
            </View>

          <ScrollView
            /*
             * Shrinkable, or it overflows the sheet instead of scrolling.
             *
             * A ScrollView with no height of its own grows to fit its
             * content. The sheet is capped at 92% of the window, so the
             * overflow ran out under the pinned preview and the first rows
             * of controls were drawn behind it.
             */
            style={{ flexShrink: 1 }}
            contentContainerStyle={{
              paddingHorizontal: theme.space[4],
              paddingBottom: theme.space[10],
              gap: theme.space[5],
            }}
          >
            {layouts.length > 1 ? (
              <Group label={t('artwork.layout')}>
                {layouts.map((layout) => (
                  <Chip
                    key={layout.id}
                    label={layout.name}
                    selected={layout.id === chosen?.id}
                    onPress={() => onTemplateChange(layout.id)}
                  />
                ))}
              </Group>
            ) : null}

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

            {/* Hidden rather than disabled: a row of dead chips invites
                pressing them to find out why. */}
            {candidateUrl ? (
              <Body muted>{t('artwork.patternReplaced')}</Body>
            ) : (
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
            )}

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

            <ColourPicker
              label={t('artwork.textColour')}
              value={artwork.ink}
              onChange={(hex) => set('ink', hex)}
              onClear={() => set('ink', null)}
              clearLabel={t('artwork.colourDefault')}
              brightnessLabel={t('artwork.brightness')}
            />

            {candidateUrl ? (
              <View style={{ gap: 6 }}>
                <ColourPicker
                  label={t('artwork.wash')}
                  value={artwork.tint}
                  onChange={(hex) => set('tint', hex)}
                  onClear={() => set('tint', null)}
                  clearLabel={t('artwork.colourDefault')}
                  brightnessLabel={t('artwork.brightness')}
                />
              {artwork.tint ? (
                <>
                  <Label>
                    {t('artwork.washStrength', {
                      percent: String(artwork.tintOpacity),
                    })}
                  </Label>
                  <Slider
                    value={artwork.tintOpacity}
                    onChange={(v) => set('tintOpacity', v)}
                  />
                </>
                ) : null}
              </View>
            ) : null}

            {/* Our taste, as a button rather than as a rule. */}
            <View style={{ gap: theme.space[2] }}>
              <Button
                label={t('artwork.tidy')}
                variant="secondary"
                onPress={() =>
                  onChange(
                    tidy(
                      artwork,
                      backgrounds.find((b) => b.url === candidateUrl) ?? null,
                    ),
                  )
                }
              />
              <Body muted>{t('artwork.tidyHint')}</Body>
            </View>

            {/*
              * Generated artwork.
              *
              * A candidate is only ever looked at until the artwork is
              * published: the preview above draws the words over it, so what
              * is judged is the finished print rather than the picture.
              */}
            <View style={{ gap: theme.space[2] }}>
              <Field
                label={t('artwork.describe')}
                value={artwork.prompt}
                onChangeText={(v) => set('prompt', v)}
                placeholder={t('artwork.describePlaceholder')}
                multiline
              />
              <Button
                label={t('artwork.generate')}
                variant="secondary"
                busy={generating}
                disabled={generating || artwork.prompt.trim().length < 3}
                onPress={() => void onGenerate(artwork.prompt)}
              />

              {/*
                * Everything this party has been offered, kept.
                *
                * Generated pictures used to be thrown away after a day,
                * which is fine until somebody wants the third one back --
                * and wanting the third one back is most of how choosing
                * works. A megabyte each is nothing beside the photographs.
                */}
              {backgrounds.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {backgrounds.map((background) => {
                    const chosen = candidateUrl === background.url
                    return (
                      <Pressable
                        key={background.id}
                        onPress={() => onPickBackground(chosen ? null : background)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: chosen }}
                        style={{
                          width: 96,
                          height: 64,
                          borderRadius: theme.radius.sm,
                          overflow: 'hidden',
                          borderWidth: chosen ? 3 : 1,
                          borderColor: chosen
                            ? theme.color.action.bg
                            : theme.color.border.strong,
                        }}
                      >
                        <Image
                          source={{ uri: background.url }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    )
                  })}
                </ScrollView>
              ) : null}

              {candidateUrl ? (
                <View style={{ gap: 6, paddingTop: 4 }}>
                  <Label>
                    {t('artwork.fade', { percent: String(artwork.backgroundOpacity) })}
                  </Label>
                  <Slider
                    value={artwork.backgroundOpacity}
                    onChange={(v) => set('backgroundOpacity', v)}
                  />
                </View>
              ) : null}

              {generationNote ? (
                <Notice tone="warn">{generationNote}</Notice>
              ) : null}

              {/* Said plainly, because each one costs the account money. */}
              {generated ? (
                <Body muted>
                  {t('artwork.generationsUsed', {
                    used: String(generated.used),
                    cap: String(generated.cap),
                  })}
                </Body>
              ) : null}
            </View>

            {/* Loud about it while a party is running, because it is the
                one moment this button changes something in somebody's
                hand rather than on a screen. */}
            {live && dirty ? (
              <Notice tone="warn">{t('artwork.liveWarning')}</Notice>
            ) : null}

            <Button
              label={t(live ? 'artwork.publishLive' : 'artwork.publish')}
              disabled={!dirty || publishing}
              busy={publishing}
              onPress={onPublish}
            />

            <Body muted>
              {dirty ? t('artwork.draftKept') : t('artwork.noChanges')}
            </Body>
          </ScrollView>
        </View>
      </View>
      {/* The print, big. Tapping anywhere closes it: there is nothing to do
          here but look. */}
      <Modal visible={enlarged} transparent animationType="fade">
        <Pressable
          onPress={() => setEnlarged(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Preview
            template={template}
            artwork={artwork}
            backgroundUri={candidateUrl}
            eventDate={eventDate}
            locale={locale}
            width={Math.min(
              screenWidth - 32,
              (windowHeight - 120) * (template.canvas.w / template.canvas.h),
            )}
          />
        </Pressable>
      </Modal>
    </Modal>
  )
}

/**
 * The whole print: the artwork, with the photographs' places drawn over it.
 *
 * One component rather than the same drawing written out twice. It was
 * written out twice, and the copy without the photo slots was the enlarged
 * view -- so the one place built for looking closely was the only place that
 * hid what covers most of the paper. Anything judged there was judged
 * against a print that does not exist.
 */
function Preview({
  template,
  artwork,
  backgroundUri,
  eventDate,
  locale,
  width,
}: {
  template: Template
  artwork: Artwork
  backgroundUri?: string | null
  eventDate: string
  locale: string
  width: number
}) {
  const scale = width / template.canvas.w

  return (
    <View style={{ width, height: template.canvas.h * scale, overflow: 'hidden' }}>
      <ArtworkCanvas
        template={template}
        artwork={artwork}
        backgroundUri={backgroundUri}
        eventDate={eventDate}
        locale={locale}
        width={width}
      />

      {/* Greyed rather than hidden: the space left over is the whole
          design problem. */}
      <PhotoSlots template={template} />
    </View>
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
