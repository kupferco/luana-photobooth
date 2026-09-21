import type { Event, EventLiveStats, GallerySession, PhotoboothApi, User } from './types'
import { ApiError } from './types'

/**
 * The real client. Same shape as the fixtures, so a screen cannot tell which
 * one it has.
 *
 * Tokens live in memory here. Persisting them is a real decision -- different
 * storage on web and native -- and is deliberately left until the sign-in
 * flow has settled, rather than guessed at now and reworked.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'

let accessToken: string | null = null
let refreshToken: string | null = null

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
      accessToken = tokens.accessToken
      refreshToken = tokens.refreshToken
      return request<T>(method, path, body, false)
    }
    accessToken = null
    refreshToken = null
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
    accessToken = result.accessToken
    refreshToken = result.refreshToken
    return { user: result.user }
  },

  async me() {
    if (!accessToken) return null
    try {
      return await request<{ user: User }>('GET', '/auth/me')
    } catch {
      return null
    }
  },

  async signOut() {
    if (refreshToken) {
      await request('POST', '/auth/signout', { refreshToken }).catch(() => {})
    }
    accessToken = null
    refreshToken = null
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

  async eventStats(): Promise<EventLiveStats> {
    return notBuiltYet('The live dashboard')
  },

  async listSessions(): Promise<GallerySession[]> {
    return notBuiltYet('The gallery')
  },

  async reprint() {
    return notBuiltYet('Reprint')
  },

  async emailMontage() {
    return notBuiltYet('Emailing a montage')
  },
}
