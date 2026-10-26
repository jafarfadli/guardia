// Dust motes that glow only where the sun's beam passes (DESIGN.md: LIGHT).
// The beam's outline on screen clips a layer of motes animated purely in CSS, so the
// compositor moves them and no script runs per frame.
import { rng, add, mul, rayPlane } from './math.js';
import { hull } from './painter.js';
import { ROOM } from './room.js';

const N = 46;

export class Dust {
  constructor(el) {
    this.el = el;
    this.k = 0;
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
    // six drift paths, slow and lazy, mostly sinking
    for (let k = 0; k < 6; k++) {
      const p = rng(k * 31 + 7);
      const pts = Array.from({ length: 4 }, () => `${((p() - 0.5) * 90).toFixed(0)}px,${((p() - 0.3) * 70).toFixed(0)}px`);
      css.push(`@keyframes kd${k}{0%{transform:translate(0,0)}33%{transform:translate(${pts[0]})}66%{transform:translate(${pts[1]})}100%{transform:translate(${pts[2]})}}`);
    }
    css.push('@keyframes kt{0%{opacity:.25}100%{opacity:1}}');
    const st = document.createElement('style');
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }

  // Outline of the beam on screen: the window panes plus where their light lands.
  setup({ cam, panes, S, intensity, dpr }) {
    this.k = intensity;
    if (intensity <= 0.02) { this.el.style.display = 'none'; return; }
    const D = mul(S, -1);
    const pts = [];
    for (const pane of panes) {
      for (const p of pane) {
        pts.push(cam.project(p));
        const hits = [
          rayPlane(p, D, [0, 1, 0], 0),            // floor
          rayPlane(p, D, [0, 0, -1], -ROOM.d),     // back wall
        ].filter((h) => h && h[1] >= -0.01 && h[2] <= ROOM.d + 0.01);
        for (const h of hits) pts.push(cam.project(h));
      }
    }
    const H = hull(pts.filter((q) => q[2] > 0.1));
    if (H.length < 3) { this.el.style.display = 'none'; return; }
    const poly = H.map(([x, y]) => `${(x / dpr).toFixed(1)}px ${(y / dpr).toFixed(1)}px`).join(',');
    const xs = H.map((q) => q[0] / dpr), ys = H.map((q) => q[1] / dpr);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    Object.assign(this.el.style, {
      display: 'block', left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px',
      clipPath: `polygon(${H.map(([x, y]) => `${(x / dpr - box.x).toFixed(1)}px ${(y / dpr - box.y).toFixed(1)}px`).join(',')})`,
      opacity: String(Math.min(1, intensity)),
    });
    void poly;
  }
}
