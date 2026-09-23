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
  softDeleteEvent,
  toTemplate,
  updateEvent,
} from '../db/repo'
import { eventJoinCode } from '../lib/codes'
import { requireAuth, requireTenant } from '../middleware/auth'
import { queueEmail } from '../email/queue'
import { createReadUrl, MAX_SIGNED_URL_MS } from '../storage/gcs'
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
})

const TenantQuery = z.object({ tenantId: z.string().uuid() })

/** Everything the owner's dashboard shows for one event. */
function present(event: Awaited<ReturnType<typeof getEvent>>) {
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

    return res.status(201).json({ event: present(event) })
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
    return res.json({ events: rows.map(present) })
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
      event: present(event),
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
      rows.map(async ({ row, printCount, emailedTo }) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        montageUrl: row.montagePath
          ? await createReadUrl(row.montagePath, query.data.tenantId)
          : null,
        printCount,
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

    return res.json({
      url: await createReadUrl(
        session.montagePath,
        query.data.tenantId,
        MAX_SIGNED_URL_MS,
      ),
      title: event?.name ?? 'Photo Booth',
      expiresInDays: 7,
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

    // A week is the longest a V4 signature can live, and is long enough that
    // the link still works when someone opens the email days later.
    const link = await createReadUrl(
      session.montagePath,
      query.data.tenantId,
      MAX_SIGNED_URL_MS,
    )

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
    return res.json({ event: present(event) })
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
