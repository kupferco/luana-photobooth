/**
 * Saving a file on iOS and Android.
 *
 * Not implemented, and deliberately not faked. Writing a zip to disk and
 * handing it to the share sheet needs expo-file-system and expo-sharing,
 * which are native modules: adding them requires a rebuild of the app, and
 * phase 1 ships the web export.
 *
 * Returning 'unsupported' lets the screen say where the download does work,
 * which is more use than a button that fails silently on a phone.
 */
export type SaveOutcome = 'saved' | 'unsupported'

export async function saveZip(_blob: Blob, _filename: string): Promise<SaveOutcome> {
  return 'unsupported'
}
