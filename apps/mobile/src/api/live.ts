import { clearToken, readToken, writeToken } from './storage'
import type {
  Device,
  Event,
  EventLiveStats,
  GallerySession,
  PhotoboothApi,
  User,
} from './types'
import { ApiError } from './types'

/**
 * The real client. Same shape as the fixtures, so a screen cannot tell which
 * one it has.
 *
 * Tokens are held in memory and mirrored to platform storage -- the Keychain
 * or Keystore on a device, localStorage on the web -- so signing in survives
 * closing the app.
 *
 * Only the refresh token is persisted. The access token lives fifteen
 * minutes, so storing it would mostly mean storing something expired; the
 * first request after a cold start refreshes from the stored one instead.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

const REFRESH_KEY = 'photobooth.refresh'

let accessToken: string | null = null
let refreshToken: string | null = null

/**
 * Reads the stored token once per launch. Everything that needs a session
 * awaits this, so a cold start cannot race it and decide nobody is signed in.
 */
let restored: Promise<void> | null = null

function restore(): Promise<void> {
  restored ??= readToken(REFRESH_KEY).then((stored) => {
    refreshToken = stored
  })
  return restored
}

async function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
  if (refresh) await writeToken(REFRESH_KEY, refresh)
  else await clearToken(REFRESH_KEY)
}

/**
 * Distinguishes "the server said no" from "the server could not be reached".
 *
 * They must not be treated alike: a rejected token means sign in again, while
 * a dropped connection means try again later. Conflating them is what made a
 * moment of bad wifi delete a perfectly good session.
 */
export class NetworkError extends ApiError {
  constructor() {
    super('Could not reach the server.', 'network', 0)
    this.name = 'NetworkError'
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(BASE + path, init)
  } catch {
    // fetch only rejects for transport failures: server down, no network,
    // DNS, CORS preflight refused.
    throw new NetworkError()
  }
}

/**
 * One refresh at a time, shared by everyone who needs it.
 *
 * Refresh tokens rotate, and the server treats a token spent twice as stolen:
 * it revokes the whole family and signs the user out. That is the right call
 * against a thief, and it was firing constantly against this client, because
 * three separate places refreshed independently with no coordination.
 *
 * On every cold start `me()` traded the stored token for a new pair while the
 * screens' first requests 401'd and traded the *same* stored token again. One
 * won; the other replayed a spent token; the server concluded correctly that
 * it had been stolen and revoked everything. Which is why staying signed in
 * never worked, no matter how long the token lasted -- the sixty-day window
 * was never the problem.
 *
 * Holding one in-flight promise means concurrent callers all await the same
 * rotation and all see its result. Cleared when it settles, so the next
 * expiry starts a fresh one.
 */
let refreshing: Promise<boolean> | null = null

function refreshOnce(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      if (!refreshToken) return false

      const response = await send('/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        // Only an explicit rejection clears the stored token. A transport
        // failure throws out of send() instead, so bad wifi cannot sign
        // anyone out.
        await setTokens(null, null)
        return false
      }

      const tokens = (await response.json()) as {
        accessToken: string
        refreshToken: string
      }
      await setTokens(tokens.accessToken, tokens.refreshToken)
      return true
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOn401 = true,
): Promise<T> {
  const response = await send(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // One transparent refresh, then give up. Looping would turn a revoked
  // session into an infinite retry against the server.
  if (response.status === 401 && retryOn401 && refreshToken) {
    if (await refreshOnce()) return request<T>(method, path, body, false)
  }

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } })?.error
    throw new ApiError(
      error?.message ?? 'Something went wrong.',
      error?.code ?? 'unknown',
      response.status,
    )
  }

  return payload as T
}

/**
 * A raw response, for the one endpoint whose body is not JSON.
 *
 * Shares the refresh dance with `request` but stops short of parsing: the
 * download is a zip, and a party's worth of photographs must not be turned
 * into a string on the way past.
 */
async function requestBlob(path: string, retryOn401 = true): Promise<Blob> {
  const response = await send(path, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  })

  if (response.status === 401 && retryOn401 && refreshToken) {
    if (await refreshOnce()) return requestBlob(path, false)
  }

  if (!response.ok) {
    // The failures here are still JSON -- nothing has streamed yet.
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string }
    } | null
    throw new ApiError(
      payload?.error?.message ?? 'Something went wrong.',
      payload?.error?.code ?? 'unknown',
      response.status,
    )
  }

  return response.blob()
}

export const liveApi: PhotoboothApi = {
  async requestCode(email) {
    return request('POST', '/auth/code', { email })
  },

  async verifyCode(email, code) {
    const result = await request<{
      accessToken: string
      refreshToken: string
      user: User
    }>('POST', '/auth/verify', { email, code })
    await setTokens(result.accessToken, result.refreshToken)
    return { user: result.user }
  },

  async me() {
    await restore()

    // After a cold start there is a stored refresh token but no access token.
    // Trading it for one here is what makes the session survive a restart --
    // through refreshOnce, so a screen's first request racing this one does
    // not spend the same token twice and get the whole family revoked.
    if (!accessToken && refreshToken) {
      if (!(await refreshOnce())) return null
    }

    if (!accessToken) return null

    return request<{ user: User }>('GET', '/auth/me')
  },

  async signOut() {
    await restore()
    if (refreshToken) {
      // Revokes the whole family server-side, so other devices signed in from
      // the same sign-in go too.
      await request('POST', '/auth/signout', { refreshToken }).catch(() => {})
    }
    await setTokens(null, null)
  },

  async listEvents(tenantId) {
    const result = await request<{ events: Event[] }>(
      'GET',
      `/events?tenantId=${encodeURIComponent(tenantId)}`,
    )
    return result.events
  },

  async getEvent(tenantId, eventId) {
    const result = await request<{ event: Event }>(
      'GET',
      `/events/${eventId}?tenantId=${encodeURIComponent(tenantId)}`,
    )
    return result.event
  },

  async createEvent(tenantId, input) {
    const result = await request<{ event: Event }>('POST', '/events', {
      tenantId,
      ...input,
    })
    return result.event
  },

  async setEventStatus(tenantId, eventId, status) {
    const result = await request<{ event: Event }>(
      'PATCH',
      `/events/${eventId}?tenantId=${encodeURIComponent(tenantId)}`,
      { status },
    )
    return result.event
  },

  async claimBooth(tenantId, eventId) {
    return request<{ deviceId: string; token: string }>('POST', '/devices/booth', {
      tenantId,
      eventId,
    })
  },

  async createPairingCode(tenantId, eventId) {
    return request<{ code: string; expiresAt: string }>(
      'POST',
      '/devices/pairing-code',
      { tenantId, eventId, label: 'Printer' },
    )
  },

  async listDevices(tenantId, eventId) {
    const result = await request<{ devices: Device[] }>(
      'GET',
      `/devices?tenantId=${encodeURIComponent(tenantId)}&eventId=${encodeURIComponent(eventId)}`,
    )
    return result.devices
  },

  async removeDevice(tenantId, deviceId) {
    await request<void>(
      'DELETE',
      `/devices/${deviceId}?tenantId=${encodeURIComponent(tenantId)}`,
    )
  },

  async downloadAll(tenantId, eventId) {
    return requestBlob(
      `/events/${eventId}/download?tenantId=${encodeURIComponent(tenantId)}`,
    )
  },

  async eventStats(tenantId, eventId) {
    return request<EventLiveStats>(
      'GET',
      `/events/${eventId}/stats?tenantId=${encodeURIComponent(tenantId)}`,
    )
  },

  async listSessions(tenantId, eventId) {
    const result = await request<{ sessions: GallerySession[] }>(
      'GET',
      `/events/${eventId}/sessions?tenantId=${encodeURIComponent(tenantId)}`,
    )
    return result.sessions
  },

  async printMontage(tenantId, eventId, sessionId) {
    await request(
      'POST',
      `/events/${eventId}/sessions/${sessionId}/print?tenantId=${encodeURIComponent(tenantId)}`,
    )
  },

  async shareLink(tenantId, eventId, sessionId) {
    return request<{ url: string; title: string; expiresInDays: number }>(
      'POST',
      `/events/${eventId}/sessions/${sessionId}/share-link?tenantId=${encodeURIComponent(tenantId)}`,
    )
  },

  async emailMontage(tenantId, eventId, sessionId, to) {
    await request(
      'POST',
      `/events/${eventId}/sessions/${sessionId}/email?tenantId=${encodeURIComponent(tenantId)}`,
      { to },
    )
  },
}
