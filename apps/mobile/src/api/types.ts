import type { Artwork, Template } from '@photobooth/shared'
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
  /**
   * Which account the party belongs to.
   *
   * Carried on the event because the app can no longer assume one: somebody
   * invited to help with a single party is a member of no account, so there
   * is nothing on the session to read it from.
   */
  tenantId: string
  name: string
  eventDate: string
  status: 'draft' | 'live' | 'ended'
  joinCode: string
  templateId: string | null
  retentionUntil: string
  endedAt: string | null
  /** Short-lived signed URL for previewing the artwork, if there is any. */
  backgroundUrl: string | null
  /** How many times a guest may delete their photo and go again. */
  retakesAllowed: number
  /**
   * How this party's background was described, if it was made in the studio.
   * Null for an uploaded picture, which has no description.
   */
  artwork: Artwork | null

  /** Finished photos, and prints that reached paper. Carried on the list. */
  photos: number
  prints: number
  /**
   * The two numbers that say whether the setup coped, rather than how big
   * the party was. Both are quiet when nothing went wrong, which is the
   * point: a list of finished parties should only speak up about the ones
   * worth looking at.
   */
  abandoned: number
  longestWaitSeconds: number | null
}

/** What a finished party did, for deciding whether one booth was enough. */
export interface EventReport {
  photos: number
  prints: number
  guests: number
  retakes: number
  /**
   * Null when nobody queued: someone who walks up and taps the booth never
   * waited, so an event with no QR guests has no wait to report.
   */
  averageWaitSeconds: number | null
  longestWaitSeconds: number | null
  /** Null when the party was too short for a rate to mean anything. */
  photosPerHour: number | null
  busiestHour: number | null
  firstAt: string | null
  lastAt: string | null
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

/** A background this party has been offered, kept whether or not it was used. */
export interface Background {
  id: string
  url: string
  source: 'generated' | 'stock' | 'upload'
  prompt: string | null
  /** How light it is, 0-100, measured when it arrived. Null if unmeasured. */
  luminance: number | null
  credit: { name: string; url: string; source: string } | null
  selected: boolean
  createdAt: string
}

/** One of the layouts an event can be put on. */
export interface Layout {
  id: string
  name: string
  template: Template
  shots: number
}

/** Someone who can run this account's parties. */
export interface Member {
  userId: string
  email: string
  name: string | null
  role: 'owner' | 'admin' | 'staff'
  joinedAt: string
  isYou: boolean
}

export interface PhotoboothApi {
  // Auth
  requestCode(email: string): Promise<{ sent: true }>
  verifyCode(email: string, code: string): Promise<{ user: User }>
  me(): Promise<{ user: User } | null>
  signOut(): Promise<void>

  // Events
  /** Everything the caller can see. A tenant narrows it to one account. */
  listEvents(tenantId?: string): Promise<Event[]>
  getEvent(tenantId: string, eventId: string): Promise<Event>
  /** The layouts this account can choose between. */
  listLayouts(tenantId: string): Promise<Layout[]>
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

  /**
   * Make the background from a description.
   *
   * The server renders it, stores it and points the event at it, so what
   * comes back is an event with a new backgroundUrl like any other.
   */
  setArtwork(
    tenantId: string,
    eventId: string,
    artwork: Artwork,
    /** Which of the party's backgrounds to draw the words over. */
    backgroundId?: string | null,
  ): Promise<Event>

  /**
   * Make a candidate background from a description.
   *
   * Nothing about the party changes: it comes back as a picture to look at,
   * and becomes the background only if it is passed to setArtwork.
   */
  generateBackground(
    tenantId: string,
    eventId: string,
    prompt: string,
    palette: Artwork['palette'],
  ): Promise<{ id: string; url: string; used: number; cap: number }>

  /** Everything this party has been offered, newest first. */
  listBackgrounds(tenantId: string, eventId: string): Promise<Background[]>

  /** Which layout the party's prints use. */
  setLayout(tenantId: string, eventId: string, templateId: string): Promise<Event>

  /** How many retakes a guest gets. 0 turns them off for a busy party. */
  setRetakes(tenantId: string, eventId: string, retakesAllowed: number): Promise<Event>

  setEventStatus(
    tenantId: string,
    eventId: string,
    status: Event['status'],
  ): Promise<Event>

  // People
  /**
   * Who can help, and whether this account lets you change that.
   *
   * `canManage` comes from the server rather than being inferred from a role
   * here, so the rule lives in one place -- the place that enforces it.
   */
  listMembers(tenantId: string): Promise<{ members: Member[]; canManage: boolean }>
  /** The same, for one party rather than the whole account. */
  listEventMembers(
    tenantId: string,
    eventId: string,
  ): Promise<{ members: Member[]; canManage: boolean }>
  addEventMember(
    tenantId: string,
    eventId: string,
    email: string,
  ): Promise<{ member: Member; created: boolean }>
  removeEventMember(tenantId: string, eventId: string, userId: string): Promise<void>
  /** Invites by email. Already a member is a success, not an error. */
  addMember(tenantId: string, email: string): Promise<{ member: Member; created: boolean }>
  removeMember(tenantId: string, userId: string): Promise<void>

  /** The full numbers for one party. Worth asking for once it has ended. */
  eventReport(tenantId: string, eventId: string): Promise<EventReport>

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
