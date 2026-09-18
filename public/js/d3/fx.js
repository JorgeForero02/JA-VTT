/* Efectos 2.5D: luciérnagas, niebla, explosiones y temblor de cámara. */
import * as THREE from '../vendor/three.module.min.js';
import { G, S, R, U, DIRS, I, cxOf, czOf, wx, wz, inb, MAXH } from './ctx.js';
import { mkCanvas, rng, MATS, OBJ_KINDS } from './art.js';
import { spawn } from './water.js';
const T3 = THREE;

// Hooks que engine.js rellena para funciones que aún viven allí.
// `moved`: la ficha terminó su camino y el shell debe mandar la posición al servidor. `selected`: cambió la ficha elegida.
// `context`: clic derecho sin arrastrar; qué hay bajo el puntero, para que el shell abra el menú.
export const hooks = { terrainChanged: null, removeObj: null, removeMount: null, removeLight: null, charAt: null, refreshTufts: null, envEm: null, blocksMove: null, closedDoor: null, flashLight: null, relayout: null, maybeGrow: null, moved: () => {}, selected: () => {}, context: () => {}, getImage: null, artChanged: () => {}, atlasChanged: () => {} };

/* ---------- luciérnagas ---------- */
const FF = 26, ffPos = new Float32Array(FF * 3), ffSeed = [];
const ffGeo = new T3.BufferGeometry(); ffGeo.setAttribute('position', new T3.BufferAttribute(ffPos, 3));
const ffMat = new T3.PointsMaterial({ color: 0xfff09a, size: .16, transparent: true, opacity: 0, depthWrite: false, blending: T3.AdditiveBlending });
let ff;

/* ---------- bancos de niebla que flotan ---------- */
function mistCanvas() {
  const c = mkCanvas(128, 128), x = c.getContext('2d'), r = rng(9);
  for (let k = 0; k < 30; k++) { const px = 22 + r() * 84, py = 40 + r() * 48, rad = 14 + r() * 30;
    const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  return c;
}
let mistTex, mistGroup;

let debMesh, embPts;
const dummy = new T3.Object3D();
const dc = new T3.Color();

export function initFx(scene) {
  ff = new T3.Points(ffGeo, ffMat); ff.frustumCulled = false; scene.add(ff);
  { const r = rng(5); for (let k = 0; k < FF; k++) ffSeed.push({ x: wx(9 + r() * 11), z: wz(8 + r() * 12), y: 2.4 + r() * 1.6, p: r() * 6.28, s: .5 + r() }); }

  mistTex = new T3.CanvasTexture(mistCanvas());
  mistGroup = new T3.Group(); scene.add(mistGroup);
  const isMobile = window.matchMedia('(pointer: coarse)').matches;
  { const r = rng(31), n = isMobile ? 7 : 12;
    for (let k = 0; k < n; k++) {
      const sp = new T3.Sprite(new T3.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0 }));
      const w = 6 + r() * 5; sp.scale.set(w, w * .36, 1);
      sp.userData = { x: (r() - .5) * G.N, z: (r() - .5) * G.N, v: .25 + r() * .35, ph: r() * 6 };
      mistGroup.add(sp);
    } }

  debMesh = new T3.InstancedMesh(new T3.BoxGeometry(.14, .14, .14), new T3.MeshLambertMaterial({ color: 0xffffff }), DEB_MAX);
  debMesh.count = 0; debMesh.frustumCulled = false; debMesh.castShadow = true; scene.add(debMesh);
  { const c0 = new T3.Color(1, 1, 1); for (let k = 0; k < DEB_MAX; k++) debMesh.setColorAt(k, c0); }

  embPts = new T3.Points(embGeo, new T3.PointsMaterial({ color: 0xffa24a, size: .11, transparent: true, opacity: .95, depthWrite: false, blending: T3.AdditiveBlending }));
  embPts.frustumCulled = false; scene.add(embPts);
}

export function updateFireflies(dt, s, fly) {
  ff.visible = fly > .02;
  if (ff.visible) {
    ffMat.opacity = fly * (.75 + .25 * Math.sin(s * 3));
    ffSeed.forEach((f, n) => { ffPos[n * 3] = f.x + Math.sin(s * f.s + f.p) * .8; ffPos[n * 3 + 1] = f.y + Math.sin(s * f.s * 1.7 + f.p) * .35; ffPos[n * 3 + 2] = f.z + Math.cos(s * f.s * .8 + f.p) * .8; });
    ffGeo.attributes.position.needsUpdate = true;
  }
}

export function updateMist(dt, t) {
  U.uMist.value += (S.mist - U.uMist.value) * Math.min(1, dt * 3); U.uMistT.value = t;
  const op = U.uMist.value * (S.view === 'gm' ? .5 : .3);
  mistGroup.visible = op > .01;
  mistGroup.children.forEach(m => {
    const d = m.userData; d.x += d.v * dt; if (d.x > G.N / 2 + 4) d.x = -G.N / 2 - 4;
    m.position.set(d.x, U.uMistBase.value + .35 + Math.sin(t * .4 + d.ph) * .15, d.z);
    m.material.opacity = op * (.7 + .3 * Math.sin(t * .3 + d.ph)); m.material.color.copy(U.uMistCol.value);
  });
}

/* =====================================================================
   EXPLOSIONES
   ===================================================================== */
export const BOOM_LEVELS = {
  pequena: { name: 'Pequeña', ft: 5, r: 1.25, depth: 1, rim: 0, light: 1.6 },
  media: { name: 'Media', ft: 10, r: 2.25, depth: 2, rim: .2, light: 2.4 },
  grande: { name: 'Grande', ft: 20, r: 4.2, depth: 3, rim: .35, light: 3.2 },
  enorme: { name: 'Enorme', ft: 30, r: 6.2, depth: 4, rim: .45, light: 4 },
};
const SCORCH = MATS.findIndex(m => m.scorch);
const flashes = [], booms = [];
export const boomQueue = [];
export const undoStack = [];
export const shakeOff = new T3.Vector3();

// --- efectos visuales ---
const fireMat = new T3.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false });
const coreMat = new T3.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false });
const waveMat = new T3.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, side: T3.DoubleSide });
const sphereGeo = new T3.SphereGeometry(1, 20, 14), waveGeo = new T3.RingGeometry(.8, 1, 40); waveGeo.rotateX(-Math.PI / 2);
const DEB_MAX = 400;
let debris = [], smokes = [];
const EMB_MAX = 300, embPos = new Float32Array(EMB_MAX * 3), embers = [];
const embGeo = new T3.BufferGeometry(); embGeo.setAttribute('position', new T3.BufferAttribute(embPos, 3)); embGeo.setDrawRange(0, 0);

function spawnDebris(x, y, z, col, n, power) {
  for (let k = 0; k < n && debris.length < DEB_MAX; k++) {
    const a = Math.random() * Math.PI * 2, sp = (.8 + Math.random() * 2.4) * power;
    debris.push({ x: x + (Math.random() - .5) * .6, y: y + .2, z: z + (Math.random() - .5) * .6, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 4 * power, vz: Math.sin(a) * sp,
      rx: Math.random() * 6, ry: Math.random() * 6, life: 2 + Math.random() * 1.5, col: dc.set(col).offsetHSL(0, 0, (Math.random() - .5) * .15).getHex(), s: .6 + Math.random() * .9 });
  }
}
function spawnSmoke(x, y, z, n, size) {
  for (let k = 0; k < n; k++) {
    const sp = new T3.Sprite(new T3.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0, color: 0x6b6560 }));
    const s = size * (.5 + Math.random() * .6); sp.scale.set(s, s, 1);
    sp.position.set(x + (Math.random() - .5) * size * .8, y + .3 + Math.random() * .6, z + (Math.random() - .5) * size * .8);
    sp.userData = { t: 0, life: 2.6 + Math.random() * 1.8, s, vy: .5 + Math.random() * .7, vx: (Math.random() - .5) * .4, vz: (Math.random() - .5) * .4 };
    R.scene.add(sp); smokes.push(sp);
  }
}
function spawnEmbers(x, y, z, n, r) {
  for (let k = 0; k < n && embers.length < EMB_MAX; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    embers.push({ x: x + Math.cos(a) * d, y: y + .1, z: z + Math.sin(a) * d, vx: (Math.random() - .5) * .6, vy: .6 + Math.random() * 1.6, vz: (Math.random() - .5) * .6, life: 1 + Math.random() * 2.5 });
  }
}

// --- explosión ---
function snapshot() {
  undoStack.push({ N: G.N, H: G.H.slice(), M: G.M.slice(), objs: [], mounts: [], lights: [] });
  if (undoStack.length > 5) undoStack.shift();
  return undoStack[undoStack.length - 1];
}
export function explode(cell,levelKey,chained) {
  const L = BOOM_LEVELS[levelKey], cx = cxOf(cell), cz = czOf(cell);
  const snap = chained || snapshot();
  const Rr = L.r, rc = Math.ceil(Rr + 1), top = G.H[cell] + .3, wxp = wx(cx), wzp = wz(cz);
  const affected = [], chain = [];
  // cráter, suelo quemado y agua evaporada
  for (let z = cz - rc; z <= cz + rc; z++) for (let x = cx - rc; x <= cx + rc; x++) {
    if (!inb(x, z)) continue;
    const i = I(x, z), d = Math.hypot(x - cx, z - cz);
    if (d <= Rr) {
      const k = 1 - (d / Rr) * (d / Rr), drop = Math.max(0, Math.round(L.depth * k + (Math.random() - .5) * .8));
      const nh = Math.max(1, G.H[i] - drop);
      if (nh < G.H[i]) {
        const mat = MATS[G.M[i]] && MATS[G.M[i]].swatch || '#777';
        spawnDebris(wx(x), G.H[i], wz(z), mat, Math.min(6, 2 + (G.H[i] - nh) * 2), 1 + L.depth * .25);
        G.H[i] = nh;
      }
      if (SCORCH >= 0 && d <= Rr * .85 && Math.random() < .9) G.M[i] = SCORCH;
      G.W[i] *= d < Rr * .7 ? 0 : .3;
    } else if (d <= Rr + 1 && L.rim && Math.random() < L.rim && G.H[i] < MAXH && !G.objs.has(i) && !hooks.charAt(i, null)) {
      G.H[i]++;
    }
  }
  // objetos: los explosivos se encadenan, el resto se rompe
  Array.from(G.objs.entries()).forEach(([i, o]) => {
    const d = Math.hypot(cxOf(i) - cx, czOf(i) - cz), K = OBJ_KINDS[o.kind];
    if (K.explosive && i !== cell && d <= Rr * 1.35) { chain.push([i, K.explosive, d]); return; }
    if (d > Rr * .95) return;
    snap.objs.push({ i, kind: o.kind, rot: o.rot, open: o.open });
    spawnDebris(wx(cxOf(i)), G.H[i] + .4, wz(czOf(i)), K.tree != null ? '#4f8a3c' : '#8a5a2e', 5, 1);
    hooks.removeObj(i);
  });
  if (G.objs.has(cell) && OBJ_KINDS[G.objs.get(cell).kind].explosive) {
    const o = G.objs.get(cell); snap.objs.push({ i: cell, kind: o.kind, rot: o.rot, open: o.open }); hooks.removeObj(cell);
  }
  Array.from(G.mounts.entries()).forEach(([k, o]) => {
    const f = I(cxOf(o.wall) + DIRS[o.dir][0], czOf(o.wall) + DIRS[o.dir][1]);
    if (Math.hypot(cxOf(f) - cx, czOf(f) - cz) <= Rr) { snap.mounts.push({ wall: o.wall, dir: o.dir, kind: o.kind }); hooks.removeMount(k); }
  });
  G.lights.slice().forEach(l => {
    if (l.carrier) return;
    if (Math.hypot(cxOf(l.cell) - cx, czOf(l.cell) - cz) <= Rr * .9) { snap.lights.push({ preset: l.preset, cell: l.cell, mount: l.mount && { wall: l.mount.wall, dir: l.mount.dir } }); hooks.removeLight(l); }
  });
  G.tufts.forEach(m => { const i = m.userData.cell; if (Math.hypot(cxOf(i) - cx, czOf(i) - cz) <= Rr) m.userData.burnt = true; });
  G.chars.forEach(c => {
    const cc = c.seg ? c.seg.to : c.cell, d = Math.hypot(cxOf(cc) - cx, czOf(cc) - cz);
    if (d <= Rr) { affected.push(c.name); c.hit = 1; }
  });
  // efectos
  booms.push({ x: wxp, y: top, z: wzp, R: Rr, t: 0,
    fire: new T3.Mesh(sphereGeo, fireMat.clone()), core: new T3.Mesh(sphereGeo, coreMat.clone()), wave: new T3.Mesh(waveGeo, waveMat.clone()) });
  const b = booms[booms.length - 1]; [b.fire, b.core, b.wave].forEach(m => { m.position.set(wxp, top, wzp); R.scene.add(m); });
  b.wave.position.y = G.H[cell] + .08;
  flashes.push({ cell, r: Rr + 3.5, i: L.light, t: 0 });
  spawnSmoke(wxp, G.H[cell], wzp, 6 + L.depth * 3, 1.4 + Rr * .6);
  spawnEmbers(wxp, G.H[cell], wzp, 30 + L.depth * 25, Rr);
  for (let k = 0; k < 10 + L.depth * 8; k++) spawn(wxp + (Math.random() - .5) * Rr, top, wzp + (Math.random() - .5) * Rr, (Math.random() - .5) * 3, 2 + Math.random() * 3, (Math.random() - .5) * 3);
  G.shake = Math.max(G.shake, .15 + L.depth * .12);
  chain.forEach(([i, lv, d]) => boomQueue.push({ cell: i, level: lv, t: .18 + d * .08, snap }));
  hooks.terrainChanged(); hooks.refreshTufts(); G.visionDirty = true;
  G.FLX.fill(0); G.Wprev.set(G.W);
  if (!chained) R.toast('¡Explosión ' + L.name.toLowerCase() + ' (' + L.ft + ' pies)!' + (affected.length ? ' Afecta a: ' + affected.join(', ') + '.' : ''));
  return snap;
}

// --- animación ---
export function flashLight() {
  // destello: luz cálida sin sombras que se apaga en un segundo
  for (const f of flashes) {
    const k = Math.max(0, 1 - f.t / 1.1), amp = f.i * k * k, cx = cxOf(f.cell), cz = czOf(f.cell), rc = Math.ceil(f.r);
    for (let z = cz - rc; z <= cz + rc; z++) for (let x = cx - rc; x <= cx + rc; x++) {
      if (!inb(x, z)) continue; const d = Math.hypot(x - cx, z - cz); if (d > f.r) continue;
      const w = amp * (1 - d / f.r), j = I(x, z) * 3; G.lightAcc[j] += w; G.lightAcc[j + 1] += w * .62; G.lightAcc[j + 2] += w * .28;
    }
  }
}
export function updateBooms(dt) {
  for (let k = boomQueue.length - 1; k >= 0; k--) { const q = boomQueue[k]; q.t -= dt; if (q.t <= 0) { boomQueue.splice(k, 1);
    if (G.objs.has(q.cell) && OBJ_KINDS[G.objs.get(q.cell).kind].explosive) explode(q.cell, q.level, q.snap); } }
  for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t += dt; if (flashes[k].t > 1.1) flashes.splice(k, 1); }
  if (flashes.length) G.lightTick = 0;
  for (let k = booms.length - 1; k >= 0; k--) {
    const b = booms[k]; b.t += dt; const t = b.t;
    const g = Math.min(1, t / .35), e = 1 - Math.pow(1 - g, 3);
    b.fire.scale.setScalar(.2 + b.R * 1.05 * e); b.fire.material.opacity = Math.max(0, .85 * (1 - t / .75));
    b.core.scale.setScalar(.15 + b.R * .55 * e); b.core.material.opacity = Math.max(0, 1 - t / .4);
    const wv = Math.min(1, t / .6); b.wave.scale.setScalar(.3 + (b.R + 1.6) * wv); b.wave.material.opacity = Math.max(0, .7 * (1 - wv));
    b.fire.position.y = b.y + t * .8;
    if (t > 1) { [b.fire, b.core, b.wave].forEach(m => { R.scene.remove(m); m.material.dispose(); }); booms.splice(k, 1); }
  }
  // escombros que rebotan en el terreno
  let n = 0;
  for (let k = debris.length - 1; k >= 0; k--) {
    const p = debris[k]; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += dt * 6; p.ry += dt * 5; p.life -= dt;
    const gx = Math.round(p.x + G.N / 2 - .5), gz = Math.round(p.z + G.N / 2 - .5), gh = inb(gx, gz) ? G.H[I(gx, gz)] : -1.3;
    if (p.y < gh + .07 && p.vy < 0) { p.y = gh + .07; p.vy *= -.3; p.vx *= .55; p.vz *= .55; }
    if (p.life <= 0 || p.y < -6) { debris.splice(k, 1); continue; }
  }
  for (const p of debris) {
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, 0); dummy.scale.setScalar(p.s * Math.min(1, p.life / .5)); dummy.updateMatrix();
    debMesh.setMatrixAt(n, dummy.matrix); debMesh.setColorAt(n, dc.setHex(p.col)); n++;
  }
  dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
  debMesh.count = n; debMesh.instanceMatrix.needsUpdate = true; if (debMesh.instanceColor) debMesh.instanceColor.needsUpdate = true;
  for (let k = smokes.length - 1; k >= 0; k--) {
    const sp = smokes[k], u = sp.userData; u.t += dt; const a = u.t / u.life;
    sp.position.y += u.vy * dt; sp.position.x += u.vx * dt; sp.position.z += u.vz * dt;
    const s = u.s * (1 + a * 1.6); sp.scale.set(s, s, 1);
    sp.material.opacity = Math.min(1, u.t * 4) * (1 - a) * .75;
    sp.material.color.setRGB(.42 + .1 * a, .4 + .1 * a, .38 + .1 * a);
    if (a >= 1) { R.scene.remove(sp); sp.material.dispose(); smokes.splice(k, 1); }
  }
  let m = 0;
  for (let k = embers.length - 1; k >= 0; k--) { const p = embers[k]; p.vy -= .4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt; if (p.life <= 0) embers.splice(k, 1); }
  for (const p of embers) { embPos[m * 3] = p.x; embPos[m * 3 + 1] = p.y; embPos[m * 3 + 2] = p.z; m++; }
  embGeo.setDrawRange(0, m); embGeo.attributes.position.needsUpdate = true;
  // temblor de cámara
  G.shake = Math.max(0, G.shake - dt * .9);
  const s2 = G.shake * G.shake * 2.2; shakeOff.set((Math.random() - .5) * s2, (Math.random() - .5) * s2 * .6, (Math.random() - .5) * s2);
  // fichas alcanzadas: parpadean en rojo
  G.chars.forEach(c => { if (!c.hit) return; c.hit = Math.max(0, c.hit - dt * .8); const f = Math.sin(c.hit * 20) > 0 ? c.hit : 0; c.mesh.material.color.setRGB(1, 1 - .6 * f, 1 - .7 * f); });
}

// stub: la implementación completa de deshacer explosiones llega en la fase E.
export function undoBoom() {}
