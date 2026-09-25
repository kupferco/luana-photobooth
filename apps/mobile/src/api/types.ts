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
  /** Short-lived signed URL for previewing the artwork, if there is any. */
  backgroundUrl: string | null
}

/** Artwork behind the photos. Null means the template's flat colour. */
export interface BackgroundUpload {
  url: string
  contentType: string
  path: string
  expiresAt: string
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
  /**
   * The most recent print's state, so a print in progress can be watched.
   *
   * A count alone cannot answer "is it coming?", which is the only thing
   * anyone wants to know in the minute after pressing Print -- and on a
   * dye-sublimation printer that is a long minute during which nothing
   * visibly happens.
   */
  printStatus: 'queued' | 'sent' | 'printing' | 'printed' | 'failed' | null
  printError: string | null
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
  /**
   * Somewhere to put this party's artwork.
   *
   * Two steps on purpose: the bytes go straight to storage, and the event is
   * only pointed at them once they have landed. A failed upload then leaves
   * the previous background in place rather than a broken reference.
   */
  backgroundUpload(
    tenantId: string,
    eventId: string,
    contentType: 'image/jpeg' | 'image/png',
  ): Promise<BackgroundUpload>
  setBackground(tenantId: string, eventId: string, path: string | null): Promise<Event>

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

  /**
   * Every montage from the event, as one zip.
   *
   * Returns the bytes rather than a URL because the endpoint needs the
   * bearer token, and a browser navigating to a link cannot send one.
   */
  downloadAll(tenantId: string, eventId: string): Promise<Blob>

  /**
   * A short-lived code for a printer to claim itself with.
   *
   * The Pi has no human to sign in, so the code is the credential: fifteen
   * minutes, single use, burned when spent.
   */
  createPairingCode(
    tenantId: string,
    eventId: string,
  ): Promise<{ code: string; expiresAt: string }>

  /** Booths and printers attached to this event. */
  listDevices(tenantId: string, eventId: string): Promise<Device[]>

  /** Every device this tenant owns, whichever event it is attached to. */
  listAllDevices(tenantId: string): Promise<Device[]>

  /**
   * Points an existing printer at another event.
   *
   * No pairing code: a printer already on the network and already paired to
   * this tenant needs nothing re-authenticated. Only the party changes.
   */
  moveDevice(tenantId: string, deviceId: string, eventId: string): Promise<void>

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
