import type { NextFunction, Request, Response } from 'express'
import { loadAccount, type Account } from '../auth/accounts'
import { verifyAccessToken } from '../auth/tokens'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { eventMembers } from '../db/schema'

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
/**
 * What a signed-in user is allowed to do with one event.
 *
 * Two ways in, and they are not the same thing:
 *
 * - a member of the account, who can do anything to any of its parties;
 * - someone invited to this one party, who can do anything to it and does
 *   not know the others exist.
 *
 * Account membership is checked first and without a query, so the common
 * case -- the owner, on their own event -- costs nothing.
 *
 * A stranger gets the same 404 as a missing event, so nobody can discover
 * that an event id is real by watching for a 403.
 */
export async function requireEventAccess(
  req: Request,
  tenantId: string,
  eventId: string,
): Promise<{ tenantId: string; role: Account['memberships'][number]['role'] | 'helper' }> {
  const account = req.auth?.memberships.find((m) => m.tenantId === tenantId)
  if (account) return account

  const userId = req.auth?.userId
  if (userId) {
    const [shared] = await db
      .select({ eventId: eventMembers.eventId })
      .from(eventMembers)
      .where(
        and(
          eq(eventMembers.eventId, eventId),
          eq(eventMembers.userId, userId),
          eq(eventMembers.tenantId, tenantId),
        ),
      )
      .limit(1)

    if (shared) return { tenantId, role: 'helper' }
  }

  const error = new Error('Not found') as Error & { status?: number }
  error.status = 404
  throw error
}

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
