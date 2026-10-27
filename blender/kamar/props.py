"""Furniture and everything that makes the room lived in.

Layout follows the v1 room (wallpaper/src/*.js); v1 coords (X, Y up, Z depth) map to (x, y, z) = (X, Z, Y).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from .core import (ROOM_W, ROOM_D as D, ROOM_H, WIN, TOKENS, box, cylinder, plane, tube, smooth_tube, material,
                   toon_group, color, hex_rgba, collection, rng, mesh_obj, bevel)

LAMP_HEAD = (1.1, D - 0.5, 1.2)
LAMP_AXIS = (0.18, 0.3, -0.93)  # onto the papers and the keyboard
P = None  # the Props collection
OVERLAYS = {}  # world-space quads for the live layers: the calendar, the sleeve, the widgets and the photos
MASKED = {}  # widget name → the objects whose visible pixels make its mask (see blender/masks.py)


# ---------------------------------------------------------------- materials with patterns
def _toon(name, hatch=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    g = nt.nodes.new('ShaderNodeGroup')
    g.node_tree = toon_group()
    g.inputs['Hatch'].default_value = hatch
    g.inputs['Emit'].default_value = emit
    nt.links.new(g.outputs['Shader'], out.inputs['Surface'])
    return m, nt, g


def _ramp(nt, colors, interp='CONSTANT'):
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.interpolation = interp
    els = r.color_ramp.elements
    n = len(colors)
    for i, c in enumerate(colors):
        e = els[i] if i < len(els) else els.new(i / n)
        e.position = i / n
        e.color = color(c)
    return r


BOOK_COLS = ['navy', 'cream', 'muted-red', 'teal', 'mustard', 'olive', 'ivory', 'terracotta', 'pale-blue', 'dark-wood']


def book_material():
    """One material for every book: colour and spine bands picked by the object's random value."""
    if 'book' in bpy.data.materials:
        return bpy.data.materials['book']
    m, nt, g = _toon('book', 0)
    N, L = nt.nodes, nt.links
    info = N.new('ShaderNodeObjectInfo')
    base = _ramp(nt, BOOK_COLS)
    L.new(info.outputs['Random'], base.inputs['Fac'])
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs[0])
    def band(lo, hi):
        a = N.new('ShaderNodeMath'); a.operation = 'GREATER_THAN'; a.inputs[1].default_value = lo
        b = N.new('ShaderNodeMath'); b.operation = 'LESS_THAN'; b.inputs[1].default_value = hi
        L.new(sep.outputs['Z'], a.inputs[0]); L.new(sep.outputs['Z'], b.inputs[0])
        m_ = N.new('ShaderNodeMath'); m_.operation = 'MULTIPLY'
        L.new(a.outputs[0], m_.inputs[0]); L.new(b.outputs[0], m_.inputs[1])
        return m_
    b1, b2 = band(0.8, 0.86), band(0.12, 0.17)
    both = N.new('ShaderNodeMath'); both.operation = 'MAXIMUM'
    L.new(b1.outputs[0], both.inputs[0]); L.new(b2.outputs[0], both.inputs[1])
    # only about half the books carry bands
    rr = N.new('ShaderNodeMath'); rr.operation = 'FRACT'
    mul10 = N.new('ShaderNodeMath'); mul10.operation = 'MULTIPLY'; mul10.inputs[1].default_value = 7.3
    L.new(info.outputs['Random'], mul10.inputs[0]); L.new(mul10.outputs[0], rr.inputs[0])
    has = N.new('ShaderNodeMath'); has.operation = 'GREATER_THAN'; has.inputs[1].default_value = 0.45
    L.new(rr.outputs[0], has.inputs[0])
    fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'
    L.new(both.outputs[0], fac.inputs[0]); L.new(has.outputs[0], fac.inputs[1])
    bandcol = _ramp(nt, ['mustard', 'cream', 'ink', 'ivory'])
    L.new(rr.outputs[0], bandcol.inputs['Fac'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    L.new(fac.outputs[0], mix.inputs['Factor'])
    L.new(base.outputs['Color'], mix.inputs['A'])
    L.new(bandcol.outputs['Color'], mix.inputs['B'])
    L.new(mix.outputs['Result'], g.inputs['Color'])
    return m


def stripes_material(name, a, b, scale, direction='X', hatch=0.0, width=0.5):
    m, nt, g = _toon(name, hatch)
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    w = N.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = direction
    w.inputs['Scale'].default_value = scale
    L.new(tc.outputs['Object'], w.inputs['Vector'])
    s = N.new('ShaderNodeMath'); s.operation = 'GREATER_THAN'; s.inputs[1].default_value = width
    L.new(w.outputs['Fac'], s.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    L.new(s.outputs[0], mix.inputs['Factor'])
    mix.inputs['A'].default_value = color(a)
    mix.inputs['B'].default_value = color(b)
    L.new(mix.outputs['Result'], g.inputs['Color'])
    return m


def gingham_material():
    m, nt, g = _toon('curtain', TOKENS['materials']['curtain']['hatch'])
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    def stripe(axis):
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1 / 0.07
        L.new(sep.outputs[axis], mul.inputs[0])
        fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L.new(mul.outputs[0], fr.inputs[0])
        gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
        L.new(fr.outputs[0], gt.inputs[0])
        return gt
    a, b = stripe('Y'), stripe('Z')
    cnt = N.new('ShaderNodeMath'); cnt.operation = 'ADD'
    L.new(a.outputs[0], cnt.inputs[0]); L.new(b.outputs[0], cnt.inputs[1])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'
    e = r.color_ramp.elements
    e[0].position = 0.0; e[0].color = color('cream')
    e[1].position = 0.4; e[1].color = tuple(color('cream')[i] * 0.55 + color('mustard')[i] * 0.45 for i in range(3)) + (1,)
    e2 = e.new(0.8); e2.color = color('mustard')
    div = N.new('ShaderNodeMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = 2
    L.new(cnt.outputs[0], div.inputs[0]); L.new(div.outputs[0], r.inputs['Fac'])
    L.new(r.outputs['Color'], g.inputs['Color'])
    return m


def keys_material():
    m, nt, g = _toon('keyboard', 0)
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    br = N.new('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = color('beige-plastic')
    br.inputs['Color2'].default_value = color('beige-plastic')
    br.inputs['Mortar'].default_value = color('dark-wood')
    br.inputs['Scale'].default_value = 1
    br.inputs['Brick Width'].default_value = 0.036
    br.inputs['Row Height'].default_value = 0.034
    br.inputs['Mortar Size'].default_value = 0.004
    br.offset = 0.0
    L.new(tc.outputs['Object'], br.inputs['Vector'])
    L.new(br.outputs['Color'], g.inputs['Color'])
    return m


def tex_material(name, tex, emit=0.0):
    return material(name, 'paper', tex=tex, hatch=0, emit=emit)


# ---------------------------------------------------------------- small builders
def _put(ob):
    if ob.name in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.unlink(ob)
    for c in list(ob.users_collection):
        if c != P:
            c.objects.unlink(ob)
    if ob.name not in P.objects:
        P.objects.link(ob)
    return ob


def B(name, x0, x1, y0, y1, z0, z1, mat, bev=0.004):
    return box(name, x0, x1, y0, y1, z0, z1, mat, P, bev=bev)


def C(name, cx, cy, r, z0, z1, mat, **kw):
    return cylinder(name, cx, cy, r, z0, z1, mat, P, **kw)


def faces_material(ob, mats, pick):
    """Give some faces a second material: pick(normal) → slot index."""
    me = ob.data
    for m in mats[1:]:
        me.materials.append(m)
    for p in me.polygons:
        p.material_index = pick(p.normal)
    return ob


def local_box(name, w, d, h, mat, bev=0.003):
    """A box spanning x 0..w, y 0..d, z 0..h in its own space (for leaning and rotating)."""
    ob = box(name, 0, w, 0, d, 0, h, mat, P, bev=bev)
    return ob


def leaf_mesh(name, length, width, slits=False, heart=True, mat=None):
    """A flat leaf along local +Y, blade in local X; slits cut in from the edge for a monstera."""
    pts_l, pts_r = [], []
    n = 22
    for i in range(n + 1):
        t = i / n
        w = width * math.sin(math.pi * min(1, t * 1.02)) ** 0.8 * (1 - 0.25 * t if heart else 1)
        if heart and t < 0.18:
            w *= 0.6 + t * 2.2
        pts_l.append((-w, t * length))
        pts_r.append((w, t * length))
    if slits:
        # monstera: deep cuts in from the edge, slanting toward the tip like the veins; a cut
        # leaves a gap at the edge and closes before the midrib
        def cut(pts):
            out = []
            for i, (x, y) in enumerate(pts):
                if i in (6, 9, 12, 15, 18):
                    out.append((x, y - length * 0.012))
                    out.append((x * 0.26, y + length * 0.05))
                    out.append((x * 0.94, y + length * 0.022))
                else:
                    out.append((x, y))
            return out
        pts_l, pts_r = cut(pts_l), cut(pts_r)
    outline = pts_r + list(reversed(pts_l[1:-1]))
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.004 * abs(x) / max(width, 1e-6) * 4)) for x, y in outline]  # a gentle V along the midrib
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ob = mesh_obj(name, bm, mat, P)
    return ob


def place(ob, loc, normal, up):
    """Orient an object so local +Y points along `up` and local +Z along `normal`."""
    up = Vector(up).normalized()
    n = Vector(normal)
    n = (n - up * n.dot(up)).normalized()
    x = up.cross(n).normalized()
    m = Matrix((x, up, n)).transposed().to_4x4()
    m.translation = Vector(loc)
    ob.matrix_world = m
    return ob


# ---------------------------------------------------------------- the room's contents
# The work corner (rebuilt 2026-10-27). A small room seen close; its back wall carries what is
# worth reading: the chalkboard (notes and the GitHub streak), the tear-off calendar, the
# monitor (Claude's sessions) and the battery dials. On the right, the record cabinet with the
# now-playing sleeve on top and the photo shelves above it. The rest was cleared away, so these
# read from across the screen.
DESK = dict(x0=0.95, x1=2.45, y0=D - 0.68, y1=D - 0.02, top=0.76)


def LB(name, w, d, h, mat, loc, rz=0.0, bev=0.003):
    """A box standing on the centre of its bottom face at `loc`, turned rz about its own z."""
    ob = box(name, -w / 2, w / 2, -d / 2, d / 2, 0, h, mat, P, bev=bev)
    ob.location = loc
    ob.rotation_euler.z = rz
    return ob


def desk():
    wood = material('desk-wood')
    k = DESK
    x0, x1, y0, y1, top, t = k['x0'], k['x1'], k['y0'], k['y1'], k['top'], 0.035
    B('desk-top', x0, x1, y0, y1, top - t, top, wood, bev=0.006)
    for (lx, ly) in [(x0 + 0.02, y0 + 0.02), (x0 + 0.02, y1 - 0.065)]:
        B(f'desk-leg{ly:.2f}', lx, lx + 0.045, ly, ly + 0.045, 0, top - t, wood)
    px0, px1 = x1 - 0.48, x1 - 0.03
    B('desk-pedestal', px0, px1, y0 + 0.02, y1, 0, top - t, wood)
    for (za, zb) in [(0.05, 0.33), (0.36, 0.68)]:
        B(f'drawer{za}', px0 + 0.025, px1 - 0.025, y0 + 0.012, y0 + 0.022, za, zb, wood, bev=0.003)
        B(f'handle{za}', (px0 + px1) / 2 - 0.05, (px0 + px1) / 2 + 0.05, y0, y0 + 0.013, (za + zb) / 2 + 0.05, (za + zb) / 2 + 0.065, material('handle', 'dark-wood'), bev=0.002)
    B('desk-apron', x0, px0, y0 + 0.03, y0 + 0.05, top - t - 0.08, top - t, wood)


def desk_items():
    top = DESK['top']
    beige = material('plastic')
    # the monitor: Claude Code's Remote Control sessions are listed on its screen, live
    mx0, mx1, yf = 1.2, 1.92, D - 0.42
    B('monitor-stand', 1.44, 1.68, yf + 0.12, yf + 0.32, top, top + 0.03, beige)
    B('monitor-back', mx0 + 0.08, mx1 - 0.08, yf + 0.18, yf + 0.36, top + 0.1, top + 0.48, beige, bev=0.02)
    B('monitor', mx0, mx1, yf, yf + 0.2, top + 0.03, top + 0.55, beige, bev=0.012)
    sx0, sx1, sz0, sz1, ys = mx0 + 0.05, mx1 - 0.05, top + 0.1, top + 0.49, yf - 0.0005  # 0.62 x 0.39 m
    plane('screen', [(sx0, ys, sz0), (sx1, ys, sz0), (sx1, ys, sz1), (sx0, ys, sz1)], tex_material('screen', 'screen.png', emit=1.0), P)
    OVERLAYS['screen'] = [(sx0, ys - 0.0005, sz1), (sx1, ys - 0.0005, sz1), (sx1, ys - 0.0005, sz0), (sx0, ys - 0.0005, sz0)]
    MASKED['screen'] = ['screen']
    B('monitor-led', mx1 - 0.075, mx1 - 0.06, yf - 0.003, yf, top + 0.06, top + 0.07, material('led', '#7FB069', emit=1.0), bev=0)
    B('keyboard', 1.3, 1.82, D - 0.62, D - 0.47, top, top + 0.025, keys_material(), bev=0.006)
    # papers and a notebook under the lamp
    LB('paper-sheet', 0.21, 0.297, 0.003, material('paper'), (1.1, D - 0.5, top), rz=math.radians(-8), bev=0)
    LB('notebook', 0.18, 0.24, 0.015, material('notebook', 'teal'), (1.12, D - 0.47, top + 0.003), rz=math.radians(12))
    # mug with a red band and a handle
    mx, my = 2.06, D - 0.52
    C('mug', mx, my, 0.042, top, top + 0.1, material('ceramic'))
    C('mug-band', mx, my, 0.0425, top + 0.055, top + 0.072, material('mug-band', 'muted-red'), cap=False, bev=0)
    C('coffee', mx, my, 0.036, top + 0.088, top + 0.092, material('coffee', '#4A2E22'), bev=0)
    smooth_tube('mug-handle', [(mx + 0.04, my, top + 0.085), (mx + 0.075, my, top + 0.08), (mx + 0.08, my, top + 0.045), (mx + 0.04, my, top + 0.03)], 0.007, material('ceramic'), P)
    # a short stack of books at the right end, low enough to leave the dials clear
    z = top
    for i, (col, h, rz) in enumerate([('navy', 0.04, 4), ('mustard', 0.034, -3), ('muted-red', 0.03, 7)]):
        ob = LB(f'deskbook{i}', 0.24 - i * 0.012, 0.18 - i * 0.008, h, material('cover-' + col, col), (2.28, D - 0.5, z), rz=math.radians(rz), bev=0.002)
        faces_material(ob, [ob.data.materials[0], material('paper')], lambda n: 1 if abs(n.y) > 0.5 else 0)
        z += h
    # pencil cup and a small cactus by the lamp
    C('pencil-cup', 1.0, D - 0.62, 0.036, top, top + 0.1, material('pot'))
    for i, (col, dx, lean) in enumerate([('mustard', -0.012, 0.05), ('teal', 0.01, -0.04), ('muted-red', 0.0, 0.02)]):
        tube(f'pencil{i}', [(1.0 + dx, D - 0.62, top + 0.06), (1.0 + dx + lean, D - 0.63, top + 0.19)], 0.004, material('pencil-' + col, col), P)
    # desk lamp: base, two arms, the shade
    lampm = material('lamp-shade')
    bx, by = 1.0, D - 0.2
    C('lamp-base', bx, by, 0.075, top, top + 0.025, lampm)
    tube('lamp-arm1', [(bx, by, top + 0.02), (bx + 0.02, by + 0.02, 1.14)], 0.009, lampm, P)
    tube('lamp-arm2', [(bx + 0.02, by + 0.02, 1.14), LAMP_HEAD], 0.009, lampm, P)
    axis = Vector(LAMP_AXIS).normalized()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.08, radius2=0.026, depth=0.14)
    shade = mesh_obj('lamp-shade', bm, lampm, P, smooth=True)
    shade.matrix_world = Matrix.Translation(Vector(LAMP_HEAD) + axis * 0.07) @ axis.to_track_quat('-Z', 'Y').to_matrix().to_4x4()
    shade.modifiers.new('thick', 'SOLIDIFY').thickness = 0.003
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.024, location=Vector(LAMP_HEAD) + axis * 0.11)
    b = _put(bpy.context.active_object); b.name = 'lamp-bulb'
    b.data.materials.append(material('bulb', '#FFF1CF', emit=0.0))
    # lamp cable behind the desk to the outlet
    smooth_tube('lamp-cable', [(bx - 0.03, by + 0.12, top), (bx, D - 0.04, 0.4), (1.3, D - 0.03, 0.01), (2.45, D - 0.03, 0.01), (2.66, D - 0.01, 0.28)], 0.005, material('cable', '#2B1C14'), P)
    B('outlet', 2.61, 2.72, D - 0.008, D, 0.26, 0.37, material('plate', 'ivory'), bev=0.002)


def chair():
    """Pulled out from the desk and turned aside, as if someone just got up: it leaves the
    monitor and the drawers in sight."""
    wood = material('chair', 'cherry')
    x0, x1, seat, leg = 1.33, 1.79, 0.46, 0.035
    y1 = DESK['y0'] - 0.1
    y0 = y1 - 0.45
    before = set(P.objects)
    for x in (x0, x1 - leg):
        B(f'chair-leg-b{x}', x, x + leg, y1 - leg, y1, 0, seat - 0.03, wood)
        B(f'chair-post{x}', x, x + leg, y0, y0 + leg, 0, 0.93, wood)
    B('chair-seat', x0, x1, y0, y1, seat - 0.035, seat, wood, bev=0.006)
    B('chair-rail-top', x0 - 0.01, x1 + 0.01, y0 - 0.004, y0 + 0.03, 0.82, 0.9, wood, bev=0.008)
    B('chair-rail-mid', x0 + leg, x1 - leg, y0 + 0.005, y0 + 0.025, 0.62, 0.655, wood)
    B('chair-stretcher', x0 + 0.01, x1 - 0.01, y0 + 0.01, y0 + 0.03, 0.12, 0.145, wood)
    cardigan(x0, x1, y0)
    # turn the whole chair about its seat's centre, then slide it left and back from the desk
    pivot = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    parts = set(P.objects) - before
    rig = bpy.data.objects.new('chair-rig', None)
    P.objects.link(rig)
    for ob in parts:
        ob.parent = rig
        ob.matrix_parent_inverse = Matrix.Translation(-pivot)
    rig.location = pivot + Vector((-0.42, -0.22, 0))
    rig.rotation_euler.z = math.radians(-32)



def cardigan(x0, x1, y0):
    """Knitted cardigan over the top rail: a hanging cloth with folds and a longer sleeve."""
    knit = stripes_material('cardigan', 'mustard', '#B38331', 260, 'X', hatch=0.3, width=0.62)
    bm = bmesh.new()
    cols, rows = 26, 18
    grid = []
    for j in range(rows + 1):
        row = []
        v = j / rows
        z = 0.915 - v * 0.48
        for i in range(cols + 1):
            u = i / cols
            x = x0 - 0.035 + u * (x1 - x0 + 0.07)
            fold = 0.014 * math.sin(u * math.pi * 6 + 0.6) * (0.3 + v)
            hem = 0.06 * math.sin(u * math.pi * 2.3) * v
            row.append(bm.verts.new((x, y0 - 0.012 - fold - 0.01 * v, z + hem * 0.4)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    ob = mesh_obj('cardigan', bm, knit, P, smooth=True)
    ob.modifiers.new('thick', 'SOLIDIFY').thickness = 0.006
    # a sleeve hanging lower on one side
    smooth_tube('cardigan-sleeve', [(x0 + 0.02, y0 - 0.03, 0.88), (x0 - 0.02, y0 - 0.05, 0.6), (x0 + 0.01, y0 - 0.06, 0.4), (x0 + 0.03, y0 - 0.05, 0.33)], 0.034, knit, P)


def chalkboard():
    """The big board above the desk: dark slate in a pine frame, chalk dust, a ledge with chalk
    and an eraser. The island's notes and the GitHub streak are chalked on it live
    (OVERLAYS['chalk']; wallpaper/src/widgets.js chalkBoard)."""
    y = D
    x0, x1, z0, z1, fr = 0.5, 2.2, 1.4, 2.3, 0.045  # slate 1.61 x 0.81 m (textures.js slate())
    pine = material('board-frame', 'pine')
    for name, (a, b, c, d) in [('board-top', (x0, x1, z1 - fr, z1)), ('board-bottom', (x0, x1, z0, z0 + fr)),
                               ('board-left', (x0, x0 + fr, z0 + fr, z1 - fr)), ('board-right', (x1 - fr, x1, z0 + fr, z1 - fr))]:
        B(name, a, b, y - 0.034, y, c, d, pine, bev=0.005)
    plane('slate', [(x0 + fr, y - 0.018, z0 + fr), (x1 - fr, y - 0.018, z0 + fr), (x1 - fr, y - 0.018, z1 - fr), (x0 + fr, y - 0.018, z1 - fr)],
          material('slate', tex='slate.png', hatch=0), P)
    OVERLAYS['chalk'] = [(x0 + fr, y - 0.0185, z1 - fr), (x1 - fr, y - 0.0185, z1 - fr), (x1 - fr, y - 0.0185, z0 + fr), (x0 + fr, y - 0.0185, z0 + fr)]
    MASKED['chalk'] = ['slate']
    B('board-ledge', x0 + 0.03, x1 - 0.03, y - 0.08, y - 0.034, z0 - 0.004, z0 + 0.014, pine, bev=0.004)
    chalk = material('chalk')
    for i, (cx, ln, a) in enumerate([(0.74, 0.075, 4), (0.85, 0.05, -9), (0.92, 0.032, 20)]):
        d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0)) * ln / 2
        c = Vector((cx, y - 0.058, z0 + 0.0205))
        tube(f'chalk{i}', [tuple(c - d), tuple(c + d)], 0.0065, chalk, P)
    B('eraser-felt', 1.86, 2.0, y - 0.074, y - 0.042, z0 + 0.014, z0 + 0.034, material('eraser-felt', '#4A3A30'), bev=0.003)
    B('eraser-back', 1.86, 2.0, y - 0.074, y - 0.042, z0 + 0.034, z0 + 0.058, material('eraser-wood', 'light-wood'), bev=0.005)


def calendar():
    """Tear-off calendar on a nail: a printed band, the date printed live (OVERLAYS['calendar'])."""
    y = D
    x0, x1, z0, z1 = 2.33, 2.73, 1.48, 2.08
    B('calendar', x0, x1, y - 0.012, y, z0, z1, tex_material('calendar-card', 'calendar.png'), bev=0.002)
    OVERLAYS['calendar'] = [(x0, y - 0.0125, z1), (x1, y - 0.0125, z1), (x1, y - 0.0125, z0), (x0, y - 0.0125, z0)]
    for i in range(1, 3):
        B(f'calendar-page{i}', x0 + 0.005, x1 - 0.005, y - 0.0115 + i * 0.002, y, z0 - i * 0.007, z0 + 0.45, material('page', 'paper-aged'), bev=0)
    tube('calendar-string', [(x0 + 0.08, y - 0.01, z1), ((x0 + x1) / 2, y - 0.012, z1 + 0.11), (x1 - 0.08, y - 0.01, z1)], 0.0015, material('cable'), P)


def battery_panel():
    """Battery dials on a board on the wall at the desk's right end: the Mac, the phone, the
    earbuds and one more. Needles, numbers and names are printed live (OVERLAYS['gauges']); a
    cable runs down to the outlet, as if the board were wired in."""
    y = D
    x0, x1, z0, z1 = 1.98, 2.82, 0.93, 1.29
    B('gauge-board', x0, x1, y - 0.024, y, z0, z1, material('gauge-board', 'cherry'), bev=0.006)
    i = 0.018  # face 0.804 x 0.324 m (textures.js gauges())
    plane('gauge-faces', [(x0 + i, y - 0.025, z0 + i), (x1 - i, y - 0.025, z0 + i), (x1 - i, y - 0.025, z1 - i), (x0 + i, y - 0.025, z1 - i)],
          tex_material('gauge-face', 'gauges.png'), P)
    OVERLAYS['gauges'] = [(x0 + i, y - 0.0255, z1 - i), (x1 - i, y - 0.0255, z1 - i), (x1 - i, y - 0.0255, z0 + i), (x0 + i, y - 0.0255, z0 + i)]
    MASKED['gauges'] = ['gauge-faces']
    brass = material('brass')
    w = (x1 - x0 - 2 * i) / 4
    for k in range(4):
        cx = x0 + i + (k + 0.5) * w
        cz = z0 + i + (z1 - z0 - 2 * i) * 0.58
        bpy.ops.mesh.primitive_torus_add(major_radius=0.088, minor_radius=0.0055, major_segments=44, minor_segments=8,
                                         location=(cx, y - 0.028, cz), rotation=(math.radians(90), 0, 0))
        _put(bpy.context.active_object).data.materials.append(brass)
    for sx in (x0 + 0.012, x1 - 0.012):
        for sz in (z0 + 0.012, z1 - 0.012):
            sc = C(f'gauge-screw{sx:.2f}{sz:.2f}', 0, 0, 0.005, -0.002, 0.002, brass, bev=0)
            sc.rotation_euler.x = math.radians(90)
            sc.location = (sx, y - 0.026, sz)
    smooth_tube('gauge-cable', [(x1 - 0.05, y - 0.012, z0 + 0.01), (x1 - 0.08, y - 0.01, 0.65), (2.68, y - 0.01, 0.42), (2.67, y - 0.009, 0.37)], 0.004, material('cable'), P)


def record_cabinet():
    """A low cabinet of records on the right, under the photo shelves. On top: the record player
    and, on a small stand against the wall, the sleeve of what is playing (OVERLAYS['sleeve'])."""
    wood = material('cabinet', 'light-wood')
    x0, x1, y0, y1, h = 2.95, 3.9, D - 0.42, D - 0.01, 0.62
    mid = (x0 + x1) / 2
    B('cab-top', x0, x1, y0, y1, h - 0.03, h, wood, bev=0.005)
    B('cab-bottom', x0, x1, y0, y1, 0.06, 0.09, wood, bev=0.003)
    B('cab-plinth', x0 + 0.03, x1 - 0.03, y0 + 0.03, y1, 0, 0.06, material('cab-plinth', 'dark-wood'), bev=0.003)
    for name, (a, b) in [('cab-left', (x0, x0 + 0.03)), ('cab-mid', (mid - 0.015, mid + 0.015)), ('cab-right', (x1 - 0.03, x1))]:
        B(name, a, b, y0, y1, 0.06, h - 0.03, wood, bev=0.003)
    B('cab-back', x0 + 0.03, x1 - 0.03, y1 - 0.012, y1, 0.09, h - 0.03, material('cab-back', '#4A2A1E'), bev=0)
    cols = ['navy', 'muted-red', 'mustard', 'teal', 'cream', 'olive', 'ink', 'pale-blue']
    r = rng(17)
    for half, (a, b) in enumerate([(x0 + 0.03, mid - 0.015), (mid + 0.015, x1 - 0.03)]):
        x, k = a + 0.008, 0
        while x < b - 0.012:
            t = 0.006 + r.random() * 0.004
            hh = 0.31 + r.random() * 0.02 if r.random() < 0.85 else 0.27
            col = cols[(k + half * 3) % len(cols)]
            B(f'lp{half}-{k}', x, x + t, y0 + 0.04, y0 + 0.36, 0.09, 0.09 + hh, material('lp-' + col, col), bev=0.001)
            x += t + 0.0015
            k += 1
    # the record player
    B('turntable', 3.0, 3.42, y0 + 0.05, y0 + 0.37, h, h + 0.09, material('turntable', 'cherry'), bev=0.008)
    C('platter', 3.19, y0 + 0.21, 0.135, h + 0.09, h + 0.105, material('platter', '#3A3A3A'))
    C('record', 3.19, y0 + 0.21, 0.13, h + 0.105, h + 0.11, material('lp-disc', '#1E1A18'), bev=0)
    C('record-label', 3.19, y0 + 0.21, 0.04, h + 0.11, h + 0.112, material('lp-label', 'muted-red'), bev=0)
    arm = material('tonearm', 'ivory')
    C('tonearm-base', 3.37, y0 + 0.33, 0.02, h + 0.09, h + 0.13, arm)
    tube('tonearm', [(3.37, y0 + 0.33, h + 0.13), (3.36, y0 + 0.14, h + 0.125), (3.29, y0 + 0.12, h + 0.118)], 0.006, arm, P)
    # the now-playing sleeve on its stand, leaning on the wall
    B('sleeve-lip', 3.47, 3.87, D - 0.16, D - 0.1, h, h + 0.025, wood, bev=0.003)
    s0, s1 = Vector((3.5, D - 0.125, h + 0.012)), Vector((3.84, D - 0.125, h + 0.012))
    t1, t0 = Vector((3.84, D - 0.035, h + 0.34)), Vector((3.5, D - 0.035, h + 0.34))
    plane('sleeve', [s0, s1, t1, t0], tex_material('sleeve', 'sleeve.png'), P)
    OVERLAYS['sleeve'] = [tuple(v) for v in (t0, t1, s1, s0)]  # top-left, top-right, bottom-right, bottom-left


# the five frames on the photo shelves, in the island's order (Rak foto: 1 … 5)
FRAMES = [  # shelf, centre x, width, height, frame colour
    (0, 3.37, 0.27, 0.35, 'cherry'), (0, 3.7, 0.33, 0.25, 'light-wood'),
    (1, 3.48, 0.25, 0.33, 'mustard'), (1, 3.76, 0.22, 0.22, 'ivory'),
    (2, 3.2, 0.33, 0.25, 'dark-wood'),
]
SHELF_Z = (1.1, 1.6, 2.1)


def picture_frame(i, cx, z, w, h, colour, lean=7.0):
    """A framed picture standing on a shelf, leaning back on the wall. The picture is printed
    live (OVERLAYS[f'photo{i}']): the island's Rak foto, or a drawing until one is chosen."""
    a = math.radians(-lean)  # about x: negative tips the top back toward the wall
    yb = D - h * math.sin(-a) - 0.012
    M = Matrix.Translation((cx, yb, z)) @ Matrix.Rotation(a, 4, 'X')
    fr = box(f'frame{i}', -w / 2, w / 2, -0.009, 0.009, 0, h, material('frame-' + colour, colour), P, bev=0.003)
    fr.matrix_world = M
    b = 0.022
    corners = [M @ Vector(p) for p in ((-w / 2 + b, -0.0102, b), (w / 2 - b, -0.0102, b), (w / 2 - b, -0.0102, h - b), (-w / 2 + b, -0.0102, h - b))]
    plane(f'photo{i}', [tuple(c) for c in corners], material('photo-paper', 'paper'), P)
    lift = M @ Vector((0, -0.0005, 0)) - M @ Vector((0, 0, 0))
    OVERLAYS[f'photo{i}'] = [tuple(corners[k] + lift) for k in (3, 2, 1, 0)]
    MASKED[f'photo{i}'] = [f'photo{i}']


def photo_shelves():
    """Three floating shelves above the record cabinet: the five frames, and between them a
    trailing pothos, a few books with a ceramic cat on top, a candle, and the toy traffic light."""
    wood = material('shelf-wood')
    x0, x1 = 2.96, 3.9
    for i, z in enumerate(SHELF_Z):
        B(f'wall-shelf{i}', x0, x1, D - 0.22, D, z - 0.03, z, wood, bev=0.004)
        for bx in (x0 + 0.07, x1 - 0.07):
            B(f'bracket{i}-{bx:.2f}', bx - 0.01, bx + 0.01, D - 0.16, D, z - 0.11, z - 0.03, material('bracket', 'dark-wood'), bev=0.002)
    for i, (s, cx, w, h, col) in enumerate(FRAMES):
        picture_frame(i, cx, SHELF_Z[s], w, h, col)
    # bottom shelf: the pothos, its vines over the edge toward the turntable
    pothos_pot(3.08, D - 0.1, SHELF_Z[0], drops=(0.12, 0.2, 0.28))
    # middle shelf: books lying down, a ceramic cat on them
    z = SHELF_Z[1]
    for k, (col, hh, rz) in enumerate([('teal', 0.032, -4), ('cream', 0.026, 3), ('muted-red', 0.03, -2)]):
        ob = LB(f'shelfbook{k}', 0.2 - k * 0.015, 0.15, hh, material('cover-' + col, col), (3.12, D - 0.1, z), rz=math.radians(rz), bev=0.002)
        faces_material(ob, [ob.data.materials[0], material('paper')], lambda n: 1 if abs(n.y) > 0.5 else 0)
        z += hh
    ceramic_cat(3.12, D - 0.1, z)
    # top shelf: the traffic light and a candle
    signal(3.53, D - 0.1, SHELF_Z[2], s=1.1)
    jar = material('jar', '#A9BDB8')
    C('candle-jar', 3.79, D - 0.1, 0.038, SHELF_Z[2], SHELF_Z[2] + 0.1, jar, cap=False)
    C('candle', 3.79, D - 0.1, 0.033, SHELF_Z[2], SHELF_Z[2] + 0.065, material('wax', 'cream'))
    tube('wick', [(3.79, D - 0.1, SHELF_Z[2] + 0.065), (3.792, D - 0.1, SHELF_Z[2] + 0.08)], 0.0025, material('cable'), P)


def ceramic_cat(x, y, z):
    """A small glazed cat sitting on the books: Maestro as an ornament."""
    glaze, ear = material('glaze', 'cream'), material('glaze-ear', 'mustard')
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, segments=24, ring_count=12, location=(x, y, z + 0.042))
    body = _put(bpy.context.active_object); body.name = 'cat-body'; body.scale = (0.9, 0.8, 1.0)
    body.data.materials.append(glaze)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.034, segments=24, ring_count=12, location=(x, y - 0.006, z + 0.108))
    head = _put(bpy.context.active_object); head.name = 'cat-head'
    head.data.materials.append(glaze)
    for ob in (body, head):
        for p in ob.data.polygons:
            p.use_smooth = True
    for side in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.013, radius2=0.0, depth=0.026)
        e = mesh_obj(f'cat-ear{side}', bm, ear, P)
        e.location = (x + side * 0.018, y - 0.006, z + 0.143)
        e.rotation_euler.y = side * math.radians(18)
    smooth_tube('cat-tail', [(x + 0.03, y + 0.02, z + 0.012), (x + 0.06, y - 0.01, z + 0.02), (x + 0.05, y - 0.04, z + 0.05)], 0.008, glaze, P)


def pothos_pot(x, y, z, drops=(0.18, 0.28, 0.38), col='terracotta'):
    """A small pot with pothos vines trailing over the front edge, heart leaves along them."""
    C(f'pothos-pot{x:.2f}', x, y, 0.045, z, z + 0.09, material('pot-' + col, col), r_top=0.055)
    C(f'pothos-soil{x:.2f}', x, y, 0.05, z + 0.078, z + 0.084, material('soil', '#3A2418'), bev=0)
    leafm = material('leaf')
    r = rng(int(x * 100))
    edge = D - 0.225
    for k, drop in enumerate(drops):
        dx = (k - 1) * 0.035
        pts = [Vector((x + dx * 0.5, y, z + 0.085)), Vector((x + dx, y - 0.06, z + 0.07)), Vector((x + dx * 1.3, edge, z + 0.01)),
               Vector((x + dx * 1.6, edge - 0.01, z - drop * 0.4)), Vector((x + dx * 1.8, edge - 0.005, z - drop * 0.75)), Vector((x + dx * 2.1, edge - 0.01, z - drop))]
        smooth_tube(f'vine{x:.2f}-{k}', [tuple(p) for p in pts], 0.0022, leafm, P)
        for j in range(1, len(pts)):
            p = pts[j - 1].lerp(pts[j], 0.6)
            along = (pts[j] - pts[j - 1]).normalized()
            side = 1 if (j + k) % 2 else -1
            up = (along.cross(Vector((0, 1, 0))) * side * 0.8 + Vector((0, 0, -0.45)) + Vector((0, -0.3, 0))).normalized()
            lf = leaf_mesh(f'pleaf{x:.2f}-{k}-{j}', 0.052 + r.random() * 0.012, 0.034, heart=True, mat=leafm)
            place(lf, p, Vector((0, -1, 0.3)), up)


def signal(x, y, top, s=1.0):
    """A toy traffic light. How hard the Mac is working lights one lens (green, amber, red) live,
    through OVERLAYS['signal'] (the housing's front: 120 x 270 mm at s = 1)."""
    body = material('metal-paint')
    B('signal-base', x - 0.055 * s, x + 0.055 * s, y - 0.05 * s, y + 0.05 * s, top, top + 0.02 * s, material('signal-base', 'dark-wood'), bev=0.005)
    C('signal-pole', x, y, 0.011 * s, top + 0.02 * s, top + 0.1 * s, material('signal-pole', 'dark-wood'), bev=0.002)
    w, z0, z1, front = 0.06 * s, top + 0.1 * s, top + 0.37 * s, y - 0.035 * s
    B('signal-body', x - w, x + w, front, y + 0.035 * s, z0, z1, body, bev=0.01)
    lenses = []
    for i, (dz, col) in enumerate([(0.047, 'lens-red'), (0.135, 'lens-amber'), (0.223, 'lens-green')]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.034 * s, radius2=0.034 * s, depth=0.008)
        lens = mesh_obj(f'signal-lens{i}', bm, material(col, col), P, smooth=True)
        lens.rotation_euler.x = math.radians(90)
        lens.location = (x, front - 0.003, z1 - dz * s)
        lenses.append(lens.name)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.04 * s, radius2=0.04 * s, depth=0.035 * s)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.012 * s], context='VERTS')
        visor = mesh_obj(f'signal-visor{i}', bm, body, P, smooth=True)
        visor.modifiers.new('thick', 'SOLIDIFY').thickness = 0.004
        visor.rotation_euler.x = math.radians(90)
        visor.location = (x, front - 0.02 * s, z1 - dz * s)
    OVERLAYS['signal'] = [(x - w, front - 0.008, z1), (x + w, front - 0.008, z1), (x + w, front - 0.008, z0), (x - w, front - 0.008, z0)]
    MASKED['signal'] = lenses


def monstera():
    """In the corner by the window, kept below the chalkboard."""
    pot = material('pot')
    px, py = 0.34, D - 0.42
    C('monstera-saucer', px, py, 0.21, 0, 0.03, pot)
    C('monstera-pot', px, py, 0.16, 0.03, 0.38, pot, r_top=0.19)
    C('monstera-soil', px, py, 0.175, 0.34, 0.35, material('soil', '#3A2418'), bev=0)
    leafm = material('leaf')
    # saturated greens: in the afternoon beam a muted leaf read as dry paper
    leafm = material('monstera-leaf', '#3E7A2C')
    dark = material('leaf-dark', '#2C5E24')
    r = rng(12)
    base = Vector((px, py, 0.37))
    for i in range(9):
        a = -1.25 + (i / 8) * 2.4 + r.uniform(-0.12, 0.12)
        up = 0.28 + r.random() * 0.42
        reach = 0.18 + r.random() * 0.1
        end = base + Vector((math.sin(a) * reach + 0.06, -math.cos(a) * reach * 0.6 - 0.05, up))
        smooth_tube(f'stem{i}', [base, base + Vector((math.sin(a) * 0.06, -0.02, up * 0.55)), end], 0.011, leafm, P)
        lf = leaf_mesh(f'monstera-leaf{i}', 0.3 + r.random() * 0.08, 0.16 + r.random() * 0.035, slits=True, mat=dark if i % 3 == 0 else leafm)
        direction = Vector((math.sin(a) * 0.7 + 0.15, -0.55, -0.25 - r.random() * 0.4)).normalized()
        place(lf, end, Vector((0.15, -0.65, 0.75)), direction)


def sill_plants():
    """Three pots on the sill: an echeveria rosette, a snake plant, a pothos trailing over the edge."""
    z0 = WIN['z0']
    x = -0.06
    ya, ym, yb = WIN['y0'] + 0.33, (WIN['y0'] + WIN['y1']) / 2, WIN['y1'] - 0.34
    soil = material('soil', '#3A2418')
    for col, y, r_, h in [('terracotta', ya, 0.05, 0.075), ('ivory', ym, 0.055, 0.085), ('teal', yb, 0.05, 0.07)]:
        C(f'sillpot{y:.2f}', x, y, r_ * 0.82, z0, z0 + h, material('pot-' + col, col), r_top=r_)
        C(f'sillsoil{y:.2f}', x, y, r_ * 0.93, z0 + h - 0.014, z0 + h - 0.008, soil, bev=0)
    r = rng(5)
    top = Vector((x, ya, z0 + 0.072))
    z = Vector((0, 0, 1))
    rings = [(11, 0.07, 0.032, 18, 0.014, 'olive'), (9, 0.058, 0.028, 40, 0.009, 'olive'), (7, 0.044, 0.023, 62, 0.004, 'plant-green')]
    for ring, (n, length, width, tilt, off, col) in enumerate(rings):
        for i in range(n):
            a = (i + ring * 0.5) / n * math.pi * 2
            out = Vector((math.cos(a), math.sin(a), 0))
            t = math.radians(tilt)
            up = out * math.cos(t) + z * math.sin(t)
            face = z * math.cos(t) - out * math.sin(t)
            lf = leaf_mesh(f'echeveria{ring}-{i}', length, width, heart=False, mat=material('succulent-' + col, col))
            place(lf, top + out * off + z * 0.004 * ring, face, up)
    blade = stripes_material('snake-leaf', 'plant-green', 'olive', 70, 'Z', width=0.58)
    for i in range(6):
        a = i / 6 * math.pi * 2 + r.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        base = Vector((x, ym, z0 + 0.075)) + out * 0.018
        lf = leaf_mesh(f'snake{i}', 0.2 + r.random() * 0.1, 0.017, heart=False, mat=blade)
        place(lf, base, out.cross(z) * (1 if i % 2 else -1) + out * 0.3, z + out * r.uniform(0.08, 0.2))
    leafm = material('leaf')
    for k, dy in enumerate((-0.035, 0.0, 0.03)):
        drop = 0.18 + k * 0.1
        pts = [Vector((x + 0.02, yb + dy * 0.5, z0 + 0.07)), Vector((0.02, yb + dy, z0 + 0.06)),
               Vector((0.075, yb + dy * 1.4, z0 + 0.005)), Vector((0.085, yb + dy * 1.8, z0 - 0.06 - drop * 0.3)),
               Vector((0.082, yb + dy * 2.2, z0 - drop * 0.75)), Vector((0.086, yb + dy * 2.6, z0 - drop))]
        smooth_tube(f'pothos-vine{k}', [tuple(p) for p in pts], 0.0022, leafm, P)
        for j in range(1, len(pts)):
            p = pts[j - 1].lerp(pts[j], 0.6)
            along = (pts[j] - pts[j - 1]).normalized()
            side = 1 if (j + k) % 2 else -1
            up = (along.cross(Vector((1, 0, 0))) * side * 0.8 + Vector((0, 0, -0.45)) + Vector((0.3, 0, 0))).normalized()
            lf = leaf_mesh(f'pothos{k}-{j}', 0.058 + r.random() * 0.014, 0.038, heart=True, mat=leafm)
            place(lf, p, Vector((1, -0.35, 0.25)), up)


def curtains():
    gm = gingham_material()
    x = 0.11
    z_top, z_tie, z_bot = 2.38, 1.18, 0.03
    y0, y1 = WIN['y0'], WIN['y1']
    panels = [((y0 - 0.39, y0 + 0.07), (y0 - 0.25, y0 - 0.09), (y0 - 0.33, y0 - 0.01)),
              ((y1 - 0.07, y1 + 0.42), (y1 + 0.06, y1 + 0.24), (y1 - 0.02, y1 + 0.34))]
    for pi_, (top, tie, bot) in enumerate(panels):
        bm = bmesh.new()
        cols, rows = 24, 40
        grid = []
        for j in range(rows + 1):
            v = j / rows
            z = z_top + (z_bot - z_top) * v
            # width shrinks toward the tie, then flares again
            if z >= z_tie:
                t = (z_top - z) / (z_top - z_tie)
                a, b = top[0] + (tie[0] - top[0]) * t, top[1] + (tie[1] - top[1]) * t
                amp = 0.04 * (1 - t) + 0.012
            else:
                t = (z_tie - z) / (z_tie - z_bot)
                a, b = tie[0] + (bot[0] - tie[0]) * t, tie[1] + (bot[1] - tie[1]) * t
                amp = 0.012 + 0.03 * t
            row = []
            for i in range(cols + 1):
                u = i / cols
                yy = a + (b - a) * u
                row.append(bm.verts.new((x + amp * math.sin(u * math.pi * 7), yy, z)))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        ob = mesh_obj(f'curtain{pi_}', bm, gm, P, smooth=True)
        ob.modifiers.new('thick', 'SOLIDIFY').thickness = 0.008
        B(f'tieback{pi_}', x - 0.03, x + 0.04, tie[0] - 0.015, tie[1] + 0.015, z_tie - 0.035, z_tie + 0.035, material('tieback', 'muted-red'), bev=0.008)
    rod = material('rod', 'cherry')
    ra, rb = y0 - 0.53, y1 + 0.56
    tube('curtain-rod', [(x, ra, z_top + 0.03), (x, rb, z_top + 0.03)], 0.012, rod, P)
    for yy in (ra, rb):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026, location=(x, yy, z_top + 0.03))
        _put(bpy.context.active_object).data.materials.append(rod)


def rug():
    x0, x1, y0, y1 = 0.85, 3.15, 1.75, 3.0
    plane('rug', [(x0, y0, 0.004), (x1, y0, 0.004), (x1, y1, 0.004), (x0, y1, 0.004)], material('rug', 'navy', tex='rug.png', hatch=TOKENS['materials']['rug']['hatch']), P)
    fringe = material('fringe', 'cream')
    r = rng(4)
    for xe, s in ((x0, -1), (x1, 1)):
        for k in range(int((y1 - y0) / 0.053)):
            y = y0 + 0.03 + k * 0.053
            f = tube(f'fringe{xe}-{k}', [(xe, y, 0.003), (xe + s * (0.05 + r.random() * 0.03), y + (r.random() - 0.5) * 0.02, 0.003)], 0.0035, fringe, P)
            collection('NoInk').objects.link(f)


def cat_bed():
    """Maestro's bed on the rug, by the cabinet, with a yarn ball."""
    bed = material('bedding')
    cx, cy = 2.72, 2.72
    prof = [(0.31, 0.0), (0.315, 0.06), (0.3, 0.12), (0.27, 0.135), (0.24, 0.125), (0.215, 0.08), (0.205, 0.05)]
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in prof]
    edges = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + edges, cent=(0, 0, 0), axis=(0, 0, 1), steps=48, angle=math.radians(360), use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    ob = mesh_obj('catbed', bm, bed, P, smooth=True)
    ob.location = (cx, cy, 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.21, location=(cx, cy, 0.05))
    cush = _put(bpy.context.active_object); cush.scale = (1, 1, 0.26)
    cush.data.materials.append(material('cushion', 'cream'))
    for p in cush.data.polygons:
        p.use_smooth = True
    yx, yy = cx - 0.42, cy - 0.12
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(yx, yy, 0.055))
    yb = _put(bpy.context.active_object); yb.data.materials.append(material('yarn', 'mustard'))
    for k in range(3):
        a = k * 1.1
        pts = [(yx + math.cos(t) * 0.056 * math.cos(a), yy + math.sin(t) * 0.056, 0.055 + math.cos(t) * 0.056 * math.sin(a)) for t in [i / 10 * math.pi * 2 for i in range(11)]]
        collection('NoInk').objects.link(tube(f'yarnloop{k}', pts, 0.0025, material('yarn-ink', '#8F6516'), P))
    smooth_tube('thread', [(yx + 0.04, yy - 0.02, 0.01), (yx + 0.12, yy - 0.1, 0.003), (yx + 0.24, yy - 0.04, 0.003), (yx + 0.37, yy - 0.15, 0.003)], 0.0025, material('yarn'), P)


def build_props():
    global P
    P = collection('Props')
    desk(); desk_items(); chair(); chalkboard(); calendar(); battery_panel()
    record_cabinet(); photo_shelves(); monstera(); sill_plants(); curtains(); rug(); cat_bed()
