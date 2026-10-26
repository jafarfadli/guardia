// Live print over the rendered room: today's calendar page, the clock's hands, and the sleeve
// of what's playing. Drawn with multiply over paper Blender already lit, so the sun patch and
// the shade fall across them like across everything else.
import { HARI, BULAN, pasaran, clockHands, fit } from './printed.js';

const INK = '#2B1C14';
const RED = '#B04A3A';

// The page is 310 × 470 with a 94-high mustard band on top (blender/textures.js). Every line
// is sized to leave a margin of about an eighth of the width on each side.
export function calendarPage(ctx, w, h, date) {
  const sunday = date.getDay() === 0;
  const sans = (wt) => (s) => `${wt} ${s}px "Shantell Sans"`;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  const month = `${BULAN[date.getMonth()].toUpperCase()} ${date.getFullYear()}`;
  const ms = fit(ctx, month, sans(800), h * 0.062, w * 0.72);
  ctx.fillText(month, w / 2, h * 0.1 + ms * 0.36);
  ctx.fillStyle = sunday ? RED : INK;
  fit(ctx, String(date.getDate()), (s) => `${s}px "Alfa Slab One"`, h * 0.32, w * 0.58);
  ctx.fillText(String(date.getDate()), w / 2, h * 0.58);
  fit(ctx, HARI[date.getDay()].toUpperCase(), sans(800), h * 0.075, w * 0.62);
  ctx.fillText(HARI[date.getDay()].toUpperCase(), w / 2, h * 0.745);
  ctx.fillStyle = RED;
  ctx.fillRect(w * 0.3, h * 0.78, w * 0.4, h * 0.008);
  ctx.fillStyle = sunday ? RED : '#5A4334';
  fit(ctx, pasaran(date), sans(600), h * 0.06, w * 0.6);
  ctx.fillText(pasaran(date), w / 2, h * 0.855);
}

export function hands(ctx, date) {
  clockHands(ctx, 200, date, INK, RED);
}

export function sleeve(ctx, w, np) {
  if (np && Array.isArray(np.art) && np.art.length) {
    const n = Math.round(Math.sqrt(np.art.length));
    const px = w / n;
    for (let i = 0; i < np.art.length; i++) {
      ctx.fillStyle = np.art[i];
      ctx.fillRect((i % n) * px, Math.floor(i / n) * px, px + 0.7, px + 0.7);
    }
    return;
  }
  // the house sleeve: a printed sun over the sea
  ctx.fillStyle = '#B04A3A';
  ctx.beginPath(); ctx.arc(w * 0.5, w * 0.54, w * 0.26, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#34466A';
  for (let i = 0; i < 5; i++) ctx.fillRect(0, w * 0.57 + i * w * 0.075, w, w * 0.04);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  fit(ctx, 'SENJA', (s) => `${s}px "Alfa Slab One"`, w * 0.12, w * 0.62);
  ctx.fillText('SENJA', w * 0.13, w * 0.24);
}

// Affine map from a local w × h drawing space onto a screen quad [TL, TR, BR, BL] (pixels).
export function onQuad(ctx, quad, w, h, draw) {
  const [tl, tr, , bl] = quad;
  ctx.save();
  ctx.setTransform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]);
  draw(ctx);
  ctx.restore();
}
