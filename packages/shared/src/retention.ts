/**
 * Retention is a promise made to guests, so it is computed in exactly one
 * place and rendered from the same value everywhere it appears: the guest
 * page, the booth idle screen, the printed QR card, the owner's dashboard
 * and the warning emails. If these ever disagree, the promise is broken.
 *
 * Enforcement is a daily job, with GCS lifecycle rules as an independent
 * backstop so photos still expire if that job stops running.
 */

/** Raw individual shots. Intermediate data, kept briefly. */
export const RAW_FRAME_RETENTION_DAYS = 30

/** The finished montage. What people actually care about. */
export const DEFAULT_MONTAGE_RETENTION_DAYS = 90

/** Owners are warned this many days before deletion, with a download link. */
export const WARNING_DAYS_BEFORE = [14, 3] as const

export function retentionUntil(
  eventDate: Date,
  days: number = DEFAULT_MONTAGE_RETENTION_DAYS,
): Date {
  const until = new Date(eventDate)
  until.setUTCDate(until.getUTCDate() + days)
  return until
}

export function daysRemaining(until: Date, now: Date = new Date()): number {
  const ms = until.getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

function formatDate(until: Date, locale: string): string {
  return until.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * The short form, for where someone is glancing rather than reading -- the
 * booth's idle screen, a header.
 *
 * Positive on purpose. "Then permanently deleted" is true but it is a warning,
 * and a warning is the wrong note to strike at a party. How long the photos
 * are kept is the useful fact; that they end afterwards is implied by "until",
 * and spelled out where someone is actually deciding something.
 */
export function retentionNotice(until: Date, locale = 'en-GB'): string {
  return `Your photos are saved until ${formatDate(until, locale)}.`
}

/**
 * The full form, for the moment a guest is deciding what to do with their
 * photos -- beside the email field, and on the privacy page.
 *
 * Here the deletion is stated outright, along with the fact they can delete
 * them sooner. Being clear is the point at this moment; at the booth it was
 * only decoration.
 */
export function retentionNoticeFull(until: Date, locale = 'en-GB'): string {
  return (
    `Your photos are saved until ${formatDate(until, locale)} and then deleted. ` +
    `You can delete them sooner from this page whenever you like.`
  )
}

/** Shown on the owner's dashboard, where the countdown is the useful part. */
export function ownerRetentionNotice(
  until: Date,
  locale = 'en-GB',
): string {
  const days = daysRemaining(until)
  const date = until.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  if (days === 0) return 'These photos are being deleted today.'
  return `${days} day${days === 1 ? '' : 's'} left. Everything is deleted on ${date} — download it before then.`
}
