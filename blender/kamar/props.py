"""Furniture and everything that makes the room lived in.

Layout follows the v1 room (wallpaper/src/*.js); v1 coords (X, Y up, Z depth) map to (x, y, z) = (X, Z, Y).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from .core import (ROOM_W, ROOM_D as D, ROOM_H, WIN, TOKENS, box, cylinder, plane, tube, smooth_tube, material,
                   toon_group, color, hex_rgba, collection, rng, mesh_obj, bevel)

LAMP_HEAD = (1.36, 4.72, 1.3)
LAMP_AXIS = (0.1, 0.55, -0.83)  # onto the desk and washing the wall behind it
P = None  # the Props collection
OVERLAYS = {}  # world-space quads for the live layers: clock, calendar, sleeve and the widgets
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
def desk():
    wood = material('desk-wood')
    x0, x1, y0, y1, top, t = 0.95, 2.65, 4.5, D - 0.02, 0.76, 0.035
    B('desk-top', x0, x1, y0, y1, top - t, top, wood, bev=0.006)
    for (lx, ly) in [(x0 + 0.02, y0 + 0.02), (x0 + 0.02, y1 - 0.065)]:
        B(f'desk-leg{ly:.2f}', lx, lx + 0.045, ly, ly + 0.045, 0, top - t, wood)
    px0, px1 = x1 - 0.5, x1 - 0.03
    B('desk-pedestal', px0, px1, y0 + 0.02, y1, 0, top - t, wood)
    for (za, zb) in [(0.05, 0.33), (0.36, 0.68)]:
        B(f'drawer{za}', px0 + 0.025, px1 - 0.025, y0 + 0.012, y0 + 0.022, za, zb, wood, bev=0.003)
        B(f'handle{za}', (px0 + px1) / 2 - 0.05, (px0 + px1) / 2 + 0.05, y0 + 0.0, y0 + 0.013, (za + zb) / 2 + 0.05, (za + zb) / 2 + 0.065, material('handle', 'dark-wood'), bev=0.002)
    B('desk-apron', x0, px0, y0 + 0.03, y0 + 0.05, top - t - 0.08, top - t, wood)
    # bin under the desk, with crumpled paper
    C('bin', x0 + 0.32, y1 - 0.28, 0.13, 0, 0.3, material('bin', 'olive'), cap=False)
    C('bin-floor', x0 + 0.32, y1 - 0.28, 0.12, 0.0, 0.01, material('bin-in', '#3A2418'))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.06, location=(x0 + 0.28, y1 - 0.3, 0.3))
    _put(bpy.context.active_object).data.materials.append(material('paper'))


def desk_items():
    top = 0.76
    beige = material('plastic')
    # monitor: a beige CRT-ish box, a deep back, a stand, the screen
    B('monitor-stand', 1.66, 1.92, 4.86, 5.06, top, 0.79, beige)
    B('monitor-back', 1.58, 2.0, 4.95, 5.12, 0.83, 1.16, beige, bev=0.02)
    B('monitor', 1.5, 2.08, 4.76, 4.96, 0.79, 1.21, beige, bev=0.012)
    plane('screen', [(1.555, 4.757, 0.86), (2.025, 4.757, 0.86), (2.025, 4.757, 1.165), (1.555, 4.757, 1.165)], tex_material('screen', 'screen.png', emit=1.0), P)
    # Claude Code sessions with Remote Control are listed on it live
    OVERLAYS['screen'] = [(1.555, 4.7565, 1.165), (2.025, 4.7565, 1.165), (2.025, 4.7565, 0.86), (1.555, 4.7565, 0.86)]
    MASKED['screen'] = ['screen']
    B('monitor-note', 1.95, 2.06, 4.754, 4.757, 1.07, 1.18, material('note', '#E6C766'), bev=0)
    B('monitor-led', 2.0, 2.015, 4.754, 4.757, 0.815, 0.825, material('led', '#7FB069', emit=1.0), bev=0)
    # keyboard
    kb = B('keyboard', 1.54, 2.04, 4.56, 4.71, top, top + 0.025, keys_material(), bev=0.006)
    # paper and a notebook on the left
    sheet = B('paper-sheet', 1.18, 1.47, 4.56, 4.77, top, top + 0.003, material('paper'), bev=0)
    sheet.rotation_euler.z = math.radians(-6)
    B('notebook', 1.2, 1.44, 4.64, 4.82, top + 0.003, top + 0.018, material('notebook', 'teal'), bev=0.003).rotation_euler.z = math.radians(8)
    # mug with a red band and a handle
    C('mug', 2.27, 4.66, 0.042, top, top + 0.1, material('ceramic'))
    C('mug-band', 2.27, 4.66, 0.0425, top + 0.055, top + 0.072, material('mug-band', 'muted-red'), cap=False, bev=0)
    C('coffee', 2.27, 4.66, 0.036, top + 0.088, top + 0.092, material('coffee', '#4A2E22'), bev=0)
    smooth_tube('mug-handle', [(2.31, 4.66, top + 0.085), (2.345, 4.66, top + 0.08), (2.35, 4.66, top + 0.045), (2.31, 4.66, top + 0.03)], 0.007, material('ceramic'), P)
    # pencil cup and pencils
    C('pencil-cup', 2.48, 5.0, 0.036, top, top + 0.1, material('pot'))
    for i, (col, dx, lean) in enumerate([('mustard', -0.012, 0.05), ('teal', 0.01, -0.04), ('muted-red', 0.0, 0.02)]):
        tube(f'pencil{i}', [(2.48 + dx, 5.0, top + 0.06), (2.48 + dx + lean, 4.99, top + 0.2)], 0.004, material('pencil-' + col, col), P)
    # books stacked flat (fore-edges toward us: paper)
    z = top
    for i, (col, h) in enumerate([('navy', 0.04), ('mustard', 0.035), ('teal', 0.03), ('muted-red', 0.028)]):
        ob = B(f'deskbook{i}', 2.3 + i * 0.006, 2.6 - i * 0.008, 4.86 + i * 0.01, 5.12 - i * 0.004, z, z + h, material('cover-' + col, col), bev=0.002)
        faces_material(ob, [ob.data.materials[0], material('paper')], lambda n: 1 if n.y < -0.5 else 0)
        z += h
    # desk lamp: base, two arms, the shade
    lampm = material('lamp-shade')
    C('lamp-base', 1.08, 4.98, 0.075, top, top + 0.025, lampm)
    tube('lamp-arm1', [(1.08, 4.98, top + 0.02), (1.1, 5.0, 1.2)], 0.009, lampm, P)
    tube('lamp-arm2', [(1.1, 5.0, 1.2), LAMP_HEAD], 0.009, lampm, P)
    axis = Vector(LAMP_AXIS).normalized()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.08, radius2=0.026, depth=0.14)
    shade = mesh_obj('lamp-shade', bm, lampm, P, smooth=True)
    shade.matrix_world = Matrix.Translation(Vector(LAMP_HEAD) + axis * 0.07) @ axis.to_track_quat('-Z', 'Y').to_matrix().to_4x4()
    sol = shade.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.003
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.024, location=Vector(LAMP_HEAD) + axis * 0.11)
    b = _put(bpy.context.active_object); b.name = 'lamp-bulb'
    b.data.materials.append(material('bulb', '#FFF1CF', emit=0.0))
    # a small cactus by the lamp
    C('cactus-pot', 1.36, 4.62, 0.035, top, top + 0.06, material('pot'), r_top=0.035)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, location=(1.36, 4.62, top + 0.1))
    cac = _put(bpy.context.active_object); cac.scale = (1, 1, 1.9); cac.data.materials.append(material('leaf'))
    # lamp cable down to the outlet
    smooth_tube('lamp-cable', [(1.05, 5.12, top), (1.1, 5.16, 0.4), (1.3, 5.17, 0.01), (2.2, 5.17, 0.01), (2.8, 5.18, 0.01), (2.91, 5.19, 0.28)], 0.005, material('cable', '#2B1C14'), P)


def chair():
    wood = material('chair', 'cherry')
    x0, x1, y0, y1, seat, leg = 1.6, 2.06, 3.95, 4.4, 0.46, 0.035
    for x in (x0, x1 - leg):
        B(f'chair-leg-b{x}', x, x + leg, y1 - leg, y1, 0, seat - 0.03, wood)
        B(f'chair-post{x}', x, x + leg, y0, y0 + leg, 0, 0.93, wood)
    B('chair-seat', x0, x1, y0, y1, seat - 0.035, seat, wood, bev=0.006)
    B('chair-rail-top', x0 - 0.01, x1 + 0.01, y0 - 0.004, y0 + 0.03, 0.82, 0.9, wood, bev=0.008)
    B('chair-rail-mid', x0 + leg, x1 - leg, y0 + 0.005, y0 + 0.025, 0.62, 0.655, wood)
    B('chair-stretcher', x0 + 0.01, x1 - 0.01, y0 + 0.01, y0 + 0.03, 0.12, 0.145, wood)
    cardigan(x0, x1, y0)


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
    sol = ob.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.006
    # a sleeve hanging lower on one side
    smooth_tube('sleeve', [(x0 + 0.02, y0 - 0.03, 0.88), (x0 - 0.02, y0 - 0.05, 0.6), (x0 + 0.01, y0 - 0.06, 0.4), (x0 + 0.03, y0 - 0.05, 0.33)], 0.034, knit, P)


def shelf():
    wood = material('shelf-wood')
    x0, x1, y0, y1, h = 3.95, 5.28, 4.84, D - 0.01, 2.12
    boards = [0.09, 0.5, 0.91, 1.32, 1.72]
    B('shelf-side-l', x0, x0 + 0.03, y0, y1, 0, h, wood)
    B('shelf-side-r', x1 - 0.03, x1, y0, y1, 0, h, wood)
    B('shelf-top', x0, x1, y0 - 0.01, y1, h - 0.03, h, wood)
    B('shelf-plinth', x0, x1, y0, y0 + 0.02, 0, 0.07, wood)
    B('shelf-back', x0 + 0.03, x1 - 0.03, y1 - 0.012, y1, 0.07, h - 0.03, material('shelf-back', '#4A2A1E'), bev=0)
    for z in boards:
        B(f'board{z}', x0 + 0.03, x1 - 0.03, y0 + 0.008, y1 - 0.012, z - 0.022, z, wood)
    bookm = book_material()
    paper = material('paper')
    r = rng(314)
    n_book = [0]

    def book(x, w, z, h, depth=0.21, lean=0.0):
        ob = local_box(f'book{n_book[0]}', w, depth, h, bookm, bev=0.0025)
        n_book[0] += 1
        faces_material(ob, [bookm, paper], lambda n: 1 if n.z > 0.5 else 0)
        ob.location = (x, y0 + 0.03, z)
        ob.rotation_euler.y = -lean
        return ob

    def row(xa, xb, z, heights, gap_every=0, lean_end=False):
        x = xa
        k = 0
        while x < xb - 0.03:
            w = 0.024 + r.random() * 0.02
            h = r.choice(heights)
            if lean_end and x > xb - 0.12:
                book(x + 0.02, w, z, h, lean=math.radians(18))
                break
            book(x, w, z, h)
            x += w + 0.0015
            k += 1
            if gap_every and k % gap_every == 0:
                x += 0.035
        return x

    # bottom: records leaning on the left, then tall art books
    for i in range(7):
        ob = local_box(f'record{i}', 0.006, 0.31, 0.31, material(f'lp{i % 5}', ['navy', 'muted-red', 'mustard', 'teal', 'cream'][i % 5]), bev=0.001)
        ob.location = (x0 + 0.05 + i * 0.016, y0 + 0.03, 0.09)
        ob.rotation_euler.y = -math.radians(8 + i * 1.5)
    row(x0 + 0.32, x1 - 0.05, 0.09, [0.32, 0.34, 0.36])
    # middle shelves: tidy runs of novels, one deliberate stack, a radio, a photo
    end = row(x0 + 0.04, x1 - 0.32, 0.5, [0.22, 0.24, 0.26], lean_end=False)
    zz = 0.5
    for i, (col, hh) in enumerate([('olive', 0.035), ('cream', 0.03), ('navy', 0.04)]):
        ob = B(f'stack{i}', x1 - 0.27 + i * 0.004, x1 - 0.06 - i * 0.006, y0 + 0.04, y0 + 0.25, zz, zz + hh, material('cover-' + col, col), bev=0.002)
        faces_material(ob, [ob.data.materials[0], paper], lambda n: 1 if n.y < -0.5 else 0)
        zz += hh
    radio = B('radio', x0 + 0.06, x0 + 0.33, y0 + 0.05, y0 + 0.2, 0.91, 1.07, stripes_material('radio', 'teal', '#2F5560', 120, 'Z', width=0.7), bev=0.01)
    C('radio-knob', x0 + 0.28, y0 + 0.045, 0.02, 0.97, 1.0, material('knob', 'cream'))
    row(x0 + 0.37, x1 - 0.04, 0.91, [0.2, 0.22, 0.24], lean_end=True)
    B('frame', x0 + 0.05, x0 + 0.22, y0 + 0.07, y0 + 0.09, 1.32, 1.54, material('frame-wood', 'cherry'), bev=0.004)
    plane('photo', [(x0 + 0.07, y0 + 0.069, 1.345), (x0 + 0.2, y0 + 0.069, 1.345), (x0 + 0.2, y0 + 0.069, 1.515), (x0 + 0.07, y0 + 0.069, 1.515)], tex_material('photo', 'photo.png'), P)
    row(x0 + 0.27, x1 - 0.04, 1.32, [0.22, 0.25], gap_every=14)
    row(x0 + 0.04, x1 - 0.22, 1.72, [0.2, 0.22])
    B('box-top', x1 - 0.2, x1 - 0.05, y0 + 0.05, y0 + 0.26, 1.72, 1.86, material('box', 'cream'), bev=0.004)
    # top: two boxes and the pothos
    B('shoebox1', x1 - 0.5, x1 - 0.1, y0 + 0.03, y0 + 0.3, h, h + 0.13, material('shoebox', 'terracotta'), bev=0.004)
    B('shoebox2', x1 - 0.46, x1 - 0.14, y0 + 0.05, y0 + 0.28, h + 0.13, h + 0.22, material('shoebox2', 'cream'), bev=0.004)
    signal(x0 + 0.3, y0 + 0.15, h)


def signal(x, y, top):
    """A toy traffic light on top of the bookshelf. How hard the Mac is working lights one lens
    (green, amber, red) live, through OVERLAYS['signal']."""
    body = material('metal-paint')
    B('signal-base', x - 0.055, x + 0.055, y - 0.05, y + 0.05, top, top + 0.02, material('signal-base', 'dark-wood'), bev=0.005)
    C('signal-pole', x, y, 0.011, top + 0.02, top + 0.1, material('signal-pole', 'dark-wood'), bev=0.002)
    w, z0, z1, front = 0.06, top + 0.1, top + 0.37, y - 0.035
    B('signal-body', x - w, x + w, front, y + 0.035, z0, z1, body, bev=0.01)
    lenses = []
    for i, (z, col) in enumerate([(z1 - 0.047, 'lens-red'), (z1 - 0.135, 'lens-amber'), (z1 - 0.223, 'lens-green')]):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.034, radius2=0.034, depth=0.008)
        lens = mesh_obj(f'signal-lens{i}', bm, material(col, col), P, smooth=True)
        lens.rotation_euler.x = math.radians(90)
        lens.location = (x, front - 0.003, z)
        lenses.append(lens.name)
        # a visor over each lens
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.04, radius2=0.04, depth=0.035)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.012], context='VERTS')
        visor = mesh_obj(f'signal-visor{i}', bm, body, P, smooth=True)
        visor.modifiers.new('thick', 'SOLIDIFY').thickness = 0.004
        visor.rotation_euler.x = math.radians(90)
        visor.location = (x, front - 0.02, z)
    OVERLAYS['signal'] = [(x - w, front - 0.008, z1), (x + w, front - 0.008, z1), (x + w, front - 0.008, z0), (x - w, front - 0.008, z0)]
    MASKED['signal'] = lenses


def monstera():
    pot = material('pot')
    C('monstera-saucer', 0.4, 4.74, 0.21, 0, 0.03, pot)
    C('monstera-pot', 0.4, 4.74, 0.16, 0.03, 0.38, pot, r_top=0.19)
    C('monstera-soil', 0.4, 4.74, 0.175, 0.34, 0.35, material('soil', '#3A2418'), bev=0)
    leafm = material('leaf')
    dark = material('leaf-dark', '#4B5A30')
    r = rng(12)
    base = Vector((0.4, 4.74, 0.37))
    for i in range(10):
        a = -1.2 + (i / 9) * 2.5 + r.uniform(-0.12, 0.12)
        up = 0.4 + r.random() * 0.75
        reach = 0.22 + r.random() * 0.14
        end = base + Vector((math.sin(a) * reach + 0.08, -math.cos(a) * reach * 0.6 - 0.05, up))
        smooth_tube(f'stem{i}', [base, base + Vector((math.sin(a) * 0.06, -0.02, up * 0.55)), end], 0.011, leafm, P)
        lf = leaf_mesh(f'monstera-leaf{i}', 0.4 + r.random() * 0.12, 0.2 + r.random() * 0.05, slits=True, mat=dark if i % 3 == 0 else leafm)
        # leaves hang off the stem tip, turned out toward the room and tipped down
        direction = Vector((math.sin(a) * 0.7 + 0.15, -0.55, -0.15 - r.random() * 0.4)).normalized()
        normal = Vector((0.15, -0.65, 0.75))
        place(lf, end, normal, direction)


def sill_plants():
    """Three pots on the sill: an echeveria rosette, a snake plant, a pothos trailing over the edge."""
    z0 = WIN['z0']
    x = -0.06
    soil = material('soil', '#3A2418')
    pots = [('terracotta', 2.78, 0.05, 0.075), ('ivory', 3.22, 0.055, 0.085), ('teal', 3.66, 0.05, 0.07)]
    for col, y, r_, h in pots:
        C(f'sillpot{y}', x, y, r_ * 0.82, z0, z0 + h, material('pot-' + col, col), r_top=r_)
        C(f'sillsoil{y}', x, y, r_ * 0.93, z0 + h - 0.014, z0 + h - 0.008, soil, bev=0)
    r = rng(5)
    # echeveria: three rings of fleshy leaves, the inner ones short and upright
    top = Vector((x, 2.78, z0 + 0.072))
    z = Vector((0, 0, 1))
    rings = [(11, 0.07, 0.032, 18, 0.014, 'olive'), (9, 0.058, 0.028, 40, 0.009, 'olive'), (7, 0.044, 0.023, 62, 0.004, 'plant-green')]
    for ring, (n, length, width, tilt, off, col) in enumerate(rings):
        for i in range(n):
            a = (i + ring * 0.5) / n * math.pi * 2
            out = Vector((math.cos(a), math.sin(a), 0))
            t = math.radians(tilt)
            up = out * math.cos(t) + z * math.sin(t)
            face = z * math.cos(t) - out * math.sin(t)  # the leaf's upper side, turned in toward the heart
            lf = leaf_mesh(f'echeveria{ring}-{i}', length, width, heart=False, mat=material('succulent-' + col, col))
            place(lf, top + out * off + z * 0.004 * ring, face, up)
    # snake plant: banded blades standing almost straight up
    blade = stripes_material('snake-leaf', 'plant-green', 'olive', 70, 'Z', width=0.58)
    for i in range(6):
        a = i / 6 * math.pi * 2 + r.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        base = Vector((x, 3.22, z0 + 0.075)) + out * 0.018
        lean = r.uniform(0.08, 0.2)
        lf = leaf_mesh(f'snake{i}', 0.2 + r.random() * 0.1, 0.017, heart=False, mat=blade)
        place(lf, base, out.cross(Vector((0, 0, 1))) * (1 if i % 2 else -1) + out * 0.3, Vector((0, 0, 1)) + out * lean)
    # pothos: vines over the front of the sill and down the wall, heart leaves along them
    leafm = material('leaf')
    for k, dy in enumerate((-0.035, 0.0, 0.03)):
        drop = 0.18 + k * 0.1
        pts = [Vector((x + 0.02, 3.66 + dy * 0.5, z0 + 0.07)), Vector((0.02, 3.66 + dy, z0 + 0.06)),
               Vector((0.075, 3.66 + dy * 1.4, z0 + 0.005)), Vector((0.085, 3.66 + dy * 1.8, z0 - 0.06 - drop * 0.3)),
               Vector((0.082, 3.66 + dy * 2.2, z0 - drop * 0.75)), Vector((0.086, 3.66 + dy * 2.6, z0 - drop))]
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
    z_top, z_tie, z_bot = 2.44, 1.22, 0.03
    panels = [((2.06, 2.52), (2.2, 2.36), (2.12, 2.44)), ((3.93, 4.42), (4.06, 4.24), (3.98, 4.34))]
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
                y = a + (b - a) * u
                row.append(bm.verts.new((x + amp * math.sin(u * math.pi * 7), y, z)))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        ob = mesh_obj(f'curtain{pi_}', bm, gm, P, smooth=True)
        ob.modifiers.new('thick', 'SOLIDIFY').thickness = 0.008
        B(f'tieback{pi_}', x - 0.03, x + 0.04, tie[0] - 0.015, tie[1] + 0.015, z_tie - 0.035, z_tie + 0.035, material('tieback', 'muted-red'), bev=0.008)
    rod = material('rod', 'cherry')
    tube('curtain-rod', [(x, 1.92, 2.47), (x, 4.56, 2.47)], 0.012, rod, P)
    for y in (1.92, 4.56):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026, location=(x, y, 2.47))
        _put(bpy.context.active_object).data.materials.append(rod)


def rug():
    plane('rug', [(1.2, 2.05, 0.004), (3.95, 2.05, 0.004), (3.95, 3.9, 0.004), (1.2, 3.9, 0.004)], material('rug', 'navy', tex='rug.png', hatch=TOKENS['materials']['rug']['hatch']), P)
    fringe = material('fringe', 'cream')
    r = rng(4)
    for xe, s in ((1.2, -1), (3.95, 1)):
        for k in range(34):
            y = 2.08 + k * 0.053
            f = tube(f'fringe{xe}-{k}', [(xe, y, 0.003), (xe + s * (0.05 + r.random() * 0.03), y + (r.random() - 0.5) * 0.02, 0.003)], 0.0035, fringe, P)
            collection('NoInk').objects.link(f)


def cat_bed():
    bed = material('bedding')
    cx, cy = 2.95, 3.02
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
    # yarn ball with a loose thread, and a felt mouse
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(3.42, 2.7, 0.055))
    yb = _put(bpy.context.active_object); yb.data.materials.append(material('yarn', 'mustard'))
    for k in range(3):
        a = k * 1.1
        pts = [(3.42 + math.cos(t) * 0.056 * math.cos(a), 2.7 + math.sin(t) * 0.056, 0.055 + math.cos(t) * 0.056 * math.sin(a)) for t in [i / 10 * math.pi * 2 for i in range(11)]]
        collection('NoInk').objects.link(tube(f'yarnloop{k}', pts, 0.0025, material('yarn-ink', '#8F6516'), P))
    smooth_tube('thread', [(3.38, 2.68, 0.01), (3.3, 2.6, 0.003), (3.18, 2.66, 0.003), (3.05, 2.55, 0.003)], 0.0025, material('yarn'), P)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(2.6, 2.5, 0.02))
    mo = _put(bpy.context.active_object); mo.scale = (1.5, 0.8, 0.6); mo.data.materials.append(material('mouse', '#8C8478'))
    smooth_tube('mouse-tail', [(2.54, 2.51, 0.01), (2.5, 2.47, 0.004), (2.46, 2.5, 0.003)], 0.002, material('cable'), P)


def guitar():
    bottom, top = Vector((3.42, 4.98, 0.01)), Vector((3.22, D - 0.03, 1.02))
    up = (top - bottom).normalized()
    facing = Vector((-0.2, -1, 0.15)).normalized()
    def half(t):
        c1, r1, c2, r2 = 0.2, 0.19, 0.43, 0.145
        a = math.sqrt(max(0, r1 * r1 - (t - c1) ** 2)) if abs(t - c1) < r1 else 0
        b = math.sqrt(max(0, r2 * r2 - (t - c2) ** 2)) if abs(t - c2) < r2 else 0
        waist = 0.118 + 0.02 * math.cos((t - 0.325) / 0.075 * math.pi) if 0.25 < t < 0.4 else 0
        return max(a, b, waist)
    pts = []
    ts = [0.012 + i * 0.0094 for i in range(61)]
    pts = [(half(t), t) for t in ts] + [(-half(t), t) for t in reversed(ts)]
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, -0.09))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    body = mesh_obj('guitar-body', bm, material('guitar-top', 'pine'), P)
    bevel(body, 0.012, 2, 40)
    body.data.materials.append(material('guitar-side', 'cherry'))
    for p in body.data.polygons:
        p.material_index = 0 if p.normal.z > 0.5 else 1
    place(body, bottom, facing, up)
    def on(local):  # local (x across, y along, z out of the top) → world
        return body.matrix_world @ Vector(local)
    neck = box('guitar-neck', -0.024, 0.024, 0.55, 0.92, -0.035, 0.0, material('neck', 'dark-wood'), P, bev=0.004)
    head = box('guitar-head', -0.035, 0.035, 0.92, 1.05, -0.03, 0.0, material('neck'), P, bev=0.004)
    hole = cylinder('soundhole', 0, 0.39, 0.047, 0.0, 0.002, material('hole', '#2E1E16'), P, verts=32, bev=0)
    ros = cylinder('rosette', 0, 0.39, 0.058, -0.0005, 0.0015, material('rosette', 'mustard'), P, verts=32, bev=0)
    bridge = box('bridge', -0.07, 0.07, 0.11, 0.14, 0.0, 0.008, material('neck'), P, bev=0.002)
    guard = bmesh.new()
    gv = [guard.verts.new(v) for v in [(0.035, 0.32, 0.001), (0.1, 0.3, 0.001), (0.12, 0.36, 0.001), (0.07, 0.42, 0.001), (0.04, 0.37, 0.001)]]
    guard.faces.new(gv)
    gob = mesh_obj('pickguard', guard, material('guard', 'cherry'), P)
    for ob in (neck, head, hole, ros, bridge, gob):
        ob.matrix_world = body.matrix_world @ ob.matrix_world
    strings = collection('NoInk')
    sm = material('string', '#5E4A3A')
    for s_ in range(6):
        xx = -0.015 + s_ * 0.006
        t = tube(f'string{s_}', [on((xx * 1.6, 0.128, 0.009)), on((xx, 0.92, 0.003))], 0.0009, sm, P)
        strings.objects.link(t)


def record_crate():
    k = dict(x0=4.62, x1=5.22, y0=3.62, y1=4.08, h=0.36)
    wood = material('crate', 'light-wood')
    slat_gap = material('crate-gap', '#3A2418')
    for name, b in [('crate-front', (k['x0'], k['x1'], k['y0'], k['y0'] + 0.018, 0, k['h'])),
                    ('crate-back', (k['x0'], k['x1'], k['y1'] - 0.018, k['y1'], 0, k['h'])),
                    ('crate-left', (k['x0'], k['x0'] + 0.018, k['y0'], k['y1'], 0, k['h'])),
                    ('crate-right', (k['x1'] - 0.018, k['x1'], k['y0'], k['y1'], 0, k['h'])),
                    ('crate-bottom', (k['x0'], k['x1'], k['y0'], k['y1'], 0, 0.02))]:
        B(name, *b, wood, bev=0.003)
    for z in (0.12, 0.24):
        B(f'crate-gap{z}', k['x0'] - 0.001, k['x1'] + 0.001, k['y0'] - 0.001, k['y0'] + 0.0, z, z + 0.02, slat_gap, bev=0)
        B(f'crate-gapl{z}', k['x0'] - 0.001, k['x0'], k['y0'], k['y1'], z, z + 0.02, slat_gap, bev=0)
    for i in range(11):
        y = k['y1'] - 0.035 - i * 0.034
        col = ['navy', 'muted-red', 'mustard', 'teal', 'cream', 'olive', 'ink', 'pale-blue'][i % 8]
        B(f'crate-record{i}', k['x0'] + 0.03, k['x1'] - 0.03, y - 0.004, y, 0.02, k['h'] + 0.03 + (i % 3) * 0.012, material('lp-' + col, col), bev=0.001)
    # the sleeve of what's playing now, leaning on the front (printed live)
    s0, s1 = Vector((4.70, 3.53, 0.0)), Vector((5.04, 3.53, 0.0))
    t1, t0 = Vector((5.04, 3.615, 0.32)), Vector((4.70, 3.615, 0.32))
    plane('sleeve', [s0, s1, t1, t0], tex_material('sleeve', 'sleeve.png'), P)
    OVERLAYS['sleeve'] = [tuple(v) for v in (t0, t1, s1, s0)]  # top-left, top-right, bottom-right, bottom-left


def wall_decor():
    y = D
    dark = material('frame-dark', 'dark-wood')
    # cork board in a dark frame; the GitHub card on it is stamped live
    k = CORK
    B('cork-frame', k['x0'], k['x1'], y - 0.025, y, k['z0'], k['z1'], dark, bev=0.004)
    i = k['inset']
    plane('cork', [(k['x0'] + i, y - 0.026, k['z0'] + i), (k['x1'] - i, y - 0.026, k['z0'] + i),
                   (k['x1'] - i, y - 0.026, k['z1'] - i), (k['x0'] + i, y - 0.026, k['z1'] - i)], tex_material('cork-tex', 'cork.png'), P)
    OVERLAYS['github'] = cork_quad(*CORK['card'], y - 0.0265)
    # tear-off calendar on a nail
    B('calendar', 2.42, 2.73, y - 0.012, y, 1.36, 1.83, tex_material('calendar-card', 'calendar.png'), bev=0.002)
    OVERLAYS['calendar'] = [(2.42, y - 0.0125, 1.83), (2.73, y - 0.0125, 1.83), (2.73, y - 0.0125, 1.36), (2.42, y - 0.0125, 1.36)]
    for i in range(1, 3):
        B(f'calendar-page{i}', 2.425, 2.725, y - 0.0115 + i * 0.002, y, 1.36 - i * 0.006, 1.68, material('page', 'paper-aged'), bev=0)
    tube('calendar-string', [(2.48, y - 0.01, 1.83), (2.575, y - 0.012, 1.92), (2.67, y - 0.01, 1.83)], 0.0015, material('cable'), P)
    # wall clock
    ck = (1.74, 2.24, 0.155)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=ck[2], radius2=ck[2], depth=0.035)
    rim = mesh_obj('clock-rim', bm, material('clock-rim', 'cherry'), P, smooth=True)
    rim.rotation_euler.x = math.radians(90)
    rim.location = (ck[0], y - 0.018, ck[1])
    bevel(rim, 0.006, 2, 40)
    plane('clock-face', [(ck[0] - ck[2], y - 0.037, ck[1] - ck[2]), (ck[0] + ck[2], y - 0.037, ck[1] - ck[2]),
                         (ck[0] + ck[2], y - 0.037, ck[1] + ck[2]), (ck[0] - ck[2], y - 0.037, ck[1] + ck[2])], tex_material('clock-tex', 'clock.png'), P)
    OVERLAYS['clock'] = [(ck[0] - ck[2], y - 0.038, ck[1] + ck[2]), (ck[0] + ck[2], y - 0.038, ck[1] + ck[2]),
                         (ck[0] + ck[2], y - 0.038, ck[1] - ck[2]), (ck[0] - ck[2], y - 0.038, ck[1] - ck[2])]
    # the gig poster with tape
    plane('poster', [(2.98, y - 0.004, 1.12), (3.68, y - 0.004, 1.12), (3.68, y - 0.004, 2.1), (2.98, y - 0.004, 2.1)], tex_material('poster-tex', 'poster.png'), P)
    tape = material('tape', '#D9C38E')
    for (tx, tz, a) in [(3.0, 2.09, 35), (3.66, 2.088, -30)]:
        t = B(f'tape{tx}', -0.05, 0.05, -0.0015, 0, -0.018, 0.018, tape, bev=0)
        t.location = (tx, y - 0.005, tz); t.rotation_euler.y = math.radians(a)
    # (the ghost of an old poster hung here until 2026-10-27: without ink it read as a pale box,
    # its two tape scraps as things floating in the beam; the chalkboard took the spot)
    chalkboard()
    battery_panel()
    # outlet and switch
    ivory = material('plate', 'ivory')
    B('outlet', 2.86, 2.97, y - 0.008, y, 0.26, 0.37, ivory, bev=0.002)
    B('switch', 3.78, 3.86, y - 0.008, y, 1.14, 1.27, ivory, bev=0.002)
    # string lights in swags along the top of the wall
    anchors = [0.12, 1.05, 1.98, 2.9, 3.85]
    wire = []
    for a, b in zip(anchors, anchors[1:]):
        for i in range(13):
            t = i / 12
            wire.append((a + (b - a) * t, y - 0.03, 2.6 - 0.13 * math.sin(math.pi * t)))
    collection('NoInk').objects.link(tube('string-wire', wire, 0.002, material('cable'), P))
    bulbs = ['#E8C468', '#E9A46A', '#F2E2B8', '#D9846A']
    for i, p in enumerate(wire[::3]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, segments=12, ring_count=8, location=(p[0], p[1] - 0.004, p[2] - 0.03))
        bo = _put(bpy.context.active_object)
        bo.scale = (0.8, 0.8, 1.1)
        bo.name = f'bulb{i}'
        bo.data.materials.append(material('stringbulb' + str(i % 4), bulbs[i % 4], emit=0.0))


# the cork board, and where the GitHub card sits on its texture (blender/textures.js cork():
# 1 px = 1 mm, card at x, y, w, h px turned by a radians; keep both in step)
CORK = dict(x0=1.18, x1=2.34, z0=1.31, z1=1.97, inset=0.032, card=(366, 30, 420, 520, 0.02))


def cork_quad(px, py, w, h, a, y):
    """The card's corners (top-left, top-right, bottom-right, bottom-left) in world space."""
    k, i = CORK, CORK['inset']
    x0, x1, z0, z1 = k['x0'] + i, k['x1'] - i, k['z0'] + i, k['z1'] - i
    W, H = round((x1 - x0) * 1000), round((z1 - z0) * 1000)
    cx, cy = px + w / 2, py + h / 2
    out = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        qx = cx + dx * math.cos(a) - dy * math.sin(a)
        qy = cy + dx * math.sin(a) + dy * math.cos(a)
        out.append((x0 + qx / W * (x1 - x0), y, z1 - qy / H * (z1 - z0)))
    return out


def chalkboard():
    """The notes board left of the desk: dark slate in a pine frame, chalk dust, a ledge with
    chalk and an eraser. The notes from the island are chalked on it live (OVERLAYS['chalk'])."""
    y = D
    x0, x1, z0, z1, fr = 0.08, 1.12, 1.46, 2.16, 0.04  # slate 0.96 x 0.62 m (textures.js slate())
    pine = material('board-frame', 'pine')
    for name, (a, b, c, d) in [('board-top', (x0, x1, z1 - fr, z1)), ('board-bottom', (x0, x1, z0, z0 + fr)),
                               ('board-left', (x0, x0 + fr, z0 + fr, z1 - fr)), ('board-right', (x1 - fr, x1, z0 + fr, z1 - fr))]:
        B(name, a, b, y - 0.032, y, c, d, pine, bev=0.005)
    plane('slate', [(x0 + fr, y - 0.018, z0 + fr), (x1 - fr, y - 0.018, z0 + fr), (x1 - fr, y - 0.018, z1 - fr), (x0 + fr, y - 0.018, z1 - fr)],
          material('slate', tex='slate.png', hatch=0), P)
    OVERLAYS['chalk'] = [(x0 + fr, y - 0.0185, z1 - fr), (x1 - fr, y - 0.0185, z1 - fr), (x1 - fr, y - 0.0185, z0 + fr), (x0 + fr, y - 0.0185, z0 + fr)]
    MASKED['chalk'] = ['slate']
    B('board-ledge', x0 + 0.03, x1 - 0.03, y - 0.078, y - 0.032, z0 - 0.004, z0 + 0.014, pine, bev=0.004)
    chalk = material('chalk')
    for i, (cx, ln, a) in enumerate([(0.36, 0.075, 4), (0.47, 0.05, -9), (0.54, 0.032, 20)]):
        d = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0)) * ln / 2
        c = Vector((cx, y - 0.056, z0 + 0.0205))
        tube(f'chalk{i}', [tuple(c - d), tuple(c + d)], 0.0065, chalk, P)
    B('eraser-felt', 0.8, 0.94, y - 0.072, y - 0.04, z0 + 0.014, z0 + 0.034, material('eraser-felt', '#4A3A30'), bev=0.003)
    B('eraser-back', 0.8, 0.94, y - 0.072, y - 0.04, z0 + 0.034, z0 + 0.058, material('eraser-wood', 'light-wood'), bev=0.005)


def battery_panel():
    """Battery dials on a board above the desk's right end: the Mac, the phone, the earbuds and
    one more. Needles, numbers and names are printed live (OVERLAYS['gauges']); a cable runs
    down to the outlet, as if the board were wired in."""
    y = D
    x0, x1, z0, z1 = 2.16, 2.94, 0.98, 1.26
    B('gauge-board', x0, x1, y - 0.024, y, z0, z1, material('gauge-board', 'cherry'), bev=0.006)
    i = 0.018
    plane('gauge-faces', [(x0 + i, y - 0.025, z0 + i), (x1 - i, y - 0.025, z0 + i), (x1 - i, y - 0.025, z1 - i), (x0 + i, y - 0.025, z1 - i)],
          tex_material('gauge-face', 'gauges.png'), P)
    OVERLAYS['gauges'] = [(x0 + i, y - 0.0255, z1 - i), (x1 - i, y - 0.0255, z1 - i), (x1 - i, y - 0.0255, z0 + i), (x0 + i, y - 0.0255, z0 + i)]
    MASKED['gauges'] = ['gauge-faces']
    # brass bezels round the four dials (they sit where textures.js gauges() draws the faces)
    brass = material('brass')
    w = (x1 - x0 - 2 * i) / 4
    for k in range(4):
        cx = x0 + i + (k + 0.5) * w
        cz = z0 + i + (z1 - z0 - 2 * i) * 0.6
        bpy.ops.mesh.primitive_torus_add(major_radius=0.068, minor_radius=0.0045, major_segments=40, minor_segments=8,
                                         location=(cx, y - 0.028, cz), rotation=(math.radians(90), 0, 0))
        _put(bpy.context.active_object).data.materials.append(brass)
    for sx in (x0 + 0.012, x1 - 0.012):
        for sz in (z0 + 0.012, z1 - 0.012):
            sc = C(f'gauge-screw{sx:.2f}{sz:.2f}', 0, 0, 0.005, -0.002, 0.002, brass, bev=0)
            sc.rotation_euler.x = math.radians(90)
            sc.location = (sx, y - 0.026, sz)
    smooth_tube('gauge-cable', [(x1 - 0.05, y - 0.012, z0 + 0.01), (x1 - 0.04, y - 0.01, 0.7), (2.93, y - 0.01, 0.42), (2.92, y - 0.009, 0.37)], 0.004, material('cable'), P)


def pendant():
    x, y = 2.95, 3.0
    tube('pendant-cord', [(x, y, ROOM_H), (x, y, 2.21)], 0.004, material('cable'), P)
    C('pendant-cap', x, y, 0.035, ROOM_H - 0.03, ROOM_H, material('ceramic'))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=0.2, radius2=0.075, depth=0.13)
    sh = mesh_obj('pendant-shade', bm, material('pendant', 'cream'), P, smooth=True)
    sh.location = (x, y, 2.145)
    sh.modifiers.new('thick', 'SOLIDIFY').thickness = 0.004
    C('pendant-band', x, y, 0.2, 2.08, 2.1, material('pendant-band', 'terracotta'), cap=False, bev=0)


def floor_clutter():
    cols = ['muted-red', 'paper', 'teal', 'mustard', 'paper', 'navy']
    r = rng(61)
    z = 0
    for i, col in enumerate(cols):
        h = 0.012 + r.random() * 0.01
        o = (r.random() - 0.5) * 0.04
        B(f'magazine{i}', 3.5 + o, 3.84 + o, 4.5 + o * 0.5, 4.78 + o * 0.5, z, z + h, material('mag-' + col, col), bev=0.002)
        z += h
    slip = material('slipper', 'muted-red')
    for (x, y, a) in [(1.35, 3.62, 0.3), (1.5, 3.55, -0.1)]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(x, y, 0.018))
        s = _put(bpy.context.active_object); s.scale = (0.85, 2.0, 0.3); s.rotation_euler.z = a
        s.data.materials.append(slip)
    smooth_tube('extension', [(2.92, D - 0.01, 0.29), (3.05, 5.12, 0.01), (3.4, 4.95, 0.01), (3.7, 5.05, 0.01), (4.0, 4.9, 0.02)], 0.005, material('cable'), P)


def build_props():
    global P
    P = collection('Props')
    desk(); desk_items(); chair(); shelf(); monstera(); sill_plants(); curtains(); rug(); cat_bed()
    guitar(); record_crate(); wall_decor(); pendant(); floor_clutter()
