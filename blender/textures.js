// Printed matter for the Blender room, drawn flat in base colours (the render lights them).
// Fewer, larger pieces, hand-lettered: the room should read at wallpaper size, not be noise.
import { person, drawPerson, poster, screen } from '../wallpaper/src/printed.js';
import { rng } from '../wallpaper/src/math.js';

const T = (c) => c; // base colours; Blender does the lighting
const INK = '#2B1C14';
// the GitHub card on the cork board: x, y, w, h (px) and a turn in radians (see cork())
export const CARD = [366, 30, 420, 520, 0.02];

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
  // The cork board (1 px = 1 mm). The card in the middle is GitHub's: printed live with the
  // streak and the last weeks (wallpaper/src/widgets.js). Its place must match CORK['card'] in
  // blender/kamar/props.py.
  cork() {
    const W = 1096, H = 596;
    const [c, ctx] = canvas(W, H);
    const r = rng(808);
    ctx.fillStyle = '#B98A57'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = r() < 0.5 ? '#9C6E42' : '#CDA172'; const s = 1.5 + r() * 2.5; ctx.fillRect(r() * W, r() * H, s, s * 0.8); }
    paper(ctx, 26, 64, 300, 330, -0.07, '#F2EADB', (g) => {
      g.fillStyle = '#9FB8C8'; g.fillRect(20, 20, 260, 236);
      drawPerson(g, 44, 86, 8.6, person(11, 'hijab'), T);
      drawPerson(g, 146, 76, 9, person(23, 'short'), T);
      g.fillStyle = INK; g.font = '700 32px "Shantell Sans"'; g.fillText('pantai!', 82, 300);
    });
    paper(ctx, ...CARD, '#EFE5CF', (g) => {
      const [, , w] = CARD;
      g.fillStyle = '#C38F33'; g.fillRect(0, 0, w, 76);
      g.fillStyle = '#EFE5CF'; g.font = '44px "Alfa Slab One"'; g.textBaseline = 'middle';
      g.fillText('GITHUB', 26, 41);
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 76); g.lineTo(w, 76); g.stroke();
    });
    paper(ctx, 814, 44, 252, 174, -0.05, '#EFE5CF', (g) => {
      g.fillStyle = '#9FB8C8'; g.fillRect(14, 14, 224, 146);
      g.fillStyle = '#E9B66A'; g.beginPath(); g.arc(170, 66, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6F7A48'; g.beginPath(); g.moveTo(14, 112); g.quadraticCurveTo(80, 60, 144, 108); g.quadraticCurveTo(192, 86, 238, 102); g.lineTo(238, 160); g.lineTo(14, 160); g.fill();
      g.fillStyle = '#3F6874'; g.fillRect(14, 132, 224, 28);
    });
    paper(ctx, 840, 300, 212, 202, 0.1, '#E6C766', (g) => {
      g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.ellipse(108, 128, 60, 40, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64, 86, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(42, 66); g.lineTo(44, 40); g.lineTo(62, 58); g.moveTo(70, 56); g.lineTo(86, 38); g.lineTo(90, 64); g.stroke();
      g.beginPath(); g.moveTo(166, 128); g.quadraticCurveTo(202, 100, 190, 64); g.stroke();
    });
    for (const [x, y, col] of [[172, 76, '#B04A3A'], [748, 46, '#3F6874'], [940, 56, '#C38F33'], [946, 312, '#3F6874']]) {
      ctx.fillStyle = 'rgba(43,28,20,0.35)'; ctx.beginPath(); ctx.arc(x + 4, y + 5, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    }
    return c;
  },
  // The chalkboard's slate (1.5 px = 1 mm): dark green with clouds of old, wiped-off chalk. The
  // notes are chalked over it live.
  slate() {
    const W = 1440, H = 930;
    const [c, ctx] = canvas(W, H);
    const r = rng(77);
    ctx.fillStyle = '#34463D'; ctx.fillRect(0, 0, W, H);
    // wiped chalk: soft sweeps from an eraser, a little lighter where it was wiped least
    ctx.filter = 'blur(22px)';
    for (let i = 0; i < 24; i++) {
      const x = r() * W, y = r() * H, rx = 140 + r() * 260, ry = 26 + r() * 40;
      ctx.fillStyle = `rgba(232,224,204,${0.03 + r() * 0.04})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (r() - 0.5) * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.filter = 'none';
    // ghosts of old words, and a tally in the corner nobody wiped
    ctx.strokeStyle = 'rgba(232,224,204,0.06)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) {
      let x = 110 + r() * 260; const y = 150 + row * 170 + r() * 30, end = x + 260 + r() * 300;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (x < end) { const st = 14 + r() * 18; ctx.quadraticCurveTo(x + st / 2, y - 10 - r() * 10, x + st, y + (r() - 0.5) * 4); x += st; }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,224,204,0.18)'; ctx.lineWidth = 5;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(W - 150 + k * 20, H - 104); ctx.lineTo(W - 146 + k * 20, H - 44); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(W - 162, H - 58); ctx.lineTo(W - 66, H - 92); ctx.stroke();
    return c;
  },
  // The battery board (2 px = 1 mm): four dials on cherry wood, each with a blank label plate.
  // Needles, numbers and names are printed live. Dial centres must match battery_panel().
  gauges() {
    const W = 1488, H = 488;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#7E3B2B'; ctx.fillRect(0, 0, W, H);
    const R = 128;
    for (let k = 0; k < 4; k++) {
      const cx = (k + 0.5) * (W / 4), cy = H * 0.4;
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
      const pw = 250, ph = 84, px = cx - pw / 2, py = H - ph - 22;
      ctx.fillStyle = '#E4D3AE'; ctx.fillRect(px, py, pw, ph);
      ctx.lineWidth = 4; ctx.strokeRect(px, py, pw, ph);
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
