import express, { type NextFunction, type Request, type Response } from 'express'
import { authRoutes } from './auth/routes'
import { agentRoutes } from './agent/routes'
import { boothRoutes } from './booth/routes'
import { deviceRoutes } from './devices/routes'
import { eventRoutes } from './events/routes'
import { sessionRoutes } from './sessions/routes'
import { env, isProduction } from './config/env'
import { cors } from './middleware/cors'

const app = express()

app.use(cors)
app.use(express.json({ limit: '1mb' }))

/**
 * Health check. Must not touch the database.
 *
 * Not /healthz: Google's frontend intercepts that path on a run.app domain
 * and answers 404 itself, so the request never reaches the container.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true })
})

app.use('/auth', authRoutes)
app.use('/events', eventRoutes)
app.use('/devices', deviceRoutes)
app.use('/booth', boothRoutes)
app.use('/agent', agentRoutes)
app.use('/', sessionRoutes)

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
})

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500
  if (status >= 500) console.error(err)
  res.status(status).json({
    error: {
      code: status === 404 ? 'not_found' : 'server_error',
      // Never leak an internal message to a client in production; the log has it.
      message: status >= 500 && isProduction ? 'Something went wrong.' : err.message,
    },
  })
})

/*
 * A transport failure must not take the service down.
 *
 * An idle database socket losing its route surfaced as an unhandled
 * rejection and killed the process -- the entire API gone because one TLS
 * read failed. On Cloud Run that is a cold start for the next guest; locally
 * it is a dev server that dies while you are looking at something else.
 *
 * Deliberately narrow: only errors that are plainly transport-level are
 * swallowed, and they are logged. A genuine bug still crashes, because a
 * process that keeps running in an unknown state is worse than one that
 * restarts.
 */
const TRANSPORT_ERRORS = new Set([
  // Node's own socket errnos.
  'EHOSTUNREACH',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'ENETDOWN',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EAGAIN',
  /*
   * postgres.js invents its own codes rather than passing the errno through,
   * and they are not obviously distinguishable from a bug by shape alone.
   * Leaving them out is how a first attempt at this still let a dropped
   * database connection kill the API:
   *
   *   Error: write CONNECT_TIMEOUT ...neon.tech:5432
   *       at connectTimedOut
   *
   * which is a laptop on bad wifi, not a fault worth ending the service for.
   */
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECTION_CONNECT_TIMEOUT',
  'IDLE_TIMEOUT',
])

process.on('unhandledRejection', (reason) => {
  const err = reason as { code?: string; message?: string }
  const code = err?.code

  if (code && TRANSPORT_ERRORS.has(code)) {
    console.error(`transport error (${code}); continuing`)
    return
  }

  /*
   * A last net for codes nobody has met yet.
   *
   * The named list is the intent; this catches the case where a driver
   * invents a code we have not seen. Narrow on purpose -- it wants both a
   * code and wording that names a connection -- because the alternative is
   * a process that survives real bugs in an unknown state.
   */
  if (code && /connect|connection|timeout|socket|network/i.test(`${code} ${err.message ?? ''}`)) {
    console.error(`likely transport error (${code}); continuing:`, err.message)
    return
  }

  // Anything else is a real bug. Let it kill the process.
  throw reason
})

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
})
