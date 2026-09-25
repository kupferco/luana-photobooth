/**
 * Type-only shim. Metro resolves index.web.ts or index.native.ts by platform
 * extension; TypeScript has no such notion.
 */
export interface PickedImage {
  blob: Blob
  contentType: 'image/jpeg' | 'image/png'
  name: string
}

export declare function pickImage(): Promise<PickedImage | null>
