// Boot, schedule, and render loop for the room wallpaper.
// URL parameters (for previews and the host app):
//   time=HH:MM  date=YYYY-MM-DD  view=main|wide|desk  still=1  fps=12  dpr=2  raw=1  lowpower=1
import { TOKENS } from './tokens.gen.js';
import { roomLight } from './sun.js';
import { drawScene } from './scene.js';
import { Grader } from './grade.js';
import { Dust } from './dust.js';
import { buildPrinted } from './printed.js';

const q = new URLSearchParams(location.search);
const state = {
  view: q.get('view') || 'main',
  still: q.get('still') === '1',
  raw: q.get('raw') === '1',
  fps: Number(q.get('fps') || 12),
  lowPower: q.get('lowpower') === '1',
  loc: { lat: Number(q.get('lat') || TOKENS.location.lat), lon: Number(q.get('lon') || TOKENS.location.lon) },
  nowPlaying: null,
};

function now() {
  const d = q.get('date') ? new Date(q.get('date') + 'T12:00:00') : new Date();
  const t = q.get('time');
  if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h, m || 0, 0, 0); }
  return d;
}

const view = document.getElementById('view');
const dustCanvas = document.getElementById('dust');
const scene = document.createElement('canvas');
const scratch = document.createElement('canvas');
let grader = null;
try { grader = new Grader(view, TOKENS); } catch (e) { console.warn('[kamar] no WebGL2, showing ungraded scene', e); }
const dust = new Dust(dustCanvas);
let lastLight = null;

async function render() {
  const t0 = performance.now();
  const dpr = Number(q.get('dpr') || window.devicePixelRatio || 1);
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  for (const c of [scene, scratch]) { c.width = W; c.height = H; }
  const date = now();
  const light = roomLight(date, state.loc);
  lastLight = light;
  const ctx = scene.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = 'round';
  const printed = await buildPrinted(date, state);
  const pt = drawScene(ctx, { W, H, dpr, light, tokens: TOKENS, now: date, view: state.view, scratch, printed, nowPlaying: state.nowPlaying });
  if (grader && !state.raw) {
    grader.bake(scene, { warm: light.warm, cool: light.cool * 0.8, glow: 0.6 + light.sunI * 0.6 + light.lamp * 0.5 });
    grader.frame(performance.now() / 1000);
  } else {
    view.replaceWith(scene);
    scene.id = 'view';
  }
  dust.setup({ cam: pt.cam, panes: pt.panes, S: light.S, intensity: light.dust * (state.lowPower ? 0.5 : 1), dpr, W, H });
  dust.draw(performance.now() / 1000);
  document.documentElement.dataset.mood = light.name;
  window.__kamar = { light: { name: light.name, elevation: light.elevation, phase: light.phase }, ms: Math.round(performance.now() - t0), ready: true };
}

let last = 0;
function loop(t) {
  if (!state.still) requestAnimationFrame(loop);
  const fps = state.lowPower ? Math.min(6, state.fps) : state.fps;
  if (t - last < 1000 / fps) return;
  last = t;
  if (grader && !state.raw) grader.frame(t / 1000);
  dust.draw(t / 1000);
}

// Re-render on the minute (clock, calendar, and the sun all move).
function scheduleMinute() {
  const ms = 60000 - (Date.now() % 60000) + 50;
  setTimeout(async () => { await render(); scheduleMinute(); }, ms);
}

// The host app can push now-playing info and power state.
window.kamar = {
  setNowPlaying(info) { state.nowPlaying = info; render(); },
  setLowPower(on) { state.lowPower = !!on; },
  rerender: render,
};

let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 250); });

document.fonts.ready.then(async () => {
  await render();
  if (!state.still) { requestAnimationFrame(loop); if (!q.get('time')) scheduleMinute(); }
});
