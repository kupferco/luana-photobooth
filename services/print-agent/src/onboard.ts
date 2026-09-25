import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  apiBase,
  apiBaseIsDefault,
  hasToken,
  pair,
  saveToken,
  SETUP_MARKER,
  waitForApi,
} from './client'
import { setupPage } from './setup-page'
import {
  currentSsid,
  HOTSPOT_ADDRESS,
  hotspotSsid,
  isOnline,
  join,
  rejoin,
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
    await startHotspot()
    return joined.reason === 'bad_password'
      ? 'That password was not accepted. Try again.'
      : joined.reason === 'not_found'
        ? 'That network did not answer. Move closer and try again.'
        : 'Could not join that network. Try again.'
  }

  log('joined; waiting for the network to be usable')

  /*
   * The join is not the same thing as being online. Pairing straight after
   * it failed with "fetch failed" in the same second, because DNS had not
   * caught up with the radio yet.
   */
  if (!(await waitForApi())) {
    log('joined the network but the API is not reachable')
    exitSoon('wifi joined but the API is unreachable')
    return (
      `Connected to ${ssid}, but the photo booth service could not be reached. ` +
      'Check the network has internet, then try the code again.'
    )
  }

  log('pairing')

  try {
    const { token } = await pair(code.trim())
    await saveToken(token)
    log('paired')
    finished = true
    // Whatever asked for setup has been answered.
    await unlink(SETUP_MARKER).catch(() => {})

    /*
     * Nudge the agent so the printer appears in the app immediately.
     *
     * It would get there anyway -- it re-reads its token when a request is
     * refused -- but that means one failed poll first, and the owner is
     * watching the dashboard right now waiting for the printer to show up.
     * Best effort: if this fails the agent still recovers on its own.
     */
    await restartAgent()

    exitSoon('paired')
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log(`pairing failed: ${message}`)
    // The wifi is good, so leave it: the owner can retry the code over SSH,
    // or run onboarding again -- which needs this process gone.
    exitSoon('wifi joined but pairing failed')
    return `Connected to ${ssid}, but the pairing code was not accepted. ${message}`
  }
}

/** Best effort: the agent recovers by itself if this does not work. */
async function restartAgent(): Promise<void> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    await promisify(execFile)('systemctl', ['restart', 'photobooth-agent'])
    log('restarted the print agent so it picks the new token up at once')
  } catch (e) {
    log('could not restart the agent; it will pick the token up on its next poll')
  }
}

/**
 * Stops onboarding a short while after it has nothing left to do.
 *
 * Once the wifi has joined, the hotspot is down and this page is reachable
 * from nowhere -- so staying up serves no one, and it holds port 80, which
 * stops onboarding ever being run again. Observed on the Pi: a failed
 * pairing left the process listening for 38 minutes, and the retry could not
 * start because the unit name was still taken.
 *
 * The delay is so the phone still on the old network gets its response
 * before the process goes.
 */
function exitSoon(reason: string, ms = 20_000): void {
  log(`${reason} — stopping onboarding in ${Math.round(ms / 1000)}s`)
  setTimeout(() => {
    log('onboarding done')
    process.exit(0)
  }, ms)
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://setup.local')

  /*
   * Captive-portal probes, answered the way a working network would.
   *
   * This is deliberately the opposite of hijacking them. A phone that thinks
   * a network is captive opens its own restricted webview -- on iOS the
   * Captive Network Assistant -- and that view dies the moment it is
   * backgrounded, taking the half-filled form with it. Someone going to
   * fetch their wifi password from a password manager loses everything, and
   * iOS then drops the network for a known-good one.
   *
   * Telling each platform what it wants to hear makes the setup network
   * behave like any other: no sheet, no nagging, no switching away. The
   * owner opens the page themselves by scanning the QR on the printer, in a
   * real browser tab they can leave and come back to.
   *
   * dnsmasq still answers every name with this box, which is what lets that
   * QR point at http://photolu.local rather than an IP address.
   */
  const probe = url.pathname.toLowerCase()

  if (probe === '/hotspot-detect.html' || probe === '/library/test/success.html') {
    // The exact body iOS and macOS compare against. Anything else and the
    // sheet appears.
    send(
      res,
      200,
      '<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>',
    )
    return
  }

  if (probe === '/generate_204' || probe === '/gen_204') {
    // Android wants 204 and an empty body.
    res.writeHead(204).end()
    return
  }

  if (probe === '/ncsi.txt' || probe === '/connecttest.txt') {
    send(res, 200, 'Microsoft Connect Test', 'text/plain')
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
    await rejoin(previous[0]!).catch(() => {})

    /*
     * And stop, for the same reason as every other ending: the hotspot is
     * down, so this page is reachable from nowhere, and staying up holds
     * port 80 and the unit name against the next attempt.
     *
     * Missed the first time because this path restores the network and felt
     * finished, which it is -- it just never said so.
     */
    exitSoon('nobody completed setup')
  }, REVERT_AFTER_MS)
}

async function main(): Promise<void> {
  /*
   * The agent can ask for this too.
   *
   * A Pi whose device was deleted server-side holds a token that no longer
   * works. Onboarding sees the file, concludes it is already set up, and
   * stays out of the way -- so the setup network never appears and the box
   * sits there looking fine and doing nothing. The agent drops the marker
   * when its token is refused for good, and it means: offer setup even
   * though this Pi is on wifi.
   */
  const asked = existsSync(SETUP_MARKER)
  const force = process.argv.includes('--force') || asked

  if (asked) log('the agent asked to be set up again')

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
  log(`api: ${apiBase}`)
  if (apiBaseIsDefault) {
    log('WARNING: PHOTOBOOTH_API_URL is not set, so this is the localhost')
    log('default and pairing cannot work. Run this with the service, or pass')
    log('--property=EnvironmentFile=/opt/photobooth/.env to systemd-run.')
  }

  // Before the hotspot takes the radio.
  const previous = await savedNetworks()
  log('scanning for networks')
  networks = await scan()
  log(`found ${networks.length}`)

  /*
   * Armed before the attempt, not after it.
   *
   * The first run on real hardware failed inside startHotspot, and because
   * the timer was armed afterwards there was nothing scheduled to put the
   * wifi back. It survived only because the AP never managed to take the
   * radio; failing a moment later would have left the Pi with no network,
   * no SSH and no screen.
   */
  armRevert(previous)

  let ssid: string
  try {
    ssid = await startHotspot()
  } catch (e) {
    log('could not start the setup network:', e instanceof Error ? e.message : e)
    // No reason to make anyone wait out the revert timer for a failure we
    // already know about.
    await stopHotspot()
    if (previous[0]) {
      log(`putting ${previous[0]} back`)
      await rejoin(previous[0]).catch(() => {})
    }
    return
  }

  log(`hotspot up: ${ssid} (open network — see startHotspot for why)`)
  log(`setup page at http://${HOTSPOT_ADDRESS}/`)

  createServer((req, res) => {
    handler(req, res).catch((e) => {
      log('request failed', e)
      send(res, 500, setupPage({ networks, error: 'Something went wrong. Try again.' }))
    })
  }).listen(PORT, () => log(`listening on :${PORT}`))
}

void main()
