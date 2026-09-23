import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
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
 * Kept outside the checked-out code, so redeploying by rsync cannot wipe the
 * pairing and leave the Pi needing a person and a screen.
 */
const TOKEN_PATH = join(homedir(), '.photobooth', 'device-token')

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

export async function saveToken(value: string): Promise<void> {
  await mkdir(dirname(TOKEN_PATH), { recursive: true })
  // Readable only by this user: it is the credential for the whole event.
  await writeFile(TOKEN_PATH, value, { mode: 0o600 })
  cached = value
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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

export async function pair(code: string): Promise<{ token: string; eventId: string | null }> {
  const response = await fetch(`${BASE}/devices/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, label: 'Raspberry Pi' }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { token?: string; eventId?: string | null; error?: { message?: string } }
    | null

  if (!response.ok || !payload?.token) {
    throw new Error(payload?.error?.message ?? 'That pairing code was not accepted.')
  }
  return { token: payload.token, eventId: payload.eventId ?? null }
}
