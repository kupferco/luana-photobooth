import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { memberships, tenants, users } from '../db/schema'

/**
 * Turning a verified email address into an account.
 *
 * Signing in and signing up are the same act: proving control of an inbox.
 * A first-time address gets a user, a tenant and an `owner` membership in one
 * transaction, so there is never a user without somewhere to put an event.
 */

export interface Account {
  userId: string
  email: string
  name: string | null
  memberships: { tenantId: string; role: 'owner' | 'admin' | 'staff' }[]
}

export async function findOrCreateAccount(email: string): Promise<Account> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    const rows = await db
      .select({ tenantId: memberships.tenantId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, existing.id))

    return {
      userId: existing.id,
      email: existing.email,
      name: existing.name,
      memberships: rows,
    }
  }

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email }).returning()
    if (!user) throw new Error('Could not create the user.')

    // Named after the address for now; the owner renames it when they first
    // set up an event. Better than an empty string in the UI.
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: email.split('@')[0] ?? 'My account' })
      .returning()
    if (!tenant) throw new Error('Could not create the tenant.')

    await tx
      .insert(memberships)
      .values({ tenantId: tenant.id, userId: user.id, role: 'owner' })

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      memberships: [{ tenantId: tenant.id, role: 'owner' as const }],
    }
  })
}

export async function loadAccount(userId: string): Promise<Account | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return null

  const rows = await db
    .select({ tenantId: memberships.tenantId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id))

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    memberships: rows,
  }
}
