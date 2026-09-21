/**
 * Sharing on the web.
 *
 * navigator.share opens the real system sheet on iOS and Android, which is
 * the point: the owner picks WhatsApp, Messages, AirDrop, whatever they
 * already use. It needs a secure context and a user gesture, and desktop
 * browsers largely lack it -- so copying to the clipboard is the fallback,
 * and saying which happened matters, because a silent copy looks broken.
 */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'unsupported'

export async function shareLink(
  url: string,
  title: string,
  text: string,
): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      // Cancelling the sheet rejects with AbortError. That is a choice, not a
      // failure, and must not fall through to copying.
      if ((e as { name?: string })?.name === 'AbortError') return 'dismissed'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'unsupported'
  }
}
