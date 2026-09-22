import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Wifi, through NetworkManager.
 *
 * Raspberry Pi OS 13 runs NetworkManager, which can host an access point
 * itself -- so there is no hostapd, no dnsmasq and no hand-rolled DHCP here.
 * `nmcli device wifi hotspot` brings up the AP and its address server in one
 * command, and tears them down just as cleanly.
 *
 * The Pi 3 has a single radio, so hosting an access point and scanning for
 * networks are mutually exclusive. Everything below assumes the scan happens
 * before the hotspot starts, and the results are held for the setup page to
 * show.
 */

const IFACE = process.env.WIFI_INTERFACE ?? 'wlan0'

/** The connection NetworkManager creates for our hotspot. */
export const HOTSPOT_CONNECTION = 'photolu-setup'

export interface Network {
  ssid: string
  signal: number
  secured: boolean
}

/**
 * A stable four-character suffix for this Pi, from its CPU serial.
 *
 * Two Pis in one room both advertising `PhotoLu-Setup` would be
 * indistinguishable, so the SSID says which box it is. This is a label, not
 * a secret: the pairing code is what authorises anything.
 */
export async function deviceSuffix(): Promise<string> {
  try {
    const cpuinfo = await readFile('/proc/cpuinfo', 'utf8')
    const serial = cpuinfo.match(/^Serial\s*:\s*(\w+)$/m)?.[1]
    if (serial) return serial.slice(-4).toUpperCase()
  } catch {
    // Not a Pi, or a kernel that does not expose it.
  }
  return 'SETUP'
}

export async function hotspotSsid(): Promise<string> {
  return `PhotoLu-Setup-${await deviceSuffix()}`
}

/** True when the Pi is actually on a network, not merely configured for one. */
export async function isOnline(): Promise<boolean> {
  try {
    const { stdout } = await run('nmcli', ['-t', '-f', 'STATE', 'general'])
    return stdout.trim().startsWith('connected')
  } catch {
    return false
  }
}

/** Saved wifi networks, excluding our own hotspot. */
export async function savedNetworks(): Promise<string[]> {
  const { stdout } = await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show'])
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(':'))
    .filter(([name, type]) => type === '802-11-wireless' && name !== HOTSPOT_CONNECTION)
    .map(([name]) => name!)
}

/**
 * Nearby networks, strongest first.
 *
 * Must be called before the hotspot starts: one radio cannot do both. The
 * rescan is given a moment, because an immediate list is usually stale or
 * empty on a Pi 3.
 */
export async function scan(): Promise<Network[]> {
  await run('nmcli', ['device', 'wifi', 'rescan']).catch(() => {})
  await new Promise((r) => setTimeout(r, 4000))

  const { stdout } = await run('nmcli', [
    '-t',
    '-f',
    'SSID,SIGNAL,SECURITY',
    'device',
    'wifi',
    'list',
  ])

  const seen = new Map<string, Network>()

  for (const line of stdout.split('\n').filter(Boolean)) {
    // nmcli escapes colons inside fields with a backslash.
    const parts = line.split(/(?<!\\):/).map((p) => p.replace(/\\:/g, ':'))
    const [ssid, signal, security] = parts
    if (!ssid) continue

    const entry = {
      ssid,
      signal: Number(signal ?? 0),
      secured: Boolean(security && security !== '' && security !== '--'),
    }

    // The same network appears once per band and per access point; keep the
    // strongest sighting of each name.
    const existing = seen.get(ssid)
    if (!existing || entry.signal > existing.signal) seen.set(ssid, entry)
  }

  return [...seen.values()].sort((a, b) => b.signal - a.signal)
}

/** Brings up the setup access point. Takes the radio, so scanning stops. */
export async function startHotspot(password: string): Promise<string> {
  const ssid = await hotspotSsid()

  await run('nmcli', [
    'device',
    'wifi',
    'hotspot',
    'ifname',
    IFACE,
    'con-name',
    HOTSPOT_CONNECTION,
    'ssid',
    ssid,
    'password',
    password,
  ])

  // Never let the setup network win at boot over a real one.
  await run('nmcli', [
    'connection',
    'modify',
    HOTSPOT_CONNECTION,
    'connection.autoconnect',
    'no',
  ]).catch(() => {})

  return ssid
}

export async function stopHotspot(): Promise<void> {
  await run('nmcli', ['connection', 'down', HOTSPOT_CONNECTION]).catch(() => {})
  await run('nmcli', ['connection', 'delete', HOTSPOT_CONNECTION]).catch(() => {})
}

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: 'bad_password' | 'not_found' | 'timeout' | 'unknown'; detail: string }

/**
 * Joins a network, replacing any saved connection of the same name.
 *
 * nmcli blocks until it succeeds or gives up, so the result here is the real
 * outcome rather than an optimistic "applied".
 */
export async function join(ssid: string, password: string): Promise<JoinResult> {
  await run('nmcli', ['connection', 'delete', ssid]).catch(() => {})

  const args = ['device', 'wifi', 'connect', ssid, 'ifname', IFACE]
  if (password) args.push('password', password)

  try {
    await run('nmcli', args, { timeout: 45_000 })
    return { ok: true }
  } catch (e) {
    const detail = (e as { stderr?: string; message?: string }).stderr
      ?? (e as Error).message
      ?? 'unknown'

    // NetworkManager does not distinguish a wrong password from a network
    // that stopped answering, so the wording stays honest about that.
    if (/Secrets were required|no secrets|invalid|802\.1X|authentication/i.test(detail)) {
      return { ok: false, reason: 'bad_password', detail }
    }
    if (/No network with SSID|not found|No Wi-Fi device/i.test(detail)) {
      return { ok: false, reason: 'not_found', detail }
    }
    if (/timed out|timeout/i.test(detail)) {
      return { ok: false, reason: 'timeout', detail }
    }
    return { ok: false, reason: 'unknown', detail }
  }
}

/** The network currently joined, if any. */
export async function currentSsid(): Promise<string | null> {
  try {
    const { stdout } = await run('nmcli', [
      '-t',
      '-f',
      'ACTIVE,SSID',
      'device',
      'wifi',
      'list',
      '--rescan',
      'no',
    ])
    const active = stdout
      .split('\n')
      .find((l) => l.startsWith('yes:'))
      ?.slice(4)
    return active || null
  } catch {
    return null
  }
}
