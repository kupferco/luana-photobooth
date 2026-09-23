# Architecture

A record of what was decided and why, so the reasoning survives. Kept short
on purpose. If a decision is reversed, edit the entry and say why rather than
deleting it.

## The product

A photo booth people can buy or rent as a kit — phone on a tripod, Raspberry
Pi, photo printer — and set up themselves for a party, at a fraction of what
commercial booths cost. Built as a multi-tenant SaaS from the start, whether
or not it becomes a business.

## Shape

```
  Expo app  ──────┐
  (owner + booth) │
                  ├──►  Cloud Run API  ──►  Neon Postgres   (state)
  Guest web page ─┤     photobooth.kupfer.co └►  GCS         (pixels)
  (Vite, no app)  │
                  │
  Pi print agent ─┘     outbound only: holds a connection out, prints what it is told
```

Three clients, one API, one database, one bucket. The Pi opens a connection
outwards and never accepts one.

## Decisions

### Cloud first; the Pi is a print agent, not a server

The phones talk to Cloud Run over the internet, so the Pi needs no inbound
ports, no certificate, no port forwarding, no LAN discovery, no access point.
Flash the card, join wifi, enter a pairing code. That is the difference
between a forty-minute setup and a two-minute one, and setup time is a
product feature when strangers do it themselves.

It also removes the hardest problem in the LAN design: `getUserMedia` needs a
secure context, and `http://192.168.x.x` is not one. Serving from a real
domain with a real certificate makes it a non-issue.

**Cost:** no internet, no party. Mitigated by tethering the Pi and booth phone
to a 4G hotspot — measured at ~2 MB per session, so 40 sessions is ~80 MB.

**Offline fallback** is deferred, and is not a config flag: it means the Pi
runs the whole application locally and syncs later. It stays affordable
because the API is one Node app with storage (GCS ↔ disk) behind a thin
interface, and Drizzle speaks both Postgres and SQLite from one schema.

### Postgres only. No Firestore

Firestore was proposed to get push updates without running a WebSocket
server, since Cloud Run spreads clients across instances and a socket on
instance A never hears an event from instance B.

Dropped after counting the actual event rate: a session goes *queued →
capturing → composing → ready*. Three changes in about a minute. Polling
every two seconds is ~30 small requests per guest, which is free. Firestore
would have meant a second datastore, projection code, a second set of
security rules and per-read billing, to save a delay nobody will notice.

Push earns its keep when state changes constantly — chat, cursors, live
scores. Not here.

All polling goes through one function, `subscribeToSession(code, onChange)`.
If push is ever needed, that function changes and nothing else does.

Note for any revisit: Neon's pooled endpoint is pgbouncer in transaction
mode, which does not support `LISTEN`/`NOTIFY`. The realistic options would
be SSE from Cloud Run, or Firestore.

### Neon, not Cloud SQL

Cloud SQL has a floor of roughly $10–15/month sitting idle, and this is idle
most of the month. Neon scales to zero and branches for free.

### Multi-tenant from day one

Tenant is an **account**, not a person: registering creates a tenant plus an
`owner` membership. Overkill for one party; it is what lets a venue run
twenty without a rewrite, and it is the migration that cannot be retrofitted.

**`tenant_id` on every table, even where derivable.** Denormalised on purpose
so there is exactly one filter to get right.

Isolation, in layers:

1. One data-access module; every function takes `tenantId` as a required
   typed argument. No raw Drizzle calls outside it.
2. Signed URLs always scoped to one exact object, never a prefix listing.
   Paths are `<tier>/t/<tenant>/e/<event>/s/<session>/` — tier first, because
   GCS lifecycle rules only match from the start of a name, and tiering is
   what lets raw frames and montages expire on different schedules.
   Isolation never depended on segment order; `assertWithinTenant()` checks
   the tenant segment and rejects traversal regardless.
3. Postgres RLS held in reserve — Neon's pooled driver needs `SET LOCAL` in
   an explicit transaction per request. Add it before taking real money.

Given the database holds photographs of other people's children, discipline
alone is not enough.

### Identity Platform, with codes rather than links

Identity Platform *is* Firebase Auth — same service, same SDKs, different
console and billing. Either way the client imports from `firebase/auth`.

Sign-in is a **6-digit emailed code**, not a magic link: the link flow needs
universal links, an `apple-app-site-association` file and associated domains,
and it bounces the user Mail → Safari → app. A code is one screen and behaves
identically on web, iOS and Android. We email it via Resend, verify it
server-side, then mint a custom token and call `signInWithCustomToken()`, so
real ID tokens still come out the other end.

Do **not** use Identity Platform's own multi-tenancy. That is for B2B with
isolated login realms; tenancy lives in Postgres.

Three different problems, three answers:

| Who | How |
|---|---|
| Owners | Identity Platform, OTP over email |
| Devices (booth phone, Pi) | One pairing primitive: short code → long-lived device token |
| Guests | No auth. An unguessable session token in the URL — the link *is* the credential |

Because booth and owner are one app, the tripod phone is already signed in,
so pairing it is one authenticated call. The pairing code survives only for
the Pi, which has no human to log it in.

### One app for owner and booth; booth is a mode

One install, one login, one entry point. "Make this device the photo booth"
is a button on the event screen, not a second product.

Booth mode must be hard to leave by accident: full-screen, exit requires a
deliberate long-press plus confirm, and no nav or settings visible while in
it.

### Devices are revoked by deletion, not a flag

Stopping a booth or unpairing a printer deletes the `devices` row. There is
no `disabled` column.

A flag would have to be honoured by every path that authenticates a device,
and one of them would eventually forget -- which is the kind of bug that
shows up as a phone still taking photographs into a party it was removed
from. The row *is* the credential: `requireDevice` looks the token hash up on
every request, so removing the row revokes it on the next call, wherever that
phone is and whether or not it is listening.

Print jobs reference devices with `ON DELETE SET NULL`, so unpairing a
printer does not erase the record of what it printed.

This is deliberately separate from ending the event. The reasons an owner
stops a booth are mundane -- the phone is running out of battery, or it was
lent by someone who wants it back -- and none of them should close the party.
Ending the event stops *everything*; stopping a booth frees *one phone*.

### Expo for the app, Vite for the guest page

Expo for owner and booth: real camera control (focus and exposure lock,
which a `getUserMedia` stream cannot do), `expo-keep-awake`, locked
orientation, and `expo-updates` for OTA fixes mid-season without App Store
review.

The guest page is **not** Expo. A guest scans a QR at a party and must see a
working page in about two seconds on congested wifi, with no install. The
measured Expo web export is **305 KB gzipped**; the guest page should be a
fraction of that. It is also the only surface that never needs to go native.

Phase 1 ships the Expo **web** export, so there is one codebase from the
start and no throwaway build.

### Camera split by platform extension

`CameraView.web.tsx` drives `getUserMedia` and a `<video>` element directly —
a `.web.tsx` file compiles to plain React DOM, and expo-camera's web support
is its weakest platform. `CameraView.native.tsx` uses expo-camera, where it
is strongest. One interface; nothing above knows which it got.

**Mirroring**, which v1 never settled: the live preview is mirrored so people
frame themselves as in a mirror; the stored JPEG is not, so text in shot is
not reversed on the print.

#### Measured on an iPhone, iOS 26.6.2 (WebKit), 21 Sep 2026

Secure context true, camera opens, capture succeeds. `width: {ideal: 1920}`
is honoured exactly.

| Orientation | Capture | Crop for an 845×520 cell | Oversampling (linear) |
|---|---|---|---|
| Landscape | 1920×1080, ~540 KB | 1755×1080 from (83, 0) | **2.08×** |
| Portrait | 1080×1920, ~460 KB | 1080×665 from (0, 628) | 1.28× |

Both crops match `centreCrop()` exactly, so v1's maths is confirmed correct
on real device output.

**The booth must run in landscape**, and not only for resolution. In portrait
the 3:2 cell keeps just 35% of the frame height, so heads get cropped — the
sensor is mostly thrown away. Landscape keeps 91% of the width and gives over
twice the pixels into the same cell.

Native locks this with `expo-screen-orientation`. The web build cannot force
it on iOS, so booth mode detects portrait and asks the user to rotate before
it will start. On a tripod this is a one-time setup step.

Revised bandwidth: ~540 KB per shot, so **about 2 MB per session** including
the montage, not the 1 MB estimated earlier. Forty sessions is ~80 MB —
still comfortably within a phone hotspot.

Tested in Chrome on iOS, which is WKWebView, so the result carries over to
Safari unchanged. Add to Home Screen works from third-party browsers too
since iOS 16.4, so either browser can run the booth kiosk.

### The montage is composed server-side

Cloud Run composes the canonical print file with `sharp`. It has the CPU, the
template and the background already in GCS, and it means old sessions can be
re-rendered under a new template. The Pi never touches pixels.

The client shows an instant local **preview**, which needs no canvas: it is a
view with the background and the shots absolutely positioned from the same
template JSON, scaled down — so it renders identically on web and native.

### The template is data, not code

```json
{ "canvas": {"w":1800,"h":1200},
  "cells": [{"x":36,"y":61,"w":845,"h":520}, ...],
  "backgroundAssetId": "..." }
```

Background upload is a file against that record; new layouts need no deploy;
generating backgrounds later writes to the same `assets` row.

v1's geometry moves across verbatim — 1800×1200 is 6×4in at 300 dpi for the
SELPHY's postcard size, three 845×520 cells, top-right quadrant left for
artwork. Tuned against real prints. Do not adjust casually; make a new
template.

### Retention, and showing it

| Data | Kept | Then |
|---|---|---|
| Raw frames | 30 days | deleted |
| Montages | 90 days default | deleted |
| Guest emails | until the session is deleted | deleted with it, never reused |
| Owner deletes an event | hidden at once | purged from GCS and Postgres within 24h |

Every guest link carries **delete my photos**. Owners are warned at 14 and 3
days with one-click download-everything and extend.

Computed **once** as `events.retention_until` and rendered from that single
value on the guest page, the booth idle screen, the printed QR card, the
owner dashboard and both warning emails. If they disagree, the promise is
broken.

Enforced by a daily Cloud Scheduler job, with **GCS lifecycle rules as an
independent backstop** so photos still expire if the job stops running.

### npm workspaces, not pnpm

pnpm's symlinked `node_modules` needs extra Metro configuration for Expo; npm
hoists flat, which Metro handles natively. One less thing to debug.

## Layout

```
apps/mobile/      Expo — owner + booth mode. Phase 1 ships its web export
apps/guest/       Vite — the only thing strangers load
services/api/     Cloud Run: Express, Drizzle → Neon, sharp, Resend
services/print-agent/  Node on the Pi: outbound only, lp + lpstat
packages/shared/  template geometry, wire types, retention — used by all
v1/               archived Flask original; also tagged v1-luana-2025-09
```

## Region

`europe-west2` (London) for GCS, Cloud Run and the database — lowest latency
for UK parties, and it keeps children's photographs in the UK, which is the
simplest thing to tell a parent. A GCS bucket's location is immutable.

Hosting is a global CDN; no region applies.

## Open

- Venue internet for the event on **1 Oct 2026** — unverified. Biggest risk.
- Raspberry Pi model, OS and whether the SELPHY is already in CUPS — unchecked.
- App Store submission: $99/yr, and a camera app uploading photographs of
  minors will attract review questions. Not on the phase-1 path.
- `photobooth.kupfer.co` not yet pointed at Hosting; running on
  `photolu.web.app` meanwhile.
