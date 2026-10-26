// Small lived-in things: string lights, the pendant lamp, magazines, slippers, cables.
import { rng, add } from './math.js';
import * as ink from './ink.js';
import { ROOM } from './room.js';
import { furnitureOccluders, DESK, SHELF } from './furniture.js';
import { plantOccluders } from './plants.js';

export function propOccluders(pt) {
  return [...furnitureOccluders(), ...plantOccluders()];
}

// Warm bulbs on a sagging wire along the top of the back wall; they glow from dusk.
export function drawStringLights(pt) {
  const ctx = pt.ctx;
  const z = ROOM.d - 0.03;
  const anchors = [0.12, 1.05, 1.98, 2.9, 3.85];
  const on = pt.L.lamp > 0.25;
  const wire = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      wire.push([a + (b - a) * t, 2.6 - 0.13 * Math.sin(Math.PI * t), z]);
    }
  }
  pt.inkCurve3(wire, { base: 0.9, taper: 0.1 });
  for (const a of anchors) pt.inkLine3([[a, 2.61, z], [a, 2.57, z]], { base: 1.6 });
  const cols = ['#E8C468', '#E9A46A', '#F2E2B8', '#D9846A'];
  wire.forEach((p, i) => {
    if (i % 3) return;
    const q = pt.pt(add(p, [0, -0.035, 0]));
    const r = (pt.cam.f * 0.016) / q[2];
    ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = on ? cols[(i / 3) % cols.length] : pt.tone(cols[(i / 3) % cols.length], [0, 0, -1], 'shade');
    ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.ellipse(q[0], q[1] + r * 0.1, r * 0.35, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF7DE'; ctx.fill();
    }
    ctx.lineWidth = Math.max(0.8, r * 0.18); ctx.strokeStyle = pt.inkCss; ctx.stroke();
    const s = pt.pt(p);
    ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(q[0], q[1] - r); ctx.lineWidth = Math.max(0.8, r * 0.22); ctx.stroke();
  });
}

export function drawPendant(pt) {
  const ctx = pt.ctx;
  const x = 2.95, z = 3.0, y0 = ROOM.h, y1 = 2.08;
  pt.inkLine3([[x, y0, z], [x, y1 + 0.13, z]], { base: 1.1, taper: 0.1 });
  pt.cyl(x, z, 0.035, y0 - 0.03, y0, { mat: 'ivory', segments: 12, inkBase: 0.9 });
  // a fabric cone: wide at the bottom
  const res = pt.cyl(x, z, 0.075, y1, y1 + 0.13, { mat: 'cream', rBottom: 0.2, cap: false, inkBase: 1.4 });
  pt.cyl(x, z, 0.2, y1, y1 + 0.025, { mat: 'terracotta', rBottom: 0.2, cap: false, inkBase: 0.9 });
  // underside opening: bulb when lit
  const n = 28;
  const ring = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [x + Math.cos(a) * 0.2, y1, z + Math.sin(a) * 0.2]; });
  ink.fill(ctx, pt.P(ring), pt.tone('#7A5A3A', [0, -1, 0], 'shade'));
  pt.inkCurve3(ring, { base: 1.0, closed: true, taper: 0 });
}

export function drawFloorClutter(pt) {
  const r = rng(61);
  // a stack of magazines by the shelf
  let y = 0;
  const cols = ['muted-red', 'paper', 'teal', 'mustard', 'paper', 'navy'];
  for (let i = 0; i < 6; i++) {
    const h = 0.012 + r() * 0.01;
    const o = (r() - 0.5) * 0.04;
    pt.box([3.5 + o, 3.84 + o, y, y + h, 4.5 + o * 0.5, 4.78 + o * 0.5], { mat: (id) => (id === 'top' ? cols[i] : 'paper'), inkBase: 0.9, seed: i });
    y += h;
  }
  // slippers left by the chair
  const slip = (x, z, a) => {
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2;
      const rx = 0.05, rz = 0.13;
      const px = Math.cos(t) * rx * (Math.sin(t) > 0 ? 1 : 0.85), pz = Math.sin(t) * rz;
      pts.push([x + px * Math.cos(a) - pz * Math.sin(a), 0.02, z + px * Math.sin(a) + pz * Math.cos(a)]);
    }
    ink.fill(pt.ctx, pt.P(pts), pt.toneAt('muted-red', [x, 0.02, z], [0, 1, 0]));
    pt.inkCurve3(pts, { base: 1.1, closed: true, taper: 0 });
    const strap = pts.slice(9, 15).map((p) => [p[0], 0.045, p[2]]);
    pt.inkCurve3(strap, { base: 1.0 });
  };
  slip(1.35, 3.62, 0.3);
  slip(1.5, 3.55, -0.1);
  // the lamp's cable: down the desk leg, across the floor, to the outlet
  pt.inkCurve3([[DESK.x0 + 0.25, DESK.top - 0.04, DESK.z1 - 0.02], [DESK.x0 + 0.35, 0.3, DESK.z1 - 0.02], [DESK.x0 + 0.5, 0.01, DESK.z1 - 0.05], [2.2, 0.01, 5.1], [2.8, 0.01, 5.17], [2.91, 0.28, ROOM.d - 0.01]], { base: 1.6, taper: 0.1 });
  // extension cord coiled near the shelf
  pt.inkCurve3([[2.92, 0.29, ROOM.d - 0.01], [3.05, 0.01, 5.12], [3.4, 0.01, 4.95], [3.7, 0.01, 5.05], [SHELF.x0 + 0.05, 0.02, 4.9]], { base: 1.4, taper: 0.1 });
}
