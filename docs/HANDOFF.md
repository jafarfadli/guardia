# Handoff — Guardia desktop

Read this first if you are picking up the work in a new session. Last updated: 2026-10-27. Revision rounds 2–11 have shipped (round 11: the room rebuilt as a close "work corner" so the widgets read, plus the photo shelf). Waiting on the user's feedback.

## What the user wants

A non-monotonous Mac desktop built as **one lived-in room drawn as "a comic printed on old paper"**. The art direction is [`DESIGN.md`](../DESIGN.md). It belongs to the user and is binding, so never overwrite it. The user writes in Indonesian; reply in Indonesian. Once a direction is agreed they want execution, done in stages, and they want the art ambitious and polished ("jangan nanggung"). If tokens run low, update this file so another account can continue.

Machine: MacBook Air M1, **no notch**, 8 GB RAM, macOS 26.3, normally Dark mode. VS Code, Spotify, Chrome. Product record: [`PRODUCT.md`](../PRODUCT.md). Original plan: [`docs/PLAN.md`](PLAN.md).

## What is installed and running now

`./install.sh` installed it and `./uninstall.sh` reverts everything from `~/.guardia/backup`.

| Piece | Where | Notes |
|---|---|---|
| Guardia.app (Swift) | `guardia-app/`, installed to `~/Applications/Guardia.app`, bundle id and LaunchAgent `id.guardia.app`, URL scheme `guardia://` | Hosts the wallpaper (WKWebView at desktop level), the paper **island**, and the **pet Maestro** |
| Wallpaper | `blender/` renders `wallpaper/frames/` (42 clear + 6 overcast WebP frames, `masks/`, `frames.json`); `wallpaper/src/` shows them | The web layer picks the frame for the sun's phase and the weather, lays live overlays on top (calendar with Javanese pasaran, clock hands, now-playing sleeve, and the widgets in `widgets.js`), bakes the WebGL print grade, runs CSS dust clipped to the sun beam and CSS rain clipped to the window |
| Maestro | `pet/cat.js`, `pet/poses.js` → `guardia-app/Resources/pet/` | Chibi, one merged silhouette with a single outer ink contour. Each animation is one sheet; `Pet.swift` picks frames with `contentsRect` |
| Island | `guardia-app/Sources/Island.swift`, `Launcher.swift`, `Projects.swift`, `Alarms.swift`, `FocusGuard.swift`, `Notes.swift` | Folded: the time with the song or timer beside it; the battery only when ≤20% and unplugged. Click: search (plus the Catatan page). Also rings alarms and shows focus-mode visits |
| Room widgets | `guardia-app/Sources/Widgets.swift`, `Batteries.swift`, `Weather.swift` → `wallpaper/src/widgets.js` | Notes on the chalkboard, GitHub streak card, Claude Remote Control sessions on the monitor, battery dials, toy traffic light for the Mac's load, real weather in the window |
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

## Revision round 6 (done, 2026-10-27)

1. **Maestro still showed over full-screen apps.** A `.nonactivatingPanel` with `.canJoinAllSpaces` shows on full-screen Spaces whatever its collection behaviour says. Now `PetController.checkFullScreen()` orders the panel out whenever the frontmost app has a layer-0 window exactly the size of the screen (CG top-left coordinates). It runs:
   - on Space changes and app activation (again 0.3 s later, once the window list settles);
   - every second from the pet loop.

   Verified against VS Code in full screen (its window is 1440×900 at 0,0, plus a 32 pt strip above the screen). Status reports `hiddenForFullScreen`.
2. **Switching "Wallpaper hidup" off no longer reverts to the old system picture.** The cause: `--set-wallpaper` only changes the current Space, so other Spaces still had old pictures. Now the off state freezes the room instead:
   - `WallpaperController.setLive(false)` takes `takeSnapshot` of each page and shows it in the same desktop-level window (an `NSImageView`, on every Space), then drops the WKWebView.
   - The still is saved to `~/.guardia/still-<display>.png` and is used at launch when live is off; the fallback is the raw frame `f1530.webp`.
   - The same still also becomes the system desktop picture (`desktop-<time>.png`; a new name each time, because macOS caches by path).
   - `start(live:)` replaces start/stop: the room window is always there.
3. **Focus mode closes the tab instantly** (round 9 brought back a quick leap onto the tab; see below). `FocusGuard` polls every 1 s while Chrome is frontmost and closes a guarded front tab the moment it sees one. Maestro calls `swipeHere()` (an in-place paw swipe) and the island shows a toast. The visit removed:
   - from the pet: `dash`, `leap`, `perch`, `investigate`;
   - from the island: the countdown mode and "biarin";
   - from the sprites: `leap` and `perch`.
4. **Answered: "why does the background sometimes look striped?"** The cause was in the print grade (`grade.js`):
   - the paper mottling noise was stretched about 2.6× horizontally;
   - the "blue fibres" were 20 × 2.5 px horizontal streaks;
   - the film grain used 1.5 px cells, which beat into a fine grid.

   Now the mottling is isotropic (`fbm(px * 0.016)`), the blue fibres are gone, and the grain uses whole 2 px cells. Intentional lines remain: window-frame stripes in the afternoon beam, hatching in deep shade, and the floor planks.
5. **Answered: custom folder and app icons.** Possible for folders and third-party apps (`NSWorkspace.setIcon`), but not for Apple's system apps (sealed system volume), and app updates may reset them. Offered to draw a set in the room's ink style; waiting for the user's list.

## Revision round 7 (done, 2026-10-27): app icons and the Dock

The user wanted their everyday apps' icons in the room's style. They chose style **A · Kartu cetak** from a 3-style sample: a paper squircle card with a stepped shadow and inked rim, the emblem redrawn in ink with one muted brand colour. They also asked for all the suggested extras and for the Dock to be grouped.

- `icons/glyphs.js` holds the primitives: squircle card (macOS grid, 824 px card on 1024), `shaded`, `rim`, `hatching`, `circle`, `arc`.
- `icons/emblems.js` has one function per app and the `ICONS` registry (id, name, path with `*` for versioned apps, Dock group, draw).
  - 29 apps:
    - sosial: WhatsApp, LINE, Telegram, Discord;
    - kerja: Chrome, VS Code, Claude, Ghostty, GitHub Desktop, Word, Excel, PowerPoint, Figma, Unity Hub, the Unity Editor, Blender, CapCut, Zoom, Jump Desktop, Tailscale, MATLAB, Arduino IDE, LTspice, Logisim-evolution;
    - hiburan: Spotify, Roblox, Roblox Studio, Steam, VLC.
  - Plus Guardia's own icon (Maestro's face), which ships in the bundle as `guardia-app/Resources/AppIcon.icns` (`CFBundleIconFile`).
- Pages and scripts:
  - `icons/sheet.html` previews every icon and hands them to `scripts/render-icons.mjs`.
  - `render-icons.mjs` writes 1024 PNGs and `manifest.json` (installed apps only, with `repo`) to `~/.guardia/icons`, and builds `AppIcon.icns` with iconutil.
- **Applying needs the user's terminal.**
  - `Guardia --set-icons <manifest>` and `--restore-icons` use `NSWorkspace.setIcon`.
  - macOS App Management blocks this from any process not allowed in Privacy & Security → App Management. A test from this agent's session failed ("gagal vlc"); the user may have seen a "Code was prevented from modifying apps" notice from that test.
  - `scripts/app-icons.sh apply|restore` splits the manifest by owner. The user's apps run without sudo; root-owned apps (App Store, Tailscale, Zoom, LTspice) run with sudo, so updaters never meet root-owned files inside user-owned bundles. On failure it opens the App Management pane.
  - Successful ids are recorded as `applied-*.json` beside the manifest. `AppIcons.missing()` only watches those, so a fresh install with no icons applied yet doesn't nag.
- **Reminders:** 20 s after launch and every 6 h, Guardia toasts if an update undid icons. The island search has "Pasang ulang ikon app", which opens Ghostty in the repo running `./scripts/app-icons.sh apply` via `Projects.terminal(in:run:)`, the generalised Claude launcher.
- **Dock** (`scripts/dock.py apply|restore`):
  - The order is system apps (kept in place), sosial, kerja, hiburan, then other apps, with small spacers between.
  - Telegram, Spotify and Roblox were added.
  - The original `persistent-apps` is backed up once to `~/.guardia/backup/dock-persistent-apps.plist`.
  - Applied on the user's Mac (2026-10-27): the Dock is grouped and all 29 icons are on. The first run (before App Management was allowed for Ghostty) only got 7. `guardia://icons/apply` opens the installer in Ghostty.
- `Projects.terminal`: Ghostty launched by AppleScript may open with no window, so the script now creates one with `new window with configuration` in that case. That was the first failed run.
- **Folders:** `icons/folders.js` draws a manila paper folder.
  - The 10 home folders get an ink stamp: desktop, documents, downloads, pictures, movies, music, public, applications, terminal (for `bin`) and `</>` (for Koding).
  - Every other folder in `~/Koding`, `~/Desktop` and `~` gets a coloured sticker with its initials (an all-caps acronym wins: "All About FRS" → FRS). The colour comes from a hash of the name.
  - `render-icons.mjs` writes `~/.guardia/icons/folders.json`. Folders need no sudo and no App Management, so they were applied from the agent session: 34 folders.
  - `app-icons.sh` adds `Icon\r` to the global git ignore (`~/.config/git/ignore`, written as `Icon\r\r\n`, because git strips one CR).
- **New folders get their icon by themselves** (`FolderIcons.swift`).
  - Guardia watches the parents in `~/.guardia/icons/folder-watch.json` (Koding, Desktop, home; written by render-icons.mjs) with `DispatchSource` directory watchers.
  - After 1.5 s of quiet it lists any folder whose path isn't in `folders.json`, so a rename counts as new. Hidden folders, packages, symlinks and the stamped home folders are skipped.
  - The sticker is drawn by the bundled `icons/folder.html` + `folders.js` in a short-lived WKWebView in an off-screen window, released 20 s after use. The result is put on with `setIcon` and appended to `folders.json`; entries whose path is gone are pruned.
  - Tested: a new folder in Koding got its icon in about 4 s, and renaming it re-stickered it.
  - **Gotcha:** the first touch of `~/Desktop` raises a privacy prompt and *blocks the calling thread until it is answered*. Doing it on the main thread froze Guardia (island and pet) once.
    - All folder file work now runs off the main thread.
    - Each parent is attached on its own, so the Desktop waiting doesn't hold up Koding or home.
    - Refused parents are retried every minute.
  - `guardia://status` shows `folders.watching` and `folders.refused`.
- Guardia's own bundle icon was put in a grey frame by macOS 26 (old-style .icns), so install.sh also sets it as a custom icon (`~/.guardia/icons/self.json`).

## Revision round 9 (done, 2026-10-27): Maestro pounces in focus mode

The user asked that Maestro still leap onto the tab being closed, but shut it straight away (a very short delay). Round 6's instant close stays as the fallback.

- `FocusGuard.check()` now also asks Chrome for the front window's bounds, the active tab index and the tab count. `feet(on:)` estimates the tab's bottom centre: tabs share the strip between 80 pt on the left (traffic lights) and 100 pt on the right, up to 240 pt each, and the strip's bottom is 38 pt below the window's top.
- `PetController.pounce(on:hit:)`:
  - Leaps there along an eased arc. It takes 0.28 s plus the distance / 4000, and at most 0.6 s.
  - Then plays the swipe; the hit (the AppleScript close and the island toast) fires on swipe frame 4.
  - He then falls back to the floor.
  - The whole visit is about a second.
- It returns false when he can't be seen doing it, and the tab is closed at once with `swipeHere()`. That happens when he is off, put away for a full-screen app, on another Space, being dragged or falling, or when the spot is off his screen.
- The close can't be lost:
  - `landHit()` runs it when a drag, `stop()` or a full-screen hide interrupts the pounce;
  - FocusGuard also closes after 2 s;
  - a once-flag makes sure it closes only once.
- The `leap` pose is back in `pet/poses.js` (6 frames) and in the sprites.
- Tested: in focus mode, opening youtube.com in Chrome put Maestro on the tab within about half a second. The tab closed and he fell back to the floor.

## Revision round 10 (done, 2026-10-27): widgets in the room, the ink, the plants

The user chose widgets drawn **as things in the room** (not WidgetKit, which needs full Xcode and which macOS 26 fades on the desktop). Their picks: notes written in the island and chalked on a **chalkboard**; a **dial panel** for batteries plus a **toy traffic light** for the Mac's load; GitHub streak from **GitHub only**; weather at **the Mac's own location**; VS Code → **Folder baru**; Claude **Remote Control** sessions as name + red/green.

### Why the ink looked "nanggung" (root cause, verified with test renders)
- Freestyle treats **every mesh as an occluder, including the volumetric air box** (`RoomAir`). The camera (y = −0.6) stood 5 cm outside that box, so its front face hid nearly all ink; only a strip on the right (bookshelf, poster, guitar) kept lines. The rug and the floor/wall corners also sat just outside the box.
- Fix: the air is now a **Volume object** whose grid comes from a geometry-nodes *Volume Cube* (`lights.air_setup`). Freestyle ignores volumes. A Volume object filled by *Mesh to Volume* from a hidden box did **not** work: the hidden box is not evaluated at render time, so the air came out empty and the beam vanished.
- Freestyle also let lines through faces many metres across: the houses outside showed through the floor and the window wall. The floor, back wall and ceiling get a SIMPLE subdivision (level 2). The window wall is now built as a quad mesh with an opening (`room.wall_with_window`), because subdividing the old boolean-cut n-gon tore lines across the window.
- The floor sits 2 mm low, so objects standing on it keep inked bottom edges; the walls run down past it (a gap at their foot let the sky through, visible in the masks).
- Ink is rendered as **its own pass** (`freestyle_settings.as_render_pass`) and laid over the finished image by the compositor (`build.ink_over`, Blender 5 `scene.compositing_node_group`), so the beam's haze never veils it. Two linesets: `outline` (silhouette, border) weight 1.0 and `inner` (crease, material boundary) weight 0.62. Distance thinning is gentle inside the room (1.1 → 0.8); only the street outside fades.
- `crease_angle` is 142°: a 2-segment bevel turns a 90° edge in joints of 157.5°/135°/157.5°, so only the middle joint is inked (one line per bevelled edge). At 134° no bevelled edge was inked at all.

### Assets
- The "pale box behind the monstera" was the **ghost of an old poster** (DESIGN.md asks for those) and the two "floating boxes" were its tape scraps; without ink it read as a box. Removed; the **chalkboard** took the spot (`props.chalkboard`, slate texture `textures.js slate()`).
- Sill plants rebuilt (`props.sill_plants`): echeveria rosette (three rings), snake plant (banded blades), pothos vines trailing over the sill with heart leaves. The string-of-pearls spheres and stem-less basil leaves are gone.
- Monstera rebuilt with deep cuts (`leaf_mesh(slits=True)`), ten leaves, two greens.
- Cork board enlarged (1.16 × 0.66 m); the "besok" note became the blank **GitHub card** (`CORK['card']` in props.py must match `CARD` in textures.js).
- **Battery panel** above the desk's right end (`props.battery_panel`, `textures.js gauges()`), wired to the outlet with a cable; brass bezels.
- **Toy traffic light** on top of the bookshelf (`props.signal`), dark lenses; the lit one is printed live.

### Masks and overcast frames
- `blender/masks.py` renders, once for every frame (the camera never moves): each widget surface (`props.MASKED`) where nothing stands in front of it (all other objects are holdouts), the window's sky (`sky`) and the sky plus the street (`outside`). Output: `wallpaper/frames/masks/*.png` (white, alpha = mask, cropped) and `frames.json` `masks` + `overlays`. `render.py` keeps `masks` when it rewrites frames.json.
- `render.py` also renders **6 overcast frames** (`o0550` … `o1780`, `lights.overcast`): no sun, cool light from the east window, grey sky, a quarter of the dust. The page uses them on cloudy/rain/storm/fog days between phases 0.45 and 1.8.
- Full render (48 frames) ≈ 1 hour at scale 1.0 (≈ 75 s a frame).

### The page (`wallpaper/src/widgets.js`, `main.js`)
- Each widget draws flat in its own space, is **warped in true perspective** onto its quad (a 6×6 grid of affine triangles from a square-to-quad homography), and is clipped by its mask before it is laid into the scene: ink with `multiply` (GitHub card, dials), self-lit things with `source-over` (monitor, lit lens plus a `screen` glow), chalk with `source-over` in a colour scaled by how lit the slate came out (sampled from the render), so it dims at night. (Colour-dodge per channel turned the chalk pink at night.)
- Weather: clouds (partly), stars (clear night), fog haze and drops on the glass in the window masks; falling rain is a small canvas over the window (`widgets.js Rain`, ~24 fps while it rains, still on battery; WebKit stops it while the desktop is covered); storms flash the room now and then (CSS `#flash`).
  - A CSS layer of rain tiles under a CSS mask never showed in WebKit's desktop window, with a `guardia://` mask URL or a data: URL alike (Chrome showed it). Don't go back to it.
  - Rain and drops are dark blue-grey by day: white streaks vanished against the pale overcast sky.
- `window.guardia.setWidgets({notes, github, sessions, batteries, load, weather})`, `setLocation(lat, lon)`. Widget drawings are memoised. `demo=1` and `weather=…` URL parameters for previews; `Guardia --snapshot` uses them (`GUARDIA_SNAPSHOT_TIME`, `GUARDIA_SNAPSHOT_WEATHER`).

### The app
- `Widgets` gathers the sources and sends what changed (deduplicated by JSON) after 0.3 s; a reloaded page gets the whole set.
- **Gotcha:** WKWebView's navigation `didFinish` can arrive before the page's module script has run, so anything sent then (`window.guardia && …`) was silently dropped; the widgets never arrived, and the now-playing sleeve could miss a song at start. The page now posts `ready` through `window.webkit.messageHandlers.guardia` once `window.guardia` exists, and `WallpaperController.sendState` answers with the battery state, the song, the widgets and the location (didFinish still sends too). `WeakMessages` keeps the content controller from retaining the wallpaper.
- A failed render leaves `error` and `keys` (the widgets the page holds) in `window.__guardia`, so `guardia://status` shows them; `rain` says whether rain is falling.

### The striped wallpaper (round 6's "kadang bergaris", root cause)
- The film grain's `hash()` in `grade.js` multiplied its input by ~450 before `fract()`, and the grain's time offset grew with the page's age (`performance.now()`). After about ten minutes the inputs were so large that float32 ran out of precision: one row of grain took a single value (emulated in numpy), so the grain became regular vertical stripes, 6 px apart at 2×. A freshly loaded page (every snapshot and preview) looked clean, which is why it was only "sometimes".
- Fix: Dave Hoskins' `hash12` (it scales the input down first), the grain time wrapped (`mod 97` in the shader, `% 600` s in JS). Checked on the live window (`screencapture -l <wallpaper window id>`): the stripes are gone. Round 6's 2-px grain cells stay.
- `ClaudeSessions`: polls `~/.claude/sessions/<pid>.json` every 3 s; a session counts when it has `bridgeSessionId` (Remote Control on) and its pid is alive; `status == "busy"` → green. **This is Claude Code's internal bookkeeping**, not a documented format (seen in v2.1.310).
- `GitHubStreak`: `gh api graphql` contribution calendar every 30 min (and after wake). Streak counts back from today; today with no contribution yet does not break it. Last 15 weeks for the stamps. No `gh` → the card says "gh belum login".
- `SystemLoad`: CPU (host_statistics, smoothed over ~25 s), `kern.memorystatus_vm_pressure_level`, thermal state → green / amber / red; a change must hold 10 s.
- `Batteries`: Mac (IOPowerSources), HID accessories (IOKit `AppleDeviceManagementHIDEventService` BatteryPercent), AirPods (system_profiler every 3 min), iPhone/iPad through the private **MobileDevice** framework (dlopen; `AMDeviceNotificationSubscribeWithOptions` with network devices, read-only, never pairs). The phone shows over Wi-Fi only after "Show this iPhone when on Wi-Fi" in Finder. Four fixed dials: MAC, IPHONE, AIRPODS, then iPad or an accessory.
- `Weather`: CoreLocation (macOS reports `.authorizedAlways` for when-in-use), last place saved in UserDefaults, Jakarta otherwise; Open-Meteo every 20 min with the position rounded to 0.1°. `guardia://weather/<kind>` overrides until the next report.
- Island: the folded status lost the battery (shown only when ≤20% and unplugged); a **Catatan** page (NSTextView on ruled paper, Esc closes, saved to `~/.guardia/notes.txt`); VS Code list starts with **Folder baru** (creates `~/Koding/<name>`, opens VS Code; ⌘↵ Claude Code).
- Info.plist gained location and Bluetooth usage strings.

## Revision round 11 (done, 2026-10-27): the work corner

The user found the room too full and the widgets too small to read. Measured on a 1440 × 900 screen, the old view (a 5.4 × 5.2 m room seen with a 72° lens from about 6 m) put the monitor's text at about 5 pt, the dials' at about 5 pt and the chalk at about 12 pt. Decisions: **"Pojok kerja"** (a close view of the work wall), keep the **now-playing record** and the **tear-off calendar with pasaran**, and replace the bookshelf with a **photo shelf the user fills from the island**. Then, mid-build: photos are **not pixel art** (an exception to DESIGN.md's "people in pictures are pixel art", the user's call), and the shelf carries **decorations too**, not only photos.

### The room
- `core.py`: `ROOM_W, ROOM_D, ROOM_H = 4.0, 3.8, 2.7` (a kos-sized room). The window moved back on the left wall (`WIN y 1.55–3.0`). New shared constants: `EAST` (the morning window's cut in the right wall, also the EastSky light) and `CAMERA` (`loc (2.2, -1.15, 1.45)`, yaw 5°, fov 62°, shift_y -0.065). `build.camera()` reads it.
- `props.py` was rewritten from "the room's contents" down:
  - Back wall, left to right: the monstera in the corner (kept below the board; saturated greens, because a muted green read as dry paper in the afternoon beam), the **chalkboard** (slate 1.61 × 0.81 m), the **tear-off calendar** (0.4 × 0.6 m), and the **photo shelves** (three floating shelves, `FRAMES`, `SHELF_Z`).
  - Under the board: the desk (`DESK`), a bigger **monitor** (screen 0.62 × 0.39 m), the desk lamp, and the **battery panel** on the wall at the desk's right end (face 0.804 × 0.324 m), wired to the outlet.
  - Under the shelves: a **record cabinet** with the turntable and the **now-playing sleeve** on a stand. The **toy traffic light** stands on the top shelf.
  - Floor: the rug and Maestro's bed with a yarn ball. The chair is pulled out and turned aside (parented to an empty, `chair-rig`) so it leaves the desk in sight.
  - Gone: cork board, poster, guitar, bookshelf, string lights, pendant lamp, wall clock, record crate, floor clutter, bin, switch. Their textures (cork, poster, clock, photo) were removed from `textures.js` and `blender/textures/`.
- `LB()` builds a small box standing on its own centre, so it can be turned in place. The old code turned `B()` boxes, whose origin is the world origin, so the desk's paper sheet flew off toward the monstera.
- The cardigan's sleeve tube is now `cardigan-sleeve`; it used to share the name `sleeve` with the record sleeve.
- On screen (1440 × 900): board ≈ 385 × 200 pt (notes at ≈ 19 pt), monitor ≈ 165 × 105 pt (names at ≈ 14 pt), dials ≈ 200 × 85 pt, calendar ≈ 100 × 170 pt, photos ≈ 60–80 pt. Everything readable sits left of x ≈ 1300 pt, clear of the desktop icons' column.
- A frame takes about 2 minutes at scale 1.0 now (was 75 s): the full render is about 1.5 hours.

### The page
- `chalkBoard(notes, light, github)`: the notes on the left two thirds; past a chalk line, GitHub's **last 13 weeks as green squares**, standing up (a row per week, oldest on top; a column per day, Sunday first), month names by the row where a month starts, Sen/Rab/Jum over their columns, today ringed in chalk. The user dropped the streak number for this. Levels are GitHub's own (`contributionLevel` 0–4 from GraphQL), drawn in GitHub's dark-theme greens (brighter = more, which reads on a dark board), scaled by the board's light like the chalk. The cork board's GitHub card is gone.
- Why the board missed the user's 21–22 October commits: they went to a **private** repo (`final1-itb`), and GitHub's calendar (GraphQL as well as the public graph) leaves private contributions out unless "Include private contributions on my profile" is on. The owner sees them on github.com when signed in, which is why the user saw them there. Told the user; nothing to fix in Guardia.
- `photo(slot, img, aspect)`: each frame's picture, cover-fitted to the frame's proportions (taken from its quad), laid with multiply on the paper. Without a photo, one of five flat drawings (Maestro, the sea, flowers, hills, the city), with no people, so DESIGN.md's pixel-art rule for people is not touched.
- `sessionsScreen` (620 × 390, up to four names at 54 px) and `gauges` (804 × 324 mm, numbers at 50) were resized for the new surfaces.

### The app
- `Photos.swift`: five slots, `~/.guardia/photos/frameN-<time>.jpg` plus `photos.json` (the original file names). `Photos.print` turns the picture upright (ImageIO thumbnail with transform), at most 640 px, 15% less colour and 10% toward cream, JPEG 0.84 (≈ 90 KB). The page gets `photos` as data: URLs (`null` = the drawing).
- Island: **Rak foto** in the menu, a list of the five frames (↵ opens an NSOpenPanel, ⌘↵ restores the drawing). Dropping an image file on the island puts it in the first empty frame, or in the frame under the pointer while that list is open (`IslandView.performDragOperation`).

### Maestro over full-screen Chrome; the board without its line (same day)
- The user saw Maestro over full-screen Chrome standing in mid-air: `visibleFrame` keeps the Dock's room even in a full-screen Space, where the Dock is hidden. And he was there at all because `fullScreenInFront` wanted a window *exactly* the screen's size, which Chrome's full-screen window is not (VS Code's is).
- Now `fullScreenApp(on:)` returns the app whose window *covers* the screen. Over Chrome he stays (he guards it in focus mode; the user asked for him to land at the bottom, not to vanish) and `noDock` puts his floor on the screen's bottom edge; he falls to it. Over any other full-screen app he is still put away (round 6). `guardia://status` shows `noDock`.
- The chalk line between the notes and GitHub's squares is gone (the user's call).

### Reaching the island when it is covered (same day)
- The quiet island steps behind a window covering the top centre (a maximised or full-screen app), so it never hides a centred window title. The user found it hard to reach. Two ways in now:
  - **⌃Space** (`Hotkey.swift`, a Carbon `RegisterEventHotKey`: no Accessibility or Input Monitoring) toggles the search from anywhere, full-screen apps included. ⌃Space was free here: Spotlight is ⌘Space and the input-source shortcut on ⌃Space is off. `guardia://status` reports `hotkey: true` when it registered.
  - **The top edge:** the island's 10 Hz tick reads `NSEvent.mouseLocation`; the pointer against the top edge within 180 pt of the middle brings the island forward (`revealUntil`), and it stays while the pointer is on it.
- The status menu shows "Cari… ⌃Space".

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

1. Wait for the user's feedback on round 10. Things to watch: the iPhone dial (needs Finder's Wi-Fi option), the location prompt, and whether the Claude session file format changes. Earlier likely follow-ups:
   - the island's behaviour behind maximised windows;
   - more sites for focus mode (`FocusGuard.sites`);
   - a global hotkey, if they change their mind (Carbon `RegisterEventHotKey` needs no permission).
2. Still open: no live screenshot of the island or borders exists, so how they look on screen can only be judged by the user.
