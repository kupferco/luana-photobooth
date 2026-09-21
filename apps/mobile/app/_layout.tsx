import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActiveEventProvider } from '../src/event-context'
import { LocaleProvider, useT } from '../src/locale'
import { SessionProvider } from '../src/session'
import { ThemeProvider, useAppearance, useTheme } from '../src/theme'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider>
          <ActiveEventProvider>
            <Navigator />
          </ActiveEventProvider>
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}

/** Split out so it sits inside the providers and can read theme and copy. */
function Navigator() {
  const theme = useTheme()
  const { resolved } = useAppearance()
  const t = useT()

  return (
    <>
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.surface.raised },
          headerTintColor: theme.color.text.primary,
          contentStyle: { backgroundColor: theme.color.surface.base },
        }}
      >
        {/* The tab bar draws its own headers. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: t('auth.signIn') }} />
        <Stack.Screen name="events/new" options={{ title: t('events.new') }} />
        {/* Outside the tabs on purpose: booth mode needs the whole screen,
            and a tab bar under it is something to catch mid-countdown. */}
        <Stack.Screen name="booth" options={{ headerShown: false }} />
        <Stack.Screen name="spike" options={{ title: t('booth.cameraCheck') }} />
      </Stack>
    </>
  )
}
