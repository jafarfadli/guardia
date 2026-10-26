// Dust motes that glow only where the sun's beam passes (DESIGN.md: LIGHT).
// A mote is lit when tracing it back toward the sun lands inside a window pane.
import { rng, noise1, dot } from './math.js';
import { WIN } from './room.js';

export class Dust {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const r = rng(2024);
    this.motes = [];
    for (let i = 0; i < 700; i++) {
      this.motes.push({
        p: [0.2 + r() * 4.6, 0.1 + r() * 2.4, 1.6 + r() * 3.4],
        s: 0.5 + r() * 1.3, ph: r() * 100, sp: 0.4 + r() * 0.8,
      });
    }
  }

  setup({ cam, panes, S, intensity, dpr, W, H }) {
    this.cam = cam; this.panes = panes; this.S = S; this.k = intensity; this.dpr = dpr;
    this.canvas.width = W; this.canvas.height = H;
  }

  inBeam(p) {
    const S = this.S;
    if (S[0] >= -0.01) return false;
    const t = (WIN.glassX - p[0]) / S[0];
    if (t <= 0) return false;
    const y = p[1] + S[1] * t, z = p[2] + S[2] * t;
    for (const q of this.panes) {
      const ys = q.map((v) => v[1]), zs = q.map((v) => v[2]);
      if (y > Math.min(...ys) && y < Math.max(...ys) && z > Math.min(...zs) && z < Math.max(...zs)) return true;
    }
    return false;
  }

  draw(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.cam || this.k <= 0.02) return;
    for (const m of this.motes) {
      // slow brownian drift with a lazy downward settle and an updraft near the warm floor patch
      const t = time * 0.05 * m.sp;
      const p = [
        m.p[0] + 0.35 * noise1(t + m.ph, 1),
        m.p[1] + 0.25 * noise1(t * 0.8 + m.ph, 2) + 0.15 * Math.sin(t * 0.7 + m.ph),
        m.p[2] + 0.35 * noise1(t * 0.9 + m.ph, 3),
      ];
      if (!this.inBeam(p)) continue;
      const q = this.cam.project(p);
      if (q[2] <= 0.1) continue;
      const tw = 0.55 + 0.45 * Math.sin(time * (1.3 + m.sp) + m.ph * 7);
      const r = (0.7 + m.s * 1.3) * Math.min(1.6, Math.max(0.55, 3.2 / q[2])) * this.dpr;
      const a = Math.min(1, 3.2 / q[2]) * (0.35 + 0.65 * tw) * this.k;
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.2);
      g.addColorStop(0, `rgba(255,236,200,${0.95 * a})`);
      g.addColorStop(0.4, `rgba(255,214,160,${0.5 * a})`);
      g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(q[0] - r * 2.2, q[1] - r * 2.2, r * 4.4, r * 4.4);
    }
  }
}
