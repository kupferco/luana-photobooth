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

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
})
