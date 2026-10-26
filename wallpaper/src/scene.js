// Scene assembly: camera, lights, and the draw order (back to front).
import { Camera, Plane, hex, css, cmix, cscale, norm, add, mul, cross, rng } from './math.js';
import { Painter } from './painter.js';
import * as ink from './ink.js';
import { ROOM, WIN, planes, windowPanes, drawOutside, wallAlbedo, fillUV } from './room.js';
import { propOccluders, drawStringLights, drawPendant, drawFloorClutter } from './props.js';
import { decorAlbedo, decorInk, decorExclude } from './decor.js';
import { drawDesk, drawDeskItems, drawChair, drawShelf, LAMP, LAMP_AXIS } from './furniture.js';
import { drawMonstera, drawSillPlants, drawShelfPlant } from './plants.js';
import { rugAlbedo, rugInk, drawCurtains, drawCatBed } from './textiles.js';
import { drawGuitar, drawRecords } from './music.js';

export const VIEWS = {
  // The fixed camera views used to compare the look after every change.
  main: { pos: [3.7, 1.5, -0.6], yaw: -17, fov: 72, horizon: 0.41 },
  wide: { pos: [3.9, 1.45, -0.9], yaw: -12, fov: 80, horizon: 0.44 },
  desk: { pos: [2.6, 1.3, 2.2], yaw: -6, fov: 58, horizon: 0.45 },
  b: { pos: [3.7, 1.36, -0.55], yaw: -17, fov: 74, horizon: 0.40 },
  c: { pos: [3.7, 1.55, -0.6], yaw: -17, fov: 70, horizon: 0.40 },
  d: { pos: [3.8, 1.5, -1.0], yaw: -18, fov: 68, horizon: 0.40 },
};

export function drawScene(ctx, { W, H, dpr, light, tokens, now, view = 'main', scratch, printed, nowPlaying }) {
  const v = VIEWS[view] ?? VIEWS.main;
  const cam = new Camera({ ...v, W, H });
  const pt = new Painter(ctx, { W, H, dpr, cam, light, tokens, scratch });
  pt.now = now; pt.printed = printed;
  pt.panes = windowPanes();

  // Light bands: window fill (afternoon) or the cool light from the other side (morning),
  // plus the desk lamp at night.
  const L = light;
  const { z0, z1, y0, y1, glassX } = WIN;
  const opening = [[glassX, y0 - 0.05, z0 - 0.08], [glassX, y0 - 0.05, z1 + 0.08], [glassX, y1 + 0.06, z1 + 0.08], [glassX, y1 + 0.06, z0 - 0.08]];
  const winFill = { window: true, spill: { source: [-3.2, 3.4, -1.0], aperture: opening }, color: cscale(L.fillCol, L.fill), facing: true, dir: norm([-1, 0.25, -0.12]) };
  // the morning light comes from a window on the right wall, out of frame
  const eastOpening = [[ROOM.w + 0.1, 0.8, 1.7], [ROOM.w + 0.1, 0.8, 3.3], [ROOM.w + 0.1, 2.3, 3.3], [ROOM.w + 0.1, 2.3, 1.7]];
  const coolFill = { window: L.cool >= 0.6, spill: { source: [ROOM.w + 3.1, 3.4, -0.6], aperture: eastOpening }, color: cscale(hex(tokens.light.morning), 0.42 * L.cool), facing: true, dir: norm([1, 0.2, -0.25]) };
  pt.lightBands = [];
  if (L.cool < 0.6) pt.lightBands.push(winFill);
  if (L.cool > 0.05) pt.lightBands.push(coolFill);
  if (L.lamp > 0.02) {
    // the desk lamp: a ~30° cone (the shade's mouth seen from the bulb) and a small warm
    // halo on the wall behind it
    const head = LAMP.head, axis = LAMP_AXIS;
    const mouth = add(head, mul(axis, 0.14));
    const u = norm(cross(axis, [0, 0, 1])), v = norm(cross(axis, u));
    const ring = (r) => Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return add(mouth, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))); });
    const lampCol = hex(tokens.light.lamp);
    pt.lightBands.push({ center: add(head, [0.04, 0.0, 0.12]), radius: 0.48, color: cscale(lampCol, 0.24 * L.lamp), facing: false });
    pt.lightBands.push({ lamp: true, spill: { source: head, aperture: ring(0.075), ring: true }, color: cscale(lampCol, 0.6 * L.lamp), facing: false, shadowIds: ['desk', 'monitor', 'chair'] });
    pt.lightBands.push({ lamp: true, spill: { source: head, aperture: ring(0.045), ring: true }, color: cscale(lampCol, 1.0 * L.lamp), facing: false, shadowIds: ['desk', 'monitor', 'chair'] });
  }
  pt.occluders = propOccluders(pt);

  ctx.fillStyle = css(L.skyTop);
  ctx.fillRect(0, 0, W, H);

  drawOutside(pt, L);
  drawShell(pt);
  drawGuitar(pt);
  drawShelf(pt);
  drawShelfPlant(pt);
  drawMonstera(pt);
  drawDesk(pt);
  drawDeskItems(pt);
  drawFloorClutter(pt);
  drawRecords(pt, nowPlaying);
  drawCurtains(pt);
  drawChair(pt);
  drawCatBed(pt);
  drawPendant(pt);
  return pt;
}

function drawShell(pt) {
  const { ctx } = pt;
  const { w, d, h } = ROOM;
  const { z0, z1, y0, y1 } = WIN;
  const near = -3;

  // ceiling
  pt.surface({
    outline: [[0, h, near], [w, h, near], [w, h, d], [0, h, d]],
    plane: planes.ceiling,
    albedo: (T) => wallAlbedo(pt, planes.ceiling, T, { box: [0, near, w, d], paint: 'ceiling', seed: 5, flecks: 200,
      stains: [{ u: 0.9, v: 4.4, r: 0.34, seed: 3, k: 0.14, drip: 0, sx: 1.5 }] }),
    hatch: { amount: pt.hatchOf('ceiling', 0.3), angle: 1.25, spacing: 0.045, alpha: 0.24, seed: 2, box: [0, near, w, d] },
  });

  // back wall
  pt.surface({
    outline: [[0, 0, d], [w, 0, d], [w, h, d], [0, h, d]],
    plane: planes.back,
    albedo: (T) => wallAlbedo(pt, planes.back, T, {
      box: [0, 0, w, h], paint: 'wall-paint', seed: 17, flecks: 650, yellowTop: 2.38,
      stains: [
        { u: 0.45, v: 2.5, r: 0.32, seed: 7, k: 0.22, drip: 1.4, sx: 1.3 },
        { u: 4.65, v: 2.62, r: 0.22, seed: 12, k: 0.16, drip: 1.0 },
      ],
      ghosts: [{ u0: 0.32, v0: 1.32, u1: 0.84, v1: 2.02, scrap: true }],
      extra: (T) => decorAlbedo(pt, T),
    }),
    hatch: { amount: pt.hatchOf('wall-paint', 1), angle: 1.05, spacing: 0.036, alpha: 0.36, seed: 9, box: [0, 0, w, h], exclude: decorExclude() },
  });
  decorInk(pt);
  drawStringLights(pt);

  // right wall sliver (beyond the shelf)
  pt.surface({
    outline: [[w, 0, d], [w, 0, near], [w, h, near], [w, h, d]],
    plane: planes.right,
    albedo: (T) => wallAlbedo(pt, planes.right, T, { box: [0, -d, h, -near], paint: 'wall-paint', seed: 23, flecks: 240 }),
    hatch: { amount: 0.8, angle: -1.0, seed: 4, box: [0, -d, h, 3] },
  });

  // left (window) wall, in four pieces around the opening
  const leftParts = [
    [[0, 0, near], [0, 0, d], [0, y0, d], [0, y0, near]],
    [[0, y1, near], [0, y1, d], [0, h, d], [0, h, near]],
    [[0, y0, near], [0, y0, z0], [0, y1, z0], [0, y1, near]],
    [[0, y0, z1], [0, y0, d], [0, y1, d], [0, y1, z1]],
  ];
  for (const outline of leftParts) {
    pt.surface({
      outline, plane: planes.left,
      albedo: (T) => wallAlbedo(pt, planes.left, T, { box: [0, near, h, d], paint: 'wall-paint', seed: 31, flecks: 360, yellowTop: 2.38,
        stains: [{ u: 0.55, v: 3.6, r: 0.18, seed: 21, k: 0.2, drip: 0.6 }] }),
      hatch: { amount: 1.0, angle: 0.75, spacing: 0.036, alpha: 0.36, seed: 13, box: [0, near, h, d] },
    });
  }

  drawWindowReveal(pt);
  drawSillPlants(pt);

  // floor
  pt.surface({
    outline: [[0, 0, near], [w, 0, near], [w, 0, d], [0, 0, d]],
    plane: planes.floor,
    albedo: (T) => { floorAlbedo(pt, T); rugAlbedo(pt, T); },
    hatch: { amount: pt.hatchOf('floor-vinyl', 0.22), angle: 0.0, spacing: 0.05, alpha: 0.22, dash: 0.25, gap: 0.3, seed: 3, box: [near, 0, d, w] },
  });
  floorInk(pt);
  rugInk(pt);

  // skirting boards along the back and left walls
  pt.box([0.0, w, 0, 0.1, d - 0.018, d], { mat: 'trim', inkBase: 1.4, seed: 4 });
  pt.box([0, 0.018, 0, 0.1, near, d - 0.018], { mat: 'trim', inkBase: 1.4, seed: 6 });

  // picture rail / cornice in cherry where the walls meet the ceiling
  pt.box([0.0, w, h - 0.07, h, d - 0.03, d], { mat: 'trim', inkBase: 1.3, seed: 41 });
  pt.box([0, 0.03, h - 0.07, h, near, d - 0.03], { mat: 'trim', inkBase: 1.3, seed: 42 });

  // room edges inked
  pt.inkLine3([[0, 0, d], [0, h, d]], { base: 2.2, seed: 2 });
  pt.inkLine3([[0, h, d], [w, h, d]], { base: 1.9, seed: 3 });
  pt.inkLine3([[w, 0, d], [w, h, d]], { base: 1.8, seed: 4 });
  pt.inkLine3([[0, h, near], [0, h, d]], { base: 2.0, seed: 5 });
}

function drawWindowReveal(pt) {
  const { z0, z1, y0, y1, glassX, transom, frame: f } = WIN;
  const T = ROOM.wallT;
  // soffit (top of the opening), far jamb, sill
  pt.surface({
    outline: [[-T, y1, z0], [0, y1, z0], [0, y1, z1], [-T, y1, z1]], plane: new Plane([0, y1, 0], [1, 0, 0], [0, 0, 1]), N: [0, -1, 0],
    albedo: (Tn) => ink.fill(pt.ctx, pt.P([[-T, y1, z0], [0, y1, z0], [0, y1, z1], [-T, y1, z1]]), Tn('wall-paint')),
    hatch: { amount: 0.7, angle: 0.4, seed: 8 },
  });
  const jamb = new Plane([0, 0, z1], [1, 0, 0], [0, 1, 0]); jamb.n = [0, 0, -1];
  pt.surface({
    outline: [[-T, y0, z1], [0, y0, z1], [0, y1, z1], [-T, y1, z1]], plane: jamb, N: [0, 0, -1],
    albedo: (Tn) => ink.fill(pt.ctx, pt.P([[-T, y0, z1], [0, y0, z1], [0, y1, z1], [-T, y1, z1]]), Tn('wall-paint')),
  });
  // window frame (painted wood) and glazing bars
  const zm = (z0 + z1) / 2;
  const fx0 = glassX - 0.03, fx1 = glassX + 0.03;
  const mat = 'window-frame';
  pt.box([fx0, fx1, y0, y1, z0, z0 + f], { mat, inkBase: 1.3, seed: 11 });
  pt.box([fx0, fx1, y0, y1, z1 - f, z1], { mat, inkBase: 1.3, seed: 12 });
  pt.box([fx0, fx1, y1 - f, y1, z0, z1], { mat, inkBase: 1.3, seed: 13 });
  pt.box([fx0, fx1, y0, y0 + f, z0, z1], { mat, inkBase: 1.3, seed: 14 });
  pt.box([fx0, fx1, y0, y1, zm - f / 2, zm + f / 2], { mat, inkBase: 1.3, seed: 15 });
  pt.box([fx0, fx1, transom - f / 2, transom + f / 2, z0, z1], { mat, inkBase: 1.3, seed: 16 });
  // sill board, sticking into the room
  pt.box([-T, 0.07, y0 - 0.035, y0, z0 - 0.07, z1 + 0.07], { mat: 'ivory', inkBase: 1.6, seed: 17 });
  // opening edges
  pt.inkPoly3([[0, y0, z0], [0, y0, z1], [0, y1, z1], [0, y1, z0]], { base: 2.2, seed: 18 });
}

let PLANKS = null;
function planks() {
  if (PLANKS) return PLANKS;
  const { w, d } = ROOM;
  const r = rng(77);
  const pw = 0.15;
  const tones = ['light-wood', 'pine', 'light-wood', 'light-wood'];
  PLANKS = [];
  for (let x = 0, i = 0; x < w; x += pw, i++) {
    let z = -3 - r() * 1.2;
    while (z < d) {
      const len = 1.1 + r() * 1.4;
      const z2 = Math.min(d, z + len);
      PLANKS.push({ i, x, pw, z, z2, len, tone: tones[i % tones.length], alt: r() < 0.5 ? 'pine' : 'light-wood', mixK: r() * 0.5, shade: 0.93 + r() * 0.12 });
      z = z2;
    }
  }
  return PLANKS;
}

function floorAlbedo(pt, T) {
  const { ctx } = pt;
  const toS = pt.onPlane(planes.floor); // u = z, v = x
  for (const p of planks()) {
    const base = cmix(pt.c(p.tone), pt.c(p.alt), p.mixK);
    fillUV(pt, planes.floor, [[p.z, p.x], [p.z2, p.x], [p.z2, p.x + p.pw], [p.z, p.x + p.pw]], T(cscale(base, p.shade)));
  }
  // a worn path from the door side to the desk: slightly paler
  const worn = [];
  for (let k = 0; k <= 30; k++) { const t = k / 30; worn.push([-1 + t * 5.4, 2.5 + Math.sin(t * 3) * 0.3]); }
  for (let k = 30; k >= 0; k--) { const t = k / 30; worn.push([-1 + t * 5.4, 3.55 + Math.sin(t * 3) * 0.3]); }
  fillUV(pt, planes.floor, worn, T(cmix(pt.c('pine'), pt.c('cream'), 0.35), 0.28));
}

// Ink that belongs to the floor: plank seams and grain marks (drawn after lighting).
export function floorInk(pt) {
  const { ctx } = pt;
  const { w, d } = ROOM;
  const toS = pt.onPlane(planes.floor);
  const seen = new Set();
  for (const p of planks()) {
    if (!seen.has(p.i) && p.x > 0) {
      seen.add(p.i);
      const seam = [];
      for (let zz = -3; zz <= d; zz += 0.25) { const q = toS(zz, p.x); if (q) seam.push(q); }
      ink.stroke(ctx, seam, { w: pt.inkW([p.x, 0, 2.5], 0.9), alpha: 0.55, taper: 0.4, seed: p.i });
    }
    if (p.z2 < d) {
      const a = toS(p.z2, p.x), b = toS(p.z2, p.x + p.pw);
      if (a && b) ink.stroke(ctx, [a, b], { w: pt.inkW([p.x, 0, p.z2], 0.8), alpha: 0.5, taper: 0.3, seed: p.z2 * 10 });
    }
    const gr = rng(Math.floor(p.z * 100 + p.x * 1000) + 5);
    for (let g = 0; g < 2; g++) {
      const off = 0.03 + gr() * 0.09;
      const g0 = p.z + gr() * p.len * 0.3, g1 = Math.min(p.z2, g0 + p.len * (0.3 + gr() * 0.5));
      const pts = [];
      for (let zz = g0; zz <= g1; zz += 0.06) { const q = toS(zz, p.x + off + 0.012 * Math.sin(zz * 9 + g)); if (q) pts.push(q); }
      if (pts.length > 1) ink.stroke(ctx, pts, { w: pt.inkW([p.x, 0, (g0 + g1) / 2], 0.45), alpha: 0.28, taper: 1, seed: g0 * 7 });
    }
  }
}
