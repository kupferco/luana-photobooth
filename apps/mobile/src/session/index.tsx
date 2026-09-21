import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  signIn(user: User): void
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void api
      .me()
      .then((result) => {
        if (!cancelled) setUser(result?.user ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  const value = useMemo<SessionState>(
    () => ({
      user,
      tenantId: user?.memberships[0]?.tenantId ?? null,
      loading,
      signIn: setUser,
      signOut,
    }),
    [user, loading, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a SessionProvider.')
  return value
}
