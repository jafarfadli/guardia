// Animation poses for si Oren. Cell: 200 × 160 (CSS px), facing right, ground at y = 150.
import { COL } from './cat.js';

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos;

function walk(i, n) {
  const ph = (i / n) * TAU;
  const leg = (off, hind) => {
    const s = sin(ph + off);
    const lift = Math.max(0, cos(ph + off)) * 0.55; // knee folds while the paw swings forward
    if (hind) return [0.18 + 0.42 * s, 0.18 + 0.42 * s - 0.55 - lift * 0.4];
    return [0.4 * s, 0.4 * s - lift * 0.9];
  };
  return {
    body: { x: 98, y: 102 + 1.6 * sin(2 * ph), len: 92, h: 42, tilt: 0.025 * sin(ph), shape: 'walk' },
    head: { x: 153, y: 80 + 1.8 * sin(2 * ph + 0.6), r: 24, tilt: -0.04 + 0.03 * sin(ph) },
    legs: { bl: leg(0, true), fl: leg(Math.PI / 2, false), br: leg(Math.PI, true), fr: leg(Math.PI * 1.5, false) },
    legLen: [22, 22],
    tail: [[54, 96], [38, 84 + 2 * sin(ph)], [30 + 3 * sin(ph + 1), 64], [38 + 6 * sin(ph + 1.6), 46]],
    eyes: 'open',
  };
}

function sitBase(o = {}) {
  return {
    body: { x: 96, y: 112 + (o.dy ?? 0), len: 64, h: 48 * (1 + (o.breathe ?? 0) * 0.03), tilt: 0, shape: 'sit' },
    head: { x: 114 + (o.hx ?? 0), y: 60 + (o.dy ?? 0) + (o.hy ?? 0), r: 24, tilt: o.tilt ?? -0.06 },
    legs: o.noFront ? null : { fl: [0.02, -0.02], fr: [-0.03, -0.04] },
    legLen: [15, 16],
    tail: o.tail ?? [[62, 140], [44, 146], [52, 153], [88, 153], [120, 150], [134, 143 + (o.tip ?? 0)]],
    eyes: o.eyes ?? 'open',
    mouth: o.mouth,
    ears: o.ears,
    frontPaws: o.frontPaws,
    extra: (ctx, W) => {
      // folded hind paw peeking out at the front of the haunch
      hindPaw(ctx, 74, 149, W);
      o.extra?.(ctx, W);
    },
  };
}

function hindPaw(ctx, x, y, W) {
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 11, 5, 0, Math.PI, 0);
  ctx.lineTo(x + 11, y); ctx.lineTo(x - 11, y); ctx.closePath();
  ctx.fillStyle = COL.cream; ctx.fill();
  ctx.lineWidth = W; ctx.strokeStyle = COL.ink; ctx.stroke();
}

function idle(i, n) {
  const ph = (i / n) * TAU;
  return sitBase({ tip: -4 * sin(ph), tilt: -0.06 + 0.04 * sin(ph * 0.5), eyes: i === 3 ? 'closed' : 'open', breathe: sin(ph) });
}

function tap(i) {
  // bongo taps: one front paw up, the other down, alternating
  const up = i % 2 === 0;
  const sh = [118, 104];
  return sitBase({
    noFront: true, eyes: 'open', mouth: i % 4 === 1 ? 'open' : undefined, hy: up ? -1 : 1, tip: up ? -6 : 3,
    frontPaws: [
      { from: [sh[0] - 6, sh[1]], a1: up ? -0.05 : 0.55, a2: up ? -0.1 : 1.35, far: true },
      { from: sh, a1: up ? 0.6 : 0.05, a2: up ? 1.45 : 0.0 },
    ],
    extra: (ctx) => {
      // little motion ticks where a paw lands
      const x = up ? 112 : 132;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (const [dx, dy] of [[-8, -2], [0, -6], [8, -2]]) { ctx.beginPath(); ctx.moveTo(x + dx * 0.6, 146 + dy * 0.6); ctx.lineTo(x + dx, 146 + dy); ctx.stroke(); }
    },
  });
}

function purr(i, n) {
  const ph = (i / n) * TAU;
  return sitBase({
    eyes: 'happy', tilt: -0.14 + 0.05 * sin(ph), hx: 2, breathe: sin(ph * 2), tip: -6 * sin(ph),
    extra: (ctx) => {
      for (let k = 0; k < 2; k++) {
        const t = ((i / n) + k * 0.5) % 1;
        heart(ctx, 150 + k * 18 - t * 6, 42 - t * 34, 6 + t * 2, 1 - t * 0.7);
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
  ctx.fillStyle = '#C0533F'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.ink; ctx.stroke();
  ctx.restore();
}

function sleep(i, n) {
  const ph = (i / n) * TAU;
  const br = sin(ph);
  return {
    body: { x: 100, y: 128 - br * 0.8, len: 98, h: 40 * (1 + br * 0.04), tilt: 0, shape: 'loaf' },
    head: { x: 147, y: 121, r: 21, tilt: 0.22, },
    legs: null,
    tail: [[56, 138], [62, 151], [100, 154], [138, 152], [158, 145]],
    eyes: 'closed', ears: 'back',
    extra: (ctx) => {
      ctx.font = '700 15px "Shantell Sans"';
      ctx.fillStyle = COL.ink;
      for (let k = 0; k < 3; k++) {
        const t = ((i / n) + k / 3) % 1;
        ctx.globalAlpha = Math.sin(t * Math.PI);
        ctx.font = `700 ${11 + t * 8}px "Shantell Sans"`;
        ctx.fillText('z', 166 + t * 12 + k * 2, 100 - t * 46);
      }
      ctx.globalAlpha = 1;
    },
  };
}

function dangle(i, n) {
  const ph = (i / n) * TAU;
  const sw = 0.08 * sin(ph);
  return {
    body: { x: 100, y: 92, len: 78, h: 38, tilt: -1.45 + sw, shape: 'walk' },
    head: { x: 108, y: 34, r: 23, tilt: -0.1 + sw * 0.5 },
    legs: { bl: [sw * 2, sw], fl: [0.15 + sw * 2, 0.2], br: [-0.1 + sw, -0.05], fr: [0.05 + sw, 0.1] },
    legLen: [18, 18],
    tail: [[98, 128], [96, 140], [92 + 6 * sin(ph), 152], [96 + 8 * sin(ph + 1), 158]],
    eyes: 'half', ears: 'back',
  };
}

function stretch(i, n) {
  // a long front stretch, butt up (played once after waking)
  const t = Math.sin((i / (n - 1)) * Math.PI);
  return {
    body: { x: 96, y: 112 - t * 6, len: 96 + t * 10, h: 38, tilt: 0.22 * t, shape: 'walk' },
    head: { x: 156 + t * 6, y: 112 - t * 4, r: 23, tilt: 0.1 },
    legs: { bl: [0.1, 0.05], fl: [0.9 * t + 0.1, 1.1 * t], br: [0.05, 0.0], fr: [0.8 * t + 0.1, 1.0 * t] },
    legLen: [22 - t * 4, 22 - t * 4],
    tail: [[52, 100 - t * 10], [38, 80 - t * 14], [34, 60 - t * 12], [42, 44 - t * 8]],
    eyes: t > 0.5 ? 'closed' : 'half', mouth: t > 0.7 ? 'open' : undefined,
  };
}

export const ANIMS = {
  walk: { frames: 8, fps: 10, pose: walk, loop: true },
  idle: { frames: 8, fps: 4, pose: idle, loop: true },
  tap: { frames: 4, fps: 12, pose: tap, loop: true },
  purr: { frames: 8, fps: 8, pose: purr, loop: true },
  sleep: { frames: 8, fps: 3, pose: sleep, loop: true },
  dangle: { frames: 6, fps: 6, pose: dangle, loop: true },
  stretch: { frames: 8, fps: 8, pose: stretch, loop: false },
};
export const CELL = { w: 200, h: 160, groundY: 150 };
