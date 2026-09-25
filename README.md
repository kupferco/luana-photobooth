# Photo Booth

A self-serve party photo booth: a phone on a tripod takes the photos, a
Raspberry Pi prints them, and guests trigger it from their own phones by
scanning a QR code. Built to be set up by whoever bought the kit, without
anyone technical in the room.

Guests can print their montage, keep a link to it, and delete it. Owners get
a gallery of the whole party and can download everything before it expires.

> The original single-machine version, which ran at Luana's party on
> 13 September 2025, is archived in [`v1/`](v1/) and tagged
> `v1-luana-2025-09`. It still works, and is the fallback.

## Start here

| I want to... | Go to |
|---|---|
| Run it on this machine | [Running it locally](#running-it-locally) |
| **Set up a brand new Raspberry Pi** | [Setting up a Raspberry Pi from scratch](#setting-up-a-raspberry-pi-from-scratch) |
| Connect a printer to a party | [Pairing a printer to a party](#pairing-a-printer-to-a-party) |
| Run a party today | [On the day](#on-the-day) |
| Ship a change | [Deploying](#deploying) |
| Work out why something is broken | [When something is wrong](#when-something-is-wrong) |

The four commands that do almost everything to a Pi:

```bash
npm run pi:setup      # once per Pi: Node, CUPS, services, DNS, sudo rule
npm run pi:deploy     # build and copy the agent. Seconds.
npm run pi:printer    # driver, JPEG decoder, CUPS queue for the SELPHY
npm run pi:status     # power, wifi, agent, pairing, printer, recent logs
```

## Layout

| Path | What |
|---|---|
| [`apps/mobile/`](apps/mobile/) | Expo app — the owner's control panel, and booth mode on the tripod phone |
| `apps/guest/` | Small Vite page guests reach by QR. No install, ever |
| `services/api/` | Cloud Run API: Express, Drizzle → Neon Postgres, `sharp`, Resend |
| `services/print-agent/` | Runs on the Pi. Holds a connection outwards and prints what it is told |
| [`packages/shared/`](packages/shared/) | Montage geometry, wire types, retention rules — shared by all of the above |
| [`docs/architecture.md`](docs/architecture.md) | What was decided, and why |

## Running it locally

```bash
npm install
npm start
```

That starts three things and prints their addresses:

| | |
|---|---|
| **Booth** | `localhost:8083/booth` — must be localhost, the camera needs a secure context |
| **Guest** | `<your-lan-ip>:5173/<CODE>` — the LAN address, so a phone can reach it |
| **API** | `<your-lan-ip>:8080` |

The print agent is deliberately **not** started: it belongs on the Pi and has
no config here. Run it by hand with `npm run agent` if you need to.

Other useful ones:

```bash
npm run client:fixtures   # the app with fake data, no server needed
npm run agent             # the print agent, on this machine
npm run db:studio         # browse the database
npm run logs:staging      # tail the deployed API
```

## Setting up a Raspberry Pi from scratch

You need: a Pi 3 or better, a good 5V supply (**at least 3A** — a phone
charger will brown it out), a micro-SD card, and a USB-A to USB-C cable for
the SELPHY.

**1. Flash the card.** Raspberry Pi Imager → Raspberry Pi OS (64-bit). Before
writing, open the settings gear and set:

- hostname `photolu`
- a username and password (you will need the password for every step below)
- your wifi, so it comes up on the network the first time
- **enable SSH**

**2. Install everything.** Boot the Pi, wait a minute, then:

```bash
npm run pi:setup
```

Node, CUPS, both systemd services, the token directory, the captive-portal
DNS config and a narrow sudoers rule. Asks for the Pi password once. Safe to
re-run — it skips whatever is already there.

**3. Deploy the agent.**

```bash
npm run pi:deploy      # build, copy, restart. A few seconds.
```

**4. Set the printer up.** Plug the SELPHY into a Pi USB port with the
USB-A → USB-C cable and turn it on, then:

```bash
npm run pi:printer
```

This installs a Gutenprint new enough to know the CP1500 (Debian's own is
from 2022 and does not), a JPEG decoder, masks `ipp-usb` so it stops stealing
the printer, and adds the CUPS queue.

**5. Print the card.**

```bash
npm run pi:card
```

Opens a card in your browser — **print it on paper**, cut it out, tape it to
the box. It carries the QR and the printer's own name.

**6. Check it.**

```bash
npm run pi:status
```

Power, wifi, agent, pairing, printer, and the last few log lines. Run this
first whenever anything seems wrong. `healthy (0x0)` under Power means the
supply is fine; anything else and suspect the supply before the software.

## Pairing a printer to a party

In the app: open the event → **Setup** → **Set up a new printer**. You get a
code and five steps. The short version:

1. Have your wifi name and password to hand.
2. Power the printer box on.
3. Join the wifi network named after the printer (it is on the card).
4. Scan the QR on the card, or open `photolu.local`.
5. Enter your wifi details and the code.

A printer that is **already set up** does not broadcast anything — it is on
your wifi and has nothing to offer. Add it from **Your printers** in the same
Setup section, one tap, no code.

Ending a party releases its printers back to that list and stops its booths.

## On the day

1. Create the event, **start** it (the guest link does nothing until you do).
2. Add the printer from **Your printers**.
3. On the tripod phone: **Use this phone as the booth**. Keep it plugged in.
4. Load paper. Check `npm run pi:status` says the printer is idle.
5. Share the guest link, or let people scan the QR on the booth screen.

Watch the two dots on the event screen. Green is fine, amber means online but
not ready to print, red means it has stopped answering.

**The dashboard cannot tell you the paper has run out** until a print
actually fails — CUPS reports an empty SELPHY as idle. Check the cassette
yourself.

## Deploying

```bash
npm run deploy              # both, to staging
npm run deploy:prod         # both, to prod (asks first)
npm run deploy:front:prod   # app and guest page only
npm run deploy:back:staging # API only
```

Staging and prod share one database. That is deliberate for now and noted in
[`docs/architecture.md`](docs/architecture.md).

## When something is wrong

| Symptom | Look here |
|---|---|
| Anything at all with the Pi | `npm run pi:status` — power first |
| Printer not found | `npm run pi:printer` again; it is safe to re-run |
| Pi unreachable, no setup network | It may be mid-onboarding. Wait 15 minutes and it puts itself back on your wifi |
| Printer shows red in the app | It has stopped calling in. Check power and wifi |
| `npm start` fails on a port | A stray dev server: `pkill -f "tsx watch"` |
| Metro cannot find a new file | Stale cache: `rm -rf /tmp/metro-*` then `npm start` |

More detail, and the reasoning behind the awkward bits, is in
[`docs/pi.md`](docs/pi.md).

## Retention

Photographs are deleted on a schedule, and the date is shown to guests before
they are photographed — on the booth screen, on the guest page and on the QR
card. Raw frames last 30 days, finished montages 90. Guests can delete their
own photos from their link at any time, which also kills every link they
shared. See [`packages/shared/src/retention.ts`](packages/shared/src/retention.ts),
which is the single place it is computed.
