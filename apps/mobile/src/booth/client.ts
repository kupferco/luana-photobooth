import type { Template } from '@photobooth/shared'
import { clearToken, readToken, writeToken } from '../api/storage'
import { ApiError } from '../api/types'

/**
 * The booth's own client.
 *
 * A booth authenticates as a *device*, not as a person: one long-lived token,
 * no refresh dance. The phone sits on a tripod for six hours with nobody
 * touching it, so a session that needed renewing by a human would be the
 * thing that fails at 9pm.
 *
 * This is deliberately separate from the owner client, and is not mocked --
 * what could be wrong here is camera timing and upload latency, which a
 * fixture cannot reproduce.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'
const TOKEN_KEY = 'photobooth.device'

let deviceToken: string | null = null
let restored: Promise<void> | null = null

function restore(): Promise<void> {
  restored ??= readToken(TOKEN_KEY).then((stored) => {
    deviceToken = stored
  })
  return restored
}

export async function isPaired(): Promise<boolean> {
  await restore()
  return deviceToken !== null
}

/** Stores the token this device was issued when it claimed the booth role. */
export async function savePairing(token: string): Promise<void> {
  deviceToken = token
  await writeToken(TOKEN_KEY, token)
}

export async function forgetPairing(): Promise<void> {
  deviceToken = null
  await clearToken(TOKEN_KEY)
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await restore()
  if (!deviceToken) {
    throw new ApiError('This device is not set up as a booth.', 'unpaired', 401)
  }

  const response = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${deviceToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401) {
    // The device was deleted or the event closed. Forget the token so the
    // booth asks to be set up again rather than retrying forever.
    await forgetPairing()
    throw new ApiError('This booth is no longer set up.', 'unpaired', 401)
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

export interface BoothPoll {
  event: {
    id: string
    name: string
    status: 'draft' | 'live' | 'ended'
    joinCode: string
    retentionUntil: string
  }
  template: Template | null
  queueDepth: number
  next: {
    id: string
    code: string
    status: string
    shotsExpected: number
  } | null
}

export const booth = {
  poll: () => call<BoothPoll>('GET', '/booth/poll'),

  /** Someone tapped the booth rather than scanning the QR. */
  startLocal: () =>
    call<{ id: string; code: string; token: string; shotsExpected: number }>(
      'POST',
      '/booth/sessions',
    ),

  claim: (sessionId: string) =>
    call<{ id: string; status: string }>('POST', `/booth/sessions/${sessionId}/claim`),

  uploadTickets: (sessionId: string, count: number) =>
    call<{
      uploads: { idx: number; url: string; contentType: string; path: string }[]
    }>('POST', `/booth/sessions/${sessionId}/uploads`, { count }),

  complete: (
    sessionId: string,
    shots: { idx: number; width: number; height: number }[],
  ) =>
    call<{ id: string; code: string; status: string; bytes: number }>(
      'POST',
      `/booth/sessions/${sessionId}/complete`,
      { shots },
    ),
}

/**
 * Sends one shot straight to GCS.
 *
 * The Content-Type has to match exactly what was signed, or the upload is
 * rejected. Bytes never pass through the API.
 */
export async function uploadShot(
  ticket: { url: string; contentType: string },
  blob: Blob,
): Promise<void> {
  const response = await fetch(ticket.url, {
    method: 'PUT',
    headers: { 'content-type': ticket.contentType },
    body: blob,
  })
  if (!response.ok) {
    throw new ApiError(
      `Upload failed (${response.status}).`,
      'upload_failed',
      response.status,
    )
  }
}
