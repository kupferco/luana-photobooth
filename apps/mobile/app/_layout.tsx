import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ThemeProvider, useTheme } from '../src/theme'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  )
}

/** Split out so it sits inside the provider and can read the theme. */
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
        <Stack.Screen name="spike" options={{ title: 'Camera check' }} />
      </Stack>
    </>
  )
}
