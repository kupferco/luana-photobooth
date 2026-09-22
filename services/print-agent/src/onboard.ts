import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { hasToken, pair, saveToken } from './client'
import { setupPage } from './setup-page'
import {
  currentSsid,
  hotspotSsid,
  isOnline,
  join,
  savedNetworks,
  scan,
  startHotspot,
  stopHotspot,
  type Network,
} from './wifi'

/**
 * First-run onboarding.
 *
 * A Pi out of a box has no wifi, so it is on no network, so it can be
 * reached at no address. The way out is the one every headless device uses:
 * host an access point, let the owner join it from their phone, and collect
 * both the wifi password and the pairing code on one page.
 *
 * The single radio means the AP and scanning are mutually exclusive, so the
 * network list is gathered before the hotspot starts and served from memory
 * afterwards.
 *
 * Nothing here is a security boundary. The setup network is open to anyone
 * in range for as long as it is up, which is why it is only up when the Pi
 * is unconfigured, and why pairing still needs a code that came from the
 * owner's own event.
 */

const PORT = Number(process.env.ONBOARD_PORT ?? 80)
const HOTSPOT_PASSWORD = process.env.HOTSPOT_PASSWORD ?? 'photobooth'

/**
 * How long to wait before deciding onboarding has failed and putting the
 * known-good wifi back.
 *
 * This exists so testing cannot brick the Pi. Removing the wifi config to
 * try the hotspot means that if the hotspot does not come up, there is no
 * network, no SSH and no screen -- only a card to pull and reflash. With
 * this, the Pi repairs itself.
 */
const REVERT_AFTER_MS = Number(process.env.ONBOARD_REVERT_MS ?? 15 * 60_000)

let networks: Network[] = []
let lastError: string | null = null
let finished = false

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), '[onboard]', ...args)

function send(res: ServerResponse, status: number, body: string, type = 'text/html') {
  res.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    // The setup page changes as state changes; never let a phone cache it.
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return Object.fromEntries(new URLSearchParams(raw))
}

/**
 * Applies what the owner typed: join the network, then claim the event.
 *
 * Order matters. Pairing needs the internet, so the wifi has to work first;
 * and if the wifi fails there is no point burning a single-use pairing code.
 */
async function apply(ssid: string, password: string, code: string): Promise<string | null> {
  log(`joining ${ssid}`)

  // The hotspot holds the radio, so it has to go before we can join anything.
  await stopHotspot()

  const joined = await join(ssid, password)

  if (!joined.ok) {
    log(`join failed: ${joined.reason}`)
    // Back to the hotspot so the owner can try again, rather than leaving a
    // Pi on no network at all.
    await startHotspot(HOTSPOT_PASSWORD)
    return joined.reason === 'bad_password'
      ? 'That password was not accepted. Try again.'
      : joined.reason === 'not_found'
        ? 'That network did not answer. Move closer and try again.'
        : 'Could not join that network. Try again.'
  }

  log('joined; pairing')

  try {
    const { token } = await pair(code.trim())
    await saveToken(token)
    log('paired')
    finished = true
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log(`pairing failed: ${message}`)
    // The wifi is good, so leave it: the owner can retry the code from
    // anywhere on the network rather than rejoining the hotspot.
    return `Connected to ${ssid}, but the pairing code was not accepted. ${message}`
  }
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://setup.local')

  /*
   * Captive-portal probes.
   *
   * Phones decide whether a network has internet by fetching a known URL and
   * checking the answer. Redirecting these is what makes the setup page open
   * by itself. It is unreliable across platforms -- iOS uses a restricted
   * webview, Android may offer to leave the network -- so the printed
   * instruction to visit the address directly is the path that always works.
   */
  if (
    url.pathname === '/generate_204' ||
    url.pathname === '/gen_204' ||
    url.pathname === '/hotspot-detect.html' ||
    url.pathname === '/ncsi.txt' ||
    url.pathname === '/connecttest.txt' ||
    url.pathname.startsWith('/redirect')
  ) {
    res.writeHead(302, { location: `http://${req.headers.host ?? '192.168.4.1'}/` })
    res.end()
    return
  }

  if (req.method === 'POST' && url.pathname === '/setup') {
    const body = await readBody(req)
    const ssid = (body.ssid ?? '').trim()
    const code = (body.code ?? '').trim()

    if (!ssid || !code) {
      lastError = 'Choose a network and enter the pairing code.'
      send(res, 400, setupPage({ networks, error: lastError, ssid }))
      return
    }

    // Answer before applying: joining takes the radio down, so this response
    // is the last thing that reaches the phone over the hotspot.
    send(
      res,
      200,
      setupPage({ networks, applying: true, ssid }),
    )

    const error = await apply(ssid, body.password ?? '', code)
    lastError = error
    if (!error) log('onboarding complete')
    return
  }

  if (url.pathname === '/status') {
    send(
      res,
      200,
      JSON.stringify({
        online: await isOnline(),
        ssid: await currentSsid(),
        paired: await hasToken(),
        finished,
        error: lastError,
      }),
      'application/json',
    )
    return
  }

  send(res, 200, setupPage({ networks, error: lastError }))
}

/**
 * Restores the previously working wifi if onboarding has not completed.
 *
 * Only relevant while testing, when we deliberately remove the wifi to see
 * the hotspot come up. In the field there is nothing to revert to.
 */
function armRevert(previous: string[]): void {
  if (previous.length === 0) return

  setTimeout(async () => {
    if (finished || (await isOnline())) return

    log(`nothing configured after ${Math.round(REVERT_AFTER_MS / 60000)} minutes`)
    log(`restoring ${previous[0]} so this Pi stays reachable`)

    await stopHotspot()
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    await promisify(execFile)('nmcli', ['connection', 'up', previous[0]!]).catch(() => {})
  }, REVERT_AFTER_MS)
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')

  const online = await isOnline()
  const paired = await hasToken()

  if (online && paired && !force) {
    log('already set up; nothing to do')
    return
  }

  /*
   * Being online is enough to stay out of the way.
   *
   * The hotspot exists for a Pi that cannot be reached at all. A Pi that is
   * on a network but not yet paired is perfectly reachable -- over SSH, or
   * by the app -- so taking the radio to advertise a setup network would
   * disconnect a working machine to solve a problem it does not have. That
   * is exactly what would happen on the next reboot of a Pi that is online
   * and simply has not been paired yet.
   *
   * --force is for testing the hotspot deliberately.
   */
  if (online && !force) {
    log('online but not paired — leaving the network alone')
    log('pair over SSH, or from the app once the agent is running')
    return
  }

  log(`starting — online: ${online}, paired: ${paired}`)

  // Before the hotspot takes the radio.
  const previous = await savedNetworks()
  log('scanning for networks')
  networks = await scan()
  log(`found ${networks.length}`)

  const ssid = await startHotspot(HOTSPOT_PASSWORD)
  log(`hotspot up: ${ssid} (password: ${HOTSPOT_PASSWORD})`)
  log('setup page at http://192.168.4.1/')

  armRevert(previous)

  createServer((req, res) => {
    handler(req, res).catch((e) => {
      log('request failed', e)
      send(res, 500, setupPage({ networks, error: 'Something went wrong. Try again.' }))
    })
  }).listen(PORT, () => log(`listening on :${PORT}`))
}

void main()
