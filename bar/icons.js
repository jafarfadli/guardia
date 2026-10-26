// Ink icons for the menu bar, drawn with the room's ink and palette. 22 × 22 pt each.
import { stroke, setInk, catmull } from '../wallpaper/src/ink.js';

let INK = '#2B1C14';
export function setIconInk(c) { INK = c; }
const C = { mustard: '#C38F33', sun: '#E0A341', cream: '#F2E6CC', shade: '#9FB2C4', teal: '#3F6874', navy: '#34466A', red: '#B04A3A', olive: '#6F7A48', orange: '#D9883F', pink: '#D98C80' };

function poly(ctx, pts, fill, w = 1.3, seed = 3) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (w) stroke(ctx, [...pts, pts[0], pts[1]], { w, taper: 0, seed, wobble: 0.15, breathe: 0.2 });
}
const circle = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const line = (ctx, pts, w = 1.3, seed = 1) => stroke(ctx, pts, { w, taper: 0.4, seed, wobble: 0.15, breathe: 0.2 });

function cloud(ctx, x, y, s, fill = C.cream) {
  // three puffs and a flat base; ink every puff, then refill so only the outer edge stays
  const puffs = [[x - 0.5 * s, y - 0.02 * s, 0.36 * s], [x - 0.05 * s, y - 0.28 * s, 0.48 * s], [x + 0.45 * s, y - 0.04 * s, 0.36 * s]];
  const base = [[x - 0.86 * s, y - 0.02 * s], [x + 0.82 * s, y - 0.02 * s], [x + 0.82 * s, y + 0.34 * s], [x - 0.86 * s, y + 0.34 * s]];
  const shapes = [...puffs.map(([cx, cy, r]) => circle(cx, cy, r)), base];
  const fillAll = (col) => { ctx.fillStyle = col; for (const sh of shapes) { ctx.beginPath(); sh.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); } };
  for (const [k, sh] of shapes.entries()) stroke(ctx, [...sh, sh[0], sh[1]], { w: 2.4, taper: 0, seed: k + 3, wobble: 0.12, breathe: 0.2 });
  fillAll(fill);
  // one stepped shade band along the underside
  ctx.save();
  ctx.beginPath(); for (const sh of shapes) { sh.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  ctx.clip();
  ctx.fillStyle = C.shade; ctx.fillRect(x - s, y + 0.12 * s, 2 * s, s);
  ctx.restore();
}

function sun(ctx, x, y, r) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    line(ctx, [[x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35], [x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85]], 1.4, i);
  }
  poly(ctx, circle(x, y, r), C.sun, 1.5, 11);
  ctx.save(); ctx.beginPath(); for (const [i, p] of circle(x, y, r).entries()) i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); ctx.closePath(); ctx.clip();
  ctx.fillStyle = C.mustard; ctx.beginPath(); ctx.arc(x + r * 0.5, y + r * 0.5, r * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  poly(ctx, circle(x, y, r), null, 1.5, 11);
}

function moon(ctx, x, y, r) {
  // crescent: the outer disc minus an offset disc
  const ox = x + r * 0.5, oy = y - r * 0.3, orr = r * 0.82;
  const inside = (p, cx, cy, rr) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < rr * rr;
  const outer = circle(x, y, r, 64).filter((p) => !inside(p, ox, oy, orr));
  const inner = circle(ox, oy, orr, 64).filter((p) => inside(p, x, y, r));
  // order the arcs so the outline runs around the crescent
  const ang = (p, cx, cy) => Math.atan2(p[1] - cy, p[0] - cx);
  const a0 = ang([ox, oy], x, y);
  outer.sort((p, q) => ((ang(p, x, y) - a0 + Math.PI * 4) % (Math.PI * 2)) - ((ang(q, x, y) - a0 + Math.PI * 4) % (Math.PI * 2)));
  const b0 = ang([x, y], ox, oy);
  inner.sort((p, q) => ((ang(q, ox, oy) - b0 + Math.PI * 5) % (Math.PI * 2)) - ((ang(p, ox, oy) - b0 + Math.PI * 5) % (Math.PI * 2)));
  poly(ctx, [...outer, ...inner], C.cream, 1.3, 13);
}

export const ICONS = {
  cat(ctx) {
    const c = [11, 12.5], s = 7;
    const head = circle(c[0], c[1], s).map(([x, y]) => [x, c[1] + (y - c[1]) * 0.82]);
    poly(ctx, [[c[0] - s * 0.9, c[1] - s * 0.15], [c[0] - s * 0.72, c[1] - s * 1.3], [c[0] - s * 0.12, c[1] - s * 0.72]], C.orange, 1.4, 2);
    poly(ctx, [[c[0] + s * 0.9, c[1] - s * 0.15], [c[0] + s * 0.72, c[1] - s * 1.3], [c[0] + s * 0.12, c[1] - s * 0.72]], C.orange, 1.4, 3);
    poly(ctx, head, C.orange, 1.5, 4);
    ctx.fillStyle = C.cream; ctx.beginPath(); ctx.ellipse(c[0], c[1] + s * 0.42, s * 0.48, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    for (const dx of [-0.32, 0, 0.32]) line(ctx, [[c[0] + dx * s, c[1] - s * 0.78], [c[0] + dx * s * 0.7, c[1] - s * 0.4]], 1.0, dx * 10);
    ctx.fillStyle = INK;
    for (const dx of [-0.36, 0.36]) { ctx.beginPath(); ctx.ellipse(c[0] + dx * s, c[1] + 0.02 * s, 1.0, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = C.pink; ctx.beginPath(); ctx.moveTo(c[0] - 1.1, c[1] + s * 0.3); ctx.lineTo(c[0] + 1.1, c[1] + s * 0.3); ctx.lineTo(c[0], c[1] + s * 0.45); ctx.fill();
  },
  clear(ctx) { sun(ctx, 11, 11, 4.6); },
  partly(ctx) { sun(ctx, 8.5, 8.5, 3.6); cloud(ctx, 12.5, 14, 6.4); },
  cloudy(ctx) { cloud(ctx, 11, 13, 8); },
  fog(ctx) { cloud(ctx, 11, 10.5, 7.2); for (const [y, a, b] of [[16.5, 4, 18], [19, 6, 16]]) line(ctx, [[a, y], [b, y]], 1.4, y); },
  rain(ctx) { cloud(ctx, 11, 10, 7.6); for (const [x, y] of [[7, 15], [11, 16], [15, 15]]) { poly(ctx, [[x, y], [x - 1.2, y + 3], [x + 0.6, y + 3.4]], C.teal, 1.1, x); } },
  storm(ctx) { cloud(ctx, 11, 9.5, 7.6, '#D7CBB4'); poly(ctx, [[11.5, 13], [8.5, 17.5], [11, 17.5], [9.5, 21], [14.5, 15.8], [12, 15.8], [13.5, 13]], C.sun, 1.2, 5); },
  night(ctx) { moon(ctx, 10, 11, 6.2); for (const [x, y] of [[17.5, 5], [16, 15.5]]) { line(ctx, [[x - 1.6, y], [x + 1.6, y]], 1.1); line(ctx, [[x, y - 1.6], [x, y + 1.6]], 1.1); } },
  'night-cloudy'(ctx) { moon(ctx, 8.5, 8.5, 4.8); cloud(ctx, 12.5, 14.5, 6.4); },
  hourglass(ctx) {
    const pts = [[6, 3.5], [16, 3.5], [11, 11], [16, 18.5], [6, 18.5], [11, 11]];
    poly(ctx, [[11, 11], [15, 17.6], [7, 17.6]], C.mustard, 0);
    poly(ctx, pts, null, 1.5, 9);
    line(ctx, [[4.5, 3.5], [17.5, 3.5]], 1.8); line(ctx, [[4.5, 18.5], [17.5, 18.5]], 1.8);
  },
  note(ctx) {
    poly(ctx, circle(7, 16, 2.8).map(([x, y]) => [x, 16 + (y - 16) * 0.75]), C.red, 1.4, 3);
    poly(ctx, circle(15.5, 14, 2.8).map(([x, y]) => [x, 14 + (y - 14) * 0.75]), C.red, 1.4, 4);
    line(ctx, [[9.6, 15.5], [9.6, 5.5], [18.1, 3.5], [18.1, 13.5]], 1.5, 5);
    line(ctx, [[9.6, 8.4], [18.1, 6.4]], 2.2, 6);
  },
};
for (let k = 0; k <= 4; k++) {
  ICONS[`battery-${k}`] = (ctx) => battery(ctx, k / 4, false);
  ICONS[`battery-${k}-charging`] = (ctx) => battery(ctx, k / 4, true);
}
function battery(ctx, f, charging) {
  const body = [[3.5, 7], [17, 7], [17, 15], [3.5, 15]];
  poly(ctx, body, C.cream, 0);
  const col = f <= 0.25 && !charging ? C.red : charging ? C.olive : C.navy;
  if (f > 0) { ctx.fillStyle = col; ctx.fillRect(5, 8.5, 10.5 * Math.max(0.12, f), 5); }
  poly(ctx, body, null, 1.5, 3);
  line(ctx, [[18.6, 9.4], [18.6, 12.6]], 2.2, 4);
  if (charging) poly(ctx, [[11.5, 5], [7.8, 11.6], [10.4, 11.6], [9.2, 17], [13.4, 10.2], [10.8, 10.2], [12.3, 5]], C.sun, 1.1, 5);
}

export function drawIcon(ctx, name, scale) {
  setInk(INK, 1); // the context is scaled below, so widths are in points already
  ctx.save();
  ctx.scale(scale, scale);
  ICONS[name](ctx);
  ctx.restore();
}
