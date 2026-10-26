"""Core for the Blender room: tokens, the toon material, geometry helpers.

Coordinates: x to the right, y into the room (the back wall is at y = ROOM_D), z up.
"""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TOKENS = json.load(open(os.path.join(ROOT, 'design', 'tokens.json')))
TEX = os.path.join(ROOT, 'blender', 'textures')

ROOM_W, ROOM_D, ROOM_H = 5.4, 5.2, 2.75
WIN = dict(y0=2.45, y1=4.0, z0=0.9, z1=2.32, glass_x=-0.12, transom=1.86, frame=0.055, wall_t=0.2)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


def color(name):
    """A palette name, a material name from the shared list, or a hex string → linear RGBA."""
    if name.startswith('#'):
        return hex_rgba(name)
    if name == 'ink':
        return hex_rgba(TOKENS['ink']['color'])
    mats = TOKENS['materials']
    if name in mats and mats[name]['color'] != name:
        c = mats[name]['color']
        return hex_rgba(TOKENS['ink']['color']) if c == 'ink' else color(c)
    return hex_rgba(TOKENS['palette'][name])


# ---------------------------------------------------------------- the toon shader
def toon_group():
    """Banded light (shade / fill / sun) with the light's own hue kept, hatching in shade.

    The lighting is measured with Shader to RGB, cut into hard steps, then re-applied to the
    base colour and emitted, so every edge between light levels is hard.
    """
    name = 'KamarToon'
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    io = g.interface
    io.new_socket('Color', in_out='INPUT', socket_type='NodeSocketColor').default_value = (0.8, 0.8, 0.8, 1)
    io.new_socket('Hatch', in_out='INPUT', socket_type='NodeSocketFloat').default_value = 0.0
    io.new_socket('Emit', in_out='INPUT', socket_type='NodeSocketFloat').default_value = 0.0
    io.new_socket('Shader', in_out='OUTPUT', socket_type='NodeSocketShader')
    N = g.nodes
    L = g.links
    gi = N.new('NodeGroupInput')
    go = N.new('NodeGroupOutput')

    diff = N.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = N.new('ShaderNodeShaderToRGB')
    L.new(diff.outputs[0], s2r.inputs[0])

    lum = N.new('ShaderNodeRGBToBW')
    L.new(s2r.outputs['Color'], lum.inputs[0])

    # three hard steps of light
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    # shade leans blue-grey, fill is neutral, sun leans warm (DESIGN.md grade, baked into the steps)
    # Absolute light levels, posterised: night and contact shadows are truly dark, lamp pools and
    # sun patches truly bright. The low steps lean blue-grey, the top one warm (DESIGN.md grade).
    levels = [(0.0, (0.055, 0.06, 0.085)), (0.07, (0.15, 0.16, 0.21)), (0.14, (0.31, 0.33, 0.40)),
              (0.30, (0.64, 0.64, 0.64)), (0.95, (1.22, 1.02, 0.78))]
    els[0].position, els[0].color = levels[0][0], levels[0][1] + (1,)
    els[1].position, els[1].color = levels[1][0], levels[1][1] + (1,)
    for pos, col in levels[2:]:
        e = els.new(pos)
        e.color = col + (1,)
    L.new(lum.outputs[0], ramp.inputs['Fac'])

    # keep the light's hue: chroma = rgb / luminance, eased toward white
    safe = N.new('ShaderNodeMath'); safe.operation = 'MAXIMUM'; safe.inputs[1].default_value = 0.04
    L.new(lum.outputs[0], safe.inputs[0])
    div = N.new('ShaderNodeVectorMath'); div.operation = 'DIVIDE'
    L.new(s2r.outputs['Color'], div.inputs[0])
    comb = N.new('ShaderNodeCombineXYZ')
    for i in range(3):
        L.new(safe.outputs[0], comb.inputs[i])
    L.new(comb.outputs[0], div.inputs[1])
    chroma = N.new('ShaderNodeMix'); chroma.data_type = 'RGBA'; chroma.inputs['Factor'].default_value = 0.12
    L.new(div.outputs[0], chroma.inputs['A'])
    chroma.inputs['B'].default_value = (1, 1, 1, 1)

    light = N.new('ShaderNodeMix'); light.data_type = 'RGBA'; light.blend_type = 'MULTIPLY'; light.inputs['Factor'].default_value = 1
    L.new(ramp.outputs['Color'], light.inputs['A'])
    L.new(chroma.outputs['Result'], light.inputs['B'])

    # one exposure for the whole room per mood (night is darker); self-lit things skip it
    expo = N.new('ShaderNodeValue'); expo.name = 'exposure'; expo.outputs[0].default_value = 1.0
    lexp = N.new('ShaderNodeVectorMath'); lexp.operation = 'SCALE'
    L.new(light.outputs['Result'], lexp.inputs[0]); L.new(expo.outputs[0], lexp.inputs['Scale'])
    lit = N.new('ShaderNodeMix'); lit.data_type = 'RGBA'; lit.blend_type = 'MULTIPLY'; lit.inputs['Factor'].default_value = 1
    L.new(gi.outputs['Color'], lit.inputs['A'])
    L.new(lexp.outputs[0], lit.inputs['B'])

    # hatching: object-space diagonal strokes, only in the shade step
    tc = N.new('ShaderNodeTexCoord')
    mapping = N.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = (0.0, 0.0, 0.0)
    L.new(tc.outputs['Object'], mapping.inputs['Vector'])
    wave = N.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 14.0
    wave.inputs['Distortion'].default_value = 0.5
    wave.inputs['Detail'].default_value = 1.0
    L.new(mapping.outputs['Vector'], wave.inputs['Vector'])
    stroke = N.new('ShaderNodeMath'); stroke.operation = 'GREATER_THAN'; stroke.inputs[1].default_value = 0.93
    L.new(wave.outputs['Fac'], stroke.inputs[0])
    shade = N.new('ShaderNodeMath'); shade.operation = 'LESS_THAN'; shade.inputs[1].default_value = 0.30
    L.new(lum.outputs[0], shade.inputs[0])
    m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'
    L.new(stroke.outputs[0], m1.inputs[0]); L.new(shade.outputs[0], m1.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
    L.new(m1.outputs[0], m2.inputs[0]); L.new(gi.outputs['Hatch'], m2.inputs[1])
    m3 = N.new('ShaderNodeMath'); m3.operation = 'MULTIPLY'; m3.inputs[1].default_value = 0.32
    L.new(m2.outputs[0], m3.inputs[0])
    hatch = N.new('ShaderNodeMix'); hatch.data_type = 'RGBA'
    L.new(m3.outputs[0], hatch.inputs['Factor'])
    L.new(lit.outputs['Result'], hatch.inputs['A'])
    hatch.inputs['B'].default_value = hex_rgba(TOKENS['ink']['color'])

    # self-lit things (screens, bulbs) bypass the bands
    glow = N.new('ShaderNodeMix'); glow.data_type = 'RGBA'
    L.new(gi.outputs['Emit'], glow.inputs['Factor'])
    L.new(hatch.outputs['Result'], glow.inputs['A'])
    L.new(gi.outputs['Color'], glow.inputs['B'])

    em = N.new('ShaderNodeEmission')
    L.new(glow.outputs['Result'], em.inputs['Color'])
    L.new(em.outputs[0], go.inputs['Shader'])
    return g


MATS = {}


def material(name, base=None, tex=None, hatch=None, emit=0.0, tex_mix=1.0):
    """A toon material. `base` is a palette/material/hex name; `tex` an image in blender/textures."""
    key = name  # one material per name, as in the shared material list
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    grp = nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = toon_group()
    nt.links.new(grp.outputs['Shader'], out.inputs['Surface'])
    col = color(base or name)
    grp.inputs['Color'].default_value = col
    h = hatch if hatch is not None else TOKENS['materials'].get(name, {}).get('hatch', 0)
    grp.inputs['Hatch'].default_value = h
    grp.inputs['Emit'].default_value = emit
    if tex:
        img = bpy.data.images.load(os.path.join(TEX, tex), check_existing=True)
        it = nt.nodes.new('ShaderNodeTexImage')
        it.image = img
        it.interpolation = 'Linear'
        nt.links.new(it.outputs['Color'], grp.inputs['Color'])
    MATS[key] = m
    return m


# ---------------------------------------------------------------- geometry helpers
def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def collection(name):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def mesh_obj(name, bm, mat, coll=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    if mat:
        me.materials.append(mat)
    return link(ob, coll)


def bevel(ob, width=0.004, segments=2, angle=30):
    mod = ob.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    return ob


def box(name, x0, x1, y0, y1, z0, z1, mat, coll=None, bev=0.004, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    ob = mesh_obj(name, bm, mat, coll)
    if bev:
        bevel(ob, min(bev, 0.45 * min(x1 - x0, y1 - y0, z1 - z0)), segs)
    return ob


def cylinder(name, cx, cy, r, z0, z1, mat, coll=None, r_top=None, verts=40, cap=True, bev=0.003):
    bm = bmesh.new()
    rt = r if r_top is None else r_top
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r, radius2=rt, depth=z1 - z0)
    for v in bm.verts:
        v.co.x += cx
        v.co.y += cy
        v.co.z += (z0 + z1) / 2
    ob = mesh_obj(name, bm, mat, coll, smooth=True)
    if bev:
        bevel(ob, bev, 2, 50)
    return ob


def prism(name, pts, axis_from, axis_to, mat, coll=None, bev=0.003):
    """Extrude a polygon given in 3D (planar) points along the vector axis_to - axis_from."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in pts]
    f = bm.faces.new(vs)
    d = Vector(axis_to) - Vector(axis_from)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=d)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_obj(name, bm, mat, coll)
    if bev:
        bevel(ob, bev, 2)
    return ob


def plane(name, corners, mat, coll=None, uv=True):
    """A quad from four 3D corners (counter-clockwise seen from the front), UVs 0..1."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(c)) for c in corners]
    f = bm.faces.new(vs)
    if uv:
        layer = bm.loops.layers.uv.new('UVMap')
        for loop, (u, v) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[layer].uv = (u, v)
    return mesh_obj(name, bm, mat, coll)


def tube(name, points, radius, mat, coll=None, res=6):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points):
        p.co = (q[0], q[1], q[2], 1)
    ob = bpy.data.objects.new(name, cu)
    cu.materials.append(mat)
    return link(ob, coll)


def smooth_tube(name, points, radius, mat, coll=None, taper=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, q in zip(sp.bezier_points, points):
        bp.co = q
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    if taper:
        for bp, t in zip(sp.bezier_points, taper):
            bp.radius = t
    ob = bpy.data.objects.new(name, cu)
    cu.materials.append(mat)
    return link(ob, coll)


def cut(ob, cutter_bounds):
    """Subtract an axis-aligned box from an object (applied), e.g. the window opening."""
    x0, x1, y0, y1, z0, z1 = cutter_bounds
    c = box('cutter', x0, x1, y0, y1, z0, z1, None, bev=0)
    mod = ob.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = c
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='cut')
    ob.select_set(False)
    bpy.data.objects.remove(c, do_unlink=True)
    return ob


def rng(seed):
    return random.Random(seed)
