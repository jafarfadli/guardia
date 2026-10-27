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

CAL = dict(sun=7.6, window=420.0, eastwin=260.0, bounce=10.0, amb=0.21, sky=1.0, lamp=1150.0, spill=15.0,
           shaft=18.0, lampshaft=4.0, skyhaze=0.08, air=0.045)


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
    # enough samples that soft shadows and AO average out before the light is cut into steps;
    # with fewer, every step edge turns to grain and the ink lines look blurred
    s.eevee.taa_render_samples = 64
    s.render.filter_size = 1.0
    s.eevee.use_shadows = True
    s.eevee.shadow_ray_count = 3
    s.eevee.shadow_step_count = 12
    s.eevee.use_fast_gi = True
    s.eevee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
    s.eevee.fast_gi_distance = 0.7
    s.eevee.fast_gi_ray_count = 4
    s.eevee.fast_gi_step_count = 8
    # dusty air: the sun and the lamp show as beams
    s.eevee.use_volumetric_shadows = True
    s.eevee.volumetric_samples = 128
    s.eevee.volumetric_tile_size = '4'
    s.eevee.volumetric_shadow_samples = 32
    s.eevee.volumetric_sample_distribution = 0.8
    s.eevee.volumetric_start = 0.1
    s.eevee.volumetric_end = 12.0
    s.eevee.volumetric_light_clamp = 0.0
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
    # A two-segment bevel turns a 90° edge in three joints of 157.5°, 135° and 157.5°. A crease
    # threshold between 135° and 157.5° inks the middle joint only: one line per bevelled edge.
    # (At 134° no bevelled edge was inked at all, so the desk and drawers had no lines.)
    fs.crease_angle = math.radians(142)
    fs.use_culling = True
    # The strokes come out as a pass of their own and are laid over the finished image (see
    # ink_over), like the key plate printed last. Drawn inside the render, the dusty air veiled
    # them: the further an object, the fainter its ink, and inside the beam it vanished.
    fs.as_render_pass = True
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    # every silhouette and border a little heavier, creases and material edges lighter
    _lineset(fs, 'outline', scale, 1.0, ('silhouette', 'border'))
    _lineset(fs, 'inner', scale, 0.62, ('crease', 'material_boundary'))
    ink_over()


def _lineset(fs, name, scale, weight, edges):
    ls = fs.linesets.new(name)
    ls.select_by_visibility = True
    ls.visibility = 'VISIBLE'
    ls.select_by_edge_types = True
    for e in ('silhouette', 'border', 'crease', 'material_boundary', 'contour', 'external_contour'):
        setattr(ls, 'select_' + e, e in edges)
    ls.select_by_collection = True
    ls.collection = core.collection('NoInk')
    ls.collection_negation = 'EXCLUSIVE'
    st = bpy.data.linestyles.new(name)
    ls.linestyle = st
    st.color = core.hex_rgba(core.TOKENS['ink']['color'])[:3]
    st.thickness = 2.0 * scale * 2 * weight
    st.thickness_position = 'CENTER'
    st.caps = 'ROUND'
    st.chaining = 'PLAIN'
    st.use_same_object = True
    # inside the room the weight barely changes with distance (DESIGN.md: "varies slightly")
    d = st.thickness_modifiers.new('distance', 'DISTANCE_FROM_CAMERA')
    d.range_min, d.range_max = 1.6, 8.0
    d.value_min, d.value_max = 1.1, 0.8
    d.mapping = 'LINEAR'
    d.blend = 'MULTIPLY'
    # the street outside thins and fades so the background stays calm; still opaque, because a
    # see-through line smears into the surface under it and reads as blur
    far = st.thickness_modifiers.new('far', 'DISTANCE_FROM_CAMERA')
    far.range_min, far.range_max = 7.0, 30.0
    far.value_min, far.value_max = 1.0, 0.45
    far.mapping = 'LINEAR'
    far.blend = 'MULTIPLY'
    c = st.color_modifiers.new('fade', 'DISTANCE_FROM_CAMERA')
    c.range_min, c.range_max = 7.0, 30.0
    c.blend = 'MIX'
    ramp = c.color_ramp.elements
    ramp[0].color = core.hex_rgba(core.TOKENS['ink']['color'])
    ramp[1].color = core.hex_rgba('#6B5444')
    # a slightly tapered stroke like a hand-inked line (no thickness noise: it doubles the width)
    al = st.thickness_modifiers.new('taper', 'ALONG_STROKE')
    al.mapping = 'CURVE'
    al.blend = 'MULTIPLY'
    cm = al.curve
    pts = cm.curves[0].points
    pts[0].location = (0, 0.7)
    pts[1].location = (1, 0.7)
    pts.new(0.15, 1.0)
    pts.new(0.85, 1.0)
    cm.update()
    g = st.geometry_modifiers.new('wobble', 'PERLIN_NOISE_1D')
    g.frequency = 3
    g.amplitude = 0.15 * scale * 2
    return ls


def ink_over():
    """Compositor: the Freestyle pass over the combined image (beam, dust and all)."""
    s = bpy.context.scene
    g = bpy.data.node_groups.get('ink-over') or bpy.data.node_groups.new('ink-over', 'CompositorNodeTree')
    for n in list(g.nodes):
        g.nodes.remove(n)
    if not g.interface.items_tree:
        g.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    N, L = g.nodes, g.links
    rl = N.new('CompositorNodeRLayers')
    rl.scene = s
    over = N.new('CompositorNodeAlphaOver')
    ins = [i for i in over.inputs if i.type == 'RGBA']
    L.new(rl.outputs['Image'], ins[0])
    L.new(rl.outputs['Freestyle'], ins[1])
    out = N.new('NodeGroupOutput')
    L.new(over.outputs[0], out.inputs[0])
    s.compositing_node_group = g


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
    lights.air_setup()
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
