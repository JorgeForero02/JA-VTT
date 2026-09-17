/* Vision, luz y niebla del motor 2.5D. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, U, I, cxOf, czOf, inb } from './ctx.js';
import { defOf } from './chars.js';
import { hooks } from './fx.js';
const T3 = THREE;

const MIST_NOISE = `
float mh(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float mvn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mh(i),mh(i+vec2(1.0,0.0)),f.x),mix(mh(i+vec2(0.0,1.0)),mh(i+vec2(1.0,1.0)),f.x),f.y);}
`;
const FOG_FRAG = `
{
  vec2 fuv=(vFogXZ+vec2(uHalf))/(2.0*uHalf);
  vec4 Lt=texture2D(uLight,fuv);
  #ifdef FOG_ORIGIN
  vec3 lit=Lt.rgb*1.7*uGain;
  #else
  vec3 lit=Lt.rgb*2.4*uGain;
  #endif
  lit=lit/(1.0+lit*0.3);
  gl_FragColor.rgb+=diffuseColor.rgb*(lit+vec3(uFloor));
  gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*0.32+vec3(0.045,0.02,0.08),Lt.a*0.8);
  #ifdef FOG_GRID
  if(uGrid>0.5&&vUp>0.5){
    vec2 gd=abs(fract(vFogXZ+0.5)-0.5);
    float gline=1.0-smoothstep(0.012,0.035,min(gd.x,gd.y));
    gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*0.5,gline*0.85);
  }
  #endif
  float hidden=0.0;
  if(uFogOn>0.5){
    vec4 V=texture2D(uVis,fuv);
    float lum=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));
    vec3 dvc=vec3(lum)*vec3(0.58,0.63,0.7);
    vec3 nowc=mix(gl_FragColor.rgb,max(gl_FragColor.rgb*0.35,dvc),V.b);
    vec3 fcol=mix(vec3(lum),diffuseColor.rgb,0.45)*uAmbFlat;
    vec3 tint=mix(fcol,fcol*vec3(0.78,0.86,1.0),0.6);
    vec3 mem=mix(tint,uDark,uFogAlpha*0.5);
    vec3 hid=mix(tint,uDark,uFogAlpha);
    gl_FragColor.rgb=mix(mix(hid,mem,V.g),nowc,V.r);
    hidden=(1.0-V.r)*(1.0-0.5*V.g);
  }
  if(uMist>0.001){
    vec2 mp=vFogXZ*0.55+vec2(uMistT*0.05,uMistT*0.03);
    float nz=mvn(mp)*0.6+mvn(mp*2.3+vec2(uMistT*-0.04,5.1))*0.4;
    float hgt=1.0-smoothstep(uMistBase,uMistBase+uMistTop*(0.7+nz*0.6),vFogY);
    float m=clamp(hgt*uMist*(0.45+0.75*nz),0.0,0.82);
    vec3 mc=uMistCol+Lt.rgb*uGain*0.45;
    mc*=1.0-hidden*uFogAlpha*0.75;
    gl_FragColor.rgb=mix(gl_FragColor.rgb,mc,m);
  }
}
`;

function dataTex(d) { const t = new T3.DataTexture(d, G.N, G.N, T3.RGBAFormat); t.magFilter = T3.LinearFilter; t.minFilter = T3.LinearFilter; t.needsUpdate = true; return t; }

export function patchMat(mat, opt) {
  mat.defines = Object.assign({}, mat.defines || {});
  if (opt.origin) mat.defines.FOG_ORIGIN = '';
  if (opt.grid) mat.defines.FOG_GRID = '';
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec2 vFogXZ;\nvarying float vUp;\nvarying float vFogY;\n' + sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
  vec4 fwp=vec4(transformed,1.0);
  #ifdef USE_INSTANCING
    fwp=instanceMatrix*fwp;
  #endif
  fwp=modelMatrix*fwp;
  vFogY=fwp.y;
#ifdef FOG_ORIGIN
  vFogXZ=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xz;vUp=0.0;
#else
  vFogXZ=fwp.xz+objectNormal.xz*0.45;vUp=objectNormal.y;
#endif`);
    let fs = sh.fragmentShader;
    const lfb = T3.ShaderChunk.lights_fragment_begin.replace(/getShadow\( directionalShadowMap\[ i \][^;]*\) : 1\.0;/, m => 'mix(1.0,' + m.slice(0, -7) + ',uShadow) : 1.0;');
    fs = fs.replace('#include <lights_fragment_begin>', lfb);
    sh.fragmentShader = 'varying vec2 vFogXZ;\nvarying float vUp;\nvarying float vFogY;\nuniform sampler2D uVis;\nuniform sampler2D uLight;\nuniform float uHalf;\nuniform float uGain;\nuniform float uFloor;\nuniform float uFogOn;\nuniform float uGrid;\nuniform float uFogAlpha;\nuniform vec3 uDark;\nuniform float uShadow;\nuniform float uAmbFlat;\nuniform float uMist;\nuniform vec3 uMistCol;\nuniform float uMistBase;\nuniform float uMistTop;\nuniform float uMistT;\n'
      + MIST_NOISE + fs.replace('#include <fog_fragment>', FOG_FRAG + '\n#include <fog_fragment>');
  };
  return mat;
}

const VIEW_R = 30;

export function los(a, b, eyeH, mode) {
  const ax = cxOf(a), az = czOf(a), bx = cxOf(b), bz = czOf(b);
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1.01) return true;
  const h1 = G.H[b] + .3, steps = Math.ceil(len * 3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = Math.round(ax + dx * t), z = Math.round(az + dz * t), k = z * G.N + x;
    if (k === a || k === b) continue;
    const rayH = eyeH + (h1 - eyeH) * t;
    const blk = G.H[k] + ((mode === 1 ? hooks.blocksSight(k) || G.darkMask[k] : hooks.closedDoor(k)) ? 2.2 : 0);
    if (blk > rayH) return false;
  }
  return true;
}

function lightCell(l) { return l.carrier ? (l.carrier.seg ? l.carrier.seg.to : l.carrier.cell) : l.cell; }

export function buildCache(l) {
  const P = defOf(l), cell = lightCell(l);
  const br = P.bright / 5, dm = P.dim / 5, R = br + dm, eye = G.H[cell] + (l.carrier ? 1.3 : l.mount ? 1.25 : P.lh);
  const x0 = cxOf(cell), z0 = czOf(cell), rc = Math.ceil(R), list = [];
  for (let z = z0 - rc; z <= z0 + rc; z++) for (let x = x0 - rc; x <= x0 + rc; x++) {
    if (!inb(x, z)) continue; const d = Math.hypot(x - x0, z - z0); if (d > R + .01) continue;
    const j = I(x, z);
    if (j !== cell && !los(cell, j, eye, 2)) continue;
    let w;
    if (d <= br || dm <= 0) w = P.darkness ? 1 : 1 - .2 * (d / Math.max(br, .001));
    else w = .8 * Math.pow(Math.max(0, 1 - (d - br) / dm), 1.2);
    if (w > .01) list.push(j, w);
  }
  l.cache = { cell, list };
}

export function animFactor(l, t) {
  if (!S.animLights) return 1;
  const a = defOf(l).anim;
  if (a === 'flicker') return .86 + .09 * Math.sin(t * 13 + l.seed) + .05 * Math.sin(t * 31 + l.seed * 2);
  if (a === 'soft') return .95 + .05 * Math.sin(t * 2 + l.seed);
  if (a === 'pulse') return .78 + .22 * Math.sin(t * 2.4 + l.seed);
  return 1;
}

export function refreshLights() {
  G.illum.fill(0); G.darkMask.fill(0);
  for (const l of G.lights) {
    if (!l.cache || l.cache.cell !== lightCell(l)) buildCache(l);
    if (!l.on) continue;
    const P = defOf(l), L = l.cache.list;
    for (let k = 0; k < L.length; k += 2) { if (P.darkness) G.darkMask[L[k]] = 1; else G.illum[L[k]] += L[k + 1] * P.intensity; }
  }
  G.lightsDirty = false; G.visionDirty = true; G.lightTick = 0;
}

const tmpC = new T3.Color();
const WHITE = new T3.Color(1, 1, 1);
const softL = v => 255 * (1 - Math.exp(-v * .95)) / 1.0;

export function composeLightmap(t) {
  G.lightAcc.fill(0);
  for (const l of G.lights) {
    if (!l.on || !l.cache) continue;
    const P = defOf(l); if (P.darkness) continue;
    tmpC.set(P.color).lerp(WHITE, .4); const f = P.intensity * animFactor(l, t), L = l.cache.list;
    for (let k = 0; k < L.length; k += 2) { const j = L[k] * 3, w = L[k + 1] * f; G.lightAcc[j] += tmpC.r * w; G.lightAcc[j + 1] += tmpC.g * w; G.lightAcc[j + 2] += tmpC.b * w; }
  }
  hooks.flashLight();
  for (let i = 0; i < G.CELLS; i++) {
    const o = i * 4, j = i * 3;
    G.lightData[o] = softL(G.lightAcc[j]); G.lightData[o + 1] = softL(G.lightAcc[j + 1]); G.lightData[o + 2] = softL(G.lightAcc[j + 2]);
    G.lightData[o + 3] = G.darkMask[i] ? 255 : 0;
  }
  G.lightTex.needsUpdate = true;
}

function computeFor(c) {
  let v = G.pcVis.get(c); if (!v) { v = { mode: new Uint8Array(G.CELLS), strong: new Uint8Array(G.CELLS) }; G.pcVis.set(c, v); }
  let e = G.explored.get(c); if (!e) { e = new Uint8Array(G.CELLS); G.explored.set(c, e); }
  v.mode.fill(0); v.strong.fill(0);
  const from = c.seg ? c.seg.to : c.cell, eye = G.H[from] + 1.5, fx = cxOf(from), fz = czOf(from);
  const R = Math.min(VIEW_R, c.sight > 0 ? Math.ceil(c.sight / 5) : VIEW_R);
  for (let z = Math.max(0, fz - R); z <= Math.min(G.N - 1, fz + R); z++) for (let x = Math.max(0, fx - R); x <= Math.min(G.N - 1, fx + R); x++) {
    const j = z * G.N + x, d = Math.hypot(x - fx, z - fz); if (d > R + .5) continue;
    if (c.sight > 0 && d > c.sight / 5) continue;
    if (!los(from, j, eye, 1)) continue;
    if (G.darkMask[j]) { v.mode[j] = 1; e[j] = 1; continue; }
    const L = S.amb + G.illum[j];
    if (L >= .15 || d < .5) { v.mode[j] = 1; if (L >= .3) v.strong[j] = 1; }
    if (c.dv > 0 && d <= c.dv / 5) { if (!v.mode[j]) v.mode[j] = 2; v.strong[j] = 1; }
    if (v.mode[j]) e[j] = 1;
  }
}

/* Observadores: los mismos que en 2D (core.js viewers()), pero con las fichas del motor.
   Director en vista Director: nadie (lo ve todo, sin niebla). */
export function viewers() {
  if (S.view === 'gm') return [];
  let party = G.chars.filter(c => c.pc && c.vision !== false && !c.hidden);
  if (!S.gm && !S.shared && S.uid != null) { const mine = party.filter(c => c.owner === S.uid); party = mine.length ? mine : []; }
  if (S.view !== 'party') { const one = party.find(c => c.vid === S.view); if (one) return [one]; }
  return party;
}

export function computeVision() {
  G.chars.forEach(c => { if (c.pc) computeFor(c); });
  const vs = viewers();
  G.tVis.fill(0); G.tMem.fill(0); G.tDv.fill(0); G.strongView.fill(0);
  for (let j = 0; j < G.CELLS; j++) {
    let lit = false, dv = false, mem = false, strong = false;
    for (const c of vs) {
      const v = G.pcVis.get(c), e = G.explored.get(c); if (!v) continue;
      if (v.mode[j] === 1) lit = true; else if (v.mode[j] === 2) dv = true;
      if (v.strong[j]) strong = true; if (e[j]) mem = true;
    }
    G.tVis[j] = lit || dv ? 1 : 0; G.tDv[j] = !lit && dv ? 1 : 0; G.strongView[j] = strong ? 1 : 0;
    if ((lit || dv) && !G.exploredUser[j]) { G.exploredUser[j] = 255; G.exploredDirty = true; }
    G.tMem[j] = S.fogMemory && (mem || G.exploredUser[j] > 0) ? 1 : 0;
  }
  // quién ve a quién
  G.chars.forEach(c => {
    const cell = c.seg ? c.seg.to : c.cell;
    let show = true;
    if (S.view !== 'gm' && !vs.includes(c)) {
      if (c.pc && S.view === 'party') show = true;
      else show = !c.hidden && G.tVis[cell] > 0 && G.strongView[cell] > 0;
    }
    c.mesh.visible = show;
  });
  G.visionDirty = false;
}

/* Lo explorado por este usuario, un byte por casilla, tal como se guarda en el servidor. */
export function exploredBytes() { G.exploredDirty = false; return G.exploredUser.slice(); }
export function exploredDirty() { return G.exploredDirty; }
/* Carga lo explorado que venía guardado. Si el mundo ya no mide lo mismo, se descarta:
   el jugador vuelve a explorar en vez de ver la niebla descolocada. */
export function loadExplored(bytes) {
  G.exploredUser.fill(0);
  if (bytes && bytes.length === G.CELLS) G.exploredUser.set(bytes);
  G.exploredDirty = false; G.visionDirty = true;
}
export function resetExplored() { G.exploredUser.fill(0); G.explored.clear(); G.exploredDirty = false; G.visionDirty = true; }

export function fxOk(i) { return S.view === 'gm' || G.cVis[i] > .5; }

export function blendVision(dt, snap) {
  const k = snap ? 1 : Math.min(1, dt * 7); let moving = false;
  for (let j = 0; j < G.CELLS; j++) {
    const a = G.cVis[j] + (G.tVis[j] - G.cVis[j]) * k, b = G.cMem[j] + (G.tMem[j] - G.cMem[j]) * k, c = G.cDv[j] + (G.tDv[j] - G.cDv[j]) * k;
    if (Math.abs(a - G.cVis[j]) + Math.abs(b - G.cMem[j]) + Math.abs(c - G.cDv[j]) > .002) moving = true;
    G.cVis[j] = a; G.cMem[j] = b; G.cDv[j] = c;
    const o = j * 4; G.visData[o] = a * 255; G.visData[o + 1] = b * 255; G.visData[o + 2] = c * 255; G.visData[o + 3] = 255;
  }
  if (moving || snap) G.visTex.needsUpdate = true;
}

export function resizeVision(cells) {
  const ov = G.visTex, ol = G.lightTex;
  G.visData = new Uint8Array(cells * 4); G.lightData = new Uint8Array(cells * 4);
  G.visTex = dataTex(G.visData); G.lightTex = dataTex(G.lightData);
  if (ov) ov.dispose(); if (ol) ol.dispose();
  U.uVis.value = G.visTex; U.uLight.value = G.lightTex; U.uHalf.value = G.N / 2;
  G.illum = new Float32Array(cells); G.darkMask = new Uint8Array(cells); G.lightAcc = new Float32Array(cells * 3);
  G.tVis = new Float32Array(cells); G.tMem = new Float32Array(cells); G.tDv = new Float32Array(cells);
  G.cVis = new Float32Array(cells); G.cMem = new Float32Array(cells); G.cDv = new Float32Array(cells); G.strongView = new Uint8Array(cells);
  G.exploredUser = new Uint8Array(cells);
}

export function initVision() {
  G.visData = new Uint8Array(G.CELLS * 4); G.lightData = new Uint8Array(G.CELLS * 4);
  G.visTex = dataTex(G.visData); G.lightTex = dataTex(G.lightData);
  U.uVis.value = G.visTex; U.uLight.value = G.lightTex;
}
