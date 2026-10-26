// Dust motes that glow only where the sun's beam passes (DESIGN.md: LIGHT).
// The beam's outline on screen (from the render) clips a layer of motes animated purely in
// CSS, so the compositor moves them and no script runs per frame.
import { rng } from './math.js';

const N = 46;

export class Dust {
  constructor(el) {
    this.el = el;
    const r = rng(2024);
    const css = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement('i');
      const size = 2.5 + r() * 5;
      const dur = 18 + r() * 26, delay = -r() * dur;
      const tw = 2.5 + r() * 4;
      d.style.cssText = `left:${(r() * 100).toFixed(2)}%;top:${(r() * 100).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
        `animation:kd${i % 6} ${dur.toFixed(1)}s ${delay.toFixed(1)}s linear infinite alternate, kt ${tw.toFixed(1)}s ${(-r() * tw).toFixed(1)}s ease-in-out infinite alternate;`;
      el.appendChild(d);
    }
    for (let k = 0; k < 6; k++) {
      const p = rng(k * 31 + 7);
      const pts = Array.from({ length: 3 }, () => `${((p() - 0.5) * 90).toFixed(0)}px,${((p() - 0.3) * 70).toFixed(0)}px`);
      css.push(`@keyframes kd${k}{0%{transform:translate(0,0)}33%{transform:translate(${pts[0]})}66%{transform:translate(${pts[1]})}100%{transform:translate(${pts[2]})}}`);
    }
    css.push('@keyframes kt{0%{opacity:.25}100%{opacity:1}}');
    const st = document.createElement('style');
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }

  // points: the beam's corners on screen, in CSS px
  setup(points, intensity) {
    const H = hull(points);
    if (intensity <= 0.02 || H.length < 3) { this.el.style.display = 'none'; return; }
    const xs = H.map((q) => q[0]), ys = H.map((q) => q[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    Object.assign(this.el.style, {
      display: 'block', left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px',
      clipPath: `polygon(${H.map(([x, y]) => `${(x - box.x).toFixed(1)}px ${(y - box.y).toFixed(1)}px`).join(',')})`,
      opacity: String(Math.min(1, intensity)),
    });
  }
}

export function hull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
