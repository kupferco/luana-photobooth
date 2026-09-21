import type { SessionView } from '@photobooth/shared'

/**
 * Everything the guest page needs from the API.
 *
 * No auth, no account. The token handed back when a session starts is the only
 * credential, and it lives in the URL -- the link *is* the access, which is how
 * someone with no account comes back to their photos later.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export interface JoinInfo {
  event: {
    name: string
    joinCode: string
    retentionUntil: string
    retentionNotice: string
    retentionNoticeFull: string
  }
  shotsExpected: number
  queueDepth: number
  boothOnline: boolean
}

export interface StartedSession {
  code: string
  token: string
  queuePosition: number
  shotsExpected: number
  retentionUntil: string
}

export class GuestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch {
    // A transport failure on party wifi is expected and recoverable; it must
    // not read as "your photos are gone".
    throw new GuestError('Could not reach the booth.', 'network', 0)
  }

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | T
    | null

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } })?.error
    throw new GuestError(
      error?.message ?? 'Something went wrong.',
      error?.code ?? 'unknown',
      response.status,
    )
  }

  return body as T
}

export const api = {
  join: (joinCode: string) => call<JoinInfo>(`/join/${encodeURIComponent(joinCode)}`),

  start: (joinCode: string) =>
    call<StartedSession>(`/join/${encodeURIComponent(joinCode)}/sessions`, {
      method: 'POST',
    }),

  session: (code: string, token: string) =>
    call<SessionView>(
      `/sessions/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
    ),

  forget: (code: string, token: string) =>
    call<void>(
      `/sessions/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    ),
}

/**
 * The session survives a reload, a locked screen, and switching to the camera
 * app and back -- all of which happen in the twenty seconds a booth takes.
 * Losing the token would lose the photos, since it is the only way back to
 * them.
 */
const KEY = 'photobooth.guest'

export function remember(joinCode: string, session: StartedSession): void {
  try {
    localStorage.setItem(`${KEY}.${joinCode}`, JSON.stringify(session))
  } catch {
    // Private browsing. The session still works for this page view.
  }
}

export function recall(joinCode: string): StartedSession | null {
  try {
    const raw = localStorage.getItem(`${KEY}.${joinCode}`)
    return raw ? (JSON.parse(raw) as StartedSession) : null
  } catch {
    return null
  }
}

export function forgetLocal(joinCode: string): void {
  try {
    localStorage.removeItem(`${KEY}.${joinCode}`)
  } catch {
    // Nothing to do; it was never stored.
  }
}
