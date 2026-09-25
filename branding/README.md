# Branding

The logo, and everything generated from it.

## Changing the logo

Replace `logo/logo-source.png` and run:

```bash
npm run branding
```

That rebuilds every icon the app uses. Check them by eye afterwards — the
script can tell you a file is the right size, not that it looks right.

The source should be a **PNG with a transparent background**, square-ish, and
at least 1024px on its longest side. Transparency matters: the script trims
to the logo's own edges and then places it on the backgrounds each platform
needs, which it cannot do if the artwork ships with one baked in.

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
