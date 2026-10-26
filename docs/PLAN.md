# Guardia — build plan

Desktop = one lived-in room, drawn as a comic printed on old paper (DESIGN.md).
Decisions are recorded in PRODUCT.md. Each stage ended with a look at the real render.

## Stage 1 — Foundation
- [x] `design/tokens.json`: the material list (palette, ink, grade, light, moods, fonts, UI schemes)
- [x] Fonts: Shantell Sans, Fantasque Sans Mono Nerd Font, Alfa Slab One (system + self-hosted woff2)
- [x] `scripts/preview.mjs`: headless renders at fixed views and times

## Stage 2 — Wallpaper (`wallpaper/`)
- [x] Toon renderer: flat albedo → hard light bands (window spill, lamp cone) → sun patches with cast shadows → hatching → ink ribbons; WebGL print grade
- [x] Real sun (NOAA) with an art-directed beam path; moods from night to golden hour; morning light from the unseen east window
- [x] Room: window with sill plants and a city view, gingham curtains, desk (lamp, monitor, mug, books, cactus), chair with cardigan, bookshelf, guitar, record crate (now-playing sleeve), monstera, kilim rug, cat bed, cork board, tear-off calendar (live, with pasaran), wall clock (live), gig poster (pixel-art singer), string lights, pendant lamp
- [x] Budget: re-render only when the light changes; clock hands on their own layer; dust animates only in the beam

## Stage 3 — Guardia app (`guardia-app/`, formerly Kamar)
- [x] Desktop-level wallpaper host per screen (custom URL scheme for ES modules)
- [x] Paper island: idle, music (pixel cover, controls), timer, toasts; steps behind maximised windows
- [x] Maestro (formerly si Oren): sprite pipeline from `pet/`, walk/idle/tap/purr/sleep/stretch/dangle, typing via idle-time API
- [x] Build with the CLT module-map workaround; LaunchAgent; `--snapshot` for checking surfaces offscreen

## Stage 4 — Bar and windows
- [x] ~~SketchyBar paper tags with ink icons, Indonesian clock, Open-Meteo weather, battery~~ (retired in revision round 3: the island shows the time and battery)
- [x] JankyBorders ink outlines
- [x] macOS: menu bar auto-hide (applied live through System Events), warm accent

## Stage 5 — App themes (generated from tokens)
- [x] VS Code Kertas / Kertas Malam (all syntax colours pass WCAG contrast)
- [x] Ghostty, Spicetify, Chrome (manual load)

## Stage 6 — Ship
- [x] `install.sh` / `uninstall.sh` with backups, Brewfile, README

## Later
- Ask for a screenshot to tune the bar and island against the live desktop
- Guitar/record-player idle animations for Maestro; a cat that naps in the wallpaper's cat bed
