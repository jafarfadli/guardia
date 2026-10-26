// Music corner: an acoustic guitar leaning on the wall, and a crate of records with the
// sleeve of whatever is playing right now (the host app sends it; pixel art like all pictures).
import { Plane, rng, norm, cross, add, mul, sub, cmix } from './math.js';
import * as ink from './ink.js';
import { ROOM } from './room.js';

// ------------------------------------------------------------------ guitar
export function drawGuitar(pt) {
  const ctx = pt.ctx;
  const bottom = [3.42, 0.01, 4.98], top = [3.22, 1.02, ROOM.d - 0.03];
  const up = norm(sub(top, bottom));
  const facing = norm([-0.2, 0.15, -1]);
  const side = mul(norm(cross(up, facing)), -1);
  const N = norm(cross(side, up));
  const at = (s, t) => add(bottom, add(mul(side, s), mul(up, t)));
  const len = 1.03;
  // body outline: two bouts and a waist
  const half = (t) => {
    const c1 = 0.2, r1 = 0.19, c2 = 0.43, r2 = 0.145;
    const a = Math.abs(t - c1) < r1 ? Math.sqrt(r1 * r1 - (t - c1) ** 2) : 0;
    const b = Math.abs(t - c2) < r2 ? Math.sqrt(r2 * r2 - (t - c2) ** 2) : 0;
    const waist = t > 0.25 && t < 0.4 ? 0.118 + 0.02 * Math.cos(((t - 0.325) / 0.075) * Math.PI) : 0;
    return Math.max(a, b, waist);
  };
  const L = [], R = [];
  for (let t = 0.01; t <= 0.575; t += 0.01) { const w = half(t); L.push(at(-w, t)); R.push(at(w, t)); }
  const body = [...L, ...R.reverse()];
  // stepped shadow on the wall behind
  const wallZ = ROOM.d - 0.005;
  const shadow = body.map((p) => [p[0] + 0.035, p[1] - 0.012, wallZ]);
  ink.fill(ctx, pt.P(shadow), pt.tone('dusty-blue', [0, 0, -1], 'deep'));
  const neck = [at(-0.024, 0.55), at(0.024, 0.55), at(0.02, 0.9), at(-0.02, 0.9)];
  const head = [at(-0.032, 0.9), at(0.032, 0.9), at(0.04, len), at(-0.036, len)];
  const P0 = at(0, 0.3);
  const T = (c) => pt.toneAt(c, P0, N);
  ink.fill(ctx, pt.P(body), T('pine'));
  // a sunburst edge printed as one darker step
  const inner = [];
  for (let t = 0.04; t <= 0.555; t += 0.01) inner.push(at(-half(t) * 0.84, t));
  for (let t = 0.555; t >= 0.04; t -= 0.01) inner.push(at(half(t) * 0.84, t));
  ink.fill(ctx, pt.P(body), T(cmix(pt.c('cherry'), pt.c('light-wood'), 0.35)));
  ink.fill(ctx, pt.P(inner), T('pine'));
  ink.fill(ctx, pt.P(neck), T('dark-wood'));
  ink.fill(ctx, pt.P(head), T('dark-wood'));
  // soundhole, rosette, pickguard, bridge
  const circ = (cs, ct, r, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return at(cs + Math.cos(a) * r, ct + Math.sin(a) * r); });
  ink.fill(ctx, pt.P(circ(0, 0.39, 0.058)), T('mustard'));
  ink.fill(ctx, pt.P(circ(0, 0.39, 0.047)), pt.tone('#2E1E16', N, 'shade'));
  const guard = [at(0.035, 0.32), at(0.1, 0.3), at(0.12, 0.36), at(0.07, 0.42), at(0.04, 0.37)];
  ink.fill(ctx, pt.P(guard), T('cherry'));
  const bridge = [at(-0.07, 0.115), at(0.07, 0.115), at(0.07, 0.14), at(-0.07, 0.14)];
  ink.fill(ctx, pt.P(bridge), T('dark-wood'));
  // ink
  const c = at(0, 0.3);
  ink.curve(ctx, pt.P(body), { w: pt.inkW(c, 1.7), closed: true, taper: 0, seed: 101 });
  pt.inkPoly3(neck, { base: 1.2, seed: 102 });
  pt.inkPoly3(head, { base: 1.2, seed: 103 });
  pt.inkCurve3(circ(0, 0.39, 0.047), { base: 1.0, closed: true, taper: 0 });
  pt.inkCurve3(circ(0, 0.39, 0.058), { base: 0.6, closed: true, taper: 0, alpha: 0.7 });
  pt.inkPoly3(guard, { base: 0.8 });
  pt.inkPoly3(bridge, { base: 0.9 });
  for (let f = 0; f < 9; f++) { const t = 0.57 + f * 0.037; pt.inkLine3([at(-0.022, t), at(0.022, t)], { base: 0.45, alpha: 0.7, taper: 0 }); }
  for (let s = 0; s < 6; s++) { const x = -0.015 + s * 0.006; pt.inkLine3([at(x * 1.6, 0.128), at(x, 0.9)], { base: 0.3, alpha: 0.75, taper: 0, extra: { wobble: 0 } }); }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const q = pt.pt(at(s * 0.045, 0.93 + k * 0.032));
    const r = (pt.cam.f * 0.008) / q[2];
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.fillStyle = T('ivory'); ctx.fill();
    ctx.lineWidth = Math.max(0.7, r * 0.3); ctx.strokeStyle = pt.inkCss; ctx.stroke();
  }
}

// ------------------------------------------------------------------ record crate
export const CRATE = { x0: 4.62, x1: 5.22, z0: 3.62, z1: 4.08, h: 0.36 };
export function drawRecords(pt, nowPlaying) {
  const ctx = pt.ctx;
  const k = CRATE;
  // records standing inside: sleeve tops peeking over the rim
  const r = rng(17);
  const cols = ['navy', 'muted-red', 'mustard', 'teal', 'cream', 'olive', 'ink', 'pale-blue'];
  for (let i = 0; i < 12; i++) {
    const z = k.z1 - 0.03 - i * 0.034;
    const tilt = (r() - 0.5) * 0.04;
    const sl = [[k.x0 + 0.03, k.h - 0.05, z], [k.x1 - 0.03, k.h - 0.05, z + tilt], [k.x1 - 0.03, k.h + 0.03 + r() * 0.02, z + tilt], [k.x0 + 0.03, k.h + 0.02 + r() * 0.02, z]];
    ink.fill(ctx, pt.P(sl), pt.toneAt(r.pick(cols), [(k.x0 + k.x1) / 2, k.h, z], [0, 0.3, -1]));
    pt.inkPoly3(sl, { base: 0.8, seed: i });
  }
  // the slatted crate
  pt.box([k.x0, k.x1, 0, k.h, k.z0, k.z1], {
    mat: 'light-wood', inkBase: 1.5, seed: 77,
    detail: (f) => {
      if (f.id === 'top') return;
      const pts = f.pts;
      // slats: two gaps across each visible side
      for (const t of [0.33, 0.66]) {
        const a = add(pts[0], mul(sub(pts[3], pts[0]), t)), b = add(pts[1], mul(sub(pts[2], pts[1]), t));
        const a2 = add(a, [0, 0.022, 0]), b2 = add(b, [0, 0.022, 0]);
        ink.fill(ctx, pt.P([a, b, b2, a2]), pt.tone('#3A2418', f.N, 'shade'));
        pt.inkLine3([a, b], { base: 0.8 });
        pt.inkLine3([a2, b2], { base: 0.8 });
      }
    },
  });
  // the sleeve of what is playing now, leaning against the crate
  const s0 = [k.x0 + 0.08, 0.0, k.z0 - 0.09], s1 = [k.x0 + 0.42, 0.0, k.z0 - 0.09];
  const t0 = [k.x0 + 0.08, 0.32, k.z0 - 0.005], t1 = [k.x0 + 0.42, 0.32, k.z0 - 0.005];
  const sleeve = [s0, s1, t1, t0];
  const N = norm(cross(sub(s1, s0), sub(t0, s0)));
  const T = (c) => pt.toneAt(c, [k.x0 + 0.25, 0.16, k.z0 - 0.05], N);
  ctx.save();
  // affine map: local 320 × 320, origin at the sleeve's top-left
  const tl = pt.pt(t0), tr = pt.pt(t1), bl = pt.pt(s0);
  ctx.setTransform((tr[0] - tl[0]) / 320, (tr[1] - tl[1]) / 320, (bl[0] - tl[0]) / 320, (bl[1] - tl[1]) / 320, tl[0], tl[1]);
  sleeveArt(ctx, 320, T, nowPlaying);
  ctx.restore();
  pt.inkPoly3(sleeve, { base: 1.2, seed: 88 });
}

function sleeveArt(ctx, w, T, np) {
  if (np && Array.isArray(np.art) && np.art.length) {
    // the host sends a small quantised cover (n × n hex colours)
    const n = Math.round(Math.sqrt(np.art.length));
    const px = w / n;
    for (let i = 0; i < np.art.length; i++) {
      ctx.fillStyle = T(np.art[i]);
      ctx.fillRect((i % n) * px, Math.floor(i / n) * px, px + 0.7, px + 0.7);
    }
    return;
  }
  // default sleeve: a printed sun over the sea
  ctx.fillStyle = T('#E2D1AE'); ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = T('#B04A3A'); ctx.beginPath(); ctx.arc(w * 0.5, w * 0.52, w * 0.26, Math.PI, 0); ctx.fill();
  ctx.fillStyle = T('#34466A');
  for (let i = 0; i < 5; i++) ctx.fillRect(0, w * 0.55 + i * w * 0.07, w, w * 0.04);
  ctx.fillStyle = T('#2B1C14');
  ctx.font = `${w * 0.12}px "Alfa Slab One"`;
  ctx.fillText('SENJA', w * 0.08, w * 0.2);
  ctx.font = `700 ${w * 0.06}px "Shantell Sans"`;
  ctx.fillText('side A · 33⅓', w * 0.08, w * 0.92);
}
