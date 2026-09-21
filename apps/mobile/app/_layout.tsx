import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { LocaleProvider } from '../src/locale'
import { SessionProvider } from '../src/session'
import { ThemeProvider, useTheme } from '../src/theme'
import { useT } from '../src/locale'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider>
          <Navigator />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}

/** Split out so it sits inside the providers and can read the theme. */
function Navigator() {
  const theme = useTheme()
  const t = useT()

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.surface.raised },
          headerTintColor: theme.color.text.primary,
          contentStyle: { backgroundColor: theme.color.surface.base },
        }}
      >
        <Stack.Screen name="index" options={{ title: t('app.name') }} />
        <Stack.Screen name="sign-in" options={{ title: t('auth.signIn') }} />
        <Stack.Screen name="events/index" options={{ title: t('events.title') }} />
        <Stack.Screen name="events/new" options={{ title: t('events.new') }} />
        {/* The event's own name is the title, set by the screen itself. */}
        <Stack.Screen name="events/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
        <Stack.Screen name="booth" options={{ title: t('booth.title') }} />
        <Stack.Screen name="spike" options={{ title: t('booth.cameraCheck') }} />
      </Stack>
    </>
  )
}
