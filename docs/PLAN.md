# Kamar — build plan

Desktop = one lived-in room, drawn as a comic printed on old paper (DESIGN.md).
Decisions are recorded in PRODUCT.md. Work in stages; each stage ends with a look at the real render.

## Stage 1 — Foundation
- [ ] `design/tokens.json`: the material list (palette, ink, paper, grade, light moods, fonts, line weights)
- [ ] Fonts: Shantell Sans (lettering/UI), Fantasque Sans Mono (code), Alfa Slab One (printed matter); self-hosted copies for the wallpaper
- [ ] `scripts/preview.mjs`: headless-Chrome render of the wallpaper at fixed camera views and fixed times (DESIGN.md: "keep a few fixed camera views")

## Stage 2 — Wallpaper (`wallpaper/`)
- [ ] Engine: 3D-projected toon scene drawn with canvas 2D (flat fills → banded shading → hatching → ink ribbons), WebGL grade pass (lifted blacks, split tone, muted greens, glow, vignette, paper grain, film grain)
- [ ] Real sun: solar position from time + location → beam through the west window, sun patches with mullion and plant shadows, dust only inside the beam
- [ ] Moods: dawn, morning (cool light from the other side), midday, late afternoon (hero), sunset, dusk, night (desk lamp)
- [ ] Room: window wall with gingham curtains and sill plants, rooftops outside; back wall with desk, cork board, tear-off calendar (live date), wall clock (live), posters and photos (pixel-art people), ghost poster, damp stains; bookshelf; honey floor, navy-red-ochre rug, cat bed, cables
- [ ] Budget: ≤15 fps, scene re-render once a minute, paused when hidden

## Stage 3 — Kamar app (`kamar-app/`, Swift, menu-bar app)
- [ ] Wallpaper host: desktop-level window per screen with WKWebView
- [ ] Island: paper tab under the bar centre; now playing (Spotify/Music notifications, pixel-art cover), charging, focus timer
- [ ] Pet: ink tabby cat sprites (pre-rendered from the same pipeline), walks on the Dock line, sleeps when idle, taps along while typing (idle-time API, no Input Monitoring), purrs when clicked
- [ ] Build script with the CLT module-map workaround (`-vfsoverlay`), ad-hoc signing, LaunchAgent

## Stage 4 — Bar and windows
- [ ] SketchyBar: paper tags, ink icons (authored PNG), spaces, front app, weather (Open-Meteo), battery, clock; centre left free for the island
- [ ] JankyBorders: ink outline on the active window, faded on others
- [ ] macOS: auto-hide menu bar, accent colour; everything recorded for uninstall

## Stage 5 — App themes (generated from tokens)
- [ ] VS Code: "Kertas" light + "Kertas Malam" dark
- [ ] Ghostty: same two palettes, paper-grain background
- [ ] Chrome: theme extension (paper frame, room still on the new tab page)
- [ ] Spotify: Spicetify theme

## Stage 6 — Ship
- [ ] `install.sh` / `uninstall.sh` (symlinks + backups), Brewfile
- [ ] Finish review against DESIGN.md; README in Indonesian
