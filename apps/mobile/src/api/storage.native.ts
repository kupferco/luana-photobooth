import * as SecureStore from 'expo-secure-store'

/**
 * Token storage on iOS and Android: the Keychain and the Keystore.
 *
 * These are encrypted by the OS and are not readable by other apps, which is
 * the right place for a credential that keeps someone signed in for weeks.
 */

export async function readToken(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    // A locked device or a corrupt entry should mean "signed out", not a crash
    // on launch.
    return null
  }
}

export async function writeToken(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      // Available after the first unlock, so a background refresh works
      // without the person holding the phone.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    })
  } catch {
    // Failing to persist is not worth breaking a sign-in over; the session
    // still works until the app is closed.
  }
}

export async function clearToken(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    // Already gone is the outcome we wanted.
  }
}
