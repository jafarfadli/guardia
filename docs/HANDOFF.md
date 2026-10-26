# Handoff — Kamar desktop

Read this first if you are picking up the work in a new session. Last updated: 2026-10-26. Revision round 2 has shipped: the room is rendered in Blender and si Oren is a chibi. We are waiting on the user's feedback.

## What the user wants

A non-monotonous Mac desktop built as **one lived-in room drawn as "a comic printed on old paper"**. The art direction is [`DESIGN.md`](../DESIGN.md). It belongs to the user and is binding, so never overwrite it. The user writes in Indonesian; reply in Indonesian. Once a direction is agreed they want execution, done in stages, and they want the art ambitious and polished ("jangan nanggung"). If tokens run low, update this file so another account can continue.

Machine: MacBook Air M1, **no notch**, 8 GB RAM, macOS 26.3, normally Dark mode. VS Code, Spotify, Chrome. Product record: [`PRODUCT.md`](../PRODUCT.md). Original plan: [`docs/PLAN.md`](PLAN.md).

## What is installed and running now

`./install.sh` installed it and `./uninstall.sh` reverts everything from `~/.kamar/backup`.

| Piece | Where | Notes |
|---|---|---|
| Kamar.app (Swift) | `kamar-app/`, installed to `~/Applications/Kamar.app`, LaunchAgent `id.kamar.app` | Hosts the wallpaper (WKWebView at desktop level), the paper **island**, and the **pet si Oren** |
| Wallpaper | `blender/` renders `wallpaper/frames/` (42 WebP frames + `frames.json`, 17 MB); `wallpaper/src/` shows them | The web layer picks the frame for the sun's phase, multiplies live overlays on top (calendar with Javanese pasaran, clock hands, now-playing sleeve), bakes the WebGL print grade, and runs CSS dust clipped to the sun beam |
| si Oren | `pet/cat.js`, `pet/poses.js` → `kamar-app/Resources/pet/` | Chibi, one merged silhouette with a single outer ink contour. Each animation is one sheet; `Pet.swift` picks frames with `contentsRect` |
| SketchyBar | `dotfiles/sketchybar/` → `~/.config/sketchybar` | Paper tags, ink icons from `bar/icons.js` (day and night ink), Indonesian clock, Open-Meteo weather |
| JankyBorders | `dotfiles/borders/bordersrc` | Ink outlines |
| Themes | `dotfiles/vscode` (Kertas / Kertas Malam), `dotfiles/ghostty`, `dotfiles/spicetify`, `dotfiles/chrome` | Chrome needs a manual "Load unpacked" |
| Stills | `dotfiles/wallpaper/kamar-sore.jpg` (system wallpaper, lock screen), Chrome NTP image | Taken from the graded 16:30 frame |
| macOS | menu bar auto-hide, applied live through System Events; accent orange | |

Everything is generated from **`design/tokens.json`** (the shared material list) by `node scripts/build-themes.mjs`.

## Revision round 2 (done)

The user's feedback, and what was chosen:

1. "Background details are messy, layering isn't realistic, flat vibe; worst on the bookshelf and the text." → The room was **rebuilt in Blender**: an offline Eevee toon render with Freestyle ink, 42 frames across the day.
2. "The cat's legs look broken off the body; make it cute and smooth." → si Oren was **redrawn as a 2D chibi**:
   - big round head, chubby body, short legs;
   - every part's outline is stroked wide first and all fills go on after, so only the outer contour stays inked and the leg joints have no lines;
   - animations: walk 12, idle 16, tap 6, purr 12, sleep 12, dangle 8, stretch 10 frames.

### Blender pipeline

- Blender 5.2.3 is installed (`/Applications/Blender.app`, CLI `blender`). Always run headless with `--factory-startup`.
- Coordinates: x right, y into the room (back wall at y = 5.2), z up. The room is 5.4 × 5.2 × 2.75 m. The window sits on the left wall (x = 0) at y 2.45–4.0 and z 0.9–2.32; the wall is 0.2 m thick. A second, out-of-frame window is cut into the right wall for the cool morning light.
- Camera: at (3.7, −0.6, 1.5), rotation (90°, 0, 17°), horizontal FOV 72°, shift_y −0.056. Resolution 2880 × 1800, 24 TAA samples.
- Files:
  - `blender/kamar/core.py`: tokens loader, the `KamarToon` node group, `material()` (cached by name), and mesh helpers. KamarToon posterises absolute light into 5 levels, so night is truly dark and the lamp and sun are truly bright. It keeps the light's hue, adds object-space hatching in shade, and outputs emission.
  - `room.py`: shell, plank floor, painted walls, window, and the outside (skyline, houses, trees; their windows light up at night).
  - `props.py`: all furniture and items, plus `OVERLAYS` (world quads for the calendar, clock and sleeve).
  - `lights.py`: phase → sun, window fill, east fill, desk lamp, string lights.
  - `blender/build.py`: one test render. `blender/render.py`: the full day.
- Lighting decisions:
  - The window fill is a SUN light with light linking, so only the `Props` collection casts its shadows. The blocker collection must not be empty.
  - The afternoon sun path is art-directed so the patch lands on the rug and the cat bed.
  - The desk lamp spot sits just outside the shade mouth, because inside the mouth the shade blocks it. The halo point light is disabled because it banded into rings.
- Printed things (cork board, poster, calendar, clock face, screen, photo, rug, sleeve) are drawn in `blender/textures.js` and exported to `blender/textures/` by `node scripts/render-assets.mjs`.
- `blender/kamar.blend` is saved by `render.py --save` and can be opened directly in Blender.

## Tools and gotchas

- **swiftc is broken** by a stale CLT `module.modulemap`. `kamar-app/build.sh` works around it with a VFS overlay. Reinstall the app with: `launchctl bootout gui/$UID/id.kamar.app`, then copy `build/app/Kamar.app` to `~/Applications`, then `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/id.kamar.app.plist`. Copying while the agent runs fails, because launchd relaunches Kamar mid-copy.
- This agent has **no Screen Recording permission**, so it cannot screenshot the live desktop. Verify like this:
  - wallpaper: `node scripts/preview.mjs --times 16:30,21:00` (headless Chrome renders in `build/preview/`);
  - native surfaces: `Kamar --snapshot <dir>` writes the island states, `pet.png` (one frame from each animation, through the real sprite layer), and the wallpaper as WebKit renders it;
  - window placement: CGWindowList, using a small Swift script compiled with the same overlay flags.
- Homebrew 7 needs `brew trust --formula felixkratz/formulae/{sketchybar,borders}`.
- Spicetify: re-run `spicetify backup apply` after Spotify updates. **Don't** run `spicetify config a b` to query values, because it sets them.
- Performance target: about 1% CPU at idle. Last measured 2026-10-26 with the user active: Kamar about 1.0%, WebKit about 0.5%. What keeps it there:
  - CSS dust and no animated grain;
  - the pet ticks at 20 Hz when moving, 10 Hz when awake, and 4 Hz asleep;
  - the pet only sends `ignoresMouseEvents` to the window server when the value changes;
  - the island's paper is cached.
- zsh does not word-split unquoted variables, so build argument lists as arrays (or use `${=var}`).

## Next steps

1. Wait for the user's feedback on the Blender room and the chibi cat, then iterate. For a scene change, edit `blender/kamar/*.py`, test one frame with `build.py`, then re-render the affected phases with `render.py -- --only <phases>`.
2. Still open: no live screenshot of the bar, island or borders exists, so how they look on screen can only be judged by the user.
