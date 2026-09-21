import { router } from 'expo-router'
import { Body, Button, Heading, Notice, Screen } from '../src/ui'

/**
 * Booth mode. Not built yet -- this is the one screen deliberately not being
 * designed against fixtures, because what could be wrong about it lives in
 * real camera timing and real uploads, which fixtures cannot reproduce.
 */
export default function Booth() {
  return (
    <Screen>
      <Heading>Booth mode</Heading>
      <Notice tone="warn">Not built yet.</Notice>
      <Body muted>
        This is where the countdown, the shots and the montage will live. It is
        being built against the real API rather than fixtures, since the risk
        is in timing and uploads, not layout.
      </Body>
      <Button label="Camera check" onPress={() => router.push('/spike')} />
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  )
}
