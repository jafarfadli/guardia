# Handoff — Guardia desktop

Read this first if you are picking up the work in a new session. Last updated: 2026-10-26 (night). Revision rounds 2–5 have shipped; round 5 renamed the app **Kamar → Guardia** and the cat **si Oren → Maestro**. Waiting on the user's feedback.

## What the user wants

A non-monotonous Mac desktop built as **one lived-in room drawn as "a comic printed on old paper"**. The art direction is [`DESIGN.md`](../DESIGN.md). It belongs to the user and is binding, so never overwrite it. The user writes in Indonesian; reply in Indonesian. Once a direction is agreed they want execution, done in stages, and they want the art ambitious and polished ("jangan nanggung"). If tokens run low, update this file so another account can continue.

Machine: MacBook Air M1, **no notch**, 8 GB RAM, macOS 26.3, normally Dark mode. VS Code, Spotify, Chrome. Product record: [`PRODUCT.md`](../PRODUCT.md). Original plan: [`docs/PLAN.md`](PLAN.md).

## What is installed and running now

`./install.sh` installed it and `./uninstall.sh` reverts everything from `~/.guardia/backup`.

| Piece | Where | Notes |
|---|---|---|
| Guardia.app (Swift) | `guardia-app/`, installed to `~/Applications/Guardia.app`, bundle id and LaunchAgent `id.guardia.app`, URL scheme `guardia://` | Hosts the wallpaper (WKWebView at desktop level), the paper **island**, and the **pet Maestro** |
| Wallpaper | `blender/` renders `wallpaper/frames/` (42 WebP frames + `frames.json`, 15 MB); `wallpaper/src/` shows them | The web layer picks the frame for the sun's phase, multiplies live overlays on top (calendar with Javanese pasaran, clock hands, now-playing sleeve), bakes the WebGL print grade, and runs CSS dust clipped to the sun beam |
| Maestro | `pet/cat.js`, `pet/poses.js` → `guardia-app/Resources/pet/` | Chibi, one merged silhouette with a single outer ink contour. Each animation is one sheet; `Pet.swift` picks frames with `contentsRect` |
| Island | `guardia-app/Sources/Island.swift`, `Launcher.swift`, `Projects.swift`, `Alarms.swift`, `FocusGuard.swift` | Folded: time, battery, and the song or timer between them. Click: search. Also rings alarms and shows focus-mode visits |
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

## Revision round 3 (in progress, 2026-10-26)

The user's feedback on the background, and what was found and changed:

1. **"The lines are very blurry."** There were three causes:
   - The Freestyle **NOISE thickness modifier** ('breathe') made every stroke 2–3× wider.
   - The **alpha fade** modifier made those wide strokes translucent, so each outline became a soft brown band about 10 px wide.
   - At 24 TAA samples, soft-shadow and AO noise turned every toon step edge into grain.

   Fixes in `blender/build.py`:
   - remove both modifiers;
   - fade far lines with an opaque **colour** modifier (ink → #4A362B) instead;
   - turn off contour and external contour (they retrace the silhouette);
   - set `filter_size` to 1.0, TAA to 64 samples, shadow rays/steps to 3/12, fast-GI rays to 4;
   - export WebP with `-q 90 -sharp_yuv`.

   In the grade, `inkSkip` drops from 0.3 to 0.12.
2. **"Light and shadow aren't realistic; show light coming in through the window."**
   - `KamarToon` (core.py) now mixes the 5 hard steps with a linear ramp of the same levels. The `softness` Value node is set to 0.8, so planes get falloff instead of one flat tone.
   - Hatching fades with camera distance, because far away it aliased into grain.
   - New rig in `lights.py`:
     - `WindowSky` and `EastSky` replace the old directional fills. Each is an area-light panel 0.32 m outside its window, tilted 30° down with a 110° spread, so the opening shapes the light and the ceiling stays unlit.
     - The sun has a `volume_factor` (`CAL['shaft']`) and scatters in `RoomAir`, a Principled Volume box in NoInk with noise-modulated density `CAL['air']`. This makes the **visible beam** through the window, striped by the frame.
     - `SunBounce` is a warm, shadowless disc where the beam lands.
     - The desk lamp has a softer cone that glows in the air, plus `LampSpill`.
   - Calibration lives in `CAL` in build.py.
3. **"Poster and calendar text is crammed against the edges."**
   - Added `fit()` to `wallpaper/src/printed.js`.
   - The poster title is now two lines, "LAGU / SORE", and every line keeps a margin of about 15% or more on each side. Textures are regenerated with `node scripts/render-assets.mjs`.
   - The live calendar (`wallpaper/src/overlays.js`) fits each line to about 60–72% of the page width.

Test tooling used: scratch scripts render several phases or crops in one Blender session, and Pillow builds contact sheets (`python3 -I`). Full-resolution frames take 60–90 s each.

Status: done. All 42 frames were re-rendered (about 55 min at 60–90 s per frame), and the app was reinstalled with them.

## Revision round 4 (done, 2026-10-26)

The user asked: remove the top bar (clock, weather, battery, and the left items); make the folded island show the time and battery; and turn the island into a search for shortcuts. Decisions they made: open the search **by clicking the island only** (no hotkey); in focus mode si Oren **visits the tab, waits 5 s with a "biarin" button, then closes it**; guarded sites are **Instagram, TikTok, YouTube, X**; Claude Code **asks for a project first**.

- SketchyBar is retired:
  - `dotfiles/sketchybar/`, `bar/`, and its Brewfile and theme-generator entries are gone;
  - install.sh stops the service and removes the old `~/.config/sketchybar` link if it still points into this repo;
  - the macOS menu bar stays auto-hidden.
- `Island.swift`:
  - `IslandPanel` can take the keyboard only while the search is open; it is non-activating, so the app you were in stays active.
  - Modes: status (folded), music, timer, toast, search, ring, visit.
  - ⌘↵ is caught with a local key monitor.
  - When the search closes, the panel is ordered out and back in, which hands the keyboard back.
- `Launcher.swift`:
  - The command rows, with fuzzy matching (word start, then substring, then letters in order).
  - Plain-Indonesian parsing: `10m`, `1j30`, `timer 25 masak`, `alarm 7.30 bangun`, `fokus 50`. A unit must end its word, or "10 masak" would read as 10 m + "asak".
  - Spotify search opens `spotify:search:` in the app. Favourites are saved from a pasted link, and their names come from Spotify's public oEmbed.
- `Projects.swift`:
  - Recent VS Code folders come from `lastKnownMenubarData` in `~/Library/Application Support/Code/User/globalStorage/storage.json`. The old `history.recentlyOpenedPathsList` key is no longer in `state.vscdb`.
  - `claude(in:)` drives Ghostty 1.3's AppleScript: `new window with configuration`, using `initial working directory` and `initial input "claude\n"`. If Ghostty isn't running, it waits for the first window and types `cd … && claude` instead, to avoid opening a second window.
- `Alarms.swift`:
  - Alarms persist in UserDefaults and fire with a `Timer` at the date.
  - On wake, an alarm missed by under 10 minutes still rings; an older one shows a "terlewat" toast. An app cannot wake a sleeping Mac.
  - `Ringer` plays the Glass sound every 2.2 s, for 60 s at most.
- `FocusGuard.swift`:
  - Polls Chrome's front tab every 1.5 s, only while focus mode is on **and** Chrome is frontmost, so it never launches Chrome.
  - Chrome bounds are in top-left global coordinates. Tab x is estimated from the window width and tab count (80 pt left inset, 100 pt right, at most 240 pt per tab), and the cat's feet go at the tab's lower edge.
  - Before closing, it checks that the same tab is still in front.
  - "biarin", or dragging the cat off the tab, allows that site for 10 minutes.
- `Pet.swift` gains these states:
  - `dash`: the walk cycle at 340 pt/s and 2.4× speed;
  - `leap`: a smoothstep arc with a 70 pt lift, ticking at 40 Hz;
  - `perch`: the `perch` sheet;
  - `swipe`: the `swipe` sheet, then `drop()` into the existing fall physics.
  
  New sprites in `pet/poses.js`: `leap` (6 frames), `perch` (12 frames, with an inked "!" burst), and `swipe` (6 frames, with arcs and a hit star).
- `Kamar --snapshot <dir>` now also writes every island mode: `status*`, `search*` (several queries), `ring`, `visit`, `music-open*`, plus `pet.png`.
- Wallpaper fix: canvas text never triggers a font load, so main.js now calls `document.fonts.load` for Shantell Sans and Alfa Slab One before the first render. Without it, the calendar and sleeve fell back to a serif.
- Permissions the user will see once each: Automation for Ghostty and for Google Chrome (Spotify was already granted).
- Known trade-off: when a window covers the top centre (a maximised app), the folded island steps behind it, so the time is hidden there; the macOS menu bar (auto-hidden, with its own clock) is still a hover away. Offer "always in front" if the user wants it.

## Revision round 5 (done, 2026-10-26 night)

The user asked:
1. rename Kamar → Guardia and si Oren → Maestro;
2. the cat only on normal desktops, not over full-screen apps;
3. fix the menu toggles (cat, wallpaper);
4. VS Code works like Claude Code (pick a folder) and covers every folder in `~/Koding`;
5. Timer and Alarm become separate menus with one consistent input each (Timer → minutes, Alarm → clock time, Mode fokus → minutes), with no "timer atau alarm" row;
6. the wallpaper and cat were "frozen solid".

- **Rename.**
  - The app is now `Guardia.app` (bundle id, LaunchAgent and URL scheme `guardia`), and the source folder is `guardia-app/`.
  - The state folder is `~/.guardia`, the WKWebView scheme `guardia://app/…`, and the JS API `window.guardia` / `window.__guardia`.
  - The VS Code theme publisher is now `guardia` (`guardia.kertas-theme`), and the borders blacklist is `Guardia`.
  - `install.sh` migrates an old install:
    - moves `~/.kamar` → `~/.guardia`;
    - imports the `id.kamar.app` defaults into `id.guardia.app` (this keeps `previousDesktopPictures` for uninstall, plus alarms and favourites);
    - takes down the old agent and app, and swaps the VS Code extension.
  - `uninstall.sh` handles both names.
  - Deliberately unchanged:
    - the Blender module `blender/kamar/` ("kamar" = the room) and its node names;
    - the Chrome image `images/kamar.png`;
    - the tiny "kamar.js" on the monitor texture (changing it means a full re-render).
  - DESIGN.md was not touched.
  - Automation permissions are per bundle id, so macOS asks again for Spotify, Ghostty and Chrome under Guardia.
- **Frozen cat:**
  - Cause: `PetController.stop()` invalidated the loop timer but kept `interval`, and `schedule()` skips when the interval is unchanged. After a menu off/on the timer was never recreated.
  - Fix: `start()`/`stop()` reset properly and are idempotent, plus a 3 s watchdog that restarts the loop if it hasn't ticked for 2 s.
- **Frozen wallpaper:**
  - Cause: the page's WebContent process had died (seen: original process gone hours later, probably memory pressure while the desktop was covered), and nothing reloaded it.
  - Fixes:
    - a `WKNavigationDelegate` reloads on `webViewWebContentProcessDidTerminate` and on failed loads;
    - every 60 s and on wake, `verify()` asks `window.__guardia.ready` and reloads a page that doesn't answer;
    - `stop()` now closes the windows (`isReleasedWhenClosed = false`), and observers are added once;
    - `NSAppSleepDisabled` is set in Info.plist, so App Nap can't throttle the loops.
- **Status from a terminal:**
  - `open -g guardia://status` writes `~/.guardia/status.json` with the pet's state, last tick, x and active-space flag; the wallpaper's running state, window count and last page answer; plus the island, focus, timer and alarms.
  - `guardia://pet/on|off|come`, `guardia://wallpaper/on|off|check` and `guardia://island/on|off` drive the same paths as the menu. A test that toggles the pet and wallpaper off and on twice came back alive (pet ticking, page `ready`).
- **Maestro** no longer has `.fullScreenAuxiliary`, so he stays off full-screen spaces. `canReach` requires `panel.isOnActiveSpace`, so a focus-mode visit to full-screen Chrome falls back to the island countdown. The island keeps `.fullScreenAuxiliary`, so that countdown and its "biarin" button still show over full-screen Chrome.
- **Launcher lists** (`Launcher.List`):
  - The lists are `root`, `claude`, `code`, `timer`, `alarm` and `focus`. Each has a breadcrumb, placeholder and footer.
  - The island draws the placeholder itself, because the NSTextField cell kept stale placeholders when the list changed.
  - Long lists scroll, 7 rows visible, with an n/total count.
  - Root, empty: live rows (song, running timer), then Claude Code ›, VS Code ›, Putar Spotify, Timer ›, Alarm ›, Mode fokus ›.
  - Typing at the root still finds projects, Spotify searches, and "timer 10" / "alarm 7.30" / "fokus 50".
  - `Projects.all()`: every folder in `~/Koding`, recent VS Code ones first, the rest by name.
  - Letters-in-order fuzzy matching now only checks titles.

## Tools and gotchas

- **swiftc is broken** by a stale CLT `module.modulemap`. `guardia-app/build.sh` works around it with a VFS overlay. Reinstall the app with: `launchctl bootout gui/$UID/id.guardia.app`, then copy `build/app/Guardia.app` to `~/Applications`, then `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/id.guardia.app.plist`. Copying while the agent runs fails, because launchd relaunches Guardia mid-copy.
- This agent has **no Screen Recording permission**, so it cannot screenshot the live desktop. Verify like this:
  - wallpaper: `node scripts/preview.mjs --times 16:30,21:00` (headless Chrome renders in `build/preview/`);
  - native surfaces: `Guardia --snapshot <dir>` writes the island states, `pet.png` (one frame from each animation, through the real sprite layer), and the wallpaper as WebKit renders it;
  - window placement: CGWindowList, using a small Swift script compiled with the same overlay flags.
- Homebrew 7 needs `brew trust --formula felixkratz/formulae/borders`.
- Spicetify: re-run `spicetify backup apply` after Spotify updates. **Don't** run `spicetify config a b` to query values, because it sets them.
- Performance target: about 1% CPU at idle. Last measured 2026-10-26 with the user active: Kamar about 1.0%, WebKit about 0.5%. What keeps it there:
  - CSS dust and no animated grain;
  - the pet ticks at 20 Hz when moving, 10 Hz when awake, and 4 Hz asleep;
  - the pet only sends `ignoresMouseEvents` to the window server when the value changes;
  - the island's paper is cached.
- zsh does not word-split unquoted variables, so build argument lists as arrays (or use `${=var}`).

## Next steps

1. Wait for the user's feedback on rounds 3 and 4. The likely follow-ups:
   - the island's behaviour behind maximised windows;
   - more sites for focus mode (`FocusGuard.sites`);
   - a global hotkey, if they change their mind (Carbon `RegisterEventHotKey` needs no permission).
2. Still open: no live screenshot of the island or borders exists, so how they look on screen can only be judged by the user.
