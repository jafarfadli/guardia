"""Render the day: one frame per phase, plus frames.json for the web layer.

usage: blender -b --factory-startup --python blender/render.py -- [--scale 1.0] [--only 1.53,0.0]
"""
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py')).read().split("if __name__ == '__main__':")[0])
from kamar import core, lights, props  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default

# night → dawn → morning → midday, then the afternoon beam in fine steps, then dusk
PHASES = [0.0, 0.14, 0.24, 0.32, 0.42, 0.52, 0.62, 0.74, 0.86, 1.0]
PHASES += [round(1.02 + 0.03 * i, 3) for i in range(29)]
PHASES += [1.89, 1.94, 1.98]

OUT = os.path.join(core.ROOT, 'wallpaper', 'frames')


def screen(p):
    s = bpy.context.scene
    co = world_to_camera_view(s, s.camera, Vector(p))
    return [round(co.x, 5), round(1 - co.y, 5)]  # origin top-left, 0..1


def beam_points(S):
    """The window's corners and where the sun through them lands (floor, back wall, right wall)."""
    W = core.WIN
    D = -Vector(S)
    pts = []
    for y in (W['y0'], W['y1']):
        for z in (W['z0'], W['z1']):
            p = Vector((W['glass_x'], y, z))
            pts.append(screen(p))
            best = None
            for n, k in (((0, 0, 1), 0.0), ((0, -1, 0), -core.ROOM_D), ((-1, 0, 0), -core.ROOM_W)):
                n = Vector(n)
                den = n.dot(D)
                if abs(den) < 1e-6:
                    continue
                t = (k - n.dot(p)) / den
                if t > 0 and (best is None or t < best):
                    best = t
            if best:
                pts.append(screen(p + D * best))
    return pts


def main():
    scale = float(arg('scale', '1.0'))
    only = [float(x) for x in arg('only').split(',')] if arg('only') else PHASES
    build(scale)
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'frames.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) and arg('only') else {'frames': []}
    meta['overlays'] = {k: [screen(p) for p in quad] for k, quad in props.OVERLAYS.items()}
    meta['aspect'] = 2880 / 1800
    done = {f['phase']: f for f in meta['frames']}
    for ph in only:
        lk = lights.apply(ph, CAL)
        name = f'f{int(round(ph * 1000)):04d}'
        png = os.path.join(OUT, name + '.png')
        bpy.context.scene.render.filepath = png
        bpy.ops.render.render(write_still=True)
        webp = os.path.join(OUT, name + '.webp')
        subprocess.run(['cwebp', '-quiet', '-q', '88', '-m', '6', png, '-o', webp], check=True)
        os.remove(png)
        done[ph] = {'phase': ph, 'file': name + '.webp', 'name': lk['name'], 'sunI': round(lk['sunI'], 3),
                    'lamp': round(lk['lamp'], 3), 'beam': beam_points(lk['S']) if lk['sunI'] > 0.01 else []}
        print('FRAME', name, lk['name'], round(lk['sunI'], 2), flush=True)
        meta['frames'] = sorted(done.values(), key=lambda f: f['phase'])
        json.dump(meta, open(meta_path, 'w'), indent=1)
    if '--save' in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(core.ROOT, 'blender', 'kamar.blend'))


main()
