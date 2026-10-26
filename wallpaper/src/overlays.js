// Live print over the rendered room: today's calendar page, the clock's hands, and the sleeve
// of what's playing. Drawn with multiply over paper Blender already lit, so the sun patch and
// the shade fall across them like across everything else.
import { HARI, BULAN, pasaran, clockHands } from './printed.js';

const INK = '#2B1C14';
const RED = '#B04A3A';

export function calendarPage(ctx, w, h, date) {
  const sunday = date.getDay() === 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 ${h * 0.085}px "Shantell Sans"`;
  ctx.fillText(`${BULAN[date.getMonth()].toUpperCase()} ${date.getFullYear()}`, w / 2, h * 0.135);
  ctx.fillStyle = sunday ? RED : INK;
  ctx.font = `${h * 0.42}px "Alfa Slab One"`;
  ctx.fillText(String(date.getDate()), w / 2, h * 0.64);
  ctx.font = `800 ${h * 0.1}px "Shantell Sans"`;
  ctx.fillText(HARI[date.getDay()].toUpperCase(), w / 2, h * 0.79);
  ctx.fillStyle = RED;
  ctx.fillRect(w * 0.14, h * 0.825, w * 0.72, h * 0.009);
  ctx.fillStyle = sunday ? RED : '#5A4334';
  ctx.font = `600 ${h * 0.075}px "Shantell Sans"`;
  ctx.fillText(pasaran(date), w / 2, h * 0.9);
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
  ctx.font = `${w * 0.13}px "Alfa Slab One"`;
  ctx.fillText('SENJA', w * 0.08, w * 0.2);
}

// Affine map from a local w × h drawing space onto a screen quad [TL, TR, BR, BL] (pixels).
export function onQuad(ctx, quad, w, h, draw) {
  const [tl, tr, , bl] = quad;
  ctx.save();
  ctx.setTransform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]);
  draw(ctx);
  ctx.restore();
}
