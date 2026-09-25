import { DEFAULT_MONTAGE_RETENTION_DAYS, retentionUntil, shotCount } from '@photobooth/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  createEvent,
  eventStats,
  gallery,
  getEvent,
  getSession,
  listEvents,
  listTemplates,
  queuePrint,
  ensureShareToken,
  releaseEventDevices,
  setEventBackground,
  softDeleteEvent,
  toTemplate,
  updateEvent,
} from '../db/repo'
import { eventJoinCode } from '../lib/codes'
import { requireAuth, requireTenant } from '../middleware/auth'
import { queueEmail } from '../email/queue'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env'
import { createReadUrl, createUploadTicket, exists } from '../storage/gcs'
import { backgroundPath } from '../storage/paths'
import { downloadEventZip } from './download'

export const eventRoutes: Router = Router()

eventRoutes.use(requireAuth)

const CreateBody = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(120),
  eventDate: z.coerce.date(),
  templateId: z.string().uuid().optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
})

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['draft', 'live', 'ended']).optional(),
  templateId: z.string().uuid().optional(),
  /**
   * Capped at 3. Beyond that a guest can hold the booth for as long as they
   * like, which is a queue nobody else gets to the front of.
   */
  retakesAllowed: z.number().int().min(0).max(3).optional(),
})

const TenantQuery = z.object({ tenantId: z.string().uuid() })

/** Everything the owner's dashboard shows for one event. */
/**
 * Async because the background needs signing.
 *
 * The stored path is never sent to a client: it names the bucket layout and
 * is useless without credentials anyway. What goes out is a short-lived
 * signed URL, which is enough to show a preview and expires on its own.
 */
async function present(event: Awaited<ReturnType<typeof getEvent>>) {
  if (!event) return null
  return {
    id: event.id,
    name: event.name,
    eventDate: event.eventDate.toISOString(),
    status: event.status,
    joinCode: event.joinCode,
    templateId: event.templateId,
    retentionUntil: event.retentionUntil.toISOString(),
    endedAt: event.endedAt?.toISOString() ?? null,
    retakesAllowed: event.retakesAllowed,
    backgroundUrl: event.backgroundPath
      ? await createReadUrl(event.backgroundPath, event.tenantId)
      : null,
  }
}

eventRoutes.post('/', async (req, res, next) => {
  try {
    const body = CreateBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Give the party a name and a date.' },
      })
    }

    requireTenant(req, body.data.tenantId)

    // Default to the tenant's first template, which is seeded at sign-up, so
    // creating an event never requires choosing one first.
    let templateId = body.data.templateId
    if (!templateId) {
      const [first] = await listTemplates(body.data.tenantId)
      if (!first) {
        return res.status(409).json({
          error: { code: 'no_template', message: 'This account has no photo layout yet.' },
        })
      }
      templateId = first.id
    }

    const event = await createEvent(body.data.tenantId, {
      name: body.data.name,
      eventDate: body.data.eventDate,
      templateId,
      joinCode: eventJoinCode(),
      retentionUntil: retentionUntil(
        body.data.eventDate,
        body.data.retentionDays ?? DEFAULT_MONTAGE_RETENTION_DAYS,
      ),
    })

    return res.status(201).json({ event: await present(event) })
  } catch (e) {
    return next(e)
  }
})

eventRoutes.get('/', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const rows = await listEvents(query.data.tenantId)
    /*
     * Promise.all, because present is async now.
     *
     * `rows.map(present)` returned an array of promises, which res.json
     * serialised as `{}` -- so every event arrived with every field
     * undefined and the home screen rendered cards for nothing. TypeScript
     * could not help: res.json takes anything, and an array of promises is a
     * perfectly good anything.
     */
    return res.json({ events: await Promise.all(rows.map((row) => present(row))) })
  } catch (e) {
    return next(e)
  }
})

eventRoutes.get('/:eventId', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const event = await getEvent(query.data.tenantId, req.params.eventId!)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const templates = await listTemplates(query.data.tenantId)
    const template = templates.find((t) => t.id === event.templateId)

    return res.json({
      event: await present(event),
      template: template ? toTemplate(template) : null,
      shotsExpected: template ? shotCount(toTemplate(template)) : null,
    })
  } catch (e) {
    return next(e)
  }
})

/** What the owner's dashboard polls while a party is running. */
eventRoutes.get('/:eventId/stats', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const event = await getEvent(query.data.tenantId, req.params.eventId!)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    return res.json(await eventStats(query.data.tenantId, event.id))
  } catch (e) {
    return next(e)
  }
})

/**
 * The gallery. Montage URLs are signed per request and short-lived, so the
 * list cannot be cached into a set of durable links to someone's photos.
 */
eventRoutes.get('/:eventId/sessions', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const event = await getEvent(query.data.tenantId, req.params.eventId!)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const rows = await gallery(query.data.tenantId, event.id)

    const sessions = await Promise.all(
      rows.map(async ({ row, printCount, lastPrint, emailedTo }) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        montageUrl: row.montagePath
          ? await createReadUrl(row.montagePath, query.data.tenantId)
          : null,
        printCount,
        printStatus: lastPrint?.status ?? null,
        printError: lastPrint?.error ?? null,
        emailedTo,
      })),
    )

    return res.json({ sessions })
  } catch (e) {
    return next(e)
  }
})

const EmailBody = z.object({ to: z.string().email() })

/**
 * Print a montage.
 *
 * Queues the job; the print agent collects it. Nothing here waits for paper
 * to come out, because the Pi may be mid-print or out of paper, and an owner
 * tapping print should not sit on a spinner while that resolves.
 */
eventRoutes.post('/:eventId/sessions/:sessionId/print', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    const membership = requireTenant(req, query.data.tenantId)

    const session = await getSession(query.data.tenantId, req.params.sessionId!)
    if (!session || session.eventId !== req.params.eventId) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (session.status !== 'ready' || !session.montagePath) {
      return res.status(409).json({
        error: { code: 'not_ready', message: 'That photo is not finished yet.' },
      })
    }

    const job = await queuePrint(query.data.tenantId, {
      sessionId: session.id,
      requestedBy: `${membership.role}:${req.auth!.userId}`,
    })

    return res.status(202).json({ id: job.id, status: job.status })
  } catch (e) {
    return next(e)
  }
})

/**
 * A link worth sending someone.
 *
 * Signed for seven days -- the V4 maximum -- rather than the hour the gallery
 * uses. A link pasted into WhatsApp gets opened when someone gets round to
 * it, which is not within the hour, and a dead link is worse than no link.
 */
eventRoutes.post('/:eventId/sessions/:sessionId/share-link', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const session = await getSession(query.data.tenantId, req.params.sessionId!)
    if (!session || session.eventId !== req.params.eventId) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (!session.montagePath) {
      return res.status(409).json({
        error: { code: 'not_ready', message: 'That photo is not finished yet.' },
      })
    }

    const event = await getEvent(query.data.tenantId, session.eventId)
    const token = await ensureShareToken(query.data.tenantId, session.id)

    if (!token) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    /*
     * A short link to a page, not a signed URL to a file.
     *
     * It used to hand out the storage URL directly: several hundred
     * characters of signature, dead after seven days, and it exposed the
     * bucket layout to anyone it was forwarded to. Pasted into a group chat
     * it looked like spam and stopped working before most people opened it.
     *
     * This one is short, survives as long as the photos do, and goes to a
     * page we control -- so it can carry the event's name and say when the
     * photos will be deleted.
     */
    return res.json({
      url: `${env.GUEST_URL}/p/${token}`,
      title: event?.name ?? 'Photo Booth',
      expiresInDays: null,
    })
  } catch (e) {
    return next(e)
  }
})

/** Email a montage to whoever the owner names. */
eventRoutes.post('/:eventId/sessions/:sessionId/email', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    const body = EmailBody.safeParse(req.body)
    if (!query.success || !body.success) {
      return res.status(400).json({
        error: { code: 'invalid_email', message: 'That does not look like an email address.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const session = await getSession(query.data.tenantId, req.params.sessionId!)
    if (!session || session.eventId !== req.params.eventId) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (!session.montagePath) {
      return res.status(409).json({
        error: { code: 'not_ready', message: 'That photo is not finished yet.' },
      })
    }

    const event = await getEvent(query.data.tenantId, session.eventId)

    /*
     * The same short link the share button hands out.
     *
     * A signed storage URL was used here, which expired after seven days --
     * the longest such a signature can live. People open a photo email weeks
     * later, and finding a dead link then is worse than never being sent
     * one. This link lasts as long as the photographs do.
     */
    const token = await ensureShareToken(query.data.tenantId, session.id)
    if (!token) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    const link = `${env.GUEST_URL}/p/${token}`

    await queueEmail({
      to: body.data.to,
      kind: 'guest_photos',
      tenantId: query.data.tenantId,
      sessionId: session.id,
      subject: `Your photo from ${event?.name ?? 'the party'}`,
      text:
        `Here is your photo: ${link}\n\n` +
        (event
          ? `It is saved until ${event.retentionUntil.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}.\n\n`
          : '') +
        `This link works for seven days. Save the picture to keep it.`,
    })

    return res.status(202).json({ sent: true })
  } catch (e) {
    return next(e)
  }
})

eventRoutes.patch('/:eventId', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    const body = PatchBody.safeParse(req.body)
    if (!query.success || !body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Nothing valid to change.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    // Closing the party stamps endedAt, which is what triggers the
    // download-everything prompt in the app.
    const patch =
      body.data.status === 'ended'
        ? { ...body.data, endedAt: new Date() }
        : body.data

    const event = await updateEvent(query.data.tenantId, req.params.eventId!, patch)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    /*
     * Ending the party hands the hardware back.
     *
     * Without this a printer stayed bound to a finished event and was
     * invisible to the next one -- and an online Pi never broadcasts a setup
     * network, so there was no obvious way to recover it. Orphaned by the one
     * action that should most clearly have freed it.
     */
    if (body.data.status === 'ended') {
      const released = await releaseEventDevices(query.data.tenantId, event.id)
      console.log(
        `event ${event.id} ended: released ${released.printersReleased} printer(s), ` +
          `stopped ${released.boothsStopped} booth(s)`,
      )
    }

    return res.json({ event: await present(event) })
  } catch (e) {
    return next(e)
  }
})

/**
 * Every photo from the party, as one zip.
 *
 * Defined before the generic routes below it only for readability; Express
 * matches on the full path, so ordering does not matter here.
 */
const BackgroundBody = z.object({
  tenantId: z.string().uuid(),
  contentType: z.enum(['image/jpeg', 'image/png']),
})

/**
 * Somewhere to put the artwork for this party.
 *
 * The bytes go straight to storage with a signed URL, the same way a booth
 * uploads a photo -- a 4MB background has no business passing through Cloud
 * Run twice. The event is pointed at it only once the upload has landed, so
 * a failed upload leaves the previous background in place rather than a
 * broken reference.
 */
eventRoutes.post('/:eventId/background/upload', async (req, res, next) => {
  try {
    const body = BackgroundBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'A JPEG or PNG is required.' },
      })
    }
    requireTenant(req, body.data.tenantId)

    const event = await getEvent(body.data.tenantId, req.params.eventId!)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    // A new id each time, so a replaced background cannot be served from a
    // cache or a signed URL someone still holds.
    const ext = body.data.contentType === 'image/png' ? 'png' : 'jpg'
    const path = backgroundPath(body.data.tenantId, randomUUID(), ext)

    return res.json(
      await createUploadTicket(path, body.data.tenantId, body.data.contentType),
    )
  } catch (e) {
    return next(e)
  }
})

const SetBackgroundBody = z.object({
  tenantId: z.string().uuid(),
  /** Null removes it and goes back to the template's flat colour. */
  path: z.string().max(400).nullable(),
})

/** Confirms the upload landed, or clears the background. */
eventRoutes.put('/:eventId/background', async (req, res, next) => {
  try {
    const body = SetBackgroundBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, body.data.tenantId)

    /*
     * Check it is really there before pointing the event at it.
     *
     * Otherwise a failed or abandoned upload leaves every montage for the
     * rest of the party trying to fetch a file that does not exist -- and
     * the first anyone would know is a printed photo with no background.
     */
    if (body.data.path) {
      if (!body.data.path.includes(`/t/${body.data.tenantId}/`)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'That is not your file.' },
        })
      }
      if (!(await exists(body.data.path, body.data.tenantId))) {
        return res.status(409).json({
          error: { code: 'not_uploaded', message: 'That image did not finish uploading.' },
        })
      }
    }

    const event = await setEventBackground(
      body.data.tenantId,
      req.params.eventId!,
      body.data.path,
    )
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    return res.json({ event: await present(event) })
  } catch (e) {
    return next(e)
  }
})

eventRoutes.get('/:eventId/download', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    return await downloadEventZip(res, query.data.tenantId, req.params.eventId!)
  } catch (e) {
    // Only reachable before the first byte is written; once the zip is
    // streaming, download.ts owns the failure.
    return next(e)
  }
})

eventRoutes.delete('/:eventId', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const row = await softDeleteEvent(query.data.tenantId, req.params.eventId!)
    if (!row) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    // Soft delete only: it leaves every UI immediately, and the retention job
    // purges the objects from GCS behind it.
    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})
