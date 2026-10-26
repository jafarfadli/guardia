// Printed matter for the Blender room, drawn flat in base colours (the render lights them).
// Fewer, larger pieces, hand-lettered: the room should read at wallpaper size, not be noise.
import { person, drawPerson, poster, screen } from '../wallpaper/src/printed.js';
import { rng } from '../wallpaper/src/math.js';

const T = (c) => c; // base colours; Blender does the lighting
const INK = '#2B1C14';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return [c, ctx];
}

function paper(ctx, x, y, w, h, a, col, fn) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(a); ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(43,28,20,0.3)'; ctx.fillRect(6, 8, w, h);
  ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(0, 0, w, h);
  fn(ctx);
  ctx.restore();
}

function scribble(ctx, x, y, w, rows, gap, seed) {
  // handwriting that reads as writing from across the room: loose ink lines, not tiny letters
  const r = rng(seed);
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
  for (let i = 0; i < rows; i++) {
    const len = w * (0.55 + r() * 0.45);
    ctx.beginPath();
    let px = x, py = y + i * gap;
    ctx.moveTo(px, py);
    while (px < x + len) {
      const step = 10 + r() * 14;
      ctx.quadraticCurveTo(px + step * 0.5, py - 6 - r() * 6, px + step, py + (r() - 0.5) * 3);
      px += step;
    }
    ctx.stroke();
  }
}

export const TEXTURES = {
  // the cork board: four pieces, big enough to read as what they are
  cork() {
    const [c, ctx] = canvas(1100, 620);
    const r = rng(808);
    ctx.fillStyle = '#B98A57'; ctx.fillRect(0, 0, 1100, 620);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = r() < 0.5 ? '#9C6E42' : '#CDA172'; const s = 1.5 + r() * 2.5; ctx.fillRect(r() * 1100, r() * 620, s, s * 0.8); }
    paper(ctx, 60, 70, 250, 290, -0.07, '#F2EADB', (g) => {
      g.fillStyle = '#9FB8C8'; g.fillRect(20, 20, 210, 200);
      drawPerson(g, 36, 70, 7.5, person(11, 'hijab'), T);
      drawPerson(g, 122, 62, 8, person(23, 'short'), T);
      g.fillStyle = INK; g.font = '700 28px "Shantell Sans"'; g.fillText('pantai!', 70, 262);
    });
    paper(ctx, 380, 50, 300, 330, 0.04, '#EFE5CF', (g) => {
      g.fillStyle = '#B04A3A'; g.fillRect(40, 0, 3, 330);
      g.fillStyle = INK; g.font = '800 44px "Shantell Sans"'; g.fillText('besok', 60, 66);
      scribble(g, 60, 128, 210, 4, 52, 3);
    });
    paper(ctx, 740, 80, 310, 210, -0.05, '#EFE5CF', (g) => {
      g.fillStyle = '#9FB8C8'; g.fillRect(14, 14, 282, 182);
      g.fillStyle = '#E9B66A'; g.beginPath(); g.arc(210, 82, 36, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6F7A48'; g.beginPath(); g.moveTo(14, 140); g.quadraticCurveTo(100, 76, 180, 136); g.quadraticCurveTo(240, 108, 296, 128); g.lineTo(296, 196); g.lineTo(14, 196); g.fill();
      g.fillStyle = '#3F6874'; g.fillRect(14, 162, 282, 34);
    });
    paper(ctx, 800, 360, 210, 200, 0.1, '#E6C766', (g) => {
      g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.ellipse(108, 128, 60, 40, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64, 86, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(42, 66); g.lineTo(44, 40); g.lineTo(62, 58); g.moveTo(70, 56); g.lineTo(86, 38); g.lineTo(90, 64); g.stroke();
      g.beginPath(); g.moveTo(166, 128); g.quadraticCurveTo(202, 100, 190, 64); g.stroke();
    });
    for (const [x, y, col] of [[185, 82, '#B04A3A'], [530, 60, '#3F6874'], [895, 92, '#C38F33'], [905, 372, '#3F6874']]) {
      ctx.fillStyle = 'rgba(43,28,20,0.35)'; ctx.beginPath(); ctx.arc(x + 4, y + 5, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    }
    return c;
  },
  // the gig poster (printed matter keeps a slab face)
  poster() {
    const [c, ctx] = canvas(700, 980);
    poster(ctx, 700, 980, T);
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
  // clock face without hands (hands are a live layer)
  clock() {
    const [c, ctx] = canvas(400, 400);
    const R = 200, cx = 200;
    ctx.fillStyle = '#7E3B2B'; ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EFE5CF'; ctx.beginPath(); ctx.arc(cx, cx, R * 0.84, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.fillStyle = INK;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
      ctx.lineWidth = big ? 9 : 3;
      const r0 = R * (big ? 0.66 : 0.74), r1 = R * 0.79;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r0, cx - Math.cos(a) * r0); ctx.lineTo(cx + Math.sin(a) * r1, cx - Math.cos(a) * r1); ctx.stroke();
    }
    ctx.font = `800 ${R * 0.28}px "Shantell Sans"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [n, a] of [[12, 0], [3, 90], [6, 180], [9, 270]]) {
      const ang = (a * Math.PI) / 180, rr = R * 0.47;
      ctx.fillText(String(n), cx + Math.sin(ang) * rr, cx - Math.cos(ang) * rr + 4);
    }
    return c;
  },
  screen() {
    const [c, ctx] = canvas(460, 330);
    screen(ctx, 460, 330, new Date());
    return c;
  },
  photo() {
    const [c, ctx] = canvas(120, 165);
    ctx.fillStyle = '#A7B9C4'; ctx.fillRect(0, 0, 120, 165);
    drawPerson(ctx, 6, 40, 4.6, person(71, 'hijab'), T);
    drawPerson(ctx, 60, 34, 4.8, person(72, 'glasses'), T);
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
