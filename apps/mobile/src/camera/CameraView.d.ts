/**
 * Type-only shim. Metro picks CameraView.web.tsx or CameraView.native.tsx at
 * build time by platform extension; TypeScript has no such notion, so this
 * declares the shared surface both files implement.
 */
import type { CameraProps } from './types'

export declare function CameraView(props: CameraProps): JSX.Element
