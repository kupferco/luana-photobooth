import type { NextFunction, Request, Response } from 'express'
import { loadAccount, type Account } from '../auth/accounts'
import { verifyAccessToken } from '../auth/tokens'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: Account
    }
  }
}

/**
 * Verifies the bearer token and loads the account, memberships included.
 *
 * Memberships are read per request rather than baked into the token on
 * purpose: a role change or a removal takes effect immediately, instead of
 * waiting for a token to expire.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({
      error: { code: 'unauthenticated', message: 'Please sign in.' },
    })
    return
  }

  const userId = await verifyAccessToken(token)
  if (!userId) {
    res.status(401).json({
      error: { code: 'unauthenticated', message: 'Please sign in again.' },
    })
    return
  }

  const account = await loadAccount(userId)
  if (!account) {
    // Token verified but the user is gone -- deleted account, or a token
    // minted against a database that has since been reset.
    res.status(401).json({
      error: { code: 'unauthenticated', message: 'Please sign in again.' },
    })
    return
  }

  req.auth = account
  next()
}

/**
 * Asserts the signed-in user belongs to this tenant, and returns their role.
 *
 * Every tenant-scoped route goes through this. It is the single place
 * membership is checked, so there is one thing to get right rather than one
 * per handler.
 */
export function requireTenant(req: Request, tenantId: string): Account['memberships'][number] {
  const membership = req.auth?.memberships.find((m) => m.tenantId === tenantId)
  if (!membership) {
    // Deliberately indistinguishable from "does not exist": a stranger should
    // not be able to learn that a tenant id is real by probing for 403s.
    const error = new Error('Not found') as Error & { status?: number }
    error.status = 404
    throw error
  }
  return membership
}
