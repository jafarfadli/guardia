// Things that live flat on the back wall. Their colour is drawn inside the wall's own
// lighting passes (so the sun patch and light bands fall across them); their ink and
// a little relief come afterwards.
import { cmix } from './math.js';
import * as ink from './ink.js';
import { ROOM, planes, fillUV } from './room.js';
import { calendarPage, clockFace, poster, corkBoard } from './printed.js';

const d = ROOM.d;
export const DECOR = {
  cork: { u0: 1.2, v0: 1.32, u1: 2.3, v1: 1.94, frame: 0.032 },
  cal: { u0: 2.42, v0: 1.36, u1: 2.73, v1: 1.83 },
  clock: { u: 1.74, v: 2.24, r: 0.155 },
  poster: { u0: 2.98, v0: 1.12, u1: 3.68, v1: 2.1 },
  outlet: { u0: 2.86, v0: 0.26, u1: 2.97, v1: 0.37 },
  switch: { u0: 3.78, v0: 1.14, u1: 3.86, v1: 1.27 },
};

const Q = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

export function decorAlbedo(pt, T) {
  const { ctx } = pt;
  const B = planes.back;
  const shadowCol = T(cmix(pt.c('dusty-blue'), pt.c('ink'), 0.42));
  const drop = (uvs, du = 0.016, dv = -0.02) => fillUV(pt, B, uvs.map(([u, v]) => [u + du, v + dv]), shadowCol);

  // cork board: stepped drop shadow, wooden frame, cork and everything pinned to it
  const c = DECOR.cork;
  drop(Q(c.u0, c.v0, c.u1, c.v1));
  fillUV(pt, B, Q(c.u0, c.v0, c.u1, c.v1), T('dark-wood'));
  const f = c.frame;
  withAffine(pt, B, c.u0 + f, c.v0 + f, c.u1 - f, c.v1 - f, 1100, 620, () => corkBoard(ctx, 1100, 620, T, pt.now));

  // tear-off calendar on a nail
  const k = DECOR.cal;
  drop(Q(k.u0, k.v0, k.u1, k.v1), 0.012, -0.016);
  withAffine(pt, B, k.u0, k.v0, k.u1, k.v1, 310, 470, () => calendarPage(ctx, 310, 470, pt.now, T));

  // wall clock
  const ck = DECOR.clock;
  const ring = (r, du = 0, dv = 0) => Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [ck.u + du + Math.cos(a) * r, ck.v + dv + Math.sin(a) * r]; });
  fillUV(pt, B, ring(ck.r, 0.014, -0.02), shadowCol);
  withAffine(pt, B, ck.u - ck.r, ck.v - ck.r, ck.u + ck.r, ck.v + ck.r, 400, 400, () => clockFace(ctx, 200, pt.now, T));

  // the gig poster, one corner torn
  const p = DECOR.poster;
  drop(Q(p.u0, p.v0, p.u1, p.v1), 0.01, -0.014);
  ctx.save();
  ink.clipTo(ctx, pt.P(B.pts(posterOutline())));
  withAffine(pt, B, p.u0, p.v0, p.u1, p.v1, 700, 980, () => poster(ctx, 700, 980, T));
  ctx.restore();
  const tape = (u, v, a) => {
    const w = 0.05, h = 0.018, ca = Math.cos(a), sa = Math.sin(a);
    fillUV(pt, B, [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [u + x * ca - y * sa, v + x * sa + y * ca]), T(cmix(pt.c('cream'), pt.c('mustard'), 0.3), 0.9));
  };
  tape(p.u0 + 0.02, p.v1 - 0.01, 0.7);
  tape(p.u1 - 0.02, p.v1 - 0.012, -0.6);

  // outlet and light switch
  for (const o of [DECOR.outlet, DECOR.switch]) fillUV(pt, B, Q(o.u0, o.v0, o.u1, o.v1), T('ivory'));
}

function posterOutline() {
  const p = DECOR.poster;
  return [[p.u0, p.v0 + 0.06], [p.u0 + 0.05, p.v0], [p.u1 - 0.09, p.v0], [p.u1 - 0.05, p.v0 + 0.03], [p.u1, p.v0 + 0.02], [p.u1, p.v1], [p.u0, p.v1]];
}

function withAffine(pt, plane, u0, v0, u1, v1, w, h, fn) {
  const { ctx } = pt;
  ctx.save();
  const m = pt.affine(plane, u0, v0, u1, v1, w, h);
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  fn();
  ctx.restore();
}

// Polygons the wall hatching must leave alone (paper and wood stay clean).
export function decorExclude() {
  const lift = (uvs) => uvs.map(([u, v]) => [u, v, d]);
  const c = DECOR.cork, k = DECOR.cal, p = DECOR.poster, ck = DECOR.clock;
  return [
    lift(Q(c.u0, c.v0, c.u1, c.v1)),
    lift(Q(k.u0, k.v0, k.u1, k.v1)),
    lift(posterOutline()),
    lift(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [ck.u + Math.cos(a) * ck.r * 1.03, ck.v + Math.sin(a) * ck.r * 1.03]; })),
    lift(Q(DECOR.outlet.u0, DECOR.outlet.v0, DECOR.outlet.u1, DECOR.outlet.v1)),
    lift(Q(DECOR.switch.u0, DECOR.switch.v0, DECOR.switch.u1, DECOR.switch.v1)),
  ];
}

export function decorInk(pt) {
  const z = d - 0.004;
  const W = (uvs) => uvs.map(([u, v]) => [u, v, z]);
  const c = DECOR.cork;
  pt.inkPoly3(W(Q(c.u0, c.v0, c.u1, c.v1)), { base: 1.7, seed: 21 });
  pt.inkPoly3(W(Q(c.u0 + c.frame, c.v0 + c.frame, c.u1 - c.frame, c.v1 - c.frame)), { base: 1.1, seed: 22 });
  const k = DECOR.cal;
  pt.inkPoly3(W(Q(k.u0, k.v0, k.u1, k.v1)), { base: 1.4, seed: 23 });
  // nail and string
  const nail = [(k.u0 + k.u1) / 2, k.v1 + 0.09, z];
  pt.inkLine3([[k.u0 + 0.06, k.v1, z], nail, [k.u1 - 0.06, k.v1, z]], { base: 0.9, seed: 24, taper: 0.2 });
  pt.inkLine3([[k.u0 + 0.01, k.v0 - 0.006, z], [k.u1 - 0.01, k.v0 - 0.006, z]], { base: 0.7, seed: 25, alpha: 0.6 });
  pt.inkLine3([[k.u0 + 0.02, k.v0 - 0.012, z], [k.u1 - 0.02, k.v0 - 0.012, z]], { base: 0.6, seed: 26, alpha: 0.5 });
  const ck = DECOR.clock;
  const circ = (r) => Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [ck.u + Math.cos(a) * r, ck.v + Math.sin(a) * r, z]; });
  pt.inkCurve3(circ(ck.r), { base: 1.7, seed: 27, closed: true, taper: 0 });
  pt.inkCurve3(circ(ck.r * 0.84), { base: 0.9, seed: 28, closed: true, taper: 0 });
  pt.inkPoly3(W(posterOutline()), { base: 1.4, seed: 29 });
  // the torn flap curls forward a little
  const p = DECOR.poster;
  pt.inkLine3(W([[p.u1 - 0.09, p.v0], [p.u1 - 0.07, p.v0 + 0.035], [p.u1 - 0.05, p.v0 + 0.03]]), { base: 1.0, seed: 30 });
  for (const o of [DECOR.outlet, DECOR.switch]) pt.inkPoly3(W(Q(o.u0, o.v0, o.u1, o.v1)), { base: 1.1, seed: 31 });
  const o = DECOR.outlet;
  pt.inkLine3(W([[o.u0 + 0.035, o.v0 + 0.05], [o.u0 + 0.035, o.v0 + 0.065]]), { base: 1.2 });
  pt.inkLine3(W([[o.u1 - 0.035, o.v0 + 0.05], [o.u1 - 0.035, o.v0 + 0.065]]), { base: 1.2 });
  const s = DECOR.switch;
  pt.inkPoly3(W(Q(s.u0 + 0.025, s.v0 + 0.035, s.u1 - 0.025, s.v1 - 0.035)), { base: 0.9 });
}
