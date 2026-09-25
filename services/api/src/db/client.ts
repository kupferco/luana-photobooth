import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Neon over the pooled endpoint. `prepare: false` is required: the pooled
 * host is pgbouncer in transaction mode, which cannot hold prepared
 * statements across connections.
 *
 * The same reason means LISTEN/NOTIFY is unavailable here, which is one of
 * the things that ruled out a push-based realtime layer -- see
 * docs/architecture.md.
 */
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy services/api/.env.example to .env and fill it in.',
  )
}

/**
 * A dropped connection must not be fatal.
 *
 * The pooled endpoint closes idle connections, and a laptop changing network
 * -- or a venue's wifi dropping mid-party -- breaks them outright. postgres.js
 * surfaces that as an error on the connection, and with nothing listening it
 * became an unhandled rejection and killed the process:
 *
 *   Error: read EHOSTUNREACH
 *       at TLSWrap.onStreamRead
 *
 * The whole API went down because one idle socket lost its route. `onnotice`
 * and the error handler below keep it a logged event; postgres.js reconnects
 * on the next query by itself.
 */
const sql = postgres(connectionString, {
  prepare: false,
  // Reconnect rather than sit on a socket the network has already forgotten.
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  onnotice: () => {},
})

export const db = drizzle(sql, { schema })
export { schema }
