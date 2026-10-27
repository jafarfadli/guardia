// Faded print grade (DESIGN.md layer 3) as a WebGL2 post-process.
// Static work (split tone, lifted blacks, glow, paper, vignette) is baked once per
// scene update into a texture; each frame only adds film grain on top.

const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

const BRIGHT = COMMON + `
uniform sampler2D uTex; uniform float uThresh;
void main(){ vec3 c = texture(uTex, vUv).rgb; float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float k = smoothstep(uThresh, uThresh + 0.1, l); o = vec4(c * k, 1.0); }`;

const BLUR = COMMON + `
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 s = texture(uTex, vUv).rgb * 0.227027;
  s += texture(uTex, vUv + uDir * 1.3846).rgb * 0.316216; s += texture(uTex, vUv - uDir * 1.3846).rgb * 0.316216;
  s += texture(uTex, vUv + uDir * 3.2308).rgb * 0.070270; s += texture(uTex, vUv - uDir * 3.2308).rgb * 0.070270;
  o = vec4(s, 1.0); }`;

const GRADE = COMMON + `
uniform sampler2D uScene, uGlow;
uniform vec2 uRes;
uniform vec3 uLift, uShadow, uHigh, uGlowCol, uVig, uPaper;
uniform float uSplit, uWarm, uContrast, uGreen, uGlowK, uVigK, uPaperK, uPaperGrain, uInkSkip, uSeed, uCool;
vec3 softLight(vec3 a, vec3 b){
  return mix(2.0*a*b + a*a*(1.0-2.0*b), 2.0*a*(1.0-b) + sqrt(max(a, 0.0))*(2.0*b-1.0), step(0.5, b)); }
void main(){
  vec2 px = vUv * uRes;
  vec3 c = texture(uScene, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // dry-ink: dark ink skips a little where the paper fibres are high
  // paper mottling, the same in every direction: stretched noise read as horizontal stripes
  float fib = fbm(px * 0.016 + uSeed);
  float fib2 = vnoise(px * 0.35 + uSeed * 3.0);
  float inkMask = 1.0 - smoothstep(0.05, 0.13, l);
  c = mix(c, c + vec3(0.10, 0.075, 0.05), inkMask * uInkSkip * smoothstep(0.55, 0.85, fib * 0.6 + fib2 * 0.6));
  // muted greens
  float g = c.g - max(c.r, c.b);
  c = mix(c, vec3(l) * vec3(1.02, 1.0, 0.94), uGreen * smoothstep(0.0, 0.10, g));
  // split tone: blue-grey shadows, warm orange highlights
  vec3 tint = mix(uShadow, mix(uHigh, vec3(0.86, 0.87, 0.88), uCool), smoothstep(0.16, 0.80, l));
  c = mix(c, softLight(clamp(c, 0.0, 1.0), tint), uSplit);
  // overall warmth and a mild contrast
  c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.25, 1.0 - uWarm * 1.3);
  c = (c - 0.46) * uContrast + 0.46;
  // soft warm glow only on the brightest spots
  vec3 gl = texture(uGlow, vUv).rgb;
  c += gl * uGlowCol * uGlowK;
  // paper: warm tint and an even mottled grain
  c = mix(c, c * uPaper, uPaperK);
  float grain = (fib - 0.5) * 1.6 + (fib2 - 0.5) * 0.6;
  c *= 1.0 + grain * uPaperGrain;
  // lifted blacks: the darkest tone is a warm dark grey-brown
  c = uLift + (1.0 - uLift) * clamp(c, 0.0, 1.2);
  // faint brown vignette
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.42, 1.0, length(q) * 1.18);
  c = mix(c, uVig, v * uVigK);
  o = vec4(c, 1.0);
}`;

const FINAL = COMMON + `
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime, uGrain;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  vec2 px = floor(vUv * uRes / 2.0); // whole 2-px cells: 1.5-px cells beat into a fine grid
  float t = floor(uTime * 12.0);
  float n = hash(px + vec2(t * 17.31, t * 41.73)) - 0.5;
  float n2 = hash(px.yx * 1.7 + vec2(t * 3.1, 7.7)) - 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = uGrain * (0.55 + 0.9 * l * (1.0 - l) * 2.0);
  c += vec3(n) * k + vec3(n2, n2 * 0.6, -n2 * 0.4) * k * 0.25;
  o = vec4(c, 1.0);
}`;

function hex3(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

export class Grader {
  constructor(canvas, tokens) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl; this.canvas = canvas; this.t = tokens;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.prog = {
      bright: this.program(BRIGHT), blur: this.program(BLUR), grade: this.program(GRADE), final: this.program(FINAL),
    };
    this.sceneTex = this.tex();
  }

  program(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  tex(w = 1, h = 1) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  target(w, h) {
    const gl = this.gl;
    const tex = this.tex(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    this.qa = this.target(qw, qh); this.qb = this.target(qw, qh);
    this.baked = this.target(w, h);
  }

  run(prog, target, uniforms, textures) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
    let unit = 0;
    for (const [name, tex] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u[name], unit++);
    }
    for (const [name, v] of Object.entries(uniforms)) {
      const loc = prog.u[name];
      if (loc == null) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else gl.uniform3fv(loc, v);
    }
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Bake the graded still from a 2D scene canvas.
  bake(sceneCanvas, look = {}) {
    const gl = this.gl;
    const w = sceneCanvas.width, h = sceneCanvas.height;
    this.resize(w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const G = this.t.grade;
    // glow: bright pass, then two blur rounds at quarter resolution
    this.run(this.prog.bright, this.qa, { uThresh: look.glowThresh ?? 0.78 }, { uTex: this.sceneTex });
    for (let i = 0; i < 3; i++) {
      const r = 1 + i * 1.5;
      this.run(this.prog.blur, this.qb, { uDir: [r / this.qa.w, 0] }, { uTex: this.qa.tex });
      this.run(this.prog.blur, this.qa, { uDir: [0, r / this.qa.h] }, { uTex: this.qb.tex });
    }
    const warm = G.warmth + (look.warm ?? 0) - (look.cool ?? 0) * 0.045;
    this.run(this.prog.grade, this.baked, {
      uRes: [w, h],
      uLift: hex3(G.lift), uShadow: hex3(G.shadowTint), uHigh: hex3(G.highlightTint),
      uGlowCol: hex3(G.glowColor), uVig: hex3(G.vignette), uPaper: hex3(G.paperTint),
      uSplit: G.splitStrength, uWarm: warm, uContrast: G.contrast, uGreen: G.greenMute,
      uGlowK: G.glowStrength * (look.glow ?? 1), uVigK: G.vignetteStrength, uPaperK: G.paperTintStrength,
      uPaperGrain: G.paperGrain, uInkSkip: look.inkSkip ?? 0.55, uSeed: 3.7, uCool: look.cool ?? 0,
    }, { uScene: this.sceneTex, uGlow: this.qa.tex });
  }

  frame(time) {
    this.run(this.prog.final, null, { uRes: [this.w, this.h], uTime: time, uGrain: this.t.grade.filmGrain }, { uTex: this.baked.tex });
  }
}
