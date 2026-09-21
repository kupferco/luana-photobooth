import { and, desc, eq, isNull } from 'drizzle-orm'
import { CLASSIC_3UP, type Template } from '@photobooth/shared'
import { db } from './client'
import { devices, events, templates } from './schema'

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
