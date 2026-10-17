# Brand assets

The mark is the one in `frontend/public/favicon.svg`: a magnifier with an arrow inside it, ink on
signal yellow. These PNGs are that same SVG rasterised by Chrome, so they cannot drift from the
favicon the site serves. Regenerate them by rendering `favicon.svg` at the size you need rather
than by editing a PNG.

| File | Size | Background |
|---|---|---|
| `iwwz-logo-120-square.png` | 120x120 | opaque yellow, full bleed |
| `iwwz-logo-120.png` | 120x120 | rounded corners, transparent outside them |
| `iwwz-logo-512-square.png` | 512x512 | opaque yellow, full bleed |
| `iwwz-logo-512.png` | 512x512 | rounded corners, transparent outside them |

## Which one to use

**Google Auth Platform, Branding page: `iwwz-logo-120-square.png`.** Google asks for exactly
120x120 under 1MB, and crops the logo to a circle on some surfaces. A rounded square loses its
corners to that crop and reads as chipped; the full-bleed one has no corners to lose. The mark
sits centred with roughly a quarter of the frame as margin, so a circular crop takes nothing off
it.

Anywhere the logo sits on a surface whose colour is not known in advance, the rounded variants
carry their own shape and need no plate behind them.
