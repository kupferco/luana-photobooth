import { Share } from 'react-native'

/**
 * Sharing on iOS and Android: the platform sheet, which is what the owner
 * expects and already knows how to use.
 */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'unsupported'

export async function shareLink(
  url: string,
  title: string,
  text: string,
): Promise<ShareOutcome> {
  try {
    const result = await Share.share(
      // iOS takes url separately and ignores it inside message; Android has
      // no url field at all, so the link has to be in the text.
      { url, message: `${text}\n${url}`, title },
      { dialogTitle: title },
    )
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
  } catch {
    return 'unsupported'
  }
}
