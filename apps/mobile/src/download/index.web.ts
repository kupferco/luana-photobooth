/**
 * Saving a file on the web.
 *
 * The zip arrives as bytes rather than a link, because the endpoint needs an
 * Authorization header and a navigation cannot carry one. So the download is
 * started from an object URL instead.
 */
export type SaveOutcome = 'saved' | 'unsupported'

export async function saveZip(blob: Blob, filename: string): Promise<SaveOutcome> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return 'unsupported'
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // Safari ignores a click on an element that is not in the document.
  document.body.appendChild(link)
  link.click()
  link.remove()

  /*
   * Revoked later, not immediately.
   *
   * Some browsers start the write asynchronously, and revoking in the same
   * tick cancels a download that had not begun -- which presents as a button
   * that does nothing, on large files only, which is the worst kind of bug
   * to reproduce.
   */
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

  return 'saved'
}
