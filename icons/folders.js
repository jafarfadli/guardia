// Folder icons in the room's print: a manila paper folder with an inked rim and a hard shade
// step. Home folders get an ink stamp of what they hold; any other folder gets a coloured sticker
// with its initials. FOLDERS lists which folders get which (~ is the home folder).
import { stroke, fill, clipTo, setInk } from '../wallpaper/src/ink.js';
import { P, tone, circle, arc, rim } from './glyphs.js';

const MANILA = '#D9BC88', FRONT = '#EAD8B2', INK = P.ink;
const STICKERS = ['#A9573A', '#3F6874', '#6F7A48', '#34466A', '#B04A3A', '#C38F33', '#6A5994'];
const W = (S) => S * 0.0105;

function roundRect(x, y, w, h, r, k = 10) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= k; i++) { const t = a0 + (i / k) * (Math.PI / 2); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  return pts;
}

// the folder itself; returns the front panel's box for the stamp or sticker
function folder(ctx, S) {
  setInk(INK, 1);
  const x0 = S * 0.09, x1 = S * 0.91, w = x1 - x0;
  // back panel with its tab, as one outline
  const back = [
    ...roundRect(x0, S * 0.2, w, S * 0.6, S * 0.04).filter(([, y]) => y > S * 0.24),
    [x0, S * 0.19], [x0 + S * 0.01, S * 0.165], [x0 + S * 0.32, S * 0.165], [x0 + S * 0.36, S * 0.2], [x1 - S * 0.04, S * 0.2], [x1, S * 0.24],
  ];
  const front = roundRect(x0, S * 0.29, w, S * 0.55, S * 0.045);
  // stepped shadow
  fill(ctx, roundRect(x0 + S * 0.006, S * 0.31, w, S * 0.555, S * 0.045), P.shadow);
  fill(ctx, back, MANILA);
  rim(ctx, back, W(S), 3);
  fill(ctx, front, FRONT);
  ctx.save(); clipTo(ctx, front);
  // a lit lip along the top, the shade step low right, paper fibres
  ctx.fillStyle = 'rgba(255,248,232,0.35)'; ctx.fillRect(0, S * 0.29, S, S * 0.03);
  ctx.beginPath(); ctx.moveTo(S * 1.0, S * 0.5); ctx.lineTo(S, S); ctx.lineTo(S * 0.35, S); ctx.closePath();
  ctx.fillStyle = tone(FRONT, 0.9); ctx.fill();
  let s = 7919;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(43,28,20,${0.03 + rnd() * 0.05})`; ctx.fillRect(rnd() * S, S * 0.29 + rnd() * S * 0.55, 1.5 + rnd() * 3, 1 + rnd()); }
  ctx.restore();
  rim(ctx, front, W(S), 5);
  return { cx: S / 2, cy: S * 0.575, w: w * 0.8, h: S * 0.42 };
}

// ---------------------------------------------------------------- ink stamps
function stamp(ctx, S, draw) {
  ctx.save();
  ctx.globalAlpha = 0.86;
  setInk(INK, 1);
  draw();
  ctx.restore();
}
const line = (ctx, S, pts, w = 1.3, seed = 9) => stroke(ctx, pts, { w: W(S) * w, taper: 0.2, seed, wobble: 0.8 });

const STAMPS = {
  desktop(ctx, S, b) {
    const u = S * 0.12;
    rim(ctx, roundRect(b.cx - u * 1.3, b.cy - u * 0.95, u * 2.6, u * 1.6, u * 0.12), W(S) * 1.3, 11);
    line(ctx, S, [[b.cx, b.cy + u * 0.65], [b.cx, b.cy + u * 1.0]]);
    line(ctx, S, [[b.cx - u * 0.55, b.cy + u * 1.02], [b.cx + u * 0.55, b.cy + u * 1.02]]);
  },
  documents(ctx, S, b) {
    const u = S * 0.12, x = b.cx - u * 0.85, y = b.cy - u * 1.1;
    rim(ctx, [[x, y], [x + u * 1.2, y], [x + u * 1.7, y + u * 0.5], [x + u * 1.7, y + u * 2.2], [x, y + u * 2.2]], W(S) * 1.3, 12);
    line(ctx, S, [[x + u * 1.2, y], [x + u * 1.2, y + u * 0.5], [x + u * 1.7, y + u * 0.5]]);
    for (let i = 0; i < 4; i++) line(ctx, S, [[x + u * 0.3, y + u * (0.9 + i * 0.32)], [x + u * (i === 3 ? 0.95 : 1.4), y + u * (0.9 + i * 0.32)]], 1.1, 20 + i);
  },
  downloads(ctx, S, b) {
    const u = S * 0.13;
    rim(ctx, circle(b.cx, b.cy, u), W(S) * 1.3, 13);
    line(ctx, S, [[b.cx, b.cy - u * 0.55], [b.cx, b.cy + u * 0.5]], 1.5);
    line(ctx, S, [[b.cx - u * 0.4, b.cy + u * 0.12], [b.cx, b.cy + u * 0.52], [b.cx + u * 0.4, b.cy + u * 0.12]], 1.5);
  },
  pictures(ctx, S, b) {
    const u = S * 0.12, r = roundRect(b.cx - u * 1.3, b.cy - u * 0.95, u * 2.6, u * 1.9, u * 0.1);
    rim(ctx, r, W(S) * 1.3, 14);
    line(ctx, S, [[b.cx - u * 1.2, b.cy + u * 0.75], [b.cx - u * 0.4, b.cy - u * 0.1], [b.cx + u * 0.2, b.cy + u * 0.45], [b.cx + u * 0.55, b.cy + u * 0.1], [b.cx + u * 1.2, b.cy + u * 0.75]]);
    rim(ctx, circle(b.cx + u * 0.6, b.cy - u * 0.45, u * 0.22), W(S), 15);
  },
  movies(ctx, S, b) {
    const u = S * 0.12, r = roundRect(b.cx - u * 1.3, b.cy - u * 0.9, u * 2.6, u * 1.8, u * 0.1);
    rim(ctx, r, W(S) * 1.3, 16);
    for (const x of [-0.85, 0.85]) line(ctx, S, [[b.cx + x * u, b.cy - u * 0.9], [b.cx + x * u, b.cy + u * 0.9]]);
    for (const x of [-1.07, 1.07]) for (let i = 0; i < 4; i++) fill(ctx, roundRect(b.cx + x * u - u * 0.09, b.cy + u * (-0.7 + i * 0.42), u * 0.18, u * 0.2, u * 0.04, 2), INK);
    fill(ctx, [[b.cx - u * 0.25, b.cy - u * 0.35], [b.cx + u * 0.4, b.cy], [b.cx - u * 0.25, b.cy + u * 0.35]], INK);
  },
  music(ctx, S, b) {
    const u = S * 0.12;
    fill(ctx, circle(b.cx - u * 0.75, b.cy + u * 0.7, u * 0.32), INK);
    fill(ctx, circle(b.cx + u * 0.6, b.cy + u * 0.45, u * 0.32), INK);
    line(ctx, S, [[b.cx - u * 0.45, b.cy + u * 0.7], [b.cx - u * 0.45, b.cy - u * 0.9]], 1.5);
    line(ctx, S, [[b.cx + u * 0.9, b.cy + u * 0.45], [b.cx + u * 0.9, b.cy - u * 1.15]], 1.5);
    stroke(ctx, [[b.cx - u * 0.45, b.cy - u * 0.9], [b.cx + u * 0.9, b.cy - u * 1.15]], { w: u * 0.28, taper: 0, seed: 17 });
  },
  public(ctx, S, b) {
    const u = S * 0.12;
    for (const [x, k] of [[-0.6, 0.85], [0.6, 0.85], [0, 1]]) {
      rim(ctx, circle(b.cx + x * u, b.cy - u * 0.45 * k, u * 0.32 * k), W(S) * 1.2, 18);
      line(ctx, S, [...arc(b.cx + x * u, b.cy + u * 0.75 * k, u * 0.6 * k, Math.PI, Math.PI * 2, 16)], 1.2, 19);
    }
  },
  applications(ctx, S, b) {
    const u = S * 0.1;
    for (const [x, y] of [[-1, -1], [0.15, -1], [-1, 0.15], [0.15, 0.15]]) rim(ctx, roundRect(b.cx + x * u, b.cy + y * u - u * 0.05, u * 0.85, u * 0.85, u * 0.22), W(S) * 1.2, 20);
  },
  code(ctx, S, b) {
    const u = S * 0.12;
    line(ctx, S, [[b.cx - u * 0.6, b.cy - u * 0.6], [b.cx - u * 1.2, b.cy], [b.cx - u * 0.6, b.cy + u * 0.6]], 1.6, 21);
    line(ctx, S, [[b.cx + u * 0.6, b.cy - u * 0.6], [b.cx + u * 1.2, b.cy], [b.cx + u * 0.6, b.cy + u * 0.6]], 1.6, 22);
    line(ctx, S, [[b.cx + u * 0.25, b.cy - u * 0.8], [b.cx - u * 0.25, b.cy + u * 0.8]], 1.6, 23);
  },
  terminal(ctx, S, b) {
    const u = S * 0.12;
    line(ctx, S, [[b.cx - u * 1.0, b.cy - u * 0.5], [b.cx - u * 0.35, b.cy], [b.cx - u * 1.0, b.cy + u * 0.5]], 1.6, 24);
    line(ctx, S, [[b.cx - u * 0.1, b.cy + u * 0.55], [b.cx + u * 1.0, b.cy + u * 0.55]], 1.6, 25);
  },
};

// ---------------------------------------------------------------- stickers for every other folder
export function initials(name) {
  const clean = name.replace(/[_-]+/g, ' ').trim();
  const flat = clean.replace(/\s+/g, '');
  if (flat.length <= 5) return flat.toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  // an acronym in the name says it best ("All About FRS" → FRS)
  const acronym = words.find((w) => w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (acronym) return acronym;
  if (words.length === 1) return words[0][0].toUpperCase() + words[0][1].toLowerCase();
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function sticker(ctx, S, b, name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = STICKERS[h % STICKERS.length];
  const text = initials(name);
  const w = S * 0.42, hh = S * 0.24;
  const pts = roundRect(b.cx - w / 2, b.cy - hh / 2, w, hh, S * 0.035);
  ctx.save();
  ctx.translate(b.cx, b.cy); ctx.rotate(-0.04); ctx.translate(-b.cx, -b.cy);
  fill(ctx, pts.map(([x, y]) => [x + S * 0.008, y + S * 0.012]), 'rgba(43,28,20,0.18)');
  fill(ctx, pts, color);
  rim(ctx, pts, W(S), 26);
  let size = S * 0.15;
  ctx.font = `${size}px "Alfa Slab One"`;
  const tw = ctx.measureText(text).width;
  if (tw > w * 0.8) { size *= (w * 0.8) / tw; ctx.font = `${size}px "Alfa Slab One"`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = W(S) * 1.6;
  ctx.strokeText(text, b.cx, b.cy + S * 0.008);
  ctx.fillStyle = P.paper; ctx.fillText(text, b.cx, b.cy + S * 0.008);
  ctx.restore();
}

export function drawFolder(ctx, S, f) {
  const b = folder(ctx, S);
  if (f.stamp) stamp(ctx, S, () => STAMPS[f.stamp](ctx, S, b));
  else sticker(ctx, S, b, f.label ?? f.name);
}

// home folders with a stamp; `children` folders each get a sticker
export const FOLDERS = [
  { id: 'f-desktop', path: '~/Desktop', name: 'Desktop', stamp: 'desktop' },
  { id: 'f-documents', path: '~/Documents', name: 'Documents', stamp: 'documents' },
  { id: 'f-downloads', path: '~/Downloads', name: 'Downloads', stamp: 'downloads' },
  { id: 'f-pictures', path: '~/Pictures', name: 'Pictures', stamp: 'pictures' },
  { id: 'f-movies', path: '~/Movies', name: 'Movies', stamp: 'movies' },
  { id: 'f-music', path: '~/Music', name: 'Music', stamp: 'music' },
  { id: 'f-public', path: '~/Public', name: 'Public', stamp: 'public' },
  { id: 'f-applications', path: '~/Applications', name: 'Applications', stamp: 'applications' },
  { id: 'f-bin', path: '~/bin', name: 'bin', stamp: 'terminal' },
  { id: 'f-koding', path: '~/Koding', name: 'Koding', stamp: 'code' },
];
// every folder directly inside these gets a sticker with its initials
export const STICKER_PARENTS = ['~/Koding', '~/Desktop', '~'];
// ...except these (system or already stamped)
export const SKIP = ['Library', 'Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music', 'Public', 'Applications', 'bin', 'Koding'];
