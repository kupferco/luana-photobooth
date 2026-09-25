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
  'EHOSTUNREACH',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'ENETDOWN',
  'EAI_AGAIN',
])

process.on('unhandledRejection', (reason) => {
  const code = (reason as { code?: string })?.code
  if (code && TRANSPORT_ERRORS.has(code)) {
    console.error(`transport error (${code}); continuing`, reason)
    return
  }
  // Anything else is a real bug. Let it kill the process.
  throw reason
})

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
})
