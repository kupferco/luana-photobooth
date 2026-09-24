/**
 * Type-only shim. Metro resolves index.web.ts or index.native.ts by platform
 * extension; TypeScript has no such notion.
 */
export declare function copy(text: string): Promise<boolean>
