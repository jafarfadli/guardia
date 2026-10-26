// Textiles: the kilim rug (drawn inside the floor's lighting passes), gingham curtains,
// the cat's bed and its toys.
import { rng, cmix, add, mul } from './math.js';
import * as ink from './ink.js';
import { planes, fillUV, WIN } from './room.js';

export const RUG = { x0: 1.2, x1: 3.95, z0: 2.05, z1: 3.9 };

// Floor plane coords are (u = z, v = x).
export function rugAlbedo(pt, T0) {
  const { x0, x1, z0, z1 } = RUG;
  const T = (c, a) => T0(cmix(pt.c(c), pt.c('cream'), 0.14), a);
  const F = (x0_, x1_, z0_, z1_, col) => fillUV(pt, planes.floor, [[z0_, x0_], [z1_, x0_], [z1_, x1_], [z0_, x1_]], T(col));
  F(x0, x1, z0, z1, 'muted-red');
  F(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, 'mustard');
  F(x0 + 0.13, x1 - 0.13, z0 + 0.13, z1 - 0.13, 'navy');
  // stepped teeth along the border
  for (let x = x0 + 0.16; x < x1 - 0.16; x += 0.12) {
    for (const z of [z0 + 0.13, z1 - 0.2]) F(x, x + 0.06, z, z + 0.07, 'muted-red');
  }
  // three lozenges down the middle
  const cz = (z0 + z1) / 2;
  for (let i = 0; i < 3; i++) {
    const cx = x0 + (x1 - x0) * (0.22 + i * 0.28);
    const dia = (rx, rz, col) => fillUV(pt, planes.floor, [[cz, cx - rx], [cz - rz, cx], [cz, cx + rx], [cz + rz, cx]], T(col));
    dia(0.36, 0.52, 'muted-red');
    dia(0.25, 0.37, 'mustard');
    dia(0.15, 0.22, 'navy');
    dia(0.06, 0.09, 'cream');
  }
  // small hooks scattered on the field
  const r = rng(9);
  for (let k = 0; k < 18; k++) {
    const x = x0 + 0.25 + r() * (x1 - x0 - 0.5), z = z0 + 0.25 + r() * (z1 - z0 - 0.5);
    if (Math.abs(z - cz) < 0.5) continue;
    F(x, x + 0.04, z, z + 0.04, r() < 0.5 ? 'cream' : 'mustard');
  }
  // worn lane where feet go from the door to the desk
  const worn = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; worn.push([z0 + 0.2 + t * (z1 - z0 - 0.4), x0 + 0.5 + Math.sin(t * 3) * 0.08]); }
  for (let k = 12; k >= 0; k--) { const t = k / 12; worn.push([z0 + 0.2 + t * (z1 - z0 - 0.4), x0 + 0.95 + Math.sin(t * 3) * 0.08]); }
  fillUV(pt, planes.floor, worn, T0(pt.c('cream'), 0.12));
}

export function rugInk(pt) {
  const { x0, x1, z0, z1 } = RUG;
  const P3 = (x, z) => [x, 0.003, z];
  pt.inkPoly3([P3(x0, z0), P3(x1, z0), P3(x1, z1), P3(x0, z1)], { base: 1.4, seed: 81 });
  pt.inkPoly3([P3(x0 + 0.13, z0 + 0.13), P3(x1 - 0.13, z0 + 0.13), P3(x1 - 0.13, z1 - 0.13), P3(x0 + 0.13, z1 - 0.13)], { base: 0.8, seed: 82, alpha: 0.8 });
  // fringe on both short ends
  const r = rng(4);
  for (const x of [x0, x1]) {
    const s = x === x0 ? -1 : 1;
    for (let z = z0 + 0.03; z < z1; z += 0.045) pt.inkLine3([P3(x, z), P3(x + s * (0.06 + r() * 0.03), z + (r() - 0.5) * 0.03)], { base: 0.7, seed: z * 50, taper: 0.9 });
  }
  // weave: short dashes across the field
  for (let k = 0; k < 140; k++) {
    const x = x0 + 0.15 + r() * (x1 - x0 - 0.3), z = z0 + 0.15 + r() * (z1 - z0 - 0.3);
    pt.inkLine3([P3(x, z), P3(x + 0.04, z)], { base: 0.35, alpha: 0.35, seed: k });
  }
}

// ------------------------------------------------------------------ curtains
const CUR = [
  { top: [2.06, 2.52], tie: [2.2, 2.36], bot: [2.12, 2.44] },
  { top: [3.93, 4.42], tie: [4.06, 4.24], bot: [3.98, 4.34] },
];
export function drawCurtains(pt) {
  const ctx = pt.ctx;
  const x = 0.11;
  const yTop = 2.44, yTie = 1.22, yBot = 0.03;
  const N = [1, 0, 0];
  // rod with finials
  pt.rod([x, 2.47, 1.92], [x, 2.47, 4.56], 0.012, 'cherry', { inkBase: 1.0 });
  for (const z of [1.92, 4.56]) {
    const q = pt.pt([x, 2.47, z]);
    const rr = (pt.cam.f * 0.025) / q[2];
    ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, Math.PI * 2);
    ctx.fillStyle = pt.toneAt('cherry', [x, 2.47, z], N); ctx.fill();
    ctx.lineWidth = Math.max(1, rr * 0.25); ctx.strokeStyle = pt.inkCss; ctx.stroke();
  }
  for (const c of CUR) {
    const folds = 7;
    const lerp = (a, b, t) => a + (b - a) * t;
    const col = (i) => [lerp(c.top[0], c.top[1], i / folds), lerp(c.tie[0], c.tie[1], i / folds), lerp(c.bot[0], c.bot[1], i / folds)];
    const at = [x, 1.3, (c.tie[0] + c.tie[1]) / 2];
    for (let i = 0; i < folds; i++) {
      const a = col(i), b = col(i + 1);
      const step = i % 2 ? -1 : 0;
      const strip1 = [[x, yTop, a[0]], [x, yTop, b[0]], [x, yTie, b[1]], [x, yTie, a[1]]];
      const strip2 = [[x, yTie, a[1]], [x, yTie, b[1]], [x, yBot, b[2]], [x, yBot, a[2]]];
      for (const strip of [strip1, strip2]) {
        const scr = pt.P(strip);
        ink.fill(ctx, scr, pt.toneAt('cream', at, N, step));
        // gingham: mustard bands both ways, darker where they cross
        ctx.save();
        ink.clipTo(ctx, scr);
        ctx.globalAlpha = 0.6;
        const ys = strip[0][1], ye = strip[2][1];
        for (let y = Math.min(ys, ye); y < Math.max(ys, ye); y += 0.07) {
          ink.fill(ctx, pt.P([[x, y, a[0] - 0.3], [x, y, b[0] + 0.3], [x, y + 0.035, b[0] + 0.3], [x, y + 0.035, a[0] - 0.3]]), pt.toneAt('mustard', at, N, step));
        }
        const z0 = Math.min(a[0], a[1], a[2]) - 0.1, z1 = Math.max(b[0], b[1], b[2]) + 0.1;
        for (let z = z0; z < z1; z += 0.07) {
          ink.fill(ctx, pt.P([[x, yBot - 0.1, z], [x, yBot - 0.1, z + 0.035], [x, yTop + 0.1, z + 0.035], [x, yTop + 0.1, z]]), pt.toneAt('mustard', at, N, step));
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    // tie-back band
    const tie = [[x + 0.005, yTie + 0.04, c.tie[0] - 0.015], [x + 0.005, yTie + 0.04, c.tie[1] + 0.015], [x + 0.005, yTie - 0.03, c.tie[1] + 0.015], [x + 0.005, yTie - 0.03, c.tie[0] - 0.015]];
    ink.fill(ctx, pt.P(tie), pt.toneAt('muted-red', at, N));
    pt.inkPoly3(tie, { base: 1.0 });
    // outline and fold lines
    const outline = [[x, yTop, c.top[0]], [x, yTop, c.top[1]], [x, yTie, c.tie[1]], [x, yBot, c.bot[1]], [x, yBot, c.bot[0]], [x, yTie, c.tie[0]]];
    pt.inkCurve3([outline[0], outline[5], outline[4]], { base: 1.5, taper: 0.3, seed: c.top[0] * 9 });
    pt.inkCurve3([outline[1], outline[2], outline[3]], { base: 1.5, taper: 0.3, seed: c.top[1] * 9 });
    pt.inkLine3([outline[0], outline[1]], { base: 1.2 });
    pt.inkLine3([outline[4], outline[3]], { base: 1.2 });
    for (let i = 1; i < folds; i++) {
      const a = col(i);
      pt.inkLine3([[x, yTop - 0.03, a[0]], [x, yTie + 0.06, a[1]]], { base: 0.6, alpha: 0.6, seed: i, taper: 0.9 });
      pt.inkLine3([[x, yTie - 0.05, a[1]], [x, yBot + 0.04, a[2]]], { base: 0.6, alpha: 0.6, seed: i + 20, taper: 0.9 });
    }
    // rings on the rod
    for (let i = 0; i <= folds; i += 2) {
      const a = col(i);
      const q = pt.pt([x, 2.47, a[0]]);
      const rr = (pt.cam.f * 0.016) / q[2];
      ctx.beginPath(); ctx.ellipse(q[0], q[1], rr * 0.5, rr, 0, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, rr * 0.3); ctx.strokeStyle = pt.inkCss; ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ the cat's bed and toys
export const BED = { x: 2.95, z: 3.02, r: 0.31 };
export function drawCatBed(pt) {
  const ctx = pt.ctx;
  const { x, z, r } = BED;
  const ring = (y, rr, n = 40) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]; });
  const at = [x, 0.1, z];
  const bot = ring(0.0, r), top = ring(0.13, r * 0.97), inner = ring(0.12, r * 0.66), cushion = ring(0.07, r * 0.64);
  // contact shadow: stepped, two rings
  ink.fill(ctx, pt.P(ring(0.002, r * 1.12)), pt.tone('light-wood', [0, 1, 0], 'deep'));
  const sil = hullOf(pt.P(bot).concat(pt.P(top)));
  ink.fill(ctx, sil, pt.toneAt('teal', at, [0, 0.2, -1]));
  // the far half of the wall is in shade
  ink.fill(ctx, pt.P(top), pt.toneAt('teal', at, [0, 1, 0]));
  ink.fill(ctx, pt.P(inner), pt.toneAt('teal', at, [0, 0, 1], -1));
  ink.fill(ctx, pt.P(cushion), pt.toneAt('cream', at, [0, 1, 0], -1));
  // weave marks on the outside
  const rr = rng(2);
  for (let k = 0; k < 30; k++) {
    const a = Math.PI * (0.05 + 0.9 * rr()), y = 0.02 + rr() * 0.09;
    const p = [x + Math.cos(a) * r * 0.99, y, z - Math.sin(a) * r * 0.99];
    pt.inkLine3([p, add(p, [0.015, 0, 0])], { base: 0.4, alpha: 0.5, seed: k });
  }
  ink.poly(ctx, sil, { w: pt.inkW([x, 0.1, z], 1.6), seed: 91, overshoot: 0.4 });
  pt.inkCurve3(top, { base: 1.2, closed: true, taper: 0 });
  pt.inkCurve3(inner, { base: 1.0, closed: true, taper: 0 });
  // ball of yarn with a loose thread, and a felt mouse
  const yb = [3.42, 0.055, 2.7];
  const q = pt.pt(yb);
  const R = (pt.cam.f * 0.055) / q[2];
  ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, Math.PI * 2);
  ctx.fillStyle = pt.toneAt('mustard', yb, [0, 0.5, -1]); ctx.fill();
  ctx.beginPath(); ctx.arc(q[0], q[1], R, Math.PI * 0.1, Math.PI * 1.1); ctx.lineTo(q[0], q[1]);
  ctx.fillStyle = pt.toneAt('mustard', yb, [0, 0.5, -1], -1); ctx.fill();
  for (let k = 0; k < 4; k++) {
    ctx.beginPath(); ctx.ellipse(q[0], q[1], R * (0.95 - k * 0.12), R * 0.45, -0.6 + k * 0.5, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.8, R * 0.06); ctx.strokeStyle = pt.inkCss; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, R * 0.09); ctx.stroke();
  pt.inkCurve3([[3.38, 0.01, 2.68], [3.3, 0.002, 2.6], [3.18, 0.002, 2.66], [3.05, 0.002, 2.55]], { base: 0.8, taper: 0.9 });
  const mouse = [[2.55, 0.0, 2.5], [2.62, 0.0, 2.48], [2.66, 0.035, 2.5], [2.6, 0.04, 2.52], [2.54, 0.025, 2.52]];
  ink.fill(ctx, pt.P(mouse), pt.toneAt('#8C8478', [2.6, 0.02, 2.5], [0, 0.5, -1]));
  pt.inkPoly3(mouse, { base: 1.0 });
  pt.inkCurve3([[2.55, 0.01, 2.51], [2.5, 0.005, 2.47], [2.46, 0.004, 2.5]], { base: 0.7, taper: 1 });
}

function hullOf(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
