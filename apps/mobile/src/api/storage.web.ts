/**
 * Token storage on the web: localStorage.
 *
 * Worth being straight about the trade-off. localStorage is readable by any
 * script running on this origin, so a cross-site scripting hole would expose
 * the refresh token. The stronger option is an httpOnly cookie, which
 * JavaScript cannot read at all -- but that needs the API on the same origin
 * as the app, and it is currently Cloud Run behind a different hostname from
 * Firebase Hosting. Putting the API behind a Hosting rewrite would make
 * cookies available, and is the right move before this takes real customers.
 *
 * Until then: rotation and reuse detection are what limit the damage. A
 * stolen token is single use, and spending it a second time revokes the whole
 * family.
 */

export async function readToken(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    // Private browsing and blocked site data both throw rather than return
    // null, and neither should stop the app loading.
    return null
  }
}

export async function writeToken(key: string, value: string): Promise<void> {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Quota or a blocked store: the session still works for this tab.
  }
}

export async function clearToken(key: string): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // Already gone is the outcome we wanted.
  }
}
