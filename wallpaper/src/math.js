// Small math kit: seeded randomness, value noise, vectors, colour, a pinhole camera.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

// Integer hash → [-1, 1]. (Math.imul keeps it exact; plain float maths overflows.)
function hash1(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return ((n >>> 0) / 4294967295) * 2 - 1;
}
const seedInt = (s) => Math.round(s * 1013) | 0;

// Smooth 1D value noise in [-1, 1].
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const k = Math.imul(seedInt(seed), 7919);
  return hash1(i + k) * (1 - u) + hash1(i + 1 + k) * u;
}

export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const ks = Math.imul(seedInt(seed), 1442695041);
  const h = (a, b) => hash1((Math.imul(a, 374761393) + Math.imul(b, 668265263) + ks) | 0);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

export function fbm2(x, y, seed = 0, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f, seed + i * 31); amp *= 0.5; f *= 2.03; }
  return s;
}

// ---------- vectors ----------
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const deg = Math.PI / 180;

// ---------- colour (linear-light maths, sRGB in/out) ----------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [toLin(((n >> 16) & 255) / 255), toLin(((n >> 8) & 255) / 255), toLin((n & 255) / 255)];
}
export function css(c, a = 1) {
  const r = Math.round(clamp(toSrgb(c[0])) * 255);
  const g = Math.round(clamp(toSrgb(c[1])) * 255);
  const b = Math.round(clamp(toSrgb(c[2])) * 255);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
export const cmul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const cmix = (a, b, t) => lerp3(a, b, t);
export const cscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// ---------- camera ----------
// Pinhole camera with yaw only (verticals stay vertical, as in an illustration)
// and a lens shift so the horizon can sit where the composition wants it.
export class Camera {
  constructor({ pos, yaw = 0, fov = 70, W, H, horizon = 0.45, shiftX = 0 }) {
    this.pos = pos; this.W = W; this.H = H;
    this.yaw = yaw * deg;
    this.f = (W / 2) / Math.tan((fov * deg) / 2);
    this.cx = W / 2 + shiftX * W;
    this.cy = H * horizon;
    this.c = Math.cos(this.yaw); this.s = Math.sin(this.yaw);
    this.near = 0.08;
  }
  toCam(P) {
    const d = sub(P, this.pos);
    // rotate world → camera (yaw around Y). Positive yaw turns the view to the right.
    return [d[0] * this.c - d[2] * this.s, d[1], d[0] * this.s + d[2] * this.c];
  }
  projC(q) { return [this.cx + (this.f * q[0]) / q[2], this.cy - (this.f * q[1]) / q[2], q[2]]; }
  project(P) { return this.projC(this.toCam(P)); }
  depth(P) { return this.toCam(P)[2]; }
  // Project a 3D polygon, clipping it against the near plane first.
  poly(P) {
    const q = P.map((p) => this.toCam(p));
    const out = [];
    const n = this.near;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const ain = a[2] >= n, bin = b[2] >= n;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (n - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]);
      }
    }
    return out.map((p) => this.projC(p));
  }
  // Project a 3D polyline (open), clipping segments behind the camera.
  line(P) {
    const pts = [];
    for (const p of P) { const q = this.toCam(p); if (q[2] > this.near) pts.push(this.projC(q)); }
    return pts;
  }
}

// A planar frame in 3D: point(u, v) = o + u*U + v*V.
export class Plane {
  constructor(o, U, V) {
    this.o = o; this.U = U; this.V = V;
    this.n = norm(cross(U, V));
  }
  at(u, v) { return [this.o[0] + this.U[0] * u + this.V[0] * v, this.o[1] + this.U[1] * u + this.V[1] * v, this.o[2] + this.U[2] * u + this.V[2] * v]; }
  pts(uv) { return uv.map(([u, v]) => this.at(u, v)); }
  // A sub-frame shifted along the plane and lifted off it by `lift` (metres).
  sub(u, v, lift = 0, flipNormal = false) {
    const o = add(this.at(u, v), mul(this.n, flipNormal ? -lift : lift));
    return new Plane(o, this.U, this.V);
  }
}

// Intersect a ray (origin p, direction d) with plane n·x = k.
export function rayPlane(p, d, n, k) {
  const den = dot(n, d);
  if (Math.abs(den) < 1e-6) return null;
  const t = (k - dot(n, p)) / den;
  return t > 0 ? add(p, mul(d, t)) : null;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

export function circlePts(cx, cy, rx, ry, n = 32, a0 = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
