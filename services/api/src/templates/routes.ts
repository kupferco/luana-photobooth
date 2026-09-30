import { shotCount } from '@photobooth/shared'
import { Router } from 'express'
import { z } from 'zod'
import { listTemplates, toTemplate } from '../db/repo'
import { requireAuth, requireTenant } from '../middleware/auth'

export const templateRoutes: Router = Router()

templateRoutes.use(requireAuth)

const TenantQuery = z.object({ tenantId: z.string().uuid() })

/**
 * The layouts this account can put an event on.
 *
 * Its own route rather than a path under /events, because a layout belongs
 * to the account and not to any one party -- and because a literal segment
 * living beside /events/:eventId only works while nobody reorders them.
 */
templateRoutes.get('/', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const rows = await listTemplates(query.data.tenantId)

    return res.json({
      templates: rows.map((row) => {
        const template = toTemplate(row)
        return { id: row.id, name: row.name, template, shots: shotCount(template) }
      }),
    })
  } catch (e) {
    return next(e)
  }
})
