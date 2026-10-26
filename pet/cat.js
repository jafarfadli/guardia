// si Oren: an orange tabby drawn in the room's ink style (side view, facing right).
// Everything is built from a pose: a few points and angles per frame, so animation is
// just a list of poses. Drawing order: far legs, tail, body, near legs, head, ink.
import { catmull, stroke, setInk } from '../wallpaper/src/ink.js';
import { noise1 } from '../wallpaper/src/math.js';

export const COL = {
  fur: '#D9883F', furLit: '#EBA65E', furShade: '#B0612C', furDeep: '#8F4C24',
  stripe: '#9E5426', cream: '#F0DDB8', creamShade: '#D3B98E',
  pink: '#D98C80', eye: '#B8B04A', pupil: '#2B1C14', ink: '#2B1C14', white: '#FBF3E2',
};

const lerp = (a, b, t) => a + (b - a) * t;
const P = (x, y) => [x, y];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];

function fillPath(ctx, pts, col, closed = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}
const inkLine = (ctx, pts, w, o = {}) => stroke(ctx, pts, { w, taper: o.taper ?? 0.6, seed: o.seed ?? 3, wobble: 0.35, breathe: 0.25, alpha: o.alpha ?? 1 });
const inkLoop = (ctx, pts, w, seed = 5) => stroke(ctx, [...pts, pts[0], pts[1]], { w, taper: 0, seed, wobble: 0.35, breathe: 0.28 });

// A two-segment limb from `hip`: thigh angle a1, shin angle a2 (radians, 0 = straight down).
function limb(hip, a1, a2, l1, l2, w0, w1, w2) {
  const down = (a, l) => [Math.sin(a) * l, Math.cos(a) * l];
  const knee = add(hip, down(a1, l1));
  const foot = add(knee, down(a2, l2));
  const side = (a, w) => [Math.cos(a) * w, -Math.sin(a) * w];
  const pts = [
    add(hip, side(a1, -w0)), add(knee, side((a1 + a2) / 2, -w1)), add(foot, side(a2, -w2)),
    add(foot, side(a2, w2)), add(knee, side((a1 + a2) / 2, w1)), add(hip, side(a1, w0)),
  ];
  return { pts, knee, foot };
}

function paw(ctx, foot, dir, s, col, inkW) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push([foot[0] + Math.cos(a) * s * 1.25 + dir * s * 0.4, foot[1] + Math.sin(a) * s * 0.75]);
  }
  pts.push([foot[0] + s * 1.25 + dir * s * 0.4, foot[1] + s * 0.1], [foot[0] - s * 1.25 + dir * s * 0.4, foot[1] + s * 0.1]);
  fillPath(ctx, pts, col);
  inkLine(ctx, pts.slice(0, 13), inkW, { taper: 0.3 });
  inkLine(ctx, [[foot[0] - s * 1.2 + dir * s * 0.4, foot[1] + s * 0.1], [foot[0] + s * 1.2 + dir * s * 0.4, foot[1] + s * 0.1]], inkW * 0.9, { taper: 0.2 });
  // toe beans as two tiny ink ticks
  for (const k of [-0.35, 0.3]) inkLine(ctx, [[foot[0] + dir * s * 0.4 + k * s, foot[1] - s * 0.15], [foot[0] + dir * s * 0.4 + k * s, foot[1] + s * 0.05]], inkW * 0.5, { taper: 0.5 });
}

function drawLimb(ctx, L, col, shadeCol, inkW, dir = 1) {
  fillPath(ctx, L.limb.pts, col);
  // cel terminator: back half of the leg a step darker
  fillPath(ctx, [L.limb.pts[3], L.limb.pts[4], L.limb.pts[5], L.hipC ?? L.limb.pts[5]], shadeCol);
  inkLine(ctx, [L.limb.pts[0], L.limb.pts[1], L.limb.pts[2]], inkW, { taper: 0.4 });
  inkLine(ctx, [L.limb.pts[3], L.limb.pts[4], L.limb.pts[5]], inkW, { taper: 0.4 });
  paw(ctx, L.limb.foot, dir, L.paw, COL.cream, inkW);
}

// ------------------------------------------------------------------ the whole cat
// pose: { body:{x,y,len,h,tilt}, head:{x,y,r,tilt}, legs:{fl,fr,bl,br:[a1,a2]}, tail:[[x,y]...],
//         eyes:'open'|'closed'|'happy'|'half', blink, mouth:'neutral'|'open'|'smile', ears, breathe }
export function drawCat(ctx, pose, scale = 1) {
  setInk(COL.ink, scale);
  const W = 1.6 * scale; // base ink weight
  const b = pose.body, h = pose.head;
  const breathe = pose.breathe ?? 0;
  const bh = b.h * (1 + breathe * 0.05);

  const legL1 = pose.legLen?.[0] ?? 22, legL2 = pose.legLen?.[1] ?? 22;
  const mk = (hip, a, w0, pawS) => ({ limb: limb(hip, a[0], a[1], legL1, legL2, w0, w0 * 0.62, w0 * 0.45), paw: pawS });
  const front = add([b.x, b.y], rot([b.len * 0.32, bh * 0.18], b.tilt));
  const back = add([b.x, b.y], rot([-b.len * 0.3, bh * 0.15], b.tilt));
  const legs = pose.legs;

  // far legs first, a step darker
  if (legs) {
    if (legs.br) drawLimb(ctx, mk(add(back, [-4, -2]), legs.br, 9, 6), COL.furShade, COL.furDeep, W * 0.9);
    if (legs.fr) drawLimb(ctx, mk(add(front, [-3, -2]), legs.fr, 7, 5.5), COL.furShade, COL.furDeep, W * 0.9);
  }

  drawTail(ctx, pose.tail, W);
  drawBody(ctx, b, bh, W, pose);

  if (legs) {
    if (legs.bl) drawLimb(ctx, mk(back, legs.bl, 10, 6.5), COL.fur, COL.furShade, W);
    if (legs.fl) drawLimb(ctx, mk(front, legs.fl, 7.5, 6), COL.fur, COL.furShade, W);
  }
  if (pose.frontPaws) for (const fp of pose.frontPaws) frontPaw(ctx, fp, W);
  drawHead(ctx, h, W, pose);
  if (pose.extra) pose.extra(ctx, W);
}

function bodyOutline(b, bh) {
  const c = [b.x, b.y], L = b.len, H = bh;
  const shape = b.shape ?? 'walk';
  let rel;
  if (shape === 'sit') {
    rel = [[0.2, -0.95], [0.38, -0.5], [0.4, 0.1], [0.42, 0.62], [0.2, 0.8], [-0.3, 0.82], [-0.55, 0.55], [-0.5, 0.0], [-0.2, -0.55]];
  } else if (shape === 'loaf') {
    rel = [[0.42, -0.25], [0.5, 0.25], [0.35, 0.55], [-0.1, 0.6], [-0.45, 0.55], [-0.55, 0.15], [-0.4, -0.35], [-0.05, -0.55], [0.25, -0.5]];
  } else {
    rel = [[0.5, -0.05], [0.42, 0.42], [0.1, 0.52], [-0.25, 0.46], [-0.48, 0.25], [-0.52, -0.15], [-0.32, -0.46], [0.0, -0.44], [0.3, -0.5]];
  }
  return catmull(rel.map(([x, y]) => add(c, rot([x * L, y * H], b.tilt))), true, 6);
}

function drawBody(ctx, b, bh, W, pose) {
  const out = bodyOutline(b, bh);
  fillPath(ctx, out, COL.fur);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(out[0][0], out[0][1]); for (const p of out) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.clip();
  const c = [b.x, b.y];
  // belly in cream, lower band in shade (hard step), a lit sliver along the back
  const shape = b.shape ?? 'walk';
  if (shape === 'sit') {
    fillPath(ctx, [add(c, [b.len * 0.05, -bh * 0.7]), add(c, [b.len * 0.5, -bh * 0.4]), add(c, [b.len * 0.5, bh]), add(c, [b.len * 0.1, bh])], COL.cream);
    fillPath(ctx, [add(c, [-b.len, bh * 0.25]), add(c, [b.len * 0.05, bh * 0.45]), add(c, [b.len, bh * 0.55]), add(c, [b.len, bh * 2]), add(c, [-b.len, bh * 2])], COL.furShade);
    fillPath(ctx, [add(c, [-b.len, -bh * 2]), add(c, [b.len, -bh * 2]), add(c, [b.len * 0.2, -bh * 0.82]), add(c, [-b.len * 0.35, -bh * 0.35]), add(c, [-b.len, -bh * 0.1])], COL.furLit);
  } else {
    const belly = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; belly.push(add(c, rot([lerp(-0.4, 0.48, t) * b.len, (0.28 + 0.06 * Math.sin(t * Math.PI)) * bh], b.tilt))); }
    belly.push(add(c, rot([0.6 * b.len, bh * 1.5], b.tilt)), add(c, rot([-0.6 * b.len, bh * 1.5], b.tilt)));
    fillPath(ctx, belly, COL.furShade);
    const bel2 = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; bel2.push(add(c, rot([lerp(-0.1, 0.5, t) * b.len, (0.4 - 0.15 * t) * bh], b.tilt))); }
    bel2.push(add(c, rot([0.6 * b.len, bh * 1.5], b.tilt)), add(c, rot([-0.1 * b.len, bh * 1.5], b.tilt)));
    fillPath(ctx, bel2, COL.creamShade);
    const lit = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; lit.push(add(c, rot([lerp(-0.45, 0.35, t) * b.len, (-0.34 - 0.06 * Math.sin(t * Math.PI)) * bh], b.tilt))); }
    lit.push(add(c, rot([0.4 * b.len, -bh * 1.5], b.tilt)), add(c, rot([-0.5 * b.len, -bh * 1.5], b.tilt)));
    fillPath(ctx, lit, COL.furLit);
  }
  // tabby stripes across the back: tapered darker bands with an ink edge
  const n = shape === 'sit' ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = shape === 'sit' ? lerp(-0.45, 0.1, t) : lerp(-0.42, 0.3, t);
    const top = add(c, rot([x * b.len, -bh * 0.75], b.tilt));
    const mid = add(c, rot([(x - 0.04) * b.len, -bh * 0.15], b.tilt));
    const tip = add(c, rot([(x - 0.07) * b.len, bh * 0.15], b.tilt));
    const w = b.len * 0.035;
    fillPath(ctx, [add(top, [-w, 0]), add(mid, [-w * 0.8, 0]), tip, add(mid, [w * 0.6, 0]), add(top, [w, 0])], COL.stripe);
  }
  ctx.restore();
  inkLoop(ctx, out, W * 1.15, 11);
}

function drawTail(ctx, pts, W) {
  if (!pts) return;
  const spine = catmull(pts, false, 8);
  const L = [], R = [];
  for (let i = 0; i < spine.length; i++) {
    const a = spine[Math.max(0, i - 1)], c = spine[Math.min(spine.length - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = i / (spine.length - 1);
    const w = lerp(6.5, 4.5, t) * (t > 0.92 ? Math.sqrt((1 - t) / 0.08) * 0.8 + 0.2 : 1);
    L.push([spine[i][0] - ty * w, spine[i][1] + tx * w]);
    R.push([spine[i][0] + ty * w, spine[i][1] - tx * w]);
  }
  const shape = [...L, ...R.reverse()];
  fillPath(ctx, shape, COL.fur);
  // rings
  ctx.save();
  fillPath(ctx, shape, 'rgba(0,0,0,0)');
  ctx.clip();
  for (let k = 1; k <= 5; k++) {
    const i = Math.floor((k / 6) * (spine.length - 1));
    const p = spine[i], q = spine[Math.min(spine.length - 1, i + 2)];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
    const d = polar(a, 9);
    fillPath(ctx, [add(p, d), add(q, d), add(q, [-d[0], -d[1]]), add(p, [-d[0], -d[1]])], k === 5 ? COL.furDeep : COL.stripe);
  }
  ctx.restore();
  inkLoop(ctx, shape, W, 21);
}

function frontPaw(ctx, fp, W) {
  // a front leg seen reaching forward (for tapping / kneading)
  const L = limb(fp.from, fp.a1, fp.a2, fp.l1 ?? 16, fp.l2 ?? 14, 6.5, 4.8, 4);
  fillPath(ctx, L.pts, fp.far ? COL.furShade : COL.fur);
  inkLine(ctx, [L.pts[0], L.pts[1], L.pts[2]], W, { taper: 0.4 });
  inkLine(ctx, [L.pts[3], L.pts[4], L.pts[5]], W, { taper: 0.4 });
  paw(ctx, L.foot, 1, 5.5, COL.cream, W);
}

function drawHead(ctx, h, W, pose) {
  const c = [h.x, h.y], r = h.r, t = h.tilt ?? 0;
  const R = (x, y) => add(c, rot([x * r, y * r], t));
  // ears (behind the head shape)
  const ear = (side) => {
    const base0 = R(side < 0 ? -0.62 : 0.05, -0.55), base1 = R(side < 0 ? -0.12 : 0.6, -0.78);
    const tipOff = pose.ears === 'back' ? [side < 0 ? -0.75 : 0.35, -1.05] : [side < 0 ? -0.55 : 0.42, -1.38];
    const tip = R(tipOff[0], tipOff[1]);
    return { outer: [base0, tip, base1], inner: [add(base0, rot([0.15 * r, -0.05 * r], t)), add(tip, rot([0.02 * r, 0.25 * r], t)), add(base1, rot([-0.12 * r, 0.02 * r], t))] };
  };
  const eFar = ear(-1), eNear = ear(1);
  fillPath(ctx, eFar.outer, COL.furShade); fillPath(ctx, eFar.inner, COL.pink);
  inkLoop(ctx, eFar.outer, W * 0.95, 31);
  // head: round skull, wider cheeks
  const rel = [[0.0, -0.82], [0.55, -0.68], [0.9, -0.2], [0.98, 0.25], [0.72, 0.62], [0.2, 0.8], [-0.35, 0.72], [-0.82, 0.38], [-0.9, -0.15], [-0.6, -0.65]];
  const out = catmull(rel.map(([x, y]) => R(x, y)), true, 6);
  fillPath(ctx, out, COL.fur);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(out[0][0], out[0][1]); for (const p of out) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.clip();
  fillPath(ctx, [R(-1.2, 0.3), R(-0.3, 0.42), R(0.3, 0.75), R(0.2, 1.4), R(-1.2, 1.4)], COL.furShade); // jaw in shade
  fillPath(ctx, [R(0.2, 0.05), R(1.2, 0.0), R(1.2, 1.2), R(0.35, 1.2), R(0.15, 0.5)], COL.cream); // muzzle
  fillPath(ctx, [R(-1.2, -1.2), R(0.8, -1.2), R(0.2, -0.62), R(-0.5, -0.5), R(-1.2, -0.2)], COL.furLit); // lit crown
  // forehead "M" and cheek stripes
  for (const x of [-0.25, 0.0, 0.25]) fillPath(ctx, [R(x - 0.06, -0.85), R(x + 0.06, -0.85), R(x + 0.02, -0.42), R(x - 0.02, -0.42)], COL.stripe);
  for (const y of [0.05, 0.25]) fillPath(ctx, [R(-0.95, y - 0.05), R(-0.45, y), R(-0.95, y + 0.07)], COL.stripe);
  ctx.restore();
  fillPath(ctx, eNear.outer, COL.fur); fillPath(ctx, eNear.inner, COL.pink);
  inkLoop(ctx, eNear.outer, W, 33);
  inkLoop(ctx, out, W * 1.15, 35);

  // eye
  const eye = R(0.42, -0.12);
  const es = r * 0.17;
  const mode = pose.eyes ?? 'open';
  if (mode === 'open' || mode === 'half') {
    const lidT = mode === 'half' ? 0.45 : 0;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(eye[0], eye[1], es * 0.85, es * 1.05, t, 0, Math.PI * 2);
    ctx.fillStyle = COL.eye; ctx.fill();
    ctx.beginPath(); ctx.ellipse(eye[0] + es * 0.15, eye[1], es * 0.3, es * 0.85 * (pose.pupil ?? 1), t, 0, Math.PI * 2);
    ctx.fillStyle = COL.pupil; ctx.fill();
    ctx.beginPath(); ctx.arc(eye[0] + es * 0.35, eye[1] - es * 0.45, es * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = COL.white; ctx.fill();
    if (lidT > 0) { ctx.beginPath(); ctx.ellipse(eye[0], eye[1], es * 1.0, es * 1.15, t, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = COL.fur; ctx.fillRect(eye[0] - es * 2, eye[1] - es * 2, es * 4, es * 2 * lidT * 1.4); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(eye[0], eye[1], es * 0.85, es * 1.05, t, 0, Math.PI * 2);
    ctx.lineWidth = W * 0.9; ctx.strokeStyle = COL.ink; ctx.stroke();
    if (lidT > 0) inkLine(ctx, [add(eye, [-es, -es * 0.3]), add(eye, [es, -es * 0.35])], W, { taper: 0.3 });
  } else if (mode === 'happy') {
    inkLine(ctx, [add(eye, [-es, es * 0.3]), add(eye, [0, -es * 0.6]), add(eye, [es, es * 0.3])], W * 1.2, { taper: 0.5 });
  } else {
    inkLine(ctx, [add(eye, [-es, -es * 0.1]), add(eye, [0, es * 0.45]), add(eye, [es, -es * 0.1])], W * 1.1, { taper: 0.5 });
  }
  // nose, mouth, whiskers
  const nose = R(0.92, 0.18);
  fillPath(ctx, [add(nose, [-r * 0.1, -r * 0.05]), add(nose, [r * 0.04, -r * 0.08]), add(nose, [0, r * 0.06])], COL.pink);
  inkLine(ctx, [add(nose, [-r * 0.1, -r * 0.05]), add(nose, [r * 0.04, -r * 0.08]), add(nose, [0, r * 0.06]), add(nose, [-r * 0.1, -r * 0.05])], W * 0.7, { taper: 0 });
  if (pose.mouth === 'open') {
    const m = R(0.72, 0.42);
    fillPath(ctx, [add(m, [-r * 0.12, -r * 0.06]), add(m, [r * 0.14, -r * 0.08]), add(m, [0, r * 0.14])], '#7E3B2B');
    inkLine(ctx, [add(m, [-r * 0.12, -r * 0.06]), add(m, [0, r * 0.14]), add(m, [r * 0.14, -r * 0.08])], W * 0.8, { taper: 0.2 });
  } else {
    inkLine(ctx, [add(nose, [0, r * 0.06]), R(0.86, 0.38), R(0.7, 0.44)], W * 0.75, { taper: 0.6 });
    inkLine(ctx, [R(0.86, 0.38), R(0.98, 0.45)], W * 0.65, { taper: 0.6 });
  }
  for (const [dy, len] of [[-0.02, 0.85], [0.1, 0.8], [0.2, 0.65]]) {
    inkLine(ctx, [R(0.8, 0.28 + dy), R(0.8 + len, 0.2 + dy * 2.4)], W * 0.4, { taper: 1, alpha: 0.8 });
  }
}
