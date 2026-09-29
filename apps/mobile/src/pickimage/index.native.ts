export interface PickedImage {
  blob: Blob
  contentType: 'image/jpeg' | 'image/png'
  name: string
}

/**
 * Choosing a picture on iOS and Android.
 *
 * Not implemented: reaching the photo library needs expo-image-picker, a
 * native module requiring a rebuild, and phase 1 ships the web export.
 * Returning null lets the screen say where this works rather than opening
 * nothing and looking broken.
 */
export async function pickImage(): Promise<PickedImage | null> {
  return null
}
