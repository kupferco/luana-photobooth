export interface PickedImage {
  blob: Blob
  contentType: 'image/jpeg' | 'image/png'
  name: string
}

/**
 * Choosing a picture on the web.
 *
 * A hidden file input rather than anything fancier: it is the only thing
 * that reliably opens the photo library on a phone browser as well as
 * Finder on a laptop, and it needs no permissions prompt.
 *
 * Resolves null when the picker is dismissed. There is no cancel event on a
 * file input, so that is detected by focus returning with nothing chosen --
 * imperfect, but the alternative is a promise that never settles.
 */
export async function pickImage(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png'
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)

    let settled = false
    const finish = (value: PickedImage | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)

      const contentType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      finish({ blob: file, contentType, name: file.name })
    })

    // Dismissing the picker fires nothing, so this is the only signal.
    window.addEventListener(
      'focus',
      () => setTimeout(() => finish(null), 800),
      { once: true },
    )

    input.click()
  })
}
