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

## Layout

| Path | What |
|---|---|
| [`apps/mobile/`](apps/mobile/) | Expo app — the owner's control panel, and booth mode on the tripod phone |
| `apps/guest/` | Small Vite page guests reach by QR. No install, ever |
| `services/api/` | Cloud Run API: Express, Drizzle → Neon Postgres, `sharp`, Resend |
| `services/print-agent/` | Runs on the Pi. Holds a connection outwards and prints what it is told |
| [`packages/shared/`](packages/shared/) | Montage geometry, wire types, retention rules — shared by all of the above |
| [`docs/architecture.md`](docs/architecture.md) | What was decided, and why |

## Getting started

```bash
npm install
npm run dev            # everything
npm run dev -w @photobooth/mobile   # just the Expo app
```

## Status

Early. The workspace, the shared package and the camera check are in; the
API, guest page and print agent are not yet written.

The camera check is deployed at **https://photolu.web.app/spike** — open it
on the tripod phone. It reports what the device actually does (secure
context, capture resolution, encoded size, whether the capture exceeds the
print cell) rather than just working or not.

## Retention

Photographs are deleted on a schedule, and the date is shown to guests before
they are photographed — on the booth screen, on the guest page and on the QR
card. Raw frames last 30 days, finished montages 90. Guests can delete their
own photos from their link at any time. See
[`packages/shared/src/retention.ts`](packages/shared/src/retention.ts), which
is the single place it is computed.
