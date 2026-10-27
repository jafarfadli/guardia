// App icons in the room's print: a squircle card of old paper with a hard stepped shadow and an
// inked rim, and the app's own emblem redrawn in brown ink with flat cel-shaded colour.
// Everything is drawn on a 1024 canvas (the macOS icon grid: an 824 px card, 100 px margins).
import { catmull, stroke, fill, clipTo, setInk } from '../wallpaper/src/ink.js';

export const P = {
  ink: '#2B1C14', paper: '#EFE5CF', aged: '#E4D3AE', shadow: 'rgba(84,110,153,0.42)',
  mustard: '#C38F33', terracotta: '#A9573A', red: '#B04A3A', teal: '#3F6874', navy: '#34466A',
  green: '#5F8C6E', olive: '#6F7A48', blue: '#4E6A8C', dusty: '#8EA7C1', cream: '#E2D1AE',
};

// a little darker or lighter, for the one hard shade step every flat colour gets
export function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.max(0, Math.min(255, k < 1 ? v * k : v + (255 - v) * (k - 1)))));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function squircle(cx, cy, r, n = 5, k = 160) {
  const pts = [];
  for (let i = 0; i < k; i++) {
    const t = (i / k) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + r * Math.sign(c) * Math.abs(c) ** (2 / n), cy + r * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

export function circle(cx, cy, r, k = 96) {
  return Array.from({ length: k }, (_, i) => { const t = (i / k) * Math.PI * 2; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
}

export function arc(cx, cy, r, a0, a1, k = 48) {
  return Array.from({ length: k + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / k; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
}

// ink a closed shape (rim drawn twice round so the join doesn't show)
export function rim(ctx, pts, w, seed = 1) {
  stroke(ctx, [...pts, pts[0], pts[1]], { w, taper: 0, seed, wobble: w * 0.08, breathe: 0.14 });
}

// a flat shape with its one hard shade step on the lower right, then inked
export function shaded(ctx, pts, color, w, seed = 1, opt = {}) {
  fill(ctx, pts, color);
  ctx.save();
  clipTo(ctx, pts);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = opt.at ?? 0.58;
  ctx.beginPath();
  ctx.moveTo(x0 + (x1 - x0) * (k + 0.5), y0 - 10);
  ctx.lineTo(x1 + 10, y0 - 10);
  ctx.lineTo(x1 + 10, y1 + 10);
  ctx.lineTo(x0 + (x1 - x0) * (k - 0.45), y1 + 10);
  ctx.closePath();
  ctx.fillStyle = opt.shade ?? tone(color, 0.82);
  ctx.fill();
  ctx.restore();
  if (w) rim(ctx, pts, w, seed);
}

// diagonal ink hatching inside a shape, on its lower-right part
export function hatching(ctx, pts, S, density = 0.028, seed = 7) {
  ctx.save();
  clipTo(ctx, pts);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = S * density;
  for (let x = x0 - (y1 - y0); x < x1; x += step) {
    const a = [x + (y1 - y0) * 0.55, y0 + (y1 - y0) * 0.45], b = [x + (y1 - y0), y1];
    if (b[0] < x0 + (x1 - x0) * 0.35) continue;
    stroke(ctx, [a, b], { w: S * 0.006, taper: 1, seed: seed + Math.round(x), wobble: 0.6 });
  }
  ctx.restore();
}

// the card: stepped shadow, paper (or a colour), fibres, inked rim
export function card(ctx, S, color = P.paper, seed = 5) {
  setInk(P.ink, 1);
  const cx = S / 2, cy = S / 2 - S * 0.012, r = S * 0.4023;
  const shape = squircle(cx, cy, r);
  fill(ctx, squircle(cx + S * 0.004, cy + S * 0.026, r), P.shadow);
  fill(ctx, shape, color);
  ctx.save();
  clipTo(ctx, shape);
  // a soft lit band at the top and a shade step at the bottom, like everything in the room
  ctx.fillStyle = 'rgba(255,248,232,0.10)';
  ctx.fillRect(0, 0, S, cy - r * 0.35);
  ctx.fillStyle = 'rgba(43,28,20,0.07)';
  ctx.fillRect(0, cy + r * 0.62, S, S);
  // paper fibres
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(43,28,20,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1.5 + rnd() * 3, 1 + rnd() * 1.2);
  }
  ctx.restore();
  rim(ctx, shape, S * 0.013, seed);
  return { cx, cy, r, shape };
}

