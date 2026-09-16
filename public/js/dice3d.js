/* Dados 3D sobre el mapa. El resultado lo decide el servidor: aquí se simula una tirada
   con físicas (cannon-es), se mira qué cara queda arriba y se rotulan las caras para que
   esa cara muestre el número recibido. Luego se reproduce la grabación con three.js. */
import * as THREE from './vendor/three.module.min.js';
import * as CANNON from './vendor/cannon-es.js';

const STEP = 1 / 60;
const MAX_STEPS = 60 * 6;
const REST_STEPS = 45;
const HOLD_MS = 2600;
const FADE_MS = 500;
const DIE_SIZE = 0.95;
const MAX_DICE = 30;

/* ---------- geometría: caras como polígonos a partir de los sólidos de three ---------- */
function facesFromGeometry(src) {
  const geo = src.index ? src.toNonIndexed() : src;
  const pos = geo.getAttribute('position');
  const verts = [], key = new Map();
  const idx = (x, y, z) => {
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (!key.has(k)) { key.set(k, verts.length); verts.push(new THREE.Vector3(x, y, z)); }
    return key.get(k);
  };
  const tris = [];
  for (let i = 0; i < pos.count; i += 3) tris.push([0, 1, 2].map((j) => idx(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j))));
  // agrupar triángulos coplanares → una cara por grupo
  const groups = [];
  for (const t of tris) {
    const n = new THREE.Vector3().crossVectors(verts[t[1]].clone().sub(verts[t[0]]), verts[t[2]].clone().sub(verts[t[0]])).normalize();
    let g = groups.find((x) => x.n.dot(n) > 0.999);
    if (!g) { g = { n, ids: new Set() }; groups.push(g); }
    for (const v of t) g.ids.add(v);
  }
  const faces = groups.map((g) => {
    const ids = [...g.ids];
    const c = ids.reduce((a, i) => a.add(verts[i]), new THREE.Vector3()).multiplyScalar(1 / ids.length);
    const u = verts[ids[0]].clone().sub(c).normalize(), v = new THREE.Vector3().crossVectors(g.n, u);
    ids.sort((a, b) => Math.atan2(verts[a].clone().sub(c).dot(v), verts[a].clone().sub(c).dot(u)) - Math.atan2(verts[b].clone().sub(c).dot(v), verts[b].clone().sub(c).dot(u)));
    return ids;
  });
  return { verts, faces };
}
/* d10: trapezoedro pentagonal, no viene en three */
function d10Solid() {
  const verts = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; verts.push(new THREE.Vector3(Math.cos(a) * 0.95, (i % 2 ? -1 : 1) * 0.1055, Math.sin(a) * 0.95)); }
  const faces = [];
  for (let i = 0; i < 10; i += 2) { const r = (k) => 2 + ((i + k) % 10); faces.push([0, r(0), r(1), r(2)]); faces.push([1, r(3), r(2), r(1)]); }
  return { verts, faces };
}
function solidFor(sides) {
  const g = { 4: () => new THREE.TetrahedronGeometry(1.2), 6: () => new THREE.BoxGeometry(1.35, 1.35, 1.35), 8: () => new THREE.OctahedronGeometry(1.15),
    12: () => new THREE.DodecahedronGeometry(1.05), 20: () => new THREE.IcosahedronGeometry(1.15) }[sides];
  const solid = g ? facesFromGeometry(g()) : d10Solid();
  // caras hacia fuera
  const centroid = solid.verts.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / solid.verts.length);
  solid.faces = solid.faces.map((f) => {
    const a = solid.verts[f[0]], b = solid.verts[f[1]], c = solid.verts[f[2]];
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    return n.dot(a.clone().sub(centroid)) < 0 ? [...f].reverse() : f;
  });
  return solid;
}
const SOLIDS = new Map();
const getSolid = (sides) => { if (!SOLIDS.has(sides)) SOLIDS.set(sides, solidFor(sides)); return SOLIDS.get(sides); };

/* ---------- textura: un atlas con una celda por cara ----------
   Cada cara se proyecta a 2D (centro en el medio de la celda) y se dibuja como polígono:
   así el número se coloca en el centro real de la cara y con un tamaño que cabe en ella. */
const CELL = 192;
function shade(hex, k) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || [0, 'e9', 'e3', 'd5'];
  const c = [1, 2, 3].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function faceFrame(solid, f, sides) {
  const pts = f.map((i) => solid.verts[i]);
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const n = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
  const u = pts[0].clone().sub(c).normalize(), v = new THREE.Vector3().crossVectors(n, u);
  const R = Math.max(...pts.map((p) => p.distanceTo(c))) * 1.08;
  // coordenadas 2D de cada vértice dentro de la celda (px), y radio inscrito
  const local = pts.map((p) => { const d = p.clone().sub(c); return { x: d.dot(u) / R, y: d.dot(v) / R }; });
  let inR = Infinity;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    inR = Math.min(inR, Math.abs((b.x - a.x) * a.y - (b.y - a.y) * a.x) / len);
  }
  return { pts, c, n, u, v, R, local, inR, sides };
}
function makeAtlas(frames, labels, color) {
  const n = frames.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cv = document.createElement('canvas'); cv.width = cols * CELL; cv.height = rows * CELL;
  const c = cv.getContext('2d');
  c.fillStyle = shade(color, 0.55); c.fillRect(0, 0, cv.width, cv.height);
  const half = CELL / 2;
  frames.forEach((fr, i) => {
    const ox = (i % cols) * CELL + half, oy = Math.floor(i / cols) * CELL + half;
    const px = (p) => [ox + p.x * half, oy - p.y * half];
    // cara: degradado del color del jugador, más oscuro hacia los bordes
    c.save(); c.beginPath(); fr.local.forEach((p, k) => { const [x, y] = px(p); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.clip();
    const g = c.createRadialGradient(ox - half * 0.15, oy - half * 0.2, 4, ox, oy, half);
    g.addColorStop(0, shade(color, 1.25)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, 0.6));
    c.fillStyle = g; c.fillRect(ox - half, oy - half, CELL, CELL);
    // filigrana: borde interior dorado y trazo fino
    c.beginPath(); fr.local.forEach((p, k) => { const [x, y] = px({ x: p.x * 0.86, y: p.y * 0.86 }); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    c.strokeStyle = 'rgba(240,179,90,.55)'; c.lineWidth = 3; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1.5; c.beginPath(); fr.local.forEach((p, k) => { const [x, y] = px({ x: p.x * 0.78, y: p.y * 0.78 }); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.stroke();
    c.restore();
    // números: marfil con borde oscuro
    const label = labels[i];
    const draw = (text, x, y, size, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot || 0);
      c.font = `700 ${size}px "Alegreya", Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = Math.max(2, size * 0.12); c.strokeStyle = 'rgba(20,24,28,.85)'; c.strokeText(text, 0, 0);
      c.fillStyle = '#F6EEDC'; c.fillText(text, 0, 0);
      if (text === '6' || text === '9') { c.fillStyle = '#F6EEDC'; c.fillRect(-size * 0.28, size * 0.42, size * 0.56, Math.max(2, size * 0.07)); }
      c.restore();
    };
    if (fr.sides === 4) {
      // un número junto a cada vértice, con el pie hacia el centro
      fr.local.forEach((p, k) => {
        const [vx, vy] = [p.x * half, -p.y * half];
        const ang = Math.atan2(vy, vx);
        draw(String(label[k]), ox + Math.cos(ang) * half * 0.56, oy + Math.sin(ang) * half * 0.56, half * 0.36, ang + Math.PI / 2);
      });
      return;
    }
    const text = String(label);
    const size = fr.inR * half * (text.length > 1 ? 1.15 : 1.5);
    draw(text, ox, oy, size, 0);
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, cols, rows };
}
function buildMesh(solid, labels, color, sides) {
  const frames = solid.faces.map((f) => faceFrame(solid, f, sides));
  const { tex, cols, rows } = makeAtlas(frames, labels, color);
  const positions = [], uvs = [], normals = [];
  frames.forEach((fr, fi) => {
    const cx = fi % cols, cy = Math.floor(fi / cols);
    const uvOf = (k) => [(cx + 0.5 + fr.local[k].x / 2) / cols, 1 - (cy + 0.5 - fr.local[k].y / 2) / rows];
    for (let i = 1; i < fr.pts.length - 1; i++) {
      for (const k of [0, i, i + 1]) { const p = fr.pts[k]; positions.push(p.x, p.y, p.z); normals.push(fr.n.x, fr.n.y, fr.n.z); uvs.push(...uvOf(k)); }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.06, transparent: true });
  return new THREE.Mesh(geo, mat);
}

/* ---------- físicas ---------- */
function bodyFor(solid) {
  const shape = new CANNON.ConvexPolyhedron({ vertices: solid.verts.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), faces: solid.faces.map((f) => [...f]) });
  return new CANNON.Body({ mass: 1, shape, material: new CANNON.Material({ friction: 0.3, restitution: 0.35 }), angularDamping: 0.25, linearDamping: 0.05 });
}
/* Índice de la cara (o vértice, en el d4) que mira hacia arriba tras la simulación */
function upIndex(solid, quat, sides) {
  const q = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w);
  if (sides === 4) {
    let best = -1, bd = -Infinity;
    solid.verts.forEach((v, i) => { const d = v.clone().applyQuaternion(q).y; if (d > bd) { bd = d; best = i; } });
    return best;
  }
  let best = 0, bd = -Infinity;
  solid.faces.forEach((f, i) => {
    const pts = f.map((k) => solid.verts[k]);
    const n = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize().applyQuaternion(q);
    if (n.y > bd) { bd = n.y; best = i; }
  });
  return best;
}
/* Rótulos por cara de modo que la cara `up` muestre `value` */
function labelsFor(solid, sides, up, value, variant) {
  const count = sides === 4 ? solid.verts.length : solid.faces.length;
  let pool;
  if (variant === 'tens') pool = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
  else pool = Array.from({ length: count }, (_, i) => (sides === 10 ? (i === 9 ? 0 : i + 1) : i + 1));
  const want = variant === 'tens' ? String(value).padStart(2, '0') : (sides === 10 && value === 10 ? 0 : value);
  const rest = pool.filter((p) => String(p) !== String(want));
  const labels = [];
  for (let i = 0; i < count; i++) labels.push(i === up ? want : rest.shift());
  if (sides !== 4) return labels;
  // d4: cada cara muestra en cada esquina el número de ese vértice
  return solid.faces.map((f) => f.map((vi) => labels[vi]));
}

/* ---------- escena ---------- */
let renderer, scene, camera, layer, host, world, active = [], raf = 0, W = 1, H = 1, extent = { x: 10, z: 6 };
function ensure(container) {
  if (renderer) return;
  host = container;
  layer = document.createElement('canvas'); layer.id = 'diceLayer'; layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
  host.appendChild(layer);
  renderer = new THREE.WebGLRenderer({ canvas: layer, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x223044, 1.0));
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.5); fill.position.set(-8, 6, -6); scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(6, 14, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  resize();
  new ResizeObserver(resize).observe(host);
}
function resize() {
  const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false); camera.aspect = W / H;
  // cámara cenital: la mesa cubre el visor
  const dist = 22; camera.position.set(0, dist, 0.001); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  extent.z = Math.tan((camera.fov * Math.PI) / 360) * dist * 0.9; extent.x = extent.z * camera.aspect;
}
function makeWorld() {
  const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
  const mat = new CANNON.Material({ friction: 0.4, restitution: 0.3 });
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mat }); floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); w.addBody(floor);
  const wall = (x, z, ry) => { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mat }); b.position.set(x, 0, z); b.quaternion.setFromEuler(0, ry, 0); w.addBody(b); };
  wall(-extent.x, 0, Math.PI / 2); wall(extent.x, 0, -Math.PI / 2); wall(0, -extent.z, 0); wall(0, extent.z, Math.PI);
  return w;
}
/* Simula la tirada y devuelve la grabación de cada dado */
function simulate(specs, seed) {
  world = makeWorld();
  const rnd = mulberry(seed);
  const bodies = specs.map((sp, i) => {
    const b = bodyFor(sp.solid);
    const side = rnd() < 0.5 ? -1 : 1;
    b.position.set(side * (extent.x - 1.5) + (rnd() - 0.5), 3 + (i % 5) * 1.6 + rnd(), (rnd() - 0.5) * extent.z * 1.2);
    b.velocity.set(-side * (14 + rnd() * 8), 2 + rnd() * 3, (rnd() - 0.5) * 12);
    b.angularVelocity.set((rnd() - 0.5) * 30, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30);
    b.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    world.addBody(b); return b;
  });
  const frames = bodies.map(() => []);
  let rest = 0, steps = 0;
  while (steps < MAX_STEPS && rest < REST_STEPS) {
    world.step(STEP);
    let moving = false;
    bodies.forEach((b, i) => { frames[i].push([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]); if (b.velocity.length() > 0.08 || b.angularVelocity.length() > 0.08) moving = true; });
    rest = moving ? 0 : rest + 1; steps++;
  }
  return { frames, final: bodies.map((b) => b.quaternion.clone()) };
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* dice: [{sides, rolls:[...]}] del servidor; color: del jugador */
function roll(container, dice, color, seed) {
  ensure(container);
  const specs = [];
  for (const d of dice) for (const v of d.rolls) {
    if (specs.length >= MAX_DICE) break;
    if (d.sides === 100) { specs.push({ sides: 10, value: Math.floor((v % 100) / 10) * 10, variant: 'tens', solid: getSolid(10) }); specs.push({ sides: 10, value: v % 10 === 0 ? 10 : v % 10, solid: getSolid(10) }); }
    else specs.push({ sides: d.sides, value: v, solid: getSolid(d.sides) });
  }
  if (!specs.length) return;
  clear();
  const sim = simulate(specs, seed || Date.now());
  const meshes = specs.map((sp, i) => {
    const up = upIndex(sp.solid, sim.final[i], sp.sides);
    const mesh = buildMesh(sp.solid, labelsFor(sp.solid, sp.sides, up, sp.value, sp.variant), color || '#E9E3D5', sp.sides);
    mesh.castShadow = true; mesh.scale.setScalar(DIE_SIZE); scene.add(mesh); return mesh;
  });
  const start = performance.now();
  const total = Math.max(...sim.frames.map((f) => f.length));
  active = meshes;
  const tick = (now) => {
    const t = Math.max(0, now - start) / 1000, k = Math.min(total - 1, Math.floor(t / STEP));
    meshes.forEach((m, i) => { const fr = sim.frames[i][Math.min(k, sim.frames[i].length - 1)]; m.position.set(fr[0], fr[1], fr[2]); m.quaternion.set(fr[3], fr[4], fr[5], fr[6]); });
    const doneAt = total * STEP * 1000 + HOLD_MS, since = now - start - doneAt;
    if (since > 0) meshes.forEach((m) => { m.material.opacity = Math.max(0, 1 - since / FADE_MS); });
    renderer.render(scene, camera);
    if (since > FADE_MS) { clear(); return; }
    raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function clear() {
  cancelAnimationFrame(raf);
  for (const m of active) { scene.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
  active = [];
  if (renderer) renderer.clear();
}

window.Dice3D = { roll, clear };
