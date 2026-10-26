// Furniture: the desk and everything on it, the chair, the bookshelf.
import { Plane, rng, cmix, cscale, norm, add, mul, sub, cross } from './math.js';
import * as ink from './ink.js';
import { ROOM } from './room.js';
import { screen, person, drawPerson } from './printed.js';

const D = ROOM.d;
export const DESK = { x0: 0.95, x1: 2.65, z0: 4.5, z1: D - 0.02, top: 0.76, t: 0.035 };
export const CHAIR = { x0: 1.6, x1: 2.06, z0: 3.95, z1: 4.4, seat: 0.46 };
export const SHELF = { x0: 3.95, x1: 5.28, z0: 4.84, z1: D - 0.01, h: 2.12, boards: [0.09, 0.5, 0.91, 1.32, 1.72] };
export const LAMP = { base: [1.08, DESK.top, 4.98], elbow: [1.05, 1.13, 5.0], head: [1.31, 1.2, 4.9] };
export const LAMP_AXIS = norm([-0.08, -1, -0.2]);
export const MONITOR = { x0: 1.5, x1: 2.08, y0: 0.79, y1: 1.21, z0: 4.76, z1: 5.12 };

const Q = (x0, x1, y0, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
const boxPts = (b) => { const [x0, x1, y0, y1, z0, z1] = b; return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; };

// Shadow casters for the sun patches.
export function furnitureOccluders() {
  const { x0, x1, z0, z1, top, t } = DESK;
  const legs = [[x0 + 0.02, z0 + 0.03], [x0 + 0.02, z1 - 0.05], [x1 - 0.5, z0 + 0.03]].map(([x, z]) => boxPts([x, x + 0.045, 0, top - t, z, z + 0.045]));
  const c = CHAIR;
  const M = MONITOR;
  return [
    { id: 'desk', hull: true, parts: [boxPts([x0, x1, top - t, top, z0, z1]), boxPts([x1 - 0.5, x1 - 0.03, 0, top - t, z0 + 0.02, z1]), ...legs] },
    { id: 'chair', hull: true, parts: [boxPts([c.x0, c.x1, c.seat - 0.03, c.seat, c.z0, c.z1]), boxPts([c.x0, c.x1, c.seat, 0.92, c.z0, c.z0 + 0.04]), ...[[c.x0, c.z0], [c.x1 - 0.035, c.z0], [c.x0, c.z1 - 0.035], [c.x1 - 0.035, c.z1 - 0.035]].map(([x, z]) => boxPts([x, x + 0.035, 0, c.seat, z, z + 0.035]))] },
    { id: 'monitor', hull: true, parts: [boxPts([M.x0, M.x1, M.y0, M.y1, M.z0, M.z1])] },
    { id: 'lamp', hull: true, parts: [[LAMP.base, LAMP.elbow, LAMP.head, add(LAMP.head, [0.08, -0.12, -0.06]), add(LAMP.head, [-0.07, -0.1, 0.05])]] },
    { id: 'shelf', hull: true, parts: [boxPts([SHELF.x0, SHELF.x1, 0, SHELF.h, SHELF.z0, SHELF.z1])] },
  ];
}

// ------------------------------------------------------------------ desk
export function drawDesk(pt) {
  const { x0, x1, z0, z1, top, t } = DESK;
  const wood = 'desk-wood';
  // drawer pedestal on the right, open space with a bin on the left
  const px0 = x1 - 0.5, px1 = x1 - 0.03;
  pt.box([x0 + 0.02, x0 + 0.065, 0, top - t, z1 - 0.06, z1 - 0.015], { mat: wood, inkBase: 1.3 });
  pt.box([px0, px1, 0, top - t, z0 + 0.02, z1], {
    mat: wood, inkBase: 1.6, seed: 4,
    detail: (f) => {
      if (f.id !== 'front') return;
      for (const [ya, yb] of [[0.05, 0.33], [0.36, 0.68]]) {
        pt.inkPoly3(Q(px0 + 0.03, px1 - 0.03, ya, yb, z0 + 0.018), { base: 1.1, seed: ya * 40 });
        const k = [(px0 + px1) / 2, (ya + yb) / 2 + 0.05, z0 + 0.012];
        pt.inkLine3([add(k, [-0.04, 0, 0]), add(k, [0.04, 0, 0])], { base: 2.4, taper: 0.2 });
      }
    },
  });
  // bin under the desk
  pt.cyl(x0 + 0.32, z1 - 0.28, 0.13, 0, 0.3, { mat: 'olive', capMat: 'olive', inner: { k: 0.86, mat: cmix(pt.c('olive'), pt.c('ink'), 0.5) }, inkBase: 1.4 });
  // crumpled paper in the bin
  pt.cyl(x0 + 0.28, z1 - 0.3, 0.05, 0.27, 0.33, { mat: 'paper', segments: 9, inkBase: 0.9 });
  // front legs
  pt.box([x0 + 0.02, x0 + 0.065, 0, top - t, z0 + 0.02, z0 + 0.065], { mat: wood, inkBase: 1.5, seed: 5 });
  // apron and top
  pt.box([x0, px0, top - t - 0.08, top - t, z0 + 0.03, z0 + 0.05], { mat: wood, inkBase: 1.2, seed: 6 });
  pt.box([x0, x1, top - t, top, z0, z1], {
    mat: wood, inkBase: 1.9, seed: 7, shadows: true, shadowExclude: ['desk', 'chair'], shadowSelf: 'desk',
    detail: (f) => {
      if (f.id !== 'top') return;
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        const zz = z0 + 0.05 + r() * (z1 - z0 - 0.1), xa = x0 + r() * 0.8;
        pt.inkLine3([[xa, top + 0.001, zz], [xa + 0.3 + r() * 0.6, top + 0.001, zz + (r() - 0.5) * 0.02]], { base: 0.5, alpha: 0.35, seed: i });
      }
    },
  });
}

export function drawDeskItems(pt) {
  const { x0, x1, z0, z1, top } = DESK;
  // a notebook and loose paper on the left
  const sheet = [[1.18, top + 0.002, 4.58], [1.46, top + 0.002, 4.55], [1.49, top + 0.002, 4.75], [1.21, top + 0.002, 4.78]];
  ink.fill(pt.ctx, pt.P(sheet), pt.toneAt('paper', [1.33, top, 4.66], [0, 1, 0]));
  pt.inkPoly3(sheet, { base: 1.0, seed: 41 });
  for (let i = 0; i < 5; i++) pt.inkLine3([[1.23 + i * 0.003, top + 0.003, 4.6 + i * 0.03], [1.42 + i * 0.003, top + 0.003, 4.585 + i * 0.03]], { base: 0.45, alpha: 0.5, seed: i });
  // monitor: a beige box with a deep back, a stand, the screen
  const M = MONITOR;
  pt.box([1.66, 1.92, top, M.y0, 4.86, 5.06], { mat: 'beige-plastic', inkBase: 1.2 });
  pt.box([1.58, 2.0, M.y0 + 0.04, M.y1 - 0.05, 4.95, M.z1], { mat: 'beige-plastic', inkBase: 1.3, shadows: true, shadowExclude: ['monitor', 'desk'] });
  pt.box([M.x0, M.x1, M.y0, M.y1, M.z0, 4.96], {
    mat: 'beige-plastic', inkBase: 1.7, seed: 9, shadows: true, shadowExclude: ['monitor', 'desk'],
    detail: (f) => {
      if (f.id !== 'front') return;
      const sx0 = M.x0 + 0.05, sx1 = M.x1 - 0.05, sy0 = M.y0 + 0.07, sy1 = M.y1 - 0.045, z = M.z0 - 0.002;
      const ctx = pt.ctx;
      ctx.save();
      const plane = new Plane([0, 0, z], [1, 0, 0], [0, 1, 0]);
      const m = pt.affine(plane, sx0, sy0, sx1, sy1, 460, 330);
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      screen(ctx, 460, 330, pt.now);
      ctx.restore();
      pt.inkPoly3(Q(sx0, sx1, sy0, sy1, z), { base: 1.3, seed: 42 });
      // power LED and a sticky note on the bezel
      ink.fill(ctx, pt.P(Q(M.x1 - 0.06, M.x1 - 0.045, M.y0 + 0.025, M.y0 + 0.035, z)), '#7FB069');
      const note = [[M.x1 - 0.1, M.y1 - 0.02, z - 0.002], [M.x1 + 0.01, M.y1 - 0.01, z - 0.002], [M.x1 + 0.005, M.y1 - 0.11, z - 0.002], [M.x1 - 0.105, M.y1 - 0.12, z - 0.002]];
      ink.fill(ctx, pt.P(note), pt.toneAt('#E6C766', [M.x1 - 0.05, M.y1 - 0.06, z], [0, 0, -1]));
      pt.inkPoly3(note, { base: 0.9, seed: 43 });
      pt.inkLine3([[M.x1 - 0.085, M.y1 - 0.05, z - 0.003], [M.x1 - 0.02, M.y1 - 0.045, z - 0.003]], { base: 0.6 });
      pt.inkLine3([[M.x1 - 0.085, M.y1 - 0.075, z - 0.003], [M.x1 - 0.04, M.y1 - 0.072, z - 0.003]], { base: 0.6 });
    },
  });
  // a tiny clay cat on top of the monitor
  pt.cyl(1.92, 4.9, 0.025, M.y1, M.y1 + 0.04, { mat: 'terracotta', segments: 12, inkBase: 0.9 });
  // books stacked flat on the right
  const stack = [['navy', 0.0, 0.04], ['mustard', 0.04, 0.035], ['teal', 0.075, 0.03], ['muted-red', 0.105, 0.028]];
  stack.forEach(([col, y, h], i) => pt.box([2.3 + i * 0.006, 2.6 - i * 0.008, top + y, top + y + h, 4.86 + i * 0.01, 5.12 - i * 0.004], {
    mat: (id) => (id === 'front' || id === 'right' ? 'paper' : col), inkBase: 1.1, seed: 50 + i, shadows: true, shadowExclude: ['desk'],
    detail: (f) => { if (f.id === 'front') pt.inkLine3([[2.3 + i * 0.006, top + y + h * 0.5, 4.86 + i * 0.01 - 0.001], [2.6 - i * 0.008, top + y + h * 0.5, 4.86 + i * 0.01 - 0.001]], { base: 0.4, alpha: 0.5 }); },
  }));
  // keyboard
  pt.box([1.54, 2.04, top, top + 0.025, 4.56, 4.71], {
    mat: 'beige-plastic', inkBase: 1.3, seed: 12,
    detail: (f) => {
      if (f.id !== 'top') return;
      const y = top + 0.026;
      for (let r = 0; r < 4; r++) pt.inkLine3([[1.56, y, 4.58 + r * 0.032], [2.02, y, 4.58 + r * 0.032]], { base: 0.4, alpha: 0.55, seed: r });
      for (let c = 0; c < 12; c++) pt.inkLine3([[1.56 + c * 0.04, y, 4.58], [1.56 + c * 0.04, y, 4.69]], { base: 0.35, alpha: 0.45, seed: c + 9 });
    },
  });
  // mug with a red band and a handle
  const mug = pt.cyl(2.27, 4.66, 0.042, top, top + 0.1, { mat: 'ivory', inner: { k: 0.84, mat: '#4A2E22' }, inkBase: 1.4 });
  pt.cyl(2.27, 4.66, 0.0425, top + 0.055, top + 0.072, { mat: 'muted-red', cap: false, ink: false });
  pt.inkCurve3([[2.312, top + 0.085, 4.665], [2.345, top + 0.08, 4.665], [2.35, top + 0.045, 4.665], [2.312, top + 0.03, 4.665]], { base: 1.6, taper: 0.4 });
  // pencil cup
  pt.cyl(2.48, 5.0, 0.036, top, top + 0.1, { mat: 'terracotta', inner: { k: 0.82, mat: '#3A2418' }, inkBase: 1.3 });
  [['mustard', -0.012, 0.21, 0.14], ['teal', 0.01, 0.2, -0.1], ['muted-red', 0.0, 0.18, 0.05]].forEach(([col, dx, h, lean]) => {
    pt.rod([2.48 + dx, top + 0.08, 5.0], [2.48 + dx + lean * 0.3, top + h, 4.99], 0.004, col, { inkBase: 0.7 });
  });
  // desk lamp: base, two arms, a mustard shade aimed at the papers
  const L = LAMP;
  pt.cyl(L.base[0], L.base[2], 0.075, top, top + 0.025, { mat: 'mustard', inkBase: 1.4 });
  pt.rod(add(L.base, [0, 0.02, 0]), L.elbow, 0.009, 'mustard', { inkBase: 1.1 });
  pt.rod(L.elbow, L.head, 0.009, 'mustard', { inkBase: 1.1 });
  drawShade(pt, L.head, LAMP_AXIS, 0.08, 0.14);
  // a small cactus by the lamp
  pt.cyl(1.36, 4.62, 0.035, top, top + 0.06, { mat: 'terracotta', rBottom: 0.028, inner: { k: 0.85, mat: '#4A2E22' }, inkBase: 1.1 });
  cactus(pt, [1.36, top + 0.058, 4.62]);
}

function drawShade(pt, apex, axis, r, len) {
  const ctx = pt.ctx;
  const base = add(apex, mul(axis, len));
  const u = norm(cross(axis, [0, 0, 1])), v = norm(cross(axis, u));
  const ring = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push(add(base, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))));
  }
  const top = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; top.push(add(apex, add(mul(u, Math.cos(a) * r * 0.32), mul(v, Math.sin(a) * r * 0.32)))); }
  const sil = hullPts(pt.P(ring).concat(pt.P(top)));
  ink.fill(ctx, sil, pt.toneAt('lamp-shade', base, norm([-0.5, 0.5, -0.7])));
  // the inside of the shade: a glowing bulb when the lamp is on
  const on = pt.L.lamp > 0.3;
  ink.fill(ctx, pt.P(ring), on ? '#FFE7B0' : pt.tone('#6B4A2A', [0, -1, 0], 'shade'));
  if (on) ink.fill(ctx, pt.P(ring.map((p) => add(base, mul(sub(p, base), 0.45)))), '#FFF6DC');
  ink.poly(ctx, sil, { w: pt.inkW(base, 1.6), seed: 61, overshoot: 0.5 });
  ink.curve(ctx, pt.P(ring), { w: pt.inkW(base, 1.1), closed: true, taper: 0, seed: 62 });
}

function cactus(pt, at) {
  const ctx = pt.ctx;
  const [x, y, z] = at;
  const body = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI * (i / 16); body.push([x + Math.cos(a) * 0.022, y + Math.sin(a) * 0.075, z - 0.001]); }
  const arm = [[x + 0.015, y + 0.03, z - 0.002], [x + 0.04, y + 0.035, z - 0.002], [x + 0.042, y + 0.07, z - 0.002], [x + 0.03, y + 0.07, z - 0.002], [x + 0.03, y + 0.045, z - 0.002], [x + 0.015, y + 0.045, z - 0.002]];
  for (const shape of [body, arm]) {
    ink.fill(ctx, pt.P(shape), pt.toneAt('olive', [x, y + 0.03, z], [0, 0, -1]));
    pt.inkPoly3(shape, { base: 0.9, seed: 70 });
  }
  pt.inkLine3([[x, y + 0.005, z - 0.003], [x, y + 0.07, z - 0.003]], { base: 0.5, alpha: 0.6 });
}

function hullPts(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

// ------------------------------------------------------------------ chair (seen from behind) + cardigan
export function drawChair(pt) {
  const c = CHAIR;
  const wood = 'cherry';
  const leg = 0.035;
  // back legs (far), seat, front legs (near the camera = back of the chair)
  for (const [x, z] of [[c.x0, c.z1 - leg], [c.x1 - leg, c.z1 - leg]]) pt.box([x, x + leg, 0, c.seat - 0.03, z, z + leg], { mat: wood, inkBase: 1.3 });
  pt.box([c.x0, c.x1, c.seat - 0.035, c.seat, c.z0, c.z1], { mat: wood, inkBase: 1.6, seed: 3 });
  pt.box([c.x0 + 0.01, c.x1 - 0.01, 0.12, 0.145, c.z0 + 0.01, c.z0 + 0.03], { mat: wood, inkBase: 1.0 });
  for (const x of [c.x0, c.x1 - leg]) pt.box([x, x + leg, 0, 0.93, c.z0, c.z0 + leg], { mat: wood, inkBase: 1.5, seed: x * 10 });
  pt.box([c.x0 - 0.01, c.x1 + 0.01, 0.82, 0.9, c.z0 - 0.004, c.z0 + 0.03], { mat: wood, inkBase: 1.5, seed: 8 });
  pt.box([c.x0 + leg, c.x1 - leg, 0.62, 0.655, c.z0 + 0.005, c.z0 + 0.025], { mat: wood, inkBase: 1.1, seed: 9 });
  cardigan(pt);
}

function cardigan(pt) {
  const c = CHAIR;
  const z = c.z0 - 0.012;
  const ctx = pt.ctx;
  // draped over the top rail, hanging down the back, one sleeve longer
  const shape = [
    [c.x0 + 0.03, 0.91], [c.x0 + 0.16, 0.925], [c.x1 - 0.08, 0.915], [c.x1 + 0.02, 0.9], [c.x1 + 0.035, 0.75],
    [c.x1 + 0.02, 0.55], [c.x1 - 0.02, 0.5], [c.x1 - 0.06, 0.62], [c.x1 - 0.14, 0.66], [c.x0 + 0.18, 0.64],
    [c.x0 + 0.1, 0.6], [c.x0 + 0.03, 0.42], [c.x0 - 0.02, 0.4], [c.x0 - 0.03, 0.6], [c.x0 - 0.01, 0.85],
  ].map(([x, y]) => [x, y, z]);
  const base = 'mustard';
  const at = [1.83, 0.75, c.z0 - 0.02];
  ink.fill(ctx, pt.P(shape), pt.toneAt(base, at, [0, 0, -1]));
  // fold shading: stepped darker valleys
  const folds = [[[c.x0 + 0.05, 0.9], [c.x0 + 0.03, 0.62], [c.x0 + 0.06, 0.5], [c.x0 + 0.08, 0.6], [c.x0 + 0.09, 0.88]], [[c.x1 - 0.02, 0.88], [c.x1, 0.62], [c.x1 + 0.015, 0.6], [c.x1 + 0.02, 0.86]], [[c.x0 + 0.2, 0.9], [c.x0 + 0.24, 0.68], [c.x0 + 0.3, 0.67], [c.x0 + 0.27, 0.9]]];
  for (const f of folds) ink.fill(ctx, pt.P(f.map(([x, y]) => [x, y, z - 0.001])), pt.toneAt(base, at, [0, 0, -1], -1));
  // knit texture: little V marks in rows
  const r = rng(3);
  for (let y = 0.48; y < 0.9; y += 0.035) for (let x = c.x0; x < c.x1 + 0.02; x += 0.035) {
    if (r() < 0.35) continue;
    const p = [x + (r() - 0.5) * 0.01, y, z - 0.002];
    pt.inkLine3([add(p, [-0.008, 0.008, 0]), p, add(p, [0.008, 0.008, 0])], { base: 0.45, alpha: 0.4, seed: x * y * 100, taper: 0.2 });
  }
  pt.inkCurve3(shape, { base: 1.6, closed: true, taper: 0, seed: 77 });
  for (const f of folds) pt.inkCurve3(f.slice(0, 3).map(([x, y]) => [x, y, z - 0.002]), { base: 0.8, seed: f[0][0] * 10 });
}

// ------------------------------------------------------------------ bookshelf
const BOOK_COLS = ['navy', 'mustard', 'terracotta', 'teal', 'olive', 'muted-red', 'cream', 'pale-blue', 'ivory', 'paper-aged', 'teal', 'mustard', 'muted-red', 'navy'];

export function drawShelf(pt) {
  const s = SHELF;
  const wood = 'shelf-wood';
  // open back: the wall shows between the books; the far side panel goes first
  pt.box([s.x1 - 0.03, s.x1, 0, s.h, s.z0, s.z1], { mat: wood, inkBase: 1.8, seed: 32 });
  const r = rng(314);
  const tops = [...s.boards.slice(1), s.h - 0.03];
  s.boards.forEach((y, i) => {
    // board
    pt.box([s.x0 + 0.03, s.x1 - 0.03, y - 0.022, y, s.z0 + 0.01, s.z1 - 0.012], { mat: wood, inkBase: 1.2, seed: i });
    const yTop = tops[i] - 0.022;
    const room = yTop - y;
    let x = s.x0 + 0.04;
    const xEnd = s.x1 - 0.04;
    // what lives on this shelf
    if (i === 0) {
      // records leaning against the side, then a short run of fat books
      for (let k = 0; k < 9; k++) {
        const lean = 0.012 * k;
        const xx = s.x0 + 0.05 + k * 0.014;
        pt.prismZ([[xx, y], [xx + 0.008, y], [xx + 0.008 + lean * 0.4 + 0.3 * 0.05, y + 0.31], [xx + lean * 0.4 + 0.3 * 0.05, y + 0.31]], s.z0 + 0.03, s.z0 + 0.34, { mat: BOOK_COLS[(k * 3) % BOOK_COLS.length], inkBase: 0.9 });
      }
      x = s.x0 + 0.3;
    }
    if (i === 2) {
      // a little radio
      pt.box([x, x + 0.26, y, y + 0.16, s.z0 + 0.05, s.z0 + 0.2], {
        mat: 'teal', inkBase: 1.4,
        detail: (f) => {
          if (f.id !== 'front') return;
          const z = s.z0 + 0.048;
          for (let k = 0; k < 6; k++) pt.inkLine3([[x + 0.02, y + 0.03 + k * 0.018, z], [x + 0.13, y + 0.03 + k * 0.018, z]], { base: 0.6, alpha: 0.8 });
          pt.inkPoly3(Q(x + 0.16, x + 0.24, y + 0.04, y + 0.12, z), { base: 0.9 });
        },
      });
      pt.cyl(x + 0.2, s.z0 + 0.03, 0.018, y + 0.07, y + 0.09, { mat: 'cream', segments: 10, inkBase: 0.8 });
      x += 0.3;
    }
    if (i === 3) {
      // a framed photo standing up
      pt.box([x, x + 0.16, y, y + 0.21, s.z0 + 0.06, s.z0 + 0.08], {
        mat: 'cherry', inkBase: 1.2,
        detail: (f) => {
          if (f.id !== 'front') return;
          const z = s.z0 + 0.058;
          ink.fill(pt.ctx, pt.P(Q(x + 0.02, x + 0.14, y + 0.025, y + 0.19, z)), pt.toneAt('#A7B9C4', [x + 0.08, y + 0.1, z], [0, 0, -1]));
          // a family photo: two pixel people
          const ctx = pt.ctx;
          ctx.save();
          const tl = pt.pt([x + 0.02, y + 0.19, z]), tr = pt.pt([x + 0.14, y + 0.19, z]), bl = pt.pt([x + 0.02, y + 0.025, z]);
          ctx.setTransform((tr[0] - tl[0]) / 120, (tr[1] - tl[1]) / 120, (bl[0] - tl[0]) / 165, (bl[1] - tl[1]) / 165, tl[0], tl[1]);
          const T = (c) => pt.toneAt(c, [x + 0.08, y + 0.1, z], [0, 0, -1]);
          drawPerson(ctx, 6, 40, 4.6, person(71, 'hijab'), T);
          drawPerson(ctx, 60, 34, 4.8, person(72, 'glasses'), T);
          ctx.restore();
          pt.inkPoly3(Q(x + 0.02, x + 0.14, y + 0.025, y + 0.19, z), { base: 0.8 });
        },
      });
      x += 0.2;
    }
    while (x < xEnd - 0.02) {
      const roll = r();
      if (roll < 0.04 && x < xEnd - 0.25) { x += 0.03 + r() * 0.04; continue; } // a gap
      if (roll < 0.11 && x < xEnd - 0.22) {
        // a pile lying flat
        let yy = y;
        const n = 3 + Math.floor(r() * 3);
        const w0 = 0.18 + r() * 0.06;
        for (let k = 0; k < n && yy < yTop - 0.05; k++) {
          const h = 0.025 + r() * 0.02;
          const off = (r() - 0.5) * 0.02;
          pt.box([x + off, x + off + w0 - r() * 0.03, yy, yy + h, s.z0 + 0.03 + r() * 0.02, s.z0 + 0.24], { mat: (id) => (id === 'top' ? r.pick(BOOK_COLS) : r.pick(BOOK_COLS)), inkBase: 0.9, seed: k });
          yy += h;
        }
        x += w0 + 0.01;
        continue;
      }
      const w = 0.022 + r() * 0.03;
      const h = Math.min(room - 0.02, 0.2 + r() * 0.16);
      const col = r.pick(BOOK_COLS);
      const zf = s.z0 + 0.025 + r() * 0.03;
      const leanNext = r() < 0.035;
      if (leanNext && x + 0.1 < xEnd) {
        const a = 0.25 + r() * 0.2;
        const xy = [[x, y], [x + w * Math.cos(a), y - w * Math.sin(a) + w * Math.sin(a)], [x + w * Math.cos(a) + h * Math.sin(a), y + h * Math.cos(a)], [x + h * Math.sin(a), y + h * Math.cos(a)]];
        pt.prismZ(xy, zf, zf + 0.2, { mat: col, inkBase: 0.95, seed: x * 100 });
        x += h * Math.sin(a) + w + 0.005;
        continue;
      }
      pt.box([x, x + w, y, y + h, zf, zf + 0.2], {
        mat: col, inkBase: 0.95, seed: x * 100,
        detail: (f) => {
          if (f.id !== 'front') return;
          const band = r.pick(['mustard', 'cream', 'ink', 'muted-red']);
          const bandCol = pt.tone(band, [0, 0, -1], 'shade');
          if (r() < 0.6) {
            ink.fill(pt.ctx, pt.P(Q(x, x + w, y + h * 0.8, y + h * 0.86, zf - 0.001)), bandCol);
            ink.fill(pt.ctx, pt.P(Q(x, x + w, y + h * 0.12, y + h * 0.17, zf - 0.001)), bandCol);
          }
          if (r() < 0.7) pt.inkLine3([[x + w / 2, y + h * 0.3, zf - 0.002], [x + w / 2, y + h * 0.65, zf - 0.002]], { base: 0.5, alpha: 0.7, taper: 0.8 });
        },
      });
      x += w + 0.002;
    }
  });
  // carcass: sides and top over the contents' back edges
  pt.box([s.x0, s.x0 + 0.03, 0, s.h, s.z0, s.z1], { mat: wood, inkBase: 1.8, seed: 31 });
  pt.box([s.x0, s.x1, s.h - 0.03, s.h, s.z0 - 0.01, s.z1], { mat: wood, inkBase: 1.8, seed: 33 });
  pt.box([s.x0, s.x1, 0, 0.07, s.z0, s.z0 + 0.02], { mat: wood, inkBase: 1.4, seed: 34 });
}
