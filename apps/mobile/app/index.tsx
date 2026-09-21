import { Redirect } from 'expo-router'
import { useSession } from '../src/session'
import { useT } from '../src/locale'
import { Body, Button, Heading, Notice, Screen, Spinner } from '../src/ui'

/** Decides where someone lands. */
export default function Index() {
  const { user, loading, offline, retry } = useSession()
  const t = useT()

  if (loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    )
  }

  // Offline is not signed out. Sending someone to sign in here would throw
  // away a session that is still valid, just because the server was briefly
  // unreachable.
  if (offline) {
    return (
      <Screen>
        <Heading>{t('app.name')}</Heading>
        <Notice tone="bad">{offline}</Notice>
        <Body muted>{t('common.offlineHint')}</Body>
        <Button label={t('common.retry')} onPress={retry} />
      </Screen>
    )
  }

  return <Redirect href={user ? '/(tabs)' : '/sign-in'} />
}
