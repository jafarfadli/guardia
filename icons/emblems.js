// The app emblems, each redrawn in the room's ink on a paper card (style A, "kartu cetak").
// Every app keeps its own silhouette and one brand colour, muted into the room's palette.
// ICONS also says where each app lives and which Dock group it belongs to.
import { stroke, fill, clipTo, setInk } from '../wallpaper/src/ink.js';
import { P, tone, circle, arc, rim, shaded, card } from './glyphs.js';

const C = {
  ...P,
  whatsapp: '#5E9468', line: '#4E9A5E', telegram: '#4F7BA6', discord: '#5E66A3',
  word: '#3E5C93', excel: '#4E7A5C', powerpoint: '#B0573A', vscode: '#3F72AE', github: '#6A5994',
  blender: '#C8752F', jump: '#5D8DBE', zoom: '#4A74B2', steam: '#2F3E5C', vlc: '#CF7A2C',
  roblox: '#4D6FB0', claude: '#C2683F', arduino: '#3F7F82', cherry: '#7E3B2B', logic: '#8CC59A',
  figRed: '#C95B45', figOrange: '#D98A4A', figViolet: '#8A6BB0', figBlue: '#5B97C9', figGreen: '#5FA37A',
  fur: '#D28A45', furShade: '#B86F33', pink: '#E39A8E',
};

const W = (S) => S * 0.0105;   // the emblem's ink weight

// ---------------------------------------------------------------- small helpers
function roundRect(x, y, w, h, r, k = 10) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= k; i++) { const t = a0 + (i / k) * (Math.PI / 2); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

function ellipse(cx, cy, rx, ry, a = 0, k = 72) {
  return Array.from({ length: k }, (_, i) => {
    const t = (i / k) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  });
}

const rot = (pts, cx, cy, a) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const rel = (cx, cy, u, pts) => pts.map(([x, y]) => [cx + x * u, cy + y * u]);

// several parts read as one inked shape: ink every edge wide, then fill every part on top
function blob(ctx, S, parts, color, seed = 50, shade = true) {
  const w = W(S);
  parts.forEach((pts, i) => stroke(ctx, [...pts, pts[0], pts[1]], { w: w * 2, taper: 0, seed: seed + i, wobble: w * 0.1, breathe: 0.12 }));
  parts.forEach((pts) => fill(ctx, pts, color));
  if (!shade) return;
  // one hard shade step across the whole shape, lower right
  const all = parts.flat();
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (const pts of parts) {
    ctx.save(); clipTo(ctx, pts);
    ctx.beginPath();
    ctx.moveTo(x0 + (x1 - x0) * 1.05, y0 - 4); ctx.lineTo(x1 + 10, y0 - 4); ctx.lineTo(x1 + 10, y1 + 10); ctx.lineTo(x0 + (x1 - x0) * 0.2, y1 + 10);
    ctx.closePath(); ctx.fillStyle = tone(color, 0.84); ctx.fill();
    ctx.restore();
  }
}

// a thick band along a path, inked on both sides
function band(ctx, S, pts, width, color, seed = 60, cap = 'round') {
  const w = W(S);
  const line = (col, lw) => {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = cap; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
  };
  line(C.ink, width + w * 2.2);
  line(color, width);
}

function letter(ctx, S, ch, x, y, size, color, font = 'Alfa Slab One', weight = '') {
  ctx.save();
  ctx.font = `${weight} ${size}px "${font}"`.trim();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = C.ink; ctx.lineWidth = W(S) * 1.8;
  ctx.strokeText(ch, x, y);
  ctx.fillStyle = color; ctx.fillText(ch, x, y);
  ctx.restore();
}

function dot(ctx, S, x, y, r, color, seed = 70) { shaded(ctx, circle(x, y, r, 48), color, W(S) * 0.9, seed); }

// ---------------------------------------------------------------- social
function whatsapp(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 11);
  const u = S * 0.24;
  const bubble = circle(cx + u * 0.04, cy - u * 0.04, u, 120);
  const tail = [[cx - u * 0.55, cy + u * 0.6], [cx - u * 1.02, cy + u * 1.0], [cx - u * 0.2, cy + u * 0.86]];
  blob(ctx, S, [bubble, tail], C.whatsapp, 51);
  // the handset: a thick curved band with fat ends
  const h = rel(cx, cy, u, [[-0.34, -0.36], [-0.42, -0.06], [-0.24, 0.24], [0.06, 0.42], [0.36, 0.36]]);
  band(ctx, S, h, u * 0.17, C.paper, 52);
  for (const [x, y, a] of [[-0.38, -0.38, -0.5], [0.4, 0.33, 1.05]]) {
    shaded(ctx, ellipse(cx + x * u, cy + y * u, u * 0.15, u * 0.11, a), C.paper, W(S) * 0.9, 53, { shade: C.cream });
  }
}

function line(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 12);
  const u = S * 0.25;
  const body = roundRect(cx - u * 1.05, cy - u * 0.82, u * 2.1, u * 1.5, u * 0.62, 14);
  const tail = [[cx + u * 0.38, cy + u * 0.6], [cx + u * 0.62, cy + u * 1.02], [cx - u * 0.05, cy + u * 0.66]];
  blob(ctx, S, [body, tail], C.line, 54);
  letter(ctx, S, 'LINE', cx, cy - u * 0.08, u * 0.62, C.paper, 'Shantell Sans', '800');
}

function telegram(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 13);
  const R = S * 0.25;
  shaded(ctx, circle(cx, cy, R), C.telegram, W(S), 12);
  const k = R / 100;
  const plane = [[cx - 62 * k, cy - 2 * k], [cx + 58 * k, cy - 50 * k], [cx + 36 * k, cy + 58 * k], [cx + 2 * k, cy + 30 * k], [cx - 18 * k, cy + 48 * k], [cx - 14 * k, cy + 20 * k]];
  const wing = [[cx - 14 * k, cy + 20 * k], [cx + 58 * k, cy - 50 * k], [cx + 2 * k, cy + 30 * k]];
  fill(ctx, plane, C.paper);
  fill(ctx, wing, C.cream);
  rim(ctx, plane, W(S) * 0.95, 13);
  stroke(ctx, [[cx - 14 * k, cy + 20 * k], [cx + 58 * k, cy - 50 * k]], { w: W(S) * 0.75, taper: 0.6, seed: 14 });
  stroke(ctx, [[cx - 14 * k, cy + 20 * k], [cx + 2 * k, cy + 30 * k]], { w: W(S) * 0.75, taper: 0.6, seed: 15 });
}

function discord(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 14);
  const u = S * 0.27;
  const head = rel(cx, cy, u, [[-0.78, -0.48], [-0.42, -0.62], [-0.18, -0.5], [0.18, -0.5], [0.42, -0.62], [0.78, -0.48], [0.97, 0.12], [0.84, 0.55],
    [0.58, 0.64], [0.44, 0.44], [0, 0.5], [-0.44, 0.44], [-0.58, 0.64], [-0.84, 0.55], [-0.97, 0.12]]);
  blob(ctx, S, [smooth(head)], C.discord, 55);
  for (const x of [-0.33, 0.33]) shaded(ctx, ellipse(cx + x * u, cy + 0.06 * u, u * 0.15, u * 0.18), C.paper, W(S) * 0.8, 56, { shade: C.cream });
}

// a closed polygon rounded through its points
function smooth(pts, k = 6) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
}

// ---------------------------------------------------------------- work
// Office: a page with its own marks behind a coloured letter tile, like the real icons
function office(ctx, S, letterCh, color, marks, seed) {
  const { cx, cy } = card(ctx, S, P.paper, seed);
  const u = S * 0.25;
  const page = roundRect(cx - u * 0.42, cy - u * 0.98, u * 1.42, u * 1.8, u * 0.16);
  shaded(ctx, page, C.paper, W(S), seed + 1, { shade: '#E4D8BE' });
  marks(cx, cy, u);
  const tile = roundRect(cx - u * 1.0, cy - u * 0.2, u * 1.0, u * 1.0, u * 0.2);
  shaded(ctx, tile, color, W(S), seed + 2);
  letter(ctx, S, letterCh, cx - u * 0.5, cy + u * 0.32, u * 0.78, C.paper);
}

function word(ctx, S) {
  office(ctx, S, 'W', C.word, (cx, cy, u) => {
    for (let i = 0; i < 6; i++) stroke(ctx, [[cx + u * 0.12, cy - u * 0.7 + i * u * 0.24], [cx + u * (i % 3 === 2 ? 0.6 : 0.82), cy - u * 0.7 + i * u * 0.24]], { w: W(ctx.canvas.width) * 0.9, taper: 0.3, seed: 80 + i });
  }, 20);
}

function excel(ctx, S) {
  office(ctx, S, 'X', C.excel, (cx, cy, u) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
      const x = cx + u * (0.1 + c * 0.42), y = cy - u * (0.78 - r * 0.36);
      const cell = roundRect(x, y, u * 0.36, u * 0.28, u * 0.04, 3);
      fill(ctx, cell, (r + c) % 2 ? tone(C.excel, 1.55) : tone(C.excel, 1.3));
    }
  }, 30);
}

function powerpoint(ctx, S) {
  office(ctx, S, 'P', C.powerpoint, (cx, cy, u) => {
    const pc = [cx + u * 0.42, cy - u * 0.38];
    fill(ctx, circle(pc[0], pc[1], u * 0.36), tone(C.powerpoint, 1.45));
    const wedge = [pc, ...arc(pc[0], pc[1], u * 0.36, -Math.PI / 2, 0.2, 20)];
    fill(ctx, wedge, C.powerpoint);
    rim(ctx, circle(pc[0], pc[1], u * 0.36), W(ctx.canvas.width) * 0.8, 41);
  }, 40);
}

function vscode(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 21);
  const u = S * 0.27;
  const bar = rel(cx, cy, u, [[0.36, -0.96], [0.74, -0.8], [0.74, 0.8], [0.36, 0.96]]);
  const upper = rel(cx, cy, u, [[0.36, -0.96], [0.56, -0.66], [-0.6, 0.26], [-0.86, 0.06]]);
  const lower = rel(cx, cy, u, [[0.36, 0.96], [0.56, 0.66], [-0.6, -0.26], [-0.86, -0.06]]);
  blob(ctx, S, [lower, upper, bar], C.vscode, 57);
  // the fold where the arms pass behind the bar
  stroke(ctx, rel(cx, cy, u, [[0.36, -0.7], [0.36, 0.7]]), { w: W(S) * 0.8, taper: 0.5, seed: 58 });
}

function github(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 22);
  const u = S * 0.25;
  shaded(ctx, circle(cx, cy, u), C.github, W(S), 23);
  // the octocat: head with ears, neck, and the arm curling up on the left
  const head = smooth(rel(cx, cy - u * 0.12, u, [[-0.42, -0.1], [-0.46, -0.52], [-0.24, -0.34], [0, -0.38], [0.24, -0.34], [0.46, -0.52], [0.42, -0.1], [0.36, 0.16], [0, 0.26], [-0.36, 0.16]]));
  const neck = rel(cx, cy, u, [[-0.16, 0.08], [0.16, 0.08], [0.2, 0.72], [-0.2, 0.72]]);
  blob(ctx, S, [head, neck], C.paper, 24, false);
  band(ctx, S, rel(cx, cy, u, [[-0.2, 0.42], [-0.42, 0.42], [-0.56, 0.22]]), u * 0.1, C.paper, 25);
}

function unityCube(ctx, S, cx, cy, u, color) {
  const v = (a) => [cx + Math.cos(a) * u, cy + Math.sin(a) * u];
  const pts = [0, 1, 2, 3, 4, 5].map((i) => v(-Math.PI / 2 + (i * Math.PI) / 3));
  const ink = (a, b) => band(ctx, S, [a, b], u * 0.16, color, 90, 'butt');
  for (let i = 0; i < 6; i++) ink(pts[i], pts[(i + 1) % 6]);
  for (const i of [0, 2, 4]) ink([cx, cy], pts[(i + 3) % 6]);
}

function unityhub(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 26);
  shaded(ctx, circle(cx, cy, S * 0.26), C.dusty, W(S), 27);
  unityCube(ctx, S, cx, cy, S * 0.17, C.ink);
}

function unity(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 28);
  shaded(ctx, circle(cx, cy, S * 0.26), '#3A4252', W(S), 29);
  unityCube(ctx, S, cx, cy, S * 0.17, C.paper);
}

function tailscale(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 31);
  const g = S * 0.12;
  const on = new Set(['0,0', '1,0', '2,0', '1,1', '1,2']);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    dot(ctx, S, cx + (c - 1) * g, cy + (r - 1) * g, S * 0.043, on.has(`${c},${r}`) ? '#3A3430' : C.cream, 72 + r * 3 + c);
  }
}

function blender(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 32);
  const u = S * 0.25;
  const ox = cx + u * 0.22, oy = cy + u * 0.08;
  // the arms first, so the ring sits over them
  band(ctx, S, [[ox - u * 0.45, oy + u * 0.05], [cx - u * 1.0, oy + u * 0.5]], u * 0.24, C.blender, 61);
  band(ctx, S, [[ox - u * 0.35, oy - u * 0.45], [cx - u * 0.9, oy - u * 0.4]], u * 0.2, C.blender, 62);
  const ring = circle(ox, oy, u * 0.66);
  blob(ctx, S, [ring], C.blender, 63);
  fill(ctx, circle(ox, oy, u * 0.4), C.paper);
  rim(ctx, circle(ox, oy, u * 0.4), W(S), 64);
  shaded(ctx, circle(ox + u * 0.03, oy + u * 0.02, u * 0.24), C.navy, W(S) * 0.8, 65);
}

function jump(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 33);
  const R = S * 0.26;
  shaded(ctx, circle(cx, cy, R), C.jump, W(S), 34);
  ctx.save(); clipTo(ctx, circle(cx, cy, R));
  const cloud = [circle(cx - R * 0.5, cy + R * 0.62, R * 0.36), circle(cx, cy + R * 0.5, R * 0.46), circle(cx + R * 0.52, cy + R * 0.64, R * 0.34), roundRect(cx - R * 1.0, cy + R * 0.62, R * 2.0, R * 0.6, 4)];
  blob(ctx, S, cloud, C.paper, 35, false);
  ctx.restore();
  rim(ctx, circle(cx, cy, R), W(S), 34);
  // a figure mid-jump, arms and legs out
  const f = (x, y) => [cx + x * R, cy + y * R];
  for (const [a, b] of [[f(0, -0.2), f(-0.42, -0.5)], [f(0, -0.2), f(0.42, -0.52)], [f(0, -0.2), f(0, 0.08)], [f(0, 0.08), f(-0.3, 0.32)], [f(0, 0.08), f(0.32, 0.3)]]) {
    band(ctx, S, [a, b], R * 0.13, C.red, 36);
  }
  dot(ctx, S, cx + R * 0.02, cy - R * 0.44, R * 0.13, C.red, 37);
}

function chrome(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 38);
  const R = S * 0.26;
  const cols = [C.red, C.mustard, C.green];
  const ri = R * 0.46;
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 6, a1 = a0 + (2 * Math.PI) / 3;
    const outer = arc(cx, cy, R, a0, a1, 40);
    const tip = [cx + Math.cos(a1 - Math.PI / 3) * ri, cy + Math.sin(a1 - Math.PI / 3) * ri];
    const seg = [...outer, [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri], tip];
    fill(ctx, seg, cols[i]);
    ctx.save(); clipTo(ctx, seg); ctx.fillStyle = tone(cols[i], 0.84); ctx.beginPath(); ctx.arc(cx + R * 0.5, cy + R * 0.55, R * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    stroke(ctx, [outer[outer.length - 1], [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri]], { w: W(S) * 0.85, taper: 0, seed: 40 + i });
  }
  rim(ctx, circle(cx, cy, R), W(S), 16);
  fill(ctx, circle(cx, cy, ri * 1.08), C.paper);
  shaded(ctx, circle(cx, cy, ri * 0.78), C.navy, W(S) * 0.95, 17);
  rim(ctx, circle(cx, cy, ri * 1.08), W(S) * 0.85, 19);
}

function capcut(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 39);
  const u = S * 0.24;
  const p = (x, y) => [cx + x * u, cy + y * u];
  // one ribbon: top bar, down across, bottom bar, up across
  band(ctx, S, [p(-0.78, -0.58), p(0.78, -0.58), p(0.62, -0.42), p(-0.62, 0.42), p(-0.78, 0.58), p(0.78, 0.58), p(0.62, 0.42), p(-0.62, -0.42), p(-0.78, -0.58)], u * 0.2, '#2F2A27', 66);
}

function claude(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 42);
  const u = S * 0.26;
  const rays = [1.0, 0.82, 0.95, 0.78, 0.98, 0.86, 0.92, 0.8, 1.0, 0.84, 0.9];
  setInk(C.claude, 1);
  rays.forEach((len, i) => {
    const a = -Math.PI / 2 + (i / rays.length) * Math.PI * 2 + 0.12;
    stroke(ctx, [[cx + Math.cos(a) * u * 0.12, cy + Math.sin(a) * u * 0.12], [cx + Math.cos(a) * u * len, cy + Math.sin(a) * u * len]], { w: u * 0.17, taper: 0.9, taperLen: u * 0.45, seed: 100 + i, wobble: 1.5 });
  });
  setInk(C.ink, 1);
}

function ghostty(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 43);
  const u = S * 0.27;
  const screen = roundRect(cx - u * 0.98, cy - u * 0.78, u * 1.96, u * 1.56, u * 0.22);
  shaded(ctx, screen, C.navy, W(S), 44);
  // the ghost
  const g = smooth(rel(cx + u * 0.18, cy + u * 0.02, u, [[-0.34, 0.42], [-0.34, -0.1], [-0.2, -0.38], [0, -0.44], [0.2, -0.38], [0.34, -0.1], [0.34, 0.42], [0.2, 0.3], [0.08, 0.44], [-0.06, 0.3], [-0.2, 0.44]]));
  shaded(ctx, g, '#DCE6F2', W(S) * 0.85, 45, { shade: '#BFCCDF' });
  for (const x of [-0.1, 0.12]) fill(ctx, ellipse(cx + u * (0.18 + x), cy - u * 0.02, u * 0.05, u * 0.08), C.navy);
  letter(ctx, S, '>_', cx - u * 0.52, cy - u * 0.38, u * 0.42, C.mustard, 'Shantell Sans', '800');
}

function figma(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 46);
  const s = S * 0.155;
  const x0 = cx - s, y0 = cy - s * 1.5;
  const r = s / 2;
  // a square with its outer side rounded into a half circle
  const half = (x, y, side) => side === 'left'
    ? [[x + s, y], [x + s, y + s], ...arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5, 16)]
    : [[x, y + s], [x, y], ...arc(x + r, y + r, r, -Math.PI / 2, Math.PI / 2, 16)];
  shaded(ctx, half(x0, y0, 'left'), C.figRed, W(S), 47);
  shaded(ctx, half(x0 + s, y0, 'right'), C.figOrange, W(S), 48);
  shaded(ctx, half(x0, y0 + s, 'left'), C.figViolet, W(S), 49);
  shaded(ctx, circle(x0 + s * 1.5, y0 + s * 1.5, r), C.figBlue, W(S), 50);
  // the bottom piece: flat top, square right edge, round below and to the left
  const drop = [[x0, y0 + s * 2], [x0 + s, y0 + s * 2], [x0 + s, y0 + s * 2.5], ...arc(x0 + r, y0 + s * 2.5, r, 0, Math.PI, 16)];
  shaded(ctx, drop, C.figGreen, W(S), 51);
}

function zoom(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 52);
  const R = S * 0.26;
  shaded(ctx, circle(cx, cy, R), C.zoom, W(S), 53);
  const body = roundRect(cx - R * 0.62, cy - R * 0.36, R * 0.86, R * 0.72, R * 0.16);
  const lens = [[cx + R * 0.3, cy - R * 0.08], [cx + R * 0.66, cy - R * 0.32], [cx + R * 0.66, cy + R * 0.32], [cx + R * 0.3, cy + R * 0.08]];
  blob(ctx, S, [body, lens], C.paper, 54, false);
}

// ---------------------------------------------------------------- study
function matlab(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 55);
  const u = S * 0.26;
  const p = (x, y) => [cx + x * u, cy + y * u];
  const base = [p(-0.95, 0.38), p(-0.2, 0.05), p(0.1, 0.42), p(-0.55, 0.72)];
  shaded(ctx, base, C.blue, W(S), 56);
  const front = smooth([p(-0.2, 0.05), p(0.02, -0.4), p(0.22, -0.9), p(0.4, -0.3), p(0.92, 0.42), p(0.45, 0.62), p(0.1, 0.42)], 5);
  shaded(ctx, front, C.terracotta, W(S), 57, { shade: '#8E4430', at: 0.45 });
}

function arduino(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 58);
  const R = S * 0.27;
  shaded(ctx, circle(cx, cy, R), C.arduino, W(S), 59);
  const r = R * 0.34;
  for (const s of [-1, 1]) {
    const ring = circle(cx + s * r * 1.05, cy, r);
    band(ctx, S, [...ring, ring[0], ring[1]], R * 0.12, C.paper, 60 + s);
  }
  ctx.save(); ctx.strokeStyle = C.paper; ctx.lineWidth = R * 0.07; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - r * 1.4, cy); ctx.lineTo(cx - r * 0.7, cy);
  ctx.moveTo(cx + r * 0.7, cy); ctx.lineTo(cx + r * 1.4, cy); ctx.moveTo(cx + r * 1.05, cy - r * 0.35); ctx.lineTo(cx + r * 1.05, cy + r * 0.35);
  ctx.stroke(); ctx.restore();
}

function ltspice(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 61);
  const u = S * 0.26;
  const tri = [[cx - u * 0.9, cy - u * 0.8], [cx + u * 0.75, cy], [cx - u * 0.9, cy + u * 0.8]];
  shaded(ctx, tri, '#DCD3C2', W(S), 62, { shade: '#C9BFAC' });
  ctx.save(); ctx.translate(cx + u * 0.05, cy - u * 0.05); ctx.transform(1, 0, -0.22, 1, 0, 0);
  letter(ctx, S, 'LT', 0, 0, u * 0.92, C.cherry);
  ctx.restore();
}

function logisim(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 63);
  const R = S * 0.27;
  shaded(ctx, circle(cx, cy, R), '#2E3431', W(S), 64);
  const g = [[cx - R * 0.42, cy - R * 0.42], [cx, cy - R * 0.42], ...arc(cx, cy, R * 0.42, -Math.PI / 2, Math.PI / 2, 24), [cx - R * 0.42, cy + R * 0.42]];
  ctx.save(); ctx.strokeStyle = C.logic; ctx.lineWidth = R * 0.07; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); g.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  for (const y of [-0.22, 0.22]) { ctx.moveTo(cx - R * 0.42, cy + y * R); ctx.lineTo(cx - R * 0.8, cy + y * R); }
  ctx.moveTo(cx + R * 0.42, cy); ctx.lineTo(cx + R * 0.8, cy);
  ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- play
function spotify(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 65);
  const R = S * 0.26;
  shaded(ctx, circle(cx, cy, R), C.green, W(S), 66);
  // three arcs, a little tilted, thickest on top
  for (const [y, half, sag, w] of [[-0.3, 0.6, 0.2, 0.15], [0.02, 0.5, 0.16, 0.125], [0.3, 0.4, 0.12, 0.1]]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = -1 + (2 * i) / 24;
      pts.push([cx + t * half * R, cy + (y + sag * t * t - 0.05 * t) * R]);
    }
    ctx.save(); ctx.strokeStyle = '#2B2420'; ctx.lineWidth = w * R; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.stroke(); ctx.restore();
  }
}

function roblox(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 67);
  const u = S * 0.24;
  const sq = rot(roundRect(cx - u, cy - u, u * 2, u * 2, u * 0.12), cx, cy, -0.26);
  shaded(ctx, sq, C.roblox, W(S), 68);
  const hole = rot(roundRect(cx - u * 0.3, cy - u * 0.3, u * 0.6, u * 0.6, u * 0.05), cx, cy, -0.26);
  fill(ctx, hole, C.paper);
  rim(ctx, hole, W(S) * 0.9, 69);
}

function robloxstudio(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 70);
  const u = S * 0.24;
  const a = rot([[cx - u, cy - u], [cx + u * 0.3, cy - u], [cx + u * 0.3, cy - u * 0.4], [cx - u * 0.4, cy - u * 0.4], [cx - u * 0.4, cy + u * 0.3], [cx - u, cy + u * 0.3]], cx, cy, -0.26);
  const b = rot([[cx + u, cy + u], [cx - u * 0.3, cy + u], [cx - u * 0.3, cy + u * 0.4], [cx + u * 0.4, cy + u * 0.4], [cx + u * 0.4, cy - u * 0.3], [cx + u, cy - u * 0.3]], cx, cy, -0.26);
  shaded(ctx, a, '#3A4252', W(S), 71);
  shaded(ctx, b, C.roblox, W(S), 72);
}

function steam(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 73);
  const R = S * 0.26;
  shaded(ctx, circle(cx, cy, R), C.steam, W(S), 74);
  const big = [cx + R * 0.3, cy - R * 0.22], small = [cx - R * 0.42, cy + R * 0.34];
  band(ctx, S, [small, big], R * 0.2, C.paper, 75);
  const ring = circle(big[0], big[1], R * 0.3);
  band(ctx, S, [...ring, ring[0], ring[1]], R * 0.12, C.paper, 76);
  dot(ctx, S, big[0], big[1], R * 0.13, C.paper, 77);
  dot(ctx, S, small[0], small[1], R * 0.17, C.paper, 78);
  fill(ctx, circle(small[0], small[1], R * 0.07), C.steam);
}

function vlc(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 79);
  const u = S * 0.27;
  const base = roundRect(cx - u * 0.82, cy + u * 0.58, u * 1.64, u * 0.3, u * 0.1);
  shaded(ctx, base, C.vlc, W(S), 80);
  const cone = [[cx - u * 0.12, cy - u * 0.95], [cx + u * 0.12, cy - u * 0.95], [cx + u * 0.6, cy + u * 0.62], [cx - u * 0.6, cy + u * 0.62]];
  shaded(ctx, cone, C.vlc, W(S), 81);
  ctx.save(); clipTo(ctx, cone);
  for (const [y, h] of [[-0.38, 0.17], [0.12, 0.2]]) { ctx.fillStyle = C.paper; ctx.fillRect(cx - u, cy + y * u, u * 2, h * u); }
  ctx.restore();
  rim(ctx, cone, W(S), 82);
}

// ---------------------------------------------------------------- Guardia: Maestro's face
function guardia(ctx, S) {
  const { cx, cy } = card(ctx, S, P.paper, 83);
  const u = S * 0.25;
  const head = smooth(rel(cx, cy + u * 0.1, u, [[0, -0.78], [0.62, -0.62], [0.98, -0.1], [0.94, 0.42], [0.52, 0.78], [0, 0.86], [-0.52, 0.78], [-0.94, 0.42], [-0.98, -0.1], [-0.62, -0.62]]));
  const earL = rel(cx, cy + u * 0.1, u, [[-0.86, -0.3], [-0.78, -1.12], [-0.22, -0.72]]);
  const earR = rel(cx, cy + u * 0.1, u, [[0.86, -0.3], [0.78, -1.12], [0.22, -0.72]]);
  blob(ctx, S, [earL, earR, head], C.fur, 84);
  for (const s of [-1, 1]) fill(ctx, rel(cx, cy + u * 0.1, u, [[s * 0.74, -0.42], [s * 0.7, -0.92], [s * 0.36, -0.68]]), C.pink);
  // stripes on the forehead
  for (const x of [-0.2, 0, 0.2]) fill(ctx, rel(cx, cy + u * 0.1, u, [[x - 0.06, -0.74], [x, -0.42], [x + 0.06, -0.74]]), C.furShade);
  // cream muzzle
  fill(ctx, ellipse(cx, cy + u * 0.5, u * 0.42, u * 0.26), '#F5E4C3');
  // eyes with two shines, blush, nose, mouth
  for (const s of [-1, 1]) {
    fill(ctx, ellipse(cx + s * u * 0.36, cy + u * 0.12, u * 0.13, u * 0.16), C.ink);
    fill(ctx, circle(cx + s * u * 0.36 + u * 0.04, cy + u * 0.06, u * 0.045), '#FFF8EA');
    fill(ctx, ellipse(cx + s * u * 0.62, cy + u * 0.4, u * 0.13, u * 0.07), 'rgba(226,120,110,0.55)');
  }
  fill(ctx, [[cx - u * 0.07, cy + u * 0.36], [cx + u * 0.07, cy + u * 0.36], [cx, cy + u * 0.44]], C.pink);
  stroke(ctx, [[cx - u * 0.14, cy + u * 0.52], [cx - u * 0.07, cy + u * 0.58], [cx, cy + u * 0.5], [cx + u * 0.07, cy + u * 0.58], [cx + u * 0.14, cy + u * 0.52]], { w: W(S) * 0.7, taper: 0.4, seed: 85 });
}

// where each app lives and its Dock group; `path` may hold a * for versioned folders
export const ICONS = [
  { id: 'whatsapp', name: 'WhatsApp', path: '/Applications/WhatsApp.app', group: 'sosial', draw: whatsapp },
  { id: 'line', name: 'LINE', path: '/Applications/LINE.app', group: 'sosial', draw: line },
  { id: 'telegram', name: 'Telegram', path: '/Applications/Telegram.app', group: 'sosial', draw: telegram },
  { id: 'discord', name: 'Discord', path: '/Applications/Discord.app', group: 'sosial', draw: discord },
  { id: 'chrome', name: 'Google Chrome', path: '/Applications/Google Chrome.app', group: 'kerja', draw: chrome },
  { id: 'vscode', name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app', group: 'kerja', draw: vscode },
  { id: 'claude', name: 'Claude', path: '/Applications/Claude.app', group: 'kerja', draw: claude },
  { id: 'ghostty', name: 'Ghostty', path: '/Applications/Ghostty.app', group: 'kerja', draw: ghostty },
  { id: 'github', name: 'GitHub Desktop', path: '/Applications/GitHub Desktop.app', group: 'kerja', draw: github },
  { id: 'word', name: 'Microsoft Word', path: '/Applications/Microsoft Word.app', group: 'kerja', draw: word },
  { id: 'excel', name: 'Microsoft Excel', path: '/Applications/Microsoft Excel.app', group: 'kerja', draw: excel },
  { id: 'powerpoint', name: 'Microsoft PowerPoint', path: '/Applications/Microsoft PowerPoint.app', group: 'kerja', draw: powerpoint },
  { id: 'figma', name: 'Figma', path: '/Applications/Figma.app', group: 'kerja', draw: figma },
  { id: 'unityhub', name: 'Unity Hub', path: '/Applications/Unity Hub.app', group: 'kerja', draw: unityhub },
  { id: 'unity', name: 'Unity', path: '/Applications/Unity/Hub/Editor/*/Unity.app', group: 'kerja', draw: unity },
  { id: 'blender', name: 'Blender', path: '/Applications/Blender.app', group: 'kerja', draw: blender },
  { id: 'capcut', name: 'CapCut', path: '/Applications/CapCut.app', group: 'kerja', draw: capcut },
  { id: 'zoom', name: 'Zoom', path: '/Applications/zoom.us.app', group: 'kerja', draw: zoom },
  { id: 'jump', name: 'Jump Desktop', path: '/Applications/Jump Desktop.app', group: 'kerja', draw: jump },
  { id: 'tailscale', name: 'Tailscale', path: '/Applications/Tailscale.app', group: 'kerja', draw: tailscale },
  { id: 'matlab', name: 'MATLAB', path: '/Applications/MATLAB_*.app', group: 'kerja', draw: matlab },
  { id: 'arduino', name: 'Arduino IDE', path: '/Applications/Arduino IDE.app', group: 'kerja', draw: arduino },
  { id: 'ltspice', name: 'LTspice', path: '/Applications/LTspice.app', group: 'kerja', draw: ltspice },
  { id: 'logisim', name: 'Logisim-evolution', path: '/Applications/Logisim-evolution.app', group: 'kerja', draw: logisim },
  { id: 'spotify', name: 'Spotify', path: '/Applications/Spotify.app', group: 'hiburan', draw: spotify },
  { id: 'roblox', name: 'Roblox', path: '/Applications/Roblox.app', group: 'hiburan', draw: roblox },
  { id: 'robloxstudio', name: 'Roblox Studio', path: '/Applications/RobloxStudio.app', group: 'hiburan', draw: robloxstudio },
  { id: 'steam', name: 'Steam', path: '/Applications/Steam.app', group: 'hiburan', draw: steam },
  { id: 'vlc', name: 'VLC', path: '/Applications/VLC.app', group: 'hiburan', draw: vlc },
  { id: 'guardia', name: 'Guardia', path: null, group: null, draw: guardia },
];
