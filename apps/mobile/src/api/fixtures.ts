import { DEFAULT_MONTAGE_RETENTION_DAYS, retentionUntil } from '@photobooth/shared'
import { clearToken, readToken, writeToken } from './storage'
import type {
  Event,
  EventLiveStats,
  GallerySession,
  PhotoboothApi,
  User,
} from './types'
import { ApiError } from './types'

/**
 * A fake backend for designing the screens around the capture sequence --
 * signing in, the event dashboard, the gallery, emailing a montage.
 *
 * The capture path is not mocked: what could be wrong about it is how a
 * countdown feels and whether uploads finish before people stop posing, and a
 * fixture upload always succeeds instantly, so it would answer nothing.
 *
 * Deliberately not a happy path. It carries a party mid-flow, an ended one
 * with a looming deletion date, a printer that has run out of paper, and a
 * failed session -- because those are the states the design has to survive,
 * and the version that only ever shows three tidy rows is the one that falls
 * apart at the party.
 */

const LATENCY_MS = 350

const delay = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms))

const iso = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 86_400_000).toISOString()

const TENANT = '00000000-0000-4000-8000-000000000001'

const FIXTURE_USER: User = {
  id: '00000000-0000-4000-8000-0000000000u1',
  email: 'daniel@kupfer.co',
  name: 'Daniel',
  memberships: [{ tenantId: TENANT, role: 'owner' }],
}

const EVENTS: Event[] = [
  {
    id: 'evt-live',
    name: "Luana's 8th birthday",
    eventDate: iso(0),
    status: 'live',
    joinCode: 'H7KQ2M',
    templateId: 'tpl-classic',
    retentionUntil: retentionUntil(new Date(), DEFAULT_MONTAGE_RETENTION_DAYS).toISOString(),
    endedAt: null,
  },
  {
    id: 'evt-draft',
    name: "Nina's christening",
    eventDate: iso(18),
    status: 'draft',
    joinCode: 'WB4XTC',
    templateId: 'tpl-classic',
    retentionUntil: iso(108),
    endedAt: null,
  },
  {
    // Close to deletion on purpose: this is the state the download prompt and
    // the retention countdown have to look right in.
    id: 'evt-ended',
    name: 'Office summer party',
    eventDate: iso(-88),
    status: 'ended',
    joinCode: 'RJ9NVD',
    templateId: 'tpl-classic',
    retentionUntil: iso(2),
    endedAt: iso(-88),
  },
]

const STATS: Record<string, EventLiveStats> = {
  'evt-live': {
    queueDepth: 2,
    sessionsToday: 31,
    boothOnline: true,
    agentOnline: true,
    // Out of paper mid-party: the thing that actually happens, and the state
    // the dashboard most needs to make obvious.
    printer: { state: 'stopped', message: 'Out of paper' },
  },
  'evt-draft': {
    queueDepth: 0,
    sessionsToday: 0,
    boothOnline: false,
    agentOnline: false,
    printer: null,
  },
  'evt-ended': {
    queueDepth: 0,
    sessionsToday: 0,
    boothOnline: false,
    agentOnline: false,
    printer: null,
  },
}

/** A placeholder montage, so the gallery has something with real proportions. */
const MONTAGE =
  'https://placehold.co/1800x1200/1f1f23/f5c518.png?text=montage'

const SESSIONS: Record<string, GallerySession[]> = {
  'evt-live': [
    { id: 's1', code: 'K3MQ7', status: 'ready', createdAt: iso(0), montageUrl: MONTAGE, printCount: 1, emailedTo: 'aunt@example.com' },
    { id: 's2', code: 'B9XTN', status: 'ready', createdAt: iso(0), montageUrl: MONTAGE, printCount: 0, emailedTo: null },
    { id: 's3', code: 'V2HPD', status: 'capturing', createdAt: iso(0), montageUrl: null, printCount: 0, emailedTo: null },
    { id: 's4', code: 'Q8WRJ', status: 'queued', createdAt: iso(0), montageUrl: null, printCount: 0, emailedTo: null },
    // A failure the owner has to be able to understand and act on.
    { id: 's5', code: 'M4CKZ', status: 'failed', createdAt: iso(0), montageUrl: null, printCount: 0, emailedTo: null },
    { id: 's6', code: 'T7NGB', status: 'ready', createdAt: iso(0), montageUrl: MONTAGE, printCount: 3, emailedTo: null },
  ],
  'evt-draft': [],
  'evt-ended': Array.from({ length: 24 }, (_, i) => ({
    id: `old-${i}`,
    code: `OLD${String(i).padStart(2, '0')}`,
    status: 'ready' as const,
    createdAt: iso(-88),
    montageUrl: MONTAGE,
    printCount: i % 3 === 0 ? 1 : 0,
    emailedTo: i % 4 === 0 ? 'someone@example.com' : null,
  })),
}

const SESSION_KEY = 'photobooth.fixture-session'

let signedIn = false
let pendingEmail: string | null = null
let restored: Promise<void> | null = null

/** Mirrors the real client, so persistence behaves the same in both modes. */
function restore(): Promise<void> {
  restored ??= readToken(SESSION_KEY).then((value) => {
    signedIn = value === 'yes'
  })
  return restored
}

export const fixtureApi: PhotoboothApi = {
  async requestCode(email) {
    await delay()
    pendingEmail = email
    return { sent: true }
  },

  async verifyCode(email, code) {
    await delay()
    // One wrong code that always fails, so the error state can be designed
    // without hunting for a way to trigger it.
    if (code === '000000') {
      throw new ApiError('That code is not right.', 'invalid', 400)
    }
    if (pendingEmail && pendingEmail !== email) {
      throw new ApiError('That code is not right.', 'invalid', 400)
    }
    signedIn = true
    await writeToken(SESSION_KEY, 'yes')
    return { user: { ...FIXTURE_USER, email } }
  },

  async me() {
    await restore()
    await delay(120)
    return signedIn ? { user: FIXTURE_USER } : null
  },

  async signOut() {
    await delay(120)
    signedIn = false
    await clearToken(SESSION_KEY)
  },

  async listEvents() {
    await delay()
    return EVENTS
  },

  async getEvent(_tenantId, eventId) {
    await delay()
    const event = EVENTS.find((e) => e.id === eventId)
    if (!event) throw new ApiError('Not found', 'not_found', 404)
    return event
  },

  async createEvent(_tenantId, input) {
    await delay()
    const event: Event = {
      id: `evt-${Date.now()}`,
      name: input.name,
      eventDate: input.eventDate,
      status: 'draft',
      joinCode: 'NEW' + String(EVENTS.length).padStart(3, '0'),
      templateId: 'tpl-classic',
      retentionUntil: retentionUntil(new Date(input.eventDate)).toISOString(),
      endedAt: null,
    }
    EVENTS.unshift(event)
    SESSIONS[event.id] = []
    STATS[event.id] = {
      queueDepth: 0,
      sessionsToday: 0,
      boothOnline: false,
      agentOnline: false,
      printer: null,
    }
    return event
  },

  async setEventStatus(_tenantId, eventId, status) {
    await delay()
    const event = EVENTS.find((e) => e.id === eventId)
    if (!event) throw new ApiError('Not found', 'not_found', 404)
    event.status = status
    event.endedAt = status === 'ended' ? new Date().toISOString() : null
    return event
  },

  async claimBooth() {
    await delay()
    // Booth mode talks to the real API even in fixtures mode, so this token
    // would not work. Saying so beats a confusing 401 later.
    throw new ApiError(
      'Booth mode needs the real API. Set EXPO_PUBLIC_API_MODE=live.',
      'fixtures_only',
      400,
    )
  },

  async eventStats(_tenantId, eventId) {
    await delay(200)
    return (
      STATS[eventId] ?? {
        queueDepth: 0,
        sessionsToday: 0,
        boothOnline: false,
        agentOnline: false,
        printer: null,
      }
    )
  },

  async listSessions(_tenantId, eventId) {
    await delay()
    return SESSIONS[eventId] ?? []
  },

  async printMontage(_tenantId, _eventId, sessionId) {
    await delay()
    for (const list of Object.values(SESSIONS)) {
      const found = list.find((s) => s.id === sessionId)
      if (found) found.printCount += 1
    }
  },

  async shareLink() {
    await delay()
    return { url: MONTAGE, title: 'Fixture event', expiresInDays: 7 }
  },

  async emailMontage(_tenantId, _eventId, sessionId, to) {
    await delay(600)
    if (!to.includes('@')) {
      throw new ApiError('That does not look like an email address.', 'invalid_email', 400)
    }
    for (const list of Object.values(SESSIONS)) {
      const found = list.find((s) => s.id === sessionId)
      if (found) found.emailedTo = to
    }
  },
}

export const FIXTURE_TENANT_ID = TENANT
