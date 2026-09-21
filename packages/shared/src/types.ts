import { z } from 'zod'

/**
 * Domain types shared by the Expo app, the guest web page, the API and the
 * print agent. These mirror the Postgres schema but are deliberately separate
 * from it: this is the shape that goes over the wire, so it never exposes
 * internal columns such as token hashes.
 */

/** Every tenant-scoped row carries this. See docs/architecture.md. */
export const TenantId = z.string().uuid()

export const MembershipRole = z.enum(['owner', 'admin', 'staff'])
export type MembershipRole = z.infer<typeof MembershipRole>

export const EventStatus = z.enum(['draft', 'live', 'ended'])
export type EventStatus = z.infer<typeof EventStatus>

export const DeviceKind = z.enum(['booth', 'agent'])
export type DeviceKind = z.infer<typeof DeviceKind>

/**
 * The lifecycle of one photo run, from a guest tapping Start to a printable
 * montage. The guest page and the booth both drive off this single value.
 *
 *   queued     waiting for the booth (someone else is mid-session)
 *   capturing  countdown running, shots being taken
 *   composing  shots uploaded, server building the montage
 *   ready      montage available; can be printed or emailed
 *   failed     gave up; `error` explains why
 *   abandoned  nobody stood in front of the camera and it timed out
 */
export const SessionStatus = z.enum([
  'queued',
  'capturing',
  'composing',
  'ready',
  'failed',
  'abandoned',
])
export type SessionStatus = z.infer<typeof SessionStatus>

export const PrintJobStatus = z.enum([
  'queued',
  'sent',
  'printing',
  'printed',
  'failed',
  'cancelled',
])
export type PrintJobStatus = z.infer<typeof PrintJobStatus>

/** What the guest page polls for. Deliberately small. */
export const SessionViewSchema = z.object({
  code: z.string(),
  status: SessionStatus,
  /** Position in the queue when status is 'queued'; 0 means next. */
  queuePosition: z.number().int().nonnegative().nullable(),
  /** Signed, short-lived GCS URL. Null until status is 'ready'. */
  montageUrl: z.string().url().nullable(),
  /** How many shots the template expects, so the guest can show progress. */
  shotCount: z.number().int().positive(),
  /** Shots captured so far, for the "2 of 3" indicator. */
  shotsTaken: z.number().int().nonnegative(),
  print: z
    .object({
      status: PrintJobStatus,
      queuePosition: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  /**
   * Whether the booth phone has called in recently.
   *
   * Without this a guest waiting behind a booth that is switched off sees a
   * queue and a spinner, and no way to tell the difference between "someone
   * is having their photo taken" and "there is nothing at the other end".
   */
  boothOnline: z.boolean(),
  /**
   * Set when it is this guest's turn and the booth is waiting on them.
   *
   * They are asked rather than assumed to be there, because a booth counting
   * down at an empty room while someone fetches a drink wastes everyone's
   * turn. Missing it costs them one place, not their place.
   */
  yourTurn: z
    .object({
      msLeft: z.number().int().nonnegative(),
      missesLeft: z.number().int().nonnegative(),
    })
    .nullable(),
  error: z.string().nullable(),
  /** When this session's photos are deleted. Shown to the guest verbatim. */
  retentionUntil: z.string().datetime(),
})
export type SessionView = z.infer<typeof SessionViewSchema>

/** Live state of an event, for the booth and the owner's dashboard. */
export const EventLiveSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string(),
  status: EventStatus,
  boothOnline: z.boolean(),
  /**
   * Set when it is this guest's turn and the booth is waiting on them.
   *
   * They are asked rather than assumed to be there, because a booth counting
   * down at an empty room while someone fetches a drink wastes everyone's
   * turn. Missing it costs them one place, not their place.
   */
  yourTurn: z
    .object({
      msLeft: z.number().int().nonnegative(),
      missesLeft: z.number().int().nonnegative(),
    })
    .nullable(),
  agentOnline: z.boolean(),
  /** From `lpstat` on the Pi. Null when no agent has ever reported. */
  printer: z
    .object({
      state: z.enum(['idle', 'printing', 'stopped', 'unknown']),
      message: z.string().nullable(),
    })
    .nullable(),
  queueDepth: z.number().int().nonnegative(),
  sessionsToday: z.number().int().nonnegative(),
  retentionUntil: z.string().datetime(),
})
export type EventLive = z.infer<typeof EventLiveSchema>

/** Uniform API error body. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
