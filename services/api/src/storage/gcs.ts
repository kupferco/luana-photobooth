import { Storage } from '@google-cloud/storage'
import { assertWithinTenant } from './paths'

/**
 * Phones upload straight to GCS with a signed URL and read back the same way.
 * Image bytes never pass through Cloud Run: proxying them would be slower,
 * cost more, and run into the request size ceiling.
 *
 * Every signature is for one exact object. Nothing here ever signs or lists a
 * prefix, which is what keeps one tenant out of another's photographs even if
 * a path is built wrongly somewhere upstream.
 */

const BUCKET = process.env.GCS_BUCKET ?? 'photolu-media'

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID ?? 'photolu',
})

const bucket = storage.bucket(BUCKET)

/** Long enough for a phone on bad party wifi, short enough to be worth little if leaked. */
const UPLOAD_TTL_MS = 15 * 60 * 1000

/** A guest looking at their montage. Refreshed by polling, so it can be short. */
const READ_TTL_MS = 60 * 60 * 1000

export interface UploadTicket {
  /** PUT the bytes here, with exactly the Content-Type below. */
  url: string
  /** Must match what was signed, or GCS rejects the upload. */
  contentType: string
  /** Where the object will live. Store this, not the signed URL. */
  path: string
  expiresAt: string
}

/**
 * A one-object upload URL. The caller has already decided the path and is
 * responsible for it being inside the tenant; we check anyway.
 */
export async function createUploadTicket(
  path: string,
  tenantId: string,
  contentType = 'image/jpeg',
): Promise<UploadTicket> {
  assertWithinTenant(path, tenantId)

  const expires = Date.now() + UPLOAD_TTL_MS
  const [url] = await bucket.file(path).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires,
    contentType,
  })

  return {
    url,
    contentType,
    path,
    expiresAt: new Date(expires).toISOString(),
  }
}

/** A short-lived read URL for one object. */
export async function createReadUrl(
  path: string,
  tenantId: string,
  ttlMs = READ_TTL_MS,
): Promise<string> {
  assertWithinTenant(path, tenantId)

  const [url] = await bucket.file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttlMs,
  })
  return url
}

/** Server-side read, for composing the montage with sharp. */
export async function download(path: string, tenantId: string): Promise<Buffer> {
  assertWithinTenant(path, tenantId)
  const [buffer] = await bucket.file(path).download()
  return buffer
}

/** Server-side write, for the composed montage. */
export async function upload(
  path: string,
  tenantId: string,
  body: Buffer,
  contentType = 'image/jpeg',
): Promise<void> {
  assertWithinTenant(path, tenantId)
  await bucket.file(path).save(body, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' },
  })
}

/** True if the object is there. Used to confirm a phone's upload landed. */
export async function exists(path: string, tenantId: string): Promise<boolean> {
  assertWithinTenant(path, tenantId)
  const [found] = await bucket.file(path).exists()
  return found
}

/**
 * Delete everything under a prefix. Used by the retention job and by "delete
 * my photos"; this is the only place a prefix is ever expanded, and it is
 * never reachable from a client request.
 */
export async function deletePrefix(prefix: string, tenantId: string): Promise<number> {
  assertWithinTenant(prefix, tenantId)
  const [files] = await bucket.getFiles({ prefix })
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })))
  return files.length
}

export const bucketName = BUCKET
