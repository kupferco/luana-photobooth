import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { Cell } from '@photobooth/shared'

/**
 * Every tenant-scoped table carries `tenantId`, including where it could be
 * derived by joining. It is denormalised on purpose: it means there is
 * exactly one filter to get right, and it is the same filter everywhere.
 *
 * This database holds photographs of other people's children, so isolation
 * is defence in depth rather than discipline alone -- see
 * docs/architecture.md. Nothing here should be queried outside the
 * tenant-scoped data-access layer.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Enums. These mirror the zod enums in @photobooth/shared; the two must agree.
// ---------------------------------------------------------------------------

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'staff'])
export const eventStatus = pgEnum('event_status', ['draft', 'live', 'ended'])
export const deviceKind = pgEnum('device_kind', ['booth', 'agent'])
export const sessionStatus = pgEnum('session_status', [
  'queued',
  'capturing',
  'composing',
  'ready',
  'failed',
  'abandoned',
])
export const printJobStatus = pgEnum('print_job_status', [
  'queued',
  'sent',
  'printing',
  'printed',
  'failed',
  'cancelled',
])
export const assetKind = pgEnum('asset_kind', ['background'])
export const emailKind = pgEnum('email_kind', [
  'signin_code',
  'guest_photos',
  'retention_warning',
])
export const emailStatus = pgEnum('email_status', ['queued', 'sent', 'failed'])

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

/**
 * A tenant is an account, not a person. Registering creates a tenant plus an
 * `owner` membership. This looks like overkill for one party and is what
 * lets a venue run twenty without a rewrite -- and it is the migration that
 * cannot be retrofitted.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  ...timestamps,
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Identity Platform uid. Null until their first successful sign-in. */
    authUid: text('auth_uid'),
    email: text('email').notNull(),
    name: text('name'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_auth_uid_key').on(t.authUid),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('owner'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
  ],
)

/**
 * Short-lived email sign-in codes. We email a 6-digit code rather than a
 * magic link: links need universal links and an apple-app-site-association
 * file, and bounce the user Mail -> Safari -> app. A code is one screen and
 * behaves identically on web, iOS and Android.
 *
 * Only the hash is stored, and `attempts` caps brute force.
 */
export const signinCodes = pgTable(
  'signin_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('signin_codes_email_idx').on(t.email, t.expiresAt)],
)

// ---------------------------------------------------------------------------
// Event setup
// ---------------------------------------------------------------------------

/** Uploaded or generated background artwork. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: assetKind('kind').notNull().default('background'),
    gcsPath: text('gcs_path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Set when the image was generated rather than uploaded. */
    prompt: text('prompt'),
    ...timestamps,
  },
  (t) => [index('assets_tenant_idx').on(t.tenantId)],
)

/**
 * The montage layout, stored as data so backgrounds and new layouts need no
 * deploy. v1's geometry is the CLASSIC_3UP default in @photobooth/shared:
 * 1800x1200 at 300dpi for the SELPHY's postcard size, tuned against real
 * prints.
 */
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    canvas: jsonb('canvas').$type<{ w: number; h: number }>().notNull(),
    cells: jsonb('cells').$type<Cell[]>().notNull(),
    backgroundAssetId: uuid('background_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    backgroundColor: text('background_color').notNull().default('#ffffff'),
    ...timestamps,
  },
  (t) => [index('templates_tenant_idx').on(t.tenantId)],
)

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    templateId: uuid('template_id').references(() => templates.id, {
      onDelete: 'restrict',
    }),
    /** What the guest QR code encodes. Short, unique, case-insensitive. */
    joinCode: text('join_code').notNull(),
    status: eventStatus('status').notNull().default('draft'),
    /**
     * The single value rendered on the guest page, the booth idle screen, the
     * printed QR card, the owner dashboard and both warning emails. If these
     * ever disagree, the promise made to guests is broken.
     */
    retentionUntil: timestamp('retention_until', { withTimezone: true }).notNull(),
    /** Set when the owner closes the party; triggers the download prompt. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Soft delete, so it vanishes from every UI before the purge job runs. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('events_join_code_key').on(t.joinCode),
    index('events_tenant_idx').on(t.tenantId, t.eventDate),
  ],
)

/**
 * Both the tripod phone and the Pi print agent. One pairing primitive: a
 * short code is exchanged once for a long-lived device token, of which only
 * the hash is stored.
 *
 * In practice the booth phone is already signed in as the owner, so pairing
 * it is one authenticated call; the code path really exists for the Pi,
 * which has no human to log it in.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    kind: deviceKind('kind').notNull(),
    label: text('label'),
    pairingCode: text('pairing_code'),
    pairingExpiresAt: timestamp('pairing_expires_at', { withTimezone: true }),
    tokenHash: text('token_hash'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Last `lpstat` report from a print agent. Null for booth devices. */
    printerState: jsonb('printer_state').$type<{
      state: 'idle' | 'printing' | 'stopped' | 'unknown'
      message: string | null
    }>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('devices_pairing_code_key').on(t.pairingCode),
    index('devices_tenant_idx').on(t.tenantId),
    index('devices_event_idx').on(t.eventId, t.kind),
  ],
)

// ---------------------------------------------------------------------------
// The party itself
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Short, human-readable. Shown on the booth for queue position. */
    code: text('code').notNull(),
    /**
     * Hash of the secret in the guest's URL. The link is the credential, so
     * the raw token is never stored -- if this table leaked, the links in it
     * would still not open anyone's photos.
     */
    guestTokenHash: text('guest_token_hash').notNull(),
    status: sessionStatus('status').notNull().default('queued'),
    shotsExpected: smallint('shots_expected').notNull(),
    shotsTaken: smallint('shots_taken').notNull().default(0),
    /** Composed by the API with sharp; the Pi only ever prints this file. */
    montagePath: text('montage_path'),
    error: text('error'),
    /** Set when a guest uses "delete my photos" on their own link. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_code_key').on(t.code),
    index('sessions_event_idx').on(t.eventId, t.createdAt),
    index('sessions_tenant_idx').on(t.tenantId),
  ],
)

/** The individual shots. Deleted well before the montage -- see retention.ts. */
export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Capture order, and the index of the template cell it belongs in. */
    idx: smallint('idx').notNull(),
    gcsPath: text('gcs_path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('photos_session_idx_key').on(t.sessionId, t.idx),
    index('photos_tenant_idx').on(t.tenantId),
  ],
)

/**
 * A print, tracked end to end. v1 fired `lp` and returned success
 * immediately, so it never knew whether anything actually came out. The
 * agent reports the CUPS job id back and then polls `lpstat` to a terminal
 * state, which is what lets the dashboard say "out of paper" instead of
 * silently queueing.
 */
export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    status: printJobStatus('status').notNull().default('queued'),
    cupsJobId: text('cups_job_id'),
    /** 'guest' or a user id -- who asked, for the reprint audit trail. */
    requestedBy: text('requested_by').notNull(),
    error: text('error'),
    ...timestamps,
  },
  (t) => [
    index('print_jobs_device_idx').on(t.deviceId, t.status),
    index('print_jobs_session_idx').on(t.sessionId),
    index('print_jobs_tenant_idx').on(t.tenantId),
  ],
)

/**
 * Outbound email, queued rather than sent inline: the Pi and the venue will
 * be offline sometimes, and a guest's photos should not be lost because the
 * wifi dropped at the wrong moment.
 */
export const emailDeliveries = pgTable(
  'email_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for sign-in codes, which happen before any tenant exists. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, {
      onDelete: 'cascade',
    }),
    toEmail: text('to_email').notNull(),
    kind: emailKind('kind').notNull(),
    status: emailStatus('status').notNull().default('queued'),
    resendId: text('resend_id'),
    attempts: smallint('attempts').notNull().default(0),
    error: text('error'),
    /**
     * Guest addresses exist only to deliver their photos and are cleared with
     * the session. They are never reused for marketing.
     */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('email_deliveries_status_idx').on(t.status, t.createdAt),
    index('email_deliveries_session_idx').on(t.sessionId),
  ],
)

/** Audit of what the retention job actually deleted. */
export const retentionRuns = pgTable('retention_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  rawFramesDeleted: integer('raw_frames_deleted').notNull().default(0),
  montagesDeleted: integer('montages_deleted').notNull().default(0),
  eventsPurged: integer('events_purged').notNull().default(0),
  succeeded: boolean('succeeded').notNull().default(true),
  error: text('error'),
})
