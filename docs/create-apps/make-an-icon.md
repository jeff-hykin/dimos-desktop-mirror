# Make an icon

Every app has an `icon.svg` at its repo root. Desktop shows it in the dock, the App Store, notifications and a minimized
app's card; the App Store reads it straight from your repo before the app is installed.

## The rules

- **One SVG file, `icon.svg`, at the repo root.** No PNGs, no external images or fonts: everything inline.
- **Square, with a viewBox.** Draw it on a 64×64 grid (`viewBox="0 0 64 64"`, or the tile-cropped
  `viewBox="5.5 5.5 53 53"` the built-in icons use); Desktop scales it, from ~20 px in a notification to ~120 px in the
  App Store.
- **Readable at 20 px.** One bold glyph, not a scene; strokes ≥ 2 units on the 64 grid; no text.
- **Works on a dark background.** Desktop's themes are mostly dark: a transparent background is fine if the glyph is
  bright enough, or draw your own tile.
- **Self-contained ids.** Give gradient/filter ids a prefix (`myapp-tile`), since several icons can share one page.
- Add `role="img"` and an `aria-label` with the app's name.

## The house style (optional, recommended)

dimOS's own apps share one look: a **dark glass tile tinted toward the glyph's color, a neon gradient glyph, a soft
bloom behind it, and faint scanlines**. To match it, copy an example's icon and change only the glyph and its colors:

- [dim-example-html/icon.svg](https://github.com/jeff-hykin/dim-example-html/blob/main/icon.svg) (a cube on a dashed
  path; the same file is in the deno and rust examples)

In that file:

1. **The glyph** is the `<g id="glyph">` in `<defs>`: replace its paths with yours (drawn on the 64 grid, centered on
   32,32, inside roughly 14–50).
2. **Its color** is the `linearGradient id="a"`: a light top stop and a saturated bottom stop of one hue (e.g. `#a6f0ff`
   → `#2d8cff` for blue, `#ffd7a6` → `#ff8a2d` for orange).
3. **The tile tint** is the `radialGradient id="tile"`'s first stop: a very dark version of the same hue.
4. Leave the bloom, scanline mask and core filter as they are: they make the glow.

## Check it

- Open `icon.svg` in a browser at a few sizes (zoom out to ~20 px): the glyph should still read.
- After `dimos-desktop app check <repo>` passes, install the app (App Store → Install From URL) and look at it in the
  dock and in a notification.
