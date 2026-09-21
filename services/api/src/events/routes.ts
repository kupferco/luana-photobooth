import { DEFAULT_MONTAGE_RETENTION_DAYS, retentionUntil, shotCount } from '@photobooth/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  createEvent,
  eventStats,
  gallery,
  getEvent,
  listEvents,
  listTemplates,
  softDeleteEvent,
  toTemplate,
  updateEvent,
} from '../db/repo'
import { eventJoinCode } from '../lib/codes'
import { requireAuth, requireTenant } from '../middleware/auth'
import { createReadUrl } from '../storage/gcs'

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
