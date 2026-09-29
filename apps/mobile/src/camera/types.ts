import type { StyleProp, ViewStyle } from 'react-native'

/**
 * One contract, two implementations. Metro resolves `.web.tsx` ahead of
 * `.native.tsx`, so the platform split happens at build time and nothing
 * above this layer knows which one it got.
 *
 * On web we deliberately bypass expo-camera and drive `getUserMedia` and a
 * `<video>` element directly: a `.web.tsx` file compiles to plain React DOM,
 * and expo-camera's web support is its weakest platform. On native we use
 * expo-camera, which is where it is strongest.
 */

export interface CapturedShot {
  /** JPEG bytes, ready to upload. Never mirrored. */
  blob: Blob
  width: number
  height: number
  /**
   * Object URL for instant local preview. The caller owns it and must call
   * URL.revokeObjectURL() when done, or a long party leaks memory.
   */
  previewUri: string
}

export interface CameraRef {
  /** Grab a still at full sensor resolution. Rejects if the camera is down. */
  capture(): Promise<CapturedShot>
}

export interface CameraProps {
  ref?: React.Ref<CameraRef>

  /**
   * Mirror the *live preview* only, so subjects frame themselves as they
   * would in a mirror. The captured JPEG is never mirrored, otherwise any
   * text in shot comes out backwards on the print. v1 never settled this;
   * we are settling it here.
   */
  mirrorPreview?: boolean

  /** Fires once the stream is live and a capture would succeed. */
  onReady?: () => void

  /**
   * Fires when the camera dies mid-session -- a permission revoked, another
   * app grabbing it, iOS tearing the stream down on backgrounding. The booth
   * uses this to recover rather than sit on a frozen frame.
   */
  onError?: (error: Error) => void

  style?: StyleProp<ViewStyle>
}

/** Thrown when the camera cannot be started at all. */
export class CameraUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'permission-denied' | 'no-device' | 'insecure-context' | 'unknown',
  ) {
    super(message)
    this.name = 'CameraUnavailableError'
  }
}
