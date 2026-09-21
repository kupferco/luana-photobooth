import { Storage } from '@google-cloud/storage'
import { GoogleAuth, Impersonated } from 'google-auth-library'
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

/**
 * V4 signing needs a key, and a *user* credential has none -- which is why
 * signing works on Cloud Run, where the runtime identity is a service
 * account, and fails locally under `gcloud auth application-default login`
 * with "Cannot sign data without client_email".
 *
 * Rather than download a service-account key file, which is a credential
 * sitting on a laptop forever, local development impersonates the same
 * service account Cloud Run runs as. Signing then goes through the IAM
 * SignBlob API. Set GCS_SIGNER_SERVICE_ACCOUNT locally; leave it unset in
 * production, where the ambient identity already signs.
 */
async function createStorage(): Promise<Storage> {
  const projectId = process.env.GCP_PROJECT_ID ?? 'photolu'
  const targetPrincipal = process.env.GCS_SIGNER_SERVICE_ACCOUNT

  if (!targetPrincipal) return new Storage({ projectId })

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })

  const sourceClient = await auth.getClient()

  const impersonated = new Impersonated({
    sourceClient,
    targetPrincipal,
    lifetime: 3600,
    delegates: [],
    targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })

  return new Storage({ projectId, authClient: impersonated })
}

/** Built once, lazily, and awaited by every caller so nothing races the auth. */
let storagePromise: Promise<Storage> | null = null

async function getBucket() {
  storagePromise ??= createStorage()
  return (await storagePromise).bucket(BUCKET)
}

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
  const bucket = await getBucket()
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

  const bucket = await getBucket()
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
  const bucket = await getBucket()
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
  const bucket = await getBucket()
  await bucket.file(path).save(body, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' },
  })
}

/** True if the object is there. Used to confirm a phone's upload landed. */
export async function exists(path: string, tenantId: string): Promise<boolean> {
  assertWithinTenant(path, tenantId)
  const bucket = await getBucket()
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
  const bucket = await getBucket()
  const [files] = await bucket.getFiles({ prefix })
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })))
  return files.length
}

export const bucketName = BUCKET
