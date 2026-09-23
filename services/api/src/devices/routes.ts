import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import {
  claimDeviceByPairingCode,
  clearUnclaimedPairings,
  completePairing,
  createDevice,
  getEvent,
  listDevices,
  revokeDevice,
} from '../db/repo'
import { deviceToken, isWellFormedCode, normaliseCode, pairingCode } from '../lib/codes'
import { requireAuth, requireTenant } from '../middleware/auth'

export const deviceRoutes: Router = Router()

/** Device tokens are random, so SHA-256 is right: nothing to brute-force. */
export const hashDeviceToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const PAIRING_TTL_MINUTES = 15

// ---------------------------------------------------------------------------
// Pairing, unauthenticated. The code is the credential.
// ---------------------------------------------------------------------------

const PairBody = z.object({
  code: z.string().min(4).max(16),
  label: z.string().max(80).optional(),
})

/**
 * A Raspberry Pi claiming itself.
 *
 * Unauthenticated on purpose: a headless box has no human to sign in. The
 * short code is the credential, which is why it lives fifteen minutes, is
 * single use, and is burned the moment it is spent.
 */
deviceRoutes.post('/pair', async (req, res, next) => {
  try {
    const body = PairBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Enter the pairing code.' },
      })
    }

    const code = normaliseCode(body.data.code)
    if (!isWellFormedCode(code)) {
      return res.status(400).json({
        error: { code: 'invalid_code', message: 'That pairing code is not valid.' },
      })
    }

    const device = await claimDeviceByPairingCode(code)

    // One answer for "no such code", "already claimed" and "expired": a
    // stranger should not be able to probe for codes that exist.
    const expired =
      !device ||
      !device.pairingExpiresAt ||
      device.pairingExpiresAt.getTime() < Date.now()

    if (expired) {
      return res.status(400).json({
        error: {
          code: 'invalid_code',
          message: 'That pairing code is not valid or has expired.',
        },
      })
    }

    const token = deviceToken()
    const paired = await completePairing(device.id, hashDeviceToken(token))
    if (!paired) throw new Error('Could not complete pairing.')

    return res.status(200).json({
      deviceId: paired.id,
      kind: paired.kind,
      eventId: paired.eventId,
      // Shown once and never again; the Pi writes it to disk.
      token,
    })
  } catch (e) {
    return next(e)
  }
})

// ---------------------------------------------------------------------------
// Everything below needs an owner signed in.
// ---------------------------------------------------------------------------

deviceRoutes.use(requireAuth)

const TenantQuery = z.object({ tenantId: z.string().uuid() })

const CreatePairingBody = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  label: z.string().max(80).optional(),
})

/** Mint a pairing code for a Pi. The owner reads it out and types it there. */
deviceRoutes.post('/pairing-code', async (req, res, next) => {
  try {
    const body = CreatePairingBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, body.data.tenantId)

    if (body.data.eventId) {
      const event = await getEvent(body.data.tenantId, body.data.eventId)
      if (!event) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
      }
    }

    /*
     * One outstanding code per event. Asking for another replaces the last,
     * rather than leaving a dead row behind that says "waiting for the
     * pairing code" and never stops saying it.
     */
    if (body.data.eventId) {
      await clearUnclaimedPairings(body.data.tenantId, body.data.eventId)
    }

    const code = pairingCode()
    const device = await createDevice(body.data.tenantId, {
      eventId: body.data.eventId ?? null,
      kind: 'agent',
      label: body.data.label ?? 'Printer',
      pairingCode: code,
      pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000),
    })

    return res.status(201).json({
      deviceId: device.id,
      code,
      expiresAt: device.pairingExpiresAt?.toISOString(),
    })
  } catch (e) {
    return next(e)
  }
})

const ClaimBoothBody = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid(),
  label: z.string().max(80).optional(),
})

/**
 * The tripod phone claiming itself as the booth.
 *
 * No pairing code needed: booth and owner are one app, so this phone is
 * already signed in as someone with a membership. That is the whole reason
 * the two were merged into one app.
 */
deviceRoutes.post('/booth', async (req, res, next) => {
  try {
    const body = ClaimBoothBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId and eventId are required.' },
      })
    }
    requireTenant(req, body.data.tenantId)

    const event = await getEvent(body.data.tenantId, body.data.eventId)
    if (!event) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    const token = deviceToken()
    const device = await createDevice(body.data.tenantId, {
      eventId: body.data.eventId,
      kind: 'booth',
      label: body.data.label ?? 'Booth',
      tokenHash: hashDeviceToken(token),
    })

    return res.status(201).json({ deviceId: device.id, token })
  } catch (e) {
    return next(e)
  }
})

deviceRoutes.get('/', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined
    const rows = await listDevices(query.data.tenantId, eventId)

    return res.json({
      devices: rows.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        eventId: d.eventId,
        paired: Boolean(d.tokenHash),
        // Never the code itself once spent; only whether one is outstanding.
        pairingPending: Boolean(d.pairingCode),
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        printerState: d.printerState,
      })),
    })
  } catch (e) {
    return next(e)
  }
})

/**
 * Stop a booth, or unpair a printer.
 *
 * The owner needs this for a reason that has nothing to do with ending the
 * event: the phone on the tripod is running out of battery, or it is someone
 * else's phone and they want it back. Ending the event to free the phone
 * would close the party; this frees the phone and leaves the party running.
 *
 * Deleting the row is the revocation -- see revokeDevice. The booth phone
 * finds out on its next poll, gets a 401, and shows the owner's normal
 * screens again rather than a dead booth.
 */
deviceRoutes.delete('/:deviceId', async (req, res, next) => {
  try {
    const query = TenantQuery.safeParse(req.query)
    if (!query.success) {
      return res.status(400).json({
        error: { code: 'invalid_request', message: 'tenantId is required.' },
      })
    }
    requireTenant(req, query.data.tenantId)

    const device = await revokeDevice(query.data.tenantId, req.params.deviceId!)
    if (!device) {
      // 404 rather than 403 for another tenant's device: the answer is the
      // same whether it does not exist or is simply not theirs.
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})
