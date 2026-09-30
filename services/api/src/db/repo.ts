import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import {
  CLASSIC_3UP,
  type Artwork,
  TEMPLATES,
  isWellFormedDeviceName,
  proposeDeviceName,
  type Template,
} from '@photobooth/shared'
import { db } from './client'
import {
  deviceNames,
  devices,
  emailDeliveries,
  eventMembers,
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
  /*
   * Every layout, not only the default.
   *
   * Templates are per-tenant rows, so a layout that ships later has to be
   * handed out to accounts that already exist as well -- see the backfill
   * in the migrations. New accounts get the lot here.
   */
  const rows = await tx
    .insert(templates)
    .values(
      TEMPLATES.map(({ name, template }) => ({
        tenantId,
        name,
        canvas: template.canvas,
        cells: template.cells,
        backgroundColor: template.backgroundColor,
      })),
    )
    .returning({ id: templates.id })

  // The first is the one new events start on: it is what every print so far
  // has used, and a new account should not be the experiment.
  const first = rows[0]
  if (!first) throw new Error('Could not create the default template.')
  return first.id
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

/**
 * Every party this person can see.
 *
 * Two sources: accounts they belong to, and single parties they were
 * invited to help with. One query rather than two and a merge, so the
 * ordering is the database's and a party reachable both ways appears once.
 *
 * Someone invited to help has no account membership at all, so without this
 * their event list is simply empty -- there is no tenant to ask about.
 */
export async function listEventsForUser(userId: string, tenantIds: string[]) {
  const rows = await db
    .selectDistinct()
    .from(events)
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)),
    )
    .where(
      and(
        isNull(events.deletedAt),
        or(
          // inArray with an empty list is invalid SQL, and an account-less
          // helper is exactly the case that produces one.
          tenantIds.length ? inArray(events.tenantId, tenantIds) : sql`false`,
          isNotNull(eventMembers.userId),
        ),
      ),
    )
    .orderBy(desc(events.eventDate))

  return rows.map((row) => row.events)
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
    retakesAllowed: number
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
/**
 * Points an event at its background artwork, or clears it.
 *
 * The old file is not deleted here. Sessions already printed were composed
 * with it and may be re-rendered; the retention job sweeps orphans when the
 * event's photos go. Deleting eagerly to save a few hundred kilobytes would
 * risk taking a picture out from under a montage someone is about to
 * reprint.
 */
/** How many generations this party has left, and one more if it has any. */
export async function claimGeneration(
  tenantId: string,
  eventId: string,
  cap: number,
): Promise<{ ok: boolean; used: number; cap: number }> {
  /*
   * Claimed before the picture is made, not after.
   *
   * Two taps at once would otherwise both read the same count, both pass,
   * and both be paid for. The condition is part of the update, so the
   * database decides who gets the last one.
   */
  const [row] = await db
    .update(events)
    .set({ artworkGenerations: sql`${events.artworkGenerations} + 1` })
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.id, eventId),
        lt(events.artworkGenerations, cap),
      ),
    )
    .returning({ used: events.artworkGenerations })

  if (row) return { ok: true, used: row.used, cap }

  const current = await getEvent(tenantId, eventId)
  return { ok: false, used: current?.artworkGenerations ?? cap, cap }
}

export async function setEventBackground(
  tenantId: string,
  eventId: string,
  backgroundPath: string | null,
  /**
   * How it was described, when it was made in the studio.
   *
   * Cleared on an upload, and on removal, because a description that no
   * longer matches the picture is worse than none: the studio would reopen
   * showing words that are not on the print.
   */
  artwork: Artwork | null = null,
) {
  const [row] = await db
    .update(events)
    .set({ backgroundPath, artwork, updatedAt: new Date() })
    .where(and(eq(events.tenantId, tenantId), eq(events.id, eventId)))
    .returning()
  return row ?? null
}

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

export async function completePairing(
  deviceId: string,
  tokenHash: string,
  extra?: { hardwareId?: string | null; label?: string },
) {
  const [row] = await db
    .update(devices)
    .set({
      tokenHash,
      ...(extra?.hardwareId !== undefined ? { hardwareId: extra.hardwareId } : {}),
      ...(extra?.label ? { label: extra.label } : {}),
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
 * The permanent name for a physical box.
 *
 * Looked up by CPU serial, so it survives unpairing, re-pairing, reflashing
 * and changing owner. A box asks for the name it generated; if that one is
 * taken by different hardware the server re-rolls until it finds a free one,
 * so two units can never share a name however many are in circulation.
 *
 * Re-rolling here rather than asking the device again keeps it to one round
 * trip, which matters because the Pi is doing this seconds after joining an
 * unfamiliar wifi.
 */
export async function claimDeviceName(
  hardwareId: string,
  proposed: string,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(deviceNames)
    .where(eq(deviceNames.hardwareId, hardwareId))
    .limit(1)

  if (existing) return existing.name

  let candidate = isWellFormedDeviceName(proposed) ? proposed : proposeDeviceName()

  // Ten attempts against 144,000 combinations: the chance of needing an
  // eleventh is not worth the code to handle it, and the unique constraint
  // is what actually guarantees correctness.
  for (let attempt = 0; attempt < 10; attempt++) {
    const [claimed] = await db
      .insert(deviceNames)
      .values({ name: candidate, hardwareId })
      .onConflictDoNothing()
      .returning()

    if (claimed) return claimed.name
    candidate = proposeDeviceName()
  }

  throw new Error('Could not find a free name for this printer.')
}

/**
 * Records the box and its name on a device row.
 *
 * Only fills a label that is still a default: someone who has renamed their
 * printer "bar printer" should not have it changed back by the box claiming
 * its generated name.
 */
export async function nameDevice(
  tenantId: string,
  deviceId: string,
  input: { hardwareId: string; name: string },
) {
  const [current] = await db
    .select({ label: devices.label })
    .from(devices)
    .where(and(eq(devices.tenantId, tenantId), eq(devices.id, deviceId)))
    .limit(1)

  const stillDefault =
    !current?.label || current.label === 'Printer' || current.label === 'Raspberry Pi'

  await db
    .update(devices)
    .set({
      hardwareId: input.hardwareId,
      ...(stillDefault ? { label: input.name } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(devices.tenantId, tenantId), eq(devices.id, deviceId)))
}

/** The device row this box already has at this tenant, if any. */
export async function findDeviceByHardware(tenantId: string, hardwareId: string) {
  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tenantId, tenantId), eq(devices.hardwareId, hardwareId)))
    .limit(1)
  return row ?? null
}

/**
 * Releases an event's hardware when the party finishes.
 *
 * A printer stayed bound to an event that had ended, which made it invisible
 * to the next one: the setup instructions describe a hotspot an online Pi
 * never broadcasts, so the only way to reuse it was to know it was attached
 * to a dead event and move it. Nobody would guess that.
 *
 * Printers are detached, not deleted: the pairing is real hardware and
 * survives the party, so it returns to the tenant's pool and can be added to
 * the next event in one tap.
 *
 * Booths are deleted. A booth is somebody's phone claiming itself for the
 * evening; when the party ends it should simply stop being a booth, and
 * claiming again is one tap on the phone itself. Leaving a row behind would
 * mean a list of phones that are no longer anywhere near the venue.
 */
export async function releaseEventDevices(tenantId: string, eventId: string) {
  const detached = await db
    .update(devices)
    .set({ eventId: null, updatedAt: new Date() })
    .where(
      and(
        eq(devices.tenantId, tenantId),
        eq(devices.eventId, eventId),
        eq(devices.kind, 'agent'),
      ),
    )
    .returning()

  const removed = await db
    .delete(devices)
    .where(
      and(
        eq(devices.tenantId, tenantId),
        eq(devices.eventId, eventId),
        eq(devices.kind, 'booth'),
      ),
    )
    .returning()

  return { printersReleased: detached.length, boothsStopped: removed.length }
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
/**
 * Deletes a guest's photo and gives them their turn straight back.
 *
 * The retake goes to the *front* of the queue, not the back. They are
 * standing at the booth having just had their turn, and sending them to the
 * end at a busy party turns a blink into a ten-minute problem -- which is
 * exactly the situation this exists to rescue. The limit is what stops it
 * being abused, not the wait.
 *
 * Their previous session is deleted outright: the whole point is that the
 * photo they did not like stops existing, including any link they shared.
 */
export async function retakeSession(
  tenantId: string,
  previous: { id: string; eventId: string; code: string; retakeCount: number; shotsExpected: number },
  input: { code: string; guestTokenHash: string },
) {
  return db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, previous.id)))

    /*
     * Just ahead of whoever is currently first.
     *
     * Not `now()`, which would put them behind everyone already waiting, and
     * not a fixed epoch, which would park them in front for ever if they
     * retake twice.
     */
    const [head] = await tx
      .select({ queuedAt: sessions.queuedAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.tenantId, tenantId),
          eq(sessions.eventId, previous.eventId),
          eq(sessions.status, 'queued'),
          isNull(sessions.deletedAt),
        ),
      )
      .orderBy(sessions.queuedAt)
      .limit(1)

    const queuedAt = head
      ? new Date(head.queuedAt.getTime() - 1000)
      : new Date()

    const [row] = await tx
      .insert(sessions)
      .values({
        tenantId,
        eventId: previous.eventId,
        code: input.code,
        guestTokenHash: input.guestTokenHash,
        shotsExpected: previous.shotsExpected,
        origin: 'guest',
        retakeCount: previous.retakeCount + 1,
        queuedAt,
      })
      .returning()

    if (!row) throw new Error('Could not start the retake.')
    return row
  })
}

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

/**
 * The public handle for one montage, minted on first share.
 *
 * Reused afterwards so the same photo always has the same link: someone who
 * shares twice should not create two, and a link already sent must keep
 * working.
 */
export async function ensureShareToken(
  tenantId: string,
  sessionId: string,
): Promise<string | null> {
  const [existing] = await db
    .select({ shareToken: sessions.shareToken })
    .from(sessions)
    .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, sessionId)))
    .limit(1)

  if (!existing) return null
  if (existing.shareToken) return existing.shareToken

  /*
   * Not the session's own code, which is the obvious thing to reach for and
   * is wrong twice over.
   *
   * The code is 5 characters from a 28-letter alphabet: 17 million, about
   * 24 bits, and globally unique -- so every code that exists is somebody's
   * photograph, and the whole space can be swept in two days at 100
   * requests a second. It is also not secret. It is shown on the booth in
   * front of the room, and printed in the owner's gallery, precisely so a
   * guest can tell which montage is theirs.
   *
   * This page has no sign-in: the URL is the authorisation. So it needs a
   * credential, not an identifier. 96 bits, which is a UUID's worth and
   * beyond any amount of guessing, in 16 characters -- a third shorter than
   * the 144-bit token this replaces, which was longer than it needed to be
   * and made an ugly link and a dense QR for nothing.
   *
   * Only new tokens are shorter. Links already sent keep working, because
   * the token is stored rather than derived.
   */
  const token = randomBytes(12).toString('base64url')

  const [updated] = await db
    .update(sessions)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, sessionId)))
    .returning({ shareToken: sessions.shareToken })

  return updated?.shareToken ?? null
}

/**
 * A shared montage, by its public token.
 *
 * Not tenant-scoped: the token *is* the authorisation, which is why it is
 * long and random. Deleted sessions return nothing, so "delete my photos"
 * kills every link that was ever shared.
 */
export async function getSharedSession(shareToken: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.shareToken, shareToken), isNull(sessions.deletedAt)))
    .limit(1)
  return row ?? null
}

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

/**
 * Photos and prints per event, for the list.
 *
 * Two small grouped queries rather than joining onto the event list itself:
 * that query already left-joins event membership and is distinct-ed, and
 * hanging aggregates off it would have counted rows twice.
 */
export interface EventCounts {
  photos: number
  prints: number
  /** Joined the queue and never got a photo. The clearest sign of trouble. */
  abandoned: number
  /** The worst queue anyone sat through, in seconds. Null if nobody queued. */
  longestWaitSeconds: number | null
}

export async function eventCounts(
  eventIds: string[],
): Promise<Map<string, EventCounts>> {
  const out = new Map<string, EventCounts>()
  if (eventIds.length === 0) return out

  /*
   * Photos, the people who gave up, and the worst wait, in one pass.
   *
   * The last two are what make a list of finished parties worth scanning:
   * a count of photographs says how big the party was, not whether the
   * setup coped with it.
   */
  const photos = await db
    .select({
      eventId: sessions.eventId,
      n: sql<number>`count(*) filter (where ${sessions.status} = 'ready')::int`,
      abandoned: sql<number>`count(*) filter (where ${sessions.status} = 'abandoned')::int`,
      longest: sql<string | null>`max(extract(epoch from (${sessions.calledAt} - ${sessions.queuedAt})))`,
    })
    .from(sessions)
    .where(and(inArray(sessions.eventId, eventIds), isNull(sessions.deletedAt)))
    .groupBy(sessions.eventId)

  // Jobs that actually reached paper. A queued or failed one is not a print.
  const prints = await db
    .select({ eventId: sessions.eventId, n: sql<number>`count(*)::int` })
    .from(printJobs)
    .innerJoin(sessions, eq(sessions.id, printJobs.sessionId))
    .where(
      and(inArray(sessions.eventId, eventIds), eq(printJobs.status, 'printed')),
    )
    .groupBy(sessions.eventId)

  for (const id of eventIds) {
    out.set(id, { photos: 0, prints: 0, abandoned: 0, longestWaitSeconds: null })
  }
  for (const row of photos) {
    out.set(row.eventId, {
      ...out.get(row.eventId)!,
      photos: row.n,
      abandoned: row.abandoned,
      longestWaitSeconds:
        row.longest === null ? null : Math.round(Number(row.longest)),
    })
  }
  for (const row of prints) out.set(row.eventId, { ...out.get(row.eventId)!, prints: row.n })

  return out
}

export interface EventReport {
  photos: number
  prints: number
  /** Sessions started, including ones that never produced a photo. */
  guests: number
  retakes: number
  /** Seconds between joining the queue and the booth calling them up. */
  averageWaitSeconds: number | null
  longestWaitSeconds: number | null
  /** Photos an hour across the whole run. Null when it was too short to mean anything. */
  photosPerHour: number | null
  /** The most photos taken in any one clock hour. */
  busiestHour: number | null
  firstAt: string | null
  lastAt: string | null
}

/**
 * What a finished party actually did.
 *
 * Written for someone deciding whether one booth was enough. The throughput
 * says what a booth managed; the wait says whether that was enough, and they
 * are not the same question -- a booth can be busy all night and still have
 * nobody waiting, which is exactly right.
 */
export async function eventReport(
  tenantId: string,
  eventId: string,
): Promise<EventReport> {
  const [row] = (await db.execute(sql`
    select
      count(*) filter (where status = 'ready')::int                as photos,
      count(*)::int                                                as guests,
      coalesce(sum(retake_count), 0)::int                          as retakes,
      avg(extract(epoch from (called_at - queued_at)))
        filter (where called_at is not null)                       as avg_wait,
      max(extract(epoch from (called_at - queued_at)))
        filter (where called_at is not null)                       as max_wait,
      min(queued_at)                                               as first_at,
      max(queued_at)                                               as last_at
    from sessions
    where tenant_id = ${tenantId}
      and event_id = ${eventId}
      and deleted_at is null
  `)) as unknown as {
    photos: number
    guests: number
    retakes: number
    avg_wait: string | null
    max_wait: string | null
    first_at: Date | null
    last_at: Date | null
  }[]

  const [printed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(printJobs)
    .innerJoin(sessions, eq(sessions.id, printJobs.sessionId))
    .where(and(eq(sessions.eventId, eventId), eq(printJobs.status, 'printed')))

  /*
   * The busiest clock hour, not a rolling one.
   *
   * A rolling window is the more accurate measure of peak load, and it is
   * not what anybody reads this for: the question is "was there an hour
   * that overwhelmed one booth", and an hour on the clock answers it.
   */
  const [peak] = (await db.execute(sql`
    select count(*)::int as n
    from sessions
    where tenant_id = ${tenantId}
      and event_id = ${eventId}
      and deleted_at is null
      and status = 'ready'
    group by date_trunc('hour', queued_at)
    order by n desc
    limit 1
  `)) as unknown as { n: number }[]

  const first = row?.first_at ? new Date(row.first_at) : null
  const last = row?.last_at ? new Date(row.last_at) : null
  const hours = first && last ? (last.getTime() - first.getTime()) / 3_600_000 : 0

  const num = (v: string | null | undefined) =>
    v === null || v === undefined ? null : Math.round(Number(v))

  return {
    photos: row?.photos ?? 0,
    prints: printed?.n ?? 0,
    guests: row?.guests ?? 0,
    retakes: row?.retakes ?? 0,
    averageWaitSeconds: num(row?.avg_wait),
    longestWaitSeconds: num(row?.max_wait),
    /*
     * Below a quarter of an hour the divisor is small enough that one extra
     * photo swings the rate wildly -- three photos in four minutes is not
     * "45 an hour" in any useful sense. Better to say nothing.
     */
    photosPerHour:
      hours >= 0.25 && row?.photos ? Math.round((row.photos / hours) * 10) / 10 : null,
    busiestHour: peak?.n ?? null,
    firstAt: first?.toISOString() ?? null,
    lastAt: last?.toISOString() ?? null,
  }
}
