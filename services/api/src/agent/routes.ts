import { and, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client'
import { getSession, touchDevice } from '../db/repo'
import { printJobs } from '../db/schema'
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

    /*
     * Claimed in one statement, not selected and then updated.
     *
     * An event can have more than one printer -- a big party with two booths,
     * or a spare kept running. Two agents polling the same instant would both
     * see the same queued row and both print it: two sheets for one photo,
     * and the guest none the wiser about which is theirs.
     *
     * FOR UPDATE SKIP LOCKED makes the claim atomic and, better, lets the
     * second agent step straight past the locked row to the next job rather
     * than waiting behind it. Two printers then drain the queue in parallel,
     * which is the point of having two.
     */
    /*
     * Resolve prints whose photos have since been deleted.
     *
     * The claim below excludes them, correctly -- a guest who asked for their
     * photos to be removed must not have one appear from a printer days
     * later. But excluding them left the job 'queued' for ever, looking to
     * anyone reading the table like a print that never happened rather than
     * one that was deliberately abandoned.
     *
     * Cheap, and it runs here because this is the only place that looks at
     * the queue often enough to keep it tidy.
     */
    await db.execute(sql`
      UPDATE print_jobs pj
         SET status = 'failed',
             error = 'The photos were deleted before this could print.',
             updated_at = now()
        FROM sessions s
       WHERE s.id = pj.session_id
         AND pj.tenant_id = ${tenantId}
         AND s.event_id = ${eventId}
         AND pj.status = 'queued'
         AND s.deleted_at IS NOT NULL
    `)

    const claimed = await db.execute(sql`
      UPDATE print_jobs
         SET status = 'sent',
             device_id = ${req.device!.deviceId},
             updated_at = now()
       WHERE id = (
             SELECT pj.id
               FROM print_jobs pj
               JOIN sessions s ON s.id = pj.session_id
              WHERE pj.tenant_id = ${tenantId}
                AND s.event_id = ${eventId}
                AND pj.status = 'queued'
                AND s.deleted_at IS NULL
              ORDER BY pj.created_at ASC
              LIMIT 1
              FOR UPDATE OF pj SKIP LOCKED
             )
   RETURNING id, session_id
    `)

    const job = (claimed as unknown as { id: string; session_id: string }[])[0]
    if (!job) return res.json({ job: null })

    const session = await getSession(tenantId, job.session_id)
    if (!session?.montagePath) {
      // The montage went away between queueing and claiming -- a guest
      // deleting their photos, most likely. Resolve the job rather than
      // handing the agent something it cannot print.
      await db
        .update(printJobs)
        .set({
          status: 'failed',
          error: 'The photo was no longer available.',
          updatedAt: new Date(),
        })
        .where(eq(printJobs.id, job.id))
      return res.json({ job: null })
    }

    return res.json({
      job: {
        id: job.id,
        code: session.code,
        // Signed for the agent to fetch directly. The bytes never pass
        // through this API.
        url: await createReadUrl(session.montagePath, tenantId),
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
