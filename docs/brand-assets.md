# AirDash Signal assets

Reference: `AIR·DASH 3.0 Logo Explorations copy.jpg`, supplied by the project owner.
The source is a JPEG, not an alpha PNG. The shipped marks are transparent PNG
cutouts recreated with the built-in imagegen tool. Do not represent these as
original vector artwork.

Assets live in `public/img/brand/`:

- `airdash-signal-color.png`: navy, cyan and red; light-page identity and boot.
- `airdash-signal-black.png`: monochrome; light-page footer identity.
- `airdash-signal-white.png`: reversed monochrome; dark-page identity.
- `favicon-32.png`: browser icon.
- `apple-touch-icon.png`: 180px iPhone home-screen icon.
- `icon-192.png`, `icon-512.png`: Android/web-app icons.
- `icon-maskable-512.png`: separate Android maskable icon, with safe padding.

Logo backgrounds and internal negative spaces carry real alpha. Home-screen
icons intentionally have a solid light ground; the artwork remains inside the
maskable safe area. `brand.css` sets explicit dimensions and uses `object-fit:
contain`. Native `<picture>` media queries select the white variant in dark
mode. No blend modes, background plates, or CSS image inversions are needed.

The white image uses the clean black extraction's exact alpha, with RGB
reversed during asset preparation. Generated white extractions were rejected
because they introduced noise in negative spaces. The color and black marks
were trimmed and resized to 640px wide; app icons were rendered at their final
pixel dimensions with Sharp. No runtime image processing is required.

Accepted imagegen prompts:

1. Extract the large stylized AD wind/signal symbol: preserve the dark navy
   angular A and curved D, three cyan wind strokes, and red circular signal.
   Output only the symbol on true transparency; white gaps must be transparent.
   No text, tile, shadow, or extra marks.
2. Extract the middle tile's black AD wind symbol: preserve the A, D, three
   wind strokes, and circular signal. Remove the gray tile and output only the
   black symbol on true transparency, with clear internal gaps.

Release validation: `npm test`, `scripts/header-width-gate.mjs` with live data,
light/dark browser checks of the story, dashboard, and install page from
320px to 1440px, plus icon dimensions/alpha and production asset hash checks.
The bilingual install guide is `/install.html`, linked from both page footers
and the dashboard About panel.
