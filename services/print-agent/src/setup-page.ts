import type { Network } from './wifi'

/**
 * The setup page.
 *
 * Deliberately one file of plain HTML with no JavaScript, no fonts and no
 * requests to anywhere. It is served over a network with no internet, often
 * inside iOS's captive-portal webview, which is a cut-down browser that
 * closes without warning and handles scripts poorly. Anything clever here
 * would work on a laptop and fail on the phone actually being used.
 *
 * One page, one form, one submit.
 */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Four bars, so the nearest network is obvious without a signal number. */
function bars(signal: number): string {
  const n = signal >= 70 ? 4 : signal >= 50 ? 3 : signal >= 30 ? 2 : 1
  return '▁▃▅▇'.slice(0, n).padEnd(4, ' ')
}

export function setupPage(opts: {
  networks: Network[]
  error?: string | null
  ssid?: string
  applying?: boolean
}): string {
  const { networks, error, ssid = '', applying = false } = opts

  const options = networks
    .map(
      (n) =>
        `<option value="${escape(n.ssid)}"${n.ssid === ssid ? ' selected' : ''}>` +
        `${bars(n.signal)} ${escape(n.ssid)}${n.secured ? '' : ' (open)'}</option>`,
    )
    .join('\n      ')

  if (applying) {
    return page(`
    <h1>Connecting…</h1>
    <p class="muted">
      The photo booth is joining <strong>${escape(ssid)}</strong>. This setup
      network will disappear in a moment — that is what success looks like.
    </p>
    <p class="muted">
      Rejoin your normal wifi, then check the event in the app: the printer
      appears there within a few seconds.
    </p>
    <p class="muted small">
      If it does not, reconnect to the setup network and try again.
    </p>`)
  }

  return page(`
    <h1>Set up the photo booth</h1>
    <p class="muted">
      Choose your wifi and paste the pairing code from the app.
    </p>

    <!--
      This warning is here because of what a phone does, not what this page
      does. On iOS the page is shown in the Captive Network Assistant, and
      leaving it -- to fetch a wifi password from a password manager, say --
      backgrounds it. The network has no internet, so iOS drops it for a
      known-good one and the sheet closes, losing whatever was typed.

      There is no way to stop that from inside the page, so the only honest
      thing is to say so before someone loses their work to it.
    -->
    <p class="warn">
      Have your wifi password ready before you start. Leaving this screen —
      even to open a password manager — disconnects the photo booth network
      and you will have to begin again.
    </p>

    ${error ? `<p class="error">${escape(error)}</p>` : ''}

    <form method="POST" action="/setup">
      <label for="ssid">Your wifi network</label>
      ${
        networks.length
          ? `<select id="ssid" name="ssid" required>
        <option value="">Choose…</option>
      ${options}
      </select>`
          : `<input id="ssid" name="ssid" required placeholder="Network name"
             autocapitalize="off" autocorrect="off" spellcheck="false">
         <p class="muted small">No networks found. Type the name exactly.</p>`
      }

      <label for="password">Wifi password</label>
      <input id="password" name="password" type="password"
             autocapitalize="off" autocorrect="off" spellcheck="false">

      <label for="code">Pairing code</label>
      <input id="code" name="code" required placeholder="ABC123"
             autocapitalize="characters" autocorrect="off" spellcheck="false">
      <p class="muted small">From the event in the app, under Printer.</p>

      <button type="submit">Connect</button>
    </form>`)
}

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Photo Booth setup</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #111; color: #fff;
    max-width: 420px; margin-inline: auto;
  }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .muted { color: #9a9a9f; margin: 0 0 16px; }
  .small { font-size: 13px; }
  .error {
    background: #2a1215; color: #ff8b8b;
    border-left: 3px solid #ef4444;
    padding: 12px 14px; border-radius: 6px; margin: 0 0 16px;
  }
  .warn {
    background: #2a2412; color: #f5c518;
    border-left: 3px solid #f5c518;
    padding: 12px 14px; border-radius: 6px; margin: 0 0 20px;
    font-size: 14px; line-height: 1.45;
  }
  label { display: block; font-size: 13px; color: #9a9a9f;
          text-transform: uppercase; letter-spacing: .6px; margin: 16px 0 6px; }
  select, input {
    width: 100%; font: inherit; padding: 14px;
    background: #1c1c1e; color: #fff;
    border: 1px solid #3a3a3c; border-radius: 10px;
    /* Stops iOS zooming the page when a field is focused. */
    font-size: 16px;
  }
  button {
    width: 100%; margin-top: 24px; padding: 18px;
    font: inherit; font-size: 17px; font-weight: 600;
    background: #f5c518; color: #111;
    border: 0; border-radius: 10px;
  }
</style>
</head>
<body>
${body}
</body>
</html>`
}
