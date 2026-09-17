/* Sprites, fichas, luces y movimiento del motor 2.5D. */
import * as THREE from '../vendor/three.module.min.js';
import { G, R, I, cxOf, czOf, wx, wz, inb, DIRS } from './ctx.js';
import { ART, CHAR_INFO, OBJ_KINDS, loadStyle } from './art.js';
import { WU } from './water.js';
import { patchMat } from './vision.js';
import { hooks } from './fx.js';
import { defFor } from './light-map.js';
const T3 = THREE;

export const decor = new T3.Group(), charsGroup = new T3.Group(), propGroup = new T3.Group();
export const spriteMats = new Set();

export function spriteMaterial(tex, tint) {
  const m = new T3.MeshLambertMaterial({ map: tex, alphaTest: .5, side: T3.DoubleSide, emissive: tint || 0xffffff, emissiveMap: tex, emissiveIntensity: hooks.envEm ? hooks.envEm() : .3 });
  if (tint) m.color.set(tint);
  patchMat(m, { origin: true }); spriteMats.add(m); return m;
}
export function depthMat(tex) { return new T3.MeshDepthMaterial({ depthPacking: T3.RGBADepthPacking, map: tex, alphaTest: .5, side: T3.DoubleSide }); }
export function spriteGeo(w, h) { const g = new T3.PlaneGeometry(w, h); g.translate(0, h / 2, 0); return g; }
function texFor(a) {
  if (a.t === 'char') { const ca = ART.art.chars[a.k], t = ART.TEX.chars[a.k].clone(); t.needsUpdate = true; t.repeat.set(1 / ca.n, 1); return t; }
  if (a.t === 'obj') return ART.TEX.objs[a.k];
  if (a.t === 'tuft') return ART.TEX.tuft;
  return ART.TEX.props[a.k];
}
export function makeSprite(a, w, h, shadow, sharedMat, tint) {
  const tex = texFor(a);
  const mat = sharedMat || spriteMaterial(tex, tint);
  const mesh = new T3.Mesh(spriteGeo(w, h), mat);
  mesh.rotation.order = 'YXZ'; mesh.castShadow = !!shadow;
  mesh.customDepthMaterial = depthMat(tex);
  mesh.userData.art = a; mesh.userData.tex = tex;
  return mesh;
}
export function flatGeo(w, h) { const g = new T3.PlaneGeometry(w, h); g.rotateX(-Math.PI / 2); g.translate(0, .03, 0); return g; }
export function mountGeo(kind) { const a = ART.art.objs[kind]; return spriteGeo(a.mw, a.mh); }
export let tuftMat = null, objMats = {};
export function sharedSpriteMats() {
  tuftMat = spriteMaterial(ART.TEX.tuft);
  objMats = {}; Object.keys(OBJ_KINDS).forEach(k => { objMats[k] = spriteMaterial(ART.TEX.objs[k]); });
}
export function doorTex(o) { const t = ART.TEX.objs.puerta.clone(); t.needsUpdate = true; t.repeat.set(.5, 1); t.offset.x = o && o.open ? .5 : 0; return t; }
export function restyle(key) {
  loadStyle(key);
  WU.uPix.value = ART.art.res;
  const done = new Set();
  [decor, charsGroup, propGroup].forEach(g => g.children.forEach(mesh => {
    const a = mesh.userData.art;
    const tex = a.t === 'obj' && OBJ_KINDS[a.k].door ? doorTex(G.objs.get(mesh.userData.cell)) : texFor(a);
    mesh.userData.tex = tex;
    if (!done.has(mesh.material)) { mesh.material.map = tex; mesh.material.emissiveMap = tex; mesh.material.needsUpdate = true; done.add(mesh.material); }
    mesh.customDepthMaterial.map = tex; mesh.customDepthMaterial.needsUpdate = true;
    let dims = null;
    if (a.t === 'char') { const c = mesh.userData.char; c.tex = tex; c.art = ART.art.chars[a.k]; dims = c.art; c.fi = 0; setFrame(c); }
    else if (a.t === 'obj') dims = ART.art.objs[a.k];
    if (mesh.userData.mount) { mesh.geometry.dispose(); mesh.geometry = mountGeo(a.k); }
    else if (dims) { mesh.geometry.dispose(); mesh.geometry = (a.t === 'obj' && OBJ_KINDS[a.k].flat) ? flatGeo(dims.w, dims.h) : spriteGeo(dims.w, dims.h); }
  }));
  Object.entries(objMats).forEach(([k, m]) => { const t = ART.TEX.objs[k]; if (t) { m.map = t; m.emissiveMap = t; m.needsUpdate = true; } });
  if (tuftMat) { tuftMat.map = ART.TEX.tuft; tuftMat.emissiveMap = ART.TEX.tuft; tuftMat.needsUpdate = true; }
  hooks.relayout();
}

export const LIGHT_PRESETS = {
  candle: { name: 'Vela', bright: 5, dim: 5, color: '#FFC878', intensity: .9, anim: 'flicker', sprite: 'torch', lh: .9, scale: .7 },
  torch: { name: 'Antorcha', bright: 20, dim: 20, color: '#FFA652', intensity: 1, anim: 'flicker', sprite: 'torch', lh: 1.3, scale: 1 },
  lantern: { name: 'Farol', bright: 30, dim: 30, color: '#FFD28F', intensity: 1, anim: 'soft', sprite: 'torch', lh: 1.3, scale: 1 },
  campfire: { name: 'Hoguera', bright: 20, dim: 20, color: '#FF8F3F', intensity: 1, anim: 'flicker', sprite: 'brazier', lh: 1, scale: 1.1 },
  brazier: { name: 'Brasero', bright: 10, dim: 15, color: '#FF7A35', intensity: .95, anim: 'flicker', sprite: 'brazier', lh: 1.1, scale: 1 },
  magic: { name: 'Luz mágica', bright: 20, dim: 20, color: '#DDE8FF', intensity: 1, anim: 'none', sprite: 'orb', lh: 1.5, scale: .9 },
  crystal: { name: 'Cristal arcano', bright: 10, dim: 20, color: '#A98BFF', intensity: .9, anim: 'pulse', sprite: 'crystal', lh: 1, scale: 1 },
  moon: { name: 'Rayo de luna', bright: 5, dim: 15, color: '#9DBBFF', intensity: .8, anim: 'none', sprite: 'orb', lh: 2, scale: .7 },
  daylight: { name: 'Luz diurna', bright: 60, dim: 60, color: '#FFF1D0', intensity: 1, anim: 'none', sprite: 'orb', lh: 2.4, scale: .8 },
  darkness: { name: 'Oscuridad mágica', bright: 15, dim: 0, color: '#000000', intensity: 1, anim: 'none', darkness: true, sprite: 'orb', lh: 1.2, scale: 1.1, tint: '#3a2a55' },
};
export const TOKEN_LIGHTS = ['none', 'candle', 'torch', 'lantern', 'bullseye', 'magic', 'crystal'];
/* La definición efectiva de una luz: la que trae del tablero (`def`) o la del preset del diorama. */
export const defOf = (l) => l.def || LIGHT_PRESETS[l.preset];
export const ENVS = {
  interior: { name: 'Interior', desc: 'Oscuro. Solo ven las luces y la visión en la oscuridad.', ambient: 0, dark: '#0B0E11', fogA: .82,
    sun: '#000000', si: 0, sp: [-8, 20, 10], sky: '#5a6478', gnd: '#141414', hi: .07, top: '#0b0e11', bot: '#1c222a', em: .05, gain: 1.05, fly: 0, flat: .15, mist: .25, mistCol: '#3a3530' },
  day: { name: 'Exterior de día', desc: 'Todo lo que esté a la vista se ve.', ambient: 1, dark: '#0E1316', fogA: .3,
    sun: '#fff0d8', si: 1, sp: [-8, 20, 10], sky: '#cfe6ff', gnd: '#7a6a48', hi: .55, top: '#7fb6dd', bot: '#f3dfb5', em: .3, gain: .14, fly: 0, flat: .8, mist: .12, mistCol: '#e8eef2' },
  dusk: { name: 'Atardecer', desc: 'Se ve a la vista, en penumbra.', ambient: .55, dark: '#1A1220', fogA: .5,
    sun: '#ff9a52', si: .9, sp: [-18, 7, 4], sky: '#8a78b8', gnd: '#5a3a3a', hi: .4, top: '#3e3a6b', bot: '#f0935a', em: .22, gain: .6, fly: .35, flat: .5, mist: .35, mistCol: '#e6b89a' },
  night: { name: 'Noche', desc: 'Luna tenue: se intuye el terreno; las criaturas, solo con luz.', ambient: .18, dark: '#081026', fogA: .7,
    sun: '#8aa6ff', si: .34, sp: [10, 16, -6], sky: '#3a4a86', gnd: '#1a1a2a', hi: .24, top: '#070b1e', bot: '#27335f', em: .1, gain: 1.05, fly: 1, flat: .28, mist: .45, mistCol: '#4c5a86' },
};

export function addChar(s) {
  const ca = ART.art.chars[s.kind];
  const a = { t: 'char', k: s.kind };
  const mesh = makeSprite(a, ca.w, ca.h, true);
  const info = CHAR_INFO[s.kind];
  const c = { id: s.kind + '-' + (G.chars.length + 1), vid: s.vid != null ? s.vid : null, kind: s.kind, name: s.name || info.name, pc: s.pc,
    owner: s.owner != null ? s.owner : null, dv: s.dv, sight: s.sight || 0, hidden: !!s.hidden,
    cell: I(s.at[0], s.at[1]), mesh, tex: mesh.userData.tex, art: ca, path: [], seg: null, ft: Math.random() * .1, fi: 0, dir: 1, carried: null,
    seed: Math.random() * 6, float: info.float || 0, gy: G.H[I(s.at[0], s.at[1])] };
  mesh.userData.char = c; charsGroup.add(mesh); G.chars.push(c);
  setCarried(c, s.light); setFrame(c);
  return c;
}
export function setFrame(c) { const list = c.seg ? c.art.run : c.art.idle; c.tex.offset.x = list[c.fi % list.length] / c.art.n; }
function setCarried(c, preset) {
  if (c.carried) { G.lights.splice(G.lights.indexOf(c.carried), 1); c.carried = null; }
  if (preset && preset !== 'none') { const l = { id: G.lightId++, preset, def: null, cell: c.cell, on: true, carrier: c, mesh: null, cache: null, seed: Math.random() * 6 }; G.lights.push(l); c.carried = l; }
  G.lightsDirty = true;
}
export function addLight(preset, cell, mount, def) {
  const P = def || LIGHT_PRESETS[preset], sc = P.scale * (mount ? .78 : 1);
  const mesh = makeSprite({ t: 'prop', k: P.sprite }, .55 * sc, 1.1 * sc, true, null, P.sprite === 'orb' ? (P.tint || P.color) : null);
  const l = { id: G.lightId++, preset, def: def || null, cell, on: true, carrier: null, mesh, cache: null, seed: Math.random() * 6, mount: mount || null };
  if (mount) { mesh.userData.fixed = true; mesh.rotation.set(0, Math.atan2(DIRS[mount.dir][0], DIRS[mount.dir][1]), 0); mesh.castShadow = false; l.mh = 1.1 * sc; }
  mesh.userData.light = l; propGroup.add(mesh); G.lights.push(l);
  G.lightsDirty = true; hooks.relayout();
  return l;
}
export function removeLight(l) {
  const k = G.lights.indexOf(l); if (k < 0) return; G.lights.splice(k, 1);
  if (l.mesh) { propGroup.remove(l.mesh); l.mesh.geometry.dispose(); spriteMats.delete(l.mesh.material); l.mesh.material.dispose(); }
  G.lightsDirty = true;
}

export const charAt = (i, except) => G.chars.some(c => c !== except && (c.cell === i || (c.seg && c.seg.to === i)));
export function findPath(c, to) {
  const from = c.cell; if (from === to) return [];
  const ok = j => !hooks.blocksMove(j) && G.W[j] < .7 && !charAt(j, c);
  if (!ok(to)) return null;
  const prev = new Int32Array(G.CELLS).fill(-1); prev[from] = from; const q = [from];
  while (q.length) {
    const cur = q.shift(); if (cur === to) break;
    const x = cxOf(cur), z = czOf(cur);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz; if (!inb(nx, nz)) continue;
      const j = I(nx, nz); if (prev[j] !== -1 || !ok(j) || Math.abs(G.H[j] - G.H[cur]) > 1) continue;
      prev[j] = cur; q.push(j);
    }
  }
  if (prev[to] === -1) return null;
  const out = []; for (let k = to; k !== from; k = prev[k]) out.push(k);
  return out.reverse();
}
export function select(c) { G.selected = c; }
export function moveTo(c, i) {
  const p = findPath(c, i);
  if (p === null) { R.toast('No hay camino: algún escalón mide más de un bloque o la casilla está ocupada.'); return; }
  c.path = p;
}
export function updateChars(dt, now, theta) {
  const rx = Math.cos(theta), rz = -Math.sin(theta);
  for (const c of G.chars) {
    const m = c.mesh;
    if (!c.seg && c.path.length) { c.seg = { from: c.cell, to: c.path.shift(), t: 0 }; c.fi = 0; if (c.pc) G.visionDirty = true; if (c.carried) G.lightsDirty = true; }
    let x, z;
    if (c.seg) {
      const s = c.seg; s.t = Math.min(1, s.t + dt * 3.4);
      const a = s.from, b = s.to, t = s.t, dh = G.H[b] - G.H[a];
      x = wx(cxOf(a)) + (wx(cxOf(b)) - wx(cxOf(a))) * t; z = wz(czOf(a)) + (wz(czOf(b)) - wz(czOf(a))) * t;
      c.gy = G.H[a] + dh * t + (c.float ? 0 : Math.sin(Math.PI * t) * (.18 + .25 * Math.abs(dh)));
      const dot = (cxOf(b) - cxOf(a)) * rx + (czOf(b) - czOf(a)) * rz;
      if (Math.abs(dot) > .01) c.dir = dot < 0 ? -1 : 1;
      if (t >= 1) { c.cell = b; c.seg = null; c.fi = 0; if (c.pc && !c.path.length) hooks.maybeGrow(b); if (!c.path.length && c.vid != null) hooks.moved(c); }
    } else {
      x = wx(cxOf(c.cell)); z = wz(czOf(c.cell));
      c.gy += (G.H[c.cell] - c.gy) * Math.min(1, dt * 10);
    }
    m.position.set(x, c.gy + (c.float ? c.float + Math.sin(now * 3 + c.seed) * .09 : 0), z);
    m.scale.x = c.dir;
    const list = c.seg ? c.art.run : c.art.idle;
    const step = c.seg ? .1 : (list.length > 2 ? .16 : .55);
    c.ft += dt; if (c.ft > step) { c.ft = 0; c.fi = (c.fi + 1) % list.length; }
    c.tex.offset.x = list[c.fi % list.length] / c.art.n;
  }
}

function removeChar(c) {
  charsGroup.remove(c.mesh);
  c.mesh.geometry.dispose();
  spriteMats.delete(c.mesh.material);
  c.mesh.material.dispose();
  setCarried(c, null);
  const k = G.chars.indexOf(c);
  if (k >= 0) G.chars.splice(k, 1);
}

export function cellFromPx(x, y) {
  const cx = Math.floor(x / G.cellPx) + G.OFF, cz = Math.floor(y / G.cellPx) + G.OFF;
  return inb(cx, cz) ? I(cx, cz) : null;
}
export const pxOfCell = (i) => ({ x: (cxOf(i) - G.OFF) * G.cellPx + G.cellPx / 2, y: (czOf(i) - G.OFF) * G.cellPx + G.cellPx / 2 });

/* Refleja S.tokens de JA-VTT en G.chars. Crea, actualiza y borra por `vid`.
   Si la ficha cambió de casilla, camina hasta allí; si no hay camino, salta. */
export function syncTokens(list) {
  let changed = false;
  const ids = new Set();
  for (const t of list || []) {
    ids.add(t.id);
    const cell = cellFromPx(t.x, t.y);
    if (cell == null) {
      const old = G.chars.find(c => c.vid === t.id);
      if (old) { removeChar(old); changed = true; }
      continue;
    }
    const kind = CHAR_INFO[t.art] ? t.art : (t.kind === 'enemy' ? 'goblin' : 'guerrera');
    let c = G.chars.find(x => x.vid === t.id);
    if (c && c.kind !== kind) { removeChar(c); c = null; changed = true; }
    if (!c) {
      c = addChar({ vid: t.id, kind, name: t.name, at: [cxOf(cell), czOf(cell)], pc: t.kind === 'player',
        dv: (t.darkvision || 0), sight: t.sight || 0, hidden: !!t.hidden, owner: t.owner, light: null });
      changed = true;
    }
    if (c.name !== (t.name || '')) { c.name = t.name || ''; changed = true; }
    if (c.pc !== (t.kind === 'player')) { c.pc = t.kind === 'player'; changed = true; }
    if (c.owner !== (t.owner != null ? t.owner : null)) { c.owner = t.owner != null ? t.owner : null; changed = true; }
    if (c.hidden !== !!t.hidden) { c.hidden = !!t.hidden; if (c.pc) G.visionDirty = true; changed = true; }
    if (c.sight !== (t.sight || 0)) { c.sight = t.sight || 0; if (c.pc) G.visionDirty = true; changed = true; }
    if (c.dv !== (t.darkvision || 0)) { c.dv = t.darkvision || 0; if (c.pc) G.visionDirty = true; changed = true; }
    const lightKey = JSON.stringify(t.light || null);
    if (c.lightKey !== lightKey) {
      c.lightKey = lightKey;
      const on = t.light && t.light.on && t.light.preset !== 'none';
      setCarried(c, on ? t.light.preset : null);
      if (c.carried) { c.carried.def = defFor(t.light, LIGHT_PRESETS); }
      G.lightsDirty = true; changed = true;
    }
    if (c.cell !== cell && !c.seg && !c.path.length) {
      const p = findPath(c, cell);
      if (p && p.length > 0 && p.length <= 6) { c.path = p; }
      else { c.cell = cell; c.path = []; c.seg = null; if (c.pc) G.visionDirty = true; }
      changed = true;
    }
  }
  for (let i = G.chars.length - 1; i >= 0; i--) {
    const c = G.chars[i];
    if (c.vid != null && !ids.has(c.vid)) { removeChar(c); changed = true; }
  }
  if (changed) { G.lightsDirty = true; G.visionDirty = true; }
}

/* Refleja S.lights de JA-VTT en G.lights. Crea, actualiza y borra por `vid`.
   Las luces que llevan fichas las gobierna syncTokens. */
export function syncLights(list) {
  let changed = false;
  const ids = new Set();
  for (const l of list || []) {
    ids.add(l.id);
    const def = defFor(l, LIGHT_PRESETS);
    let cell = null, mount = null;
    if (l.mount) {
      const wallX = cxOf(l.mount.cell), wallZ = czOf(l.mount.cell);
      const nx = wallX + DIRS[l.mount.dir][0], nz = wallZ + DIRS[l.mount.dir][1];
      if (inb(wallX, wallZ) && inb(nx, nz)) { cell = I(nx, nz); mount = { wall: l.mount.cell, dir: l.mount.dir }; }
    }
    if (cell == null) cell = cellFromPx(l.x, l.y);
    if (cell == null) continue;
    let light = G.lights.find(x => x.vid === l.id);
    if (light && (light.cell !== cell || JSON.stringify(light.mount) !== JSON.stringify(mount) || light.def.sprite !== def.sprite)) {
      removeLight(light); light = null; changed = true;
    }
    if (!light) {
      light = addLight(l.preset, cell, mount, def);
      light.vid = l.id; light.on = !!l.on;   // addLight la enciende siempre; manda el tablero
      changed = true;
    } else {
      if (light.on !== !!l.on) { light.on = !!l.on; changed = true; }
      if (JSON.stringify(light.def) !== JSON.stringify(def)) { light.def = def; light.cache = null; changed = true; }
    }
  }
  for (let i = G.lights.length - 1; i >= 0; i--) {
    const light = G.lights[i];
    if (light.vid != null && !light.carrier && !ids.has(light.vid)) { removeLight(light); changed = true; }
  }
  if (changed) G.lightsDirty = true;
}
