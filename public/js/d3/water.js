/* Agua 2.5D: shader, malla, partículas y simulación de tuberías virtuales. */
import * as THREE from '../vendor/three.module.min.js';
import { G, DIRS, I, cxOf, czOf, wx, wz, inb } from './ctx.js';
import { patchMat, fxOk } from './vision.js';
const T3 = THREE;

export const WU = { uTime: { value: 0 }, uPix: { value: 16 } };

const WATER_NOISE = `
float wh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float wvn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(wh(i),wh(i+vec2(1.0,0.0)),f.x),mix(wh(i+vec2(0.0,1.0)),wh(i+vec2(1.0,1.0)),f.x),f.y);}
float wfbm(vec2 p){return wvn(p)*0.55+wvn(p*2.03+7.1)*0.3+wvn(p*4.1+13.7)*0.15;}
`;
const WATER_COLOR = `
vec3 wcol;float walpha;float wn;
vec2 wp=vWPos.xz;
if(uPix>0.5)wp=(floor(wp*uPix)+0.5)/uPix;
if(vInfo.z<0.5){
  // superficie: dos capas de ruido que avanzan con la corriente y se relevan
  float ph=fract(uTime*0.35);
  vec2 fl=clamp(vFlow,-2.0,2.0);
  float n1=wfbm(wp*2.2-fl*ph*1.6+uTime*0.03);
  float n2=wfbm(wp*2.2-fl*fract(ph+0.5)*1.6+vec2(3.7,1.3)-uTime*0.03);
  wn=mix(n1,n2,abs(ph*2.0-1.0));
  float dep=clamp(vInfo.x/1.4,0.0,1.0);
  wcol=mix(vec3(0.44,0.80,0.88),vec3(0.08,0.29,0.50),dep);
  wcol+=(wn-0.5)*0.16;
  wcol+=smoothstep(0.64,0.8,wn)*0.16;
  float fo=clamp(vInfo.y,0.0,1.0);
  float fm=smoothstep(0.74-fo*0.3,0.78-fo*0.3,wn)*smoothstep(0.03,0.3,fo);
  wcol=mix(wcol,vec3(0.94,0.98,1.0),fm);
  walpha=max(mix(0.58,0.9,dep),fm*0.95);
}else{
  // cortina de cascada: vetas que caen, espuma arriba y abajo
  vec2 q=vec2(vWUv.x*6.0,vWPos.y*1.2+uTime*3.4);
  if(uPix>0.5){vec2 qs=vec2(2.67,6.0)*uPix/16.0;q=floor(q*qs)/qs;}
  wn=wvn(vec2(q.x,q.y*0.45))*0.6+wvn(q*vec2(1.0,1.7)+5.0)*0.4;
  wcol=mix(vec3(0.46,0.76,0.9),vec3(0.96,0.99,1.0),smoothstep(0.42,0.78,wn));
  float lip=smoothstep(0.14,0.0,vWUv.y)*0.6+smoothstep(0.72,1.0,vWUv.y);
  wcol=mix(wcol,vec3(0.97,0.99,1.0),clamp(lip,0.0,1.0)*0.85);
  walpha=(0.42+0.5*smoothstep(0.3,0.75,wn)+lip*0.3)*clamp(vInfo.x,0.0,1.0);
}
vec4 diffuseColor=vec4(wcol,walpha*opacity);
`;
const WATER_NORMAL = `
if(vInfo.z<0.5){
  vec2 gp=vWPos.xz*3.0+uTime*vec2(0.21,0.17)-vFlow*uTime*0.4;
  float e=0.09,a0=wvn(gp),ax=wvn(gp+vec2(e,0.0)),az=wvn(gp+vec2(0.0,e));
  normal=normalize(normal+vec3(a0-ax,0.0,a0-az)/e*0.1);
}
`;

function waterPatch(mat) {
  patchMat(mat, {});
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = function (sh) {
    base(sh);
    sh.uniforms.uTime = WU.uTime; sh.uniforms.uPix = WU.uPix;
    sh.vertexShader = 'attribute vec2 aFlow;\nattribute vec3 aInfo;\nattribute vec2 aUv;\nvarying vec2 vFlow;\nvarying vec3 vInfo;\nvarying vec2 vWUv;\nvarying vec3 vWPos;\nuniform float uTime;\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.y+=(sin(transformed.x*3.1+uTime*1.7)+sin(transformed.z*2.7-uTime*1.3))*0.012*(1.0-aInfo.z);\n  vFlow=aFlow;vInfo=aInfo;vWUv=aUv;vWPos=transformed;');
    sh.fragmentShader = 'varying vec2 vFlow;\nvarying vec3 vInfo;\nvarying vec2 vWUv;\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uPix;\n' + WATER_NOISE
      + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', WATER_COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WATER_NORMAL);
  };
  return mat;
}

let SURF_Q = G.CELLS; const CURT_Q = 2400;
function waterGeo(q) {
  const g = new T3.BufferGeometry(), v = q * 6;
  const at = (n, s) => { const a = new T3.BufferAttribute(new Float32Array(v * s), s); a.setUsage(T3.DynamicDrawUsage); g.setAttribute(n, a); };
  at('position', 3); at('normal', 3); at('aFlow', 2); at('aInfo', 3); at('aUv', 2);
  g.setDrawRange(0, 0); g.boundingSphere = new T3.Sphere(new T3.Vector3(0, 2, 0), 40);
  return g;
}
let surfGeo = waterGeo(SURF_Q); const curtGeo = waterGeo(CURT_Q);
export const waterMat = waterPatch(new T3.MeshPhongMaterial({ color: 0xffffff, transparent: true, shininess: 110, specular: 0xcfeeff, emissive: 0x3a6f86, emissiveIntensity: .3 }));
export const curtMat = waterPatch(new T3.MeshPhongMaterial({ color: 0xffffff, transparent: true, shininess: 50, specular: 0xcfeeff, side: T3.DoubleSide, depthWrite: false, emissive: 0x9cc9dd, emissiveIntensity: .3 }));
export let waterMesh;
let curtMesh;

const PMAX = 600, pPos = new Float32Array(PMAX * 3), parts = [];
const pGeo = new T3.BufferGeometry(); pGeo.setAttribute('position', new T3.BufferAttribute(pPos, 3)); pGeo.setDrawRange(0, 0);
const pts = new T3.Points(pGeo, new T3.PointsMaterial({ color: 0xeaf7ff, size: .09, transparent: true, opacity: .9, depthWrite: false }));

export function initWater(scene) {
  waterMesh = new T3.Mesh(surfGeo, waterMat);
  waterMesh.frustumCulled = false; waterMesh.receiveShadow = true; waterMesh.renderOrder = 1;
  waterMesh.userData.quadCell = new Int32Array(SURF_Q);
  scene.add(waterMesh);
  curtMesh = new T3.Mesh(curtGeo, curtMat);
  curtMesh.frustumCulled = false; curtMesh.renderOrder = 2;
  scene.add(curtMesh);
  pts.frustumCulled = false; scene.add(pts);
}

export const TICK = .05, GRAV = 9.8, DAMP = .993, SUB = 4, DROP = .35, WET = .02;
export const pours = [];

export function resetWater() { G.FLX.fill(0); G.Wprev.set(G.W); G.VX.fill(0); G.VZ.fill(0); G.FOAM.fill(0); pours.length = 0; }
function waterBox() {
  let x0 = G.N, z0 = G.N, x1 = -1, z1 = -1;
  for (let i = 0; i < G.CELLS; i++) { if (G.W[i] > 0 || G.FLX[i * 4] > 0) { const x = i % G.N, z = (i / G.N) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } }
  for (const sp of G.springs) { const x = cxOf(sp.cell), z = czOf(sp.cell); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (const pr of pours) { const x = cxOf(pr.cell), z = czOf(pr.cell); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  G.WB = x1 < 0 ? [0, -1, 0, -1] : [Math.max(0, x0 - 2), Math.min(G.N - 1, x1 + 2), Math.max(0, z0 - 2), Math.min(G.N - 1, z1 + 2)];
}

export function simWater() {
  G.Wprev.set(G.W);
  waterBox();
  // agua vertida: cae durante un momento y se reparte un poco alrededor
  for (let k = pours.length - 1; k >= 0; k--) {
    const pr = pours[k], a = Math.min(pr.left, .16), x = cxOf(pr.cell), z = czOf(pr.cell);
    G.W[pr.cell] += a * .52;
    for (const [dx, dz] of DIRS) { const nx = x + dx, nz = z + dz; G.W[inb(nx, nz) ? I(nx, nz) : pr.cell] += a * .12; }
    pr.left -= a; if (pr.left <= 1e-4) pours.splice(k, 1);
  }
  const dt = TICK / SUB;
  for (let st = 0; st < SUB; st++) {
    for (const sp of G.springs) if (!sp.cap || G.W[sp.cell] < sp.cap) G.W[sp.cell] += sp.rate / SUB;
    for (let bz = G.WB[2]; bz <= G.WB[3]; bz++) for (let bx = G.WB[0]; bx <= G.WB[1]; bx++) {
      const i = bz * G.N + bx, w = G.W[i], o = i * 4;
      if (w <= 1e-4) { G.FLX[o] = G.FLX[o + 1] = G.FLX[o + 2] = G.FLX[o + 3] = 0; continue; }
      const x = i % G.N, z = (i / G.N) | 0, si = G.H[i] + w; let sum = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        let dh;
        if (nx < 0 || nz < 0 || nx >= G.N || nz >= G.N) dh = G.edgeDrain ? w * .9 : -1;
        else { const j = nz * G.N + nx; dh = si - (G.H[j] + G.W[j]); }
        let f = G.FLX[o + d] * DAMP + dt * GRAV * dh;
        if (f < 0) f = 0;
        G.FLX[o + d] = f; sum += f;
      }
      if (sum > 0) { const k = w / (sum * dt); if (k < 1) { G.FLX[o] *= k; G.FLX[o + 1] *= k; G.FLX[o + 2] *= k; G.FLX[o + 3] *= k; } }
    }
    for (let bz = G.WB[2]; bz <= G.WB[3]; bz++) for (let bx = G.WB[0]; bx <= G.WB[1]; bx++) {
      const i = bz * G.N + bx, x = bx, z = bz, o = i * 4;
      let inn = 0;
      if (x > 0) inn += G.FLX[(i - 1) * 4];
      if (x < G.N - 1) inn += G.FLX[(i + 1) * 4 + 1];
      if (z > 0) inn += G.FLX[(i - G.N) * 4 + 2];
      if (z < G.N - 1) inn += G.FLX[(i + G.N) * 4 + 3];
      const w = G.W[i] + dt * (inn - (G.FLX[o] + G.FLX[o + 1] + G.FLX[o + 2] + G.FLX[o + 3]));
      G.W[i] = w > 0 ? w : 0;
    }
  }
  // el lago desagua lo que sobra por encima de su nivel: así nunca se desborda
  for (const sk of G.sinks) { const ex = G.H[sk.cell] + G.W[sk.cell] - sk.level; if (ex > 0) G.W[sk.cell] -= Math.min(G.W[sk.cell], ex * .5); }
  G.foamT.fill(0);
  for (let bz = G.WB[2]; bz <= G.WB[3]; bz++) for (let bx = G.WB[0]; bx <= G.WB[1]; bx++) {
    const i = bz * G.N + bx; let w = G.W[i];
    if (w > 0) { w -= G.evap; if (w < WET) w -= .003; G.W[i] = w > 0 ? w : 0; }
    const x = i % G.N, z = (i / G.N) | 0, o = i * 4, d = Math.max(G.W[i], .08);
    G.VX[i] = ((x > 0 ? G.FLX[(i - 1) * 4] : 0) - G.FLX[o + 1] + G.FLX[o] - (x < G.N - 1 ? G.FLX[(i + 1) * 4 + 1] : 0)) * .5 / d;
    G.VZ[i] = ((z > 0 ? G.FLX[(i - G.N) * 4 + 2] : 0) - G.FLX[o + 3] + G.FLX[o + 2] - (z < G.N - 1 ? G.FLX[(i + G.N) * 4 + 3] : 0)) * .5 / d;
    if (G.W[i] < WET) continue;
    G.foamT[i] += Math.min(.45, Math.max(0, Math.hypot(G.VX[i], G.VZ[i]) - 1.2) * .1);
    const si = G.H[i] + G.W[i];
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], nz = z + DIRS[k][1]; if (nx < 0 || nz < 0 || nx >= G.N || nz >= G.N) continue;
      const j = nz * G.N + nx, sj = G.H[j] + (G.W[j] >= WET ? G.W[j] : 0);
      if (si - sj > DROP && G.FLX[o + k] > .02) G.foamT[j] += Math.min(1, G.FLX[o + k] * .9);
      else if (G.W[j] < WET && G.H[j] >= si - .05) G.foamT[i] += .07;
    }
  }
  for (let i = 0; i < G.CELLS; i++) G.FOAM[i] += (Math.min(1, G.foamT[i]) - G.FOAM[i]) * .3;
}

function surfAt(i) { return G.H[i] + G.Wr[i]; }
function cornerH(cx, cz, si) {
  // media de las superficies mojadas que tocan la esquina y están a nivel parecido
  let s = 0, n = 0;
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= G.N || z >= G.N) continue;
    const j = z * G.N + x; if (G.Wr[j] < .004) continue;
    const sj = surfAt(j); if (Math.abs(sj - si) > .4) continue;
    s += sj; n++;
  }
  return n ? s / n : si;
}

export function buildWater(alpha, dt, now, withFx) {
  for (let i = 0; i < G.CELLS; i++) G.Wr[i] = G.Wprev[i] + (G.W[i] - G.Wprev[i]) * alpha;
  // superficie
  const P = surfGeo.attributes.position.array, Nn = surfGeo.attributes.normal.array, F = surfGeo.attributes.aFlow.array,
    In = surfGeo.attributes.aInfo.array, Uv = surfGeo.attributes.aUv.array, qc = waterMesh.userData.quadCell;
  let v = 0, q = 0;
  const put = (x, y, z, fx, fz, dep, fo) => {
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; Nn[v * 3] = 0; Nn[v * 3 + 1] = 1; Nn[v * 3 + 2] = 0;
    F[v * 2] = fx; F[v * 2 + 1] = fz; In[v * 3] = dep; In[v * 3 + 1] = fo; In[v * 3 + 2] = 0; Uv[v * 2] = 0; Uv[v * 2 + 1] = 0; v++;
  };
  const outF = i => G.FLX[i * 4] + G.FLX[i * 4 + 1] + G.FLX[i * 4 + 2] + G.FLX[i * 4 + 3];
  const shows = i => G.Wr[i] >= WET || (G.Wr[i] >= .004 && outF(i) > .004);
  for (let i = 0; i < G.CELLS; i++) {
    if (!shows(i)) continue;
    const x = i % G.N, z = (i / G.N) | 0, si = G.H[i] + Math.max(G.Wr[i], .03), x0 = x - G.N / 2, z0 = z - G.N / 2, x1 = x0 + 1, z1 = z0 + 1;
    const h00 = cornerH(x, z, si) + .012, h01 = cornerH(x, z + 1, si) + .012, h10 = cornerH(x + 1, z, si) + .012, h11 = cornerH(x + 1, z + 1, si) + .012;
    const fx = G.VX[i], fz = G.VZ[i], dep = G.Wr[i], fo = G.FOAM[i];
    put(x0, h00, z0, fx, fz, dep, fo); put(x0, h01, z1, fx, fz, dep, fo); put(x1, h10, z0, fx, fz, dep, fo);
    put(x1, h10, z0, fx, fz, dep, fo); put(x0, h01, z1, fx, fz, dep, fo); put(x1, h11, z1, fx, fz, dep, fo);
    qc[q++] = i;
  }
  surfGeo.setDrawRange(0, v);
  for (const n of ['position', 'normal', 'aFlow', 'aInfo', 'aUv']) surfGeo.attributes[n].needsUpdate = true;

  // cascadas: cortinas donde el agua cae a una casilla más baja o por el borde del pedestal
  const CP = curtGeo.attributes.position.array, CN = curtGeo.attributes.normal.array, CI = curtGeo.attributes.aInfo.array,
    CU = curtGeo.attributes.aUv.array, CF = curtGeo.attributes.aFlow.array;
  let c = 0;
  const cput = (x, y, z, nx, nz, str, u, vv) => {
    CP[c * 3] = x; CP[c * 3 + 1] = y; CP[c * 3 + 2] = z; CN[c * 3] = nx; CN[c * 3 + 1] = 0; CN[c * 3 + 2] = nz;
    CI[c * 3] = str; CI[c * 3 + 1] = 0; CI[c * 3 + 2] = 1; CU[c * 2] = u; CU[c * 2 + 1] = vv; CF[c * 2] = 0; CF[c * 2 + 1] = 0; c++;
  };
  const curtain = (cx, cz, dx, dz, top, bot, str, out0, out1, wd) => {
    if (c + 6 > CURT_Q * 6 || top - bot < .05) return;
    const px = -dz, pz = dx;
    const ax = cx + dx * out0, az = cz + dz * out0, bx = cx + dx * out1, bz = cz + dz * out1;
    const hw = (wd || 1) * .5;
    const t0x = ax - px * hw, t0z = az - pz * hw, t1x = ax + px * hw, t1z = az + pz * hw, b0x = bx - px * hw, b0z = bz - pz * hw, b1x = bx + px * hw, b1z = bz + pz * hw;
    cput(t0x, top, t0z, dx, dz, str, 0, 0); cput(b0x, bot, b0z, dx, dz, str, 0, 1); cput(t1x, top, t1z, dx, dz, str, 1, 0);
    cput(t1x, top, t1z, dx, dz, str, 1, 0); cput(b0x, bot, b0z, dx, dz, str, 0, 1); cput(b1x, bot, b1z, dx, dz, str, 1, 1);
  };
  for (let i = 0; i < G.CELLS; i++) {
    if (!shows(i)) continue;
    const x = i % G.N, z = (i / G.N) | 0, o = i * 4, si = G.H[i] + Math.max(G.Wr[i], .03) + .012, cx = wx(x), cz = wz(z);
    for (let k = 0; k < 4; k++) {
      const dx = DIRS[k][0], dz = DIRS[k][1], nx = x + dx, nz = z + dz, f = G.FLX[o + k];
      if (nx < 0 || nz < 0 || nx >= G.N || nz >= G.N) {
        if (!G.edgeDrain || f < .01) continue;
        const str = Math.min(1, .5 + f * 1.6);
        curtain(cx, cz, dx, dz, si, .02, str, .5, .56);          // hasta el borde del pedestal
        curtain(cx, cz, dx, dz, .02, -1.3, str * .8, .9, .98);       // y del pedestal hacia abajo
        if (withFx && Math.random() < str * dt * 6) spawn(cx + dx * .62 + (Math.random() - .5) * .8 * dz, .05, cz + dz * .62 + (Math.random() - .5) * .8 * dx, dx * .6, .4, dz * .6);
        continue;
      }
      const j = nz * G.N + nx, sj = G.H[j] + (G.Wr[j] >= WET ? G.Wr[j] + .012 : 0);
      if (si - sj <= DROP || f < .008 || G.H[j] >= si) continue;
      const str = Math.min(1, .55 + f * 1.6), fall = si - sj;
      curtain(cx, cz, dx, dz, si, sj, str, .5, .5 + Math.min(.35, .08 + fall * .06));
      if (withFx && fxOk(j) && Math.random() < str * dt * 14) {
        const lx = cx + dx * (.62 + Math.random() * .2) + (Math.random() - .5) * .8 * dz, lz = cz + dz * (.62 + Math.random() * .2) + (Math.random() - .5) * .8 * dx;
        spawn(lx, sj, lz, dx * .4, 1 + fall * .35, dz * .4);
      }
    }
  }
  // chorro que cae del cielo mientras se vierte
  for (const pr of pours) {
    const x = wx(cxOf(pr.cell)), z = wz(czOf(pr.cell)), top = G.H[pr.cell] + 4.5, bot = surfAt(pr.cell) + .02;
    curtain(x, z, 0, 1, top, bot, .95, 0, 0, .32); curtain(x, z, 1, 0, top, bot, .95, 0, 0, .32);
    if (withFx && Math.random() < dt * 30) spawn(x + (Math.random() - .5) * .5, bot, z + (Math.random() - .5) * .5, 0, 1.6, 0);
  }
  curtGeo.setDrawRange(0, c);
  for (const n of ['position', 'normal', 'aFlow', 'aInfo', 'aUv']) curtGeo.attributes[n].needsUpdate = true;
}

export function spawn(x, y, z, vx, vy, vz) {
  if (parts.length >= PMAX) return;
  parts.push({ x, y, z, vx: vx + (Math.random() - .5) * .8, vy: vy * (.5 + Math.random() * .7), vz: vz + (Math.random() - .5) * .8, life: .6 + Math.random() * .6 });
}
export function updateParts(dt) {
  for (let k = parts.length - 1; k >= 0; k--) {
    const p = parts[k]; p.vy -= 7 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
    if (p.life <= 0 || p.y < -4) { parts[k] = parts[parts.length - 1]; parts.pop(); }
  }
  let n = 0; for (const p of parts) { pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z; n++; }
  pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true;
}
export function clearParts() { parts.length = 0; }

export function resizeWater(cells) {
  SURF_Q = cells;
  const og = surfGeo; surfGeo = waterGeo(SURF_Q); if (waterMesh) waterMesh.geometry = surfGeo; og.dispose();
  surfGeo.boundingSphere.radius = G.N * 1.2; curtGeo.boundingSphere.radius = G.N * 1.2;
  if (waterMesh) waterMesh.userData.quadCell = new Int32Array(SURF_Q);
  G.FLX = new Float32Array(cells * 4); G.Wprev = new Float32Array(cells); G.Wr = new Float32Array(cells);
  G.VX = new Float32Array(cells); G.VZ = new Float32Array(cells); G.FOAM = new Float32Array(cells); G.foamT = new Float32Array(cells);
}
