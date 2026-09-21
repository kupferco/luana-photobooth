import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type Event } from '../api'
import { useSession } from '../session'

/**
 * Which event the Event tab is showing.
 *
 * The tab is contextual rather than a list, so something has to choose. The
 * rule is: whatever is live, else the nearest upcoming draft, else the most
 * recent. Tapping an event on Home overrides it.
 *
 * During a party this means the Event tab is already on the right one without
 * anybody selecting anything -- which is the whole point of it being a tab
 * rather than a menu.
 */

interface ActiveEventState {
  events: Event[]
  active: Event | null
  loading: boolean
  setActive(eventId: string): void
  refresh(): Promise<void>
}

const ActiveEventContext = createContext<ActiveEventState | null>(null)

function pick(events: Event[]): Event | null {
  const live = events.find((e) => e.status === 'live')
  if (live) return live

  const upcoming = events
    .filter((e) => e.status === 'draft' && new Date(e.eventDate) >= new Date())
    .sort((a, b) => +new Date(a.eventDate) - +new Date(b.eventDate))
  if (upcoming[0]) return upcoming[0]

  return (
    [...events].sort((a, b) => +new Date(b.eventDate) - +new Date(a.eventDate))[0] ??
    null
  )
}

export function ActiveEventProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useSession()
  const [events, setEvents] = useState<Event[]>([])
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setEvents([])
      setLoading(false)
      return
    }
    const rows = await api.listEvents(tenantId)
    setEvents(rows)
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<ActiveEventState>(() => {
    const chosen = chosenId ? events.find((e) => e.id === chosenId) : null
    return {
      events,
      active: chosen ?? pick(events),
      loading,
      setActive: setChosenId,
      refresh,
    }
  }, [events, chosenId, loading, refresh])

  return (
    <ActiveEventContext.Provider value={value}>
      {children}
    </ActiveEventContext.Provider>
  )
}

export function useActiveEvent(): ActiveEventState {
  const value = useContext(ActiveEventContext)
  if (!value) {
    throw new Error('useActiveEvent must be used inside an ActiveEventProvider.')
  }
  return value
}
