import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant } from '../middleware/auth'
import { db } from '../db/client'
import { tenants } from '../db/schema'
import { queueEmail } from '../email/queue'
import { env } from '../config/env'
import { addMember, countOwners, findMember, listMembers, removeMember } from './repo'

export const memberRoutes: Router = Router()

memberRoutes.use(requireAuth)

/**
 * Who else can run this account's parties.
 *
 * Only an owner may change the list. An admin can do everything to an event
 * -- that is the point of inviting them -- but handing out access is the one
 * thing that stays with whoever's account it is, because it is the only
 * action that cannot be undone by the person it happens to.
 */
function requireOwner(
  req: Parameters<Parameters<Router['get']>[1]>[0],
  tenantId: string,
) {
  const membership = requireTenant(req, tenantId)
  if (membership.role !== 'owner') {
    const error = new Error('Only the account owner can change who has access.') as Error & {
      status?: number
    }
    error.status = 403
    throw error
  }
  return membership
}

const present = (m: Awaited<ReturnType<typeof listMembers>>[number], meId: string) => ({
  userId: m.userId,
  email: m.email,
  name: m.name,
  role: m.role,
  joinedAt: m.joinedAt.toISOString(),
  isYou: m.userId === meId,
})

memberRoutes.get('/:tenantId/members', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId!
    requireTenant(req, tenantId)

    const rows = await listMembers(tenantId)
    return res.json({
      members: rows.map((m) => present(m, req.auth!.userId)),
      // The UI hides the add and remove controls rather than letting someone
      // press them and be refused.
      canManage: requireTenant(req, tenantId).role === 'owner',
    })
  } catch (e) {
    return next(e)
  }
})

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  // 'staff' exists in the schema and has no meaning yet, so it is not offered.
  role: z.enum(['admin', 'owner']).default('admin'),
})

memberRoutes.post('/:tenantId/members', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId!
    requireOwner(req, tenantId)

    const body = InviteBody.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'Enter the email address they will sign in with.',
        },
      })
    }

    const { member, created } = await addMember(tenantId, body.data.email, body.data.role)

    if (created) {
      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

      const from = req.auth!.email
      const where = tenant?.name ?? 'a photo booth'

      /*
       * No link with a token in it. They sign in with their own address the
       * normal way and the party is simply there -- so this email cannot
       * expire, cannot be forwarded into someone else's access, and does not
       * stop working if they open it on a different phone.
       */
      await queueEmail({
        to: member.email,
        kind: 'invite',
        tenantId,
        subject: `${from} added you to ${where}`,
        text: [
          `${from} has asked you to help run ${where} on Lumina.`,
          '',
          `Sign in at ${env.APP_URL} with this address (${member.email}) and it will be there.`,
          '',
          'There is no password. You enter your email, it sends you a six-digit code, and that is it.',
        ].join('\n'),
      })
    }

    return res.status(created ? 201 : 200).json({
      member: present(member, req.auth!.userId),
      created,
    })
  } catch (e) {
    return next(e)
  }
})

memberRoutes.delete('/:tenantId/members/:userId', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId!
    const userId = req.params.userId!
    requireOwner(req, tenantId)

    const member = await findMember(tenantId, userId)
    if (!member) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    }

    /*
     * An account with no owner cannot be given one back: only an owner may
     * change the list, so removing the last one locks everybody out
     * permanently, including whoever is doing it.
     */
    if (member.role === 'owner' && (await countOwners(tenantId)) <= 1) {
      return res.status(409).json({
        error: {
          code: 'last_owner',
          message: 'Add another owner before removing this one.',
        },
      })
    }

    await removeMember(tenantId, userId)
    return res.status(204).end()
  } catch (e) {
    return next(e)
  }
})
