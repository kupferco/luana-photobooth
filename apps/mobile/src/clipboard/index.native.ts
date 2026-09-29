/**
 * Copying on iOS and Android.
 *
 * Not implemented. React Native removed Clipboard from core and the
 * replacement is a native module needing a rebuild; phase 1 ships the web
 * export. Returning false lets the caller leave the code selectable rather
 * than promise something it cannot do.
 */
export async function copy(_text: string): Promise<boolean> {
  return false
}
