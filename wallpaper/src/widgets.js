// The live widgets in the room, printed over the render like the calendar and the clock: the
// notes chalked on the board, the GitHub card on the cork, Claude's sessions on the monitor,
// the battery dials, the toy traffic light, and the weather in the window.
// Each draws flat in its own space (millimetres of its surface, or pixels of its texture), is
// warped onto its quad in the frame with a true perspective, and is clipped by its mask
// (blender/masks.py) so it never prints over a leaf or a chair standing in front of it.
import { rng } from './math.js';

const INK = '#2B1C14';
const RED = '#B04A3A';
const MUSTARD = '#C38F33';
const MONO = '"FantasqueSansM Nerd Font", Menlo, monospace';

// ------------------------------------------------------------------ geometry
// Unit square → quad [tl, tr, br, bl] as a projective map (Heckbert).
function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]; };
}

// The affine map that takes triangle s onto triangle d, as canvas transform(a, b, c, d, e, f).
function affine([x0, y0], [x1, y1], [x2, y2], [u0, v0], [u1, v1], [u2, v2]) {
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  return [
    (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den,
    (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den,
    (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den,
    (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den,
    (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den,
    (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den,
  ];
}

// Draw a flat canvas onto a quad in perspective: a grid of triangles, each an affine piece,
// each clipped a hair larger than itself so no seam shows between neighbours.
export function warp(ctx, src, quad, n = 6) {
  const P = squareToQuad(quad);
  const W = src.width, H = src.height;
  const piece = (s0, s1, s2, d0, d1, d2) => {
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = ([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * 0.8, y + (dy / l) * 0.8]; };
    const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...g0); ctx.lineTo(...g1); ctx.lineTo(...g2); ctx.closePath(); ctx.clip();
    ctx.transform(...affine(s0, s1, s2, d0, d1, d2));
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      piece([u0 * W, v0 * H], [u1 * W, v0 * H], [u0 * W, v1 * H], P(u0, v0), P(u1, v0), P(u0, v1));
      piece([u1 * W, v0 * H], [u1 * W, v1 * H], [u0 * W, v1 * H], P(u1, v0), P(u1, v1), P(u0, v1));
    }
  }
}

// ------------------------------------------------------------------ masks
const masks = new Map();
export async function loadMasks(meta) {
  const list = Object.entries(meta.masks || {}).filter(([, box]) => box);
  await Promise.all(list.map(([name, box]) => new Promise((resolve) => {
    if (masks.has(name)) { resolve(); return; }
    const img = new Image();
    img.onload = () => { masks.set(name, { img, box }); resolve(); };
    img.onerror = () => resolve();
    img.src = `frames/masks/${name}.png`;
  })));
}
export const maskBox = (name) => masks.get(name)?.box || null;

export const maskImage = (name) => masks.get(name)?.img || null;

const scratch = document.createElement('canvas');
// Paint into a canvas the size of the mask's box (in screen pixels), keep only what the mask
// shows, and lay the result into ctx with `op`. Without a mask, paint straight into ctx.
export function masked(ctx, name, px, op, paint) {
  const m = masks.get(name);
  ctx.save();
  ctx.globalCompositeOperation = op;
  if (!m) { paint(ctx); ctx.restore(); return; }
  const [ax, ay] = px([m.box[0], m.box[1]]), [bx, by] = px([m.box[2], m.box[3]]);
  const x = Math.floor(ax), y = Math.floor(ay), w = Math.ceil(bx) - x, h = Math.ceil(by) - y;
  if (w <= 0 || h <= 0) { ctx.restore(); return; }
  scratch.width = w; scratch.height = h;
  const g = scratch.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.save(); g.translate(-x, -y); paint(g); g.restore();
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(m.img, ax - x, ay - y, bx - ax, by - ay);
  ctx.drawImage(scratch, x, y);
  ctx.restore();
}

// Each widget is redrawn only when what it shows changes (the room re-renders every minute).
function memo(fn) {
  let key = null, val = null;
  return (...args) => {
    const k = JSON.stringify(args);
    if (k !== key) { key = k; val = fn(...args); }
    return val;
  };
}

function flat(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  return [c, g];
}

function fitFont(g, text, font, size, maxW, min = 0) {
  let s = size;
  g.font = font(s);
  while (s > min && g.measureText(text).width > maxW) { s *= 0.94; g.font = font(s); }
  return s;
}

// ------------------------------------------------------------------ the chalkboard
// Chalk takes the light that falls on the board: its colour is scaled by how bright the slate
// came out of the render against the slate's own colour (`light`, measured by the caller), so
// it glows in the afternoon and goes dim at night like everything else on the wall.
const SLATE = [0x34, 0x46, 0x3D], CHALK = [0xE8, 0xE0, 0xCC];
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const SLATE_LUM = lum(SLATE);
export function chalkColour(light) {
  const k = Math.max(0.18, Math.min(1.25, light));
  return `rgb(${CHALK.map((c) => Math.round(Math.min(255, c * k))).join(',')})`;
}

export function parseNotes(text) {
  return (text || '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).map((l) => {
    const t = l.trim();
    let m;
    if ((m = t.match(/^(?:\[[xX]\]|[xX✓]\s)\s*(.*)$/))) return { kind: 'done', text: m[1] };
    if ((m = t.match(/^(?:\[\s?\]|[-•*·])\s*(.*)$/))) return { kind: 'item', text: m[1] };
    if ((m = t.match(/^#+\s*(.*)$/))) return { kind: 'head', text: m[1] };
    return { kind: 'text', text: t };
  });
}

function wrap(g, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (g.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export const chalkBoard = memo((notes, light = 1) => {
  const W = 960, H = 620; // the slate in millimetres
  const [c, g] = flat(W, H);
  const r = rng(91);
  const ink = chalkColour(light);
  g.fillStyle = ink; g.strokeStyle = ink;
  const items = parseNotes(notes);
  const left = 54, right = W - 50, top = 52, bottom = H - 34;
  if (!items.length) {
    // an empty board: Maestro, chalked by someone bored
    g.lineWidth = 9;
    const cx = W * 0.5, cy = H * 0.52, s = 120;
    g.beginPath(); g.ellipse(cx, cy, s, s * 0.82, 0, 0.15, Math.PI * 2 - 0.15); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.9, cy - s * 0.25); g.lineTo(cx - s * 0.7, cy - s * 1.25); g.lineTo(cx - s * 0.18, cy - s * 0.78); g.stroke();
    g.beginPath(); g.moveTo(cx + s * 0.9, cy - s * 0.25); g.lineTo(cx + s * 0.7, cy - s * 1.25); g.lineTo(cx + s * 0.18, cy - s * 0.78); g.stroke();
    for (const dx of [-0.36, 0.36]) { g.beginPath(); g.moveTo(cx + dx * s - 18, cy - 4); g.quadraticCurveTo(cx + dx * s, cy + 14, cx + dx * s + 18, cy - 4); g.stroke(); }
    g.font = '600 52px "Shantell Sans"'; g.textAlign = 'center';
    g.fillText('zzz', cx + s * 1.25, cy - s * 0.9);
  } else {
    // as big as the notes allow: about six lines at 84 px, smaller when there is more
    let size = 86, laid;
    for (;;) {
      laid = [];
      for (const it of items) {
        const fs = it.kind === 'head' ? size * 1.12 : size;
        g.font = `${it.kind === 'head' ? 800 : 600} ${fs}px "Shantell Sans"`;
        const indent = it.kind === 'item' || it.kind === 'done' ? size * 0.72 : 0;
        wrap(g, it.text, right - left - indent).forEach((line, k) => laid.push({ ...it, line, first: k === 0, fs, indent }));
      }
      const need = laid.reduce((s, l) => s + l.fs * 1.16, 0);
      if (need <= bottom - top || size <= 56) break;
      size -= 6;
    }
    let y = top;
    for (const l of laid) {
      const lh = l.fs * 1.16;
      if (y + lh > bottom + 4) { g.font = `600 ${size}px "Shantell Sans"`; g.fillText('…', left, y + l.fs * 0.86); break; }
      g.font = `${l.kind === 'head' ? 800 : 600} ${l.fs}px "Shantell Sans"`;
      const base = y + l.fs * 0.86;
      if (l.first && (l.kind === 'item' || l.kind === 'done')) {
        g.beginPath(); g.arc(left + size * 0.22, base - size * 0.3, size * 0.11, 0, Math.PI * 2); g.fill();
      }
      const x = left + l.indent;
      g.fillText(l.line, x, base);
      if (l.kind === 'done') {
        g.lineWidth = size * 0.07;
        const w = g.measureText(l.line).width;
        g.beginPath(); g.moveTo(x - 6, base - size * 0.3 + (r() - 0.5) * 6); g.lineTo(x + w + 6, base - size * 0.32 + (r() - 0.5) * 6); g.stroke();
      }
      if (l.kind === 'head' && l.first) {
        g.lineWidth = size * 0.06;
        const w = g.measureText(l.line).width;
        g.beginPath(); g.moveTo(x, base + size * 0.14); g.quadraticCurveTo(x + w / 2, base + size * 0.2, x + w, base + size * 0.12); g.stroke();
      }
      y += lh;
    }
  }
  // chalk is never solid: knock specks out of every stroke
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.5})`;
    const s = 1.2 + r() * 2.6;
    g.fillRect(r() * W, r() * H, s, s * (0.5 + r()));
  }
  g.globalCompositeOperation = 'source-over';
  return c;
});

// ------------------------------------------------------------------ the GitHub card
// The card's own pixels (blender/textures.js CARD: 420 × 520, a printed mustard band on top).
// Ink and red stamps only, laid with multiply on the printed card.
export const githubCard = memo((gh) => {
  const W = 420, H = 520;
  const [c, g] = flat(W, H);
  g.fillStyle = INK;
  if (!gh) {
    g.font = '700 40px "Shantell Sans"'; g.fillText('gh belum', 30, 170); g.fillText('login', 30, 220);
    return c;
  }
  const streak = String(gh.streak ?? 0);
  const ns = fitFont(g, streak, (s) => `${s}px "Alfa Slab One"`, 168, 250, 60);
  g.fillText(streak, 26, 96 + ns * 0.92);
  const nx = 26 + g.measureText(streak).width + 14;
  g.font = '800 50px "Shantell Sans"';
  g.fillText('hari', nx, 96 + ns * 0.5);
  g.font = '600 32px "Shantell Sans"';
  g.fillText(gh.streak > 0 ? 'beruntun' : 'ayo commit', nx, 96 + ns * 0.5 + 40);
  // the last weeks, a stamp for every day with commits
  const weeks = (gh.weeks || []).slice(-15);
  const cell = 26, x0 = W - 15 - weeks.length * cell, y0 = H - 22 - 7 * cell;
  const r = rng(5);
  weeks.forEach((wk, i) => wk.forEach((n, d) => {
    if (n < 0) return; // a day still to come
    const x = x0 + i * cell + cell / 2, y = y0 + d * cell + cell / 2;
    g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.25);
    if (n > 0) {
      g.globalAlpha = n >= 5 ? 1 : n >= 2 ? 0.75 : 0.5;
      g.fillStyle = RED; g.fillRect(-10, -10, 20, 20);
    } else {
      g.globalAlpha = 0.28; g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-8.5, -8.5, 17, 17);
    }
    g.restore();
  }));
  if (weeks.length) {
    const last = weeks[weeks.length - 1];
    const d = last.findLastIndex((n) => n >= 0);
    if (d >= 0) {
      g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.arc(x0 + (weeks.length - 1) * cell + cell / 2, y0 + d * cell + cell / 2, 15, 0, Math.PI * 2); g.stroke();
    }
  }
  return c;
});

// ------------------------------------------------------------------ the monitor
// Claude Code sessions with Remote Control, as a terminal: a green dot while one is working,
// red while it waits (no words: the sticky note on the monitor covers the screen's right edge).
// Self-lit, so it is laid with source-over. Null: leave the code editor.
export const sessionsScreen = memo((list) => {
  if (!list || !list.length) return null;
  const W = 470, H = 305;
  const [c, g] = flat(W, H);
  g.fillStyle = '#1E2733'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7F8FA0'; g.font = `600 24px ${MONO}`;
  g.fillText('claude · remote control', 22, 38);
  g.fillStyle = '#3A4A5C'; g.fillRect(22, 52, W - 44, 3);
  const rows = list.slice(0, list.length > 5 ? 4 : 5);
  rows.forEach((s, i) => {
    const y = 96 + i * 46;
    const col = s.running ? '#86C26E' : '#E0604C';
    g.fillStyle = col; g.beginPath(); g.arc(36, y - 9, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E8DCC0';
    fitFont(g, s.name, (z) => `700 ${z}px ${MONO}`, 30, 330, 16);
    g.fillText(s.name, 60, y);
  });
  if (list.length > 5) {
    g.fillStyle = '#7F8FA0'; g.font = `600 22px ${MONO}`;
    g.fillText(`+${list.length - 4} lagi`, 60, 96 + 4 * 46);
  }
  return c;
});

// ------------------------------------------------------------------ the battery dials
// Half the texture's pixels (blender/textures.js gauges(): 1488 × 488, four dials).
const DIAL_N = 4;
export const gauges = memo((list) => {
  const W = 744, H = 244, R = 64;
  const [c, g] = flat(W, H);
  const ang = (f) => (-210 + f * 240) * Math.PI / 180;
  for (let k = 0; k < DIAL_N; k++) {
    const dev = (list || [])[k];
    const cx = (k + 0.5) * (W / DIAL_N), cy = H * 0.4;
    const known = dev && typeof dev.percent === 'number';
    const f = known ? Math.max(0, Math.min(1, dev.percent / 100)) : -0.05;
    const a = ang(f);
    // needle: a tapered ink stroke with a red pin
    g.strokeStyle = known && !dev.stale ? INK : 'rgba(43,28,20,0.45)';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * R * 0.16, cy - Math.sin(a) * R * 0.16); g.lineTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); g.stroke();
    g.fillStyle = RED; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    // the number under the pin, the name on the plate
    g.textAlign = 'center';
    g.fillStyle = known ? (dev.percent <= 20 && !dev.charging ? RED : INK) : 'rgba(43,28,20,0.5)';
    g.font = '30px "Alfa Slab One"';
    g.fillText(known ? String(dev.percent) : '–', cx, cy + R * 0.66);
    if (known && dev.charging) {
      const bx = cx + 30, by = cy + R * 0.42;
      const bolt = [[bx + 1, by - 13], [bx - 7, by + 1], [bx - 1, by + 1], [bx - 3, by + 13], [bx + 7, by - 2], [bx + 1, by - 2]];
      g.fillStyle = MUSTARD; g.beginPath(); bolt.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    }
    g.fillStyle = dev ? INK : 'rgba(43,28,20,0.4)';
    const name = dev ? dev.name : '—';
    fitFont(g, name, (s) => `800 ${s}px "Shantell Sans"`, 28, 112, 14);
    g.fillText(name, cx, H - 26);
    g.textAlign = 'left';
  }
  return c;
});

// ------------------------------------------------------------------ the traffic light
// The housing's front in millimetres (props.signal(): 120 × 270, lenses 34 mm across).
const LENS = { red: 47, amber: 135, green: 223 };
const LIT = { red: '#E2553F', amber: '#F3B23A', green: '#83CF6C' };
export function signalLens(g, level, warpTo) {
  const W = 120, H = 270;
  const [c, l] = flat(W, H);
  const y = LENS[level] ?? LENS.green, col = LIT[level] ?? LIT.green;
  l.fillStyle = col; l.beginPath(); l.arc(60, y, 34, 0, Math.PI * 2); l.fill();
  l.fillStyle = 'rgba(255,248,230,0.55)'; l.beginPath(); l.ellipse(50, y - 12, 12, 8, -0.5, 0, Math.PI * 2); l.fill();
  warpTo(g, c);
  return { y: y / H, col };
}

// ------------------------------------------------------------------ the weather in the window
// Flat comic clouds for a partly cloudy sky; stars on a clear night; drops on the glass when it
// rains. Clouds and stars go in the sky's mask, drops in the window's.
export function clouds(g, box, t, amount) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0;
  const r = rng(17);
  const n = Math.round(2 + amount * 4);
  for (let i = 0; i < n; i++) {
    const cx = x0 + ((r() * 1.4 + t * (0.02 + r() * 0.02)) % 1.4 - 0.2) * w;
    const cy = y0 + (0.12 + r() * 0.42) * h;
    const s = (0.08 + r() * 0.08) * w;
    const puffs = [[0, 0, 1], [-0.7, 0.18, 0.7], [0.75, 0.15, 0.75], [0.3, -0.35, 0.65], [-0.3, -0.25, 0.6]];
    g.fillStyle = '#F2EBDD';
    g.beginPath();
    for (const [dx, dy, k] of puffs) { g.moveTo(cx + dx * s + k * s * 0.55, cy + dy * s); g.arc(cx + dx * s, cy + dy * s, k * s * 0.55, 0, Math.PI * 2); }
    g.fill();
    g.fillStyle = 'rgba(160,170,190,0.35)';
    g.fillRect(cx - s * 1.1, cy + s * 0.18, s * 2.2, s * 0.25);
    g.strokeStyle = 'rgba(43,28,20,0.55)'; g.lineWidth = Math.max(1.5, s * 0.035);
    g.beginPath(); g.moveTo(cx - s * 1.05, cy + s * 0.3); g.lineTo(cx + s * 1.1, cy + s * 0.3); g.stroke();
  }
}

export function stars(g, box, seed = 3) {
  const [x0, y0, x1, y1] = box;
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0) * 0.75, s = 0.8 + r() * 1.8;
    g.fillStyle = `rgba(242,232,205,${0.5 + r() * 0.5})`;
    g.fillRect(x - s / 2, y - s / 2, s, s);
  }
}

// Drops on the glass: a pale bead with an inked rim, some with a trail. By day the rim carries
// them against a pale sky; at night they are dimmer.
export function drops(g, box, amount, day) {
  const [x0, y0, x1, y1] = box;
  const r = rng(29);
  const n = Math.round(22 + amount * 40);
  const k = (x1 - x0) / 420;
  const a = day ? 0.6 : 0.3;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    const s = (2.2 + r() * 3.6) * k;
    g.fillStyle = `rgba(236,240,244,${a})`;
    g.beginPath(); g.ellipse(x, y, s * 0.75, s, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(52,66,86,${a * 0.8})`; g.lineWidth = Math.max(1, s * 0.28); g.stroke();
    if (r() < 0.3) {
      g.strokeStyle = `rgba(52,66,86,${a * 0.5})`; g.lineWidth = Math.max(1, s * 0.35);
      g.beginPath(); g.moveTo(x, y + s); g.lineTo(x + (r() - 0.5) * s, y + s * (3 + r() * 6)); g.stroke();
    }
  }
}

// Falling rain, a canvas over the window that redraws itself about 24 times a second while it
// rains (CSS layers under a mask never showed in WebKit's desktop window). Streaks are dark
// blue-grey against a pale day sky, pale against the night; the window's mask cuts them.
export class Rain {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.on = false; this.timer = 0; }

  set({ x, y, w, h, dpr, mask, heavy, day, still }) {
    const c = this.c;
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    Object.assign(c.style, { display: 'block', left: `${x / dpr}px`, top: `${y / dpr}px`, width: `${w / dpr}px`, height: `${h / dpr}px` });
    const r = rng(heavy ? 41 : 43), k = c.height / 600;
    this.drops = Array.from({ length: heavy ? 90 : 52 }, () => ({
      x: r() * c.width * 1.2, y: r() * c.height, len: (12 + r() * 16) * k, v: (1000 + r() * 500) * k, w: (1 + r() * 1.3) * Math.max(1, k),
    }));
    this.mask = mask; this.colour = day ? 'rgba(62,78,100,0.5)' : 'rgba(232,236,240,0.5)';
    this.still = still;
    if (!this.on) { this.on = true; this.t0 = performance.now(); this.tick(); }
    else if (still) this.draw(performance.now());
  }

  stop() { this.on = false; clearTimeout(this.timer); this.c.style.display = 'none'; }

  tick() {
    if (!this.on) return;
    this.draw(performance.now());
    if (!this.still) this.timer = setTimeout(() => requestAnimationFrame(() => this.tick()), 1000 / 24);
  }

  draw(now) {
    const { g, c } = this;
    const t = (now - this.t0) / 1000;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = this.colour; g.lineCap = 'round';
    for (const d of this.drops) {
      const span = c.height + d.len;
      const y = ((d.y + t * d.v) % span) - d.len;
      const x = d.x - (y + d.len) * 0.18;
      g.lineWidth = d.w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - d.len * 0.18, y + d.len); g.stroke();
    }
    if (this.mask) { g.globalCompositeOperation = 'destination-in'; g.drawImage(this.mask, 0, 0, c.width, c.height); }
  }
}
