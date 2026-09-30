import { sql } from 'drizzle-orm'
import journal from '../../drizzle/meta/_journal.json'
import { env } from '../config/env'
import { db } from './client'

/**
 * Checks, at boot, that the machine underneath this build is the one it
 * expects.
 *
 * Migrations are not part of the deploy, so a build can reach a database
 * that has not caught up with it. When that happened the symptom was
 * `column events.artwork_generations does not exist` thrown from whichever
 * query happened to touch the new column first -- so the screen said "No
 * events yet" and the cause was four levels down a stack trace. Three
 * separate evenings went that way.
 *
 * The journal is imported rather than read from disk: the container ships a
 * single bundled file and has no drizzle folder, so counting files would
 * work in development and silently pass in production, which is the worst
 * of both.
 *
 * Deliberately does not apply anything. A migration that runs by itself at
 * boot runs on every instance at once, and the night it goes wrong is the
 * night nobody chose to run it.
 */
export async function preflight(
  /*
   * The number of migrations this build expects, and the list of their
   * names. Parameters rather than constants so the refusal can be tested
   * without damaging a database to do it -- the first attempt at that test
   * deleted a real migration record, which is a bad way to prove that
   * missing migration records are handled.
   */
  expected = journal.entries.length,
  tags: string[] = journal.entries.map((entry) => entry.tag),
): Promise<void> {

  let applied: number
  try {
    const rows = await db.execute(
      sql`select 1 from drizzle.__drizzle_migrations`,
    )
    applied = (rows as unknown as unknown[]).length
  } catch {
    // No migrations table at all: an empty database, which is a clearer
    // thing to say than "expected 13, found 0".
    throw new Error(
      'This database has never been migrated. Run: npm run db:migrate',
    )
  }

  if (applied < expected) {
    const missing = tags.slice(applied).join(', ')
    throw new Error(
      `The database is behind this build: ${applied} of ${expected} migrations applied. ` +
        `Missing: ${missing}. Run: npm run db:migrate`,
    )
  }

  /*
   * A database ahead of the build is not an error.
   *
   * It is what a rollback looks like, and the old build usually still works
   * because migrations add rather than remove. Worth saying out loud, not
   * worth refusing to start over.
   */
  if (applied > expected) {
    console.warn(
      `[preflight] database has ${applied} migrations, this build knows ${expected}. ` +
        'Running an older build than the database.',
    )
  }

  /*
   * Optional things, said once at boot rather than discovered by pressing a
   * button and reading the failure. Not fatal: a booth should not be down
   * for want of a decoration.
   */
  if (!env.GOOGLE_AI_API_KEY) {
    console.warn(
      '[preflight] GOOGLE_AI_API_KEY is not set. Generated artwork will be unavailable.',
    )
  }

  console.log(`[preflight] ${applied} migrations applied, bucket ${env.GCS_BUCKET}`)
}
