// Printed matter: flat graphic art (posters, photos, notes, the calendar page, the clock face).
// Everything here draws in a local pixel space; the caller maps it onto a wall with an affine
// transform and passes T, the lighting tone for that wall, so print gets lit like paint does.
// People are pixel art with a short palette: the only pixel art in the room (DESIGN.md).
import { rng } from './math.js';
import * as ink from './ink.js';

export async function buildPrinted() { return {}; }

export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
export function pasaran(date) {
  const ref = Date.UTC(1945, 7, 17); // Jumat Legi
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((d - ref) / 86400000);
  return PASARAN[((days % 5) + 5) % 5];
}

// ------------------------------------------------------------------ pixel people
const TPL = {
  short: [
    '....HHHH....',
    '..HHHHHHHH..',
    '.HHHHHHHHHH.',
    '.HHSSSSSSHH.',
    '.HSSSSSSSsH.',
    '.HSESSSESsH.',
    '.HSSSSSSSs..',
    '..SSSSSSss..',
    '..SSSMMSss..',
    '...SSSSss...',
    '....SSss....',
    '..CCCKKCCc..',
    '.CCCCCCCCcc.',
    'CCCCCCCCCccc',
  ],
  long: [
    '....HHHH....',
    '..HHHHHHHH..',
    '.HHHHHHHHHH.',
    '.HHSSSSSSHH.',
    'HHSSSSSSSsHH',
    'HHSESSSESsHH',
    'HHSSSSSSSsHH',
    'HHSSSSSSssHH',
    'HH.SSMMSs.HH',
    'HH..SSss..HH',
    'HH..SSss..HH',
    'HHCCCKKCCcHH',
    '.CCCCCCCCcc.',
    'CCCCCCCCCccc',
  ],
  hijab: [
    '....JJJJ....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJj.',
    '.JJSSSSSSJj.',
    'JJSSSSSSSsJj',
    'JJSESSSESsJj',
    'JJSSSSSSSsJj',
    'JJSSSSSSssJj',
    'JJJSSMMSsJjj',
    'JJJJSSssJJjj',
    '.JJJJJJJJjj.',
    'JJJJJJJJJjjj',
    'JCCCCCCCCccj',
    'CCCCCCCCCccc',
  ],
  glasses: [
    '....HHHH....',
    '..HHHHHHHH..',
    '.HHHHHHHHHH.',
    '.HHSSSSSSHH.',
    '.HSSSSSSSsH.',
    '.GGGGSGGGGs.',
    '.HGEGSGEGsH.',
    '..SSSSSSss..',
    '..SSSMMSss..',
    '...SSSSss...',
    '....SSss....',
    '..CCCKKCCc..',
    '.CCCCCCCCcc.',
    'CCCCCCCCCccc',
  ],
};
const SKIN = [['#E6B48A', '#C28B66'], ['#C68B5F', '#9C6643'], ['#9B6542', '#734A30']];
const HAIR = ['#2E1E16', '#4A2E22', '#3A2A24'];
const CLOTH = [['#3F6874', '#2F4E58'], ['#B04A3A', '#86362A'], ['#C38F33', '#93691F'], ['#34466A', '#26334F'], ['#6F7A48', '#525B33']];
const SCARF = [['#3F6874', '#2F4E58'], ['#B04A3A', '#86362A'], ['#C99A62', '#9C7445'], ['#7A8FB5', '#5D6F92']];

export function person(seed, kind) {
  const r = rng(seed);
  const skin = r.pick(SKIN), cloth = r.pick(CLOTH), scarf = r.pick(SCARF);
  return {
    tpl: TPL[kind ?? r.pick(['short', 'long', 'hijab', 'glasses'])],
    col: { H: r.pick(HAIR), S: skin[0], s: skin[1], E: '#2B1C14', M: '#8E3B2C', C: cloth[0], c: cloth[1], K: '#E2D1AE', J: scarf[0], j: scarf[1], G: '#2B1C14' },
  };
}

export function drawPerson(ctx, x, y, px, p, T) {
  for (let row = 0; row < p.tpl.length; row++) {
    const line = p.tpl[row];
    for (let c = 0; c < line.length; c++) {
      const k = line[c];
      if (k === '.') continue;
      ctx.fillStyle = T(p.col[k]);
      ctx.fillRect(x + c * px, y + row * px, px + 0.6, px + 0.6);
    }
  }
}

// ------------------------------------------------------------------ calendar page (tear-off)
export function calendarPage(ctx, w, h, date, T) {
  const sunday = date.getDay() === 0;
  // backing card with a mustard header
  ctx.fillStyle = T('#C38F33');
  ctx.fillRect(0, 0, w, h * 0.2);
  ctx.fillStyle = T('#EFE5CF');
  ctx.fillRect(0, h * 0.2, w, h * 0.8);
  // previous pages: torn stubs along the header
  ctx.fillStyle = T('#E4D3AE');
  ctx.beginPath();
  ctx.moveTo(0, h * 0.2);
  for (let x = 0; x <= w; x += w / 14) ctx.lineTo(x, h * 0.2 + (x / (w / 14)) % 2 * h * 0.02 + h * 0.012);
  ctx.lineTo(w, h * 0.2); ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = T('#EFE5CF');
  ctx.font = `700 ${h * 0.085}px "Shantell Sans"`;
  ctx.fillText(`${BULAN[date.getMonth()].toUpperCase()} ${date.getFullYear()}`, w / 2, h * 0.135);
  ctx.fillStyle = T(sunday ? '#B04A3A' : '#2B1C14');
  ctx.font = `${h * 0.44}px "Alfa Slab One"`;
  ctx.fillText(String(date.getDate()), w / 2, h * 0.66);
  ctx.font = `800 ${h * 0.1}px "Shantell Sans"`;
  ctx.fillText(HARI[date.getDay()].toUpperCase(), w / 2, h * 0.8);
  ctx.fillStyle = T(sunday ? '#B04A3A' : '#5A4334');
  ctx.font = `500 ${h * 0.07}px "Shantell Sans"`;
  ctx.fillText(pasaran(date), w / 2, h * 0.9);
  // small printed rule
  ctx.fillStyle = T('#B04A3A');
  ctx.fillRect(w * 0.12, h * 0.835, w * 0.76, h * 0.008);
}

// ------------------------------------------------------------------ clock face
export function clockFace(ctx, R, date, T) {
  const c = R;
  ctx.fillStyle = T('#7E3B2B');
  circle(ctx, c, c, R); ctx.fill();
  ctx.fillStyle = T('#EFE5CF');
  circle(ctx, c, c, R * 0.84); ctx.fill();
  ctx.fillStyle = T('#E4D3AE');
  circle(ctx, c, c, R * 0.84); ctx.save(); ctx.clip();
  ctx.fillRect(c - R, c + R * 0.25, 2 * R, R); // the lower face is faded where the sun hit it for years
  ctx.restore();
  ctx.fillStyle = T('#2B1C14');
  ctx.strokeStyle = T('#2B1C14');
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    const r0 = R * (big ? 0.66 : 0.74), r1 = R * 0.79;
    ctx.lineWidth = big ? R * 0.045 : R * 0.016;
    ctx.beginPath(); ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); ctx.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); ctx.stroke();
  }
  ctx.font = `800 ${R * 0.26}px "Shantell Sans"`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [n, a] of [[12, 0], [3, 90], [6, 180], [9, 270]]) {
    const rr = R * 0.47, ang = (a * Math.PI) / 180;
    ctx.fillText(String(n), c + Math.sin(ang) * rr, c - Math.cos(ang) * rr + R * 0.02);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${R * 0.09}px "Shantell Sans"`;
  ctx.fillStyle = T('#7E3B2B');
  ctx.fillText('JAYA', c, c + R * 0.3);
  if (!clockFace.handsElsewhere) clockHands(ctx, R, date, T('#2B1C14'), T('#B04A3A'));
}

// Hands are drawn on their own little layer each minute, so the room needn't re-render.
export function clockHands(ctx, R, date, inkCol, pinCol) {
  const c = R;
  const hr = date.getHours() % 12 + date.getMinutes() / 60, mn = date.getMinutes();
  hand(ctx, c, c, (hr / 12) * Math.PI * 2, R * 0.42, R * 0.07, inkCol);
  hand(ctx, c, c, (mn / 60) * Math.PI * 2, R * 0.66, R * 0.045, inkCol);
  ctx.fillStyle = pinCol;
  circle(ctx, c, c, R * 0.06); ctx.fill();
}

function hand(ctx, cx, cy, a, len, w, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  const s = Math.sin(a), co = -Math.cos(a);
  const px = -co, py = s;
  ctx.moveTo(cx - s * len * 0.15 + px * w * 0.5, cy - co * len * 0.15 + py * w * 0.5);
  ctx.lineTo(cx + s * len, cy + co * len);
  ctx.lineTo(cx - s * len * 0.15 - px * w * 0.5, cy - co * len * 0.15 - py * w * 0.5);
  ctx.closePath(); ctx.fill();
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

// ------------------------------------------------------------------ the gig poster
export function poster(ctx, w, h, T) {
  ctx.fillStyle = T('#D9A441');
  ctx.fillRect(0, 0, w, h);
  // a big setting sun behind the singer, in bands (printed in two passes)
  ctx.fillStyle = T('#B04A3A');
  circle(ctx, w * 0.5, h * 0.46, w * 0.36); ctx.fill();
  ctx.fillStyle = T('#C9663F');
  ctx.save(); circle(ctx, w * 0.5, h * 0.46, w * 0.36); ctx.clip();
  for (let i = 0; i < 6; i++) ctx.fillRect(0, h * 0.46 + i * w * 0.07, w, w * 0.035);
  ctx.restore();
  // ground strip
  ctx.fillStyle = T('#34466A');
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  // the singer: pixel art, holding a guitar
  const px = w / 26;
  const singer = person(7, 'long');
  singer.col.C = '#3F6874'; singer.col.c = '#2F4E58';
  drawPerson(ctx, w * 0.5 - 6 * px, h * 0.2, px, singer, T);
  // guitar in pixels across the body
  const g = ['..wwww......', '.wwwwww.....', '.wwOwwwnnnnn', '.wwwwww.....', '..wwww......'];
  const gc = { w: '#C99A62', O: '#2B1C14', n: '#5E3826' };
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
    const k = g[r][c]; if (k === '.') continue;
    ctx.fillStyle = T(gc[k]); ctx.fillRect(w * 0.5 - 7 * px + c * px, h * 0.2 + 11 * px + r * px, px + 0.6, px + 0.6);
  }
  // title and the small print
  ctx.textAlign = 'center';
  ctx.fillStyle = T('#EFE5CF');
  ctx.font = `${w * 0.17}px "Alfa Slab One"`;
  ctx.fillText('LAGU SORE', w / 2, h * 0.76);
  ctx.font = `700 ${w * 0.055}px "Shantell Sans"`;
  ctx.fillStyle = T('#E2D1AE');
  ctx.fillText('akustik di teras belakang', w / 2, h * 0.835);
  ctx.font = `800 ${w * 0.06}px "Shantell Sans"`;
  ctx.fillStyle = T('#D9A441');
  ctx.fillText('SABTU · 19.00 · GRATIS', w / 2, h * 0.91);
  // fold creases from being kept in a pocket
  ctx.fillStyle = T('#B88F3A');
  ctx.fillRect(w * 0.497, 0, w * 0.006, h * 0.62);
  ctx.fillRect(0, h * 0.33, w, h * 0.005);
}

// ------------------------------------------------------------------ cork board contents
export function corkBoard(ctx, w, h, T, date) {
  const r = rng(808);
  // cork: base plus dense speckle
  ctx.fillStyle = T('#B98A57');
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = T(r() < 0.5 ? '#9C6E42' : '#CDA172');
    const s = 1 + r() * 2.2;
    ctx.fillRect(r() * w, r() * h, s, s * (0.6 + r() * 0.6));
  }
  const items = [];
  // a polaroid with two friends
  items.push(() => paper(ctx, 40, 50, 210, 240, -0.08, T('#F2EADB'), (c) => {
    c.fillStyle = T('#9FB8C8'); c.fillRect(16, 16, 178, 160);
    const a = person(11, 'hijab'), b = person(23, 'short');
    drawPerson(c, 30, 60, 6.5, a, T);
    drawPerson(c, 105, 52, 7, b, T);
    c.fillStyle = T('#5A4334'); c.font = `600 22px "Shantell Sans"`; c.fillText('pantai, 2024', 30, 214);
  }));
  // to-do list on lined paper
  items.push(() => paper(ctx, 290, 40, 230, 290, 0.05, T('#EFE5CF'), (c) => {
    c.fillStyle = T('#B6C5D5');
    for (let y = 60; y < 290; y += 30) c.fillRect(10, y, 210, 2);
    c.fillStyle = T('#B04A3A'); c.fillRect(34, 0, 2, 290);
    c.fillStyle = T('#2B1C14'); c.font = `700 24px "Shantell Sans"`;
    c.fillText('besok:', 44, 46);
    c.font = `500 21px "Shantell Sans"`;
    const todo = ['beli makanan kucing', 'balas email dosen', 'servis kipas', 'siram tanaman (udah)'];
    todo.forEach((t, i) => c.fillText(t, 44, 86 + i * 30));
  }));
  // a postcard: hills, a flat sun, sea
  items.push(() => paper(ctx, 570, 70, 300, 200, -0.04, T('#EFE5CF'), (c) => {
    c.fillStyle = T('#9FB8C8'); c.fillRect(12, 12, 276, 176);
    c.fillStyle = T('#E9B66A'); circle(c, 200, 80, 34); c.fill();
    c.fillStyle = T('#6F7A48'); c.beginPath(); c.moveTo(12, 130); c.quadraticCurveTo(90, 70, 170, 128); c.quadraticCurveTo(230, 100, 288, 120); c.lineTo(288, 188); c.lineTo(12, 188); c.fill();
    c.fillStyle = T('#3F6874'); c.fillRect(12, 156, 276, 32);
    c.fillStyle = T('#EFE5CF'); c.font = `800 26px "Shantell Sans"`; c.fillText('Salam dari Garut', 24, 44);
  }));
  // a concert ticket stub
  items.push(() => paper(ctx, 600, 330, 230, 90, 0.1, T('#B04A3A'), (c) => {
    c.fillStyle = T('#EFE5CF'); c.font = `22px "Alfa Slab One"`; c.fillText('ADMIT ONE', 18, 40);
    c.font = `600 17px "Shantell Sans"`; c.fillText('No. 0274 · festival kota', 18, 68);
    c.fillStyle = T('#86362A'); for (let y = 6; y < 90; y += 12) c.fillRect(196, y, 3, 6);
  }));
  // the cat, drawn on a sticky note
  items.push(() => paper(ctx, 870, 300, 170, 160, -0.12, T('#E6C766'), (c) => {
    c.strokeStyle = T('#2B1C14'); c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath(); c.ellipse(86, 100, 46, 32, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(52, 66, 24, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(34, 50); c.lineTo(36, 30); c.lineTo(50, 44); c.moveTo(56, 42); c.lineTo(68, 28); c.lineTo(72, 50); c.stroke();
    c.beginPath(); c.moveTo(130, 100); c.quadraticCurveTo(160, 80, 150, 50); c.stroke();
    c.fillStyle = T('#2B1C14'); c.font = `700 20px "Shantell Sans"`; c.fillText('si Oren', 88, 148);
  }));
  // a sticky note with a phone number
  items.push(() => paper(ctx, 880, 60, 160, 150, 0.08, T('#D9A9A0'), (c) => {
    c.fillStyle = T('#2B1C14'); c.font = `700 22px "Shantell Sans"`; c.fillText('Pak Kos', 18, 42);
    c.font = `500 20px "Shantell Sans"`; c.fillText('0812-xxxx', 18, 76); c.fillText('bayar tgl 5!', 18, 108);
  }));
  // a strip of photo-booth frames
  items.push(() => paper(ctx, 50, 330, 190, 250, 0.06, T('#EFE5CF'), (c) => {
    for (let i = 0; i < 2; i++) {
      c.fillStyle = T(i ? '#C9A27A' : '#A7B9C4'); c.fillRect(14, 14 + i * 116, 162, 104);
      drawPerson(c, 54 + i * 6, 20 + i * 116, 6.6, person(40 + i * 3, i ? 'glasses' : 'long'), T);
    }
  }));
  for (const draw of items) draw();
  // pins
  const pins = [[145, 64, '#B04A3A'], [405, 52, '#3F6874'], [720, 82, '#C38F33'], [715, 342, '#3F6874'], [955, 312, '#B04A3A'], [960, 70, '#6F7A48'], [145, 342, '#C38F33']];
  for (const [x, y, col] of pins) {
    ctx.fillStyle = T('#2B1C14'); circle(ctx, x + 3, y + 4, 10); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = T(col); circle(ctx, x, y, 10); ctx.fill();
    ctx.fillStyle = T('#EFE5CF'); circle(ctx, x - 3, y - 3, 3); ctx.fill();
  }
}

// A sheet of paper at (x, y) rotated by a, drawn by fn in its own coordinates.
function paper(ctx, x, y, w, h, a, col, fn) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(a); ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(43,28,20,0.28)';
  ctx.fillRect(5, 7, w, h); // stepped contact shadow
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, w, h);
  fn(ctx);
  ctx.restore();
}

// ------------------------------------------------------------------ the monitor's screen
export function screen(ctx, w, h, date) {
  ctx.fillStyle = '#1F3640';
  ctx.fillRect(0, 0, w, h);
  const cols = ['#7FB0A6', '#D9A441', '#C9805F', '#9FB8C8', '#E2D1AE'];
  const r = rng(99);
  let y = h * 0.1;
  ctx.font = `700 ${h * 0.07}px "Shantell Sans"`;
  ctx.fillStyle = '#E2D1AE';
  ctx.fillText('kamar.js', w * 0.06, y);
  y += h * 0.1;
  while (y < h * 0.92) {
    let x = w * 0.06 + (r() < 0.4 ? w * 0.06 : 0) + (r() < 0.2 ? w * 0.06 : 0);
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n && x < w * 0.9; i++) {
      const len = w * (0.06 + r() * 0.18);
      ctx.fillStyle = r.pick(cols);
      ctx.fillRect(x, y - h * 0.035, Math.min(len, w * 0.92 - x), h * 0.035);
      x += len + w * 0.025;
    }
    y += h * 0.075;
  }
  // a blinking caret
  ctx.fillStyle = '#E2D1AE';
  ctx.fillRect(w * 0.12, y - h * 0.11, w * 0.025, h * 0.05);
}
