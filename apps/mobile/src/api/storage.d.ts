/**
 * Type-only shim. Metro picks storage.web.ts or storage.native.ts by platform
 * extension; TypeScript has no such notion, so this declares the surface both
 * implement.
 */
export declare function readToken(key: string): Promise<string | null>
export declare function writeToken(key: string, value: string): Promise<void>
export declare function clearToken(key: string): Promise<void>
