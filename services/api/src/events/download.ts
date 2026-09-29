import type { Response } from 'express'
import { ZipFile } from 'yazl'
import { getEvent, listEventSessions } from '../db/repo'
import { readStream } from '../storage/gcs'

/**
 * "Download all the photos", as one zip.
 *
 * The owner gets three months to collect a party's photographs before
 * retention removes them, and this is the thing that makes that promise
 * usable. Handing them a page of fifty links would not.
 *
 * Streamed, never buffered. A hundred montages is comfortably more memory
 * than this container is given, so the bytes go GCS -> zip -> client without
 * being held anywhere. That also means the response starts immediately
 * rather than after a minute of silent assembly, which matters because a
 * browser with no bytes yet looks like a broken download.
 *
 * Stored, not deflated: these are JPEGs. Compressing them again spends CPU
 * to save almost nothing, and on Cloud Run that CPU is the thing being paid
 * for.
 */

/** Safe on every filesystem, and still recognisable a year later. */
function safeName(value: string): string {
  return (
    value
      .normalize('NFKD')
      // Anything a Windows or macOS filename cannot hold, plus leading dots
      // that would hide the file.
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+/, '')
      .slice(0, 60) || 'photos'
  )
}

export async function downloadEventZip(
  res: Response,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const event = await getEvent(tenantId, eventId)
  if (!event) {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
    return
  }

  const sessions = await listEventSessions(tenantId, event.id)
  const ready = sessions.filter((s) => s.montagePath && !s.deletedAt)

  if (ready.length === 0) {
    res.status(409).json({
      error: { code: 'nothing_to_download', message: 'There are no photos yet.' },
    })
    return
  }

  const zip = new ZipFile()
  const stem = safeName(event.name)

  res.status(200)
  res.setHeader('content-type', 'application/zip')
  res.setHeader('content-disposition', `attachment; filename="${stem}.zip"`)
  // The length is unknown until the last entry, so the browser cannot show a
  // percentage. Saying so beats letting a proxy buffer the whole archive to
  // work one out.
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')

  /*
   * Once the first byte is out, the status line is spent: a failure half way
   * through cannot become a 500. Destroying the socket is the only honest
   * signal left -- the client sees a truncated transfer and its download
   * fails, rather than quietly saving an archive missing photographs the
   * owner will never know were meant to be there.
   */
  let failed = false
  const abort = (e: unknown) => {
    if (failed) return
    failed = true
    console.error('zip stream failed', e)
    res.destroy(e instanceof Error ? e : new Error(String(e)))
  }

  zip.outputStream.on('error', abort)
  res.on('close', () => {
    // The owner navigated away or lost signal. Stop reading from GCS.
    if (!res.writableFinished) failed = true
  })

  zip.outputStream.pipe(res)

  try {
    for (const [index, session] of ready.entries()) {
      if (failed) break

      const stream = await readStream(session.montagePath!, tenantId)
      stream.on('error', abort)

      // Numbered so they sort in the order the party happened, and carrying
      // the short code so a guest asking "which one was mine?" can be
      // answered from the filename alone.
      const name = `${stem}/${String(index + 1).padStart(3, '0')}-${session.code}.jpg`

      zip.addReadStream(stream, name, {
        mtime: session.createdAt ?? new Date(),
        mode: 0o644,
        compress: false,
      })
    }

    zip.end()
  } catch (e) {
    abort(e)
  }
}
