#!/usr/bin/env node
/**
 * Starts everything: the API, the booth app and the guest page.
 *
 * Binds to this machine's LAN address when there is one, so a phone on the
 * same wifi can scan the booth's QR and actually reach the guest page.
 * There is no reason to ever want the opposite, which is why this is not a
 * separate command -- it was, and the name confused which app from where.
 *
 * The guest page needs no camera, so plain http over the LAN is fine for it.
 * The booth does need a secure context, but stays on this machine at
 * localhost, which counts as one -- so only the phone crosses the network.
 */
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}

// No wifi is not a failure: everything still works on this machine, only the
// phone cannot join in.
const host = lanAddress() ?? 'localhost'
const onLan = host !== 'localhost'

const api = `http://${host}:8080`
const guest = `http://${host}:5173`

console.log(`
  Booth   http://localhost:8083/booth   (this machine — the camera needs localhost)
  Guest   ${guest}/<CODE>
  API     ${api}
`)
console.log(
  onLan
    ? '  Scan the booth QR from a phone on the same wifi to reach the guest page.\n'
    : '  No LAN address found, so a phone cannot reach this. Local only.\n',
)

const env = {
  ...process.env,
  // Baked into the booth build, so its QR points at something a phone can reach.
  EXPO_PUBLIC_GUEST_URL: guest,
  EXPO_PUBLIC_API_URL: api,
  VITE_API_URL: api,
}

/*
 * Turbo 2 runs tasks in a strict environment and drops anything not declared,
 * so these have to be listed in turbo.json's globalPassThroughEnv as well as
 * set here. Without that the booth's QR was built with the fallback and sent
 * phones to localhost.
 */

spawn('npx', ['turbo', 'run', 'dev'], { stdio: 'inherit', env })
