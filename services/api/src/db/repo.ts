import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { CLASSIC_3UP, type Template } from '@photobooth/shared'
import { db } from './client'
import {
  devices,
  emailDeliveries,
  events,
  photos,
  printJobs,
  sessions,
  templates,
} from './schema'

/**
 * The tenant-scoped data access layer.
 *
 * Every function here takes `tenantId` as its first argument and puts it in
 * the WHERE clause. Nothing outside this module queries a tenant-scoped
 * table, so there is one place to get isolation right rather than one per
 * handler -- and the classic SaaS failure, a single query that forgets the
 * filter, has only one place to happen.
 *
 * The database holds photographs of other people's children. This is cheap
 * insurance.
 */

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Every tenant starts with v1's proven layout so there is no empty state to
 * explain before someone can run a party.
 */
export async function seedDefaultTemplate(
  tenantId: string,
  tx: Pick<typeof db, 'insert'> = db,
): Promise<string> {
  const [row] = await tx
    .insert(templates)
    .values({
      tenantId,
      name: 'Classic three-up',
      canvas: CLASSIC_3UP.canvas,
      cells: CLASSIC_3UP.cells,
      backgroundColor: CLASSIC_3UP.backgroundColor,
    })
    .returning({ id: templates.id })

  if (!row) throw new Error('Could not create the default template.')
  return row.id
}

export async function listTemplates(tenantId: string) {
  return db
    .select()
    .from(templates)
    .where(eq(templates.tenantId, tenantId))
    .orderBy(templates.createdAt)
}

export async function getTemplate(tenantId: string, templateId: string) {
  const [row] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.tenantId, tenantId), eq(templates.id, templateId)))
    .limit(1)
  return row ?? null
}

/** The template as the compositor and the client preview both want it. */
export function toTemplate(row: NonNullable<Awaited<ReturnType<typeof getTemplate>>>): Template {
  return {
    canvas: row.canvas,
    cells: row.cells,
    backgroundAssetId: row.backgroundAssetId,
    backgroundColor: row.backgroundColor,
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(
  tenantId: string,
  input: {
    name: string
    eventDate: Date
    templateId: string
    joinCode: string
    retentionUntil: Date
  },
) {
  const [row] = await db
    .insert(events)
    .values({ tenantId, ...input })
    .returning()
  if (!row) throw new Error('Could not create the event.')
  return row
}

export async function listEvents(tenantId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.tenantId, tenantId), isNull(events.deletedAt)))
    .orderBy(desc(events.eventDate))
}

export async function getEvent(tenantId: string, eventId: string) {
  const [row] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.id, eventId),
        isNull(events.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Lookup by join code, for a guest arriving from a QR with no account.
 *
 * Deliberately not tenant-scoped: the guest has no tenant, and the code is
 * the credential. It returns only live events, so a code cannot be used to
 * browse past parties.
 */
export async function getLiveEventByJoinCode(joinCode: string) {
  const [row] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.joinCode, joinCode),
        eq(events.status, 'live'),
        isNull(events.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function updateEvent(
  tenantId: string,
  eventId: string,
  patch: Partial<{
    name: string
    status: 'draft' | 'live' | 'ended'
    templateId: string
    retentionUntil: Date
    endedAt: Date | null
  }>,
) {
  const [row] = await db
    .update(events)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, eventId)))
    .returning()
  return row ?? null
}

/** Soft delete: gone from every UI at once, purged from GCS by the job. */
export async function softDeleteEvent(tenantId: string, eventId: string) {
  const [row] = await db
    .update(events)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, eventId)))
    .returning({ id: events.id })
  return row ?? null
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/**
 * A friendly name for the next device of this kind at an event.
 *
 * "Photo booth 2" tells the owner which of the two phones in the room they
 * are about to stop. A uuid does not, and neither does three rows all
 * labelled "Booth" -- which is what they got, and it made the stop button
 * a coin flip.
 *
 * Numbered by how many exist rather than by position, so removing the first
 * does not renumber the others out from under someone mid-party.
 */
export async function nextDeviceLabel(
  tenantId: string,
  eventId: string | null,
  kind: 'booth' | 'agent',
): Promise<string> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(devices)
    .where(
      and(
        eq(devices.tenantId, tenantId),
        eq(devices.kind, kind),
        eventId ? eq(devices.eventId, eventId) : isNull(devices.eventId),
      ),
    )

  const next = (row?.n ?? 0) + 1
  return kind === 'booth' ? `Photo booth ${next}` : `Printer ${next}`
}

export async function createDevice(
  tenantId: string,
  input: {
    eventId: string | null
    kind: 'booth' | 'agent'
    label?: string | null
    pairingCode?: string | null
    pairingExpiresAt?: Date | null
    tokenHash?: string | null
  },
) {
  const [row] = await db
    .insert(devices)
    .values({ tenantId, ...input })
    .returning()
  if (!row) throw new Error('Could not create the device.')
  return row
}

export async function listDevices(tenantId: string, eventId?: string) {
  return db
    .select()
    .from(devices)
    .where(
      eventId
        ? and(eq(devices.tenantId, tenantId), eq(devices.eventId, eventId))
        : eq(devices.tenantId, tenantId),
    )
    .orderBy(devices.createdAt)
}

/**
 * Claim by pairing code. Not tenant-scoped, because the Pi doing the claiming
 * has no identity yet -- the code is the credential, which is why it is short
 * lived and single use.
 */
export async function claimDeviceByPairingCode(code: string) {
  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.pairingCode, code), isNull(devices.tokenHash)))
    .limit(1)
  return row ?? null
}

export async function completePairing(deviceId: string, tokenHash: string) {
  const [row] = await db
    .update(devices)
    .set({
      tokenHash,
      // Burn the code: it is single use.
      pairingCode: null,
      pairingExpiresAt: null,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId))
    .returning()
  return row ?? null
}

export async function findDeviceByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(devices)
    .where(eq(devices.tokenHash, tokenHash))
    .limit(1)
  return row ?? null
}

export async function touchDevice(
  deviceId: string,
  printerState?: { state: 'idle' | 'printing' | 'stopped' | 'unknown'; message: string | null },
) {
  await db
    .update(devices)
    .set({
      lastSeenAt: new Date(),
      ...(printerState ? { printerState } : {}),
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId))
}

/**
 * Clears out pairing codes for an event that were never spent.
 *
 * Each request for a code used to add a row, so asking twice left a dead
 * "waiting for the pairing code" entry behind for ever. Four clicks, four
 * ghosts, none of them a printer. Since a code is single use and short
 * lived, an unspent one has no value worth keeping.
 *
 * Only ever removes devices that were never claimed -- a paired printer has
 * a token hash and is left alone.
 */
export async function clearUnclaimedPairings(
  tenantId: string,
  eventId: string,
): Promise<number> {
  const removed = await db
    .delete(devices)
    .where(
      and(
        eq(devices.tenantId, tenantId),
        eq(devices.eventId, eventId),
        eq(devices.kind, 'agent'),
        isNull(devices.tokenHash),
      ),
    )
    .returning()
  return removed.length
}

/**
 * Moves an already-paired device to another event.
 *
 * A printer that is on the network and paired does not broadcast a setup
 * network -- correctly, since taking the radio would disconnect a working
 * machine to solve a problem it does not have. But that left no way at all
 * to use last week's printer at this week's party: the pairing instructions
 * describe a hotspot that will never appear, and the only route was SSH.
 *
 * The device already exists and already belongs to this tenant, so there is
 * nothing to authenticate again. Only the event it serves changes, and its
 * token keeps working.
 */
export async function moveDevice(
  tenantId: string,
  deviceId: string,
  eventId: string,
) {
  const [row] = await db
    .update(devices)
    .set({ eventId, updatedAt: new Date() })
    .where(and(eq(devices.tenantId, tenantId), eq(devices.id, deviceId)))
    .returning()
  return row ?? null
}

/**
 * Revokes a device by deleting it.
 *
 * This is how a booth is stopped and how a printer is unpaired. There is no
 * "disabled" flag, because a flag would have to be honoured by every code
 * path that authenticates a device and one of them would eventually forget.
 * The row is the credential: remove it and the next request fails the token
 * lookup, wherever that phone is and whether or not it is listening.
 *
 * Tenant-scoped, and returns what it removed so the caller can answer 404
 * rather than pretending to have deleted someone else's device.
 *
 * Print jobs reference devices with ON DELETE SET NULL, so the history of
 * what was printed survives unpairing the printer that printed it.
 */
export async function revokeDevice(tenantId: string, deviceId: string) {
  const [row] = await db
    .delete(devices)
    .where(and(eq(devices.tenantId, tenantId), eq(devices.id, deviceId)))
    .returning()
  return row ?? null
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  tenantId: string,
  input: {
    eventId: string
    code: string
    guestTokenHash: string
    shotsExpected: number
    origin: 'guest' | 'booth'
  },
) {
  const [row] = await db
    .insert(sessions)
    .values({ tenantId, ...input })
    .returning()
  if (!row) throw new Error('Could not create the session.')
  return row
}

/**
 * By code, for a guest who has no account. The token in their URL is checked
 * by the caller; this only finds the row.
 */
export async function getSessionByCode(code: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.code, code), isNull(sessions.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function getSession(tenantId: string, sessionId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.id, sessionId),
        isNull(sessions.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function updateSession(
  tenantId: string,
  sessionId: string,
  patch: Partial<{
    status: 'queued' | 'capturing' | 'composing' | 'ready' | 'failed' | 'abandoned'
    shotsTaken: number
    montagePath: string | null
    error: string | null
    deletedAt: Date | null
  }>,
) {
  const [row] = await db
    .update(sessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, sessionId)))
    .returning()
  return row ?? null
}

/**
 * How long a session may sit in each unfinished state before it is written
 * off.
 *
 * A live booth polls every couple of seconds and claims the head of the queue
 * at once, so anything queued for minutes means the booth is not there --
 * somebody tapped start and walked away, or the phone was closed. Capture
 * takes about twenty seconds and composing takes a few, so those limits are
 * generous by a wide margin and only catch a booth that actually died.
 *
 * Without this, abandoned sessions stayed queued forever and every later
 * guest was told there were people ahead of them who had long since left.
 */
const STALE_MS = {
  queued: 5 * 60_000,
  capturing: 3 * 60_000,
  composing: 2 * 60_000,
} as const

/**
 * Writes off sessions that have clearly been abandoned.
 *
 * Swept lazily, whenever the queue is read, rather than on a schedule: the
 * queue is read every couple of seconds while a party is running, which is
 * exactly when it matters, and it needs no scheduler to be running for the
 * booth to behave.
 */
export async function expireStaleSessions(tenantId: string, eventId: string) {
  const now = Date.now()

  const scope = and(
    eq(sessions.tenantId, tenantId),
    eq(sessions.eventId, eventId),
    isNull(sessions.deletedAt),
  )

  // Nobody came: not a failure, so it is not reported as one.
  await db
    .update(sessions)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(
      and(
        scope,
        eq(sessions.status, 'queued'),
        lt(sessions.updatedAt, new Date(now - STALE_MS.queued)),
      ),
    )

  // The booth stopped mid-sequence. That is a failure, and the guest should
  // be told rather than left on a spinner.
  await db
    .update(sessions)
    .set({
      status: 'failed',
      error: 'The booth stopped before the photos were finished.',
      updatedAt: new Date(),
    })
    .where(
      and(
        scope,
        eq(sessions.status, 'capturing'),
        lt(sessions.updatedAt, new Date(now - STALE_MS.capturing)),
      ),
    )

  await db
    .update(sessions)
    .set({
      status: 'failed',
      error: 'The photo could not be put together.',
      updatedAt: new Date(),
    })
    .where(
      and(
        scope,
        eq(sessions.status, 'composing'),
        lt(sessions.updatedAt, new Date(now - STALE_MS.composing)),
      ),
    )
}

/**
 * The queue for one event: sessions still waiting or mid-capture, oldest
 * first. The booth takes the head of this; a guest's position comes from
 * their index in it.
 *
 * Stale entries are swept first, so the number a guest is shown is people who
 * are actually still waiting.
 */
export async function eventQueue(tenantId: string, eventId: string) {
  await expireStaleSessions(tenantId, eventId)

  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.eventId, eventId),
        inArray(sessions.status, ['queued', 'capturing']),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(sessions.createdAt)
}

export async function listEventSessions(tenantId: string, eventId: string) {
  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.eventId, eventId),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(desc(sessions.createdAt))
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function recordPhoto(
  tenantId: string,
  input: {
    sessionId: string
    idx: number
    gcsPath: string
    width: number
    height: number
  },
) {
  const [row] = await db
    .insert(photos)
    .values({ tenantId, ...input })
    .onConflictDoUpdate({
      target: [photos.sessionId, photos.idx],
      // A retried upload should replace the shot, not fail the sequence.
      set: { gcsPath: input.gcsPath, width: input.width, height: input.height },
    })
    .returning()
  if (!row) throw new Error('Could not record the photo.')
  return row
}

export async function listSessionPhotos(tenantId: string, sessionId: string) {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.tenantId, tenantId), eq(photos.sessionId, sessionId)))
    .orderBy(photos.idx)
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** A device is "online" if it has called in recently. */
const ONLINE_WINDOW_MS = 30_000

export async function eventStats(tenantId: string, eventId: string) {
  const queue = await eventQueue(tenantId, eventId)

  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.eventId, eventId),
        isNull(sessions.deletedAt),
      ),
    )

  const rows = await listDevices(tenantId, eventId)
  const fresh = (at: Date | null) =>
    at !== null && Date.now() - at.getTime() < ONLINE_WINDOW_MS

  const boothDevice = rows.find((d) => d.kind === 'booth' && fresh(d.lastSeenAt))
  const agentDevice = rows.find((d) => d.kind === 'agent')

  return {
    queueDepth: queue.length,
    sessionsToday: counted?.n ?? 0,
    boothOnline: Boolean(boothDevice),
    agentOnline: Boolean(agentDevice && fresh(agentDevice.lastSeenAt)),
    printer: agentDevice?.printerState ?? null,
  }
}

/** Sessions for the gallery, newest first, with print and email counts. */
export async function gallery(tenantId: string, eventId: string) {
  const rows = await listEventSessions(tenantId, eventId)
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)

  const prints = await db
    .select({ sessionId: printJobs.sessionId, n: sql<number>`count(*)::int` })
    .from(printJobs)
    .where(and(eq(printJobs.tenantId, tenantId), inArray(printJobs.sessionId, ids)))
    .groupBy(printJobs.sessionId)

  /*
   * The most recent print's state, so the owner can watch one happen.
   *
   * A count alone cannot answer "is it coming?", which is the only question
   * anyone asks in the thirty seconds after pressing Print -- and on a
   * SELPHY that is a long thirty seconds during which nothing visibly
   * happens.
   */
  const latest = await db
    .select({
      sessionId: printJobs.sessionId,
      status: printJobs.status,
      error: printJobs.error,
      updatedAt: printJobs.updatedAt,
    })
    .from(printJobs)
    .where(
      and(
        eq(printJobs.tenantId, tenantId),
        inArray(printJobs.sessionId, ids),
        sql`${printJobs.createdAt} = (
          SELECT max(created_at) FROM print_jobs pj2
           WHERE pj2.session_id = ${printJobs.sessionId}
        )`,
      ),
    )

  const lastPrint = new Map(
    latest.map((p) => [
      p.sessionId,
      { status: p.status, error: p.error, at: p.updatedAt },
    ]),
  )

  const emails = await db
    .select({ sessionId: emailDeliveries.sessionId, to: emailDeliveries.toEmail })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.kind, 'guest_photos'),
        inArray(emailDeliveries.sessionId, ids),
      ),
    )

  const printCounts = new Map(prints.map((p) => [p.sessionId, p.n]))
  const emailedTo = new Map(emails.map((e) => [e.sessionId, e.to]))

  return rows.map((row) => ({
    row,
    printCount: printCounts.get(row.id) ?? 0,
    lastPrint: lastPrint.get(row.id) ?? null,
    emailedTo: emailedTo.get(row.id) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Prints and emails the owner asks for
// ---------------------------------------------------------------------------

export async function queuePrint(
  tenantId: string,
  input: { sessionId: string; requestedBy: string },
) {
  // The agent is picked at claim time, not here: whichever printer is paired
  // to the event when the job is actually collected.
  const [row] = await db
    .insert(printJobs)
    .values({ tenantId, sessionId: input.sessionId, requestedBy: input.requestedBy })
    .returning()
  if (!row) throw new Error('Could not queue the print.')
  return row
}

export async function countPrints(tenantId: string, sessionId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(printJobs)
    .where(and(eq(printJobs.tenantId, tenantId), eq(printJobs.sessionId, sessionId)))
  return row?.n ?? 0
}
