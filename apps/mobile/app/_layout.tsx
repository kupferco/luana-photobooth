import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#111' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Photo Booth' }} />
        <Stack.Screen name="spike" options={{ title: 'Camera check' }} />
      </Stack>
    </>
  )
}
