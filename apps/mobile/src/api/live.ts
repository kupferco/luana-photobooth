import { clearToken, readToken, writeToken } from './storage'
import type { Event, EventLiveStats, GallerySession, PhotoboothApi, User } from './types'
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOn401 = true,
): Promise<T> {
  const response = await fetch(BASE + path, {
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
    const refreshed = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (refreshed.ok) {
      const tokens = (await refreshed.json()) as {
        accessToken: string
        refreshToken: string
      }
      await setTokens(tokens.accessToken, tokens.refreshToken)
      return request<T>(method, path, body, false)
    }
    // Refusing to refresh is terminal: the token is expired, revoked, or was
    // replayed. Clearing it stops every later request retrying a dead session.
    await setTokens(null, null)
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

/** Endpoints the screens want but the API does not serve yet. */
function notBuiltYet(what: string): never {
  throw new ApiError(
    `${what} is not wired to the API yet — run in fixtures mode.`,
    'not_implemented',
    501,
  )
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
    // Trading it for one here is what makes the session survive a restart.
    if (!accessToken && refreshToken) {
      const refreshed = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!refreshed.ok) {
        await setTokens(null, null)
        return null
      }
      const tokens = (await refreshed.json()) as {
        accessToken: string
        refreshToken: string
      }
      await setTokens(tokens.accessToken, tokens.refreshToken)
    }

    if (!accessToken) return null

    try {
      return await request<{ user: User }>('GET', '/auth/me')
    } catch {
      return null
    }
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

  async reprint() {
    return notBuiltYet('Reprint')
  },

  async emailMontage() {
    return notBuiltYet('Emailing a montage')
  },
}
