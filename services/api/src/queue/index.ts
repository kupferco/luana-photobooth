import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions } from '../db/schema'

/**
 * The queue at the booth.
 *
 * There is one camera and one person can stand in front of it, so the only
 * thing this has to get right is: whose turn is it, and what happens when
 * they are not paying attention.
 *
 * When someone reaches the front they are asked to confirm they are still
 * there. If they do not answer in time they are bumped one place rather than
 * dropped -- the person behind them is served immediately, and the distracted
 * one is asked again when they come back round. Nobody waits for a guest who
 * wandered off, and nobody loses their place for looking away for a moment.
 *
 * Three misses and they are out. Scanning the code again puts them at the
 * back, which is the retry; it does not need to exist inside the queue too.
 */

/** How long someone has to confirm once they are at the front. */
export const CONFIRM_WINDOW_MS = 60_000

/** After this many missed turns, they have clearly gone. */
export const MAX_CONFIRM_MISSES = 3

/**
 * A deeper queue than this at a one-camera booth means something is stuck,
 * not that people are patiently waiting.
 */
export const MAX_QUEUE_DEPTH = 3

export interface QueueEntry {
  id: string
  code: string
  queuedAt: Date
  calledAt: Date | null
  confirmedAt: Date | null
  confirmMisses: number
  shotsExpected: number
}

/** Everyone still waiting, in turn order. */
async function waiting(tenantId: string, eventId: string): Promise<QueueEntry[]> {
  const rows = await db
    .select({
      id: sessions.id,
      code: sessions.code,
      queuedAt: sessions.queuedAt,
      calledAt: sessions.calledAt,
      confirmedAt: sessions.confirmedAt,
      confirmMisses: sessions.confirmMisses,
      shotsExpected: sessions.shotsExpected,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.eventId, eventId),
        eq(sessions.status, 'queued'),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(asc(sessions.queuedAt))

  return rows
}

/**
 * Moves a session one place back, behind whoever is next.
 *
 * Ordering is by timestamp, so "one place back" means taking a moment just
 * after the next person's. If there is nobody behind them they keep the
 * front -- being bumped past an empty queue would mean nothing, and they are
 * simply asked again.
 */
async function bumpOnePlace(entry: QueueEntry, queue: QueueEntry[]): Promise<void> {
  const next = queue.find((e) => e.id !== entry.id)
  if (!next) return

  await db
    .update(sessions)
    .set({ queuedAt: new Date(next.queuedAt.getTime() + 1), updatedAt: new Date() })
    .where(eq(sessions.id, entry.id))
}

export interface QueueState {
  /** In turn order, after any misses have been resolved. */
  queue: QueueEntry[]
  /** Whoever is at the front, if anyone. */
  head: QueueEntry | null
  /** Set when the head has been asked and has not answered yet. */
  awaitingConfirmation: boolean
  /** Milliseconds the head has left to answer. */
  confirmMsLeft: number | null
}

/**
 * Brings the queue up to date and returns it.
 *
 * Called on every read -- the booth polls constantly while a party runs, so
 * the queue is corrected at exactly the moments anyone is looking at it, with
 * no scheduler needed for the booth to behave.
 */
export async function advanceQueue(
  tenantId: string,
  eventId: string,
  boothOnline: boolean,
): Promise<QueueState> {
  let queue = await waiting(tenantId, eventId)
  const now = Date.now()

  let head = queue[0] ?? null

  // Nobody is asked to get ready for a booth that is not switched on: their
  // minute would run out while nothing could have happened anyway.
  if (head && boothOnline && !head.confirmedAt) {
    if (!head.calledAt) {
      // They have just reached the front. Start their minute.
      await db
        .update(sessions)
        .set({ calledAt: new Date(), updatedAt: new Date() })
        .where(eq(sessions.id, head.id))
      head = { ...head, calledAt: new Date() }
      queue = [head, ...queue.slice(1)]
    } else if (now - head.calledAt.getTime() > CONFIRM_WINDOW_MS) {
      // They did not answer. Bump them, and serve the next person now.
      const misses = head.confirmMisses + 1

      if (misses >= MAX_CONFIRM_MISSES) {
        await db
          .update(sessions)
          .set({ status: 'abandoned', confirmMisses: misses, updatedAt: new Date() })
          .where(eq(sessions.id, head.id))
      } else {
        await db
          .update(sessions)
          .set({ calledAt: null, confirmMisses: misses, updatedAt: new Date() })
          .where(eq(sessions.id, head.id))
        await bumpOnePlace(head, queue)
      }

      // Re-read rather than reasoning about the new order in memory: the next
      // person is now at the front and should be called on this same pass, so
      // the booth is never idle waiting for the following poll.
      return advanceQueue(tenantId, eventId, boothOnline)
    }
  }

  const awaiting = Boolean(head && head.calledAt && !head.confirmedAt)

  return {
    queue,
    head,
    awaitingConfirmation: awaiting,
    confirmMsLeft:
      awaiting && head?.calledAt
        ? Math.max(0, CONFIRM_WINDOW_MS - (now - head.calledAt.getTime()))
        : null,
  }
}

/** The guest says they are ready. Only the person at the front may. */
export async function confirmTurn(
  tenantId: string,
  eventId: string,
  sessionId: string,
): Promise<'confirmed' | 'not_your_turn'> {
  const queue = await waiting(tenantId, eventId)
  const head = queue[0]

  if (!head || head.id !== sessionId) return 'not_your_turn'

  await db
    .update(sessions)
    .set({ confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))

  return 'confirmed'
}

/** Someone standing at the booth needs no confirmation; they are already there. */
export async function markConfirmed(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ confirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), ne(sessions.status, 'ready')))
}
