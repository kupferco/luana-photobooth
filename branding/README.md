# Branding

The logo, and everything generated from it.

## Changing the logo

Replace `logo/logo-source.png` and run:

```bash
npm run branding
```

That rebuilds every icon the app uses. Check them by eye afterwards — the
script can tell you a file is the right size, not that it looks right.

The source can be a drawing on a white background — it does not need to
arrive transparent. The script keeps only the dark line work and discards
everything else, which is both how the background is removed and how
coloured elements are dropped.

At least 1024px on its longest side.

### Tuning what survives

```bash
INK=90 npm run branding    # keep only the densest black
INK=140 npm run branding   # keep softer greys too
```

Default is 110, on a 0–255 luminance scale. Anything darker becomes the
mark; anything lighter disappears, with a short fade either side so curves
stay smooth rather than jagged.

**What this cannot do** is remove a shape that is itself drawn in black. The
filter judges darkness, not meaning — so if an unwanted element has a black
outline, it survives, and the fix is to remove it from the source artwork.

### Choosing what the favicon shows

The mark is one wide connected drawing, and at 48px the whole of it turns
to grey soup in a tab strip. So the favicon can show a single region
instead:

```bash
npm run branding                      # then open logo/favicon-picker.png
CROP=0.38,0.12,0.24,0.62 npm run branding   # x, y, width, height (0–1)
```

`favicon-picker.png` is the mark under a labelled 6×4 grid — A1 top-left to
F4 bottom-right. Find the region you want, convert the cells to fractions
(each column is 0.167 wide, each row 0.25 tall), and pass them as `CROP`.
The region is trimmed back to its own edges afterwards, so it does not have
to be tight.

Check the result in `logo/favicon-preview.png`, which is the same crop at
240px. The 48px file is too small to judge.

Once a region is settled, replace the `FAVICON_CROP` fallback in
`generate.mjs` with the literal so it survives without the env var.

## What gets built

| File | Size | Alpha | Why |
|---|---|---|---|
| `logo/logo.png` | 1024² | yes | The mark on its own, for anything else that needs it |
| `logo/logo-on-brand.png` | 1024² | no | The mark on the brand yellow |
| `assets/icon.png` | 1024² | **no** | iOS and the generic app icon |
| `assets/android-icon-foreground.png` | 1024² | yes | Cropped by the launcher, so heavily padded |
| `assets/android-icon-background.png` | 1024² | no | Flat brand colour behind it |
| `assets/android-icon-monochrome.png` | 1024² | yes | Silhouette, for Android themed icons |
| `assets/splash-icon.png` | 1024² | yes | Drawn on the splash background |
| `assets/favicon.png` | 48² | **no** | Browser tab |
| `logo/favicon-preview.png` | 240² | no | The favicon crop, big enough to judge |
| `logo/favicon-picker.png` | 900² | no | The mark under a labelled grid, for choosing a crop |

## The rules that shape it

**iOS icons cannot be transparent.** Not merely "should be opaque" — an icon
with an alpha channel at all is rejected, even a fully opaque one. So those
are flattened rather than composited onto a colour.

**Android adaptive icons get cropped.** The launcher decides whether it is a
circle, a squircle or a rounded square, and only the middle ~66% is
guaranteed to survive. The foreground is padded accordingly, which is why it
looks small on its own.

**The splash keeps its transparency**, because Expo draws it on the splash
background colour rather than compositing beforehand.

## Colour

`#f5c518` — amber.500 in `packages/ui-tokens`, the same yellow as the primary
button. Changing it means changing it in both places; the script does not read
the tokens, because a build step that fails when a design token moves is worse
than one line of duplication.
