import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SessionProvider } from '../src/session'
import { ThemeProvider, useTheme } from '../src/theme'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </ThemeProvider>
  )
}

/** Split out so it sits inside the providers and can read the theme. */
function Navigator() {
  const theme = useTheme()

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
        <Stack.Screen name="index" options={{ title: 'Photo Booth' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="events/index" options={{ title: 'Your parties' }} />
        <Stack.Screen name="events/new" options={{ title: 'New party' }} />
        <Stack.Screen name="events/[id]" options={{ title: 'Party' }} />
        <Stack.Screen name="booth" options={{ title: 'Booth' }} />
        <Stack.Screen name="spike" options={{ title: 'Camera check' }} />
      </Stack>
    </>
  )
}
