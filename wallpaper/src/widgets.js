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

// The board is 1610 x 810 mm: the notes fill the left two thirds, GitHub's last thirteen weeks
// (when there is GitHub data) the last third, past a chalk line.
export const chalkBoard = memo((notes, light = 1, gh) => {
  const W = 1610, H = 810;
  const [c, g] = flat(W, H);
  const r = rng(91);
  const ink = chalkColour(light);
  g.fillStyle = ink; g.strokeStyle = ink;
  const split = gh !== undefined;
  const left = 64, right = split ? 1080 : W - 64, top = 66, bottom = H - 44;
  const items = parseNotes(notes);
  if (!items.length) {
    // an empty board: Maestro asleep, chalked by someone bored
    g.lineWidth = 11;
    const cx = (left + right) / 2, cy = H * 0.55, s = 150;
    g.beginPath(); g.ellipse(cx, cy, s, s * 0.82, 0, 0.15, Math.PI * 2 - 0.15); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.9, cy - s * 0.25); g.lineTo(cx - s * 0.7, cy - s * 1.25); g.lineTo(cx - s * 0.18, cy - s * 0.78); g.stroke();
    g.beginPath(); g.moveTo(cx + s * 0.9, cy - s * 0.25); g.lineTo(cx + s * 0.7, cy - s * 1.25); g.lineTo(cx + s * 0.18, cy - s * 0.78); g.stroke();
    for (const dx of [-0.36, 0.36]) { g.beginPath(); g.moveTo(cx + dx * s - 22, cy - 4); g.quadraticCurveTo(cx + dx * s, cy + 16, cx + dx * s + 22, cy - 4); g.stroke(); }
    g.font = '600 64px "Shantell Sans"'; g.textAlign = 'center';
    g.fillText('zzz', cx + s * 1.3, cy - s * 0.95);
    g.font = '600 52px "Shantell Sans"';
    g.fillText('catatan: klik island → Catatan', cx, bottom - 6);
    g.textAlign = 'left';
  } else {
    // as big as the notes allow: about eight lines at 76 mm, smaller when there is more
    let size = 78, laid;
    for (;;) {
      laid = [];
      for (const it of items) {
        const fs = it.kind === 'head' ? size * 1.12 : size;
        g.font = `${it.kind === 'head' ? 800 : 600} ${fs}px "Shantell Sans"`;
        const indent = it.kind === 'item' || it.kind === 'done' ? size * 0.72 : 0;
        wrap(g, it.text, right - left - indent).forEach((line, k) => laid.push({ ...it, line, first: k === 0, fs, indent }));
      }
      const need = laid.reduce((sum, l) => sum + l.fs * 1.18, 0);
      if (need <= bottom - top || size <= 54) break;
      size -= 4;
    }
    let y = top;
    for (const l of laid) {
      const lh = l.fs * 1.18;
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
  if (split) contributions(g, gh, light, r);
  // chalk is never solid: knock specks out of every stroke
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.5})`;
    const sz = 1.4 + r() * 3;
    g.fillRect(r() * W, r() * H, sz, sz * (0.5 + r()));
  }
  g.globalCompositeOperation = 'source-over';
  return c;
});

// GitHub's last thirteen weeks, right of the chalk line, as on github.com but standing up: a row
// per week (oldest on top), a column per day (Sunday first), GitHub's own levels as greens that
// get brighter with more work (its dark theme: on a dark board the bright end has to be "more").
// The month's name sits by the row where it starts; today has a chalk ring.
const GREENS = ['#1E6B3A', '#0F8A3D', '#26A641', '#39D353'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function contributions(g, gh, light, r) {
  const x0 = 1150, x1 = 1562, cx = (x0 + x1) / 2;
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(1112, 70);
  for (let y = 70; y <= 760; y += 40) g.lineTo(1112 + (r() - 0.5) * 8, y);
  g.stroke();
  g.textAlign = 'center';
  g.font = '700 54px "Shantell Sans"';
  g.fillText('github', cx, 118);
  if (!gh) {
    g.font = '600 52px "Shantell Sans"';
    g.fillText('gh belum', cx, 360); g.fillText('login', cx, 424);
    g.textAlign = 'left';
    return;
  }
  const weeks = (gh.weeks || []).slice(-13);
  const pitchX = 44, pitchY = 43, cell = 35, gx = x1 - 7 * pitchX, gy = 196;
  // Sen, Rab, Jum over their columns, as github.com marks Mon, Wed, Fri
  g.font = '600 28px "Shantell Sans"';
  for (const [d, label] of [[1, 'Sen'], [3, 'Rab'], [5, 'Jum']]) g.fillText(label, gx + d * pitchX + cell / 2, gy - 14);
  const k = Math.max(0.18, Math.min(1.25, light));
  const tint = (hex) => `rgb(${[1, 3, 5].map((i) => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * k))).join(',')})`;
  let lastMonth = -1;
  weeks.forEach((wk, row) => {
    const y = gy + row * pitchY;
    // the month whose first day falls in this week (or the first row's own month)
    const start = new Date((wk.start || '') + 'T12:00:00');
    let month = -1;
    for (let d = 0; d < 7 && !isNaN(start); d++) {
      const day = new Date(start.getTime() + d * 86400000);
      if (day.getDate() === 1) month = day.getMonth();
    }
    if (row === 0 && month < 0 && !isNaN(start)) month = start.getMonth();
    if (month >= 0 && month !== lastMonth) {
      g.textAlign = 'right'; g.font = '700 32px "Shantell Sans"';
      g.fillText(MONTHS[month], gx - 12, y + cell * 0.8);
      g.textAlign = 'center';
      lastMonth = month;
    }
    (wk.days || []).forEach((level, d) => {
      if (level < 0) return;
      const x = gx + d * pitchX;
      g.beginPath(); g.roundRect(x, y, cell, cell, 6);
      if (level > 0) { g.save(); g.fillStyle = tint(GREENS[Math.min(4, level) - 1]); g.fill(); g.restore(); }
      else { g.save(); g.globalAlpha = 0.35; g.lineWidth = 3; g.stroke(); g.restore(); }
    });
  });
  const last = weeks.length - 1, today = last >= 0 ? (weeks[last].days || []).findLastIndex((v) => v >= 0) : -1;
  if (today >= 0) {
    g.lineWidth = 4.5;
    g.beginPath(); g.arc(gx + today * pitchX + cell / 2, gy + last * pitchY + cell / 2, cell * 0.78, 0, Math.PI * 2); g.stroke();
  }
  g.textAlign = 'left';
}

// ------------------------------------------------------------------ the monitor
// Claude Code sessions with Remote Control, as a terminal: a green dot while one is working,
// red while it waits (no words: the sticky note on the monitor covers the screen's right edge).
// Self-lit, so it is laid with source-over. Null: leave the code editor.
export const sessionsScreen = memo((list) => {
  if (!list || !list.length) return null;
  const W = 620, H = 390;
  const [c, g] = flat(W, H);
  g.fillStyle = '#1E2733'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8293A6'; g.font = `600 28px ${MONO}`;
  g.fillText('claude · remote control', 30, 50);
  g.fillStyle = '#3A4A5C'; g.fillRect(30, 68, W - 60, 3);
  const many = list.length > 4;
  list.slice(0, many ? 3 : 4).forEach((s, i) => {
    const y = 148 + i * 74;
    g.fillStyle = s.running ? '#86C26E' : '#E0604C';
    g.beginPath(); g.arc(52, y - 17, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E8DCC0';
    fitFont(g, s.name, (z) => `700 ${z}px ${MONO}`, 54, W - 120, 24);
    g.fillText(s.name, 90, y);
  });
  if (many) {
    g.fillStyle = '#8293A6'; g.font = `600 40px ${MONO}`;
    g.fillText(`+${list.length - 3} lagi`, 90, 148 + 3 * 74);
  }
  return c;
});

// ------------------------------------------------------------------ the battery dials
// Half the texture's pixels (blender/textures.js gauges(): 1488 × 488, four dials).
// The face is 804 x 324 mm (textures.js gauges(): four dials at 0.42 of the height, 166 px
// radius at 2 px/mm, and a label plate under each).
const DIAL_N = 4;
export const gauges = memo((list) => {
  const W = 804, H = 324, R = 83;
  const [c, g] = flat(W, H);
  const ang = (f) => (-210 + f * 240) * Math.PI / 180;
  for (let k = 0; k < DIAL_N; k++) {
    const dev = (list || [])[k];
    const cx = (k + 0.5) * (W / DIAL_N), cy = H * 0.42;
    const known = dev && typeof dev.percent === 'number';
    const f = known ? Math.max(0, Math.min(1, dev.percent / 100)) : -0.05;
    const a = ang(f);
    g.strokeStyle = known && !dev.stale ? INK : 'rgba(43,28,20,0.45)';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * R * 0.16, cy - Math.sin(a) * R * 0.16); g.lineTo(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78); g.stroke();
    g.fillStyle = RED; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    // the number, big, in the dial's lower half; the name on the plate
    g.textAlign = 'center';
    g.fillStyle = known ? (dev.percent <= 20 && !dev.charging ? RED : INK) : 'rgba(43,28,20,0.5)';
    g.font = '50px "Alfa Slab One"';
    g.fillText(known ? String(dev.percent) : '–', cx, cy + R * 0.72);
    if (known && dev.charging) {
      const bx = cx + 48, by = cy + R * 0.5;
      const bolt = [[bx + 1, by - 14], [bx - 8, by + 1], [bx - 1, by + 1], [bx - 3, by + 14], [bx + 8, by - 2], [bx + 1, by - 2]];
      g.fillStyle = MUSTARD; g.beginPath(); bolt.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    }
    g.fillStyle = dev ? INK : 'rgba(43,28,20,0.4)';
    const name = dev ? dev.name : '—';
    fitFont(g, name, (z) => `800 ${z}px "Shantell Sans"`, 34, 136, 16);
    g.fillText(name, cx, H - 22);
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

// ------------------------------------------------------------------ the photos on the shelves
// A picture for each frame: the photo chosen in the island (a data: URL from Guardia, already
// faded toward the room's cream), else a drawing printed in the room's colours. The frame's
// own proportions come from its quad on screen; the picture fills it, cropped from the middle.
const photoImages = new Map();
export function photoImage(src, onload) {
  if (!src) return null;
  let e = photoImages.get(src);
  if (!e) {
    e = { img: new Image(), ok: false };
    e.img.onload = () => { e.ok = true; onload(); };
    e.img.src = src;
    photoImages.set(src, e);
    if (photoImages.size > 12) photoImages.delete(photoImages.keys().next().value);
  }
  return e.ok ? e.img : null;
}

export function photo(slot, img, aspect) {
  const H = 400, W = Math.round(H * aspect);
  const [c, g] = flat(W, H);
  if (img) {
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return c;
  }
  DRAWINGS[slot % DRAWINGS.length](g, W, H);
  return c;
}

// Until a photo is chosen: flat drawings, one per frame.
const DRAWINGS = [
  // Maestro sitting in the sun
  (g, W, H) => {
    g.fillStyle = '#E9C98C'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#C38F33'; g.beginPath(); g.ellipse(W / 2, H * 0.72, W * 0.3, H * 0.24, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(W / 2, H * 0.38, W * 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(W * 0.33, H * 0.32); g.lineTo(W * 0.36, H * 0.14); g.lineTo(W * 0.46, H * 0.25); g.fill();
    g.beginPath(); g.moveTo(W * 0.67, H * 0.32); g.lineTo(W * 0.64, H * 0.14); g.lineTo(W * 0.54, H * 0.25); g.fill();
    g.strokeStyle = INK; g.lineWidth = W * 0.02;
    for (const dx of [-0.08, 0.08]) { g.beginPath(); g.moveTo(W * (0.5 + dx) - 8, H * 0.38); g.quadraticCurveTo(W * (0.5 + dx), H * 0.41, W * (0.5 + dx) + 8, H * 0.38); g.stroke(); }
  },
  // the sea, a red sun
  (g, W, H) => {
    g.fillStyle = '#9FB8C8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#B04A3A'; g.beginPath(); g.arc(W * 0.66, H * 0.42, H * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#34466A'; g.fillRect(0, H * 0.58, W, H * 0.42);
    g.fillStyle = '#E2D1AE'; for (let i = 0; i < 4; i++) g.fillRect(W * 0.1, H * (0.66 + i * 0.08), W * (0.3 + (i % 2) * 0.2), H * 0.02);
  },
  // a jar of flowers
  (g, W, H) => {
    g.fillStyle = '#E4D3AE'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3F6874'; g.fillRect(W * 0.38, H * 0.56, W * 0.24, H * 0.3);
    g.strokeStyle = '#5E6B38'; g.lineWidth = W * 0.025;
    for (const [x, y] of [[0.3, 0.26], [0.5, 0.18], [0.68, 0.3]]) { g.beginPath(); g.moveTo(W * 0.5, H * 0.58); g.lineTo(W * x, H * y); g.stroke(); }
    for (const [x, y, col] of [[0.3, 0.26, '#B04A3A'], [0.5, 0.18, '#C38F33'], [0.68, 0.3, '#A9573A']]) { g.fillStyle = col; g.beginPath(); g.arc(W * x, H * y, W * 0.09, 0, Math.PI * 2); g.fill(); }
  },
  // hills
  (g, W, H) => {
    g.fillStyle = '#BFD1DD'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#6F7A48'; g.beginPath(); g.moveTo(0, H * 0.7); g.quadraticCurveTo(W * 0.35, H * 0.3, W * 0.7, H * 0.62); g.quadraticCurveTo(W * 0.85, H * 0.52, W, H * 0.6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#5E6B38'; g.fillRect(0, H * 0.82, W, H * 0.18);
  },
  // the city at dusk
  (g, W, H) => {
    g.fillStyle = '#E58A63'; g.fillRect(0, 0, W, H * 0.6);
    g.fillStyle = '#5E6E9C'; g.fillRect(0, 0, W, H * 0.25);
    g.fillStyle = '#34466A';
    for (const [x, w, h] of [[0, 0.18, 0.5], [0.16, 0.14, 0.62], [0.3, 0.2, 0.42], [0.5, 0.12, 0.7], [0.62, 0.2, 0.5], [0.82, 0.18, 0.58]]) g.fillRect(W * x, H * (1 - h), W * w, H * h);
    g.fillStyle = '#E9C98C';
    for (let i = 0; i < 14; i++) g.fillRect(W * (0.05 + (i * 0.067) % 0.9), H * (0.55 + ((i * 37) % 30) / 100), W * 0.025, H * 0.03);
  },
];

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
