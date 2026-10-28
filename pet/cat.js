// Maestro and Maestra, chibi edition, drawn in the room's ink: he a round orange tabby, she a
// tuxedo (black, with a white bib, socks, muzzle and a blaze between the eyes).
// The whole cat is one silhouette: every part is inked first with a wide stroke, then all parts
// are filled on top, so only the outer contour keeps its ink and nothing looks bolted on.
import { catmull, stroke, setInk } from '../wallpaper/src/ink.js';

export const COATS = {
  maestro: {
    coat: 'tabby',
    fur: '#E08E46', furLit: '#F0AE66', furShade: '#BF6D33', furDeep: '#A35A2A',
    stripe: '#B4602C', cream: '#F5E4C3', creamShade: '#DCC49B',
    pink: '#E39A8E', blush: 'rgba(226,120,110,0.55)', eye: '#2B1C14', shine: '#FFF8EA', ink: '#2B1C14',
    line: '#2B1C14', whisker: '#2B1C14',
  },
  maestra: {
    coat: 'tuxedo',
    fur: '#3A3537', furLit: '#5A5253', furShade: '#2A2628', furDeep: '#1E1B1C',
    stripe: '#3A3537', cream: '#F3EDE1', creamShade: '#D6CCBA',
    pink: '#E8A194', blush: 'rgba(232,130,120,0.6)', eye: '#1C1512', iris: '#C3C25A', shine: '#FFF8EA', ink: '#2B1C14',
    // lines drawn over black fur (closed eyes, lids, whiskers) are light, as on a printed black cat
    line: '#E6DDCB', whisker: '#EEE7D8',
  },
};
// the coat being drawn (poses.js reads it for its extras)
export let COL = COATS.maestro;

const W = 1.9; // ink weight in cell px
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

// ---------------------------------------------------------------- shapes
function ellipse(c, rx, ry, a = 0, n = 40) {
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return add(c, rot([Math.cos(t) * rx, Math.sin(t) * ry], a)); });
}

// A soft blob through relative control points (x, y in units of rx, ry).
function blob(c, rx, ry, rel, a = 0) {
  return catmull(rel.map(([x, y]) => add(c, rot([x * rx, y * ry], a))), true, 7);
}

// A stubby leg: a capsule from the hip (inside the body) to the paw.
function leg(hip, foot, r0, r1) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
  const L = Math.hypot(dx, dy) || 1;
  const u = [dx / L, dy / L], n = [-dy / L, dx / L];
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = (i / 12) * Math.PI; pts.push([foot[0] + (n[0] * Math.cos(t) + u[0] * Math.sin(t)) * r1, foot[1] + (n[1] * Math.cos(t) + u[1] * Math.sin(t)) * r1]); }
  for (let i = 0; i <= 12; i++) { const t = (i / 12) * Math.PI; pts.push([hip[0] - (n[0] * Math.cos(t) + u[0] * Math.sin(t)) * r0, hip[1] - (n[1] * Math.cos(t) + u[1] * Math.sin(t)) * r0]); }
  return pts;
}

function tail(points, w0, w1) {
  const spine = catmull(points, false, 10);
  const L = [], R = [];
  for (let i = 0; i < spine.length; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = i / (spine.length - 1);
    const w = w0 + (w1 - w0) * t;
    L.push([spine[i][0] - ty * w, spine[i][1] + tx * w]);
    R.push([spine[i][0] + ty * w, spine[i][1] - tx * w]);
  }
  const tip = spine[spine.length - 1];
  const a = spine[spine.length - 2];
  const ang = Math.atan2(tip[1] - a[1], tip[0] - a[0]);
  const cap = Array.from({ length: 9 }, (_, i) => { const t = ang - Math.PI / 2 + (i / 8) * Math.PI; return [tip[0] + Math.cos(t) * w1, tip[1] + Math.sin(t) * w1]; });
  return { outline: [...L, ...cap, ...R.reverse()], spine };
}

function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function fill(ctx, pts, col) { path(ctx, pts); ctx.fillStyle = col; ctx.fill(); }
function within(ctx, pts, fn) { ctx.save(); path(ctx, pts); ctx.clip(); fn(); ctx.restore(); }
const inkLine = (ctx, pts, w, o = {}) => {
  if (o.color) setInk(o.color, 1);
  stroke(ctx, pts, { w, taper: o.taper ?? 0.7, seed: o.seed ?? 3, wobble: 0.25, breathe: 0.2, alpha: o.alpha ?? 1 });
  if (o.color) setInk(COL.ink, 1);
};

// ---------------------------------------------------------------- the cat
// pose: {
//   body: {x, y, rx, ry, a, shape: 'bean'|'sit'|'loaf'}, head: {x, y, r, a}, ears: lift (−1 flat … 1 perked),
//   legs: [{hip, foot, far}], tail: [[x,y]…], eyes: 'open'|'closed'|'happy'|'sleepy'|'half', blink, mouth: 'w'|'open'|'smile',
//   look: [dx, dy] pupil offset, extra(ctx) }
export function drawCat(ctx, pose, coat = COATS.maestro) {
  COL = coat;
  setInk(COL.ink, 1);
  const parts = buildParts(pose);
  // 1 · ink every part's edge, wide; 2 · fill every part on top; only the union's rim stays inked
  for (const p of parts) stroke(ctx, [...p.outline, p.outline[0], p.outline[1]], { w: W * 2.15, taper: 0, seed: p.seed, wobble: 0.3, breathe: 0.18 });
  for (const p of parts) p.paint(ctx);
  face(ctx, pose);
  if (pose.extra) pose.extra(ctx);
}

function buildParts(pose) {
  const b = pose.body, h = pose.head;
  const parts = [];
  const legsFar = (pose.legs ?? []).filter((l) => l.far);
  const legsNear = (pose.legs ?? []).filter((l) => !l.far);
  const legPart = (l, i) => {
    const outline = leg(l.hip, l.foot, l.r0 ?? 7.5, l.r1 ?? 6.5);
    return {
      outline, seed: 40 + i,
      paint: (ctx) => {
        fill(ctx, outline, l.far ? COL.furShade : COL.fur);
        within(ctx, outline, () => {
          // the back half of the leg one step darker; cream socks
          const dx = l.foot[0] - l.hip[0], dy = l.foot[1] - l.hip[1];
          const L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L, ny = dx / L;
          fill(ctx, [add(l.hip, [nx * 20, ny * 20]), add(l.foot, [nx * 20, ny * 20]), add(l.foot, [-nx * 1, -ny * 1]), add(l.hip, [-nx * 1, -ny * 1])], l.far ? COL.furDeep : COL.furShade);
          fill(ctx, ellipse(add(l.foot, [0, 1]), 9, 7), l.far ? COL.creamShade : COL.cream);
        });
      },
    };
  };
  legsFar.forEach((l, i) => parts.push(legPart(l, i)));

  if (pose.tail) {
    const t = tail(pose.tail, pose.tailW?.[0] ?? 7.5, pose.tailW?.[1] ?? 6);
    parts.push({
      outline: t.outline, seed: 21,
      paint: (ctx) => {
        fill(ctx, t.outline, COL.fur);
        within(ctx, t.outline, () => {
          const s = t.spine;
          for (const k of COL.coat === 'tabby' ? [0.3, 0.52, 0.72] : []) {
            const i = Math.floor(k * (s.length - 1));
            const p = s[i], q = s[Math.min(s.length - 1, i + 2)];
            const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
            const d = [Math.cos(ang) * 12, Math.sin(ang) * 12];
            fill(ctx, [add(p, d), add(q, d), add(q, [-d[0], -d[1]]), add(p, [-d[0], -d[1]])], COL.stripe);
          }
          const tip = s[s.length - 1];
          fill(ctx, ellipse(tip, 9, 9), COL.furDeep);
        });
      },
    });
  }

  // body
  const shapes = {
    bean: [[0.95, -0.05], [0.75, 0.62], [0.1, 0.95], [-0.6, 0.85], [-1.0, 0.25], [-0.85, -0.55], [-0.2, -0.9], [0.5, -0.85]],
    sit: [[0.55, -0.95], [0.85, -0.2], [0.95, 0.55], [0.55, 0.98], [-0.3, 1.0], [-0.92, 0.7], [-0.95, 0.05], [-0.55, -0.6], [0.0, -0.98]],
    loaf: [[0.98, 0.05], [0.8, 0.75], [0.1, 0.95], [-0.7, 0.9], [-1.0, 0.35], [-0.85, -0.45], [-0.25, -0.85], [0.5, -0.8]],
  };
  const bodyOutline = blob([b.x, b.y], b.rx, b.ry, shapes[b.shape ?? 'bean'], b.a ?? 0);
  parts.push({
    outline: bodyOutline, seed: 11,
    paint: (ctx) => {
      fill(ctx, bodyOutline, COL.fur);
      within(ctx, bodyOutline, () => {
        const c = [b.x, b.y];
        // cream belly, a hard shade step underneath, a lit band along the back
        fill(ctx, ellipse(add(c, rot([b.rx * 0.15, b.ry * 0.62], b.a ?? 0)), b.rx * 0.78, b.ry * 0.5, b.a ?? 0), COL.cream);
        fill(ctx, ellipse(add(c, rot([0, b.ry * 1.25], b.a ?? 0)), b.rx * 1.3, b.ry * 0.55, b.a ?? 0), COL.furShade);
        fill(ctx, ellipse(add(c, rot([-b.rx * 0.05, -b.ry * 1.18], b.a ?? 0)), b.rx * 1.05, b.ry * 0.5, b.a ?? 0), COL.furLit);
        // a tuxedo's white shirt front, under the chin
        if (COL.coat === 'tuxedo') {
          const bib = b.shape === 'sit' ? [0.42, -0.05, 0.5, 0.78] : b.shape === 'loaf' ? [0.62, 0.15, 0.36, 0.7] : [0.66, 0.12, 0.38, 0.66];
          fill(ctx, ellipse(add(c, rot([bib[0] * b.rx, bib[1] * b.ry], b.a ?? 0)), bib[2] * b.rx, bib[3] * b.ry, (b.a ?? 0) + 0.15), COL.cream);
        }
        // three soft tabby stripes over the back
        for (const k of COL.coat === 'tabby' ? [-0.5, -0.12, 0.26] : []) {
          const top = add(c, rot([k * b.rx, -b.ry * 1.05], b.a ?? 0));
          const mid = add(c, rot([(k - 0.08) * b.rx, -b.ry * 0.25], b.a ?? 0));
          const wdt = b.rx * 0.075;
          fill(ctx, catmull([add(top, [-wdt, 0]), add(mid, [-wdt * 0.6, 0]), add(mid, [0, b.ry * 0.12]), add(mid, [wdt * 0.6, 0]), add(top, [wdt, 0])], true, 5), COL.stripe);
        }
      });
    },
  });
  legsNear.forEach((l, i) => parts.push(legPart(l, i + 10)));

  // head with ears (ears are their own parts so their outline joins the head's)
  const lift = pose.ears ?? 1;
  const ear = (side) => {
    const base0 = add([h.x, h.y], rot([side * h.r * 0.25, -h.r * 0.72], h.a ?? 0));
    const base1 = add([h.x, h.y], rot([side * h.r * 0.88, -h.r * 0.42], h.a ?? 0));
    const tipLocal = lift > 0 ? [side * h.r * 0.78, -h.r * (1.25 + 0.08 * lift)] : [side * h.r * 1.15, -h.r * 0.95];
    const tip = add([h.x, h.y], rot(tipLocal, h.a ?? 0));
    return catmull([base0, add(tip, [side * -2, 2]), tip, add(tip, [side * 2, 3]), base1], false, 4);
  };
  for (const side of [-1, 1]) {
    const e = ear(side);
    const inner = e.map((p) => add([h.x, h.y], [(p[0] - h.x) * 0.72, (p[1] - h.y) * 0.8 + h.r * 0.12]));
    parts.push({
      outline: e, seed: 30 + side,
      paint: (ctx) => { fill(ctx, e, COL.fur); fill(ctx, inner, COL.pink); },
    });
  }
  const headOutline = blob([h.x, h.y], h.r, h.r * 0.9, [[0.0, -0.95], [0.62, -0.78], [0.98, -0.15], [1.08, 0.38], [0.72, 0.86], [0.0, 1.0], [-0.72, 0.86], [-1.08, 0.38], [-0.98, -0.15], [-0.62, -0.78]], h.a ?? 0);
  parts.push({
    outline: headOutline, seed: 35,
    paint: (ctx) => {
      fill(ctx, headOutline, COL.fur);
      within(ctx, headOutline, () => {
        const c = [h.x, h.y];
        const R = (x, y) => add(c, rot([x * h.r, y * h.r], h.a ?? 0));
        fill(ctx, ellipse(R(-0.15, -1.05), h.r * 1.05, h.r * 0.48, h.a ?? 0), COL.furLit);
        fill(ctx, ellipse(R(0.12, 0.62), h.r * 0.62, h.r * 0.4, h.a ?? 0), COL.cream);
        fill(ctx, ellipse(R(0.0, 1.32), h.r * 1.3, h.r * 0.5, h.a ?? 0), COL.furShade);
        if (COL.coat === 'tabby') {
          // the forehead "M"
          for (const x of [-0.24, 0.0, 0.24]) fill(ctx, catmull([R(x - 0.06, -0.92), R(x, -0.52), R(x + 0.06, -0.92)], true, 4), COL.stripe);
        } else {
          // the tuxedo's white blaze, from the muzzle up between the eyes
          fill(ctx, catmull([R(0.02, 0.5), R(0.06, -0.12), R(0.12, -0.42), R(0.18, -0.12), R(0.26, 0.5)], true, 6), COL.cream);
        }
      });
    },
  });
  return parts;
}

function face(ctx, pose) {
  const h = pose.head;
  const a = h.a ?? 0;
  const R = (x, y) => add([h.x, h.y], rot([x * h.r, y * h.r], a));
  const look = pose.look ?? [0, 0];
  const eyes = [R(-0.18 + look[0] * 0.05, 0.08 + look[1] * 0.05), R(0.42 + look[0] * 0.05, 0.1 + look[1] * 0.05)];
  const er = h.r * 0.17;
  const mode = pose.eyes ?? 'open';
  for (const [i, e] of eyes.entries()) {
    if (mode === 'open' || mode === 'half' || mode === 'wide') {
      const ry = er * (mode === 'half' ? 0.55 : mode === 'wide' ? 1.3 : 1.08), rx = er * (mode === 'wide' ? 1.05 : 0.88);
      if (COL.iris) {
        // a coloured iris and a tall pupil: dark eyes would vanish in black fur
        ctx.fillStyle = COL.iris;
        ctx.beginPath(); ctx.ellipse(e[0], e[1], rx * 1.08, ry * 1.04, a, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.eye;
        ctx.beginPath(); ctx.ellipse(e[0] + rx * 0.06, e[1], rx * (mode === 'wide' ? 0.62 : 0.42), ry * 0.86, a, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = COL.eye;
        ctx.beginPath(); ctx.ellipse(e[0], e[1], rx, ry, a, 0, Math.PI * 2); ctx.fill();
      }
      if (mode === 'half') inkLine(ctx, [add(e, [-er * 1.1, -er * 0.45]), add(e, [er * 1.1, -er * 0.55])], W * 1.1, { taper: 0.3, color: COL.line });
      ctx.fillStyle = COL.shine;
      ctx.beginPath(); ctx.arc(e[0] + er * 0.28, e[1] - er * 0.38, er * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e[0] - er * 0.3, e[1] + er * 0.38, er * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (mode === 'happy') {
      inkLine(ctx, [add(e, [-er, er * 0.3]), add(e, [0, -er * 0.55]), add(e, [er, er * 0.3])], W * 1.25, { taper: 0.4, seed: i, color: COL.line });
    } else if (mode === 'squint') {
      // > <
      const s = i === 0 ? 1 : -1;
      inkLine(ctx, [add(e, [-er * s, -er * 0.6]), add(e, [er * s, 0]), add(e, [-er * s, er * 0.6])], W * 1.15, { taper: 0.4, seed: i, color: COL.line });
    } else {
      inkLine(ctx, [add(e, [-er, -er * 0.05]), add(e, [0, er * 0.5]), add(e, [er, -er * 0.05])], W * 1.15, { taper: 0.4, seed: i, color: COL.line });
    }
  }
  // blush, nose, mouth
  ctx.fillStyle = COL.blush;
  for (const e of [R(-0.34, 0.45), R(0.66, 0.46)]) { ctx.beginPath(); ctx.ellipse(e[0], e[1], h.r * 0.14, h.r * 0.08, a, 0, Math.PI * 2); ctx.fill(); }
  const nose = R(0.16, 0.42);
  fill(ctx, [add(nose, [-h.r * 0.07, -h.r * 0.04]), add(nose, [h.r * 0.07, -h.r * 0.04]), add(nose, [0, h.r * 0.05])], COL.pink);
  if (pose.mouth === 'tongue') {
    // panting, or licking: a pink tongue below the ω
    const m = R(0.18, 0.66);
    fill(ctx, ellipse(m, h.r * 0.1, h.r * 0.15, a), '#E07F86');
    inkLine(ctx, [R(0.08, 0.6), R(0.18, 0.82), R(0.28, 0.6)], W * 0.7, { taper: 0.5 });
    inkLine(ctx, [R(0.0, 0.52), R(0.08, 0.6), R(0.16, 0.52), R(0.24, 0.6), R(0.32, 0.52)], W * 0.85, { taper: 0.6 });
  } else if (pose.mouth === 'open') {
    const m = R(0.16, 0.6);
    fill(ctx, ellipse(m, h.r * 0.09, h.r * 0.11, a), '#9E4436');
    inkLine(ctx, [...ellipse(m, h.r * 0.09, h.r * 0.11, a, 16), ellipse(m, h.r * 0.09, h.r * 0.11, a, 16)[0]], W * 0.8, { taper: 0 });
  } else {
    // the little "ω"
    inkLine(ctx, [R(0.0, 0.52), R(0.08, 0.6), R(0.16, 0.52), R(0.24, 0.6), R(0.32, 0.52)], W * 0.85, { taper: 0.6 });
  }
  // whiskers: two short strokes each side
  for (const [s, x] of [[-1, -0.62], [1, 0.95]]) {
    for (const dy of [0.42, 0.56]) inkLine(ctx, [R(x, dy), R(x + s * 0.32, dy + (dy - 0.49) * 0.8)], W * 0.5, { taper: 1, alpha: 0.85, color: COL.whisker });
  }
  // a hint of chin where the head sits on the body
  inkLine(ctx, [R(-0.45, 0.88), R(0.0, 0.99), R(0.45, 0.88)], W * 0.55, { taper: 1, alpha: 0.45 });
}
