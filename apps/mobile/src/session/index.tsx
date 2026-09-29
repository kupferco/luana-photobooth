import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type User } from '../api'

/**
 * Who is signed in, and which tenant their work belongs to.
 *
 * A user can belong to several tenants, so the screens need one chosen. With
 * one membership it is picked automatically; a tenant switcher can come later
 * without the screens changing, because they only ever read `tenantId`.
 */

interface SessionState {
  user: User | null
  tenantId: string | null
  loading: boolean
  /**
   * Set when the server could not be reached at all. Deliberately separate
   * from `user === null`: being offline is not being signed out, and showing
   * someone a sign-in screen because their wifi dropped would lose a session
   * that is still perfectly valid.
   */
  offline: string | null
  retry(): void
  signIn(user: User): void
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void api
      .me()
      .then((result) => {
        if (cancelled) return
        setUser(result?.user ?? null)
        setOffline(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // The stored token is left alone: it is very likely still good, and
        // the server simply is not answering.
        setOffline(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const value = useMemo<SessionState>(
    () => ({
      user,
      tenantId: user?.memberships[0]?.tenantId ?? null,
      loading,
      offline,
      retry,
      signIn: setUser,
      signOut,
    }),
    [user, loading, offline, retry, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a SessionProvider.')
  return value
}
