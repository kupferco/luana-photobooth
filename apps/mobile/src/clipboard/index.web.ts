/**
 * Copying on the web.
 *
 * navigator.clipboard needs a secure context and a user gesture; a tap
 * handler satisfies the second. The older execCommand path is kept for the
 * first, because this code is most needed on a captive portal served over
 * plain http -- exactly where the modern API is unavailable.
 */
export async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Denied or unavailable; fall through to the old way.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    // Off-screen rather than hidden: display:none cannot be selected.
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
