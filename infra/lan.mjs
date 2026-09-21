#!/usr/bin/env node
/**
 * Runs the whole stack bound to this machine's LAN address, so a phone on the
 * same wifi can scan the booth's QR and actually reach the guest page.
 *
 * The guest page needs no camera, so plain http over the LAN is fine for it.
 * The booth does need a secure context, but the booth stays on this machine
 * at localhost, which counts as one -- so only the phone crosses the network.
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

const host = lanAddress()
if (!host) {
  console.error('No LAN address found — are you on wifi?')
  process.exit(1)
}

const api = `http://${host}:8080`
const guest = `http://${host}:5173`

console.log(`
  Booth   http://localhost:8083/booth   (this machine — camera needs localhost)
  Guest   ${guest}/<CODE>   (scan the booth QR from a phone on the same wifi)
  API     ${api}
`)

const env = {
  ...process.env,
  // Baked into the booth build, so its QR points at something a phone can reach.
  EXPO_PUBLIC_GUEST_URL: guest,
  EXPO_PUBLIC_API_URL: api,
  VITE_API_URL: api,
  // The API trusts localhost origins in development; the phone arrives as a
  // LAN address, so allow that too.
  CORS_EXTRA_ORIGINS: `${guest},http://${host}:8083`,
}

spawn('npx', ['turbo', 'run', 'dev'], { stdio: 'inherit', env })
