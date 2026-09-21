import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { findOrCreateAccount } from './accounts'
import { issueCode, verifyCode } from './codes'
import { issueRefreshToken, mintAccessToken, revokeFamily, rotateRefreshToken } from './tokens'

export const authRoutes: Router = Router()

const EmailBody = z.object({ email: z.string().email() })
const VerifyBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
})
const RefreshBody = z.object({ refreshToken: z.string().min(1) })

/**
 * Ask for a code.
 *
 * Always answers the same way, whether or not the address has an account and
 * whether or not the email actually went out. Otherwise this endpoint becomes
 * a way to find out who has signed up.
 */
authRoutes.post('/code', async (req, res) => {
  const body = EmailBody.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({
      error: { code: 'invalid_email', message: 'That does not look like an email address.' },
    })
  }

  const result = await issueCode(body.data.email)

  if (result === 'rate_limited') {
    return res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many codes requested. Try again in a few minutes.',
      },
    })
  }

  return res.status(202).json({ sent: true })
})

/** Exchange a code for a session. First time through, this creates the account. */
authRoutes.post('/verify', async (req, res) => {
  const body = VerifyBody.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({
      error: { code: 'invalid_request', message: 'Enter the six-digit code from your email.' },
    })
  }

  const check = await verifyCode(body.data.email, body.data.code)

  if (!check.ok) {
    const status = check.reason === 'too_many_attempts' ? 429 : 400
    const message =
      check.reason === 'expired'
        ? 'That code has expired. Ask for a new one.'
        : check.reason === 'too_many_attempts'
          ? 'Too many attempts. Ask for a new code.'
          : 'That code is not right.'
    return res.status(status).json({ error: { code: check.reason, message } })
  }

  const account = await findOrCreateAccount(check.email)

  return res.status(200).json({
    accessToken: await mintAccessToken(account.userId),
    refreshToken: await issueRefreshToken(account.userId),
    user: {
      id: account.userId,
      email: account.email,
      name: account.name,
      memberships: account.memberships,
    },
  })
})

authRoutes.post('/refresh', async (req, res) => {
  const body = RefreshBody.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({
      error: { code: 'invalid_request', message: 'No refresh token supplied.' },
    })
  }

  const outcome = await rotateRefreshToken(body.data.refreshToken)

  if (!outcome.ok) {
    // Deliberately uniform: a client cannot tell a reused token from an
    // unknown one, and in every case the answer is to sign in again.
    return res.status(401).json({
      error: { code: 'invalid_token', message: 'Please sign in again.' },
    })
  }

  return res.status(200).json({
    accessToken: outcome.accessToken,
    refreshToken: outcome.refreshToken,
  })
})

authRoutes.post('/signout', async (req, res) => {
  const body = RefreshBody.safeParse(req.body)
  if (body.success) await revokeFamily(body.data.refreshToken)
  // Always 204: signing out should never fail in a way a user must act on.
  return res.status(204).end()
})

/** Who am I. Used by the app on launch to decide where to send someone. */
authRoutes.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({ user: req.auth })
})
