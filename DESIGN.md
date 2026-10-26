"a comic printed on old paper". Use this as the visual target for the environment art, whatever the tool: a game engine, an offline renderer, a web 3D library, or even 2D illustration or image generation. Translate each technique into the project's own tools. Numbers are targets for how it should look, not settings to copy.

MOOD
- Warm, cosy, lived in. The space should feel like somewhere a real person lives, so anything that disturbs it (a story event, a threat) reads as an intrusion.
- Tell who lives there through clutter and wear: stained or yellowed paint, damp marks, ghosts of old posters, worn floors, full shelves, cables, plants, a pet, personal photos. No empty, clean surfaces.
- Default mood: late-afternoon sun. One strong warm beam through a window, a hard sun patch on the floor and furniture, dust motes in the beam.

STYLE: THREE LAYERS, IN THIS ORDER
1. Banded shading (toon / cel)
   - Light falls into a few hard steps: shade, a soft fill from the window side, direct sun. Shadow edges are hard. No smooth gradients.
   - Contact shadows where objects meet are stepped too, not blurred.
   - Shaded areas carry hatching (fine parallel ink strokes) that sticks to the surfaces rather than to the screen. Most hatching on walls, a little on ceilings, floors and textiles, none on hard objects (wood, plastic, metal, paper, ceramic), which stay clean.
2. Ink lines
   - An outline on every silhouette, every crease and every boundary between two materials, as if inked by hand.
   - Ink is dark brown (about #2B1C14), never pure black.
   - Line weight varies slightly. Lines thin out and fade with distance, so the background stays calm.
   - Over the whole image: a faint coloured paper grain and a warm paper tint (cream, very slightly).
   - Ways to get there:
     - Real-time: a post-process edge pass on depth, normals and a material or object id.
     - Offline: line-art or freestyle rendering, or inverted-hull outlines plus compositing.
     - Drawn: ink over a flat-coloured base.
3. Faded print grade
   - Lifted blacks: the darkest tone is a warm dark grey-brown, never black.
   - Shadows lean blue-grey (about #546E99), highlights lean warm orange (about #EDB87A).
   - Overall slightly warm, mildly contrasted, greens muted.
   - A soft warm glow only on the brightest spots, a faint brown vignette (about #2E1A0F), and visible film grain.
   - The result should look like an old printed page, not like a clean digital render.

LIGHT
- Day: a warm sun (about #FFCC8F, strong and low) through one window, with sharp shadows.
  - Ambient light in three tones: cool grey-violet from above, neutral at the horizon, warm from the floor.
  - Dust that glows only where the beam passes.
  - No sky reflections, no fog, no glossy surfaces: the look comes from shading, not from physically based realism.
- Contrast mood (for example a calm morning after): a cool, weak light (about #EDF2FF) from the other side, no beam, no dust, a brighter and cooler ambient.

COLOUR
- Retro and slightly faded: dusty blue paint, honey-coloured wood or vinyl floor, cherry-brown trim and doors, gingham and floral textiles, a navy-red-ochre rug.
- Accents in mustard, terracotta, teal, olive and muted red.
- Base colours slightly desaturated and warm; the grade adds the rest. Example palette:
  - Light wood #B88756, pine #C99A62, dark wood #5E3826, cherry #7E3B2B
  - Ivory #D7CAAF, ceiling white #E9E1CF, pale blue #B6C5D5, navy #34466A
  - Mustard #C38F33, cream #E2D1AE, terracotta #A9573A, plant green #5E6B38
  - Olive #6F7A48, muted red #B04A3A, teal #3F6874
  - Outside: brick #A85A42, green roof #5F8C6E, blue metal roof #4E6A8C

MATERIALS AND TEXTURES
- Mostly flat colour. Use textures only where the pattern means something: stained wall paint, the floor, bedding, curtains, rugs, book spines, cork.
- Printed things (posters, notes, photos, labels, calendars, newspapers, screens) are flat graphic art. Group them in a few sheets (atlases) where the tool allows.
- Add drawn texture inside a flat colour with subtle ink marks: plaster flecks, wood grain, fabric weave, brick courses, animal stripes.
- Keep one list of all materials (name, colour or texture, ink-mark type, hatching amount) and use the same names in every tool, so a change is made once.
- People in pictures (photos, posters, portraits) are pixel art with a short palette, the only pixel art in the scene. Everything else is in the ink style.

WORKING RULES
- Build and check in order: shading, then ink, then the grade. Most of the look comes from the ink and the grade, so do not over-detail models or textures.
- Prefer a reproducible setup (scripts, presets, a shared material list) over one-off hand tweaks, and keep a few fixed camera views to compare the look after every change.
