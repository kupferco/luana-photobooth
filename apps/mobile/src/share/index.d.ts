/**
 * Type-only shim. Metro resolves index.web.ts or index.native.ts by platform
 * extension; TypeScript has no such notion.
 */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'unsupported'

export declare function shareLink(
  url: string,
  title: string,
  text: string,
): Promise<ShareOutcome>
