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

/** A booth phone or a print agent, as the owner's dashboard sees it. */
export interface Device {
  id: string
  kind: 'booth' | 'agent'
  label: string | null
  eventId: string | null
  paired: boolean
  pairingPending: boolean
  lastSeenAt: string | null
  printerState: {
    state: 'idle' | 'printing' | 'stopped' | 'unknown'
    message: string | null
  } | null
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

  /** Booths and printers attached to this event. */
  listDevices(tenantId: string, eventId: string): Promise<Device[]>

  /**
   * Stops a booth, or unpairs a printer.
   *
   * Separate from ending the event on purpose: the usual reason is a phone
   * running out of battery or being lent by someone who wants it back, and
   * neither of those should close the party.
   */
  removeDevice(tenantId: string, deviceId: string): Promise<void>

  // Actions the owner takes on a montage.
  //
  // "print", not "reprint": nothing here knows whether paper came out. The
  // job is queued and the printer may be busy, out of paper or unplugged, so
  // claiming a previous print succeeded would be a guess.
  printMontage(tenantId: string, eventId: string, sessionId: string): Promise<void>
  emailMontage(
    tenantId: string,
    eventId: string,
    sessionId: string,
    to: string,
  ): Promise<void>
  /** A long-lived link, for pasting into whatever the owner already uses. */
  shareLink(
    tenantId: string,
    eventId: string,
    sessionId: string,
  ): Promise<{ url: string; title: string; expiresInDays: number }>
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
