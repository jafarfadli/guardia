"""Masks for the live layers, one set for every frame (the camera never moves):
- each widget's surface (props.MASKED) where nothing stands in front of it, so the chalk, the
  screen, the dials and the signal never print over a leaf or a chair;
- the window: where it shows the sky ('sky'), and the sky and the street ('outside'), for the
  weather.

usage: blender -b --factory-startup --python blender/masks.py -- [--scale 1.0]

Writes wallpaper/frames/masks/<name>.png (white, the mask in alpha, cropped to what it covers)
and, in wallpaper/frames/frames.json, 'masks' (each crop as [x0, y0, x1, y1] in 0..1 of the
frame) and 'overlays' (the widget quads), so the masks can be redone without the frames.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py')).read().split("if __name__ == '__main__':")[0])
from kamar import core, lights, props  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default

OUT = os.path.join(core.ROOT, 'wallpaper', 'frames')
MASKS = os.path.join(OUT, 'masks')
TMP = os.path.join(core.ROOT, 'build', 'masks')


def screen(p):
    s = bpy.context.scene
    co = world_to_camera_view(s, s.camera, Vector(p))
    return [round(co.x, 5), round(1 - co.y, 5)]  # origin top-left, 0..1


def render_alpha(name):
    """Render and return the coverage (alpha), top row first."""
    path = os.path.join(TMP, name + '.png')
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, 3]


def save_mask(name, m):
    h, w = m.shape
    ys, xs = np.nonzero(m > 0.02)
    if not len(xs):
        print('MASK', name, 'is empty', flush=True)
        return None
    x0, x1 = max(0, xs.min() - 2), min(w, xs.max() + 3)
    y0, y1 = max(0, ys.min() - 2), min(h, ys.max() + 3)
    crop = m[y0:y1, x0:x1]
    ch, cw = crop.shape
    img = bpy.data.images.new('mask-' + name, cw, ch, alpha=True)
    px = np.ones((ch, cw, 4), dtype=np.float32)
    px[:, :, 3] = crop
    img.pixels.foreach_set(px[::-1].ravel())
    img.filepath_raw = os.path.join(MASKS, name + '.png')
    img.file_format = 'PNG'
    img.save()
    print('MASK', name, cw, 'x', ch, flush=True)
    return [round(x0 / w, 5), round(y0 / h, 5), round(x1 / w, 5), round(y1 / h, 5)]


def main():
    build(float(arg('scale', '1.0')))
    lights.apply(1.53, CAL)
    s = bpy.context.scene
    s.render.use_freestyle = False
    s.render.use_compositing = False
    s.render.film_transparent = True
    s.render.image_settings.color_mode = 'RGBA'
    s.eevee.taa_render_samples = 8
    bpy.data.objects['RoomAir'].hide_render = True
    os.makedirs(MASKS, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    masks = {}
    # the window: everything opaque leaves the sky; without the street, the sky and the street
    masks['sky'] = save_mask('sky', 1 - render_alpha('all'))
    street = list(bpy.data.collections['Outside'].objects)
    for ob in street:
        ob.hide_render = True
    masks['outside'] = save_mask('outside', 1 - render_alpha('room'))
    for ob in street:
        ob.hide_render = False
    # each widget: only its own surface shows, everything else is a holdout that still hides it
    solid = [ob for ob in s.objects if ob.type in ('MESH', 'CURVE', 'SURFACE', 'META', 'FONT')]
    for name, targets in props.MASKED.items():
        for ob in solid:
            ob.is_holdout = ob.name not in targets
        masks[name] = save_mask(name, render_alpha(name))
    for ob in solid:
        ob.is_holdout = False
    path = os.path.join(OUT, 'frames.json')
    meta = json.load(open(path))
    meta['masks'] = masks
    meta['overlays'] = {k: [screen(p) for p in quad] for k, quad in props.OVERLAYS.items()}
    json.dump(meta, open(path, 'w'), indent=1)


main()
