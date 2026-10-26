// Plants. Leaves are flat 3D polygons, so the same geometry is drawn and also cast
// into the sun patches as leafy shadows.
import { rng, add, mul, norm, cross, sub, dot } from './math.js';
import * as ink from './ink.js';
import { WIN } from './room.js';
import { SHELF } from './furniture.js';

// A leaf: midrib from `base` along `dir`, blade spreading along `side`.
function leafPoly(base, dir, side, len, width, o = {}) {
  const n = 14;
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.85) * (o.heart ? 1 - 0.25 * t : 1 - 0.1 * t);
    if (o.heart && t < 0.18) w *= 0.6 + t * 2.2;
    const p = add(base, mul(dir, len * t));
    L.push(add(p, mul(side, w)));
    R.push(add(p, mul(side, -w)));
  }
  return { poly: [...L, ...R.reverse()], base, dir, side, len, width, slits: !!o.slits, n: norm(cross(dir, side)) };
}

let CACHE = null;
export function plantGeometry() {
  if (CACHE) return CACHE;
  const leaves = { monstera: [], sill: [], pothos: [], shelfVine: [] };
  // monstera in the back-left corner
  const r = rng(12);
  const mBase = [0.4, 0.38, 4.74];
  for (let i = 0; i < 8; i++) {
    const a = -1.2 + (i / 7) * 2.6 + r.range(-0.15, 0.15);
    const up = 0.5 + r() * 0.75;
    const stemEnd = add(mBase, [Math.sin(a) * 0.32 + 0.12, up, -Math.cos(a) * 0.18 - 0.08]);
    const dir = norm([Math.sin(a) * 0.8 + 0.2, -0.25 - r() * 0.4, -0.55]);
    const side = norm(cross(dir, [0.1, 1, -0.3]));
    const lf = leafPoly(stemEnd, dir, side, 0.34 + r() * 0.12, 0.17 + r() * 0.04, { slits: true, heart: true });
    lf.stem = [mBase, add(mBase, [Math.sin(a) * 0.1, up * 0.6, -0.03]), stemEnd];
    leaves.monstera.push(lf);
  }
  // sill plants: succulent, basil, a trailing string-of-pearls
  const sillY = WIN.y0;
  const sx = -0.06;
  const rs = rng(5);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const dir = norm([Math.cos(a) * 0.8, 0.55, Math.sin(a) * 0.8]);
    leaves.sill.push({ ...leafPoly([sx, sillY + 0.075, 2.78], dir, norm(cross(dir, [0, 1, 0.01])), 0.06, 0.018), kind: 'succulent' });
  }
  for (let i = 0; i < 14; i++) {
    const a = rs() * Math.PI * 2, up = 0.08 + rs() * 0.12;
    const p = [sx + Math.cos(a) * 0.05, sillY + 0.085 + up, 3.22 + Math.sin(a) * 0.06];
    const dir = norm([Math.cos(a), 0.4 + rs() * 0.3, Math.sin(a)]);
    leaves.sill.push({ ...leafPoly(p, dir, norm(cross(dir, [0, 1, 0])), 0.045, 0.02), kind: 'basil' });
  }
  // pothos on top of the shelf, vines trailing down its left side
  const pr = rng(8);
  const potTop = [SHELF.x0 + 0.3, SHELF.h + 0.13, SHELF.z0 + 0.15];
  for (let v = 0; v < 3; v++) {
    const pts = [];
    let p = add(potTop, [-0.05 - v * 0.03, 0, -0.04 * v]);
    for (let k = 0; k < 12; k++) {
      p = add(p, [k < 3 ? -0.09 : -0.008 + pr.range(-0.01, 0.01), k < 2 ? 0.02 : -0.085 - v * 0.012, -0.012]);
      pts.push(p);
    }
    leaves.shelfVine.push({ vine: pts });
    pts.forEach((q, k) => {
      if (k % 2) return;
      const s = k % 4 ? 1 : -1;
      const dir = norm([s * 0.7, -0.5, -0.5]);
      leaves.pothos.push(leafPoly(q, dir, norm(cross(dir, [0, 0.3, -1])), 0.075, 0.042, { heart: true }));
    });
  }
  CACHE = leaves;
  return leaves;
}

export function plantOccluders() {
  const g = plantGeometry();
  return [
    { id: 'sill-plants', parts: g.sill.map((l) => l.poly) },
    { id: 'monstera', parts: g.monstera.map((l) => l.poly) },
  ];
}

function drawLeaf(pt, lf, base = 'plant-green', o = {}) {
  const ctx = pt.ctx;
  const c = add(lf.base, mul(lf.dir, lf.len * 0.5));
  const N = dot(lf.n, sub(pt.cam.pos, c)) > 0 ? lf.n : mul(lf.n, -1);
  // a leaf lit from behind still glows: test the light against either face
  const Nl = pt.inBeam(c) && dot(N, pt.L.S) < 0 ? mul(N, -1) : N;
  const scr = pt.P(lf.poly);
  ink.fill(ctx, scr, pt.toneAt(base, c, Nl));
  // cel split along the midrib: one half a step darker
  const half = lf.poly.slice(0, Math.ceil(lf.poly.length / 2));
  ink.fill(ctx, pt.P([...half, lf.base]), pt.toneAt(base, c, Nl, -1));
  const w = pt.inkW(c, o.inkBase ?? 1.1);
  ink.poly(ctx, scr, { w, alpha: pt.inkA(c), seed: c[0] * 99 + c[2], overshoot: 0.3, taper: 0.8 });
  pt.inkLine3([lf.base, add(lf.base, mul(lf.dir, lf.len * 0.92))], { base: (o.inkBase ?? 1.1) * 0.6, alpha: 0.8 });
  if (lf.slits) {
    // monstera splits: from the edge toward the midrib, a few per side
    for (const sgn of [1, -1]) for (const t of [0.3, 0.48, 0.66]) {
      const w = lf.width * Math.pow(Math.sin(Math.PI * t), 0.85) * (1 - 0.25 * t);
      const edge = add(add(lf.base, mul(lf.dir, lf.len * (t + 0.05))), mul(lf.side, sgn * w * 0.98));
      const inner = add(add(lf.base, mul(lf.dir, lf.len * t)), mul(lf.side, sgn * w * 0.35));
      pt.inkLine3([edge, inner], { base: (o.inkBase ?? 1.1) * 0.85, taper: 0.9, seed: t * 40 + sgn });
    }
  }
}

export function drawMonstera(pt) {
  const g = plantGeometry();
  // pot with a saucer
  pt.cyl(0.4, 4.74, 0.21, 0, 0.03, { mat: 'terracotta', inkBase: 1.2 });
  pt.cyl(0.4, 4.74, 0.19, 0.03, 0.38, { mat: 'terracotta', rBottom: 0.16, inner: { k: 0.9, mat: '#3A2418' }, inkBase: 1.6 });
  pt.cyl(0.4, 4.74, 0.2, 0.31, 0.38, { mat: 'terracotta', cap: false, inkBase: 1.0 });
  const sorted = [...g.monstera].sort((a, b) => pt.cam.depth(b.base) - pt.cam.depth(a.base));
  for (const lf of sorted) {
    pt.inkCurve3(lf.stem, { base: 1.3, taper: 0.5 });
    drawLeaf(pt, lf, 'plant-green', { inkBase: 1.3 });
  }
}

export function drawSillPlants(pt) {
  const g = plantGeometry();
  const sillY = WIN.y0;
  pt.cyl(-0.06, 2.78, 0.05, sillY, sillY + 0.075, { mat: 'terracotta', rBottom: 0.04, inner: { k: 0.85, mat: '#3A2418' }, inkBase: 1.1 });
  pt.cyl(-0.06, 3.22, 0.055, sillY, sillY + 0.085, { mat: 'ivory', inner: { k: 0.85, mat: '#3A2418' }, inkBase: 1.1 });
  pt.cyl(-0.06, 3.66, 0.05, sillY, sillY + 0.07, { mat: 'teal', inner: { k: 0.85, mat: '#3A2418' }, inkBase: 1.1 });
  for (const lf of g.sill) drawLeaf(pt, lf, lf.kind === 'succulent' ? 'olive' : 'plant-green', { inkBase: 0.8 });
  // string-of-pearls spilling over the sill edge
  const ctx = pt.ctx;
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < 9; k++) {
      const p = [0.0 + s * 0.012 + k * 0.004, sillY + 0.06 - k * 0.045 - s * 0.01, 3.62 + s * 0.025];
      const q = pt.pt(p);
      const rr = (pt.cam.f * 0.009) / q[2];
      ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, Math.PI * 2);
      ctx.fillStyle = pt.toneAt('olive', p, [1, 0, -0.3]); ctx.fill();
      ctx.lineWidth = rr * 0.35; ctx.strokeStyle = pt.inkCss; ctx.stroke();
    }
  }
}

export function drawShelfPlant(pt) {
  const g = plantGeometry();
  const x = SHELF.x0 + 0.3, z = SHELF.z0 + 0.15;
  pt.cyl(x, z, 0.1, SHELF.h, SHELF.h + 0.14, { mat: 'cream', rBottom: 0.08, inner: { k: 0.88, mat: '#3A2418' }, inkBase: 1.4 });
  for (const v of g.shelfVine) pt.inkCurve3(v.vine, { base: 0.9, taper: 0.8 });
  for (const lf of g.pothos) drawLeaf(pt, lf, 'olive', { inkBase: 0.9 });
}
