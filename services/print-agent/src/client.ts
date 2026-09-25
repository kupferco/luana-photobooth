import { randomUUID } from 'node:crypto'
import { chown, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { proposeDeviceName } from '@photobooth/shared'
import type { PrinterStatus } from './printer'

/**
 * Talking to the API.
 *
 * Outbound only. The device token is the agent's whole identity: no refresh,
 * no expiry, because a Pi in a cupboard has nobody to sign it back in.
 */

const BASE = process.env.PHOTOBOOTH_API_URL ?? 'http://localhost:8080'

/**
 * Whether the API URL was configured or fell back to the default.
 *
 * Worth surfacing, because the fallback is a localhost address and the
 * failure it produces is ECONNREFUSED against a public HTTPS endpoint --
 * which reads as a network fault and is nothing of the kind. Running the
 * agent without its EnvironmentFile cost an hour of chasing DNS and wifi
 * timing that were never wrong.
 */
export const apiBase = BASE
export const apiBaseIsDefault = !process.env.PHOTOBOOTH_API_URL

/** Matches the other modules' format, so one journal reads as one story. */
const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), '[client]', ...args)

/**
 * Where the device token lives.
 *
 * An absolute path, deliberately not one relative to the home directory.
 * Onboarding has to run as root -- it reconfigures the network and binds
 * port 80 -- while the agent runs as the login user, so `homedir()` meant
 * `/root/.photobooth` for the writer and `/home/photolu/.photobooth` for the
 * reader. Pairing then succeeded in every visible way, the dashboard showed
 * the printer as connected, and the agent sat saying "not paired yet" with
 * the token forty lines away in another user's home, mode 0600.
 *
 * Still outside the deploy directory, so `rsync --delete` cannot unpair the
 * Pi.
 */
const TOKEN_PATH =
  process.env.PHOTOBOOTH_TOKEN_PATH ?? '/var/lib/photobooth/device-token'

let cached: string | null = null

export async function hasToken(): Promise<boolean> {
  return (await token()) !== null
}

async function token(): Promise<string | null> {
  if (cached) return cached
  try {
    cached = (await readFile(TOKEN_PATH, 'utf8')).trim() || null
  } catch {
    cached = null
  }
  return cached
}

/**
 * Marker asking onboarding to offer the setup network even though this Pi is
 * on wifi and would otherwise stay out of the way.
 *
 * Written when the agent's token is refused for good. Without it a Pi whose
 * device was deleted server-side is stranded: the agent cannot authenticate,
 * and onboarding sees a token file, concludes it is already set up, and never
 * broadcasts. Both halves behave sensibly and the box is useless, with the
 * only visible symptom being a setup network that never appears.
 */
export const SETUP_MARKER = '/var/lib/photobooth/needs-setup'

/** The token has been refused for good; ask for the Pi to be set up again. */
export async function requestSetup(): Promise<void> {
  await clearToken()
  await mkdir(dirname(SETUP_MARKER), { recursive: true }).catch(() => {})
  await writeFile(SETUP_MARKER, new Date().toISOString())
  log('this printer is no longer known to the service; asking to be set up again')
}

/** Forgets the stored token, so nothing claims to be paired when it is not. */
export async function clearToken(): Promise<void> {
  cached = null
  await unlink(TOKEN_PATH).catch(() => {})
}

export async function saveToken(value: string): Promise<void> {
  const dir = dirname(TOKEN_PATH)
  await mkdir(dir, { recursive: true })
  // Readable only by its owner: it is the credential for the whole event.
  await writeFile(TOKEN_PATH, value, { mode: 0o600 })

  /*
   * Onboarding writes this as root; the agent reads it as the login user. A
   * root-owned 0600 file would be as useless to the agent as no file at all,
   * so hand it to whoever owns the directory -- which pi-setup.sh creates as
   * the agent's user. Deriving the owner from the directory keeps this
   * working without another setting to get wrong.
   */
  if (process.getuid?.() === 0) {
    try {
      const owner = await stat(dir)
      if (owner.uid !== 0) {
        await chown(TOKEN_PATH, owner.uid, owner.gid)
        log(`token written to ${TOKEN_PATH} for uid ${owner.uid}`)
      } else {
        log(`WARNING: ${dir} is owned by root, so the agent cannot read the`)
        log('token. Run infra/pi-setup.sh to create it with the right owner.')
      }
    } catch (e) {
      log('could not hand the token to the agent user:', e)
    }
  }

  cached = value
}

async function call<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const auth = await token()
  if (!auth) throw new Error('This printer is not paired.')

  const response = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && retry) {
    /*
     * The token on disk may simply be newer than the one in memory.
     *
     * The agent runs for months and reads its token once at startup. Pairing
     * the Pi again writes a new one, and onboarding cannot restart a service
     * it does not own -- so the agent carried on presenting a revoked token
     * and reported it as "no longer paired with an event", while the
     * dashboard showed the device correctly paired to a live event. The two
     * views disagreed and both were telling the truth about different
     * tokens.
     *
     * Re-reading costs one file read on a request that has already failed,
     * and only once: a second 401 with a freshly read token means it really
     * has been revoked.
     */
    const stale = cached
    cached = null
    const fresh = await token()

    if (fresh && fresh !== stale) {
      log('token changed on disk — the Pi was paired again; using the new one')
      return call<T>(method, path, body, false)
    }
  }

  if (response.status === 401) {
    throw new Error('This printer is no longer paired with an event.')
  }
  if (response.status === 204) return undefined as T
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as T
}

/**
 * Ask the service what this box is called, if it does not already know.
 *
 * Printers paired before names existed have none, and re-pairing a working
 * one purely to get a name would mean taking it off the wifi. It already
 * proves which box it is on every request, so it can just ask.
 */
export async function ensureName(): Promise<string | null> {
  const stored = await deviceName()
  if (stored) return stored

  try {
    const { name } = await call<{ name: string }>('POST', '/agent/name', {
      hardwareId: await cpuSerial(),
      proposedName: proposeDeviceName(),
    })

    await mkdir(dirname(NAME_PATH), { recursive: true }).catch(() => {})
    await writeFile(NAME_PATH, name).catch(() => {})
    log(`this printer is called ${name}`)
    return name
  } catch (e) {
    // Not worth failing to start over: it will try again next boot.
    log('could not claim a name yet:', e instanceof Error ? e.message : e)
    return null
  }
}

export const api = {
  heartbeat: (printer: PrinterStatus) => call<void>('POST', '/agent/heartbeat', printer),

  nextJob: () =>
    call<{ job: { id: string; code: string; url: string } | null }>(
      'GET',
      '/agent/jobs/next',
    ),

  jobStatus: (
    jobId: string,
    body: {
      status: 'printing' | 'printed' | 'failed'
      cupsJobId?: string | null
      error?: string | null
    },
  ) => call<void>('POST', `/agent/jobs/${jobId}/status`, body),
}

/** Pairing is unauthenticated: the short code is the credential. */
/**
 * Waits until the API is actually reachable.
 *
 * `nmcli device wifi connect` returns as soon as the radio has associated,
 * which is well before the network is usable: the DHCP lease, the routes and
 * above all /etc/resolv.conf land a moment later. Pairing immediately after
 * joining therefore failed with a bare "fetch failed", zero seconds after
 * the join reported success -- on a Pi that was, a second later, perfectly
 * online.
 *
 * Polling a cheap endpoint is the honest test: not "does NetworkManager say
 * connected" but "can this box reach the thing it needs to talk to".
 */
export async function waitForApi(timeoutMs = 45_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let attempt = 0
  let lastError = 'none'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (response.ok) {
        if (attempt > 0) log(`API reachable after ${attempt} attempt(s)`)
        return true
      }
      lastError = `HTTP ${response.status}`
    } catch (e) {
      // Why it failed matters: a DNS error after a network change is a very
      // different problem from a refused connection, and swallowing the
      // reason cost an afternoon of guessing.
      const err = e as { name?: string; message?: string; cause?: { code?: string } }
      lastError = `${err.name ?? 'Error'}: ${err.message ?? ''} ${err.cause?.code ?? ''}`.trim()
    }

    // Logged on the first failure and then sparingly, so a slow network does
    // not bury the journal while a persistent fault is still visible.
    if (attempt === 0 || attempt % 4 === 0) {
      log(`API not reachable yet (attempt ${attempt + 1}): ${lastError}`)
    }

    // Quick at first -- it is usually ready within a couple of seconds --
    // then backing off rather than hammering.
    await new Promise((r) => setTimeout(r, Math.min(1_000 * 2 ** attempt++, 5_000)))
  }

  log(`giving up on the API after ${Math.round(timeoutMs / 1000)}s; last error: ${lastError}`)
  return false
}

/** Where the name lives, next to the token and equally permanent. */
const NAME_PATH = TOKEN_PATH.replace(/device-token$/, 'device-name')

/**
 * What this box is called.
 *
 * Written once, when the server confirms the name, and read from disk for
 * ever after -- through unpairing, re-pairing and moving between accounts.
 * It identifies the hardware, which is the thing someone is looking at when
 * they wonder which of two printers has stopped.
 */
export async function deviceName(): Promise<string | null> {
  return readFile(NAME_PATH, 'utf8')
    .then((v) => v.trim() || null)
    .catch(() => null)
}

/**
 * This box's name, inventing one if it has never had it confirmed.
 *
 * The setup network is named after the box, which means a name is needed
 * *before* pairing -- and pairing is what normally assigns it. So one is
 * generated locally on first use and written down. The server almost always
 * confirms it; on the rare clash it hands back a different one, and by then
 * the hotspot has done its job.
 *
 * Without this, three printers in one room all advertised "PhotoLu-Setup"
 * and nobody could tell which was which.
 */
export async function localDeviceName(): Promise<string> {
  const stored = await deviceName()
  if (stored) return stored

  const generated = proposeDeviceName()
  await mkdir(dirname(NAME_PATH), { recursive: true }).catch(() => {})
  await writeFile(NAME_PATH, generated).catch(() => {})
  log(`this printer will call itself ${generated} until pairing confirms it`)
  return generated
}

export async function pair(
  code: string,
): Promise<{ token: string; eventId: string | null; name: string | null }> {
  /*
   * The serial identifies the box, not the party.
   *
   * With it the server can hand back the name this unit already had and
   * update its existing row, instead of leaving another orphan behind every
   * time someone sets it up again.
   */
  const hardwareId = await cpuSerial()

  const response = await fetch(`${BASE}/devices/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      hardwareId,
      // Only a suggestion. The server re-rolls it if another box got there
      // first, and its answer is what gets written down.
      proposedName: (await deviceName()) ?? proposeDeviceName(),
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { token?: string; eventId?: string | null; name?: string; error?: { message?: string } }
    | null

  if (!response.ok || !payload?.token) {
    throw new Error(payload?.error?.message ?? 'That pairing code was not accepted.')
  }

  if (payload.name) {
    await mkdir(dirname(NAME_PATH), { recursive: true }).catch(() => {})
    await writeFile(NAME_PATH, payload.name).catch(() => {})
    log(`this printer is called ${payload.name}`)
  }

  return {
    token: payload.token,
    eventId: payload.eventId ?? null,
    name: payload.name ?? null,
  }
}

/**
 * The CPU serial, which is stable for the life of the board.
 *
 * Falls back to the MAC address, then to a random id kept on disk, so a
 * machine that is not a Pi still gets a stable identity rather than a new
 * one every boot.
 */
async function cpuSerial(): Promise<string> {
  const fromCpuinfo = await readFile('/proc/cpuinfo', 'utf8')
    .then((text) => text.match(/^Serial\s*:\s*(\w+)$/m)?.[1])
    .catch(() => undefined)

  if (fromCpuinfo) return fromCpuinfo

  const stored = await readFile(`${dirname(TOKEN_PATH)}/hardware-id`, 'utf8')
    .then((v) => v.trim() || undefined)
    .catch(() => undefined)

  if (stored) return stored

  const generated = randomUUID()
  await mkdir(dirname(TOKEN_PATH), { recursive: true }).catch(() => {})
  await writeFile(`${dirname(TOKEN_PATH)}/hardware-id`, generated).catch(() => {})
  return generated
}
