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

## Still unknown

- **Which Pi, and its OS.** `pi:setup` prints what it finds before changing
  anything.
- **Whether CUPS picks up the SELPHY over USB unaided.** It usually does;
  step 4 covers it if not.
- **Real print timing.** `PRINT_TIMEOUT_MS` is 5 minutes against an expected
  minute a sheet — generous, and worth narrowing once we have seen real ones.
- **Whether `lpstat` reports "out of paper" in a form worth showing.** The
  agent passes CUPS's own wording through; it may need tidying for a guest.
