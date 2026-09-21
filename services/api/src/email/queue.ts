import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import { env } from '../config/env'
import { db } from '../db/client'
import { emailDeliveries } from '../db/schema'

/**
 * Every outbound email is a row first and a send second.
 *
 * The venue will be offline sometimes, and Resend will have a bad minute
 * sometimes. A guest's photos should not be lost because of either, so the
 * row is the durable record and the send is an attempt against it. A failed
 * attempt leaves the row queued for the drain to retry.
 *
 * Sign-in codes are still sent inline, because someone is staring at a
 * loading spinner waiting for one.
 */

const resend = new Resend(env.RESEND_API_KEY)

export const MAX_ATTEMPTS = 5

interface QueueEmail {
  to: string
  kind: 'signin_code' | 'guest_photos' | 'retention_warning'
  subject: string
  text: string
  tenantId?: string
  sessionId?: string
}

export async function queueEmail(message: QueueEmail): Promise<void> {
  const [row] = await db
    .insert(emailDeliveries)
    .values({
      toEmail: message.to,
      kind: message.kind,
      tenantId: message.tenantId ?? null,
      sessionId: message.sessionId ?? null,
      status: 'queued',
    })
    .returning({ id: emailDeliveries.id })

  if (!row) throw new Error('Could not record the email before sending it.')

  await attemptSend(row.id, message, 0)
}

async function attemptSend(
  id: string,
  message: QueueEmail,
  attempts: number,
): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    })

    if (error) throw new Error(error.message)

    await db
      .update(emailDeliveries)
      .set({
        status: 'sent',
        resendId: data?.id ?? null,
        attempts: attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, id))
  } catch (cause) {
    const attemptsNow = attempts + 1
    await db
      .update(emailDeliveries)
      .set({
        // Stays 'queued' while retries remain, so the drain picks it up.
        status: attemptsNow >= MAX_ATTEMPTS ? 'failed' : 'queued',
        attempts: attemptsNow,
        error: cause instanceof Error ? cause.message : String(cause),
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, id))

    // Swallowed on purpose: the caller's request should not fail because an
    // email did. The row carries the failure, and /auth/code deliberately
    // gives the same answer whether or not delivery worked.
  }
}
