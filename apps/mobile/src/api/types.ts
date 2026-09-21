import type { SessionStatus } from '@photobooth/shared'

/**
 * What the screens consume. Mirrors the API's responses, and is what both the
 * live client and the fixtures implement -- so a screen cannot tell which it
 * is talking to, and switching costs nothing.
 */

export interface Membership {
  tenantId: string
  role: 'owner' | 'admin' | 'staff'
}

export interface User {
  id: string
  email: string
  name: string | null
  memberships: Membership[]
}

export interface Event {
  id: string
  name: string
  eventDate: string
  status: 'draft' | 'live' | 'ended'
  joinCode: string
  templateId: string | null
  retentionUntil: string
  endedAt: string | null
}

export interface EventLiveStats {
  queueDepth: number
  sessionsToday: number
  boothOnline: boolean
  agentOnline: boolean
  printer: { state: 'idle' | 'printing' | 'stopped' | 'unknown'; message: string | null } | null
}

export interface GallerySession {
  id: string
  code: string
  status: SessionStatus
  createdAt: string
  montageUrl: string | null
  printCount: number
  emailedTo: string | null
}

export interface PhotoboothApi {
  // Auth
  requestCode(email: string): Promise<{ sent: true }>
  verifyCode(email: string, code: string): Promise<{ user: User }>
  me(): Promise<{ user: User } | null>
  signOut(): Promise<void>

  // Events
  listEvents(tenantId: string): Promise<Event[]>
  getEvent(tenantId: string, eventId: string): Promise<Event>
  createEvent(
    tenantId: string,
    input: { name: string; eventDate: string },
  ): Promise<Event>
  setEventStatus(
    tenantId: string,
    eventId: string,
    status: Event['status'],
  ): Promise<Event>

  // Dashboard
  eventStats(tenantId: string, eventId: string): Promise<EventLiveStats>
  listSessions(tenantId: string, eventId: string): Promise<GallerySession[]>

  /** Binds this phone to an event as the booth, returning its device token. */
  claimBooth(tenantId: string, eventId: string): Promise<{ token: string }>

  // Actions the owner takes on someone else's montage
  reprint(tenantId: string, sessionId: string): Promise<void>
  emailMontage(tenantId: string, sessionId: string, to: string): Promise<void>
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
