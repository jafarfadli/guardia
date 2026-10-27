// Printed matter for the Blender room, drawn flat in base colours (the render lights them).
// Fewer, larger pieces, hand-lettered: the room should read at wallpaper size, not be noise.
import { screen } from '../wallpaper/src/printed.js';
import { rng } from '../wallpaper/src/math.js';

const INK = '#2B1C14';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return [c, ctx];
}

export const TEXTURES = {
  // The chalkboard's slate, 1.61 x 0.81 m at 1.2 px = 1 mm: dark green with clouds of old,
  // wiped-off chalk. The notes and the GitHub streak are chalked over it live.
  slate() {
    const W = 1932, H = 972;
    const [c, ctx] = canvas(W, H);
    const r = rng(77);
    ctx.fillStyle = '#34463D'; ctx.fillRect(0, 0, W, H);
    // wiped chalk: soft sweeps from an eraser, a little lighter where it was wiped least
    ctx.filter = 'blur(22px)';
    for (let i = 0; i < 30; i++) {
      const x = r() * W, y = r() * H, rx = 140 + r() * 260, ry = 26 + r() * 40;
      ctx.fillStyle = `rgba(232,224,204,${0.03 + r() * 0.04})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (r() - 0.5) * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.filter = 'none';
    // ghosts of old words
    ctx.strokeStyle = 'rgba(232,224,204,0.06)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) {
      let x = 110 + r() * 260; const y = 150 + row * 170 + r() * 30, end = x + 260 + r() * 300;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (x < end) { const st = 14 + r() * 18; ctx.quadraticCurveTo(x + st / 2, y - 10 - r() * 10, x + st, y + (r() - 0.5) * 4); x += st; }
      ctx.stroke();
    }
    return c;
  },
  // The battery board's face, 0.804 x 0.324 m at 2 px = 1 mm: four dials on cherry wood, each
  // with a blank label plate. Needles, numbers and names are printed live. Dial centres must
  // match battery_panel() (and widgets.js gauges()).
  gauges() {
    const W = 1608, H = 648;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#7E3B2B'; ctx.fillRect(0, 0, W, H);
    const R = 166;
    for (let k = 0; k < 4; k++) {
      const cx = (k + 0.5) * (W / 4), cy = H * 0.42;
      ctx.fillStyle = '#EFE5CF'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      // the red band at the low end, then ticks every tenth over a 240° sweep
      const ang = (f) => (-210 + f * 240) * Math.PI / 180;
      ctx.strokeStyle = '#B04A3A'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, ang(0), ang(0.2)); ctx.stroke();
      ctx.strokeStyle = INK;
      for (let i = 0; i <= 10; i++) {
        const a = ang(i / 10), big = i % 5 === 0;
        ctx.lineWidth = big ? 7 : 4;
        const r0 = R * (big ? 0.62 : 0.7), r1 = R * 0.88;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      // label plate
      const pw = 300, ph = 96, px = cx - pw / 2, py = H - ph - 16;
      ctx.fillStyle = '#E4D3AE'; ctx.fillRect(px, py, pw, ph);
      ctx.lineWidth = 4; ctx.strokeRect(px, py, pw, ph);
    }
    return c;
  },
  // tear-off calendar: header band and a blank page; the date is printed live over it
  calendar() {
    const [c, ctx] = canvas(310, 470);
    ctx.fillStyle = '#C38F33'; ctx.fillRect(0, 0, 310, 94);
    ctx.fillStyle = '#EFE5CF'; ctx.fillRect(0, 94, 310, 376);
    ctx.fillStyle = '#E4D3AE';
    for (let x = 0; x < 310; x += 22) ctx.fillRect(x, 94, 12, 8);
    return c;
  },
  screen() {
    const [c, ctx] = canvas(620, 390);
    screen(ctx, 620, 390, new Date());
    return c;
  },
  // kilim: navy field, red and mustard border, three lozenges (worn toward cream)
  rug() {
    const W = 1400, H = 960;
    const [c, ctx] = canvas(W, H);
    const fade = (h) => h; // the render fades it
    const F = (x0, y0, x1, y1, col) => { ctx.fillStyle = fade(col); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); };
    F(0, 0, W, H, '#B5584A');
    F(50, 50, W - 50, H - 50, '#CDA052');
    F(66, 66, W - 66, H - 66, '#3E4F72');
    for (let x = 82; x < W - 90; x += 62) { F(x, 66, x + 30, 104, '#B5584A'); F(x, H - 104, x + 30, H - 66, '#B5584A'); }
    const dia = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(cx, cy - ry); ctx.lineTo(cx + rx, cy); ctx.lineTo(cx, cy + ry); ctx.closePath(); ctx.fill(); };
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.22 + i * 0.28), cy = H / 2;
      dia(cx, cy, 190, 270, '#B5584A'); dia(cx, cy, 132, 190, '#CDA052'); dia(cx, cy, 78, 112, '#3E4F72'); dia(cx, cy, 30, 44, '#E8DCC0');
    }
    // worn lane and weave dashes
    ctx.fillStyle = 'rgba(232,220,192,0.16)'; ctx.fillRect(120, H * 0.18, W - 240, H * 0.2);
    const r = rng(9);
    ctx.fillStyle = 'rgba(43,28,20,0.18)';
    for (let k = 0; k < 900; k++) ctx.fillRect(r() * W, r() * H, 8 + r() * 10, 2);
    return c;
  },
  // a blank sleeve front (art is printed live) and generic record sleeves
  sleeve() {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#F2EADB'; ctx.fillRect(0, 0, 64, 64);
    return c;
  },
};

export function renderAll() {
  const out = {};
  for (const [name, fn] of Object.entries(TEXTURES)) out[name] = fn().toDataURL('image/png');
  return out;
}
