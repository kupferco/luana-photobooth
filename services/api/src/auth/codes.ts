import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { signinCodes } from '../db/schema'
import { queueEmail } from '../email/queue'

/**
 * Six-digit codes rather than magic links.
 *
 * A link breaks when the email is opened on a different device from the one
 * signing in, and mail scanners pre-fetch URLs and burn single-use tokens
 * before anyone clicks. A code needs no universal-link setup to work in a
 * native build, and it never puts a bearer token in browser history or a
 * server log.
 */

const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
/** Per address per window: enough for a genuine retry, not enough to spam an inbox. */
const MAX_PER_WINDOW = 5
const RATE_WINDOW_MINUTES = 15

const normalise = (email: string) => email.trim().toLowerCase()

/** Salted with the address so a stolen hash cannot be replayed against another. */
const hashCode = (email: string, code: string) =>
  createHash('sha256').update(`${normalise(email)}:${code}`).digest('hex')

export type IssueResult = 'sent' | 'rate_limited'

export async function issueCode(rawEmail: string): Promise<IssueResult> {
  const email = normalise(rawEmail)

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signinCodes)
    .where(
      and(
        eq(signinCodes.email, email),
        gt(
          signinCodes.createdAt,
          new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000),
        ),
      ),
    )

  if (count >= MAX_PER_WINDOW) return 'rate_limited'

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

  await db.insert(signinCodes).values({
    email,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  })

  await queueEmail({
    to: email,
    kind: 'signin_code',
    subject: 'Your photo booth code',
    text:
      `Your code is ${code}\n\n` +
      `It expires in ${CODE_TTL_MINUTES} minutes. ` +
      `If you did not ask for it, you can ignore this email.`,
  })

  return 'sent'
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' }

/**
 * Consumes a code. Says nothing about whether the address has an account --
 * that is decided afterwards, so this endpoint cannot be used to find out who
 * has signed up.
 */
export async function verifyCode(
  rawEmail: string,
  code: string,
): Promise<VerifyResult> {
  const email = normalise(rawEmail)

  const [row] = await db
    .select()
    .from(signinCodes)
    .where(and(eq(signinCodes.email, email), isNull(signinCodes.consumedAt)))
    .orderBy(sql`${signinCodes.createdAt} DESC`)
    .limit(1)

  if (!row) return { ok: false, reason: 'invalid' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const expected = Buffer.from(row.codeHash, 'hex')
  const actual = Buffer.from(hashCode(email, code), 'hex')
  // Both are SHA-256 output so the lengths always match, but timingSafeEqual
  // throws rather than returning false if they ever did not.
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual)

  if (!matches) {
    await db
      .update(signinCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(signinCodes.id, row.id))
    return { ok: false, reason: 'invalid' }
  }

  await db
    .update(signinCodes)
    .set({ consumedAt: new Date() })
    .where(eq(signinCodes.id, row.id))

  return { ok: true, email }
}
