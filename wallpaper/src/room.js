// The room's shell: outside view, window, walls, ceiling, floor.
import { Plane, rng, fbm2, hex, css, cmix, cscale, add, mul, norm } from './math.js';
import * as ink from './ink.js';

export const ROOM = { w: 5.4, d: 5.2, h: 2.75, wallT: 0.2 };
export const WIN = { z0: 2.45, z1: 4.0, y0: 0.9, y1: 2.32, glassX: -0.12, transom: 1.86, frame: 0.055 };

function P(o, U, V, n) { const p = new Plane(o, U, V); p.n = n; return p; }
export const planes = {
  floor: P([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]), // u = z, v = x
  back: P([0, 0, ROOM.d], [1, 0, 0], [0, 1, 0], [0, 0, -1]), // u = x, v = y
  left: P([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]), // u = y, v = z
  right: P([ROOM.w, 0, ROOM.d], [0, 1, 0], [0, 0, -1], [-1, 0, 0]), // u = y, v = −z
  ceiling: P([0, ROOM.h, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0]), // u = x, v = z
};

export function windowPanes() {
  const { z0, z1, y0, y1, glassX: x, transom, frame: f } = WIN;
  const zm = (z0 + z1) / 2;
  const Q = (za, zb, ya, yb) => [[x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za]];
  return [
    Q(z0 + f, zm - f / 2, y0 + f, transom - f / 2),
    Q(zm + f / 2, z1 - f, y0 + f, transom - f / 2),
    Q(z0 + f, zm - f / 2, transom + f / 2, y1 - f),
    Q(zm + f / 2, z1 - f, transom + f / 2, y1 - f),
  ];
}

// Fill a polygon given in a plane's (u, v) coordinates, properly near-clipped.
export const fillUV = (pt, plane, uvs, col) => ink.fill(pt.ctx, pt.P(plane.pts(uvs)), col);

// ---------------------------------------------------------------- outside
// Seen only through the window: layered planes facing the camera's line of sight.
export function drawOutside(pt, L) {
  const { ctx, cam } = pt;
  const { z0, z1, y0, y1, glassX } = WIN;
  const opening = pt.P([[glassX, y0, z0], [glassX, y0, z1], [glassX, y1, z1], [glassX, y1, z0]]);
  ctx.save();
  ink.clipTo(ctx, opening);
  const winC = [glassX, (y0 + y1) / 2, (z0 + z1) / 2];
  const dir = norm([winC[0] - cam.pos[0], 0, winC[2] - cam.pos[2]]);
  const right = [dir[2], 0, -dir[0]]; // horizontal, to the right of the line of sight
  const layer = (dist) => {
    const o = add([cam.pos[0], 0, cam.pos[2]], mul(dir, dist));
    const pl = new Plane(o, right, [0, 1, 0]);
    pl.n = mul(dir, -1);
    return pl;
  };
  const F = (pl, uvs, col, a = 1) => ink.fill(ctx, pt.P(pl.pts(uvs)), css(col, a));
  const S = (pl, uvs, o) => { const p = pt.P(pl.pts(uvs)); ink.stroke(ctx, o?.closed ? [...p, p[0]] : p, o); };

  // sky: three flat bands
  const sky = layer(80);
  F(sky, [[-80, -20], [80, -20], [80, 90], [-80, 90]], L.skyTop);
  F(sky, [[-80, -20], [80, -20], [80, 16], [-80, 16]], cmix(L.skyTop, L.skyLow, 0.5));
  F(sky, [[-80, -20], [80, -20], [80, 8], [-80, 8]], L.skyLow);
  // flat clouds, faint ink
  const night = L.city > 0.5;
  const cloud = cmix(L.skyLow, hex('#F7EBD6'), night ? 0.06 : 0.6);
  const rc = rng(41);
  for (let i = 0; i < 3; i++) {
    const cu = -14 + i * 13 + rc.range(-3, 3), cv = 20 + rc.range(0, 12), wdt = 6 + rc() * 5;
    const pts = [];
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI;
      pts.push([cu - wdt + (2 * wdt * k) / 20, cv + Math.sin(a) * (1.4 + 1.2 * Math.abs(Math.sin(a * 3 + i)))]);
    }
    F(sky, pts, cloud, night ? 0.3 : 0.92);
    S(sky, pts, { w: 0.5, alpha: 0.25, taper: 1, closed: true });
  }

  const sunlit = L.sunI > 0.05;
  const shadeFac = (c, k = 1) => cscale(cmix(c, L.skyTop, 0.2), (0.3 + 0.42 * L.amb) * k);
  const litFac = (c) => sunlit ? cmix(shadeFac(c), cscale([c[0] * L.sunCol[0], c[1] * L.sunCol[1], c[2] * L.sunCol[2]], 1.25), 0.55 * L.sunI) : shadeFac(c, 1.05);
  const r = rng(1234);

  // Through this window (≈ 5.4 m away, seen at 45°) a layer at distance D shows
  // u ∈ ±0.11·D and v ∈ [1.36 − 0.085·D, 1.36 + 0.18·D] (v is height above our floor).
  // far skyline (30 m): blocks rising into the lower sky
  const far = layer(30);
  const farBlocks = [[-4.2, -2.6, 3.4], [-2.6, -1.1, 4.6], [-1.1, 0.3, 2.9], [0.3, 1.9, 5.3], [1.9, 3.4, 3.8], [3.4, 5, 4.4]];
  for (const [u0, u1, top] of farBlocks) {
    const col = cmix(pt.c(r.pick(['ivory', 'pale-blue', 'cream', 'brick'])), L.skyLow, 0.5);
    F(far, [[u0, -6], [u1, -6], [u1, top], [u0, top]], shadeFac(col, 1.15));
    for (let y = top - 0.9; y > -1; y -= 1.3) for (let u = u0 + 0.3; u < u1 - 0.3; u += 0.7) {
      const lit = L.city > 0.3 && r() < 0.5 * L.city;
      F(far, [[u, y - 0.4], [u + 0.32, y - 0.4], [u + 0.32, y], [u, y]], lit ? hex('#F4C980') : shadeFac(cmix(col, pt.c('navy'), 0.45)), lit ? 1 : 0.65);
    }
    S(far, [[u0, -6], [u0, top], [u1, top], [u1, -6]], { w: 0.4, alpha: 0.3, taper: 0 });
  }
  // a minaret-free, flag-free skyline: just a water tower far away
  S(far, [[2.6, 3.8], [2.6, 5.2]], { w: 0.5, alpha: 0.4, taper: 0 });
  F(far, [[2.25, 5.2], [2.95, 5.2], [2.85, 5.75], [2.35, 5.75]], shadeFac(pt.c('pale-blue'), 1.1));

  // houses across the street (13 m): roofs in the lower third of the window
  const mid = layer(13);
  const midBlocks = [
    { u0: -2.2, u1: -0.55, top: 1.15, col: 'brick', roof: 'green-roof' },
    { u0: -0.55, u1: 0.75, top: 1.55, col: 'cream', tank: true, antenna: true },
    { u0: 0.75, u1: 2.4, top: 0.95, col: 'pale-blue', roof: 'blue-roof' },
  ];
  for (const b of midBlocks) {
    const base = pt.c(b.col);
    F(mid, [[b.u0, -6], [b.u1, -6], [b.u1, b.top], [b.u0, b.top]], shadeFac(base));
    if (b.col === 'brick') for (let y = -5.5; y < b.top; y += 0.16) S(mid, [[b.u0, y], [b.u1, y]], { w: 0.25, alpha: 0.14, taper: 0, wobble: 0.1 });
    for (let u = b.u0 + 0.22; u < b.u1 - 0.3; u += 0.62) {
      const y = b.top - 0.32;
      const lit = L.city > 0.3 && r() < 0.6 * L.city;
      const wc = lit ? cmix(hex('#F2C277'), hex('#FFE3A8'), r()) : shadeFac(cmix(base, pt.c('navy'), 0.6), 0.8);
      F(mid, [[u, y - 0.42], [u + 0.3, y - 0.42], [u + 0.3, y], [u, y]], wc);
      S(mid, [[u, y - 0.42], [u + 0.3, y - 0.42], [u + 0.3, y], [u, y]], { w: 0.4, alpha: 0.4, taper: 0.2, closed: true });
    }
    if (b.roof) {
      const roof = [[b.u0 - 0.15, b.top], [b.u1 + 0.15, b.top], [b.u1 - 0.25, b.top + 0.55], [b.u0 + 0.25, b.top + 0.55]];
      F(mid, roof, litFac(pt.c(b.roof)));
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        S(mid, [[b.u0 - 0.15 + (b.u1 - b.u0 + 0.3) * t, b.top], [b.u0 + 0.25 + (b.u1 - b.u0 - 0.5) * t, b.top + 0.55]], { w: 0.25, alpha: 0.2, taper: 0, wobble: 0.08 });
      }
      S(mid, roof, { w: 0.5, alpha: 0.5, taper: 0, closed: true });
    }
    if (b.tank) {
      const tu = b.u0 + (b.u1 - b.u0) * 0.68;
      S(mid, [[tu - 0.2, b.top], [tu - 0.2, b.top + 0.22]], { w: 0.4, alpha: 0.6, taper: 0 });
      S(mid, [[tu + 0.2, b.top], [tu + 0.2, b.top + 0.22]], { w: 0.4, alpha: 0.6, taper: 0 });
      const body = [];
      for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; body.push([tu + Math.cos(a) * 0.24, b.top + 0.52 + Math.sin(a) * 0.07]); }
      body.push([tu - 0.24, b.top + 0.22], [tu + 0.24, b.top + 0.22]);
      F(mid, body, litFac(hex('#3F6874')));
      S(mid, body, { w: 0.45, alpha: 0.55, taper: 0, closed: true });
    }
    if (b.antenna) {
      const au = b.u0 + 0.3;
      S(mid, [[au, b.top], [au, b.top + 1.0]], { w: 0.4, alpha: 0.6, taper: 0.4 });
      for (let k = 0; k < 3; k++) S(mid, [[au - 0.28 + k * 0.05, b.top + 0.6 + k * 0.12], [au + 0.28 - k * 0.05, b.top + 0.6 + k * 0.12]], { w: 0.35, alpha: 0.55, taper: 0.3 });
    }
    S(mid, [[b.u0, -6], [b.u0, b.top], [b.u1, b.top], [b.u1, -6]], { w: 0.45, alpha: 0.45, taper: 0 });
  }

  // near: a power pole at the left edge with sagging lines (5.2 m)
  const near = layer(5.2);
  const pole = [[-0.52, -6], [-0.45, -6], [-0.46, 2.6], [-0.51, 2.6]];
  F(near, pole, shadeFac(pt.c('ivory'), 0.7));
  S(near, pole, { w: 0.8, alpha: 0.8, taper: 0, closed: true });
  S(near, [[-0.75, 2.42], [-0.2, 2.42]], { w: 0.9, alpha: 0.8, taper: 0.2 });
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = -0.48 + i * 0.1; pts.push([u, 2.4 - k * 0.04 - 0.3 * Math.sin((i / 16) * Math.PI * 0.85)]); }
    S(near, pts, { w: 0.6, alpha: 0.75, taper: 0, wobble: 0.15 });
  }
  // a mango tree's crown leaning into the top-right of the view (7.5 m)
  const tree = layer(7.5);
  const lr = rng(77);
  const leafBase = pt.c('plant-green');
  for (let i = 0; i < 30; i++) {
    const cu = 0.15 + lr() * 0.95, cv = 2.0 + lr() * 0.95;
    const sz = 0.1 + lr() * 0.12;
    const pts = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const rr = sz * (0.75 + 0.35 * Math.sin(a * 3 + i)); pts.push([cu + Math.cos(a) * rr * 1.3, cv + Math.sin(a) * rr * 0.6]); }
    const lit = lr() < 0.45;
    F(tree, pts, lit ? litFac(leafBase) : shadeFac(leafBase, 0.85));
    S(tree, pts, { w: 0.45, alpha: 0.5, taper: 1, closed: true });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- walls
// Paint with history: flecks, a yellowed band near the ceiling, damp tide-marks.
export function wallAlbedo(pt, plane, T, opts) {
  const { ctx } = pt;
  const [u0, v0, u1, v1] = opts.box;
  fillUV(pt, plane, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], T(opts.paint));
  if (opts.yellowTop) {
    const y = opts.yellowTop;
    const pts = [];
    for (let u = u0; u <= u1 + 0.001; u += 0.1) pts.push([u, y + 0.05 * Math.sin(u * 2.3) + 0.03 * Math.sin(u * 7.1)]);
    pts.push([u1, v1 + 0.5], [u0, v1 + 0.5]);
    fillUV(pt, plane, pts, T(cmix(pt.c(opts.paint), pt.c('mustard'), 0.12)));
  }
  for (const st of opts.stains ?? []) stain(pt, plane, T, opts.paint, st);
  for (const g of opts.ghosts ?? []) ghost(pt, plane, T, opts.paint, g);
  if (opts.extra) opts.extra(T);
  // plaster flecks: tiny ink specks, sparse
  const toS = pt.onPlane(plane);
  const r = rng(opts.seed ?? 11);
  const n = opts.flecks ?? 420;
  ctx.fillStyle = pt.inkCss;
  for (let i = 0; i < n; i++) {
    const u = u0 + r() * (u1 - u0), v = v0 + r() * (v1 - v0);
    const p = toS(u, v);
    if (!p) continue;
    ctx.globalAlpha = 0.16 + r() * 0.2;
    const s = (0.6 + r() * 1.0) * pt.dpr;
    ctx.fillRect(p[0], p[1], s, s * (0.5 + r()));
  }
  ctx.globalAlpha = 1;
}

function stain(pt, plane, T, paint, st) {
  const base = pt.c(paint);
  const rings = st.rings ?? 3;
  for (let k = 0; k < rings; k++) {
    const s = 1 - k * 0.24;
    const pts = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 0.78 + 0.9 * fbm2(Math.cos(a) * 1.6 + st.seed, Math.sin(a) * 1.6 + k * 0.9, st.seed, 4);
      const rr = st.r * s * wob;
      const dy = Math.sin(a) < 0 ? 1 + (st.drip ?? 0.6) * Math.pow(-Math.sin(a), 3) : 1; // damp runs downward
      pts.push([st.u + Math.cos(a) * rr * (st.sx ?? 1), st.v + Math.sin(a) * rr * dy]);
    }
    const col = cmix(base, pt.c(st.col ?? 'mustard'), (st.k ?? 0.16) * (0.45 + k * 0.2));
    fillUV(pt, plane, pts, T(col));
    if (k === 0) {
      const p = pt.P(plane.pts(pts));
      ink.stroke(pt.ctx, [...p, p[0]], { w: 0.5, alpha: 0.2, taper: 0, color: T(cmix(base, pt.c('dark-wood'), 0.5)) });
    }
  }
}

function ghost(pt, plane, T, paint, g) {
  const base = pt.c(paint);
  fillUV(pt, plane, [[g.u0, g.v0], [g.u1, g.v0], [g.u1, g.v1], [g.u0, g.v1]], T(cmix(base, hex('#E8EDF0'), 0.16)));
  const tape = (u, v, a) => {
    const w = 0.055, h = 0.02, ca = Math.cos(a), sa = Math.sin(a);
    fillUV(pt, plane, [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [u + x * ca - y * sa, v + x * sa + y * ca]), T(cmix(pt.c('cream'), pt.c('mustard'), 0.35), 0.92));
  };
  tape(g.u0 + 0.01, g.v1 - 0.01, 0.6);
  tape(g.u1 - 0.01, g.v1 - 0.02, -0.5);
  tape(g.u1 - 0.02, g.v0 + 0.01, 0.4);
  if (g.scrap) fillUV(pt, plane, [[g.u0, g.v0 + 0.02], [g.u0 + 0.09, g.v0], [g.u0 + 0.07, g.v0 + 0.06], [g.u0 + 0.02, g.v0 + 0.11]], T('muted-red'));
}
