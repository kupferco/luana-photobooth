import { Redirect } from 'expo-router'
import { useSession } from '../src/session'
import { Screen, Spinner } from '../src/ui'

/** Decides where someone lands. */
export default function Index() {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    )
  }

  return <Redirect href={user ? '/(tabs)' : '/sign-in'} />
}
