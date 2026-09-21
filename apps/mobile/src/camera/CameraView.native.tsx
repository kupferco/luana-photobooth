import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera'
import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CameraUnavailableError, type CameraProps, type CapturedShot } from './types'

/**
 * Native camera, backed by expo-camera. Same contract as the web file.
 *
 * This path is not exercised until the native builds in phase 2 -- phase 1
 * ships the web export -- but it lives here now so the split is real from the
 * start rather than a refactor later.
 */

const CAPTURE_QUALITY = 0.92

export function CameraView({
  ref,
  mirrorPreview = true,
  onReady,
  onError,
  style,
}: CameraProps) {
  const cameraRef = useRef<ExpoCameraView | null>(null)
  const [permission, requestPermission] = useCameraPermissions()

  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission()
    }
  }, [permission, requestPermission])

  useEffect(() => {
    if (permission?.granted === false && !permission.canAskAgain) {
      onErrorRef.current?.(
        new CameraUnavailableError(
          'Camera access was blocked. Allow it in Settings.',
          'permission-denied',
        ),
      )
    }
  }, [permission])

  const capture = useCallback(async (): Promise<CapturedShot> => {
    const camera = cameraRef.current
    if (!camera) {
      throw new CameraUnavailableError('The camera is not ready.', 'unknown')
    }

    const photo = await camera.takePictureAsync({
      quality: CAPTURE_QUALITY,
      exif: false,
      // Keep the stored JPEG unmirrored to match the web path, so the same
      // montage template produces the same print on both platforms.
      mirror: false,
    })

    if (!photo?.uri) {
      throw new CameraUnavailableError('The camera returned no frame.', 'unknown')
    }

    // takePictureAsync hands back a file:// URI; the upload path wants bytes.
    const blob = await (await fetch(photo.uri)).blob()

    return {
      blob,
      width: photo.width,
      height: photo.height,
      previewUri: photo.uri,
    }
  }, [])

  useImperativeHandle(ref, () => ({ capture }), [capture])

  if (!permission) {
    return <View style={[styles.fallback, style]} />
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          The photo booth needs camera access.
        </Text>
      </View>
    )
  }

  return (
    <ExpoCameraView
      ref={cameraRef}
      style={[styles.camera, style]}
      facing="front"
      mirror={mirrorPreview}
      onCameraReady={() => onReadyRef.current?.()}
      onMountError={(e) =>
        onErrorRef.current?.(
          new CameraUnavailableError(e.message ?? 'The camera stopped.', 'unknown'),
        )
      }
    />
  )
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: '#000' },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
    padding: 24,
  },
  fallbackText: { color: '#fff', textAlign: 'center' },
})
