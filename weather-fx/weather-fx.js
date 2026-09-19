/*!
 * WeatherFX 2.0 — biblioteca de efectos climáticos para mesas virtuales.
 * Requiere PixiJS 7.  MIT.
 *
 *   <script src="pixi.min.js"></script>
 *   <script src="weather-fx.js"></script>
 *   const fx = new WeatherFX({ container, source: miCanvas2D });
 *   fx.use('rain');
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('pixi.js'));
  else if (typeof define === 'function' && define.amd) define(['pixi.js'], factory);
  else root.WeatherFX = factory(root.PIXI);
}(typeof self !== 'undefined' ? self : this, function (PIXI) {
'use strict';


/* =====================================================================
   WeatherFX 2 — efectos ambientales para mesas virtuales.  PixiJS 7.

   El agua ya no son anillos dibujados: es una malla donde se integra la
   ecuación de onda cada paso (esquema clásico altura/velocidad, el mismo
   que usa jquery.ripples). De esa malla sale un mapa de normales, y el
   shader desplaza el tablero según esas normales. Por eso las ondas se
   propagan a velocidad finita, se amortiguan, rebotan en los bordes y se
   suman entre sí cuando dos gotas caen cerca.

   La simulación corre en CPU sobre una malla pequeña (~180 de alto). Es
   barata y no depende de texturas de coma flotante, que en WebGL siguen
   detrás de extensiones.
   ===================================================================== */

class WaterSim {
  constructor(shortSide = 180){
    this.shortSide = shortSide;
    this.setSize(2, 2, 1, 1);
  }
  setSize(screenW, screenH, gw, gh){
    this.screenW = screenW; this.screenH = screenH;
    this.gw = gw; this.gh = gh;
    const n = gw * gh;
    this.height = new Float32Array(n);
    this.vel = new Float32Array(n);
    this.pixels = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) this.pixels[i * 4 + 3] = 255;
    this.acc = 0;
    this.dirty = 0;
  }
  fit(screenW, screenH){
    const gh = this.shortSide;
    const gw = Math.max(48, Math.min(460, Math.round(gh * screenW / Math.max(1, screenH))));
    if (gw !== this.gw || gh !== this.gh || screenW !== this.screenW || screenH !== this.screenH)
      this.setSize(screenW, screenH, gw, gh);
  }

  // u, v normalizados; radius y strength en píxeles de pantalla / amplitud
  drop(u, v, radiusPx, strength){
    const { gw, gh, height } = this;
    const r = Math.max(1.3, radiusPx * gh / this.screenH);
    const cx = u * gw, cy = v * gh;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(gw - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(gh - 2, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++){
      for (let x = x0; x <= x1; x++){
        const d = Math.hypot(x + .5 - cx, y + .5 - cy);
        if (d > r) continue;
        // perfil coseno: el centro se hunde suavemente en vez de un pico duro
        const k = .5 - Math.cos((1 - d / r) * Math.PI) * .5;
        height[y * gw + x] += k * strength;
      }
    }
    this.dirty = 600;   // frames pendientes: de sobra para que la onda muera
  }

  // `flatten` devuelve la superficie a su nivel. Sin esto, al frenarse la
  // velocidad el bulto de la gota se queda clavado en el sitio.
  step(damping, flatten){
    const { gw, gh, height, vel } = this;
    for (let y = 1; y < gh - 1; y++){
      const row = y * gw;
      for (let x = 1; x < gw - 1; x++){
        const i = row + x;
        const avg = (height[i - 1] + height[i + 1] + height[i - gw] + height[i + gw]) * .25;
        vel[i] = (vel[i] + (avg - height[i]) * 2) * damping;
      }
    }
    for (let y = 1; y < gh - 1; y++){
      const row = y * gw;
      for (let x = 1; x < gw - 1; x++){
        const i = row + x;
        height[i] = (height[i] + vel[i]) * flatten;
      }
    }
  }

  // Empaqueta el gradiente como mapa de normales: RG = pendiente, B = altura.
  bake(nScale){
    const { gw, gh, height, pixels } = this;
    // el borde se deja en nivel cero explícitamente, si no queda basura
    for (let i = 0; i < gw * gh; i++){
      const p = i * 4;
      pixels[p] = 128; pixels[p + 1] = 128; pixels[p + 2] = 128;
    }
    for (let y = 1; y < gh - 1; y++){
      const row = y * gw;
      for (let x = 1; x < gw - 1; x++){
        const i = row + x, p = i * 4;
        let nx = (height[i - 1] - height[i + 1]) * nScale;
        let ny = (height[i - gw] - height[i + gw]) * nScale;
        nx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
        ny = ny < -1 ? -1 : ny > 1 ? 1 : ny;
        let h = height[i] * nScale * .5;
        h = h < -1 ? -1 : h > 1 ? 1 : h;
        pixels[p] = 128 + nx * 127;
        pixels[p + 1] = 128 + ny * 127;
        pixels[p + 2] = 128 + h * 127;
      }
    }
  }

  // Pasos de tamaño fijo: la velocidad de la onda no debe depender del framerate.
  // Si nadie ha tirado una gota hace rato, la malla se apaga sola.
  advance(dt, damping, flatten, nScale, speedMul){
    if (this.dirty <= 0) return 0;
    this.acc += dt * speedMul;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 3){ this.acc -= 1 / 60; this.step(damping, flatten); steps++; }
    if (steps){
      this.dirty -= steps;
      if (this.dirty <= 0){ this.height.fill(0); this.vel.fill(0); }
      this.bake(nScale);
    }
    return steps;
  }
  clear(){ this.height.fill(0); this.vel.fill(0); this.dirty = 1; this.bake(1); this.dirty = 0; }
}

/* ------------------------------------------------------------- shaders */

const NOISE_GLSL = `
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

/* El área de los filtros se fija a la pantalla con padding 0, así
   vTextureCoord recorre 0..1 sobre la escena y no hay que corregir nada. */
const REFRACT_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform sampler2D uWater;
uniform vec2 uScreen;
uniform float uTime;
uniform float uPerturbance;
uniform float uSpecular;
uniform float uWet;
uniform float uTurbAmp;
uniform float uTurbScale;
uniform float uTurbSpeed;
uniform vec2  uTurbDir;
uniform float uChroma;
${NOISE_GLSL}
void main(){
  vec2 uv = vTextureCoord;

  vec3 w = texture2D(uWater, uv).rgb * 2.0 - 1.0;   // rg = pendiente, b = altura
  vec2 slope = w.xy;

  vec2 turb = vec2(0.0);
  if (uTurbAmp > 0.01){
    vec2 np = uv * uTurbScale + uTurbDir * uTime * uTurbSpeed;
    turb = (vec2(fbm(np), fbm(np + vec2(5.2, 1.3))) - 0.5) * 2.0;
  }

  vec2 offsetUV = (slope * uPerturbance + turb * uTurbAmp) / uScreen;
  vec2 c0 = clamp(uv + offsetUV, vec2(0.0015), vec2(0.9985));

  vec4 base = texture2D(uSampler, c0);
  vec3 col = base.rgb;
  if (uChroma > 0.001){
    vec2 d = offsetUV * uChroma;
    col.r = texture2D(uSampler, clamp(c0 + d, vec2(0.0015), vec2(0.9985))).r;
    col.b = texture2D(uSampler, clamp(c0 - d, vec2(0.0015), vec2(0.9985))).b;
  }

  // superficie mojada: oscurece un poco y sube el contraste local
  if (uWet > 0.001) col = mix(col, col * col * 1.35, uWet * 0.55);

  // brillo especular sobre la pendiente, como en el agua real
  vec3 n = normalize(vec3(slope.x, 0.42, slope.y));
  vec3 light = normalize(vec3(-0.35, 0.72, -0.60));
  float spec = pow(max(dot(n, light), 0.0), 34.0) * uSpecular;
  col += spec * vec3(0.70, 0.82, 0.90) * base.a;

  gl_FragColor = vec4(col, base.a);
}`;

const GRADE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime, uSat, uBright, uContrast, uTintAmt;
uniform vec3  uTint, uFogColor;
uniform float uFog, uFogScale, uFogSpeed, uFlash, uVignette, uGrain;
uniform vec2  uFogDir;
${NOISE_GLSL}
void main(){
  vec2 uv = vTextureCoord;
  vec4 s = texture2D(uSampler, uv);
  vec3 c = s.a > 0.002 ? s.rgb / s.a : vec3(0.0);

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= uBright;
  c = mix(c, uTint * (l * 0.65 + 0.35), uTintAmt);

  float d = 0.0;
  if (uFog > 0.001){
    vec2 p = uv * uFogScale + uFogDir * uTime * uFogSpeed;
    float n = fbm(p) * 0.62 + fbm(p * 2.7 - uFogDir * uTime * uFogSpeed * 1.9) * 0.38;
    d = clamp(uFog * (0.45 + 1.25 * n), 0.0, 0.97);
    c = mix(c, uFogColor, d);
  }

  c *= clamp(1.0 - uVignette * pow(length(uv - 0.5) * 1.42, 2.4), 0.0, 1.0);
  c += uFlash * vec3(0.86, 0.92, 1.0);
  if (uGrain > 0.001) c += (hash21(uv * 900.0 + fract(uTime) * 91.7) - 0.5) * uGrain;

  float a = max(s.a, d * 0.92);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

/* ------------------------------------------------------------ texturas */

function buildAtlas(){
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d');
  const cell = (cx, cy, draw) => { g.save(); g.translate(cx * C, cy * C); draw(g); g.restore(); };
  const radial = (ctx, r, stops) => {
    const grd = ctx.createRadialGradient(C / 2, C / 2, 0, C / 2, C / 2, r);
    stops.forEach(s => grd.addColorStop(s[0], s[1]));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, C, C);
  };

  cell(0, 0, ctx => radial(ctx, C / 2, [[0, 'rgba(255,255,255,.95)'], [.45, 'rgba(255,255,255,.32)'], [1, 'rgba(255,255,255,0)']]));
  cell(1, 0, ctx => {
    radial(ctx, C / 2.6, [[0, 'rgba(255,255,255,.85)'], [.5, 'rgba(255,255,255,.20)'], [1, 'rgba(255,255,255,0)']]);
    ctx.translate(C / 2, C / 2); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++){
      ctx.rotate(Math.PI / 3);
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -C / 2.5); ctx.stroke();
      ctx.lineWidth = 3.5; ctx.beginPath();
      ctx.moveTo(0, -C / 4.2); ctx.lineTo(-9, -C / 3.1);
      ctx.moveTo(0, -C / 4.2); ctx.lineTo(9, -C / 3.1); ctx.stroke();
    }
  });
  cell(2, 0, ctx => radial(ctx, C / 2, [[0, 'rgba(255,255,255,1)'], [.12, 'rgba(255,226,170,.85)'], [.4, 'rgba(255,150,60,.25)'], [1, 'rgba(255,120,40,0)']]));
  cell(3, 0, ctx => radial(ctx, C / 3.4, [[0, 'rgba(255,255,255,1)'], [.62, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]));
  // La marca debe ocupar casi toda la celda: el sprite se escala luego a uno o
  // dos píxeles de ancho, y lo que no llene la celda desaparece al reducirlo.
  cell(0, 1, ctx => {
    const grd = ctx.createLinearGradient(0, 0, 0, C);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(.26, 'rgba(255,255,255,.5)');
    grd.addColorStop(.84, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.filter = 'blur(8px)';
    ctx.fillRect(C * .2, 8, C * .6, C - 16);
  });
  cell(1, 1, ctx => {
    ctx.translate(C / 2, C / 2);
    const grd = ctx.createLinearGradient(0, -C / 2, 0, C / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(.5, 'rgba(255,255,255,.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.filter = 'blur(7px)';
    ctx.beginPath(); ctx.ellipse(0, 0, C * .26, C * .44, 0, 0, 6.283); ctx.fill();
  });
  cell(2, 1, ctx => radial(ctx, C / 2, [[0, 'rgba(255,255,255,1)'], [.2, 'rgba(230,215,255,.55)'], [.55, 'rgba(160,120,255,.14)'], [1, 'rgba(120,80,255,0)']]));

  const base = PIXI.BaseTexture.from(cv);
  base.scaleMode = PIXI.SCALE_MODES.LINEAR;
  const frame = (cx, cy) => new PIXI.Texture(base, new PIXI.Rectangle(cx * C, cy * C, C, C));
  return {
    soft: frame(0, 0), flake: frame(1, 0), glow: frame(2, 0), grain: frame(3, 0),
    streak: frame(0, 1), shard: frame(1, 1), mote: frame(2, 1)
  };
}

/* --------------------------------------------------------------- motor */

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

class WeatherFX {
  static effects = new Map();
  static register(def){
    // `particles` es el atajo de una sola capa; internamente siempre son capas
    def.layers = def.layers || (def.particles ? [def.particles] : null);
    WeatherFX.effects.set(def.id, def);
    return def;
  }
  static list(){ return [...WeatherFX.effects.values()]; }

  constructor({ container, source = null, maxParticles = 2400, gridSize = 180, resolution } = {}){
    this.container = container;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.maxParticles = this.reduced ? Math.min(500, maxParticles) : maxParticles;

    this.app = new PIXI.Application({
      resizeTo: container, antialias: false, backgroundAlpha: 0,
      powerPreference: 'high-performance', autoDensity: true,
      resolution: resolution || Math.min(devicePixelRatio || 1, 2)
    });
    container.appendChild(this.app.view);

    this.tex = buildAtlas();
    this.w = this.app.screen.width;
    this.h = this.app.screen.height;

    this.scene = new PIXI.Container();
    this.world = new PIXI.Container();
    this.particles = new PIXI.Container();
    this.bolts = new PIXI.Graphics();
    this.bolts.blendMode = PIXI.BLEND_MODES.ADD;
    this.scene.addChild(this.world, this.particles, this.bolts);
    this.app.stage.addChild(this.scene);

    /* agua */
    this.sim = new WaterSim(this.reduced ? 120 : gridSize);
    this.sim.fit(this.w, this.h);
    this.waterTex = PIXI.Texture.fromBuffer(this.sim.pixels, this.sim.gw, this.sim.gh, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      format: PIXI.FORMATS.RGBA,
      type: PIXI.TYPES.UNSIGNED_BYTE
    });
    this.waterTex.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;

    /* filtros */
    this.refract = new PIXI.Filter(undefined, REFRACT_FRAG, {
      uWater: this.waterTex, uScreen: new Float32Array([this.w, this.h]), uTime: 0,
      uPerturbance: 55, uSpecular: .8, uWet: 0,
      uTurbAmp: 0, uTurbScale: 5, uTurbSpeed: .06,
      uTurbDir: new Float32Array([1, .3]), uChroma: 0
    });
    this.grade = new PIXI.Filter(undefined, GRADE_FRAG, {
      uTime: 0, uSat: 1, uBright: 1, uContrast: 1,
      uTint: new Float32Array([1, 1, 1]), uTintAmt: 0,
      uFogColor: new Float32Array([.6, .65, .68]), uFog: 0, uFogScale: 3, uFogSpeed: .05,
      uFogDir: new Float32Array([1, .2]), uFlash: 0, uVignette: .2, uGrain: .012
    });
    for (const f of [this.refract, this.grade]){ f.padding = 0; f.autoFit = false; }
    this.world.filters = [this.refract];
    this.scene.filters = [this.grade];

    this.mapSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.world.addChildAt(this.mapSprite, 0);
    if (source) this.setSource(source);

    this.pool = [];
    this.items = [];
    this.groups = [];
    this.active = 0;
    this.gust = 1;
    this.time = 0;
    this.paused = false;
    this.def = null;
    this.params = { intensity: .6, speed: 1, wind: .2, drops: 1, refraction: 1 };
    this._dropDebt = 0;
    this._boltTimer = 1e9;
    this._flashTimer = 1e9;
    this._flashSeq = null;
    this._flashT = 0;
    this._flash = 0;
    this._shake = 0;

    this.resize();
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    this.app.ticker.add(() => this._tick(this.app.ticker.deltaMS));
  }

  /* ---- API ---- */

  setSource(canvas){
    this.source = canvas;
    this.sourceTexture = PIXI.Texture.from(canvas);
    this.mapSprite.texture = this.sourceTexture;
    this._fitMap();
  }
  invalidateSource(){ if (this.sourceTexture) this.sourceTexture.baseTexture.update(); }

  use(id, overrides = {}){
    const def = WeatherFX.effects.get(id);
    if (!def) throw new Error('Efecto desconocido: ' + id);
    this.def = def;
    Object.assign(this.params, def.base || {}, overrides);
    this.sim.clear();
    this._uploadWater();
    this._applyLook();
    this._rebuild();
    this._boltTimer = def.lightning ? rnd(def.lightning.min, def.lightning.max) : 1e9;
    this._flashTimer = def.flashes ? rnd(def.flashes.min, def.flashes.max) : 1e9;
    return this;
  }
  set(p = {}){
    Object.assign(this.params, p);
    this._applyLook();
    if ('intensity' in p) this._applyCount();
    return this;
  }
  pause(v = true){ this.paused = v; return this; }
  toggle(){ this.paused = !this.paused; return this.paused; }

  /** Deja caer una gota en coordenadas de pantalla. */
  drop(x, y, { radius = 20, strength = 1 } = {}){
    const w = this.def && this.def.water;
    this.sim.drop(x / this.w, y / this.h, radius, strength * (w ? w.amplitude : .10));
    return this;
  }

  strike(){
    this._drawBolt();
    this._flashSeq = [[0, .62], [.05, .09], [.10, .42], [.17, .04], [.26, .20], [.55, 0]];
    this._flashT = 0;
    this._shake = this.reduced ? 0 : 1;
    return this;
  }

  /** Fogonazo lejano: ilumina el cielo, no se ve el rayo ni sacude nada. */
  sheetFlash(){
    this.bolts.clear();
    this._flashSeq = [[0, .16], [.08, .04], [.15, .11], [.50, 0]];
    this._flashT = 0;
    return this;
  }

  resize(){
    this.w = this.app.screen.width;
    this.h = this.app.screen.height;
    const area = new PIXI.Rectangle(0, 0, this.w, this.h);
    this.world.filterArea = area;
    this.scene.filterArea = area;
    this.refract.uniforms.uScreen[0] = this.w;
    this.refract.uniforms.uScreen[1] = this.h;

    const gw = this.sim.gw, gh = this.sim.gh;
    this.sim.fit(this.w, this.h);
    if (this.sim.gw !== gw || this.sim.gh !== gh){
      this.waterTex.destroy(true);
      this.waterTex = PIXI.Texture.fromBuffer(this.sim.pixels, this.sim.gw, this.sim.gh, {
        scaleMode: PIXI.SCALE_MODES.LINEAR,
        format: PIXI.FORMATS.RGBA,
        type: PIXI.TYPES.UNSIGNED_BYTE
      });
      this.waterTex.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;
      this.refract.uniforms.uWater = this.waterTex;
    }
    if (this.sourceTexture) this._fitMap();
  }

  destroy(){
    removeEventListener('resize', this._onResize);
    this.app.destroy(true, { children: true });
  }

  /* ---- interno ---- */

  // Sobremedida: la sacudida del trueno y el desplazamiento del shader
  // nunca deben dejar ver el borde del tablero.
  _fitMap(){
    const o = 16;
    this.mapSprite.x = -o; this.mapSprite.y = -o;
    this.mapSprite.width = this.w + o * 2;
    this.mapSprite.height = this.h + o * 2;
  }

  _uploadWater(){ this.waterTex.baseTexture.update(); }

  _applyLook(){
    const d = this.def; if (!d) return;
    const g = d.grade, r = d.refract, wtr = d.water, k = this.params.refraction;
    const u = this.grade.uniforms;
    u.uSat = g.sat; u.uBright = g.bright; u.uContrast = g.contrast;
    u.uTint.set(g.tint); u.uTintAmt = g.tintAmt;
    u.uFogColor.set(g.fogColor); u.uFog = g.fog * (.5 + this.params.intensity * .8);
    u.uFogScale = g.fogScale; u.uFogSpeed = g.fogSpeed;
    u.uFogDir[0] = this.params.wind >= 0 ? 1 : -1; u.uFogDir[1] = .22;
    u.uVignette = g.vignette; u.uGrain = g.grain;

    const ur = this.refract.uniforms;
    ur.uPerturbance = (wtr ? wtr.perturbance : 0) * k;
    ur.uSpecular = wtr ? wtr.specular : 0;
    ur.uWet = wtr ? wtr.wet * clamp01(.35 + this.params.intensity) : 0;
    this._turbBase = r.turbAmp * k * (.4 + this.params.intensity * .8);
    ur.uTurbAmp = this._turbBase;
    ur.uTurbScale = r.turbScale;
    ur.uTurbSpeed = r.turbSpeed;
    ur.uTurbDir[0] = 1 + this.params.wind; ur.uTurbDir[1] = .35;
    ur.uChroma = r.chroma;
  }

  _rebuild(){
    const layers = this.def.layers;
    for (const it of this.items){ it.sp.visible = false; this.pool.push(it.sp); }
    this.items.length = 0;
    this.groups = [];
    this.active = 0;
    if (!layers) return;

    const asked = layers.reduce((a, l) => a + l.count, 0) || 1;
    const scale = Math.min(1, this.maxParticles / asked);
    for (const pc of layers){
      const cap = Math.max(1, Math.round(pc.count * scale));
      const start = this.items.length;
      for (let i = 0; i < cap; i++){
        let sp = this.pool.pop();
        if (!sp){ sp = new PIXI.Sprite(); this.particles.addChild(sp); }
        sp.anchor.set(.5);
        sp.texture = this.tex[pc.tex];
        sp.blendMode = pc.blend === 'add' ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
        sp.tint = pc.tint;
        sp.visible = false;
        const it = { sp, pc };
        this._seed(it, true);
        this.items.push(it);
      }
      this.groups.push({ start, count: cap, on: cap });
    }
    this._applyCount();
  }

  _applyCount(){
    const f = clamp01(this.params.intensity);
    let total = 0;
    for (const g of this.groups){
      g.on = Math.round(g.count * f);
      for (let i = 0; i < g.count; i++) this.items[g.start + i].sp.visible = i < g.on;
      total += g.on;
    }
    this.active = total;
  }

  _seed(it, initial){
    const pc = it.pc;
    const depth = Math.pow(Math.random(), 1.6);
    it.depth = depth;
    const sc = .55 + depth * 1.25;
    it.speed = rnd(pc.speed[0], pc.speed[1]) * (.6 + depth * .85);
    it.size = rnd(pc.size[0], pc.size[1]) * sc;
    it.len = pc.len ? rnd(pc.len[0], pc.len[1]) * sc : it.size;
    it.alpha = rnd(pc.alpha[0], pc.alpha[1]) * (.45 + depth * .75);
    it.phase = Math.random() * 6.283;
    it.swayF = rnd(.4, 1.6);
    it.sway = (pc.sway || 0) * rnd(.4, 1.4) * (.5 + depth);
    it.spin = pc.spin ? rnd(-pc.spin, pc.spin) : 0;
    it.rot = Math.random() * 6.283;
    it.flick = pc.flicker ? rnd(1.4, 4.2) : 0;

    const m = pc.mode, W = this.w, H = this.h;
    const flow = this.params.wind + (pc.drift || 0);
    if (initial){ it.x = rnd(-40, W + 40); it.y = rnd(-40, H + 40); }
    else if (m === 'fall'){ it.x = rnd(-140, W + 140); it.y = -it.len - 20; }
    else if (m === 'rise'){ it.x = rnd(-60, W + 60); it.y = H + it.size + 20; }
    else if (Math.random() < .3){ it.x = rnd(-40, W + 40); it.y = -it.size - 30; }
    else { it.x = flow >= 0 ? -it.size - it.len - 40 : W + it.size + it.len + 40; it.y = rnd(-40, H + 40); }
  }

  _drawBolt(){
    const g = this.bolts; g.clear();
    let pts = [[rnd(0, this.w), -30], [rnd(this.w * .12, this.w * .88), this.h * rnd(.35, .85)]];
    for (let it = 0; it < 6; it++){
      const out = [];
      for (let i = 0; i < pts.length - 1; i++){
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const off = (Math.random() - .5) * len * .30;
        out.push(a, [(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    const stroke = (w, alpha, color) => {
      g.lineStyle({ width: w, color, alpha, cap: 'round', join: 'round' });
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    };
    stroke(11, .09, 0x9fc4ff);
    stroke(4.5, .26, 0xcfe2ff);
    stroke(1.4, .92, 0xffffff);
    for (let b = 0; b < 3; b++){
      const i = Math.floor(rnd(pts.length * .25, pts.length * .9));
      const p = pts[i], a = rnd(-1.2, 1.2), l = rnd(40, 150);
      g.lineStyle({ width: 1.1, color: 0xe6f0ff, alpha: .5, cap: 'round' });
      g.moveTo(p[0], p[1]);
      g.lineTo(p[0] + Math.cos(a) * l * .5 + rnd(-20, 20), p[1] + Math.abs(Math.sin(a)) * l);
    }
    g.alpha = 1;
  }

  _tick(ms){
    const dt = Math.min(48, ms) / 1000;
    if (!this.paused) this.time += dt;
    this.refract.uniforms.uTime = this.time;
    this.grade.uniforms.uTime = this.time;

    if (!this.paused && this.def){
      this._updateParticles(dt);
      this.refract.uniforms.uTurbAmp = (this._turbBase || 0) * Math.max(.15, this.gust);
      this._updateWater(dt);
      this._updateLightning(dt);
    }

    if (this._flashSeq){
      this._flashT += dt;
      const s = this._flashSeq;
      let v = 0;
      for (let i = 0; i < s.length - 1; i++){
        if (this._flashT >= s[i][0] && this._flashT < s[i + 1][0]){
          const t = (this._flashT - s[i][0]) / (s[i + 1][0] - s[i][0]);
          v = s[i][1] + (s[i + 1][1] - s[i][1]) * t;
          break;
        }
      }
      if (this._flashT >= s[s.length - 1][0]){ this._flashSeq = null; v = 0; }
      this._flash = this.reduced ? v * .25 : v;
      this.bolts.alpha = Math.max(0, 1 - this._flashT * 4.2);
      if (this.bolts.alpha <= 0) this.bolts.clear();
    } else if (this._flash > 0){ this._flash = 0; this.bolts.clear(); }
    this.grade.uniforms.uFlash = this._flash * .5;

    if (this._shake > 0){
      this._shake = Math.max(0, this._shake - dt * 2.6);
      const a = this._shake * this._shake * 4.5;
      this.world.x = (Math.random() - .5) * a;
      this.world.y = (Math.random() - .5) * a;
    } else if (this.world.x || this.world.y){ this.world.x = 0; this.world.y = 0; }
  }

  _updateWater(dt){
    const w = this.def.water;
    if (!w){
      if (this.sim.advance(dt, .98, .99, 8, 1)) this._uploadWater();
      return;
    }
    this._dropDebt += w.rate * this.params.intensity * this.params.drops * dt;
    let guard = 0;
    while (this._dropDebt >= 1 && guard++ < 8){
      this._dropDebt -= 1;
      this.sim.drop(Math.random(), Math.random(),
        rnd(w.radius[0], w.radius[1]),
        rnd(w.strength[0], w.strength[1]) * w.amplitude);
    }
    if (this.sim.advance(dt, w.damping, w.flatten, w.normalScale, w.waveSpeed)) this._uploadWater();
  }

  _updateParticles(dt){
    if (!this.groups.length) return;
    const W = this.w, H = this.h, t = this.time;
    // Racha compartida: partículas y turbulencia del suelo soplan a la vez,
    // que es lo que hace que el viento se lea como viento.
    const swell = Math.sin(t * .31) * Math.sin(t * .13 + 1.7) * .5 + Math.sin(t * .77 + .4) * .18;
    this.gust = 1 + swell * (this.def.gust ?? .35);
    const sp = this.params.speed;

    for (const g of this.groups) for (let n = 0; n < g.on; n++){
      const it = this.items[g.start + n];
      const pc = it.pc;
      const wind = (this.params.wind + (pc.drift || 0)) * (pc.windMul ?? 1) * this.gust;
      let vx = 0, vy = 0;
      if (pc.mode === 'fall'){ vy = it.speed; vx = wind * it.speed * .62; }
      else if (pc.mode === 'rise'){ vy = -it.speed; vx = wind * it.speed * .8; }
      else { vx = wind * it.speed; vy = it.speed * (pc.sink || 0); }
      vx += Math.sin(t * it.swayF + it.phase) * it.sway;
      vy += Math.cos(t * it.swayF * .7 + it.phase) * it.sway * .35;

      it.x += vx * sp * dt;
      it.y += vy * sp * dt;

      const s = it.sp;
      s.x = it.x; s.y = it.y;
      if (pc.tex === 'streak' || pc.tex === 'shard'){
        s.width = it.size; s.height = it.len;
        s.rotation = Math.atan2(vy, vx) - Math.PI / 2;
      } else {
        s.width = s.height = it.size;
        it.rot += it.spin * dt;
        s.rotation = it.rot;
      }
      s.alpha = it.flick ? it.alpha * (.55 + .45 * Math.sin(t * it.flick + it.phase)) : it.alpha;

      const pad = it.len + 60;
      if (it.y > H + pad || it.y < -pad || it.x < -pad - 80 || it.x > W + pad + 80) this._seed(it, false);
    }
  }

  _updateLightning(dt){
    const d = this.def;
    const k = .5 + this.params.intensity;
    if (d.lightning){
      this._boltTimer -= dt * k;
      if (this._boltTimer <= 0){
        this.strike();
        this._boltTimer = rnd(d.lightning.min, d.lightning.max);
      }
    }
    if (d.flashes){
      this._flashTimer -= dt * k;
      if (this._flashTimer <= 0){
        if (!this._flashSeq) this.sheetFlash();
        this._flashTimer = rnd(d.flashes.min, d.flashes.max);
      }
    }
  }
}

/* ========================================================== biblioteca */
/* water: rate = gotas por segundo, radius/strength = tamaño y fuerza del
   impacto, damping = cuánto tarda en calmarse, perturbance = píxeles de
   desplazamiento del tablero, wet = cuánto oscurece la superficie.       */

WeatherFX.register({
  id: 'rain', icon: '🌧️', name: 'Lluvia',
  blurb: 'Gotas cayendo sobre la mesa. Cada impacto abre una onda que se propaga, rebota y se cruza con las demás.',
  base: { intensity: .6, speed: 1, wind: .15, drops: 1, refraction: 1 },
  layers: [
    { tex: 'streak', count: 1400, size: [1.3, 2.4], len: [16, 36], speed: [900, 1500], alpha: [.09, .24], tint: 0xbdd6e0, mode: 'fall', sway: 5 },
    { tex: 'streak', count: 110, size: [7, 15], len: [90, 210], speed: [1800, 2700], alpha: [.02, .06], tint: 0xd5e6ee, mode: 'fall', sway: 2 }
  ],
  water: { rate: 2.2, radius: [6, 14], strength: [.5, 1.1], amplitude: .14, damping: .976, flatten: .992, waveSpeed: 1, normalScale: 7, perturbance: 50, specular: .8, wet: .45 },
  refract: { turbAmp: 0, turbScale: 6, turbSpeed: .05, chroma: .2 },
  grade: { sat: .95, bright: .93, contrast: 1.03, tint: [.62, .72, .80], tintAmt: .06, fogColor: [.55, .63, .67], fog: .025, fogScale: 3, fogSpeed: .05, vignette: .20, grain: .012 }
});

WeatherFX.register({
  id: 'storm', icon: '⛈️', name: 'Tormenta',
  blurb: 'La misma agua, mucho más agitada: lluvia inclinada, gotas constantes y relámpagos espaciados.',
  base: { intensity: .85, speed: 1.3, wind: .45, drops: 1.3, refraction: 1.2 },
  layers: [
    { tex: 'streak', count: 1900, size: [1.5, 2.9], len: [26, 58], speed: [1250, 2000], alpha: [.10, .28], tint: 0xb4cdda, mode: 'fall', sway: 9 },
    { tex: 'streak', count: 160, size: [8, 18], len: [120, 300], speed: [2200, 3400], alpha: [.03, .08], tint: 0xcfe0ea, mode: 'fall', sway: 3 }
  ],
  gust: .6,
  water: { rate: 6, radius: [7, 20], strength: [.6, 1.3], amplitude: .15, damping: .978, flatten: .993, waveSpeed: 1.05, normalScale: 7, perturbance: 58, specular: 1.0, wet: .65 },
  refract: { turbAmp: .35, turbScale: 5, turbSpeed: .1, chroma: .4 },
  grade: { sat: .86, bright: .78, contrast: 1.08, tint: [.50, .60, .72], tintAmt: .12, fogColor: [.44, .52, .59], fog: .07, fogScale: 2.4, fogSpeed: .1, vignette: .34, grain: .016 },
  lightning: { min: 16, max: 42 },
  flashes: { min: 4, max: 11 }
});

WeatherFX.register({
  id: 'drizzle', icon: '💧', name: 'Llovizna',
  blurb: 'Agua en suspensión más que lluvia: mota fina que flota y deriva, aire húmedo que cierra la vista y un goteo mínimo que no deja de rizar la superficie.',
  base: { intensity: .55, speed: .75, wind: .2, drops: 1, refraction: .8 },
  layers: [
    { tex: 'grain', count: 1600, size: [1.1, 2.6], speed: [120, 300], alpha: [.05, .16], tint: 0xd2e3ea, mode: 'fall', sway: 34 },
    { tex: 'streak', count: 260, size: [1.1, 1.9], len: [10, 22], speed: [520, 860], alpha: [.05, .14], tint: 0xc8dee6, mode: 'fall', sway: 8 },
    { tex: 'soft', count: 40, size: [260, 620], speed: [18, 60], alpha: [.02, .06], tint: 0xb9c8ce, mode: 'drift', drift: .12, sway: 6, sink: .05 }
  ],
  gust: .3,
  water: { rate: 4.5, radius: [4, 9], strength: [.25, .6], amplitude: .11, damping: .968, flatten: .988, waveSpeed: .9, normalScale: 7, perturbance: 24, specular: .9, wet: .5 },
  refract: { turbAmp: 0, turbScale: 6, turbSpeed: .04, chroma: .15 },
  grade: { sat: .82, bright: .90, contrast: 1.0, tint: [.64, .72, .78], tintAmt: .12, fogColor: [.62, .68, .72], fog: .09, fogScale: 2.3, fogSpeed: .05, vignette: .24, grain: .014 }
});

WeatherFX.register({
  id: 'blizzard', icon: '❄️', name: 'Nieve y ventisca',
  blurb: 'Con poco viento es una nevada tranquila; súbelo y se convierte en ventisca. Copos, esquirlas y mantos de nieve barrida.',
  base: { intensity: .8, speed: 1.1, wind: .55, drops: 0, refraction: 1 },
  layers: [
    { tex: 'flake', count: 700, size: [2.5, 9], speed: [150, 380], alpha: [.12, .45], tint: 0xeaf4f9, mode: 'drift', drift: .1, sway: 26, sink: .34, spin: .7 },
    { tex: 'shard', count: 1200, size: [1.4, 4], len: [30, 95], speed: [650, 1400], alpha: [.05, .18], tint: 0xf4fbff, mode: 'drift', drift: .12, sway: 12, sink: .12 },
    { tex: 'soft', count: 70, size: [190, 480], speed: [280, 560], alpha: [.025, .085], tint: 0xdfeaf0, mode: 'drift', drift: .15, sway: 10, sink: .1 }
  ],
  gust: .7,
  water: null,
  refract: { turbAmp: 1.8, turbScale: 3.2, turbSpeed: .2, chroma: .2 },
  grade: { sat: .62, bright: 1.02, contrast: .97, tint: [.82, .88, .93], tintAmt: .16, fogColor: [.85, .90, .93], fog: .2, fogScale: 1.8, fogSpeed: .28, vignette: .38, grain: .02 }
});

WeatherFX.register({
  id: 'sand', icon: '🏜️', name: 'Tormenta de arena',
  blurb: 'Tres planos de arena: grano fino de fondo, ráfagas largas que cruzan y mantos de polvo cercano. El viento sopla a golpes y el suelo ondula con él.',
  base: { intensity: .85, speed: 1.2, wind: .75, drops: 0, refraction: 1.15 },
  layers: [
    { tex: 'grain', count: 1400, size: [1, 4.5], speed: [480, 1050], alpha: [.05, .22], tint: 0xd8b98a, mode: 'drift', drift: .18, sway: 20, sink: .12 },
    { tex: 'streak', count: 520, size: [2.5, 7], len: [70, 220], speed: [950, 1900], alpha: [.04, .14], tint: 0xe2c79c, mode: 'drift', drift: .25, sway: 9, sink: .06 },
    { tex: 'soft', count: 90, size: [170, 470], speed: [300, 640], alpha: [.03, .10], tint: 0xc9a875, mode: 'drift', drift: .2, sway: 14, sink: .08 }
  ],
  gust: 1.0,
  water: null,
  refract: { turbAmp: 3.2, turbScale: 3.4, turbSpeed: .2, chroma: .3 },
  grade: { sat: .78, bright: .93, contrast: 1.02, tint: [.78, .62, .40], tintAmt: .22, fogColor: [.72, .58, .38], fog: .22, fogScale: 2, fogSpeed: .24, vignette: .36, grain: .022 }
});

WeatherFX.register({
  id: 'fog', icon: '🌫️', name: 'Niebla',
  blurb: 'Bancos densos que cruzan despacio. Casi todo el efecto está en el aire, no en las partículas.',
  base: { intensity: .6, speed: .6, wind: .18, drops: 0, refraction: .8 },
  layers: [
    { tex: 'soft', count: 150, size: [320, 820], speed: [12, 46], alpha: [.02, .075], tint: 0xc9d3d6, mode: 'drift', drift: .08, sway: 5, sink: .03 }
  ],
  gust: .25,
  water: null,
  refract: { turbAmp: 1.1, turbScale: 2.2, turbSpeed: .045, chroma: 0 },
  grade: { sat: .66, bright: .94, contrast: .96, tint: [.72, .76, .78], tintAmt: .14, fogColor: [.72, .76, .78], fog: .42, fogScale: 1.7, fogSpeed: .045, vignette: .3, grain: .014 }
});

WeatherFX.register({
  id: 'ash', icon: '🌋', name: 'Ceniza volcánica',
  blurb: 'Partículas oscuras que bajan sin prisa y van ensuciando la lectura del mapa.',
  base: { intensity: .6, speed: .7, wind: .14, drops: 0, refraction: .7 },
  particles: { tex: 'grain', count: 1200, size: [1.2, 5], speed: [30, 110], alpha: [.08, .34], tint: 0x6b6560, mode: 'fall', sway: 20, spin: .5 },
  water: null,
  refract: { turbAmp: .8, turbScale: 3.6, turbSpeed: .08, chroma: 0 },
  grade: { sat: .5, bright: .8, contrast: 1.05, tint: [.38, .36, .34], tintAmt: .16, fogColor: [.32, .31, .30], fog: .11, fogScale: 2.1, fogSpeed: .06, vignette: .34, grain: .02 }
});

WeatherFX.register({
  id: 'embers', icon: '🔥', name: 'Brasas',
  blurb: 'Motas incandescentes que suben con la corriente, y el calor ondulando el suelo bajo ellas.',
  base: { intensity: .55, speed: .9, wind: .2, drops: 0, refraction: 1 },
  particles: { tex: 'glow', count: 650, size: [2, 8], speed: [40, 150], alpha: [.2, .75], tint: 0xffb066, mode: 'rise', sway: 26, blend: 'add', flicker: true },
  water: null,
  refract: { turbAmp: 1.7, turbScale: 5.5, turbSpeed: .15, chroma: .25 },
  grade: { sat: 1.02, bright: .88, contrast: 1.05, tint: [.64, .36, .2], tintAmt: .12, fogColor: [.34, .2, .13], fog: .05, fogScale: 2.6, fogSpeed: .08, vignette: .32, grain: .014 }
});

WeatherFX.register({
  id: 'heat', icon: '🌡️', name: 'Calor abrasador',
  blurb: 'Sin lluvia ni polvo: solo aire ondulando sobre la piedra.',
  base: { intensity: .7, speed: .6, wind: .1, drops: 0, refraction: 1 },
  particles: { tex: 'soft', count: 80, size: [30, 120], speed: [10, 40], alpha: [.012, .04], tint: 0xffdcae, mode: 'rise', sway: 14, blend: 'add' },
  water: null,
  refract: { turbAmp: 5, turbScale: 6.5, turbSpeed: .16, chroma: .5 },
  grade: { sat: 1.04, bright: 1.02, contrast: 1.03, tint: [.86, .7, .46], tintAmt: .1, fogColor: [.84, .72, .52], fog: .03, fogScale: 3.2, fogSpeed: .12, vignette: .22, grain: .012 }
});

WeatherFX.register({
  id: 'arcane', icon: '✨', name: 'Polvo arcano',
  blurb: 'Motas suspendidas y pulsos lentos que ondulan el terreno como un campo inestable.',
  base: { intensity: .5, speed: .6, wind: .08, drops: .5, refraction: 1.1 },
  particles: { tex: 'mote', count: 550, size: [2, 9], speed: [15, 70], alpha: [.15, .6], tint: 0xb79bff, mode: 'rise', sway: 22, blend: 'add', flicker: true },
  water: { rate: .45, radius: [50, 120], strength: [.7, 1.4], amplitude: .12, damping: .990, flatten: .996, waveSpeed: .5, normalScale: 6, perturbance: 44, specular: 1.2, wet: 0 },
  refract: { turbAmp: .8, turbScale: 4.2, turbSpeed: .07, chroma: .8 },
  grade: { sat: 1.0, bright: .9, contrast: 1.04, tint: [.48, .4, .74], tintAmt: .14, fogColor: [.34, .3, .52], fog: .06, fogScale: 2.4, fogSpeed: .05, vignette: .32, grain: .014 }
});

return WeatherFX;
}));
