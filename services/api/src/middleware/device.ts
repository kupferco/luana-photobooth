import { createHash } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { findDeviceByTokenHash, touchDevice } from '../db/repo'

export interface DeviceAuth {
  deviceId: string
  tenantId: string
  eventId: string | null
  kind: 'booth' | 'agent'
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: DeviceAuth
    }
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * Authenticates a booth phone or a print agent by its long-lived token.
 *
 * Devices are not people: no refresh dance, no expiry. A booth is a phone on
 * a tripod for six hours and a Pi runs for months, and neither has anyone
 * present to sign back in. Revocation is by deleting the device, which is
 * why the token hash is checked on every request rather than trusted from a
 * signed claim.
 *
 * Each authenticated call also stamps lastSeenAt, which is what the owner's
 * dashboard uses to say whether the booth is still alive.
 */
export function requireDevice(kind?: 'booth' | 'agent') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'This device is not paired.' },
      })
      return
    }

    const device = await findDeviceByTokenHash(hash(token))
    if (!device || !device.tokenHash) {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'This device is not paired.' },
      })
      return
    }

    if (kind && device.kind !== kind) {
      // A print agent asking for booth endpoints is a bug or an attack;
      // either way it is not told which.
      res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
      return
    }

    req.device = {
      deviceId: device.id,
      tenantId: device.tenantId,
      eventId: device.eventId,
      kind: device.kind,
    }

    // Fire and forget: a heartbeat should never make the request fail.
    void touchDevice(device.id).catch(() => {})

    next()
  }
}
