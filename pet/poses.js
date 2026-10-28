// Maestro's and Maestra's animations (one set of poses, two coats). Cell 200 × 160 (CSS px),
// facing right, ground at y = 150.
import { COL } from './cat.js';

const TAU = Math.PI * 2;
const { sin, cos, abs, max } = Math;
const GROUND = 146; // paw centres sit just above the ground line

function walk(i, n) {
  const ph = (i / n) * TAU;
  const bob = -2.4 * abs(sin(ph)) + 1.2;
  const bob2 = -2.0 * abs(sin(ph - 0.55)) + 1.0;
  const squash = 0.03 * sin(2 * ph);
  const foot = (hx, off) => {
    const s = sin(ph + off), c = cos(ph + off);
    return [hx + 11 * s, GROUND - max(0, c) * 6.5];
  };
  const bx = 98, by = 115 + bob;
  return {
    body: { x: bx, y: by, rx: 38 * (1 - squash * 0.6), ry: 24 * (1 + squash), shape: 'bean', a: 0.03 * sin(ph) },
    head: { x: 139, y: 79 + bob2, r: 31, a: -0.04 + 0.03 * sin(ph - 0.5) },
    ears: 1,
    legs: [
      { hip: [80, by + 8], foot: foot(80, Math.PI), far: true },
      { hip: [113, by + 8], foot: foot(113, Math.PI * 1.5), far: true },
      { hip: [84, by + 10], foot: foot(84, 0) },
      { hip: [117, by + 10], foot: foot(117, Math.PI / 2) },
    ],
    tail: [[66, by - 4], [52 + 2 * sin(ph - 1), by - 18], [50 + 4 * sin(ph - 1.6), by - 38], [58 + 5 * sin(ph - 2.2), by - 50]],
    eyes: 'open', look: [1, 0],
  };
}

function sit(o = {}) {
  const br = o.breathe ?? 0;
  const by = 116 + (o.dy ?? 0);
  return {
    body: { x: 98, y: by, rx: 30 * (1 + br * 0.01), ry: 31 * (1 + br * 0.015), shape: 'sit' },
    head: { x: 110 + (o.hx ?? 0), y: 72 + (o.dy ?? 0) + (o.hy ?? 0), r: 32, a: o.tilt ?? -0.05 },
    ears: o.ears ?? 1,
    legs: o.legs ?? [
      { hip: [83, 132], foot: [78, GROUND], r0: 12, r1: 8.5 },
      { hip: [104, 128], foot: [104, GROUND], far: true },
      { hip: [114, 128], foot: [116, GROUND] },
    ],
    tail: [[72, 142], [58, 148], [74, 153], [104, 152], [126, 148], [136 + (o.tip ?? 0), 140 + (o.tip ?? 0) * 0.3]],
    tailW: [7.5, 6],
    eyes: o.eyes ?? 'open', mouth: o.mouth, look: o.look ?? [0.5, 0],
    extra: o.extra,
  };
}

function idle(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    breathe: sin(ph), tip: 4 * sin(ph * 2), tilt: -0.05 + 0.03 * sin(ph),
    eyes: i === 10 || i === 11 ? 'closed' : 'open', ears: i >= 13 && i <= 14 ? 0.4 : 1,
    look: [0.5 + 0.5 * sin(ph * 0.5), 0],
  });
}

function tap(i, n) {
  // bongo paws: one up, the other down, alternating with every key
  const up = i % 2 === 0;
  const press = (i % 2) * 0.5 + 0.5;
  return sit({
    dy: up ? -1 : 0.5, hy: up ? -1.5 : 1, tip: up ? -4 : 3, mouth: i % 3 === 1 ? 'open' : undefined, look: [1, 0.4],
    legs: [
      { hip: [83, 132], foot: [78, GROUND], r0: 12, r1: 8.5 },
      { hip: [104, 128], foot: up ? [104, GROUND] : [114, 131], far: true },
      { hip: [114, 128], foot: up ? [126, 129] : [116, GROUND] },
    ],
    extra: (ctx) => {
      const x = up ? 104 : 116;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6 * press; ctx.lineCap = 'round';
      for (const [dx, dy] of [[-9, -3], [0, -7], [9, -3]]) { ctx.beginPath(); ctx.moveTo(x + dx * 0.55, 145 + dy * 0.55); ctx.lineTo(x + dx, 145 + dy); ctx.stroke(); }
    },
  });
}

function purr(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    eyes: 'happy', tilt: -0.14 + 0.06 * sin(ph), hx: 2, breathe: sin(ph * 2), tip: 6 * sin(ph),
    extra: (ctx) => {
      for (let k = 0; k < 2; k++) {
        const t = ((i / n) + k * 0.5) % 1;
        heart(ctx, 150 + k * 16 - t * 6, 46 - t * 34, 6 + t * 2, 1 - t * 0.75);
      }
    },
  });
}

function heart(ctx, x, y, s, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fillStyle = '#D9604E'; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = COL.ink; ctx.stroke();
  ctx.restore();
}

function sleep(i, n) {
  const ph = (i / n) * TAU;
  const br = sin(ph);
  return {
    body: { x: 98, y: 131 - br * 0.6, rx: 46, ry: 18 * (1 + br * 0.04), shape: 'loaf' },
    head: { x: 138, y: 124 - br * 0.4, r: 27, a: 0.18 },
    ears: 0.2,
    legs: [],
    tail: [[56, 138], [60, 149], [96, 152], [132, 151], [150, 145 + sin(ph * 0.5) * 1.5]],
    tailW: [7, 5.5],
    eyes: 'closed',
    extra: (ctx) => {
      ctx.fillStyle = COL.ink;
      for (let k = 0; k < 3; k++) {
        const t = ((i / n) + k / 3) % 1;
        ctx.globalAlpha = sin(t * Math.PI);
        ctx.font = `700 ${11 + t * 8}px "Shantell Sans"`;
        ctx.fillText('z', 160 + t * 12 + k * 2, 104 - t * 44);
      }
      ctx.globalAlpha = 1;
    },
  };
}

function stretch(i, n) {
  const t = sin((i / (n - 1)) * Math.PI);
  return {
    body: { x: 96 + t * 2, y: 116 - t * 4, rx: 38 + t * 8, ry: 23 - t * 3, shape: 'bean', a: 0.28 * t },
    head: { x: 140 + t * 6, y: 82 + t * 18, r: 30, a: 0.15 * t },
    ears: 1 - t * 0.7,
    legs: [
      { hip: [80, 124 - t * 10], foot: [80, GROUND], far: true },
      { hip: [112, 124 + t * 4], foot: [112 + t * 26, GROUND], far: true },
      { hip: [84, 126 - t * 10], foot: [86, GROUND] },
      { hip: [116, 126 + t * 4], foot: [118 + t * 30, GROUND] },
    ],
    tail: [[64, 110 - t * 14], [50, 92 - t * 18], [48, 70 - t * 16], [56, 56 - t * 12]],
    eyes: t > 0.45 ? 'closed' : 'open', mouth: t > 0.7 ? 'open' : undefined,
  };
}

function dangle(i, n) {
  const ph = (i / n) * TAU;
  const sw = sin(ph);
  const a = -1.5 + 0.07 * sw;
  return {
    body: { x: 100 + sw * 2, y: 98, rx: 34, ry: 23, shape: 'bean', a },
    head: { x: 100 + sw * 0.8, y: 50, r: 30, a: 0.05 * sw },
    ears: 0.1,
    legs: [
      { hip: [92, 120], foot: [90 + sw * 3, 140], far: true },
      { hip: [108, 120], foot: [110 + sw * 3, 140] },
      { hip: [94, 84], foot: [88 + sw * 2, 100], far: true },
      { hip: [108, 84], foot: [114 + sw * 2, 100] },
    ],
    tail: [[100, 128], [98 + sw * 4, 140], [96 + sw * 7, 150], [100 + sw * 8, 156]],
    tailW: [7, 5.5],
    eyes: 'half', look: [0.6, 0.2],
  };
}

// Focus mode: a quick leap onto the Chrome tab (driven frame by frame by Pet.swift), then the swipe.
function leap(i, n) {
  // crouch → launch → stretched → tucked → reaching down to land
  const K = [
    { s: 0.0, by: 120, hy: 82, ff: [118, GROUND], bf: [80, GROUND] },
    { s: 0.55, by: 112, hy: 68, ff: [140, 112], bf: [66, 140] },
    { s: 1.0, by: 104, hy: 58, ff: [156, 90], bf: [52, 128] },
    { s: 0.8, by: 102, hy: 60, ff: [150, 96], bf: [62, 120] },
    { s: 0.45, by: 106, hy: 66, ff: [138, 120], bf: [74, 126] },
    { s: 0.2, by: 112, hy: 74, ff: [128, 138], bf: [82, 136] },
  ][Math.min(i, 5)];
  const a = -0.38 * K.s;
  return {
    body: { x: 98, y: K.by, rx: 38 + 8 * K.s, ry: 23 - 3 * K.s, shape: 'bean', a },
    head: { x: 140 + 6 * K.s, y: K.hy, r: 30, a: -0.1 - 0.12 * K.s },
    ears: 1 - 0.5 * K.s,
    legs: [
      { hip: [80, K.by + 8], foot: [K.bf[0] - 4, K.bf[1] - 2], far: true },
      { hip: [114, K.by + 4 - 8 * K.s], foot: [K.ff[0] - 6, K.ff[1] + 2], far: true },
      { hip: [84, K.by + 10], foot: K.bf },
      { hip: [118, K.by + 6 - 8 * K.s], foot: K.ff },
    ],
    tail: [[66, K.by + 2], [52, K.by + 2 - 4 * K.s], [40, K.by - 6 - 10 * K.s], [30 + 4 * K.s, K.by - 16 - 6 * K.s]],
    eyes: 'open', look: [1, -0.5], mouth: K.s > 0.7 ? 'open' : undefined,
  };
}


// the paw swipe that closes the tab (also done where he sits)
function swipe(i, n) {
  const paws = [[126, 112], [132, 94], [152, 116], [158, 136], [136, 132], [118, GROUND]];
  const p = paws[Math.min(i, 5)];
  const hit = i === 2 || i === 3;
  return sit({
    hx: 5, hy: hit ? 3 : 0, tilt: hit ? 0.12 : 0.02, ears: hit ? 0.45 : 0.9, look: [1, 0.35],
    mouth: hit ? 'open' : undefined, tip: hit ? -8 : 4,
    legs: [
      { hip: [83, 132], foot: [78, GROUND], r0: 12, r1: 8.5 },
      { hip: [104, 128], foot: [104, GROUND], far: true },
      { hip: [116, 124], foot: p },
    ],
    extra: (ctx) => {
      if (!hit) return;
      ctx.strokeStyle = COL.ink; ctx.lineCap = 'round';
      // swipe arcs behind the paw
      for (const [r, w] of [[34, 2.2], [26, 1.6]]) {
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(124, 128, r, -1.4, i === 2 ? -0.2 : 0.35); ctx.stroke();
      }
      if (i === 3) {
        // the hit: a little ink star
        ctx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const t = (k / 6) * TAU;
          ctx.beginPath(); ctx.moveTo(170 + Math.cos(t) * 5, 134 + Math.sin(t) * 5); ctx.lineTo(170 + Math.cos(t) * 11, 134 + Math.sin(t) * 11); ctx.stroke();
        }
      }
    },
  });
}

// ---------------------------------------------------------------- small ink props
function inkStrokes(ctx, lines, w = 1.6, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = COL.ink; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const l of lines) { ctx.beginPath(); ctx.moveTo(l[0][0], l[0][1]); for (const p of l.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
  ctx.restore();
}

// a music note: filled head, stem, flag
function note(ctx, x, y, s, a) {
  ctx.save();
  ctx.globalAlpha = a; ctx.fillStyle = COL.ink; ctx.strokeStyle = COL.ink; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, TAU); ctx.fill();
  ctx.lineWidth = s * 0.18;
  ctx.beginPath(); ctx.moveTo(x + s * 0.48, y - s * 0.1); ctx.lineTo(x + s * 0.48, y - s * 1.7); ctx.quadraticCurveTo(x + s * 1.1, y - s * 1.3, x + s * 1.0, y - s * 0.75); ctx.stroke();
  ctx.restore();
}

function drop(ctx, x, y, s, a = 1) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.quadraticCurveTo(x + s, y, x, y + s * 0.8); ctx.quadraticCurveTo(x - s, y, x, y - s * 1.3);
  ctx.fillStyle = '#9CC3D8'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = COL.ink; ctx.stroke();
  ctx.restore();
}

// an enamel bowl at the cat's front paws (food: kibble showing)
function bowl(ctx, food, x = 168) {
  const y = 148;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 21, y - 13); ctx.lineTo(x + 21, y - 13); ctx.lineTo(x + 15, y); ctx.lineTo(x - 15, y); ctx.closePath();
  ctx.fillStyle = '#F2EEE6'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = COL.ink; ctx.stroke();
  // the blue rim of enamelware, and a chip
  ctx.beginPath(); ctx.ellipse(x, y - 13, 21, 4.5, 0, 0, TAU); ctx.fillStyle = food ? '#9A6A3E' : '#E4DED2'; ctx.fill();
  ctx.lineWidth = 2.6; ctx.strokeStyle = '#4F78A8'; ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = COL.ink; ctx.beginPath(); ctx.ellipse(x, y - 13, 22.4, 5.6, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#2B1C14'; ctx.beginPath(); ctx.arc(x + 9, y - 6, 1.6, 0, TAU); ctx.fill();
  if (food) {
    ctx.fillStyle = '#7A4E2A';
    for (const [dx, dy] of [[-10, -14], [-4, -15], [3, -14.5], [9, -15], [-7, -12.5], [6, -12.5], [0, -13]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- moods and reactions
// Claude is working: sitting up, ears forward, watching the screen; the tail tip ticks.
function watch(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    breathe: sin(ph), tilt: -0.17 + 0.02 * sin(ph), hy: -2, tip: i % 6 < 2 ? 7 : -2, look: [0.7, -0.9],
    eyes: i === 8 ? 'closed' : 'open', ears: i >= 4 && i <= 5 ? 0.75 : 1,
  });
}

// Claude finished, a timer rang: head up, a meow (the words come in Swift's balloon)
function meow(i, n) {
  const up = i >= 2 && i <= 5;
  return sit({
    hy: up ? -4 : 0, tilt: up ? -0.22 : -0.05, ears: up ? 0.7 : 1, mouth: up ? 'open' : undefined, look: [0.6, -0.4], tip: up ? 8 : 2,
    extra: (ctx) => {
      if (i < 3 || i > 5) return;
      const k = (i - 2) / 3;
      inkStrokes(ctx, [[[150, 72], [158 + k * 4, 68]], [[151, 80], [160 + k * 4, 80]], [[150, 88], [158 + k * 4, 92]]], 1.8, 1 - k * 0.4);
    },
  });
}

// Rain: a loaf, paws tucked, watching the sky; the tail wrapped round
function loaf(i, n) {
  const ph = (i / n) * TAU;
  const br = sin(ph);
  const up = i >= 5 && i <= 8;
  return {
    body: { x: 96, y: 129 - br * 0.6, rx: 44, ry: 20 * (1 + br * 0.03), shape: 'loaf' },
    head: { x: 136, y: 100 - br * 0.4 - (up ? 2 : 0), r: 29, a: up ? -0.2 : -0.04 },
    ears: 0.55,
    legs: [],
    tail: [[54, 136], [58, 148], [96, 152], [134, 151], [150, 146 + sin(ph * 0.5) * 1.5]],
    tailW: [7, 5.5],
    eyes: i === 2 ? 'closed' : up ? 'open' : 'half', look: up ? [0.3, -1] : [0.6, 0.1],
  };
}

// Thunder: puffed up and arched, tail a bottle brush, ears flat (Swift adds the hop)
function startle(i, n) {
  const k = [0.2, 1, 1, 1, 0.95, 0.9, 0.8, 0.4][Math.min(i, 7)];
  const jit = i >= 2 && i <= 5 ? (i % 2 ? 1.2 : -1.2) : 0;
  const by = 118 - 18 * k;
  return {
    body: { x: 96 + jit, y: by, rx: 36 + 3 * k, ry: 22 + 5 * k, shape: 'bean', a: -0.05 * k },
    head: { x: 140 + jit, y: 96 - 6 * k, r: 30 + k, a: 0.12 * k },
    ears: 1 - 2 * k,
    legs: [
      { hip: [80, by + 10], foot: [70, GROUND], far: true },
      { hip: [114, by + 10], foot: [124, GROUND], far: true },
      { hip: [84, by + 12], foot: [76, GROUND] },
      { hip: [118, by + 12], foot: [130, GROUND] },
    ],
    tail: [[64, by - 2], [56 - 4 * k, by - 18], [58 - 4 * k, by - 40 * k - 4], [64, by - 54 * k - 8]],
    tailW: [7.5 + 4 * k, 6 + 4 * k],
    eyes: k > 0.5 ? 'wide' : 'open', mouth: k > 0.5 ? 'open' : undefined, look: [0.3, -0.2],
    extra: (ctx) => {
      if (k < 0.85) return;
      // shock marks round the body
      inkStrokes(ctx, [[[46, 74], [38, 66]], [[58, 62], [54, 50]], [[150, 50], [156, 40]], [[166, 60], [176, 54]], [[40, 100], [30, 100]]], 2, 0.9);
    },
  };
}

// Music: eyes shut, head bobbing side to side, notes drifting up
function bob(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    eyes: 'happy', tilt: -0.05 + 0.13 * sin(ph), hx: 3 * sin(ph), hy: -2.5 * abs(sin(ph)), dy: -0.8 * abs(sin(ph)), tip: 7 * sin(ph),
    breathe: sin(ph * 2),
    extra: (ctx) => {
      for (let k = 0; k < 2; k++) {
        const t = ((i / n) + k * 0.5) % 1;
        note(ctx, 152 + k * 16 + 6 * sin(t * TAU), 54 - t * 38, 7, sin(t * Math.PI));
      }
    },
  });
}

// Battery low: flat on the floor, chin down, sighing; an empty battery over the head
function flop(i, n) {
  const ph = (i / n) * TAU;
  const br = sin(ph);
  return {
    body: { x: 94, y: 135 - br * 0.5, rx: 50, ry: 14 * (1 + br * 0.05), shape: 'loaf' },
    head: { x: 146, y: 128, r: 26, a: 0.32 },
    ears: -0.6,
    legs: [
      { hip: [116, 140], foot: [150, 147], r0: 6.5, r1: 6 },
      { hip: [70, 140], foot: [44, 147], r0: 6.5, r1: 6, far: true },
    ],
    tail: [[48, 138], [34, 146], [20, 148], [10, 146]],
    tailW: [6.5, 5],
    eyes: i === 5 ? 'closed' : 'half', look: [0.3, 0.6],
    extra: (ctx) => {
      // a little sigh puff on the out-breath
      const t = ((i / n) + 0.25) % 1;
      if (t < 0.5) {
        ctx.save(); ctx.globalAlpha = 1 - t * 2; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.4; ctx.fillStyle = '#F4EFE6';
        ctx.beginPath(); ctx.arc(178 + t * 14, 132 - t * 10, 4 + t * 6, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      // battery: outline, cap, one red sliver that blinks
      ctx.save(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.fillStyle = '#F4EFE6'; ctx.beginPath(); ctx.rect(136, 76, 26, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.fillRect(162, 80, 3, 5);
      if (i % 4 < 2) { ctx.fillStyle = '#D24A3A'; ctx.fillRect(139, 79, 5, 7); }
      ctx.restore();
    },
  };
}

// The Mac runs hot: tongue out, panting, heat rising, a drop of sweat
function hot(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    mouth: 'tongue', eyes: 'half', ears: 0.45, breathe: 2.5 * sin(ph * 2), dy: 0.8 * sin(ph * 2), tilt: -0.02, look: [0.4, 0.3],
    extra: (ctx) => {
      for (let k = 0; k < 3; k++) {
        const x = 96 + k * 14, t = ((i / n) + k / 3) % 1;
        const pts = Array.from({ length: 6 }, (_, j) => [x + 3 * sin(j * 1.6 + t * TAU), 34 - j * 4 - t * 6]);
        inkStrokes(ctx, [pts], 1.4, sin(t * Math.PI) * 0.85);
      }
      drop(ctx, 82, 70 + (i % 4) * 2, 4);
    },
  });
}

// The laser game: low, eyes wide, the rear wiggling before the pounce
function stalk(i, n) {
  const ph = (i / n) * TAU;
  const w = 2.6 * sin(ph * 2);
  return {
    body: { x: 92 + w, y: 131, rx: 40, ry: 17, shape: 'bean', a: 0.14 },
    head: { x: 142, y: 121, r: 29, a: 0.04 },
    ears: 0.85,
    legs: [
      { hip: [78 + w, 132], foot: [74, GROUND], far: true },
      { hip: [112, 136], foot: [130, GROUND], far: true },
      { hip: [82 + w, 134], foot: [84, GROUND] },
      { hip: [116, 138], foot: [142, GROUND] },
    ],
    tail: [[58 + w, 124], [42 + w, 128], [30, 134 + 2 * sin(ph * 3)], [20, 128 + 4 * sin(ph * 3)]],
    eyes: 'wide', look: [1, 0.15],
  };
}

// Petted too long: a quick nip, then off he goes
function bite(i, n) {
  const lunge = i === 1 || i === 2 || i === 3;
  return sit({
    hx: lunge ? 9 : 2, hy: lunge ? 7 : 0, tilt: lunge ? 0.3 : 0.04, ears: lunge ? -0.5 : 0.3,
    eyes: lunge ? 'squint' : 'half', mouth: i === 1 || i === 3 ? 'open' : undefined, tip: lunge ? -8 : 6,
    extra: (ctx) => {
      if (i < 2) return;
      // a vein mark: annoyed
      inkStrokes(ctx, [[[148, 44], [154, 38]], [[156, 46], [162, 40]], [[150, 52], [156, 46]], [[146, 40], [152, 46]]], 2, 0.9);
    },
  });
}

// Mealtime: by an empty bowl, looking up at you
function beg(i, n) {
  const ph = (i / n) * TAU;
  const ask = i === 3 || i === 4 || i === 9;
  return sit({
    tilt: -0.2 + 0.04 * sin(ph), hx: -4, hy: -1, look: [0.2, -0.8], mouth: ask ? 'open' : undefined, tip: 6 * sin(ph),
    breathe: sin(ph), ears: 1,
    extra: (ctx) => bowl(ctx, false),
  });
}

// Eating from the bowl: head down, crunching
function eat(i, n) {
  const ph = (i / n) * TAU;
  const c = abs(sin(ph * 2));
  return {
    body: { x: 100, y: 124, rx: 36, ry: 22, shape: 'bean', a: -0.1 },
    head: { x: 146, y: 118 + c * 3, r: 29, a: 0.42 },
    ears: 0.8,
    legs: [
      { hip: [82, 132], foot: [76, GROUND], far: true },
      { hip: [114, 132], foot: [124, GROUND], far: true },
      { hip: [86, 134], foot: [86, GROUND] },
      { hip: [118, 134], foot: [134, GROUND] },
    ],
    tail: [[66, 120], [50, 112], [44, 98 + 3 * sin(ph)], [50, 88 + 3 * sin(ph)]],
    eyes: 'happy',
    extra: (ctx) => {
      bowl(ctx, true);
      if (c > 0.7) inkStrokes(ctx, [[[186, 120], [192, 116]], [[188, 128], [195, 128]]], 1.5, 0.8);
    },
  };
}

// Grooming: head down and forward, licking (the other cat stands just ahead)
function groom(i, n) {
  const ph = (i / n) * TAU;
  const lick = sin(ph * 2) > 0;
  return sit({
    hx: 8, hy: 4 + 3 * sin(ph * 2), tilt: 0.28 + 0.06 * sin(ph * 2), eyes: 'closed', ears: 0.8,
    mouth: lick ? 'tongue' : undefined, tip: 5 * sin(ph), breathe: sin(ph),
  });
}

export const ANIMS = {
  walk: { frames: 12, fps: 12, pose: walk, loop: true },
  idle: { frames: 16, fps: 6, pose: idle, loop: true },
  tap: { frames: 6, fps: 12, pose: tap, loop: true },
  purr: { frames: 12, fps: 10, pose: purr, loop: true },
  sleep: { frames: 12, fps: 4, pose: sleep, loop: true },
  dangle: { frames: 8, fps: 8, pose: dangle, loop: true },
  stretch: { frames: 10, fps: 9, pose: stretch, loop: false },
  leap: { frames: 6, fps: 14, pose: leap, loop: false },
  swipe: { frames: 6, fps: 12, pose: swipe, loop: false },
  watch: { frames: 12, fps: 6, pose: watch, loop: true },
  meow: { frames: 8, fps: 8, pose: meow, loop: true },
  loaf: { frames: 12, fps: 4, pose: loaf, loop: true },
  startle: { frames: 8, fps: 12, pose: startle, loop: false },
  bob: { frames: 8, fps: 8, pose: bob, loop: true },
  flop: { frames: 8, fps: 3, pose: flop, loop: true },
  hot: { frames: 8, fps: 6, pose: hot, loop: true },
  stalk: { frames: 8, fps: 10, pose: stalk, loop: true },
  bite: { frames: 6, fps: 12, pose: bite, loop: false },
  beg: { frames: 12, fps: 6, pose: beg, loop: true },
  eat: { frames: 12, fps: 8, pose: eat, loop: true },
  groom: { frames: 12, fps: 8, pose: groom, loop: true },
};
export const CELL = { w: 200, h: 160, groundY: 150 };
