/**
 * Object layout in GCS.
 *
 * The first segment is the *retention tier*, not the tenant, because GCS
 * lifecycle rules can only match a prefix from the start of the name. Tiering
 * first is what lets the bucket expire raw frames and montages on different
 * schedules without the daily job.
 *
 * Tenant isolation does not come from the path. It comes from never listing a
 * prefix for a client and only ever signing a URL for one exact object, which
 * holds regardless of segment order.
 */

export const TIER = {
  /** Individual shots. Intermediate; deleted well before the montage. */
  raw: 'raw',
  /** Composed montages. What people actually keep. */
  out: 'out',
  /** Background artwork, uploaded or generated. Lives with the tenant. */
  bg: 'bg',
} as const

export type Tier = (typeof TIER)[keyof typeof TIER]

interface SessionScope {
  tenantId: string
  eventId: string
  sessionId: string
}

/** raw/t/<tenant>/e/<event>/s/<session>/<idx>.jpg */
export function rawFramePath(scope: SessionScope, idx: number): string {
  return `${TIER.raw}/t/${scope.tenantId}/e/${scope.eventId}/s/${scope.sessionId}/${idx}.jpg`
}

/** out/t/<tenant>/e/<event>/s/<session>/montage.jpg */
export function montagePath(scope: SessionScope): string {
  return `${TIER.out}/t/${scope.tenantId}/e/${scope.eventId}/s/${scope.sessionId}/montage.jpg`
}

/** bg/t/<tenant>/<assetId>.<ext> */
export function backgroundPath(tenantId: string, assetId: string, ext = 'jpg'): string {
  return `${TIER.bg}/t/${tenantId}/${assetId}.${ext}`
}

/** Everything belonging to one session, for the purge job. */
export function sessionPrefixes(scope: SessionScope): string[] {
  const tail = `t/${scope.tenantId}/e/${scope.eventId}/s/${scope.sessionId}/`
  return [`${TIER.raw}/${tail}`, `${TIER.out}/${tail}`]
}

/** Everything belonging to one event, for "owner deleted the event". */
export function eventPrefixes(tenantId: string, eventId: string): string[] {
  const tail = `t/${tenantId}/e/${eventId}/`
  return [`${TIER.raw}/${tail}`, `${TIER.out}/${tail}`]
}

/**
 * Guard against a path built from unvalidated input ever escaping its tenant.
 * Cheap, and the failure it prevents is showing one family another family's
 * photographs.
 */
export function assertWithinTenant(path: string, tenantId: string): void {
  if (!path.includes(`/t/${tenantId}/`)) {
    throw new Error('Refusing to use an object path outside the tenant.')
  }
  if (path.includes('..')) {
    throw new Error('Refusing to use an object path containing "..".')
  }
}
