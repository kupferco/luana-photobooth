import { writeFile, mkdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api, hasToken } from './client'
import { cancelAll, isQueued, status, submit } from './printer'

/**
 * The print agent.
 *
 * Runs on the Raspberry Pi next to the printer. It holds no inbound port and
 * accepts no connections: it polls, prints, and reports. That is why setting
 * one up needs only wifi and a pairing code -- no certificate, no port
 * forwarding, no fixed address, nothing to configure on the router.
 *
 * Settings come from the environment. systemd loads them from
 * /opt/photobooth/.env on the Pi; locally, node --env-file does the same.
 * No dotenv: it was a dependency that read a file Node reads on its own, and
 * it dragged CommonJS require() into an ESM bundle doing it.
 *
 * Everything here assumes it will be interrupted. The Pi gets unplugged, the
 * wifi drops, the printer runs out of paper mid-party. None of those should
 * need a person to notice and restart anything.
 */

const PRINTER = process.env.PRINTER_NAME ?? 'Canon_SELPHY_CP1500'

/** Fast enough that a guest does not wait, slow enough to be free. */
const POLL_MS = 3000

/** The dashboard calls a printer offline after 30s, so stay well inside it. */
const HEARTBEAT_MS = 10_000

/** A SELPHY takes about a minute a sheet; past this something is wrong. */
const PRINT_TIMEOUT_MS = 5 * 60_000

/** Backoff when the API is unreachable, so a dropped wifi is not a busy loop. */
const OFFLINE_BACKOFF_MS = 15_000

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args)

let printing = false

/**
 * Downloads, prints, and follows the job to a conclusion.
 *
 * The montage is fetched straight from storage with the signed URL the API
 * hands over; the bytes never pass through the API itself.
 */
async function handle(job: { id: string; code: string; url: string }): Promise<void> {
  const dir = join(tmpdir(), 'photobooth')
  const file = join(dir, `${job.code}.jpg`)

  try {
    await mkdir(dir, { recursive: true })

    const response = await fetch(job.url)
    if (!response.ok) throw new Error(`Could not download the photo (${response.status})`)
    await writeFile(file, Buffer.from(await response.arrayBuffer()))

    const cupsJobId = await submit(file, PRINTER)
    log(`printing ${job.code} as ${cupsJobId}`)
    await api.jobStatus(job.id, { status: 'printing', cupsJobId })

    // Wait for CUPS to let go of it. Absence from the queue is the only
    // signal CUPS reliably gives, so the printer's own state is what
    // distinguishes finished from failed.
    const until = Date.now() + PRINT_TIMEOUT_MS
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000))
      if (!(await isQueued(cupsJobId))) break
    }

    const printer = await status(PRINTER)

    if (printer.state === 'stopped') {
      // The sheet did not come out: the queue emptied because the printer
      // gave up, not because it finished.
      await api.jobStatus(job.id, {
        status: 'failed',
        cupsJobId,
        error: printer.message ?? 'The printer stopped',
      })
      log(`failed ${job.code}: ${printer.message}`)
    } else if (Date.now() >= until) {
      await api.jobStatus(job.id, {
        status: 'failed',
        cupsJobId,
        error: 'The printer did not finish in time',
      })
      log(`timed out ${job.code}`)
    } else {
      await api.jobStatus(job.id, { status: 'printed', cupsJobId })
      log(`printed ${job.code}`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Reported rather than swallowed: the owner's dashboard is the only place
    // anyone will find out, and a silent failure at a party is the worst kind.
    await api
      .jobStatus(job.id, { status: 'failed', error: message })
      .catch(() => {})
    log(`error on ${job.code}: ${message}`)
  } finally {
    await unlink(file).catch(() => {})
  }
}

/**
 * Last state reported, so changes can be logged and repeats cannot.
 *
 * The state was only ever logged at startup, so the journal for a six-hour
 * party said what the printer was doing at 3pm and nothing after. "Out of
 * paper at 21:34" is exactly the line you want when working out why prints
 * stopped, and logging every beat would bury it under 2,000 identical ones.
 */
let lastReported: string | null = null

async function heartbeat(): Promise<void> {
  try {
    const current = await status(PRINTER)
    const summary = JSON.stringify(current)

    if (summary !== lastReported) {
      log(`printer reports: ${summary}`)
      lastReported = summary
    }

    await api.heartbeat(current)
  } catch {
    // Offline. The next one will get through; nothing here depends on it.
  }
}

async function main(): Promise<void> {
  /*
   * Wait to be paired rather than exiting.
   *
   * Onboarding may be running right now, collecting a wifi password and a
   * pairing code from someone's phone. Exiting would have systemd restart
   * this every few seconds until they finished -- a busy loop that fills the
   * log and races the token being written. Waiting means the moment
   * onboarding saves a token, the agent simply carries on.
   */
  if (!(await hasToken())) {
    log('not paired yet — waiting (onboarding collects the code)')
    while (!(await hasToken())) {
      await new Promise((r) => setTimeout(r, 5000))
    }
    log('paired')
  }

  log(`agent starting — printer ${PRINTER}`)

  // Anything left over from a previous run belongs to a party that has
  // finished; printing it now would waste paper on yesterday's photos.
  await cancelAll(PRINTER)

  void (async function beat() {
    for (;;) {
      await heartbeat()
      await new Promise((r) => setTimeout(r, HEARTBEAT_MS))
    }
  })()

  for (;;) {
    try {
      if (!printing) {
        const { job } = await api.nextJob()
        if (job) {
          printing = true
          await handle(job)
          printing = false
          // Straight round again: a queue of prints should not wait a poll
          // interval between each.
          continue
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    } catch (e) {
      printing = false
      log(`offline: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise((r) => setTimeout(r, OFFLINE_BACKOFF_MS))
    }
  }
}

// Systemd restarts the unit; this just makes the reason visible in the log.
process.on('unhandledRejection', (reason) => {
  log('unhandled rejection', reason)
  process.exit(1)
})

void main()
