import { shotCount, type Template } from '@photobooth/shared'
import { Router } from 'express'
import { z } from 'zod'
import {
  createSession,
  getEvent,
  getSession,
  getTemplate,
  listSessionPhotos,
  recordPhoto,
  toTemplate,
  updateSession,
} from '../db/repo'
import { guestToken, sessionCode } from '../lib/codes'
import { advanceQueue, markConfirmed } from '../queue'
import { requireDevice } from '../middleware/device'
import { composeMontage } from '../montage/compose'
import { hashGuestToken } from '../sessions/routes'
import { montagePath, rawFramePath } from '../storage/paths'
import { createUploadTicket, download, exists, upload } from '../storage/gcs'

export const boothRoutes: Router = Router()

boothRoutes.use(requireDevice('booth'))

/** Every route here needs the booth to be bound to an event. */
function boothEvent(req: Parameters<Parameters<Router['get']>[1]>[0]) {
  const device = req.device!
  if (!device.eventId) {
    const error = new Error('This booth is not attached to a party.') as Error & {
      status?: number
    }
    error.status = 409
    throw error
  }
  return { tenantId: device.tenantId, eventId: device.eventId }
}

/**
 * What the booth polls, roughly every two seconds.
 *
 * Returns the head of the queue, if anything is waiting. The booth starting a
 * session itself and a guest triggering one from their phone converge here:
 * both are just rows in the queue, so the booth has one code path rather than
 * two.
 */
boothRoutes.get('/poll', async (req, res, next) => {
  try {
    const { tenantId, eventId } = boothEvent(req)
    const event = await getEvent(tenantId, eventId)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    // The booth is asking, so by definition it is online.
    const state = await advanceQueue(tenantId, eventId, true)

    // Only a confirmed session is offered. Otherwise the booth would start
    // counting down at an empty room while its guest is still walking over --
    // or has left entirely.
    const next_ = state.head?.confirmedAt ? state.head : null

    // The booth needs the layout to draw its own preview while the server
    // composes the print file, so it comes down with the poll rather than
    // being fetched separately every session.
    const templateRow = event.templateId
      ? await getTemplate(tenantId, event.templateId)
      : null

    return res.json({
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        joinCode: event.joinCode,
        retentionUntil: event.retentionUntil.toISOString(),
      },
      template: templateRow ? toTemplate(templateRow) : null,
      queueDepth: state.queue.length,
      next: next_
        ? {
            id: next_.id,
            code: next_.code,
            status: 'queued' as const,
            shotsExpected: next_.shotsExpected,
          }
        : null,
      // Shown on the booth so the room can see it is waiting on someone
      // rather than broken.
      waitingFor: state.awaitingConfirmation
        ? { code: state.head!.code, msLeft: state.confirmMsLeft }
        : null,
    })
  } catch (e) {
    return next(e)
  }
})

/** Someone tapped Start on the booth itself rather than scanning the QR. */
boothRoutes.post('/sessions', async (req, res, next) => {
  try {
    const { tenantId, eventId } = boothEvent(req)
    const event = await getEvent(tenantId, eventId)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const template = event.templateId ? await getTemplate(tenantId, event.templateId) : null
    const shotsExpected = template ? shotCount(toTemplate(template)) : 3

    // Still gets a guest token: whoever stood at the booth may want the link,
    // and the montage should be reachable the same way however it started.
    const token = guestToken()
    const session = await createSession(tenantId, {
      eventId,
      code: sessionCode(),
      guestTokenHash: hashGuestToken(token),
      shotsExpected,
    })

    // Nobody to confirm with: whoever tapped is standing at the booth, and
    // the tap is the confirmation.
    await markConfirmed(session.id)

    return res.status(201).json({
      id: session.id,
      code: session.code,
      token,
      shotsExpected,
    })
  } catch (e) {
    return next(e)
  }
})

/** The booth takes a queued session and starts its countdown. */
boothRoutes.post('/sessions/:sessionId/claim', async (req, res, next) => {
  try {
    const { tenantId } = boothEvent(req)
    const session = await getSession(tenantId, req.params.sessionId!)
    if (!session) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (session.status !== 'queued') {
      return res.status(409).json({
        error: { code: 'already_claimed', message: 'That session has already started.' },
      })
    }

    const updated = await updateSession(tenantId, session.id, { status: 'capturing' })
    return res.json({ id: updated!.id, status: updated!.status })
  } catch (e) {
    return next(e)
  }
})

const UploadsBody = z.object({ count: z.number().int().min(1).max(6) })

/**
 * Signed URLs for the shots.
 *
 * The phone PUTs bytes straight to GCS. Image data never passes through Cloud
 * Run: proxying it would be slower, cost more, and hit the request size limit.
 */
boothRoutes.post('/sessions/:sessionId/uploads', async (req, res, next) => {
  try {
    const { tenantId, eventId } = boothEvent(req)
    const body = UploadsBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'How many shots?' },
      })
    }

    const session = await getSession(tenantId, req.params.sessionId!)
    if (!session) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const scope = { tenantId, eventId, sessionId: session.id }
    const tickets = await Promise.all(
      Array.from({ length: body.data.count }, (_, idx) =>
        createUploadTicket(rawFramePath(scope, idx), tenantId),
      ),
    )

    return res.json({ uploads: tickets.map((t, idx) => ({ idx, ...t })) })
  } catch (e) {
    return next(e)
  }
})

const CompleteBody = z.object({
  shots: z
    .array(
      z.object({
        idx: z.number().int().min(0).max(5),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1),
})

/**
 * The booth says its shots are uploaded; the server builds the print file.
 *
 * Composition happens here rather than on the phone so the layout lives in
 * one place and old sessions can be re-rendered under a new template. The
 * phone has already shown the guest its own preview, so nobody is waiting on
 * this to see something.
 */
boothRoutes.post('/sessions/:sessionId/complete', async (req, res, next) => {
  try {
    const { tenantId, eventId } = boothEvent(req)
    const body = CompleteBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Which shots were uploaded?' },
      })
    }

    const session = await getSession(tenantId, req.params.sessionId!)
    if (!session) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const event = await getEvent(tenantId, eventId)
    const templateRow = event?.templateId
      ? await getTemplate(tenantId, event.templateId)
      : null
    if (!templateRow) {
      return res.status(409).json({
        error: { code: 'no_template', message: 'This party has no photo layout.' },
      })
    }
    const template: Template = toTemplate(templateRow)

    await updateSession(tenantId, session.id, {
      status: 'composing',
      shotsTaken: body.data.shots.length,
    })

    const scope = { tenantId, eventId, sessionId: session.id }

    try {
      // Confirm each upload really landed before recording it. A phone that
      // dropped mid-PUT would otherwise leave a row pointing at nothing.
      for (const shot of body.data.shots) {
        const path = rawFramePath(scope, shot.idx)
        if (!(await exists(path, tenantId))) {
          throw new Error(`Shot ${shot.idx + 1} did not finish uploading.`)
        }
        await recordPhoto(tenantId, {
          sessionId: session.id,
          idx: shot.idx,
          gcsPath: path,
          width: shot.width,
          height: shot.height,
        })
      }

      const rows = await listSessionPhotos(tenantId, session.id)
      const buffers = await Promise.all(
        rows.map((row) => download(row.gcsPath, tenantId)),
      )

      const montage = await composeMontage({ template, shots: buffers })
      const out = montagePath(scope)
      await upload(out, tenantId, montage)

      const ready = await updateSession(tenantId, session.id, {
        status: 'ready',
        montagePath: out,
        error: null,
      })

      return res.json({
        id: ready!.id,
        code: ready!.code,
        status: ready!.status,
        bytes: montage.length,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      await updateSession(tenantId, session.id, { status: 'failed', error: message })
      // The booth needs to know so it can offer a retake rather than sit on a
      // spinner; the guest's poll surfaces the same message.
      return res.status(500).json({ error: { code: 'compose_failed', message } })
    }
  } catch (e) {
    return next(e)
  }
})
