import Constants from 'expo-constants'
import { Text, View } from 'react-native'
import { useLocale, useT } from '../locale'
import { useTheme } from '../theme'

/**
 * Which build this actually is.
 *
 * "I deployed it" and "the phone is running it" are different claims, and
 * for a while the only way to tell them apart was to fetch the bundle and
 * grep a minified file for a string that should have gone. A booth added to
 * the home screen can sit on a cached shell for days while the server
 * serves something newer, so a fix can be live and absent at the same time
 * and both parties are certain they are right.
 *
 * Deliberately plain and at the bottom: this is for the one conversation
 * where somebody needs to read a number back, not something to decorate.
 *
 * Everything comes from the build itself. EXPO_PUBLIC_* are substituted at
 * bundle time, so they describe the bundle being run rather than anything
 * the running app could get wrong.
 */
export function BuildInfo() {
  const theme = useTheme()
  const t = useT()
  const { locale } = useLocale()

  const version = Constants.expoConfig?.version ?? '—'
  const commit = process.env.EXPO_PUBLIC_COMMIT ?? null
  const built = process.env.EXPO_PUBLIC_BUILD_TIME ?? null
  const env = process.env.EXPO_PUBLIC_ENV ?? null

  /*
   * Shown in the reader's own timezone, because the question behind it is
   * "is this older than the fix?" and that is answered against the clock
   * they are looking at. Stamped as UTC so the conversion is unambiguous.
   */
  const when = built ? new Date(built) : null
  const builtLabel =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString(locale, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  // A local build has no stamp. Saying so is more use than an em dash.
  const line = [
    `v${version}`,
    commit,
    builtLabel,
    // Only when it is not production: on the booth at a party, knowing you
    // are pointed at staging is the whole message.
    env && env !== 'prod' ? env : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={{ paddingTop: theme.space[6], paddingBottom: theme.space[4] }}>
      <Text
        // Selectable so it can be pasted into a message rather than
        // transcribed from a photograph of a screen.
        selectable
        style={{
          color: theme.color.text.secondary,
          fontSize: theme.fontSize.xs,
          textAlign: 'center',
        }}
      >
        {built ? line : t('profile.buildLocal', { version: String(version) })}
      </Text>
    </View>
  )
}
