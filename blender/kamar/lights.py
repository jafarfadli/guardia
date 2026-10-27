"""Light for any moment of the day, keyed by phase (0 night → 1 midday → 2 night), as in sun.js."""
import math

import bpy
from mathutils import Vector

from .core import TOKENS, WIN, ROOM_W, ROOM_D, ROOM_H, hex_rgba, collection

KEYS = [
    (0.00, dict(name='night', expo=1.0, skyTop='#151D33', skyLow='#26314F', sun=0.0, sunCol='#FFCC8F', amb=0.30, ambTint='#6E78A8', fill=0.10, fillCol='#7C88B8', cool=0.0, lamp=1.0, city=1.0)),
    (0.14, dict(name='pre-dawn', expo=1.0, skyTop='#2A3557', skyLow='#6D6F8F', sun=0.0, sunCol='#FFCC8F', amb=0.42, ambTint='#7E86AE', fill=0.16, fillCol='#9AA3C8', cool=0.25, lamp=0.5, city=0.6)),
    (0.30, dict(name='dawn', expo=1.0, skyTop='#7D93BC', skyLow='#E7B9A2', sun=0.0, sunCol='#FFCC8F', amb=0.70, ambTint='#A7A9C2', fill=0.24, fillCol='#C6CCE0', cool=0.65, lamp=0.0, city=0.0)),
    (0.55, dict(name='morning', expo=1.0, skyTop='#A9C2DA', skyLow='#E7ECEA', sun=0.0, sunCol='#FFCC8F', amb=0.98, ambTint='#B7BCCF', fill=0.30, fillCol='#E2E7F5', cool=1.0, lamp=0.0, city=0.0)),
    (1.00, dict(name='midday', expo=1.0, skyTop='#A5C0D8', skyLow='#DDE2D6', sun=0.55, sunCol='#FFE2B8', amb=1.0, ambTint='#B9B7B6', fill=0.34, fillCol='#EEEDEA', cool=0.25, lamp=0.0, city=0.0)),
    (1.35, dict(name='afternoon', expo=1.0, skyTop='#98B2CD', skyLow='#EAC69B', sun=1.0, sunCol='#FFCC8F', amb=0.86, ambTint='#B4B3BA', fill=0.38, fillCol='#E3E6EC', cool=0.0, lamp=0.0, city=0.0)),
    (1.62, dict(name='golden', expo=1.0, skyTop='#8C9FC0', skyLow='#F2AF79', sun=1.05, sunCol='#FFB877', amb=0.74, ambTint='#ACA4AA', fill=0.36, fillCol='#E9E1DC', cool=0.0, lamp=0.0, city=0.0)),
    (1.78, dict(name='sunset', expo=1.0, skyTop='#5E6E9C', skyLow='#E58A63', sun=0.6, sunCol='#FF9E6A', amb=0.58, ambTint='#8F8098', fill=0.28, fillCol='#DCC5C4', cool=0.0, lamp=0.3, city=0.2)),
    (1.88, dict(name='dusk', expo=1.02, skyTop='#33416B', skyLow='#9C7189', sun=0.0, sunCol='#FF9E6A', amb=0.44, ambTint='#757BA6', fill=0.16, fillCol='#9E95BA', cool=0.0, lamp=1.0, city=0.8)),
    (2.00, dict(name='night', expo=1.0, skyTop='#151D33', skyLow='#26314F', sun=0.0, sunCol='#FFCC8F', amb=0.30, ambTint='#6E78A8', fill=0.10, fillCol='#7C88B8', cool=0.0, lamp=1.0, city=1.0)),
]
AM = [(-12, 0.0), (-5, 0.14), (2, 0.3), (32, 0.55), (72, 1.0)]
PM = [(62, 1.0), (30, 1.35), (12, 1.62), (2, 1.78), (-4, 1.88), (-12, 2.0)]


def _lerp(a, b, t):
    return a + (b - a) * t


def _hexmix(a, b, t):
    ca, cb = hex_rgba(a), hex_rgba(b)
    return tuple(_lerp(ca[i], cb[i], t) for i in range(3))


def smooth(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def elevation_for_phase(p):
    """Inverse of the phase mapping in sun.js."""
    table = AM if p <= 1.0 else PM
    pts = sorted(((ph, e) for e, ph in table))
    if p <= pts[0][0]:
        return pts[0][1]
    for (p0, e0), (p1, e1) in zip(pts, pts[1:]):
        if p <= p1:
            return _lerp(e0, e1, (p - p0) / (p1 - p0))
    return pts[-1][1]


def look(phase):
    i = 0
    while i < len(KEYS) - 2 and KEYS[i + 1][0] < phase:
        i += 1
    (p0, a), (p1, b) = KEYS[i], KEYS[i + 1]
    t = min(1, max(0, (phase - p0) / (p1 - p0)))
    out = {'name': a['name'] if t < 0.5 else b['name']}
    for k, v in a.items():
        if k == 'name':
            continue
        out[k] = _hexmix(v, b[k], t) if isinstance(v, str) else _lerp(v, b[k], t)
    e = elevation_for_phase(phase)
    afternoon = phase > 1.0
    beam = smooth(0.3, 3.5, e) * (1 - smooth(64, 72, e)) if afternoon else 0.0
    # art-directed path: the patch lies on the floor through the afternoon (near the window at
    # midday, out across the rug by mid-afternoon) and climbs the wall only near sunset
    low = 1 - smooth(4, 60, max(0, e))
    elev = math.radians(min(58, 20 + 0.65 * max(0, e)))
    az = math.radians(18 - 10 * low)
    # direction toward the sun (x, y = depth, z = up)
    out['S'] = Vector((-math.cos(elev) * math.cos(az), -math.cos(elev) * math.sin(az), math.sin(elev))).normalized()
    out['sunI'] = out['sun'] * beam
    out['elevation'] = e
    out['phase'] = phase
    return out


def overcast(lk):
    """The same moment under cloud: DESIGN.md's contrast mood. No sun, so no beam and no dust; a
    cool, weak light from the other side; a brighter, cooler ambient; a grey sky."""
    p = lk['phase']
    day = smooth(0.2, 0.6, p) * (1 - smooth(1.8, 1.95, p))  # 1 in full daylight, 0 at night
    out = dict(lk)
    for k, grey in (('skyTop', _hexmix('#3A4256', '#8D97A5', day)), ('skyLow', _hexmix('#4A5266', '#BCC1C5', day))):
        out[k] = tuple(_lerp(lk[k][i], grey[i], 0.85) for i in range(3))
    out['sunI'] = 0.0
    out['fill'] = lk['fill'] * 0.85
    out['fillCol'] = _hexmix('#9AA3C8', '#D5DCE6', day)
    out['cool'] = max(lk['cool'], 0.8 * day)
    out['amb'] = lk['amb'] * (1 + 0.1 * day)
    out['ambTint'] = tuple(_lerp(lk['ambTint'][i], _hexmix('#7E86AE', '#AEB5C6', day)[i], 0.6) for i in range(3))
    out['weather'] = 'overcast'
    return out


def patch_centre(S):
    """Where the sun through the middle of the window lands on the floor, kept inside the room."""
    p = Vector((WIN['glass_x'], (WIN['y0'] + WIN['y1']) / 2, (WIN['z0'] + WIN['z1']) / 2))
    d = -Vector(S)
    if d.z > -1e-3:
        return Vector((1.2, p.y, 0))
    q = p + d * (-p.z / d.z)
    return Vector((min(max(q.x, 0.6), ROOM_W - 0.6), min(max(q.y, 0.6), ROOM_D - 0.6), 0))


# ---------------------------------------------------------------- rig
def _light(name, kind):
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    data = bpy.data.lights.new(name, kind)
    ob = bpy.data.objects.new(name, data)
    collection('Lights').objects.link(ob)
    return ob


def world_setup():
    w = bpy.data.worlds.get('KamarWorld') or bpy.data.worlds.new('KamarWorld')
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputWorld')
    lp = N.new('ShaderNodeLightPath')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs[0])
    # sky seen through the window: two flat bands with a hard horizon step
    zmap = N.new('ShaderNodeMapRange')
    zmap.inputs['From Min'].default_value = -1; zmap.inputs['From Max'].default_value = 1
    L.new(sep.outputs['Z'], zmap.inputs['Value'])
    sky = N.new('ShaderNodeValToRGB'); sky.name = 'sky'; sky.color_ramp.interpolation = 'CONSTANT'
    L.new(zmap.outputs['Result'], sky.inputs['Fac'])
    # ambient by direction: warm from below, neutral at the horizon, cool grey-violet above
    amb = N.new('ShaderNodeValToRGB'); amb.name = 'ambient'; amb.color_ramp.interpolation = 'LINEAR'
    L.new(zmap.outputs['Result'], amb.inputs['Fac'])
    bg_sky = N.new('ShaderNodeBackground'); bg_sky.name = 'bg_sky'
    bg_amb = N.new('ShaderNodeBackground'); bg_amb.name = 'bg_amb'
    L.new(sky.outputs['Color'], bg_sky.inputs['Color'])
    L.new(amb.outputs['Color'], bg_amb.inputs['Color'])
    mix = N.new('ShaderNodeMixShader')
    L.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    L.new(bg_amb.outputs[0], mix.inputs[1])
    L.new(bg_sky.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    return w


def air_setup():
    """The room's air, with a little dust in it, so the sun and the lamp show as beams."""
    if 'RoomAir' in bpy.data.objects:
        return bpy.data.objects['RoomAir']
    m = bpy.data.materials.new('room-air')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    vol = N.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (1.0, 0.97, 0.92, 1)
    vol.inputs['Anisotropy'].default_value = 0.2
    # uneven dust: thicker in slow drifts, never empty
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.17  # object space of the air is in metres now
    noise.inputs['Detail'].default_value = 2.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    drift = N.new('ShaderNodeMapRange')
    drift.inputs['From Min'].default_value, drift.inputs['From Max'].default_value = 0.3, 0.7
    drift.inputs['To Min'].default_value, drift.inputs['To Max'].default_value = 0.55, 1.45
    L.new(noise.outputs['Fac'], drift.inputs['Value'])
    dens = N.new('ShaderNodeValue'); dens.name = 'density'; dens.outputs[0].default_value = 0.03
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    L.new(drift.outputs['Result'], mul.inputs[0]); L.new(dens.outputs[0], mul.inputs[1])
    L.new(mul.outputs[0], vol.inputs['Density'])
    L.new(vol.outputs['Volume'], out.inputs['Volume'])
    # The air is a Volume object, its grid made by geometry nodes, not a mesh. Freestyle counts
    # every mesh as something that hides lines, air included: the old box's faces hid the ink
    # everywhere but a strip on the right (only the bookshelf, poster and guitar kept their
    # lines), and the rug, the wall corners and the floor's edges sat just outside it.
    ng = bpy.data.node_groups.new('room-air-fill', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    cube = ng.nodes.new('GeometryNodeVolumeCube')
    cube.inputs['Density'].default_value = 1.0
    cube.inputs['Min'].default_value = (0.0, -1.4, 0.0)  # the camera (y = -0.6) stands in it
    cube.inputs['Max'].default_value = (ROOM_W, ROOM_D, ROOM_H)
    for axis, n in zip('XYZ', (54, 66, 28)):
        cube.inputs['Resolution ' + axis].default_value = n
    setm = ng.nodes.new('GeometryNodeSetMaterial')
    setm.inputs['Material'].default_value = m
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(cube.outputs[0], setm.inputs['Geometry'])
    ng.links.new(setm.outputs['Geometry'], out.inputs[0])
    vol = bpy.data.volumes.new('RoomAir')
    vol.materials.append(m)
    ob = bpy.data.objects.new('RoomAir', vol)
    ob.modifiers.new('fill', 'NODES').node_group = ng
    ob.visible_shadow = False
    collection('NoInk').objects.link(ob)
    return ob


def apply(phase, cal, weather=None):
    """Set every light for a phase (and weather: None or 'overcast'). `cal` holds the
    calibration multipliers."""
    lk = look(phase)
    if weather == 'overcast':
        lk = overcast(lk)
    w = bpy.context.scene.world
    nt = w.node_tree
    # sky bands (Generated z runs 0..1 from below to above in world probes; camera rays use the same)
    sk = nt.nodes['sky'].color_ramp.elements
    while len(sk) > 2:
        sk.remove(sk[-1])
    sk[0].position = 0.0; sk[0].color = lk['skyLow'] + (1,)
    sk[1].position = 0.545; sk[1].color = tuple(_lerp(lk['skyLow'][i], lk['skyTop'][i], 0.5) for i in range(3)) + (1,)
    e3 = sk.new(0.6); e3.color = lk['skyTop'] + (1,)
    nt.nodes['bg_sky'].inputs['Strength'].default_value = cal['sky']
    am = nt.nodes['ambient'].color_ramp.elements
    tint = lk['ambTint']
    gnd, hor, top = hex_rgba(TOKENS['light']['ambientGround']), hex_rgba(TOKENS['light']['ambientHorizon']), hex_rgba(TOKENS['light']['ambientSky'])
    mixc = lambda c: tuple(_lerp(c[i], tint[i], 0.25) for i in range(3)) + (1,)
    am[0].position = 0.0; am[0].color = mixc(gnd)
    am[1].position = 1.0; am[1].color = mixc(top)
    if len(am) < 3:
        am.new(0.5)
    am[1].position = 0.5; am[1].color = mixc(hor)
    am[2].position = 1.0; am[2].color = mixc(top)
    nt.nodes['bg_amb'].inputs['Strength'].default_value = cal['amb'] * lk['amb']

    # the sun through the west window
    sun = _light('Sun', 'SUN')
    sun.data.color = lk['sunCol']
    sun.data.energy = cal['sun'] * lk['sunI']
    sun.data.angle = math.radians(0.6)
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = (-lk['S']).to_track_quat('-Z', 'Y')
    sun.data.volume_factor = cal['shaft']  # the beam shows in the dusty air
    sun.hide_render = lk['sunI'] <= 0.01

    # sky light: a soft panel just outside each window, tilted down like light from the sky, so
    # the opening shapes it. Light falls off into the room, everything (frame, curtains, plants,
    # furniture) casts a soft shadow away from the window, and the ceiling stays unlit.
    def sky_panel(name, wall_x, outward, y0, y1, z0, z1):
        tilt = math.radians(30)
        d = Vector((-outward * math.cos(tilt), 0, -math.sin(tilt)))
        back = 0.32  # distance outside the wall's outer face
        ob = _light(name, 'AREA')
        ob.data.shape = 'RECTANGLE'
        ob.data.size = (y1 - y0) + 0.15
        ob.data.size_y = (z1 - z0) + 0.2
        ob.data.spread = math.radians(110)
        ob.location = (wall_x + outward * back, (y0 + y1) / 2, (z0 + z1) / 2 + back * math.tan(tilt))
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = d.to_track_quat('-Z', 'Y')
        ob.data.volume_factor = cal['skyhaze']
        return ob

    win = sky_panel('WindowSky', -WIN['wall_t'], -1, WIN['y0'], WIN['y1'], WIN['z0'], WIN['z1'])
    win.data.color = lk['fillCol']
    win.data.energy = cal['window'] * lk['fill']
    win.hide_render = lk['fill'] <= 0.005

    # the morning's cool light through the east window (out of frame, in the right wall)
    east = sky_panel('EastSky', ROOM_W + 0.12, 1, 1.7, 3.3, 0.8, 2.3)
    east.data.color = hex_rgba(TOKENS['light']['morning'])[:3]
    east.data.energy = cal['eastwin'] * lk['cool']
    east.hide_render = lk['cool'] <= 0.02

    # the sun patch lights the room back up: a warm disc on the floor where the beam lands
    bounce = _light('SunBounce', 'AREA')
    bounce.data.shape = 'DISK'
    bounce.data.size = 2.6
    bounce.data.use_shadow = False
    bounce.data.volume_factor = 0.0
    c = patch_centre(lk['S'])
    bounce.location = (c.x, c.y, 0.05)
    bounce.rotation_mode = 'QUATERNION'
    bounce.rotation_quaternion = Vector((0, 0, 1)).to_track_quat('-Z', 'Y')
    bounce.data.color = _hexmix('#D89A66', '#FFCC8F', 0.4)
    bounce.data.energy = cal['bounce'] * lk['sunI']
    bounce.hide_render = lk['sunI'] <= 0.01

    # desk lamp: a warm cone onto the papers that glows in the air, and its spill on the wall
    lamp = _light('DeskLamp', 'SPOT')
    lamp.data.color = hex_rgba(TOKENS['light']['lamp'])[:3]
    lamp.data.energy = cal['lamp'] * lk['lamp']
    lamp.data.spot_size = math.radians(128)
    lamp.data.spot_blend = 0.75
    lamp.data.shadow_soft_size = 0.02
    lamp.data.volume_factor = cal['lampshaft']
    lamp.hide_render = lk['lamp'] <= 0.02
    from .props import LAMP_HEAD, LAMP_AXIS
    axis = Vector(LAMP_AXIS).normalized()
    lamp.location = Vector(LAMP_HEAD) + axis * 0.155  # just outside the shade's mouth
    lamp.rotation_mode = 'QUATERNION'
    lamp.rotation_quaternion = axis.to_track_quat('-Z', 'Y')
    spill = _light('LampSpill', 'POINT')
    spill.location = Vector(LAMP_HEAD) + axis * 0.45  # where the lit papers bounce it back
    spill.data.color = hex_rgba(TOKENS['light']['lamp'])[:3]
    spill.data.energy = cal['spill'] * lk['lamp']
    spill.data.shadow_soft_size = 0.3
    spill.data.use_shadow = False
    spill.data.volume_factor = 0.0
    spill.hide_render = lk['lamp'] <= 0.02
    lk['lampOn'] = lk['lamp'] > 0.25
    # under cloud the air holds no glowing dust (DESIGN.md: no beam, no dust)
    air = cal['air'] * (0.25 if lk.get('weather') == 'overcast' else 1.0)
    bpy.data.materials['room-air'].node_tree.nodes['density'].outputs[0].default_value = air
    bpy.data.node_groups['KamarToon'].nodes['exposure'].outputs[0].default_value = lk['expo']
    _emission(lk)
    return lk


def _set_emit(mat_name, on, col=None):
    m = bpy.data.materials.get(mat_name)
    if not m:
        return
    for n in m.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeGroup':
            n.inputs['Emit'].default_value = 1.0 if on else 0.0
            if col is not None:
                n.inputs['Color'].default_value = col


def _emission(lk):
    on = lk['lampOn']
    warm = ['#F6D37A', '#F4B07A', '#FBEBC4', '#EE9A7C']
    dim = ['#E8C468', '#E9A46A', '#F2E2B8', '#D9846A']
    for i in range(4):
        _set_emit(f'stringbulb{i}', on, hex_rgba(warm[i] if on else dim[i]))
    _set_emit('bulb', on, hex_rgba('#FFF4D6' if on else '#E8DCC0'))
    city = lk['city'] > 0.3
    _set_emit('out-window-lit', city, hex_rgba('#F4C77E' if city else '#34466A'))
    _set_emit('out-far-window-lit', city, hex_rgba('#F2C277' if city else '#34466A'))
