import { router } from 'expo-router'
import { useT } from '../src/locale'
import { Body, Button, Heading, Notice, Screen } from '../src/ui'

/**
 * Booth mode. Not built yet -- this is the one screen deliberately not being
 * designed against fixtures, because what could be wrong about it lives in
 * real camera timing and real uploads, which fixtures cannot reproduce.
 */
export default function Booth() {
  const t = useT()
  return (
    <Screen>
      <Heading>{t('booth.title')}</Heading>
      <Notice tone="warn">{t('booth.notBuilt')}</Notice>
<Body muted>{t('booth.notBuiltHint')}</Body>
      <Button label={t('booth.cameraCheck')} onPress={() => router.push('/spike')} />
      <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  )
}
