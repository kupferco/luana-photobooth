# Backgrounds

What exists, and what was deliberately left out.

## What ships now

One image per event, uploaded by the owner, drawn behind the three photos.
Null means the template's flat colour, which is white.

The bytes go straight to storage with a signed URL and the event is pointed
at them only once they have landed — an abandoned upload leaves the previous
background in place rather than a reference to nothing. The composer already
took a background buffer, so this is mostly plumbing.

**Canvas is 1800×1200** — 6×4in at 300dpi, the SELPHY's postcard size. The
three photo cells occupy the left column and the bottom right, leaving the
top-right quadrant and the borders as the visible design area. Anything
uploaded is resized with `fit: cover`, so a different aspect ratio is cropped
rather than letterboxed.

## The design area is the awkward part

The template is v1's, and it was drawn as a photo collage rather than as a
frame with room for artwork. What shows through is:

- a 36px border on the left and bottom
- a 61px strip along the top
- the top-right quadrant, roughly 845×520

That quadrant is the only place a logo, a name or a date can go without
being covered. It is enough for "Ana is 5!" and not much else.

Before designing anything elaborate, print one and look at it. If the answer
is that artwork needs more room, the honest fix is a second template with
smaller cells rather than a cleverer background — templates are data
(`packages/shared/src/template.ts`), so that is an entry in a table, not a
rewrite.

## What was left out, and why

**Text fields.** Typing a name and a date and having them composited server
side is obviously useful and obviously more work: fonts have to ship with
the API container, text has to be measured to fit a box it cannot overflow,
and every change needs a re-render to preview. Uploading a picture with the
words already on it gets the same result today.

**Template picker.** There is one template. A picker for one thing is a
worse version of no picker.

**Generated artwork (Nano Banana or similar).** A prompt box producing a
background would fit the product well — most people setting up a party have
no artwork and no way to make any. It needs: a generation call, somewhere to
put the cost, moderation on prompts and outputs, and a way to regenerate
without losing the previous one. None of that is hard; all of it is more
than a week.

**Canva.** Their Connect API can export a design straight into an app. It is
the right answer for anyone who already designs invitations there, and the
wrong first move: it means an OAuth flow, a partner application, and a
dependency on someone else's review queue. Worth doing when there are users
asking for it by name.

## If picking this up again

The order that makes sense:

1. **A second template with more room for artwork**, if a real print shows
   the current one is too tight. Cheapest thing that improves every photo.
2. **Text fields** over the background — name, date — composited server side.
   The fiddly part is fitting, not drawing.
3. **Generated backgrounds**, once there is someone to bill for them.
4. **Canva**, when a user asks for it by name.

Keep the stored background as a plain image whatever happens. Everything
above changes how the image is *made*; nothing needs to change how it is
stored, uploaded or composed, and that boundary is what keeps the options
open.
