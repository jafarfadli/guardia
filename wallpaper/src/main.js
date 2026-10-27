// The room wallpaper: frames rendered in Blender across the day (clear and overcast), live print
// laid over them (the calendar, the clock, the sleeve and the widgets), the print grade, dust in
// the beam, and rain falling in the window.
// URL parameters (previews and the host app): time=HH:MM  date=YYYY-MM-DD  still=1  dpr=2  raw=1
// lowpower=1  demo=1 (sample widgets)  weather=clear|partly|cloudy|rain|storm|fog
import { TOKENS } from './tokens.gen.js';
import { roomLight } from './sun.js';
import { Grader } from './grade.js';
import { Dust } from './dust.js';
import { calendarPage, hands, sleeve, onQuad } from './overlays.js';
import * as W from './widgets.js';

const q = new URLSearchParams(location.search);
const state = {
  still: q.get('still') === '1',
  raw: q.get('raw') === '1',
  lowPower: q.get('lowpower') === '1',
  loc: { lat: Number(q.get('lat') || TOKENS.location.lat), lon: Number(q.get('lon') || TOKENS.location.lon) },
  nowPlaying: null,
  widgets: q.get('demo') === '1' ? demo() : {},
};
if (q.get('weather')) state.widgets.weather = { kind: q.get('weather'), amount: 0.7 };

function now() {
  const d = q.get('date') ? new Date(q.get('date') + 'T12:00:00') : new Date();
  const t = q.get('time');
  if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h, m || 0, 0, 0); }
  return d;
}

const view = document.getElementById('view');
const scene = document.createElement('canvas');
let grader = null;
try { grader = new Grader(view, TOKENS); } catch (e) { console.warn('[guardia] no WebGL2, showing the ungraded room', e); }
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

const CLOUDY = ['cloudy', 'rain', 'storm', 'fog'];

// Frames either side of the phase. The sun patch moves between beam frames, so those snap;
// quiet frames (no beam) crossfade. Under cloud, daylight comes from the overcast frames.
function pick(phase, cloudy) {
  const ov = meta.overcast || [];
  const fr = cloudy && ov.length && phase >= 0.45 && phase <= 1.8 ? ov : meta.frames;
  let a = fr[fr.length - 1], b = fr[0], t = 0;
  if (fr === ov) {
    if (phase <= ov[0].phase) return { a: ov[0], b: null, t: 0 };
    if (phase >= ov[ov.length - 1].phase) return { a: ov[ov.length - 1], b: null, t: 0 };
  }
  for (let i = 0; i < fr.length - 1; i++) {
    if (phase >= fr[i].phase && phase <= fr[i + 1].phase) { a = fr[i]; b = fr[i + 1]; t = (phase - a.phase) / (b.phase - a.phase); break; }
  }
  if (phase > fr[fr.length - 1].phase) { a = fr[fr.length - 1]; b = fr[0]; t = (phase - a.phase) / (2 - a.phase); }
  if (a.sunI > 0.02 || b.sunI > 0.02) return { a: t < 0.5 ? a : b, b: null, t: 0 };
  return { a, b, t };
}

// ------------------------------------------------------------------ the widgets
function drawWidgets(ctx, px, light, date) {
  const ov = meta.overlays, w = state.widgets;
  const on = (name) => ov[name] && ov[name].map(px);
  if ('github' in w && ov.github) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    W.warp(ctx, W.githubCard(w.github), on('github'));
    ctx.restore();
  }
  if ('batteries' in w && ov.gauges) W.masked(ctx, 'gauges', px, 'multiply', (g) => W.warp(g, W.gauges(w.batteries), on('gauges')));
  if ('notes' in w && ov.chalk) {
    const light = Math.round(slateLight(ctx, on('chalk')) * 20) / 20;
    W.masked(ctx, 'chalk', px, 'source-over', (g) => W.warp(g, W.chalkBoard(w.notes, light), on('chalk')));
  }
  const screen = W.sessionsScreen(w.sessions);
  if (screen && ov.screen) W.masked(ctx, 'screen', px, 'source-over', (g) => W.warp(g, screen, on('screen')));
  if (w.load && ov.signal) {
    let lens = null;
    W.masked(ctx, 'signal', px, 'source-over', (g) => { lens = W.signalLens(g, w.load, (gg, c) => W.warp(gg, c, on('signal'))); });
    if (lens) {
      // the lit lens throws a little light: a soft glow laid with screen
      const [tl, tr, br, bl] = on('signal');
      const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4, top = (tl[1] + tr[1]) / 2, bot = (bl[1] + br[1]) / 2;
      const cy = top + (bot - top) * lens.y, r = Math.abs(tr[0] - tl[0]) * 1.1;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, lens.col + 'AA'); grd.addColorStop(1, lens.col + '00');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = grd;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.restore();
    }
  }
  drawWeather(ctx, px, light, date);
}

// How lit the slate came out of the render: the middle of the board against its own colour.
function slateLight(ctx, quad) {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = Math.round(x0 + (x1 - x0) * 0.3), y = Math.round(y0 + (y1 - y0) * 0.3);
  const w = Math.max(1, Math.round((x1 - x0) * 0.4)), h = Math.max(1, Math.round((y1 - y0) * 0.4));
  try {
    const d = ctx.getImageData(x, y, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 16) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    // the render lights paint at about 0.64 of its colour in the plain fill: call that "1"
    return sum / (d.length / 16) / W.SLATE_LUM / 0.64;
  } catch { return 1; }
}

function drawWeather(ctx, px, light, date) {
  const wx = state.widgets.weather;
  const sky = W.maskBox('sky'), out = W.maskBox('outside');
  if (!sky || !out) return;
  const rect = (b) => [...px([b[0], b[1]]), ...px([b[2], b[3]])];
  const day = light.phase > 0.35 && light.phase < 1.85;
  const kind = wx?.kind || 'clear';
  const drift = (date.getHours() * 60 + date.getMinutes()) / 1440;
  if (day && kind === 'partly') W.masked(ctx, 'sky', px, 'source-over', (g) => W.clouds(g, rect(sky), drift, 0.6));
  if (!day && (kind === 'clear' || kind === 'partly')) W.masked(ctx, 'sky', px, 'source-over', (g) => W.stars(g, rect(sky)));
  if (kind === 'fog') W.masked(ctx, 'outside', px, 'source-over', (g) => { g.fillStyle = 'rgba(214,218,222,0.45)'; const r = rect(out); g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); });
  if (kind === 'rain' || kind === 'storm') W.masked(ctx, 'outside', px, 'source-over', (g) => W.drops(g, rect(out), wx.amount ?? 0.6, day));
}

// Rain falling in the window (widgets.js Rain), and lightning for a storm: the room flashes
// now and then.
const rainEl = document.createElement('canvas');
rainEl.id = 'rain';
document.body.appendChild(rainEl);
const rain = new W.Rain(rainEl);
const flashEl = document.createElement('div');
flashEl.id = 'flash';
document.body.appendChild(flashEl);
let rainKind = '', stormTimer = 0;
function placeRain(px, dpr, day) {
  const box = W.maskBox('outside');
  const wx = state.widgets.weather;
  const kind = wx && (wx.kind === 'rain' || wx.kind === 'storm') ? wx.kind : '';
  if (!box || !kind) { rain.stop(); rainKind = ''; clearTimeout(stormTimer); return; }
  const [ax, ay] = px([box[0], box[1]]), [bx, by] = px([box[2], box[3]]);
  const heavy = kind === 'storm' || (wx.amount ?? 0.6) > 0.7;
  rain.set({ x: ax, y: ay, w: bx - ax, h: by - ay, dpr, mask: W.maskImage('outside'), heavy, day, still: state.lowPower || state.still });
  if (rainKind !== kind) {
    rainKind = kind;
    clearTimeout(stormTimer);
    if (kind === 'storm') thunder();
  }
}
function thunder() {
  stormTimer = setTimeout(() => {
    if (rainKind !== 'storm') return;
    if (!state.lowPower) { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }
    thunder();
  }, 9000 + Math.random() * 22000);
}

// ------------------------------------------------------------------ one frame of the room
async function render() {
  const t0 = performance.now();
  if (!meta) { meta = await (await fetch('frames/frames.json')).json(); await W.loadMasks(meta); }
  const dpr = Number(q.get('dpr') || window.devicePixelRatio || 1);
  const Wd = Math.round(window.innerWidth * dpr), Hd = Math.round(window.innerHeight * dpr);
  scene.width = Wd; scene.height = Hd;
  const date = now();
  const light = roomLight(date, state.loc);
  const wx = state.widgets.weather;
  const cloudy = !!wx && CLOUDY.includes(wx.kind);
  const { a, b, t } = pick(light.phase, cloudy);
  const [ia, ib] = await Promise.all([image(a.file), b && t > 0.01 ? image(b.file) : null]);

  // cover-fit the 16:10 frame onto this screen
  const fw = ia.naturalWidth, fh = ia.naturalHeight;
  const s = Math.max(Wd / fw, Hd / fh);
  const ox = (Wd - fw * s) / 2, oy = (Hd - fh * s) / 2;
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
  drawWidgets(ctx, px, light, date);

  if (grader && !state.raw) {
    // under cloud: no warm beam glow, a cooler page (DESIGN.md's contrast mood)
    const look = cloudy
      ? { warm: 0, cool: 0.55, glow: 0.4 + light.lamp * 0.5, inkSkip: 0.12 }
      : { warm: light.warm, cool: light.cool * 0.8, glow: 0.6 + light.sunI * 0.6 + light.lamp * 0.5, inkSkip: 0.12 };
    grader.bake(scene, look);
    grader.frame((performance.now() / 1000) % 600);
    scene.width = 1; scene.height = 1;
  } else {
    view.replaceWith(scene);
    scene.id = 'view';
  }
  dust.setup(a.beam.map(px).map(([x, y]) => [x / dpr, y / dpr]), cloudy ? 0 : a.sunI * (state.lowPower ? 0.5 : 1));
  placeRain(px, dpr, light.phase > 0.35 && light.phase < 1.85);
  document.documentElement.dataset.mood = light.name;
  const w = state.widgets;
  window.__guardia = {
    light: { name: light.name, elevation: light.elevation, phase: light.phase, frame: a.file },
    widgets: { notes: W.parseNotes(w.notes).length, streak: w.github?.streak ?? null, sessions: (w.sessions || []).length,
               batteries: (w.batteries || []).map((d) => `${d.name} ${d.percent ?? '-'}`), load: w.load || null, weather: wx?.kind || null,
               loc: [Math.round(state.loc.lat * 10) / 10, Math.round(state.loc.lon * 10) / 10] },
    rain: rain.on ? [rainEl.width, rainEl.height, rain.drops.length] : null,
    keys: Object.keys(w), ms: Math.round(performance.now() - t0), ready: true,
  };
}

// one render at a time; updates that arrive meanwhile fold into the next one
let busy = null, again = false;
function rerender() {
  if (busy) { again = true; return busy; }
  busy = render().catch((e) => {
    // what failed shows up in guardia://status (the host reads window.__guardia)
    console.warn('[guardia] render', e);
    window.__guardia = { ...(window.__guardia || {}), error: String((e && e.stack) || e).slice(0, 400), keys: Object.keys(state.widgets) };
  }).finally(() => {
    busy = null;
    if (again) { again = false; rerender(); }
  });
  return busy;
}
let soonT = 0;
const soon = () => { clearTimeout(soonT); soonT = setTimeout(rerender, 250); };

function scheduleMinute() {
  const ms = 60000 - (Date.now() % 60000) + 50;
  setTimeout(async () => { await rerender(); scheduleMinute(); }, ms);
}

window.guardia = {
  setNowPlaying(info) { state.nowPlaying = info; soon(); },
  setLowPower(on) { state.lowPower = !!on; document.documentElement.classList.toggle('lowpower', state.lowPower); soon(); },
  // any of: notes, github, sessions, batteries, load, weather
  setWidgets(part) { Object.assign(state.widgets, part || {}); soon(); },
  setLocation(lat, lon) { if (Number.isFinite(lat) && Number.isFinite(lon)) { state.loc = { lat, lon }; soon(); } },
  rerender,
};
// tell the host (Guardia) the page can listen now: it answers with the song, the widgets, the place
try { window.webkit?.messageHandlers?.guardia?.postMessage('ready'); } catch {}

let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(rerender, 250); });

// Canvas text never asks for a font, so document.fonts.ready alone resolves before the
// lettering has loaded and the live print falls back to a serif. Load the faces first.
const faces = ['800 20px "Shantell Sans"', '600 20px "Shantell Sans"', '20px "Alfa Slab One"'];
Promise.all(faces.map((f) => document.fonts.load(f))).catch(() => {}).then(async () => {
  await rerender();
  if (!state.still && !q.get('time')) scheduleMinute();
});

// Sample widgets for previews (demo=1).
function demo() {
  const weeks = [];
  for (let i = 0; i < 15; i++) weeks.push([0, 1, 2, 3, 4, 5, 6].map((d) => (i === 14 && d > 2 ? -1 : (i * 7 + d) % 3 === 0 ? 0 : (i + d) % 6)));
  return {
    notes: '# besok\n- kirim revisi bab 3\n- beli kopi\nx bayar listrik\n- telpon ibu',
    github: { streak: 12, weeks },
    sessions: [{ name: 'DESKTOP', running: true }, { name: 'api-kampus', running: false }],
    batteries: [{ name: 'MAC', percent: 84, charging: true }, { name: 'IPHONE', percent: 46 }, { name: 'AIRPODS', percent: 15 }, { name: 'MOUSE', percent: null }],
    load: 'amber',
  };
}
