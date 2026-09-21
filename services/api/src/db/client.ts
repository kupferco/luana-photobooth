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

const sql = postgres(connectionString, { prepare: false })

export const db = drizzle(sql, { schema })
export { schema }
