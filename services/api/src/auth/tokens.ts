import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env'
import { db } from '../db/client'
import { refreshTokens } from '../db/schema'

const secret = new TextEncoder().encode(env.JWT_SECRET)

/**
 * SHA-256 rather than a password hash: a refresh token is 256 bits of
 * randomness, not something a human chose, so there is nothing to
 * brute-force and this check runs on every refresh.
 */
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

export async function mintAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

const expiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000)

/** A new sign-in: a fresh family, unrelated to any that came before. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.insert(refreshTokens).values({
    userId,
    familyId: randomUUID(),
    tokenHash: hashToken(token),
    expiresAt: expiry(),
  })
  return token
}

export type RefreshOutcome =
  | { ok: true; userId: string; accessToken: string; refreshToken: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'reused' }

/**
 * Rotation with reuse detection.
 *
 * A token that has already been spent means two parties hold it, and there is
 * no way to tell which one is the thief -- so the whole family from that
 * sign-in is revoked. That signs the real person out too, which is the right
 * trade when the alternative is leaving an attacker signed in.
 */
export async function rotateRefreshToken(token: string): Promise<RefreshOutcome> {
  const tokenHash = hashToken(token)

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) return { ok: false, reason: 'unknown' }

  if (row.usedAt) {
    // Replay. Burn every live token descended from this sign-in.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.familyId, row.familyId),
          isNull(refreshTokens.revokedAt),
        ),
      )
    return { ok: false, reason: 'reused' }
  }

  if (row.revokedAt) return { ok: false, reason: 'revoked' }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const next = randomBytes(32).toString('base64url')

  await db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(eq(refreshTokens.id, row.id))

    await tx.insert(refreshTokens).values({
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: hashToken(next),
      expiresAt: expiry(),
    })
  })

  return {
    ok: true,
    userId: row.userId,
    accessToken: await mintAccessToken(row.userId),
    refreshToken: next,
  }
}

/** Signing out: revoke this token's whole family, not just the one token. */
export async function revokeFamily(token: string): Promise<void> {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)))
    .limit(1)

  if (!row) return

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)),
    )
}
