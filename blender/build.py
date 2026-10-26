"""Build the Kamar room in Blender and render it.

usage: blender -b --factory-startup --python blender/build.py -- [--phase 1.53] [--scale 0.5] [--out build/blender/test.png]
       [--frames] [--save]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from kamar import core, room, lights  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default
flag = lambda name: '--' + name in argv

CAL = dict(sun=7.6, fill=3.6, east=3.4, amb=0.21, sky=1.0, lamp=1150.0, halo=10.0)


def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


def render_settings(scale):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x = 2880
    s.render.resolution_y = 1800
    s.render.resolution_percentage = int(scale * 100)
    s.render.film_transparent = False
    s.eevee.taa_render_samples = 24
    s.eevee.use_shadows = True
    s.eevee.shadow_ray_count = 1
    s.eevee.shadow_step_count = 6
    s.eevee.use_fast_gi = True
    s.eevee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
    s.eevee.fast_gi_distance = 0.7
    try:
        s.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    s.view_settings.look = 'None'
    s.view_settings.exposure = 0
    s.view_settings.gamma = 1
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGB'


def camera():
    cam = bpy.data.cameras.new('KamarCam')
    cam.sensor_fit = 'HORIZONTAL'
    cam.angle = math.radians(72)
    cam.shift_y = -0.09 * 1800 / 2880
    cam.clip_start = 0.05
    cam.clip_end = 120
    ob = bpy.data.objects.new('KamarCam', cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (3.7, -0.6, 1.5)
    ob.rotation_euler = (math.radians(90), 0, math.radians(17))
    bpy.context.scene.camera = ob
    return ob


def freestyle(scale):
    s = bpy.context.scene
    s.render.use_freestyle = True
    s.render.line_thickness_mode = 'ABSOLUTE'
    s.render.line_thickness = 1.0
    vl = s.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(134)
    fs.use_culling = True
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    ls = fs.linesets.new('ink')
    ls.select_by_visibility = True
    ls.visibility = 'VISIBLE'
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_material_boundary = True
    ls.select_external_contour = True
    ls.select_contour = True
    ls.select_by_collection = True
    ls.collection = core.collection('NoInk')
    ls.collection_negation = 'EXCLUSIVE'
    st = ls.linestyle
    st.color = core.hex_rgba(core.TOKENS['ink']['color'])[:3]
    st.thickness = 2.0 * scale * 2
    st.thickness_position = 'CENTER'
    st.caps = 'ROUND'
    st.chaining = 'PLAIN'
    st.use_same_object = True
    # lines thin out and fade with distance (DESIGN.md: ink lines)
    d = st.thickness_modifiers.new('distance', 'DISTANCE_FROM_CAMERA')
    d.range_min, d.range_max = 1.6, 9.0
    d.value_min, d.value_max = 1.25, 0.4
    d.mapping = 'LINEAR'
    d.blend = 'MULTIPLY'
    a = st.alpha_modifiers.new('fade', 'DISTANCE_FROM_CAMERA')
    a.range_min, a.range_max = 3.0, 14.0
    a.blend = 'MULTIPLY'
    a.mapping = 'LINEAR'
    a.invert = True
    # a breathing, slightly tapered stroke like a hand-inked line
    al = st.thickness_modifiers.new('taper', 'ALONG_STROKE')
    al.mapping = 'CURVE'
    al.blend = 'MULTIPLY'
    cm = al.curve
    pts = cm.curves[0].points
    pts[0].location = (0, 0.55)
    pts[1].location = (1, 0.55)
    pts.new(0.15, 1.0)
    pts.new(0.85, 1.0)
    cm.update()
    n = st.thickness_modifiers.new('breathe', 'NOISE')
    n.amplitude = 0.5 * scale * 2
    n.period = 60
    n.blend = 'ADD'
    g = st.geometry_modifiers.new('wobble', 'PERLIN_NOISE_1D')
    g.frequency = 3
    g.amplitude = 0.35 * scale * 2
    return ls


def build(scale):
    reset()
    render_settings(scale)
    core.collection('NoInk')
    core.collection('Props')
    camera()
    room.build_shell()
    room.build_outside()
    try:
        from kamar import props
        props.build_props()
    except ImportError:
        pass
    lights.world_setup()
    freestyle(scale)


if __name__ == '__main__':
    scale = float(arg('scale', '0.5'))
    build(scale)
    phase = float(arg('phase', '1.53'))
    lk = lights.apply(phase, CAL)
    print('look', lk['name'], 'elev', round(lk['elevation'], 1), 'sunI', round(lk['sunI'], 2))
    if flag('save'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(core.ROOT, 'blender', 'kamar.blend'))
    out = arg('out')
    if out:
        bpy.context.scene.render.filepath = os.path.join(core.ROOT, out)
        bpy.ops.render.render(write_still=True)
