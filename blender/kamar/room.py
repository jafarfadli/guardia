"""The room's shell: walls with a real window opening, floor, ceiling, trim, the view outside."""
import math

import bpy
from mathutils import Vector

from .core import (ROOM_W as W, ROOM_D as D, ROOM_H as H, WIN, EAST, TOKENS, box, cylinder, plane, tube, material, prism,
                   toon_group, color, hex_rgba, collection, rng, mesh_obj)


def _toon_material(name, hatch=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    grp = nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = toon_group()
    grp.inputs['Hatch'].default_value = hatch
    nt.links.new(grp.outputs['Shader'], out.inputs['Surface'])
    return m, nt, grp


def paint_material(name='wall-paint', base='wall-paint', hatch=None):
    """Wall paint with a history: damp tide-marks, a yellowed band up high, plaster flecks."""
    h = TOKENS['materials'].get(name, {}).get('hatch', 1.0) if hatch is None else hatch
    m, nt, grp = _toon_material(name, h)
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    # stains: large soft noise, cut hard into two tones
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.55; noise.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    cut = N.new('ShaderNodeValToRGB'); cut.color_ramp.interpolation = 'CONSTANT'
    e = cut.color_ramp.elements
    e[0].position = 0.0; e[0].color = color(base)
    e[1].position = 0.68; e[1].color = _mix(color(base), color('mustard'), 0.18)
    e2 = e.new(0.74); e2.color = _mix(color(base), color('mustard'), 0.28)
    L.new(noise.outputs['Fac'], cut.inputs['Fac'])
    # yellowed paint near the ceiling
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    high = N.new('ShaderNodeMath'); high.operation = 'GREATER_THAN'; high.inputs[1].default_value = 2.36
    L.new(sep.outputs['Z'], high.inputs[0])
    yel = N.new('ShaderNodeMix'); yel.data_type = 'RGBA'
    L.new(high.outputs[0], yel.inputs['Factor'])
    L.new(cut.outputs['Color'], yel.inputs['A'])
    yel.inputs['B'].default_value = _mix(color(base), color('mustard'), 0.14)
    # plaster flecks: tiny dark specks
    vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 42
    vor.feature = 'F1'
    L.new(tc.outputs['Object'], vor.inputs['Vector'])
    fleck = N.new('ShaderNodeMath'); fleck.operation = 'LESS_THAN'; fleck.inputs[1].default_value = 0.035
    L.new(vor.outputs['Distance'], fleck.inputs[0])
    fm = N.new('ShaderNodeMath'); fm.operation = 'MULTIPLY'; fm.inputs[1].default_value = 0.55
    L.new(fleck.outputs[0], fm.inputs[0])
    fl = N.new('ShaderNodeMix'); fl.data_type = 'RGBA'
    L.new(fm.outputs[0], fl.inputs['Factor'])
    L.new(yel.outputs['Result'], fl.inputs['A'])
    fl.inputs['B'].default_value = hex_rgba(TOKENS['ink']['color'])
    L.new(fl.outputs['Result'], grp.inputs['Color'])
    return m


def plank_material():
    """Honey vinyl planks running into the room: seams in ink, a few tones, faint grain."""
    m, nt, grp = _toon_material('floor-vinyl', TOKENS['materials']['floor-vinyl']['hatch'])
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(90))
    L.new(tc.outputs['Object'], mp.inputs['Vector'])
    brick = N.new('ShaderNodeTexBrick')
    brick.offset = 0.37
    brick.offset_frequency = 1
    brick.squash = 1.0
    brick.inputs['Color1'].default_value = color('light-wood')
    brick.inputs['Color2'].default_value = color('pine')
    brick.inputs['Mortar'].default_value = _mix(color('light-wood'), hex_rgba(TOKENS['ink']['color']), 0.75)
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.0035
    brick.inputs['Bias'].default_value = -0.2
    brick.inputs['Brick Width'].default_value = 1.7
    brick.inputs['Row Height'].default_value = 0.15
    L.new(mp.outputs['Vector'], brick.inputs['Vector'])
    # grain: long thin bands, nudged into the plank colour
    wave = N.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 9; wave.inputs['Distortion'].default_value = 6; wave.inputs['Detail'].default_value = 2
    L.new(mp.outputs['Vector'], wave.inputs['Vector'])
    gr = N.new('ShaderNodeMath'); gr.operation = 'GREATER_THAN'; gr.inputs[1].default_value = 0.93
    L.new(wave.outputs['Fac'], gr.inputs[0])
    gm = N.new('ShaderNodeMath'); gm.operation = 'MULTIPLY'; gm.inputs[1].default_value = 0.3
    L.new(gr.outputs[0], gm.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    L.new(gm.outputs[0], mix.inputs['Factor'])
    L.new(brick.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = _mix(color('dark-wood'), color('light-wood'), 0.3)
    L.new(mix.outputs['Result'], grp.inputs['Color'])
    return m


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


# ---------------------------------------------------------------- shell
def build_shell():
    C = collection('Shell')
    paint = paint_material()
    ceil = paint_material('ceiling', 'ceiling')
    trim = material('trim')
    T = 0.12  # wall thickness for the boxes (the window wall is thicker)
    near = -3.0
    # floor
    # the floor sits 2 mm low: everything standing on it keeps an inked bottom edge instead of a
    # face lying exactly in the floor, which Freestyle may count as hidden. The walls run down
    # past it, so no gap at their foot lets the sky through.
    floor = box('floor', 0, W, near, D, -0.1, -0.002, plank_material(), C, bev=0)
    # back wall, right wall, ceiling
    box('wall-back', -WIN['wall_t'], W + T, D, D + T, -0.1, H, paint, C, bev=0)
    right = box('wall-right', W, W + T, near, D, -0.1, H, paint, C, bev=0)
    from .core import cut as _cut
    _cut(right, (W - 0.1, W + T + 0.1, EAST['y0'], EAST['y1'], EAST['z0'], EAST['z1']))  # the east window, out of frame
    box('ceiling', -WIN['wall_t'], W + T, near, D + T, H, H + 0.1, ceil, C, bev=0)
    # window wall (x from -wall_t to 0) built around the opening
    t = WIN['wall_t']
    y0, y1, z0, z1 = WIN['y0'], WIN['y1'], WIN['z0'], WIN['z1']
    wall = wall_with_window('wall-left', -t, 0, near, D, -0.1, H, (y0, y1, z0, z1), paint, C)
    # skirting and cornice in cherry
    box('skirt-back', 0, W, D - 0.02, D, -0.002, 0.1, trim, C, bev=0.003)
    box('skirt-left', 0, 0.02, near, D - 0.02, -0.002, 0.1, trim, C, bev=0.003)
    box('cornice-back', 0, W, D - 0.035, D, H - 0.075, H, trim, C, bev=0.004)
    box('cornice-left', 0, 0.035, near, D - 0.035, H - 0.075, H, trim, C, bev=0.004)
    build_window(C)
    # Freestyle decides what is hidden on a coarse grid and lets lines through faces many metres
    # across: the houses outside showed through the floor and the window wall. A finer mesh stops
    # that, and looks the same (the paint and planks use object space).
    # (The window wall is built as a fine mesh already; the right wall keeps its boolean cut,
    # which a subdivision would tear open.)
    for ob in (floor, bpy.data.objects['wall-back'], bpy.data.objects['ceiling']):
        sub = ob.modifiers.new('fine', 'SUBSURF')
        sub.subdivision_type = 'SIMPLE'
        sub.levels = sub.render_levels = 2
    return C


def wall_with_window(name, x0, x1, ya, yb, za, zb, hole, mat, coll, step=0.5):
    """A solid wall slab (x0..x1 thick, along y and z) with a rectangular opening, made of
    quads no bigger than `step` so Freestyle's hiding works on it (see build_shell)."""
    import bmesh
    hy0, hy1, hz0, hz1 = hole
    def lines(a, b, extra):
        vals = {a, b, *extra}
        v = math.ceil(a / step) * step
        while v < b:
            vals.add(round(v, 4))
            v += step
        return sorted(vals)
    ys, zs = lines(ya, yb, (hy0, hy1)), lines(za, zb, (hz0, hz1))
    inside = lambda y, z: hy0 <= y < hy1 and hz0 <= z < hz1
    bm = bmesh.new()
    verts = {}
    def v(x, y, z):
        k = (round(x, 5), round(y, 5), round(z, 5))
        if k not in verts:
            verts[k] = bm.verts.new(k)
        return verts[k]
    def quad(a, b, c, d):
        bm.faces.new((a, b, c, d))
    for i in range(len(ys) - 1):
        for j in range(len(zs) - 1):
            y_0, y_1, z_0, z_1 = ys[i], ys[i + 1], zs[j], zs[j + 1]
            if inside(y_0, z_0):
                continue
            quad(v(x1, y_0, z_0), v(x1, y_1, z_0), v(x1, y_1, z_1), v(x1, y_0, z_1))  # room side
            quad(v(x0, y_0, z_0), v(x0, y_0, z_1), v(x0, y_1, z_1), v(x0, y_1, z_0))  # outside
            # sides where the slab ends or meets the opening
            for (ny, nz, edge) in ((0, -1, (y_0, z_0, y_1, z_0)), (0, 1, (y_0, z_1, y_1, z_1)),
                                   (-1, 0, (y_0, z_0, y_0, z_1)), (1, 0, (y_1, z_0, y_1, z_1))):
                cy, cz = (y_0 + y_1) / 2 + ny * (y_1 - y_0), (z_0 + z_1) / 2 + nz * (z_1 - z_0)
                outside_slab = not (ya < cy < yb and za < cz < zb)
                if outside_slab or inside(cy if ny else y_0, cz if nz else z_0) or (ny and inside(cy, z_0)) or (nz and inside(y_0, cz)):
                    a1, b1, a2, b2 = edge
                    quad(v(x1, a1, b1), v(x1, a2, b2), v(x0, a2, b2), v(x0, a1, b1))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_obj(name, bm, mat, coll)


def build_window(C):
    frame = material('window-frame')
    gx, f = WIN['glass_x'], WIN['frame']
    y0, y1, z0, z1, tr = WIN['y0'], WIN['y1'], WIN['z0'], WIN['z1'], WIN['transom']
    x0, x1 = gx - 0.03, gx + 0.03
    ym = (y0 + y1) / 2
    box('win-frame-front', x0, x1, y0, y0 + f, z0, z1, frame, C)
    box('win-frame-back', x0, x1, y1 - f, y1, z0, z1, frame, C)
    box('win-frame-top', x0, x1, y0, y1, z1 - f, z1, frame, C)
    box('win-frame-bottom', x0, x1, y0, y1, z0, z0 + f, frame, C)
    box('win-mullion', x0, x1, ym - f / 2, ym + f / 2, z0, z1, frame, C)
    box('win-transom', x0, x1, y0, y1, tr - f / 2, tr + f / 2, frame, C)
    box('win-sill', -WIN['wall_t'], 0.07, y0 - 0.07, y1 + 0.07, z0 - 0.035, z0, frame, C, bev=0.006)


# ---------------------------------------------------------------- outside
def build_outside():
    """Houses across the street, a skyline, a power pole and a tree, seen through the window."""
    C = collection('Outside')
    r = rng(1234)
    def facade(name, x, y0, y1, top, col, depth=4.0):
        return box(name, x - depth, x, y0, y1, -6, top, material('out-' + col, col, hatch=0.0), C, bev=0)
    # the line of sight runs out to the left (−x) and into the room's depth
    # far skyline: low blocks with rows of small windows
    for i, (y0, y1, top, col) in enumerate([(-6, 2, 3.4, 'ivory'), (2, 9, 5.2, 'pale-blue'), (9, 15, 2.6, 'cream'), (15, 24, 4.4, 'ivory'), (24, 34, 3.2, 'cream')]):
        facade(f'far-{i}', -30, y0, y1, top, col)
        for z in [top - 1.0, top - 2.2]:
            for k in range(int((y1 - y0) / 1.3)):
                yy = y0 + 0.5 + k * 1.3
                wm = material('out-far-window-lit', 'navy', hatch=0) if r.random() < 0.45 else material('out-far-window', 'navy', hatch=0)
                box(f'fw-{i}-{z}-{k}', -30.02, -30.0, yy, yy + 0.5, z, z + 0.55, wm, C, bev=0)
    # houses across the street, roofs below our window line
    facade('house-brick', -10, -2, 3.2, 0.7, 'brick')
    facade('house-cream', -10, 3.2, 7.4, 1.4, 'cream')
    facade('house-blue', -10, 7.4, 12, 0.3, 'pale-blue')
    roof = material('out-green-roof', 'green-roof', hatch=0)
    prism('roof-green', [(-10, -2.3, 0.7), (-10, 3.5, 0.7), (-10, 2.8, 1.9), (-10, -1.6, 1.9)], (0, 0, 0), (-4, 0, 0), roof, C)
    roof2 = material('out-blue-roof', 'blue-roof', hatch=0)
    prism('roof-blue', [(-10, 7.1, 0.3), (-10, 12.3, 0.3), (-10, 11.6, 1.3), (-10, 7.8, 1.3)], (0, 0, 0), (-4, 0, 0), roof2, C)
    # windows on the facades (dark; lit at night by an emission switch set per frame)
    unlit, lit = material('out-window', 'navy', hatch=0), material('out-window-lit', 'navy', hatch=0)
    for i, y in enumerate([-1.4, -0.4, 0.8, 1.9]):
        box(f'hw-a{y}', -10.02, -10.0, y, y + 0.55, -0.6, 0.1, lit if i % 2 else unlit, C, bev=0)
    for i, y in enumerate([3.8, 5.0, 6.3]):
        box(f'hw-b{y}', -10.02, -10.0, y, y + 0.55, 0.2, 0.9, lit if i != 1 else unlit, C, bev=0)
    for i, y in enumerate([8.2, 9.6, 10.9]):
        box(f'hw-c{y}', -10.02, -10.0, y, y + 0.55, -0.9, -0.2, lit if i == 1 else unlit, C, bev=0)
    # water tank on the cream house
    cylinder('tank', -11.5, 6.4, 0.45, 1.75, 2.45, material('out-tank', '#C9763F', hatch=0), C, verts=24)
    for dy in (-0.35, 0.35):
        tube(f'tank-leg{dy}', [(-11.5, 6.4 + dy, 1.4), (-11.5, 6.4 + dy, 1.8)], 0.03, material('ink-line', '#2B1C14', hatch=0), C)
    # power pole and sagging lines close to the window
    pole_m = material('out-pole', 'ivory', hatch=0)
    cylinder('pole', -3.6, 1.6, 0.09, -6, 3.0, pole_m, C, verts=12, r_top=0.07)
    cable = material('ink-line', '#2B1C14', hatch=0)
    for k in range(3):
        pts = []
        for i in range(17):
            t = i / 16
            pts.append((-3.6 - 1.5 * t, 1.6 + 9 * t, 2.85 - k * 0.05 - 0.45 * math.sin(t * math.pi * 0.9)))
        tube(f'wire{k}', pts, 0.008, cable, C)
    # a tree crown leaning in at the top of the view
    leaf = material('out-leaf', 'plant-green', hatch=0)
    for i in range(16):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.35 + r.random() * 0.35,
                                              location=(-6.5 - r.random() * 1.5, 3.5 + r.random() * 3.0, 2.6 + r.random() * 1.2))
        ob = bpy.context.active_object
        ob.scale = (1.0, 1.3, 0.7)
        ob.data.materials.append(leaf)
        bpy.context.scene.collection.objects.unlink(ob)
        C.objects.link(ob)
    return C
