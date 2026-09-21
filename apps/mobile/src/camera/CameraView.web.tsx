import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme } from '../theme'
import { CameraUnavailableError, type CameraProps, type CapturedShot } from './types'

/**
 * Web camera: a plain <video> driven by getUserMedia, with stills pulled off
 * a canvas. This file compiles to React DOM, so these really are DOM nodes --
 * no react-native-web involved.
 *
 * Requires a secure context. https:// or localhost work; a bare LAN IP over
 * http:// does not, which is why the booth is served from a real domain.
 */

const CAPTURE_QUALITY = 0.92

export function CameraView({
  ref,
  mirrorPreview = true,
  onReady,
  onError,
  style,
}: CameraProps) {
  const theme = useTheme()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)

  // Keep the latest callbacks without making the stream effect re-run, which
  // would tear the camera down and restart it on every parent render.
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  })

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!globalThis.isSecureContext) {
        const err = new CameraUnavailableError(
          'The camera needs a secure connection (https).',
          'insecure-context',
        )
        setFatal(err.message)
        onErrorRef.current?.(err)
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        const err = new CameraUnavailableError(
          'This browser cannot open a camera.',
          'no-device',
        )
        setFatal(err.message)
        onErrorRef.current?.(err)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {
            // Safari rejects play() if the element is not yet laid out. The
            // autoPlay attribute covers this; a rejection here is not fatal.
          })
        }

        // iOS tears the stream down when the tab backgrounds or another app
        // takes the camera. Surface it so the booth can recover instead of
        // sitting on a frozen last frame.
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            setReady(false)
            onErrorRef.current?.(
              new CameraUnavailableError('The camera stopped.', 'unknown'),
            )
          })
        })

        setReady(true)
        onReadyRef.current?.()
      } catch (cause) {
        const name = (cause as { name?: string })?.name
        const reason =
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'permission-denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'no-device'
              : 'unknown'
        const err = new CameraUnavailableError(
          reason === 'permission-denied'
            ? 'Camera access was blocked. Allow it in Settings and reload.'
            : 'No camera available.',
          reason,
        )
        setFatal(err.message)
        onErrorRef.current?.(err)
      }
    }

    void start()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const capture = useCallback(async (): Promise<CapturedShot> => {
    const video = videoRef.current
    if (!video || !ready) {
      throw new CameraUnavailableError('The camera is not ready.', 'unknown')
    }

    // videoWidth/Height are the true sensor dimensions, not the CSS size.
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) {
      throw new CameraUnavailableError('The camera returned no frame.', 'unknown')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2D canvas context.')

    // Drawn unmirrored on purpose -- see mirrorPreview in types.ts.
    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', CAPTURE_QUALITY),
    )
    if (!blob) throw new Error('Could not encode the photo.')

    return { blob, width, height, previewUri: URL.createObjectURL(blob) }
  }, [ready])

  useImperativeHandle(ref, () => ({ capture }), [capture])

  /**
   * This file renders real DOM, but `style` arrives as a React Native
   * StyleProp -- which may be an array, a nested array, or a registered id,
   * none of which a DOM style attribute understands. Spreading an array here
   * yields { 0: ..., 1: ... }, and React DOM then tries to assign style[0]
   * and throws "Indexed property setter is not supported".
   *
   * StyleSheet.flatten collapses all of those to one plain object.
   */
  const flatStyle = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>

  if (fatal) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          color: theme.color.danger.bg,
          background: theme.color.surface.raised,
          ...flatStyle,
        }}
      >
        {fatal}
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        background: '#000',  // true black: letterbox bars, not a themed surface
        transform: mirrorPreview ? 'scaleX(-1)' : undefined,
        ...flatStyle,
      }}
    />
  )
}
