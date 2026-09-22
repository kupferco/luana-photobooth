# The Raspberry Pi

The Pi's only job is printing. It holds no inbound port and accepts no
connections: it polls the API, prints what it is given, and reports what
happened. That is why setting one up needs wifi and a pairing code, and
nothing else — no certificate, no port forwarding, no fixed address, nothing
touched on the router.

Everything below is built and tested except the parts that need the actual
hardware, which are marked.

## What it does

```
  API  ──poll──►  agent  ──lp──►  CUPS  ──USB──►  SELPHY
       ◄─report──       ◄─lpstat──
```

1. Every 3 seconds, asks for a job.
2. Downloads the montage straight from storage with a signed URL. The bytes
   never pass through the API.
3. `lp -d <printer> <file>`, and keeps the CUPS job id.
4. Watches `lpstat -o` until the job leaves the queue, then checks the
   printer's own state to tell finished from failed.
5. Reports `printing`, then `printed` or `failed` with a reason.
6. Every 10 seconds, sends the printer's state so the owner's dashboard can
   say "out of paper" rather than nothing.

v1 called `lp` and reported success the moment it returned, which only ever
meant CUPS had accepted the file. An unplugged, jammed or empty printer
looked exactly like a working one. This is the fix.

## Your dev loop

```bash
npm run agent        # runs the agent on this Mac against the local API
DRY_RUN=1 npm run agent   # accepts and completes jobs, prints nothing
```

`DRY_RUN=1` is how the whole loop was tested without a printer: it takes
real jobs from the real API and carries them to `printed`, skipping only the
`lp` call. Useful on the Mac, and on the Pi before the SELPHY arrives.

Against the Pi:

```bash
npm run pi:setup     # once per Pi: Node, CUPS, systemd unit
npm run pi:deploy    # build, rsync, restart — a few seconds
npm run pi:logs      # journalctl -f
```

`pi:deploy` sends **built output, not source**. The Pi runs one bundled file
and needs no toolchain, no `npm install` and no workspace, so a deploy is a
copy and a restart. That is what makes iterating on it bearable.

Set `PI_HOST` if the Pi is not `photolu@photolu.local`:

```bash
export PI_HOST=pi@192.168.1.50
```

## First-time setup

Nothing here is guessed — but it is written against a Pi I have not seen, so
expect one or two surprises.

1. **Flash Raspberry Pi OS Lite (64-bit).** Set the hostname to `photolu`,
   enable SSH and enter the wifi details in Imager, so it comes up on the
   network with no screen.

2. **Check you can reach it:** `ssh photolu@photolu.local`

3. **`npm run pi:setup`** — installs Node 22, CUPS and the systemd unit, and
   prints what it found first.

4. **Plug in the SELPHY and confirm CUPS sees it:**
   ```bash
   ssh photolu@photolu.local 'lpstat -p'
   ```
   If it is missing, add it through CUPS: `sudo lpadmin -p Canon_SELPHY_CP1500
   -E -v usb://Canon/CP1500 -m everywhere`. The exact URI comes from
   `lpinfo -v`.

5. **`npm run pi:deploy`**, then edit `/opt/photobooth/.env` on the Pi with the
   printer name from step 4 and the API URL.

6. **Pair it.** Create an event in the app, generate a pairing code, then:
   ```bash
   ssh photolu@photolu.local \
     'cd /opt/photobooth && node --env-file=.env dist/pair.js ABC123'
   ```
   The token lands in `~/.photobooth/device-token`, outside the deploy
   directory, so redeploying never wipes the pairing and needs no screen.

7. **`npm run pi:logs`** and take a photo.

## Decisions worth knowing

**The token lives outside the deploy directory.** `rsync --delete` into
`/opt/photobooth` would otherwise unpair the Pi on every deploy, and
re-pairing needs a person with a code.

**Old jobs are cancelled at startup.** A Pi unplugged mid-party comes back
with yesterday's queue still pending; printing those first wastes paper on
photos nobody is waiting for.

**One job at a time.** A SELPHY takes about a minute a sheet, so handing the
agent work it cannot start achieves nothing, and a queue held in the database
survives the Pi being unplugged.

**Failures are reported, not swallowed.** The owner's dashboard is the only
place anybody will find out, and a silent failure at a party is the worst
kind.

**`Restart=always`.** Six hours, nobody watching.

**No dotenv.** systemd reads the env file itself, and Node reads one with
`--env-file`, so the dependency only added a CommonJS `require()` to an ESM
bundle. The agent is 16 KB with no `node_modules` at all.

## Pairing, and why there is no list of Pis

A Pi is claimed by **possession**: the owner generates a code in their own
event, and someone types it into that Pi. Pairing therefore requires standing
next to the hardware.

It is tempting to invert this -- give every Pi a printed serial, and let the
owner pick theirs from a list in the app. That is worse. A visible identifier
is something anyone can read, photograph or guess, and the moment a Pi can be
claimed by naming it, possession stops being the proof. With several tenants
running events at once, the current direction is what keeps one venue's
printer out of another venue's event.

**Do not add a same-network check.** It reads like a second factor and is
not one: venue wifi is shared by everyone in the building, guest networks
NAT differently, and a Pi on a 4G hotspot is on a different network from the
owner standing beside it. It would reject legitimate setups while stopping
nobody who was actually trying.

### The gap: someone who did not build this

Pairing over SSH is fine for us and impossible for a customer. A kit arriving
in a box has two problems, and only one of them is pairing:

**1. Wifi provisioning, with pairing folded in.** Required.

The hotspot must name which box it is: `PhotoLu-Setup-A7F3`, the suffix
taken from the Pi's CPU serial and printed on the case. Two Pis in one room
both broadcasting `PhotoLu-Setup` would be indistinguishable. It is a label,
not a credential -- the pairing code is still what authorises anything.

A fresh Pi has no credentials, so it is on no network, so it can be reached
at no address. The way out is the one every headless device uses:

1. No wifi saved, so the Pi starts its own access point -- `PhotoLu-Setup`.
2. The owner joins it from their phone. A captive portal opens, or they
   visit `192.168.4.1` -- not `photolu.local`, which needs a network that
   does not exist yet.
3. One form: choose your wifi and enter its password, and paste the pairing
   code from the app.
4. The Pi saves both, drops the hotspot, joins the real network, and claims
   the event.

`hostapd` plus `dnsmasq` plus a captive portal, and fiddly to test across
phones. Days of work, and the thing to build first when this becomes a kit
someone else sets up.

**Do not rely on the portal popping up by itself.** Phones detect captive
portals by fetching a known URL and the behaviour varies: iOS opens a
restricted webview that closes unpredictably and is poor at JavaScript,
Android may warn about no internet and offer to leave, and some phones drop
back to mobile data on a network that cannot reach anything. Implement the
detection endpoints so it appears when it can, keep the page plain HTML with
no clever scripting, and print **"join PhotoLu-Setup-XXXX, then open
192.168.4.1"** on the box. The typed address is the path that always works;
the popup is a convenience.

**2. The Pi prints its own claim code.** A nicety.

It has a printer attached, so on first boot it can print a card with a code
for the owner to type into the app. Possession of a piece of paper that came
out of *that* printer is a lovely proof and needs no screen.

But it only solves pairing. The Pi still has to be on a network to talk to
anything, so this sits on top of (1) rather than replacing it.

### More than one printer at an event

Supported, and the queue is safe for it. A job is claimed in a single
statement with `FOR UPDATE SKIP LOCKED`, so two agents polling the same
instant cannot take the same job -- the second steps past the locked row to
the next one, and two printers drain the queue in parallel rather than
queueing behind each other.

Before that it was a select followed by an update, which would have printed
the same photo twice on two printers. Verified with two agents polling
simultaneously: four jobs, two printers, two each, no duplicates.

## Still unknown

- **Which Pi, and its OS.** `pi:setup` prints what it finds before changing
  anything.
- **Whether CUPS picks up the SELPHY over USB unaided.** It usually does;
  step 4 covers it if not.
- **Real print timing.** `PRINT_TIMEOUT_MS` is 5 minutes against an expected
  minute a sheet — generous, and worth narrowing once we have seen real ones.
- **Whether `lpstat` reports "out of paper" in a form worth showing.** The
  agent passes CUPS's own wording through; it may need tidying for a guest.
