import type { NextFunction, Request, Response } from 'express'

/**
 * Cross-origin access for the web clients.
 *
 * The app is served from Firebase Hosting and the API from Cloud Run, so
 * every browser request is cross-origin and needs this. Native builds do not,
 * which is why it only has to cover the web origins.
 *
 * An allowlist rather than `*`: these requests carry a bearer token, and a
 * wildcard would let any site on the internet call the API with a token it
 * had got hold of. Putting the API behind a Hosting rewrite would make it
 * same-origin and remove the need for this entirely -- worth doing before
 * this takes real customers.
 */

const ALLOWED = new Set([
  'https://photolu.web.app',
  'https://photolu-staging.web.app',
  'https://photolu.firebaseapp.com',
  'https://photobooth.kupfer.co',
  // The guest page is its own origin, and the only one strangers load.
  'https://photolu-guest.web.app',
  'https://photolu-guest-staging.web.app',
])

/** Expo's web dev server moves ports, so localhost is matched by pattern. */
const LOCALHOST = /^http:\/\/localhost:\d+$/

/**
 * Private network addresses, for testing from a phone on the same wifi.
 * Development only -- a deployed service has no business trusting a LAN.
 */
const PRIVATE_LAN =
  /^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+(?:\.\d+)*(?::\d+)?$/

function isAllowed(origin: string): boolean {
  if (ALLOWED.has(origin)) return true
  if (process.env.NODE_ENV === 'production') return false
  return LOCALHOST.test(origin) || PRIVATE_LAN.test(origin)
}

export function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header('origin')

  if (origin && isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    // The response differs by origin, so shared caches must not serve one
    // origin's response to another.
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '3600')
  }

  if (req.method === 'OPTIONS') {
    // Answered here rather than falling through to the 404 handler.
    res.status(origin && isAllowed(origin) ? 204 : 403).end()
    return
  }

  next()
}
