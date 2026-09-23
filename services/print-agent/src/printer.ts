import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The printer, through CUPS.
 *
 * v1 called `lp` and reported success the moment it returned, which only ever
 * meant "CUPS accepted the file". Whether paper came out was unknowable, so a
 * printer that was unplugged, jammed or empty looked exactly like one that
 * was working. Here `lp` hands back a job id and that job is followed to a
 * terminal state.
 */

export type PrinterState = 'idle' | 'printing' | 'stopped' | 'unknown'

export interface PrinterStatus {
  state: PrinterState
  message: string | null
}

const DRY_RUN = process.env.DRY_RUN === '1'

/**
 * Submits a file and returns the CUPS job id.
 *
 * lp prints "request id is Canon_SELPHY_CP1500-42 (1 file(s))"; the id is
 * what everything afterwards is tracked by.
 */
export async function submit(file: string, printer: string): Promise<string> {
  if (DRY_RUN) return `dry-run-${Date.now()}`

  const { stdout } = await run('lp', ['-d', printer, file])
  const match = stdout.match(/request id is (\S+)/)

  if (!match?.[1]) {
    throw new Error(`lp gave no job id: ${stdout.trim()}`)
  }
  return match[1]
}

/**
 * Whether a job is still in the queue.
 *
 * `lpstat -o` lists only unfinished jobs, so a job that has vanished from it
 * has either printed or been cancelled. CUPS does not keep a simple record of
 * which, so absence is treated as done and the printer's own state is what
 * catches a failure.
 */
export async function isQueued(jobId: string): Promise<boolean> {
  if (DRY_RUN) return false

  try {
    const { stdout } = await run('lpstat', ['-o'])
    return stdout.split('\n').some((line) => line.startsWith(jobId))
  } catch {
    // lpstat exits non-zero when the queue is empty on some builds.
    return false
  }
}

/**
 * What the printer is doing, for the owner's dashboard.
 *
 * "Out of paper" is the thing that actually happens at a party, and the only
 * place it can be seen is here.
 */
export async function status(printer: string): Promise<PrinterStatus> {
  if (DRY_RUN) return { state: 'idle', message: 'Dry run — nothing is printed' }

  try {
    const { stdout } = await run('lpstat', ['-p', printer])
    const text = stdout.trim()

    if (/is idle/.test(text)) return { state: 'idle', message: null }

    if (/now printing|printing /.test(text)) {
      return { state: 'printing', message: null }
    }

    if (/disabled|stopped/.test(text)) {
      // The reason follows a dash and is the part worth showing: CUPS puts
      // "out of paper", "media jam" and the like there verbatim.
      const reason = text.split(' - ')[1]?.trim()
      return { state: 'stopped', message: reason || 'The printer has stopped' }
    }

    // `lpstat` answers successfully and says the queue does not exist, which
    // is not a printer fault -- it is a Pi that has not had a printer set up
    // on it yet, and the owner should be told that and not a shell error.
    if (/Invalid destination name|Unknown printer|No destinations added/i.test(text)) {
      return { state: 'unknown', message: 'No printer set up on this box yet' }
    }

    return { state: 'unknown', message: text.split('\n')[0] ?? null }
  } catch (e) {
    /*
     * Whatever went wrong, the owner is standing at a party and cannot act
     * on "Command failed: lpstat -p Canon_SELPHY_CP1500". That string was
     * being shown in the dashboard verbatim, in red, next to a device that
     * was working perfectly -- it reads as a broken printer when it means
     * there is not one.
     */
    const raw = e instanceof Error ? e.message : String(e)

    if (/Invalid destination name|Unknown printer|No destinations added/i.test(raw)) {
      return { state: 'unknown', message: 'No printer set up on this box yet' }
    }
    if (/not found|No such file|ENOENT/i.test(raw)) {
      return { state: 'unknown', message: 'Printing is not set up on this box yet' }
    }

    return { state: 'stopped', message: 'The printer is not responding' }
  }
}

/**
 * Clears everything still queued.
 *
 * For starting an event cleanly: a Pi that was unplugged mid-party comes back
 * with yesterday's jobs still pending, and printing those first is worse than
 * losing them.
 */
export async function cancelAll(printer: string): Promise<void> {
  if (DRY_RUN) return
  await run('cancel', ['-a', printer]).catch(() => {})
}
