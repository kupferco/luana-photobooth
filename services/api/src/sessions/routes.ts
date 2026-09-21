import { createHash } from 'node:crypto'
import {
  retentionNotice,
  retentionNoticeFull,
  shotCount,
  type SessionView,
} from '@photobooth/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  createSession,
  eventQueue,
  getEvent,
  getLiveEventByJoinCode,
  getSessionByCode,
  getTemplate,
  listDevices,
  toTemplate,
  updateSession,
} from '../db/repo'
import { guestToken, isWellFormedCode, normaliseCode, sessionCode } from '../lib/codes'
import { createReadUrl } from '../storage/gcs'

export const sessionRoutes: Router = Router()

/** The guest's URL token is a credential, so only its hash is stored. */
export const hashGuestToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

// ---------------------------------------------------------------------------
// Arriving from the QR code. No account, no sign-in: the join code is enough.
// ---------------------------------------------------------------------------

/**
 * What the guest page shows before anyone taps anything: which party this is,
 * how many shots to expect, how long the photos are kept.
 *
 * Both retention lines come from the event's single retentionUntil value, so
 * the guest page, booth screen, QR card and emails cannot disagree about the
 * date even where they differ in wording.
 */
/** A booth that has not called in for half a minute is not there. */
const BOOTH_ONLINE_MS = 30_000

async function isBoothOnline(tenantId: string, eventId: string): Promise<boolean> {
  const devices = await listDevices(tenantId, eventId)
  return devices.some(
    (d) =>
      d.kind === 'booth' &&
      d.lastSeenAt !== null &&
      Date.now() - d.lastSeenAt.getTime() < BOOTH_ONLINE_MS,
  )
}

sessionRoutes.get('/join/:joinCode', async (req, res, next) => {
  try {
    const code = normaliseCode(req.params.joinCode ?? '')
    if (!isWellFormedCode(code)) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const event = await getLiveEventByJoinCode(code)
    if (!event) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'That party is not running.' },
      })
    }

    const template = event.templateId
      ? await getTemplate(event.tenantId, event.templateId)
      : null

    const queue = await eventQueue(event.tenantId, event.id)

    return res.json({
      event: {
        name: event.name,
        joinCode: event.joinCode,
        retentionUntil: event.retentionUntil.toISOString(),
        // Short for a header, full for beside the email field. The guest page
        // decides which moment it is; the date behind both is the same value.
        retentionNotice: retentionNotice(event.retentionUntil),
        retentionNoticeFull: retentionNoticeFull(event.retentionUntil),
      },
      shotsExpected: template ? shotCount(toTemplate(template)) : 3,
      queueDepth: queue.length,
      boothOnline: await isBoothOnline(event.tenantId, event.id),
    })
  } catch (e) {
    return next(e)
  }
})

/**
 * A guest taps Start.
 *
 * Returns a short code and a secret token. The token goes in their URL and is
 * the only credential for that session -- the link *is* the access, which is
 * how someone with no account comes back to their photos later.
 */
sessionRoutes.post('/join/:joinCode/sessions', async (req, res, next) => {
  try {
    const code = normaliseCode(req.params.joinCode ?? '')
    if (!isWellFormedCode(code)) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const event = await getLiveEventByJoinCode(code)
    if (!event) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'That party is not running.' },
      })
    }

    const queue = await eventQueue(event.tenantId, event.id)

    // One booth, one camera, one person in front of it. A queue depth beyond
    // a handful means something is stuck, not that ten people are patiently
    // waiting, so refuse rather than pile up.
    if (queue.length >= 5) {
      return res.status(429).json({
        error: {
          code: 'queue_full',
          message: 'There is a queue at the booth. Try again in a moment.',
        },
      })
    }

    const template = event.templateId
      ? await getTemplate(event.tenantId, event.templateId)
      : null
    const shotsExpected = template ? shotCount(toTemplate(template)) : 3

    const token = guestToken()
    const session = await createSession(event.tenantId, {
      eventId: event.id,
      code: sessionCode(),
      guestTokenHash: hashGuestToken(token),
      shotsExpected,
    })

    return res.status(201).json({
      code: session.code,
      token,
      queuePosition: queue.length,
      shotsExpected,
      retentionUntil: event.retentionUntil.toISOString(),
    })
  } catch (e) {
    return next(e)
  }
})

// ---------------------------------------------------------------------------
// Polling. Called every couple of seconds while a session runs.
// ---------------------------------------------------------------------------

const TokenQuery = z.object({ token: z.string().min(1) })

/**
 * The guest's view of their own session.
 *
 * This is what `subscribeToSession` polls. Deliberately small and cheap: a
 * session changes state about three times in a minute, which is why this is
 * polled rather than pushed -- see docs/architecture.md.
 */
sessionRoutes.get('/sessions/:code', async (req, res, next) => {
  try {
    const query = TokenQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const session = await getSessionByCode(normaliseCode(req.params.code ?? ''))

    // Wrong token and no such session give the same answer, so the code space
    // cannot be probed.
    if (!session || session.guestTokenHash !== hashGuestToken(query.data.token)) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const event = await getEvent(session.tenantId, session.eventId)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const queue = await eventQueue(session.tenantId, session.eventId)
    const position = queue.findIndex((s) => s.id === session.id)

    const view: SessionView = {
      code: session.code,
      status: session.status,
      queuePosition: session.status === 'queued' ? Math.max(0, position) : null,
      montageUrl: session.montagePath
        ? await createReadUrl(session.montagePath, session.tenantId)
        : null,
      shotCount: session.shotsExpected,
      shotsTaken: session.shotsTaken,
      print: null,
      boothOnline: await isBoothOnline(session.tenantId, session.eventId),
      error: session.error,
      retentionUntil: event.retentionUntil.toISOString(),
    }

    return res.json(view)
  } catch (e) {
    return next(e)
  }
})

/**
 * The guest deleting their own photos.
 *
 * On every guest link, on purpose: it is the single thing that most changes
 * how this feels to a parent at someone else's party. Soft delete here; the
 * objects go with the retention job.
 */
sessionRoutes.delete('/sessions/:code', async (req, res, next) => {
  try {
    const query = TokenQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const session = await getSessionByCode(normaliseCode(req.params.code ?? ''))
    if (!session || session.guestTokenHash !== hashGuestToken(query.data.token)) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    await updateSession(session.tenantId, session.id, { deletedAt: new Date() })
    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})
