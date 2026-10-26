// Maestro's animations. Cell 200 × 160 (CSS px), facing right, ground at y = 150.
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

// Focus mode: a run-up, a leap onto the Chrome tab, a perch with a warning, and the swipe.
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

function bang(ctx, x, y, a) {
  // an inked "!" with a mustard burst behind it
  ctx.save();
  ctx.translate(x, y); ctx.rotate(0.12);
  ctx.globalAlpha = a;
  ctx.fillStyle = '#E6B54A';
  ctx.beginPath();
  for (let k = 0; k < 16; k++) { const r = k % 2 ? 7 : 12, t = (k / 16) * Math.PI * 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r * 1.15); }
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.ink; ctx.stroke();
  ctx.fillStyle = COL.ink;
  ctx.font = '800 17px "Shantell Sans"';
  ctx.textAlign = 'center';
  ctx.fillText('!', 0, 6);
  ctx.restore();
}

function perch(i, n) {
  const ph = (i / n) * TAU;
  return sit({
    dy: 1, tilt: 0.1 + 0.03 * sin(ph), hx: 3, look: [0.25, 0.75], ears: 1, breathe: sin(ph),
    tip: 9 * sin(ph * 2), eyes: i === 7 ? 'closed' : 'open',
    extra: (ctx) => bang(ctx, 160, 34 + 2 * sin(ph * 2), 1),
  });
}

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

export const ANIMS = {
  walk: { frames: 12, fps: 12, pose: walk, loop: true },
  idle: { frames: 16, fps: 6, pose: idle, loop: true },
  tap: { frames: 6, fps: 12, pose: tap, loop: true },
  purr: { frames: 12, fps: 10, pose: purr, loop: true },
  sleep: { frames: 12, fps: 4, pose: sleep, loop: true },
  dangle: { frames: 8, fps: 8, pose: dangle, loop: true },
  stretch: { frames: 10, fps: 9, pose: stretch, loop: false },
  leap: { frames: 6, fps: 12, pose: leap, loop: false },
  perch: { frames: 12, fps: 6, pose: perch, loop: true },
  swipe: { frames: 6, fps: 12, pose: swipe, loop: false },
};
export const CELL = { w: 200, h: 160, groundY: 150 };
