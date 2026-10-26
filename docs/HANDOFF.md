# Handoff — Kamar desktop

Read this first if you are picking up the work in a new session. Last updated: 2026-10-26, Blender frames rendering + chibi cat done.

## What the user wants

A non-monotonous Mac desktop built as **one lived-in room drawn as "a comic printed on old paper"**. The art direction is [`DESIGN.md`](../DESIGN.md). It belongs to the user and is binding, so never overwrite it. The user writes in Indonesian; reply in Indonesian. Once a direction is agreed they want execution, done in stages, and they want the art ambitious and polished ("jangan nanggung").

Machine: MacBook Air M1, **no notch**, 8 GB RAM, macOS 26.3, normally Dark mode. VS Code, Spotify, Chrome. Product record: [`PRODUCT.md`](../PRODUCT.md). Original plan: [`docs/PLAN.md`](PLAN.md).

## What is installed and running now (v1)

`./install.sh` installed it and `./uninstall.sh` reverts everything from `~/.kamar/backup`.

| Piece | Where | Notes |
|---|---|---|
| Kamar.app (Swift) | `kamar-app/`, installed to `~/Applications/Kamar.app`, LaunchAgent `id.kamar.app` | Hosts the wallpaper (WKWebView at desktop level), the paper **island**, and the **pet si Oren** |
| Wallpaper v1 | `wallpaper/` | Hand-written 2D canvas "toon renderer" plus a WebGL print grade. **Being replaced** (see below) |
| Pet sprites v1 | `pet/` → `kamar-app/Resources/pet/` | **Being redrawn** (see below) |
| SketchyBar | `dotfiles/sketchybar/` → `~/.config/sketchybar` | Paper tags, ink icons from `bar/icons.js` (day and night ink), Indonesian clock, Open-Meteo weather |
| JankyBorders | `dotfiles/borders/bordersrc` | Ink outlines |
| Themes | `dotfiles/vscode` (Kertas / Kertas Malam), `dotfiles/ghostty`, `dotfiles/spicetify`, `dotfiles/chrome` | Chrome needs a manual "Load unpacked" |
| macOS | menu bar auto-hide, applied live through System Events; accent orange | |

Everything is generated from **`design/tokens.json`** (the shared material list) by `node scripts/build-themes.mjs`.

## Current task: revision round 2 (user feedback)

1. "Background details are messy, layering isn't realistic, flat vibe; worst on the bookshelf and the text." → The user chose to **rebuild the room in Blender**: offline Eevee toon render, Freestyle ink, about 40 frames across the day. The web layer then shows the right frame, overlays live items (clock hands, calendar date, now-playing sleeve, dust), and applies the print grade.
2. "The cat's legs look broken off the body; make it cute and smooth." → The user chose a **2D chibi redraw**:
   - big round head, chubby body, short legs;
   - drawn as **one merged silhouette with a single outer ink contour**, so no lines at the leg joints;
   - 12–16 frames per cycle with easing, squash and stretch, and tail follow-through.

### Blender pipeline design (in progress)

- Blender 5.2.3 is installed (`/Applications/Blender.app`, CLI `blender`). It has `BLENDER_EEVEE`, Freestyle, Shader-to-RGB, and the compositor (`scene.compositing_node_group`).
- Coordinates: x right, y into the room (back wall at y = 5.2), z up. The room is 5.4 × 5.2 × 2.75 m. The window sits on the left wall (x = 0) at y 2.45–4.0 and z 0.9–2.32; the wall is 0.2 m thick.
- Camera, matching v1: at (3.7, −0.6, 1.5), rotation (90°, 0, +17°), horizontal FOV 72°, shift_y ≈ −0.056 so the horizon sits at 41% from the top. Resolution 2880 × 1800.
- `blender/kamar/core.py` (written):
  - tokens loader;
  - `KamarToon` node group: Shader-to-RGB, then 3 constant ramp steps that keep the light's hue, object-space hatching in shade, output as emission;
  - `material(name, base, tex, hatch, emit)`, with names from the material list;
  - helpers: `box`, `cylinder`, `prism`, `plane`, `tube`, `smooth_tube`.
- Still to write:
  - `blender/kamar/room.py`: shell, window, outside, floor planks shader;
  - `props.py`: furniture and items, porting the layout from v1 files `wallpaper/src/furniture.js`, `plants.js`, `textiles.js`, `music.js`, `decor.js`. **Map v1 JS coords (X, Y = up, Z = depth) to Blender as (X, Z, Y).**
  - `lights.py`: phase → sun direction, colours and lamp. Port `wallpaper/src/sun.js`; the beam path is art-directed (azimuth 58° − 12°·low).
  - `render.py`: renders frames to `wallpaper/frames/*.webp` and writes `frames.json` with each frame's phase, beam points for dust, and the screen quads for the clock, calendar, and sleeve.
- Textures for printed things come from JS (reuse `wallpaper/src/printed.js`) via a puppeteer page into `blender/textures/`. Use fewer, larger, hand-lettered text items.
- Bookshelf: tidy rows, consistent heights, a few deliberate accents. One book material with colour and bands chosen by Object Info → Random.
- Web runtime, rewrite of `wallpaper/src/main.js`:
  1. map time to phase (keep `sun.js` phase logic) and pick the frame (snap during the beam, crossfade only when there is no beam);
  2. draw the overlays with **multiply** over the blank page, face, and sleeve rendered in Blender;
  3. apply the existing WebGL grade (`grade.js`);
  4. add the CSS dust (`dust.js`) clipped to the beam polygon from `frames.json`.
- Then delete the v1 renderer files that are no longer used: painter, room, scene, furniture, decor, plants, textiles, props, music.

## Tools and gotchas

- **swiftc is broken** by a stale CLT `module.modulemap`. `kamar-app/build.sh` works around it with a VFS overlay. Rebuild with `./kamar-app/build.sh`, then copy to `~/Applications` and run `launchctl kickstart -k gui/$UID/id.kamar.app`.
- This agent has **no Screen Recording permission**, so it cannot screenshot the live desktop. Verify like this:
  - wallpaper: `node scripts/preview.mjs --times 16:30,21:00` (headless Chrome renders in `build/preview/`);
  - native surfaces: `Kamar --snapshot <dir>`;
  - window placement: CGWindowList, using a small Swift script compiled with the same overlay flags.
- Homebrew 7 needs `brew trust --formula felixkratz/formulae/{sketchybar,borders}`.
- Spicetify: re-run `spicetify backup apply` after Spotify updates. **Don't** run `spicetify config a b` to query values, because it sets them.
- Performance target: about 1% CPU at idle. v1 reached that with CSS dust, no animated grain, and adaptive timers. Keep it that way.

## Progress on revision round 2 (latest)

- DONE `blender/kamar/{core,room,lights,props}.py`, `blender/build.py` (test renders: `blender -b --factory-startup --python blender/build.py -- --scale 0.5 --phase 1.53 --out build/blender/x.png`).
  - Toon = 5 absolute light levels (night truly dark, lamp/sun truly bright); window fill = SUN light with shadow linking (only `Props` collection blocks it); east window cut in the right wall for morning; sun path art-directed so the afternoon patch lands on rug + cat bed.
  - Desk lamp spot sits just outside the shade mouth (inside it the shade blocks the light). Halo point light disabled (bands into rings).
- DONE `blender/render.py` → `wallpaper/frames/*.webp` + `frames.json` (phases, beam points, overlay quads for calendar/clock/sleeve). Full batch: `blender -b --factory-startup --python blender/render.py -- --scale 1.0 --save` (~42 frames).
- DONE web runtime rewrite: `wallpaper/src/main.js` (frame pick + multiply overlays + grade + CSS dust), `overlays.js`, `dust.js`. Old 2D renderer files deleted.
- DONE chibi si Oren: `pet/cat.js` (single silhouette: stroke all parts wide, then fill all), `pet/poses.js` (walk 12, idle 16, tap 6, purr 12, sleep 12, dangle 8, stretch 10). Exported with `node scripts/render-assets.mjs`. Walk speed in Pet.swift set to 27 pt/s.
- TODO: verify the frames in the web preview, rebuild/reinstall Kamar.app, refresh stills (system wallpaper + Chrome NTP), commit, report to the user.

## Next steps, in order

1. Write `room.py`, `props.py`, `lights.py`, and `render.py`. Do a test render at half resolution, then calibrate the toon thresholds and light strengths.
2. Generate the printed textures and replace the bookshelf.
3. Render the full frame set, rewrite the web runtime, and rebuild and reinstall Kamar.app.
4. Redraw si Oren (2D chibi, single silhouette, 12–16 frames), run `node scripts/render-assets.mjs`, then rebuild.
5. Update the stills (`dotfiles/wallpaper/kamar-sore.jpg`, the Chrome NTP image), README, and this file. Commit.
