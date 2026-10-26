// The room wallpaper: frames rendered in Blender across the day, live print laid over them,
// the print grade, and dust in the beam.
// URL parameters (previews and the host app): time=HH:MM  date=YYYY-MM-DD  still=1  dpr=2  raw=1  lowpower=1
import { TOKENS } from './tokens.gen.js';
import { roomLight } from './sun.js';
import { Grader } from './grade.js';
import { Dust } from './dust.js';
import { calendarPage, hands, sleeve, onQuad } from './overlays.js';

const q = new URLSearchParams(location.search);
const state = {
  still: q.get('still') === '1',
  raw: q.get('raw') === '1',
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
const scene = document.createElement('canvas');
let grader = null;
try { grader = new Grader(view, TOKENS); } catch (e) { console.warn('[kamar] no WebGL2, showing the ungraded room', e); }
const dust = new Dust(document.getElementById('dust'));

let meta = null;
const images = new Map();
function image(file) {
  if (!images.has(file)) {
    images.set(file, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'frames/' + file;
    }));
  }
  return images.get(file);
}

// Frames either side of the phase. The sun patch moves between beam frames, so those snap;
// quiet frames (no beam) crossfade.
function pick(phase) {
  const fr = meta.frames;
  let a = fr[fr.length - 1], b = fr[0], t = 0;
  for (let i = 0; i < fr.length - 1; i++) {
    if (phase >= fr[i].phase && phase <= fr[i + 1].phase) { a = fr[i]; b = fr[i + 1]; t = (phase - a.phase) / (b.phase - a.phase); break; }
  }
  if (phase > fr[fr.length - 1].phase) { a = fr[fr.length - 1]; b = fr[0]; t = (phase - a.phase) / (2 - a.phase); }
  if (a.sunI > 0.02 || b.sunI > 0.02) return { a: t < 0.5 ? a : b, b: null, t: 0 };
  return { a, b, t };
}

async function render() {
  const t0 = performance.now();
  if (!meta) meta = await (await fetch('frames/frames.json')).json();
  const dpr = Number(q.get('dpr') || window.devicePixelRatio || 1);
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  scene.width = W; scene.height = H;
  const date = now();
  const light = roomLight(date, state.loc);
  const { a, b, t } = pick(light.phase);
  const [ia, ib] = await Promise.all([image(a.file), b && t > 0.01 ? image(b.file) : null]);

  // cover-fit the 16:10 frame onto this screen
  const fw = ia.naturalWidth, fh = ia.naturalHeight;
  const s = Math.max(W / fw, H / fh);
  const ox = (W - fw * s) / 2, oy = (H - fh * s) / 2;
  const px = ([u, v]) => [ox + u * fw * s, oy + v * fh * s];

  const ctx = scene.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(ia, ox, oy, fw * s, fh * s);
  if (ib) { ctx.globalAlpha = t; ctx.drawImage(ib, ox, oy, fw * s, fh * s); ctx.globalAlpha = 1; }

  // live print, multiplied into the lit paper
  const ov = meta.overlays;
  ctx.globalCompositeOperation = 'multiply';
  onQuad(ctx, ov.calendar.map(px), 310, 470, (g) => calendarPage(g, 310, 470, date));
  onQuad(ctx, ov.clock.map(px), 400, 400, (g) => hands(g, date));
  onQuad(ctx, ov.sleeve.map(px), 320, 320, (g) => sleeve(g, 320, state.nowPlaying));
  ctx.globalCompositeOperation = 'source-over';

  if (grader && !state.raw) {
    grader.bake(scene, { warm: light.warm, cool: light.cool * 0.8, glow: 0.6 + light.sunI * 0.6 + light.lamp * 0.5, inkSkip: 0.12 });
    grader.frame(performance.now() / 1000);
    scene.width = 1; scene.height = 1;
  } else {
    view.replaceWith(scene);
    scene.id = 'view';
  }
  dust.setup(a.beam.map(px).map(([x, y]) => [x / dpr, y / dpr]), a.sunI * (state.lowPower ? 0.5 : 1));
  document.documentElement.dataset.mood = light.name;
  window.__kamar = { light: { name: light.name, elevation: light.elevation, phase: light.phase, frame: a.file }, ms: Math.round(performance.now() - t0), ready: true };
}

function scheduleMinute() {
  const ms = 60000 - (Date.now() % 60000) + 50;
  setTimeout(async () => { await render(); scheduleMinute(); }, ms);
}

window.kamar = {
  setNowPlaying(info) { state.nowPlaying = info; render(); },
  setLowPower(on) { state.lowPower = !!on; document.documentElement.classList.toggle('lowpower', state.lowPower); },
  rerender: () => render(),
};

let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 250); });

// Canvas text never asks for a font, so document.fonts.ready alone resolves before the
// lettering has loaded and the live print falls back to a serif. Load the faces first.
const faces = ['800 20px "Shantell Sans"', '600 20px "Shantell Sans"', '20px "Alfa Slab One"'];
Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => {}).then(async () => {
  await render();
  if (!state.still && !q.get('time')) scheduleMinute();
});
