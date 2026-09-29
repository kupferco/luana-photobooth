/**
 * Type-only shim. Metro resolves index.web.ts or index.native.ts by platform
 * extension; TypeScript has no such notion.
 */
export type SaveOutcome = 'saved' | 'unsupported'

export declare function saveZip(blob: Blob, filename: string): Promise<SaveOutcome>
