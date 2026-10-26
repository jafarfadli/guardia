// The toon renderer. A surface is drawn in DESIGN.md's order:
//   1. flat albedo in the shade tone,
//   2. the same albedo redrawn in brighter tones inside hard-edged light bands
//      (window fill, lamp) and inside the sun patch (with cast shadows cut out),
//   3. hatching on what stays in shade,
//   4. ink.
// Redrawing albedo per light level is what keeps every edge hard: no gradients.
import { Camera, Plane, hex, css, cmul, cmix, cscale, dot, add, sub, mul, norm, cross, len, rayPlane, polyArea, clamp, rng } from './math.js';
import * as ink from './ink.js';

export class Painter {
  constructor(ctx, { W, H, dpr, cam, light, tokens, scratch }) {
    this.ctx = ctx; this.W = W; this.H = H; this.dpr = dpr;
    this.cam = cam; this.L = light; this.T = tokens;
    this.scratch = scratch; // offscreen canvas for hatching
    this.sctx = scratch.getContext('2d');
    this.palette = {};
    for (const [k, v] of Object.entries(tokens.palette)) this.palette[k] = hex(v);
    this.palette.ink = hex(tokens.ink.color);
    this.inkCss = tokens.ink.color;
    ink.setInk(tokens.ink.color, dpr);
    this.panes = [];      // window glass quads (3D), the sun's way in
    this.occluders = [];  // things that cut shadows into sun patches
    this.lightBands = []; // {center, radius, color(linear), facing?}
    this.cache = new Map();
    const L = light;
    const sky = hex(tokens.light.ambientSky), hor = hex(tokens.light.ambientHorizon), gnd = hex(tokens.light.ambientGround);
    this.amb = { sky, hor, gnd };
    this.D = mul(L.S, -1); // the sun's direction of travel
  }

  c(name) {
    if (Array.isArray(name)) return name;
    if (name.startsWith('#')) return hex(name);
    // material names from the shared list resolve to their colour
    const m = this.T.materials?.[name];
    if (m && m.color && m.color !== name) return this.c(m.color === 'ink' ? this.T.ink.color : m.color);
    const v = this.palette[name];
    if (!v) throw new Error('unknown colour ' + name);
    return v;
  }

  ambient(N) {
    const { sky, hor, gnd } = this.amb;
    let a;
    if (N[1] >= 0) a = cmix(hor, sky, N[1]); else a = cscale(cmix(hor, gnd, -N[1]), 1 + 0.3 * N[1]); // ceilings sit a step darker
    a = cmix(a, this.L.ambTint, 0.22);
    return cscale(a, this.L.amb * 0.66);
  }

  // Light reaching a surface with normal N for a given level.
  irradiance(N, level, band) {
    let e = this.ambient(N);
    if (level === 'shade') return e;
    if (level === 'deep') return cscale(e, 0.72);
    if (band) e = add(e, cscale(band.color, band.facing ? clamp(0.35 + 0.65 * Math.max(0, dot(N, band.dir))) : 1));
    if (level === 'sun') {
      const k = Math.max(0, dot(N, this.L.S));
      e = add(e, cscale(this.L.sunCol, this.L.sunI * 1.3 * (0.55 + 0.45 * k)));
    }
    return e;
  }

  tone(base, N, level, band) {
    return css(shoulder(cmul(this.c(base), this.irradiance(N, level, band))));
  }

  toneFn(N, level, band) {
    const e = this.irradiance(N, level, band);
    return (base, a = 1) => css(shoulder(cmul(this.c(base), e)), a);
  }

  // Hatching amount for a material, from the shared list.
  hatchOf(name, fallback = 0) { return this.T.materials?.[name]?.hatch ?? fallback; }

  // ---------- projection helpers ----------
  P(pts3) { return this.cam.poly(pts3); }
  pt(p3) { return this.cam.project(p3); }
  onPlane(plane) { return (u, v) => { const q = this.cam.toCam(plane.at(u, v)); return q[2] > this.cam.near ? this.cam.projC(q) : null; }; }

  clipPolys(polys) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let p of polys) {
      if (!p || p.length < 3) continue;
      if (polyArea(p) < 0) p = [...p].reverse();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
    }
    ctx.clip();
  }

  // Sun patch polygons (screen space) on the plane through `p0` with normal `N`.
  sunPatches(p0, N) {
    if (this.L.sunI <= 0.01 || dot(N, this.L.S) <= 0.02) return [];
    const k = dot(N, p0);
    const out = [];
    for (const pane of this.panes) {
      const q = pane.map((p) => rayPlane(p, this.D, N, k));
      if (q.some((x) => !x)) continue;
      out.push(this.P(q));
    }
    return out;
  }

  // Shadows of occluders inside the patch on a plane (screen space).
  castShadows(p0, N, filter) {
    if (this.L.sunI <= 0.01) return [];
    const k = dot(N, p0);
    const out = [];
    for (const occ of this.occluders) {
      if (filter && !filter(occ)) continue;
      for (const part of occ.parts) {
        const q = part.map((p) => rayPlane(p, this.D, N, k));
        if (q.some((x) => !x)) continue;
        const s = this.P(q);
        out.push(occ.hull ? hull(s) : s);
      }
    }
    return out;
  }

  // Shadows of occluders cast from a point light onto a plane (screen polygons).
  pointShadows(source, plane, ids, self) {
    const N = plane.n, k = dot(N, plane.o);
    const out = [];
    for (const occ of this.occluders) {
      if (!ids.includes(occ.id) || occ.id === self) continue;
      for (const part of occ.parts) {
        const q = part.map((p) => {
          const d = sub(p, source);
          const X = rayPlane(source, d, N, k);
          return X && dot(sub(X, source), d) > dot(d, d) ? X : null; // only beyond the occluder
        });
        if (q.some((x) => !x)) continue;
        const s = this.P(q);
        out.push(occ.hull ? hull(s) : s);
      }
    }
    return out;
  }

  // Light-band regions on a plane, as screen polygons.
  //  - sphere bands (lamps): sphere ∩ plane, a circle;
  //  - spill bands (window light): the opening projected from a virtual source behind it,
  //    which gives the straight, converging edges of light thrown through a window.
  bandPolys(plane, band) {
    if (band.spill) return this.spillPoly(plane, band.spill);
    const N = plane.n;
    const d = dot(sub(band.center, plane.o), N);
    if (Math.abs(d) >= band.radius) return null;
    const r = Math.sqrt(band.radius * band.radius - d * d);
    const c = sub(band.center, mul(N, d));
    const U = norm(plane.U), V = norm(cross(N, U));
    const pts = [];
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ph = band.radius * 3.1;
      const rr = r * (1 + 0.016 * Math.sin(a * 3 + ph) + 0.008 * Math.sin(a * 7 + ph * 2));
      pts.push(add(c, add(mul(U, Math.cos(a) * rr), mul(V, Math.sin(a) * rr))));
    }
    return this.P(pts);
  }

  spillPoly(plane, sp) {
    const N = plane.n, k = dot(N, plane.o);
    const S = sp.source;
    const side = Math.sign(k - dot(N, S)) || 1;
    // keep the part of the opening whose rays actually travel toward the plane
    const g = (A) => side * dot(N, sub(A, S)) / len(sub(A, S)) - 0.02;
    const ap = sp.aperture;
    const kept = [];
    for (let i = 0; i < ap.length; i++) {
      const a = ap[i], b = ap[(i + 1) % ap.length];
      const ga = g(a), gb = g(b);
      if (ga >= 0) kept.push(a);
      if ((ga >= 0) !== (gb >= 0)) { const t = ga / (ga - gb); kept.push(add(a, mul(sub(b, a), t))); }
    }
    if (kept.length < 3) return null;
    const out = [];
    for (const A of kept) {
      const X = rayPlane(S, sub(A, S), N, k);
      if (!X) return null;
      out.push(X);
    }
    return this.P(out);
  }

  // Is a world point lit by a band?
  inBand(p, band) {
    if (band.spill && band.spill.ring) {
      const { source: S, aperture: ap } = band.spill;
      const c = centroid3(ap);
      const n = norm(cross(sub(ap[1], ap[0]), sub(ap[2], ap[0])));
      const X = rayPlane(S, sub(p, S), n, dot(n, c));
      if (!X || dot(sub(X, S), sub(X, S)) > dot(sub(p, S), sub(p, S))) return false;
      return len(sub(X, c)) < len(sub(ap[0], c));
    }
    if (band.spill) {
      const { source: S, aperture: ap } = band.spill;
      const x0 = ap[0][0];
      if ((p[0] - x0) * (S[0] - x0) >= 0) return false;
      const t = (x0 - S[0]) / (p[0] - S[0]);
      const y = S[1] + (p[1] - S[1]) * t, z = S[2] + (p[2] - S[2]) * t;
      const ys = ap.map((v) => v[1]), zs = ap.map((v) => v[2]);
      return y > Math.min(...ys) && y < Math.max(...ys) && z > Math.min(...zs) && z < Math.max(...zs);
    }
    const d = sub(p, band.center);
    return dot(d, d) < band.radius * band.radius;
  }

  // ---------- the core: a lit surface ----------
  // s = { outline: [p3], plane: Plane, N?, albedo(tone), hatch?: {amount, angle, spacing}, shadows?: bool,
  //       noBands?: bool, sunFilter?: fn }
  surface(s) {
    const ctx = this.ctx;
    const plane = s.plane;
    const N = s.N ?? plane.n;
    const scr = this.P(s.outline);
    if (scr.length < 3) return { scr, lit: [] };
    ctx.save();
    ink.clipTo(ctx, scr);
    s.albedo(this.toneFn(N, 'shade'), 'shade');
    const litPolys = [];
    if (!s.noBands) {
      for (const band of this.lightBands) {
        if (band.facing && dot(N, band.dir) < -0.05) continue;
        if (band.spill && band.spill.ring && dot(N, sub(band.spill.source, plane.o)) <= 0) continue; // lamp behind this face
        const bp = this.bandPolys(plane, band);
        if (!bp) continue;
        ctx.save();
        this.clipPolys([bp]);
        s.albedo(this.toneFn(N, 'fill', band), 'fill');
        if (band.shadowIds && band.spill) {
          const sh = this.pointShadows(band.spill.source, plane, band.shadowIds, s.shadowSelf);
          if (sh.length) { ctx.save(); this.clipPolys(sh); s.albedo(this.toneFn(N, 'shade'), 'shade'); ctx.restore(); }
        }
        ctx.restore();
        litPolys.push(bp);
        if (band.core) {
          const core = this.bandPolys(plane, { ...band, radius: band.core });
          if (core) {
            ctx.save(); this.clipPolys([core]);
            s.albedo(this.toneFn(N, 'fill', { ...band, color: cscale(band.color, 1.65) }), 'fill');
            ctx.restore();
          }
        }
      }
    }
    const patches = s.noSun ? [] : this.sunPatches(plane.o, N);
    if (patches.length) {
      ctx.save();
      this.clipPolys(patches);
      // which band are we in? use the strongest window band for the patch's base
      const band = this.lightBands.find((b) => b.window);
      s.albedo(this.toneFn(N, 'sun', band), 'sun');
      if (s.shadows !== false) {
        const ex = s.shadowExclude;
        const sh = this.castShadows(plane.o, N, ex ? (o) => !ex.includes(o.id) : null);
        if (sh.length) {
          ctx.save();
          this.clipPolys(sh);
          s.albedo(this.toneFn(N, 'fill', band), 'fill');
          ctx.restore();
        }
      }
      ctx.restore();
      litPolys.push(...patches);
    }
    ctx.restore();
    if (s.hatch && s.hatch.amount > 0) {
      const ex = (s.hatch.exclude ?? []).map((poly) => this.P(poly));
      this.hatchShade(scr, plane, litPolys.concat(ex), s.hatch);
    }
    return { scr, lit: litPolys, patches };
  }

  hatchShade(scr, plane, litPolys, h) {
    const g = this.sctx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    ink.clipTo(g, scr);
    const box = h.box ?? [-1, -1, 7, 4];
    ink.hatch(g, this.onPlane(plane), box, {
      spacing: (h.spacing ?? 0.034) / Math.max(0.25, h.amount),
      angle: h.angle ?? 1.0,
      alpha: (h.alpha ?? 0.34) * Math.min(1, 0.55 + h.amount * 0.45),
      w: h.w ?? 0.75,
      seed: h.seed ?? 5,
      dash: h.dash ?? 0.55,
      gap: h.gap ?? 0.1,
      color: this.inkCss,
    });
    if (litPolys.length) {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      for (let p of litPolys) {
        if (!p || p.length < 3) continue;
        if (polyArea(p) < 0) p = [...p].reverse();
        g.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
        g.closePath();
      }
      g.fillStyle = '#000';
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    this.ctx.drawImage(this.scratch, 0, 0);
  }

  // ---------- ink helpers ----------
  inkW(p3, base = 2.2) { const d = this.cam.depth(p3); return ink.weight(d, base); }
  inkA(p3) { return ink.fade(this.cam.depth(p3)); }
  inkLine3(pts3, o = {}) {
    const pts = this.cam.line(pts3);
    if (pts.length < 2) return;
    const mid = pts3[Math.floor(pts3.length / 2)];
    ink.stroke(this.ctx, pts, { w: this.inkW(mid, o.base ?? 2.0), alpha: (o.alpha ?? 1) * this.inkA(mid), seed: o.seed ?? 1, taper: o.taper ?? 0.6, ...o.extra });
  }
  inkPoly3(pts3, o = {}) {
    const pts = this.P(pts3);
    if (pts.length < 2) return;
    const c = centroid3(pts3);
    ink.poly(this.ctx, pts, { w: this.inkW(c, o.base ?? 2.0), alpha: (o.alpha ?? 1) * this.inkA(c), seed: o.seed ?? 3, closed: o.closed ?? true, overshoot: o.overshoot ?? 1.4 });
  }
  inkCurve3(pts3, o = {}) {
    const pts = this.cam.line(pts3);
    if (pts.length < 2) return;
    const c = centroid3(pts3);
    ink.curve(this.ctx, pts, { w: this.inkW(c, o.base ?? 2.0), alpha: (o.alpha ?? 1) * this.inkA(c), seed: o.seed ?? 3, closed: o.closed ?? false, taper: o.taper ?? 0.7 });
  }

  // Light reaching a small object at p (normal N): the sun beam, else the strongest band
  // that contains it (lamp core, lamp cone, halo, window spill), else shade.
  lightAt(p, N) {
    if (this.inBeam(p) && (!N || dot(N, this.L.S) > 0.02)) return { level: 'sun', band: this.winBand() };
    for (let i = this.lightBands.length - 1; i >= 0; i--) {
      const b = this.lightBands[i];
      if (b.facing && N && dot(N, b.dir) < -0.05) continue;
      if (b.spill && b.spill.ring && N && dot(N, sub(b.spill.source, p)) <= 0) continue;
      if (this.inBand(p, b)) return { level: 'fill', band: b };
    }
    return { level: 'shade', band: null };
  }
  // Tone for a small object; step = -1 gives the next darker cel step (the far side).
  toneAt(base, p, N, step = 0) {
    let { level, band } = this.lightAt(p, N);
    if (step < 0) level = level === 'sun' ? 'fill' : level === 'fill' ? 'shade' : 'deep';
    if (level === 'fill' && !band) level = 'shade';
    return this.tone(base, N ?? [0, 0, -1], level, band);
  }
  levelAt(p, N) { return this.lightAt(p, N).level; }
  winBand() { return this.lightBands.find((b) => b.window); }

  // Is a world point inside the sun's beam (traced back through a pane)?
  inBeam(p) {
    const S = this.L.S;
    if (this.L.sunI <= 0.01 || S[0] >= -0.01) return false;
    const x0 = this.panes[0]?.[0]?.[0] ?? -0.12;
    const t = (x0 - p[0]) / S[0];
    if (t <= 0) return false;
    const y = p[1] + S[1] * t, z = p[2] + S[2] * t;
    for (const q of this.panes) {
      let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const v of q) { y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); }
      if (y > y0 && y < y1 && z > z0 && z < z1) return true;
    }
    return false;
  }

  // Generic convex solid from faces [{pts, N, U, V, id, mat}]: cull, sort far→near, light, ink.
  solid(faces, o = {}) {
    const C = this.cam.pos;
    const vis = [];
    for (const f of faces) {
      const c = centroid3(f.pts);
      if (dot(f.N, sub(C, c)) <= 1e-4) continue;
      const U = f.U ?? norm(sub(f.pts[1], f.pts[0]));
      const plane = new Plane(f.pts[0], U, cross(f.N, U));
      plane.n = f.N;
      vis.push({ ...f, plane, depth: this.cam.depth(c) });
    }
    vis.sort((a, b) => b.depth - a.depth);
    for (const f of vis) {
      const mat = f.mat ?? (typeof o.mat === 'function' ? o.mat(f.id) : o.mat);
      this.surface({
        outline: f.pts, plane: f.plane, N: f.N,
        albedo: o.albedo ? (T, lvl) => o.albedo(f, T, lvl, mat) : (T) => { ink.fill(this.ctx, this.P(f.pts), T(mat)); },
        hatch: o.hatch, shadows: o.shadows ?? false, shadowExclude: o.shadowExclude, shadowSelf: o.shadowSelf, noBands: o.noBands, noSun: o.noSun,
      });
      if (o.detail) o.detail(f);
    }
    if (o.ink !== false) for (const f of vis) this.inkPoly3(f.pts, { base: o.inkBase ?? 1.9, seed: (o.seed ?? 1) + (f.id?.length ?? 1) * 7 });
    return vis;
  }

  // Extrude a polygon given in the XY plane along Z (front face at z0 looks at −z).
  prismZ(xy, z0, z1, o = {}) {
    const n = xy.length;
    const area = polyArea(xy);
    const faces = [{ pts: xy.map(([x, y]) => [x, y, z0]), N: [0, 0, -1], U: [1, 0, 0], id: 'front' }];
    for (let i = 0; i < n; i++) {
      const a = xy[i], b = xy[(i + 1) % n];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      if (area < 0) { nx = -nx; ny = -ny; }
      const l = Math.hypot(nx, ny) || 1;
      faces.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], N: [nx / l, ny / l, 0], U: [0, 0, 1], id: 'side' + i });
    }
    return this.solid(faces, o);
  }

  // Vertical cylinder with banded side (hard terminator) and a top cap.
  cyl(cx, cz, r, y0, y1, o = {}) {
    const ctx = this.ctx;
    const n = o.segments ?? 28;
    const lit = this.inBeam([cx, (y0 + y1) / 2, cz]);
    const top = [], bot = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      top.push([cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r]);
      bot.push([cx + Math.cos(a) * (o.rBottom ?? r), y0, cz + Math.sin(a) * (o.rBottom ?? r)]);
    }
    const C = this.cam.pos;
    const mat = o.mat;
    const band = this.lightBands.find((b) => b.window);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const N = [Math.cos(a), 0, Math.sin(a)];
      const mid = [cx + N[0] * r, (y0 + y1) / 2, cz + N[2] * r];
      if (dot(N, sub(C, mid)) <= 0) continue;
      const col = this.toneAt(typeof mat === 'function' ? mat(a) : mat, mid, N);
      const quad = this.P([bot[i], bot[j], top[j], top[i]]);
      ink.fill(ctx, quad, col);
      // a hairline of the same colour hides seams between segments
      ctx.strokeStyle = col; ctx.lineWidth = 0.8; path2(ctx, quad); ctx.stroke();
    }
    if (o.band) o.band(top, bot);
    if (C[1] > y1 && o.cap !== false) {
      const N = [0, 1, 0];
      ink.fill(ctx, this.P(top), this.toneAt(o.capMat ?? mat, [cx, y1, cz], N));
      if (o.inner) ink.fill(ctx, this.P(top.map((p) => [cx + (p[0] - cx) * o.inner.k, y1, cz + (p[2] - cz) * o.inner.k])), this.tone(o.inner.mat, N, 'shade', band));
    }
    if (o.ink !== false) {
      const sil = hull(this.P(top).concat(this.P(bot)));
      const c = [cx, (y0 + y1) / 2, cz];
      ink.poly(ctx, sil, { w: this.inkW(c, o.inkBase ?? 1.7), alpha: this.inkA(c), seed: cx * 31 + cz, overshoot: 0.6 });
      if (C[1] > y1) ink.curve(ctx, this.P(top), { w: this.inkW(c, (o.inkBase ?? 1.7) * 0.8), alpha: this.inkA(c), closed: true, taper: 0, seed: cz * 13 });
      if (o.inner && C[1] > y1) ink.curve(ctx, this.P(top.map((p) => [cx + (p[0] - cx) * o.inner.k, y1, cz + (p[2] - cz) * o.inner.k])), { w: this.inkW(c, 1.0), alpha: this.inkA(c) * 0.8, closed: true, taper: 0 });
    }
    return { top, bot, lit };
  }

  // A round rod between two points (lamp arms, chair legs seen at a distance, cables with body).
  rod(p0, p1, r, mat, o = {}) {
    const a = this.pt(p0), b = this.pt(p1);
    if (a[2] <= 0.1 || b[2] <= 0.1) return;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const ra = (this.cam.f * r) / a[2], rb = (this.cam.f * r) / b[2];
    const q = [[a[0] + nx * ra, a[1] + ny * ra], [b[0] + nx * rb, b[1] + ny * rb], [b[0] - nx * rb, b[1] - ny * rb], [a[0] - nx * ra, a[1] - ny * ra]];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const lit = this.inBeam(mid);
    const band = this.lightBands.find((x) => x.window);
    const N = norm([-0.6, 0.3, -0.7]);
    ink.fill(this.ctx, q, this.toneAt(mat, mid, N));
    // a darker half on the far side: the cel terminator
    const q2 = [[a[0], a[1]], [b[0], b[1]], [b[0] - nx * rb, b[1] - ny * rb], [a[0] - nx * ra, a[1] - ny * ra]];
    ink.fill(this.ctx, q2, this.toneAt(mat, mid, N, -1));
    const w = this.inkW(mid, o.inkBase ?? 1.2), al = this.inkA(mid);
    ink.stroke(this.ctx, [q[0], q[1]], { w, alpha: al, taper: 0.3, seed: r * 999 });
    ink.stroke(this.ctx, [q[3], q[2]], { w, alpha: al, taper: 0.3, seed: r * 777 });
  }

  // Map a plane rectangle to a local drawing space of wPx × hPx (y down), affinely.
  // Good for small flat printed things where perspective is negligible.
  affine(plane, u0, v0, u1, v1, wPx, hPx) {
    const tl = this.pt(plane.at(u0, v1)), tr = this.pt(plane.at(u1, v1)), bl = this.pt(plane.at(u0, v0));
    const a = (tr[0] - tl[0]) / wPx, b = (tr[1] - tl[1]) / wPx;
    const c = (bl[0] - tl[0]) / hPx, d = (bl[1] - tl[1]) / hPx;
    return [a, b, c, d, tl[0], tl[1]];
  }

  // ---------- solids ----------
  // Axis-aligned box (any faces facing the camera), lit and inked like every solid.
  box(b, o = {}) {
    const [x0, x1, y0, y1, z0, z1] = b;
    const V = (x, y, z) => [x, y, z];
    return this.solid([
      { pts: [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0)], N: [0, 0, -1], U: [1, 0, 0], id: 'front' },
      { pts: [V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z1), V(x1, y1, z1)], N: [0, 0, 1], U: [-1, 0, 0], id: 'back' },
      { pts: [V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1)], N: [-1, 0, 0], U: [0, 0, -1], id: 'left' },
      { pts: [V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0)], N: [1, 0, 0], U: [0, 0, 1], id: 'right' },
      { pts: [V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)], N: [0, 1, 0], U: [1, 0, 0], id: 'top' },
      { pts: [V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0)], N: [0, -1, 0], U: [1, 0, 0], id: 'bottom' },
    ], o);
  }
}

// Hue-preserving soft shoulder so sunlit colours never clip to flat yellow-white.
function shoulder(c) {
  const m = Math.max(c[0], c[1], c[2]);
  const k = 0.82;
  if (m <= k) return c;
  const t = k + (1 - k) * (1 - Math.exp(-(m - k) / (1 - k)));
  return [c[0] * (t / m), c[1] * (t / m), c[2] * (t / m)];
}

function inSphere(p, band) {
  const d = sub(p, band.center);
  return dot(d, d) < band.radius * band.radius;
}

function path2(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function centroid3(P) {
  const c = [0, 0, 0];
  for (const p of P) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / P.length, c[1] / P.length, c[2] / P.length];
}

// Convex hull (monotone chain) of screen points.
export function hull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
