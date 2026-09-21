import { and, asc, eq, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client'
import { getSession, touchDevice } from '../db/repo'
import { printJobs, sessions } from '../db/schema'
import { requireDevice } from '../middleware/device'
import { createReadUrl } from '../storage/gcs'

/**
 * What the print agent on the Raspberry Pi talks to.
 *
 * The Pi holds no inbound port and accepts no connections. It polls, prints,
 * and reports -- which is why setting one up needs no certificate, no port
 * forwarding and no fixed address, only wifi and a pairing code.
 *
 * Nothing here trusts the agent's word about which event it serves: that
 * comes from the device token, so a compromised agent can only ever see its
 * own event's jobs.
 */
export const agentRoutes: Router = Router()

agentRoutes.use(requireDevice('agent'))

const PrinterState = z.object({
  state: z.enum(['idle', 'printing', 'stopped', 'unknown']),
  message: z.string().max(200).nullable(),
})

/**
 * Heartbeat and printer state.
 *
 * The printer's condition arrives here rather than being inferred, because
 * "out of paper" is something only the Pi can see and is the single most
 * useful thing the owner's dashboard can say during a party.
 */
agentRoutes.post('/heartbeat', async (req, res, next) => {
  try {
    const body = PrinterState.safeParse(req.body)
    await touchDevice(req.device!.deviceId, body.success ? body.data : undefined)
    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})

/**
 * The next job to print, if any.
 *
 * One at a time: a SELPHY takes about a minute a sheet, so there is no point
 * handing the agent work it cannot start, and a queue that lives in the
 * database survives the Pi being unplugged mid-party.
 */
agentRoutes.get('/jobs/next', async (req, res, next) => {
  try {
    const { tenantId, eventId } = req.device!

    if (!eventId) {
      return res.status(409).json({
        error: { code: 'no_event', message: 'This printer is not attached to an event.' },
      })
    }

    // Anything already sent and not yet resolved blocks the next one, so a
    // crashed agent does not leave the queue stalled forever -- the job's own
    // timeout resolves it and the next poll picks up work again.
    const [row] = await db
      .select({
        id: printJobs.id,
        sessionId: printJobs.sessionId,
        status: printJobs.status,
        sessionCode: sessions.code,
        montagePath: sessions.montagePath,
      })
      .from(printJobs)
      .innerJoin(sessions, eq(sessions.id, printJobs.sessionId))
      .where(
        and(
          eq(printJobs.tenantId, tenantId),
          eq(sessions.eventId, eventId),
          inArray(printJobs.status, ['queued']),
        ),
      )
      .orderBy(asc(printJobs.createdAt))
      .limit(1)

    if (!row || !row.montagePath) {
      return res.json({ job: null })
    }

    await db
      .update(printJobs)
      .set({
        status: 'sent',
        deviceId: req.device!.deviceId,
        updatedAt: new Date(),
      })
      .where(eq(printJobs.id, row.id))

    return res.json({
      job: {
        id: row.id,
        code: row.sessionCode,
        // Signed for the agent to fetch directly. The bytes never pass
        // through this API.
        url: await createReadUrl(row.montagePath, tenantId),
      },
    })
  } catch (e) {
    return next(e)
  }
})

const StatusBody = z.object({
  status: z.enum(['printing', 'printed', 'failed']),
  cupsJobId: z.string().max(100).nullable().optional(),
  error: z.string().max(500).nullable().optional(),
})

/**
 * What happened to a job.
 *
 * v1 fired `lp` and called it success. Here the agent reports the CUPS job
 * id when it is accepted and again when it actually leaves the printer, so
 * the dashboard can tell "queued" from "printed" from "the printer refused
 * it" -- which is the difference between a working party and a mystery.
 */
agentRoutes.post('/jobs/:jobId/status', async (req, res, next) => {
  try {
    const body = StatusBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Unknown job status.' },
      })
    }

    const { tenantId, deviceId } = req.device!

    const [job] = await db
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, req.params.jobId!), eq(printJobs.tenantId, tenantId)))
      .limit(1)

    if (!job) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    await db
      .update(printJobs)
      .set({
        status: body.data.status,
        cupsJobId: body.data.cupsJobId ?? job.cupsJobId,
        error: body.data.error ?? null,
        deviceId,
        updatedAt: new Date(),
      })
      .where(eq(printJobs.id, job.id))

    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})

/** What the agent should print, for a job it already holds. */
agentRoutes.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const { tenantId } = req.device!

    const [job] = await db
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, req.params.jobId!), eq(printJobs.tenantId, tenantId)))
      .limit(1)

    if (!job) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const session = await getSession(tenantId, job.sessionId)
    if (!session?.montagePath) {
      return res.status(409).json({
        error: { code: 'not_ready', message: 'That photo is not finished yet.' },
      })
    }

    return res.json({
      id: job.id,
      status: job.status,
      url: await createReadUrl(session.montagePath, tenantId),
    })
  } catch (e) {
    return next(e)
  }
})
