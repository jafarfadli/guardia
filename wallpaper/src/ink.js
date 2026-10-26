// Hand-inked lines: every stroke is a filled ribbon whose width breathes along its
// length, wobbles a little, tapers at loose ends and overshoots corners.
import { noise1, rng } from './math.js';

let INK = 'rgb(43,28,20)';
let SCALE = 1; // device pixels per CSS pixel; line widths below are in CSS px

export function setInk(color, scale) { INK = color; SCALE = scale; }
export const inkColor = () => INK;

function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// One continuous stroke along a polyline (screen space, device px).
export function stroke(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const w = (o.w ?? 2.2) * SCALE;
  if (w < 0.25) return;
  const seed = o.seed ?? 1;
  const taper = o.taper ?? 1; // 0 = blunt ends, 1 = tapered
  const wob = (o.wobble ?? 0.55) * SCALE;
  const breathe = o.breathe ?? 0.32;
  const p = densify(pts, 3.5 * SCALE);
  // arc length
  const s = [0];
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = s[s.length - 1];
  if (L < 0.5) return;
  const tl = Math.min(L * 0.35, (o.taperLen ?? 10) * SCALE);
  const left = [], right = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tlen = Math.hypot(tx, ty) || 1; tx /= tlen; ty /= tlen;
    const nx = -ty, ny = tx;
    const u = s[i] / SCALE;
    let ww = w * (1 + breathe * noise1(u * 0.045 + seed * 1.37, seed));
    if (taper > 0) {
      const e = Math.min(1, Math.min(s[i], L - s[i]) / tl);
      ww *= 1 - taper + taper * (0.18 + 0.82 * Math.pow(e, 0.7));
    }
    const j = wob * noise1(u * 0.03 + seed * 5.11, seed + 3);
    const x = p[i][0] + nx * j, y = p[i][1] + ny * j;
    left.push([x + (nx * ww) / 2, y + (ny * ww) / 2]);
    right.push([x - (nx * ww) / 2, y - (ny * ww) / 2]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = o.color ?? INK;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A polygon outline drawn edge by edge: each edge is its own stroke, extended a
// touch past the corner like a quick hand-inked box.
export function poly(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const r = rng((o.seed ?? 7) * 9973);
  const closed = o.closed ?? true;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.5) continue;
    const ux = dx / d, uy = dy / d;
    const ov = (o.overshoot ?? 1.6) * SCALE;
    const o0 = ov * (0.2 + r() * 0.9), o1 = ov * (0.2 + r() * 0.9);
    stroke(ctx, [[a[0] - ux * o0, a[1] - uy * o0], [b[0] + ux * o1, b[1] + uy * o1]], {
      ...o, seed: (o.seed ?? 7) + i * 13.7, taper: o.taper ?? 0.55, taperLen: Math.min(8, d / SCALE / 3),
    });
  }
}

// A smooth curve through points (Catmull-Rom), inked as one stroke.
export function curve(ctx, pts, o = {}) {
  stroke(ctx, catmull(pts, o.closed, o.res ?? 8), o);
}

export function catmull(pts, closed = false, res = 8) {
  const out = [];
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < res; k++) {
      const t = k / res, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? out[0] : pts[n - 1]);
  return out;
}

// Path helpers -------------------------------------------------------------
export function path(ctx, pts) {
  ctx.beginPath();
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
export function fill(ctx, pts, color) {
  if (!pts || pts.length < 3) return;
  path(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
}
export function clipTo(ctx, pts) { path(ctx, pts); ctx.clip(); }

// Hatching: fine parallel strokes laid out in a plane's own (u, v) space so they
// stick to the surface, then projected. `toScreen(u, v)` maps plane coords to px.
export function hatch(ctx, toScreen, box, o = {}) {
  const r = rng((o.seed ?? 3) * 7919);
  const [u0, v0, u1, v1] = box;
  const sp = o.spacing ?? 0.035;
  const ang = o.angle ?? 0.9;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const R = Math.hypot(u1 - u0, v1 - v0) / 2;
  ctx.strokeStyle = o.color ?? INK;
  ctx.lineCap = 'round';
  for (let t = -R; t <= R; t += sp * (0.85 + r() * 0.3)) {
    let a = -R;
    while (a < R) {
      const segLen = (o.dash ?? 0.5) * (0.5 + r());
      const gap = (o.gap ?? 0.08) * r();
      const b = Math.min(R, a + segLen);
      const p0 = [cu + ca * a - sa * t, cv + sa * a + ca * t];
      const p1 = [cu + ca * b - sa * t, cv + sa * b + ca * t];
      const s0 = toScreen(p0[0], p0[1]), s1 = toScreen(p1[0], p1[1]);
      if (s0 && s1) {
        ctx.globalAlpha = (o.alpha ?? 0.35) * (0.6 + r() * 0.5);
        ctx.lineWidth = (o.w ?? 0.8) * SCALE * (0.7 + r() * 0.5);
        ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
      }
      a = b + gap;
    }
  }
  ctx.globalAlpha = 1;
}

// Depth → line weight and strength, so the background stays calm.
export function weight(depth, base = 2.2) {
  const k = Math.min(1.35, Math.max(0.35, 2.6 / Math.max(0.5, depth)));
  return base * k;
}
export function fade(depth) {
  return Math.min(1, Math.max(0.4, 1.25 - depth * 0.075));
}
