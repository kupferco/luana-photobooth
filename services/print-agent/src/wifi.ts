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

/**
 * The address the setup page is served on.
 *
 * Pinned rather than left to NetworkManager, which picks 10.42.0.1 for a
 * shared connection. The page, the printed instructions and the captive
 * redirect all say 192.168.4.1, and an address that is only true by accident
 * is one that stops being true.
 */
export const HOTSPOT_ADDRESS = '192.168.4.1'

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

/**
 * True when the Pi is actually on a network, not merely configured for one.
 *
 * Hosting the setup access point does not count, however cheerfully
 * NetworkManager reports "connected (local)" while it does. That distinction
 * is not academic: this function guards the self-repair timer, so counting
 * the hotspot as "online" meant the timer fired, saw "online", and returned
 * without doing anything -- every time. A Pi that failed to be onboarded sat
 * advertising a setup network indefinitely, with no SSH, no screen and no way
 * back in short of pulling the power. Which is exactly what happened.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const active = await run('nmcli', ['-t', '-f', 'NAME', 'connection', 'show', '--active'])
    const hosting = active.stdout
      .split('\n')
      .some((name) => name.trim() === HOTSPOT_CONNECTION)
    if (hosting) return false

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

/**
 * Brings up the setup access point. Takes the radio, so scanning stops.
 *
 * The network is **open**. That is a deliberate decision, not an oversight,
 * and it was forced by the hardware.
 *
 * NetworkManager always configures an AP's key_mgmt as
 * "WPA-PSK WPA-PSK-SHA256". The SHA256 variant is PMF (802.11w), and the
 * BCM43430 in a Raspberry Pi 3 cannot do it in AP mode. Setting
 * `802-11-wireless-security.pmf disable` does not remove it -- verified on
 * the hardware, the flag is accepted and the AKM is offered anyway. The
 * result is an access point that beacons perfectly and that nothing can
 * associate with: the 4-way handshake fails, and every client reports that
 * as a wrong password. macOS times out, iOS says "incorrect password", and
 * neither says anything about ciphers.
 *
 * Measured: with WPA2, zero associations across repeated attempts from two
 * clients. Open, on the same hardware and channel, a Mac associated, took a
 * DHCP lease and routed to the setup page immediately.
 *
 * The security cost is real and worth naming: the venue's wifi password is
 * typed into a page served over plain HTTP on an open network, so anyone in
 * range while setup is happening could read it. Three things bound that:
 * the network exists only while the Pi is unconfigured, it is taken down the
 * moment onboarding completes, and pairing still requires a single-use code
 * from the owner's own event -- being on this network grants nothing.
 *
 * Note also that the alternative was never much better: the WPA2 password
 * was a hard-coded constant that appears in this repository and in the setup
 * instructions, so it encrypted the link against precisely nobody.
 */
export async function startHotspot(): Promise<string> {
  const ssid = await hotspotSsid()

  // A half-made profile from a failed attempt would collide with this one.
  await run('nmcli', ['connection', 'delete', HOTSPOT_CONNECTION]).catch(() => {})

  await run('nmcli', [
    'connection', 'add',
    'type', 'wifi',
    'ifname', IFACE,
    'con-name', HOTSPOT_CONNECTION,
    // Never let the setup network win at boot over a real one.
    'autoconnect', 'no',
    'ssid', ssid,
    '802-11-wireless.mode', 'ap',
    // 2.4GHz only on this chip; leaving the band to chance invites a channel
    // it cannot use, which is what made the first attempts fail to start.
    '802-11-wireless.band', 'bg',
    '802-11-wireless.channel', '6',
    'ipv4.method', 'shared',
    'ipv4.addresses', `${HOTSPOT_ADDRESS}/24`,
  ])

  await run('nmcli', ['connection', 'up', HOTSPOT_CONNECTION])

  return ssid
}

/** Brings a previously saved network back up, by profile name. */
export async function rejoin(connectionName: string): Promise<void> {
  await run('nmcli', ['connection', 'up', connectionName])
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
/**
 * Removes every saved profile for an SSID, whatever the profile is called.
 *
 * Deleting by name is not enough. A Pi set up with Raspberry Pi Imager gets a
 * profile named after the interface, not the network -- `netplan-wlan0-MYWIFI`
 * for SSID `MYWIFI` -- so a delete by SSID silently matches nothing and the
 * old profile survives. NetworkManager then holds two profiles for one
 * network, and which one wins at boot is not something to discover at a
 * party.
 *
 * Matching on the ssid property instead catches it however it was named.
 */
async function forgetSsid(ssid: string): Promise<void> {
  const { stdout } = await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show'])

  const wireless = stdout
    .split('\n')
    .filter(Boolean)
    // nmcli escapes colons inside fields with a backslash.
    .map((line) => line.split(/(?<!\\):/).map((p) => p.replace(/\\:/g, ':')))
    .filter(([, type]) => type === '802-11-wireless')
    .map(([name]) => name!)

  for (const name of wireless) {
    const saved = await run('nmcli', ['-g', '802-11-wireless.ssid', 'connection', 'show', name])
      .then((r) => r.stdout.trim())
      .catch(() => '')

    if (saved === ssid || name === ssid) {
      await run('nmcli', ['connection', 'delete', name]).catch(() => {})
    }
  }
}

export async function join(ssid: string, password: string): Promise<JoinResult> {
  await forgetSsid(ssid)

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
