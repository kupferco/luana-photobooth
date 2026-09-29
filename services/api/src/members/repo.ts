import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { memberships, users } from '../db/schema'

/**
 * Who can help run a party.
 *
 * Membership is on the tenant, not the event: someone helping with the
 * birthday is trusted with the account, and splitting it per-event would mean
 * re-inviting the same person every time -- which nobody would do, so they
 * would simply share a login instead, which is worse.
 *
 * There is no invitation token and no accept step. Signing in is already
 * proving control of an inbox, so an invitation *is* the membership: the
 * address is added, and whoever reads that inbox can sign in and find the
 * party there. A separate accept flow would add a table, an email link, an
 * expiry and a failure mode, to establish the same fact the sign-in code
 * establishes anyway.
 */

export type Role = 'owner' | 'admin' | 'staff'

export interface Member {
  userId: string
  email: string
  name: string | null
  role: Role
  joinedAt: Date
}

export async function listMembers(tenantId: string): Promise<Member[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.tenantId, tenantId))
    // Owners first, then oldest first, so the list does not reshuffle when
    // somebody is added.
    .orderBy(asc(memberships.role), asc(memberships.createdAt))

  return rows as Member[]
}

/** How many owners this tenant has, used to refuse removing the last one. */
export async function countOwners(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, 'owner')))

  return row?.n ?? 0
}

export async function findMember(
  tenantId: string,
  userId: string,
): Promise<Member | null> {
  const rows = await listMembers(tenantId)
  return rows.find((m) => m.userId === userId) ?? null
}

/**
 * Add someone by email address.
 *
 * Deliberately does NOT give a brand-new address its own tenant, which is
 * what signing in for the first time does. Being invited to help with
 * someone's party is not asking for an account of your own, and handing out
 * one nobody asked for would leave an empty party sitting in their app.
 *
 * Idempotent: inviting somebody who is already a member returns them
 * unchanged rather than failing, because the owner's intent -- that this
 * person can help -- is already true, and an error here reads as "it didn't
 * work" when it did.
 */
export async function addMember(
  tenantId: string,
  email: string,
  role: Role,
): Promise<{ member: Member; created: boolean }> {
  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    const user =
      existingUser ??
      (await tx.insert(users).values({ email }).returning())[0]

    if (!user) throw new Error('Could not create the user.')

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.tenantId, tenantId), eq(memberships.userId, user.id)),
      )
      .limit(1)

    if (existingMembership) {
      return {
        created: false,
        member: {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: existingMembership.role,
          joinedAt: existingMembership.createdAt,
        },
      }
    }

    const [row] = await tx
      .insert(memberships)
      .values({ tenantId, userId: user.id, role })
      .returning()

    if (!row) throw new Error('Could not add the member.')

    return {
      created: true,
      member: {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: row.role,
        joinedAt: row.createdAt,
      },
    }
  })
}

export async function removeMember(tenantId: string, userId: string): Promise<void> {
  await db
    .delete(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)))
}
