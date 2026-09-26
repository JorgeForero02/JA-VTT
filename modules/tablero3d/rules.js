'use strict';
/* Reglas del módulo del tablero 3D: validación de escenas, campañas, dibujos y mesa en vivo,
   y permisos. El servidor es la autoridad: el director puede todo; un jugador solo mueve
   y edita la ficha de sus propios personajes en la mesa en vivo, abre las puertas sin llave si el tablero lo deja
   (playersDoors) y pide cruzar portales. */

const Catalogo = require('./public/catalogo.js');

const MAP_MIN = 4;
const MAP_MAX = 160;
const TERRAIN = 'gapsow~cnl';
const SCENE_MAX_BYTES = 2 * 1024 * 1024;
const CAMPAIGN_MAX_BYTES = 8 * 1024 * 1024;
const LIVE_MAX_BYTES = 2 * 1024 * 1024;
const LAYER_MAX_BYTES = 4 * 1024 * 1024;
const MAX_LAYERS = 8;
/* Cuerpo máximo de cada petición a la API del módulo, sacado del documento más grande que se acepta: la escena y la campaña,
   su tope en JSON; el dibujo, MAX_LAYERS capas de LAYER_MAX_BYTES en base64 dentro de un data URL; más SMALL_BODY para el
   resto de campos. Lo demás (ajustes) cabe en SMALL_BODY. Más grande: 413 sin leerlo entero. */
const SMALL_BODY = 64 * 1024;
const base64Len = (n) => Math.ceil(n / 3) * 4;
const BODY_LIMITS = {
  small: SMALL_BODY,
  scenes: SCENE_MAX_BYTES + SMALL_BODY,
  travel: SCENE_MAX_BYTES + SMALL_BODY,
  campaigns: CAMPAIGN_MAX_BYTES + SMALL_BODY,
  drawings: MAX_LAYERS * (base64Len(LAYER_MAX_BYTES) + 'data:image/png;base64,'.length) + SMALL_BODY,
};
const LIVE_KEYS = ['board', 'tokens', 'combat', 'doors', 'plans'];
const DRAWING_KINDS = ['tile', 'char', 'obj'];
/* Tamaño del arte de un personaje dibujado (T5b): el de su lienzo, Fichas.SIZES del cliente. Los de antes, Medianos. */
const CHAR_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
/* Ficha: los campos de la ficha de Just Another VTT (su server/rules.js, type 'token'). El bando de antes
   (`team`) se traduce: pc → player, enemy → enemy, npc → enemy + neutral (extra del 3D). */
const TEAM_KIND = { pc: 'player', enemy: 'enemy', npc: 'enemy' };
/* Estados: los CONDITION_IDS de JA-VTT (fijo test/fixtures/ja-vtt/conditions.json) */
const CONDITION_IDS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
  'dead', 'concentration', 'exhaustion', 'burning', 'blessed', 'marked',
];
/* lo que sólo cambia el director en una ficha (como en JA-VTT: bando, tamaño, visión y visibilidad) */
const GM_SHEET_KEYS = ['kind', 'neutral', 'size', 'tiny', 'small', 'hidden', 'vision', 'sight', 'darkvision'];
/* Tipos de luz: los mismos ids que LIGHT_PRESETS de Just Another VTT (su server/rules.js, sin 'none'),
   las mismas animaciones (ANIMS) y los tipos que puede llevar una ficha (TOKEN_LIGHTS de su core.js). */
const LIGHT_PRESETS = ['candle', 'torch', 'lantern', 'bullseye', 'campfire', 'brazier', 'magic', 'crystal', 'moon', 'daylight', 'window', 'darkness', 'custom'];
const ANIMS = ['none', 'flicker', 'soft', 'pulse'];
const TOKEN_LIGHTS = ['none', 'candle', 'torch', 'lantern', 'bullseye', 'magic', 'crystal'];
/* valores de JA-VTT (LIGHT_PRESETS de su core.js) de los tipos que lleva una ficha */
const TOKEN_LIGHT_DEFS = {
  candle: { bright: 5, dim: 5, color: '#ffc878', intensity: 0.9, anim: 'flicker' },
  torch: { bright: 20, dim: 20, color: '#ffa652', intensity: 1, anim: 'flicker' },
  lantern: { bright: 30, dim: 30, color: '#ffd28f', intensity: 1, anim: 'soft' },
  bullseye: { bright: 60, dim: 60, color: '#ffe6b8', intensity: 1, anim: 'none', angle: 60 },
  magic: { bright: 20, dim: 20, color: '#dde8ff', intensity: 1, anim: 'none' },
  crystal: { bright: 10, dim: 20, color: '#a98bff', intensity: 0.9, anim: 'pulse' },
};
/* un objeto dibujado puede tomar un tipo sin cono ni oscuridad */
const OBJ_LIGHTS = LIGHT_PRESETS.filter((k) => !['custom', 'darkness', 'bullseye', 'window'].includes(k));

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const docId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
const tokenId = (v) => typeof v === 'string' && /^[a-z0-9]{2,12}$/.test(v);
const plainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const hex6 = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* Luz suelta del mapa (type 'light'): campos con los nombres de JA-VTT (preset, color, intensity, anim,
   angle, rot, darkness, on, name) más los del 3D (r: radio en casillas, h: altura sobre el suelo).
   Las escenas de antes guardaban r, h, c (color) y f (parpadeo 0/1): se traducen igual que en el cliente. */
function cleanLightProp(p) {
  const n = (v, a, b, d) => (fin(v) ? clamp(v, a, b) : d);
  const out = {
    type: 'light', x: p.x, z: p.z, v: 0,
    preset: LIGHT_PRESETS.includes(p.preset) ? p.preset : 'custom',
    r: Math.round(n(p.r, 1, 24, 5)), h: Math.round(n(p.h, 0, 4, 1.2) * 4) / 4,
    color: hex6(p.color) ? p.color.toLowerCase() : hex6(p.c) ? p.c.toLowerCase() : '#ff9c50',
    intensity: Math.round(n(p.intensity, 0, 1.2, 1) * 100) / 100,
    anim: ANIMS.includes(p.anim) ? p.anim : (p.f === 0 ? 'none' : 'flicker'),
    angle: Math.round(n(p.angle, 1, 360, 360)), rot: Math.round(n(p.rot, -3600, 3600, 0)),
    darkness: !!p.darkness, on: p.on !== false,
  };
  const name = str(p.name, 40).trim();
  if (name) out.name = name;
  return out;
}
/* Muros de Just Another VTT (WALL_KINDS de su server/rules.js; catálogo completo en test/fixtures/ja-vtt/wall-types.json).
   En 3D, por casilla: `wall` es la casilla de terreno 'w'; `door`, los objetos puerta (door, gate) con open y locked;
   window, veil, cover, barrier y portal, objetos del mismo nombre. Lo mismo que lee el cliente (Muros.normProp). */
const WALL_KINDS = ['wall', 'door', 'window', 'veil', 'cover', 'barrier', 'portal'];
const WALL_PROPS = ['window', 'veil', 'cover', 'barrier', 'portal'];
const PORTAL_LOOKS = ['door', 'stairs', 'cave', 'trapdoor', 'magic'];
const PORTAL_MAP_MAX = 160;
const SCENE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CAMP_ID = /^[a-z0-9]{2,16}$/;
/* Qué es cada tipo lo dice el catálogo (public/catalogo.js); estas listas se calculan de él y se mantienen por compatibilidad */
const FACTORY_TYPES = Object.keys(Catalogo.FACTORY).filter((k) => Catalogo.FACTORY[k].class !== 'terrain').map((k) => k.slice(2));
const DOOR_PROPS = FACTORY_TYPES.filter((t) => Catalogo.isDoor({ type: t }));
const PASSABLE_PROPS = FACTORY_TYPES.filter((t) => !Catalogo.blocksMove({ type: t }) && !Catalogo.isDoor({ type: t }));
const PROP_SPANS = Object.fromEntries(FACTORY_TYPES.map((t) => [t, Catalogo.span({ type: t })]).filter(([, s]) => s[0] > 1 || s[1] > 1));
const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const stairsId = (x, z) => 1 + z * PORTAL_MAP_MAX + x;
const isWallProp = (p) => DOOR_PROPS.includes(p.type) || WALL_PROPS.includes(p.type) || (p.type === 'stairs' && typeof p.to === 'string');
/* Objeto de muro saneado; las escaleras de campaña de antes (`stairs` con `to`, `tx`, `tz`) pasan a portales con aspecto de
   escalera y un id que sale de su casilla (así la de ida y la de vuelta se encuentran). null si la casilla no es válida. */
function cleanWallProp(p) {
  if (!intIn(p.x, 0, PORTAL_MAP_MAX - 1) || !intIn(p.z, 0, PORTAL_MAP_MAX - 1)) return null;
  if (p.type === 'stairs') {
    if (!CAMP_ID.test(p.to)) return null;
    const back = intIn(p.tx, 0, PORTAL_MAP_MAX - 1) && intIn(p.tz, 0, PORTAL_MAP_MAX - 1) ? stairsId(p.tx, p.tz) : null;
    return { type: 'portal', x: p.x, z: p.z, v: 0, id: stairsId(p.x, p.z), look: 'stairs', target: { scene: p.to, portal: back } };
  }
  const v = intIn(p.v, 0, 3) ? p.v : 0;
  if (DOOR_PROPS.includes(p.type)) return Object.assign({ type: p.type, x: p.x, z: p.z, v, open: !!p.open }, p.locked === true ? { locked: true } : {});
  if (p.type !== 'portal') return { type: p.type, x: p.x, z: p.z, v };
  const o = { type: 'portal', x: p.x, z: p.z, v, id: intIn(p.id, 1, 1e6) ? p.id : 0, look: PORTAL_LOOKS.includes(p.look) ? p.look : 'door', target: null };
  const name = str(p.name, 40).trim();
  if (name) o.name = name;
  const t = p.target;
  if (plainObject(t) && typeof t.scene === 'string' && SCENE_ID.test(t.scene)) o.target = { scene: t.scene, portal: intIn(t.portal, 1, 1e6) ? t.portal : null };
  return o;
}
/* ids de portal únicos en la escena (los que faltan o se repiten toman el siguiente libre), como Muros.fixPortalIds */
function fixPortalIds(props) {
  let max = 0;
  const seen = new Set();
  for (const p of props) if (p.type === 'portal' && p.id > max) max = p.id;
  for (const p of props) {
    if (p.type !== 'portal') continue;
    if (!p.id || seen.has(p.id)) p.id = ++max;
    seen.add(p.id);
  }
  return props;
}
/* Una pieza de la escena: tiene que existir su definición (fábrica, dibujo antiguo o del tablero) y estar en el mapa con
   giro 0–3. Cada pieza guarda sólo lo suyo (§3.5, §6, ronda de arreglos 1): puertas open/locked (espejo por
   Catalogo.complete), luces sus campos de cleanLightProp, portales id/look/target/name; nada más — un cofre con
   name/target/color… los pierde. `level`/`side` (reservados, fase 4) se sanean aparte. */
function cleanProp(p, w, d, board) {
  if (!intIn(p.x, 0, w - 1) || !intIn(p.z, 0, d - 1)) return null;
  const base = p.type === 'light' ? cleanLightProp(p) : isWallProp(p) ? cleanWallProp(p) : Object.assign({}, p, { v: intIn(p.v, 0, 3) ? p.v : 0 });
  if (!base) return null;
  const keep = { type: base.type, x: base.x, z: base.z, v: base.v | 0 };
  // Ruling R1: def/uid salen de la pieza ORIGINAL (cleanWallProp los quita; el uid se regeneraría en cada guardado)
  if (typeof p.def === 'string') keep.def = p.def;
  if (typeof p.uid === 'string') keep.uid = p.uid;
  // Arreglo 1 (ronda 1): el `def` restaurado tiene que resolver una definición real (la del catálogo si es ajeno o no
  // existe con el tablero a mano) o una barrera/puerta con un `def: 'p:zzzz'` pasaría validada sin serlo.
  const finalDef = Catalogo.defOf(keep, board);
  // Tarea 7, ronda 1 (menor 2): un terreno (f:g, f:w… o una p: de clase terrain) vive en M.t, no es una pieza colocable
  if (!finalDef || finalDef.class === 'terrain') return null;
  // Arreglo 2 (ronda 1): sólo se guardan los campos propios de lo que es esta pieza, según su definición final.
  const isDoorProp = Catalogo.isDoor(keep, board);
  const own = base.type === 'light' ? ['preset', 'r', 'h', 'color', 'intensity', 'anim', 'angle', 'rot', 'darkness', 'on', 'name']
    : isDoorProp ? ['open', 'locked']
    : Catalogo.wallKind(keep, board) === 'portal' ? ['id', 'look', 'target', 'name'] : [];
  for (const k of own) if (k in base) keep[k] = base[k];
  // R12(a): una puerta `p:` (sin pasar por cleanWallProp, que sólo conoce los tipos de fábrica) llega aquí con `open`/
  // `locked` en crudo (cleanProp los copia de `base` tal cual); se coacciona igual que hace cleanWallProp para que
  // `locked: 'no'` (verdadero en JS) no acabe cerrando la puerta.
  if (isDoorProp) { keep.open = !!keep.open; if (keep.locked !== true) delete keep.locked; }
  if (intIn(p.level, 0, 15)) keep.level = p.level;
  if (typeof p.side === 'string' && ['N', 'E', 'S', 'W'].includes(p.side)) keep.side = p.side;
  // `state` sólo si la definición final tiene estados (si no, Catalogo.complete podría copiarlo tal cual sin validar)
  if (finalDef.states && plainObject(p.state)) keep.state = p.state;
  return Catalogo.complete(keep, board);
}

/* Techos: rectángulo de al menos 2×2 dentro del mapa, material (teja roja, pizarra, paja, tablillas, cobre con verdín)
   y forma (a dos aguas, a cuatro aguas, plano con almenas, cónico, a un agua); `rot` 0–3 gira la cumbrera (sin él, a lo
   largo del lado largo). Los de antes, sin material ni forma, son de teja a dos aguas: lo mismo que lee el cliente (normRoof). */
const ROOF_MATS = ['tile', 'slate', 'thatch', 'shingle', 'copper'];
const ROOF_SHAPES = ['gable', 'hip', 'flat', 'cone', 'shed'];
function cleanRoof(r, w, d) {
  if (![r.x, r.z, r.w, r.d].every(Number.isInteger) || r.w < 2 || r.d < 2 || r.x < 0 || r.z < 0 || r.x + r.w > w || r.z + r.d > d) return null;
  const out = { x: r.x, z: r.z, w: r.w, d: r.d, mat: ROOF_MATS.includes(r.mat) ? r.mat : 'tile', shape: ROOF_SHAPES.includes(r.shape) ? r.shape : 'gable' };
  if (Number.isInteger(r.rot) && r.rot >= 0 && r.rot <= 3) out.rot = r.rot;
  return out;
}

/* Ambiente de la escena: los ENVS de Just Another VTT (ids de su server/rules.js; luz ambiental y color de la oscuridad
   de su core.js; fijo test/fixtures/ja-vtt/envs.json) con sus nombres de campo: env, ambient (0–1) y darkColor. Las escenas
   de antes (`night`) pasan a noche o día. Lo mismo que lee el cliente (Ambiente.norm; un test los compara). */
const ENVS = { interior: { ambient: 0, dark: '#0B0E11' }, day: { ambient: 1, dark: '#0E1316' }, dusk: { ambient: 0.55, dark: '#1A1220' }, night: { ambient: 0.18, dark: '#081026' } };
const ENV_IDS = Object.keys(ENVS);
function cleanEnv(o) {
  const env = ENV_IDS.includes(o.env) ? o.env : (o.night ? 'night' : 'day');
  return {
    env,
    ambient: fin(o.ambient) ? clamp(o.ambient, 0, 1) : ENVS[env].ambient,
    darkColor: hex6(o.darkColor) ? o.darkColor.toUpperCase() : ENVS[env].dark,
  };
}
/* Zonas interiores pintadas por el director (zone de JA-VTT, por casilla): '0' la del techo o ninguna, '1' interior,
   '2' exterior aunque haya techo. Sólo se guarda si pinta algo. Cada techo crea además la suya (en el cliente). */
const cleanZoneCells = (s, n) => (typeof s === 'string' && s.length === n && /^[012]+$/.test(s) && /[12]/.test(s) ? s : null);

/* Mapa 3D serializado por el cliente (función `serialize` del tablero). Se comprueba la forma
   y el tamaño; el cliente vuelve a sanear todo al cargarlo (`deserialize`). */
function cleanMap(o, board) {
  if (!plainObject(o)) return null;
  const w = o.w, d = o.d;
  if (!Number.isInteger(w) || !Number.isInteger(d) || w < MAP_MIN || d < MAP_MIN || w > MAP_MAX || d > MAP_MAX) return null;
  const n = w * d;
  if (typeof o.h !== 'string' || o.h.length !== n || !/^[0-9a-c]+$/.test(o.h)) return null;
  if (typeof o.t !== 'string' || o.t.length !== n || [...o.t].some((c) => !TERRAIN.includes(c))) return null;
  const map = { v: 2, name: str(o.name, 40).trim() || 'Escena', w, d, h: o.h, t: o.t };
  if (typeof o.wsrc === 'string' && o.wsrc.length === n && /^[012]+$/.test(o.wsrc)) map.wsrc = o.wsrc;
  if (typeof o.seen === 'string' && o.seen.length === n && /^[01]+$/.test(o.seen)) map.seen = o.seen;
  map.props = fixPortalIds(Array.isArray(o.props) ? o.props.filter(plainObject).slice(0, 5000).map((p) => cleanProp(p, w, d, board)).filter(Boolean) : []);
  const uids = new Set();
  for (const p of map.props) { while (uids.has(p.uid)) p.uid = Catalogo.newUid(); uids.add(p.uid); }
  map.minis = Array.isArray(o.minis) ? o.minis.filter(plainObject).slice(0, 500).map((m) => (plainObject(m.sheet) ? Object.assign({}, m, { sheet: cleanSheet(m.sheet) }) : m)) : [];
  map.roofs = Array.isArray(o.roofs) ? o.roofs.filter(plainObject).map((r) => cleanRoof(r, w, d)).filter(Boolean).slice(0, 300) : [];
  if (Array.isArray(o.start) && o.start.length === 2 && o.start.every(Number.isInteger)) map.start = o.start;
  Object.assign(map, cleanEnv(o));
  const zc = cleanZoneCells(o.zoneCells, n);
  if (zc) map.zoneCells = zc;
  map.fog = !!o.fog;
  Object.assign(map, cleanSceneFlags(o));
  const plans = Array.isArray(o.plans) ? uniqueIds(o.plans.slice(0, MAX_PLANS).map((p) => cleanPlan(p, w, d)).filter(Boolean)) : [];
  if (plans.length) map.plans = plans;
  const notes = Array.isArray(o.notes) ? uniqueIds(o.notes.slice(0, MAX_NOTES).map((x) => cleanNote(x, w, d)).filter(Boolean)) : [];
  if (notes.length) map.notes = notes;
  if (bytes(map) > SCENE_MAX_BYTES) return null;
  return map;
}

/* Campaña: escenas unidas por portales (las escaleras de antes) y notas del director por escena. `board` (Ruling
   R3b): Map de definiciones `p:` del tablero, para que cada escena se valide igual que si se guardara sola. */
function cleanCampaign(o, board) {
  if (!plainObject(o) || !docId(o.id) || !plainObject(o.boards)) return null;
  const boards = {};
  for (const [k, v] of Object.entries(o.boards).slice(0, 64)) {
    if (!/^[a-z0-9]{2,16}$/.test(k) || !plainObject(v)) continue;
    const data = cleanMap(v.data, board);
    if (data) boards[k] = { name: str(v.name, 40) || data.name, data };
  }
  const ids = Object.keys(boards);
  if (!ids.length) return null;
  const notes = {};
  for (const k of ids) {
    const list = plainObject(o.notes) && Array.isArray(o.notes[k]) ? o.notes[k] : [];
    notes[k] = list.filter((x) => x && Number.isInteger(x.x) && Number.isInteger(x.z) && typeof x.text === 'string')
      .slice(0, 300).map((x) => ({ x: x.x, z: x.z, text: x.text.slice(0, 500) }));
  }
  const c = { id: o.id, name: str(o.name, 40).trim() || 'Campaña', boards, notes, cur: boards[o.cur] ? o.cur : ids[0], updated: fin(o.updated) ? o.updated : 0 };
  if (bytes(c) > CAMPAIGN_MAX_BYTES) return null;
  return c;
}

/* ---- portales: llegada, viaje entre escenas y limpieza (la idea de arrivalPoints, moveUser y gather de JA-VTT, por casillas) ---- */
/* Rejilla de una escena saneada: se pisa si no es muro, lava ni agua, no la ocupa un objeto (salvo los que se pisan) ni una ficha.
   Igual que Muros.gridOf del cliente. `board` (Ruling R3b): Map de definiciones `p:`, para que una pieza del tablero
   bloquee igual que una de fábrica. */
function gridOf(m, board) {
  const w = m.w, d = m.d, n = w * d, open = new Uint8Array(n), h = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const tt = m.t[i], water = typeof m.wsrc === 'string' && m.wsrc.length === n && m.wsrc[i] !== '0';
    h[i] = parseInt(m.h[i], 36) | 0;
    open[i] = tt !== 'w' && tt !== 'l' && tt !== '~' && !water ? 1 : 0;
  }
  const off = (x, z, sw, sd) => {
    for (let j = 0; j < sd; j++) for (let k = 0; k < sw; k++) { const X = x + k, Z = z + j; if (X >= 0 && Z >= 0 && X < w && Z < d) open[Z * w + X] = 0; }
  };
  for (const p of m.props || []) {
    if (!Catalogo.blocksMove(p, board) && !Catalogo.isDoor(p, board)) continue;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.z)) continue;
    const [sw, sd] = Catalogo.span(p, board);
    off(p.x, p.z, sw, sd);
  }
  for (const q of m.minis || []) if (Number.isInteger(q.x) && Number.isInteger(q.z)) { const s = sizeOfMini(q); off(q.x, q.z, s, s); }
  return { w, d, open: (i) => open[i] === 1, h: (i) => h[i] };
}
const sizeOfMini = (q) => (q.sheet && intIn(q.sheet.size, 1, 4) ? q.sheet.size : 1);
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/* Esquinas [x, z] (o null si no cabe) para fichas de `sizes` casillas junto a la casilla (px, pz) del portal de llegada, del lado
   por el que se anda (primero desde la casilla vecina más cercana a `start`); igual que Muros.arrival del cliente. */
function arrival(g, px, pz, sizes, start) {
  const N = g.w * g.d, inb = (x, z) => x >= 0 && z >= 0 && x < g.w && z < g.d, seen = new Uint8Array(N), order = [];
  const sx = start ? start[0] : px, sz = start ? start[1] : pz;
  const bfs = (i0) => {
    const q = [i0];
    seen[i0] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], cx = c % g.w, cz = (c / g.w) | 0;
      order.push(c);
      for (const [dx, dz] of D4) {
        const X = cx + dx, Z = cz + dz;
        if (!inb(X, Z)) continue;
        const j = Z * g.w + X;
        if (seen[j] || !g.open(j) || Math.abs(g.h(j) - g.h(c)) > 2) continue;
        seen[j] = 1; q.push(j);
      }
    }
  };
  if (inb(px, pz) && g.open(pz * g.w + px)) bfs(pz * g.w + px);
  const seeds = D8.map(([dx, dz]) => [px + dx, pz + dz]).filter(([x, z]) => inb(x, z) && g.open(z * g.w + x))
    .sort((a, b) => Math.hypot(a[0] - sx, a[1] - sz) - Math.hypot(b[0] - sx, b[1] - sz));
  for (const [x, z] of seeds) if (!seen[z * g.w + x]) bfs(z * g.w + x);
  const taken = new Uint8Array(N), out = [];
  const fits = (x, z, n) => {
    if (x < 0 || z < 0 || x + n > g.w || z + n > g.d) return false;
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) { const i = (z + j) * g.w + x + k; if (!seen[i] || taken[i]) return false; }
    return true;
  };
  for (const n of sizes) {
    let at = null;
    for (const c of order) { const x = c % g.w, z = (c / g.w) | 0; if (fits(x, z, n)) { at = [x, z]; break; } }
    if (at) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) taken[(at[1] + j) * g.w + at[0] + k] = 1;
    out.push(at);
  }
  return out;
}
const portalIn = (map, id) => (map.props || []).find((p) => p.type === 'portal' && p.id === id) || null;
/* ¿está la ficha (x, z, de n casillas) junto al portal o encima? A una casilla o menos, de borde a borde */
function nearPortal(t, p) {
  const n = sizeOfMini(t), dx = Math.max(0, p.x - (t.x + n - 1), t.x - p.x), dz = Math.max(0, p.z - (t.z + n - 1), t.z - p.z);
  return Math.max(dx, dz) <= 1;
}
/* Mueve fichas de la escena `src` a `dst` (ya saneadas; pueden ser la misma). opts: portal (id del portal de llegada en dst o
   null: junto al punto de entrada), ids (las fichas que cruzan) o players (todas las del grupo: kind 'player'). Devuelve las
   escenas nuevas, las que llegaron y las que no cupieron (se quedan donde estaban). */
function travelPlan(src, dst, opts, board) {
  const same = src === dst;
  const S = JSON.parse(JSON.stringify(src)), D = same ? S : JSON.parse(JSON.stringify(dst));
  const goes = (m) => (opts.players ? !!(m.sheet && m.sheet.kind === 'player') : (opts.ids || []).includes(m.id));
  const travellers = S.minis.filter(goes);
  if (same) S.minis = S.minis.filter((m) => !goes(m));
  const target = opts.portal != null ? portalIn(D, opts.portal) : null;
  const at = target ? [target.x, target.z] : (Array.isArray(D.start) ? D.start : [D.w >> 1, D.d >> 1]);
  const cells = arrival(gridOf(D, board), at[0], at[1], travellers.map(sizeOfMini), D.start || at);
  const moved = [], left = [];
  travellers.forEach((m, i) => {
    const c = cells[i];
    if (!c) { left.push(m.id); if (same) S.minis.push(m); return; }
    if (!same) S.minis = S.minis.filter((q) => q !== m);
    D.minis.push(Object.assign({}, m, { x: c[0], z: c[1] }));
    if (!moved.length) D.start = c; // la cámara llega con el primero
    moved.push(m.id);
  });
  return { src: S, dst: D, moved, left };
}
/* Al borrar una escena, los portales que llevaban allí se quedan sin destino (como JA-VTT). true si cambió algo. */
function clearPortalsTo(map, sceneId) {
  let changed = false;
  for (const p of map.props || []) if (p.type === 'portal' && p.target && p.target.scene === sceneId) { p.target = null; changed = true; }
  return changed;
}
/* De las fichas de la mesa en vivo a los personajes de una escena y al revés (con su dueño); las que no tienen id lo reciben */
function tokensToMinis(tokens) {
  return Object.entries(cleanTokens(tokens)).map(([id, t]) => ({ kind: t.kind, x: t.x, z: t.z, fx: t.fx, fz: t.fz, id, sheet: t.sheet, owner: t.owner }));
}
function minisToTokens(minis, makeId) {
  const out = {};
  for (const m of minis) {
    const id = tokenId(m.id) && !out[m.id] ? m.id : makeId();
    const t = cleanToken(Object.assign({}, m, { sheet: m.sheet || {} }));
    if (t) out[id] = t;
  }
  return out;
}

/* Ajustes del tablero 3D (t3d.boards.settings): las claves, los valores por defecto y HP_VISIBILITY de los ajustes de
   tablero de Just Another VTT (BOARD_KEYS y DEFAULT_BOARD de su server/rules.js; fijo test/fixtures/ja-vtt/board-settings.json).
   La iniciativa (`initiative` en JA-VTT) vive en el documento `combat` de la mesa en vivo, con su misma forma. */
const HP_VISIBILITY = ['all', 'gm', 'bar_only'];
const BOARD_KEYS = ['sharedVision', 'playersDoors', 'chatEnabled', 'diceEnabled', 'initiativeShown', 'initiative', 'hpVisibility', 'hpEnabled', 'conditionsEnabled', 'acEnabled'];
const DEFAULT_SETTINGS = { sharedVision: true, playersDoors: true, chatEnabled: true, diceEnabled: true, initiativeShown: false, hpVisibility: 'all', hpEnabled: true, conditionsEnabled: true, acEnabled: true };
const BOOL_SETTINGS = Object.keys(DEFAULT_SETTINGS).filter((k) => typeof DEFAULT_SETTINGS[k] === 'boolean');
function cleanSettings(s, base) {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  for (const src of [base, s]) {
    if (!plainObject(src)) continue;
    for (const k of BOOL_SETTINGS) if (typeof src[k] === 'boolean') out[k] = src[k];
    if (HP_VISIBILITY.includes(src.hpVisibility)) out.hpVisibility = src.hpVisibility;
  }
  return out;
}
/* Integrado (el anfitrión da boardSettings/setBoardSettings): los ajustes con clave de JA-VTT (HOST_SETTINGS = su BOARD_KEYS
   salvo `initiative`) son los del anfitrión (JA-VTT: b.settings / boards.settings) y t3d.boards.settings guarda sólo las claves
   propias del 3D (hoy ninguna). Suelto: todo en t3d.boards.settings. `initiative` no se comparte: la del 3D es el documento
   `combat` de la mesa en vivo (ids de ficha en texto, tiradas, turnos del jugador) y no cabe en la de JA-VTT sin perder datos. */
const HOST_SETTINGS = BOARD_KEYS.filter((k) => k !== 'initiative');
function settingsParts(s) {
  const host = {}, own = {};
  if (plainObject(s)) for (const [k, v] of Object.entries(s)) if (k !== 'initiative') (HOST_SETTINGS.includes(k) ? host : own)[k] = v;
  return { host, own };
}

/* Ajustes de escena de JA-VTT (DEFAULT_SCENE) que viajan con la escena 3D: grid (cuadrícula), snap (en 3D todo va por casillas:
   se guarda para JA-VTT), animate (llamas, pulsos, agua y respiración de las fichas) y plansReleased (los planos del director se
   ven). `fog` es el de siempre del 3D (niebla de guerra; por defecto apagada). Lo mismo que lee el cliente (Ajustes.sceneFlags). */
const SCENE_FLAGS = { grid: true, snap: true, animate: true, plansReleased: false };
function cleanSceneFlags(o) {
  const out = {};
  for (const [k, v] of Object.entries(SCENE_FLAGS)) out[k] = typeof o[k] === 'boolean' ? o[k] : v;
  return out;
}

/* Planos (type 'plan' de JA-VTT): las plantillas de medida de la partida. shape line (regla; con `area`, la línea de 5 pies de
   ancho de un conjuro), circle, rect (el cubo del 3D) o cone; a y b en casillas continuas {x, z} (JA-VTT: píxeles {x, y});
   los de un jugador llevan su dueño (`owner`, el id de usuario en texto, como el de las fichas) y su color. Los del director
   se guardan en la escena (y se ven si `plansReleased`); los de los jugadores, en la mesa en vivo (live/plans), y los ven todos. */
const PLAN_SHAPES = ['line', 'circle', 'rect', 'cone'];
const MAX_PLANS = 100;
const MAX_PLAYER_PLANS = 40;
const PLAN_COLOR = '#8ec5e8';
const UID = /^\d{1,15}$/;
function cleanPlan(p, w, d) {
  if (!plainObject(p) || !intIn(p.id, 1, 1e9)) return null;
  const pt = (v) => (plainObject(v) && fin(v.x) && fin(v.z) ? { x: Math.round(clamp(v.x, 0, w) * 100) / 100, z: Math.round(clamp(v.z, 0, d) * 100) / 100 } : null);
  const a = pt(p.a), b = pt(p.b);
  if (!a || !b) return null;
  const o = { id: p.id, shape: PLAN_SHAPES.includes(p.shape) ? p.shape : 'line', a, b };
  if (o.shape === 'line' && p.area === true) o.area = true;
  if (typeof p.owner === 'string' && UID.test(p.owner)) { o.owner = p.owner; o.color = hex6(p.color) ? p.color.toLowerCase() : PLAN_COLOR; }
  return o;
}
/* Anotaciones (type 'note' de JA-VTT): un texto de hasta 200 caracteres sobre una casilla; gmOnly = sólo las ve el director */
const MAX_NOTES = 300;
function cleanNote(n, w, d) {
  if (!plainObject(n) || !intIn(n.id, 1, 1e9) || !intIn(n.x, 0, w - 1) || !intIn(n.z, 0, d - 1)) return null;
  const text = str(n.text, 200).trim();
  return text ? { id: n.id, x: n.x, z: n.z, text, gmOnly: !!n.gmOnly } : null;
}
const uniqueIds = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.id) && seen.add(x.id)); };

/* Iniciativa con la forma de JA-VTT ({ entries, turn, round }, su cleanInitiative): cada entrada { id, name, value, tokenId?,
   hidden? }; tokenId es el id de la ficha 3D (texto; en JA-VTT, un número). Extras del 3D: roll (el d20) e init (el
   modificador, que desempata). */
const MAX_INITIATIVE = 60;
function cleanInitiative(v) {
  const src = plainObject(v) ? v : {};
  const entries = (Array.isArray(src.entries) ? src.entries : []).slice(0, MAX_INITIATIVE).map((e) => {
    if (!plainObject(e)) return null;
    const out = { id: fin(e.id) ? Math.round(e.id) : Date.now(), name: str(e.name, 40).trim() || 'Sin nombre', value: fin(e.value) ? clamp(Math.round(e.value * 100) / 100, -99, 999) : 0 };
    if (fin(e.tokenId) || tokenId(e.tokenId)) out.tokenId = e.tokenId;
    if (typeof e.hidden === 'boolean') out.hidden = e.hidden;
    if (fin(e.roll)) out.roll = clamp(Math.round(e.roll), 1, 20);
    if (fin(e.init)) out.init = clamp(Math.round(e.init), -10, 20);
    return out;
  }).filter(Boolean);
  const turn = fin(src.turn) ? clamp(Math.round(src.turn), 0, Math.max(0, entries.length - 1)) : 0;
  const round = fin(src.round) ? clamp(Math.round(src.round), 1, 9999) : 1;
  return { entries, turn, round };
}
/* Documento `combat` de la mesa en vivo: la iniciativa de JA-VTT más el movimiento que le queda al turno (left, en casillas) y
   si ya hizo carrera (dashed). El de antes ({ active, order: [{ id, roll, total, init }], turn, round, left, dashed }) se traduce:
   cada ficha es una entrada con su nombre (de `tokens`, si se sabe), value = total y tokenId = id. */
function cleanCombat(data, tokens) {
  let initiative;
  if (Array.isArray(data.order)) {
    const order = data.active ? data.order.filter((o) => plainObject(o) && tokenId(o.id)) : [];
    const nameOf = (id) => (tokens && tokens[id] && tokens[id].sheet && tokens[id].sheet.name) || '';
    initiative = cleanInitiative({ entries: order.map((o, k) => ({ id: k + 1, name: nameOf(o.id), value: o.total | 0, tokenId: o.id, roll: o.roll | 0 || 1, init: o.init | 0 })), turn: data.turn | 0, round: data.round | 0 || 1 });
  } else initiative = cleanInitiative(data.initiative);
  return { initiative, left: fin(data.left) ? clamp(Math.round(data.left), 0, 1000) : 0, dashed: !!data.dashed };
}
const tokenAlive = (t) => !!t && (!t.sheet || !t.sheet.hp || t.sheet.hp.cur > 0);
/* Lo que puede cambiar un jugador del combate, y sólo en el turno de una ficha suya: pasar el turno ({ next: true }: el servidor
   busca la siguiente ficha viva, como el cliente) o lo que le queda de movimiento ({ left, dashed }). */
function playerCombat(uid, current, data, tokens) {
  const ini = current && current.initiative, e = ini && ini.entries[ini.turn], t = e && e.tokenId != null ? tokens[e.tokenId] : null;
  if (!t || t.owner !== uid) return { error: 'Sólo puedes mover en el turno de uno de tus personajes' };
  const doc = JSON.parse(JSON.stringify(current));
  if (data.next === true) {
    const n = ini.entries.length, tokenOf = (i) => (ini.entries[i].tokenId != null ? tokens[ini.entries[i].tokenId] : null);
    let turn = ini.turn, round = ini.round;
    for (let k = 0; k < n; k++) {
      turn++;
      if (turn >= n) { turn = 0; round = Math.min(9999, round + 1); }
      if (tokenAlive(tokenOf(turn))) break;
    }
    const nt = tokenOf(turn), speed = nt && nt.sheet && fin(nt.sheet.speed) ? nt.sheet.speed : 30;
    Object.assign(doc.initiative, { turn, round });
    doc.left = Math.floor(speed / 5); doc.dashed = false;
    return { doc };
  }
  if (fin(data.left)) doc.left = clamp(Math.round(data.left), 0, 1000);
  if (typeof data.dashed === 'boolean') doc.dashed = data.dashed;
  return { doc };
}

/* ---- privacidad de la mesa en vivo, en el servidor (objectFor y visibleTo de JA-VTT): lo que recibe cada conexión ----
   Al jugador no le llegan las fichas ocultas (salvo las suyas), ni la CA de las ajenas, ni su vida si el director la reserva
   (hpVisibility 'gm') o, con 'bar_only', sólo la barra: hpBar { cur, temp }, fracciones de la vida máxima en pasos de 0,05 (nunca
   0 si vive ni 1 si le falta algo). `withheld` dice qué se le ha quitado (para no pintar el valor por defecto). Tampoco las
   anotaciones gmOnly ni los planos del director sin publicar (plansReleased); en el combate, sin la iniciativa si no se muestra
   (initiativeShown) y sin las entradas de fichas ocultas. */
const barOf = (cur, max) => (cur <= 0 ? 0 : cur >= max ? 1 : clamp(Math.round((cur / max) * 20) / 20, 0.05, 0.95));
function sheetFor(sheet, settings) {
  const s = Object.assign({}, sheet), withheld = ['ac'];
  delete s.ac;
  if (settings.hpVisibility !== 'all') {
    withheld.push('hp');
    if (s.hp && settings.hpVisibility === 'bar_only') s.hpBar = { cur: barOf(s.hp.cur, s.hp.max), temp: s.hp.temp > 0 ? barOf(Math.min(s.hp.temp, s.hp.max), s.hp.max) : 0 };
    delete s.hp;
  }
  s.withheld = withheld;
  return s;
}
const isGm = (member) => member.role === 'gm';
/* una ficha (de live/tokens o un personaje de una escena) tal como la ve este miembro, o null si no la ve */
function tokenFor(t, member, settings) {
  if (isGm(member)) return t;
  const uid = String(member.user_id), sheet = t.sheet || {};
  if (t.owner === uid) return t;
  if (sheet.hidden) return null;
  return Object.assign({}, t, { sheet: sheetFor(sheet, settings) });
}
function tokensFor(doc, member, settings) {
  if (isGm(member) || !doc) return doc;
  const tokens = {};
  for (const [id, t] of Object.entries(doc.tokens || {})) { const v = tokenFor(t, member, settings); if (v) tokens[id] = v; }
  return Object.assign({}, doc, { tokens });
}
/* una escena (mapa saneado) tal como la ve este miembro. `board` (Ruling R3b): Map de definiciones `p:`, para que una
   pieza del tablero con gmOnly se esconda igual que una de fábrica (si no, con una `p:` la Tarea 5 la mandaría al
   jugador por no saber consultar su definición). Ronda de arreglos 1, «Importante 1a» (fallar cerrado): si la
   definición de una pieza ya no resuelve (p. ej. se borró de t3d.pieces mientras seguía colocada), Catalogo.gmOnly
   da `false` sin poder consultarla — así que además de las gmOnly se descarta toda pieza sin definición. */
function sceneFor(map, member, settings, board) {
  if (isGm(member) || !map) return map;
  const S = cleanSettings(settings);
  const out = Object.assign({}, map);
  out.minis = (map.minis || []).map((m) => tokenFor(Object.assign({}, m, { owner: typeof m.owner === 'string' ? m.owner : null, sheet: m.sheet || {} }), member, S)).filter(Boolean);
  if (map.notes) out.notes = map.notes.filter((n) => !n.gmOnly);
  if (map.plans) out.plans = map.plansReleased ? map.plans : map.plans.filter((p) => p.owner != null);
  // lo que sólo ve el director (barreras; mañana, secretas; sin definición) no sale del servidor
  if (Array.isArray(map.props)) out.props = map.props.filter((p) => Catalogo.defOf(p, board) && !Catalogo.gmOnly(p, board));
  return out;
}
function combatFor(doc, member, tokens, settings) {
  if (!doc) return doc;
  const ini = doc.initiative || cleanInitiative(null), active = ini.entries.length > 0, cur = active ? ini.entries[ini.turn] : null;
  const curId = (e) => (e && typeof e.tokenId === 'string' ? e.tokenId : null);
  if (isGm(member)) return Object.assign({}, doc, { active, current: curId(cur) });
  const uid = String(member.user_id), tk = tokens || {};
  const own = (e) => e.tokenId != null && !!tk[e.tokenId] && tk[e.tokenId].owner === uid;
  const seen = (e) => !e.hidden && !(e.tokenId != null && tk[e.tokenId] && tk[e.tokenId].sheet && tk[e.tokenId].sheet.hidden && !own(e));
  const entries = ini.entries.filter(seen);
  const current = cur && seen(cur) && (settings.initiativeShown || own(cur)) ? curId(cur) : null;
  const initiative = settings.initiativeShown ? { entries, turn: Math.max(0, entries.indexOf(cur)), round: ini.round } : null;
  return { initiative, active, round: ini.round, current, left: doc.left, dashed: doc.dashed };
}
/* Documento de la mesa en vivo tal como lo recibe este miembro. docs: los documentos de la mesa (para el combate, las
   fichas). `board` (Ruling R3b): Map de definiciones `p:` del tablero, para sceneFor. */
function liveDocFor(key, doc, member, settings, docs, board) {
  if (doc == null) return doc;
  const S = cleanSettings(settings);
  if (key === 'tokens') return tokensFor(doc, member, S);
  if (key === 'combat') return combatFor(doc, member, docs && docs.tokens ? docs.tokens.tokens : {}, S);
  if (key === 'board' && doc.board && !isGm(member)) return Object.assign({}, doc, { board: sceneFor(doc.board, member, S, board) });
  return doc;
}
/* Una campaña tal como la ve este miembro: el jugador, sin las notas del director y con cada escena filtrada.
   `board` (Ruling R3b): Map de definiciones `p:` del tablero, para sceneFor. */
function campaignFor(c, member, settings, board) {
  if (isGm(member)) return c;
  const boards = {};
  for (const [k, v] of Object.entries(c.boards || {})) boards[k] = Object.assign({}, v, { data: sceneFor(v.data, member, cleanSettings(settings), board) });
  return Object.assign({}, c, { boards, notes: {} });
}

/* Dibujo: metadatos + una hoja PNG por capa (data URL). Devuelve el registro y las capas en bytes. */
function cleanDrawing(o) {
  if (!plainObject(o) || !DRAWING_KINDS.includes(o.kind)) return null;
  const key = str(o.key, 40);
  if (!/^[A-Za-z0-9_:]{1,40}$/.test(key)) return null;
  const w = o.w, h = o.h, frames = o.count, cols = o.cols;
  if (![w, h, frames, cols].every(Number.isInteger) || w < 1 || h < 1 || w > 256 || h > 384 || frames < 1 || frames > 512 || cols < 1) return null;
  if (!Array.isArray(o.layers) || !o.layers.length || o.layers.length > MAX_LAYERS) return null;
  const layers = [];
  for (const [idx, l] of o.layers.entries()) {
    const m = plainObject(l) && typeof l.sheet === 'string' ? /^data:image\/png;base64,/.exec(l.sheet) : null;
    if (!m) return null;
    const data = Buffer.from(l.sheet.slice(m[0].length), 'base64');
    if (!data.length || data.length > LAYER_MAX_BYTES) return null;
    const opacity = fin(l.op) ? clamp(Math.round(l.op), 0, 100) : 100;
    layers.push({ idx, name: str(l.name, 20) || 'Capa', visible: l.vis !== false, opacity, locked: l.lock === true, mime: 'image/png', data });
  }
  const frameNames = Array.isArray(o.frameNames) ? o.frameNames.slice(0, frames).map((x) => str(x, 20)) : [];
  return {
    drawing: {
      key, kind: o.kind, target: str(o.target, 40) || key, name: str(o.name, 30).trim() || 'Dibujo',
      res: [16, 32, 64].includes(o.res) ? o.res : 32, width: w, height: h, light: !!o.light, frames, cols, frameNames,
      charSize: o.kind === 'char' ? (CHAR_SIZES.includes(o.charSize) ? o.charSize : 'medium') : null,
      lightSpec: o.kind === 'obj' && o.light ? cleanLightSpec(o.lightSpec, w, h, frames) : null,
      size: layers.reduce((s, l) => s + l.data.length, 0),
    },
    layers,
  };
}

/* Luz de un objeto dibujado: píxel (px, py) de la rebanada s, radio, color, parpadeo y, si lo tiene, el tipo
   de luz (`preset`, sin cono ni oscuridad) cuya intensidad y animación toma (`recLight` del cliente) */
function cleanLightSpec(L, w, h, frames) {
  if (!plainObject(L)) return null;
  const n = (v, a, b, d) => (fin(v) ? clamp(Math.round(v), a, b) : d);
  const out = {
    px: n(L.px, 0, w - 1, (w - 1) >> 1), py: n(L.py, 0, h - 1, (h - 1) >> 1), s: n(L.s, 0, frames - 1, 0),
    r: n(L.r, 1, 12, 6), c: hex6(L.c) ? L.c.toLowerCase() : '#ff9c50', f: L.f === 0 ? 0 : 1,
  };
  if (OBJ_LIGHTS.includes(L.preset)) out.preset = L.preset;
  return out;
}

/* De la base al formato que espera el cliente (`recordToDoc`) */
function drawingRecord(row, layers) {
  return {
    key: row.key, kind: row.kind, target: row.target, name: row.name, res: row.res, w: row.width, h: row.height,
    ...(row.kind === 'char' ? { charSize: CHAR_SIZES.includes(row.char_size) ? row.char_size : 'medium' } : {}),
    light: row.light, lightSpec: row.light_spec || null, count: row.frames, cols: row.cols, frameNames: row.frame_names, updated: row.updated_at,
    layers: layers.map((l) => ({ name: l.name, vis: l.visible, op: l.opacity ?? 100, lock: !!l.locked, sheet: `data:${l.mime};base64,${l.data.toString('base64')}` })),
  };
}

/* Luz que lleva una ficha: el objeto `light` de JA-VTT (cleanLight de su server/rules.js, color en minúsculas) */
const noLight = () => ({ preset: 'none', on: false, bright: 0, dim: 0, color: '#ffffff', intensity: 1, anim: 'none', angle: 360, rot: 0 });
function cleanTokenLight(L) {
  return {
    preset: [...LIGHT_PRESETS, 'none'].includes(L.preset) ? L.preset : 'custom', on: !!L.on,
    bright: fin(L.bright) ? clamp(L.bright, 0, 300) : 0, dim: fin(L.dim) ? clamp(L.dim, 0, 300) : 0,
    color: hex6(L.color) ? L.color.toLowerCase() : '#ffffff', intensity: fin(L.intensity) ? clamp(L.intensity, 0, 1.2) : 1,
    anim: ANIMS.includes(L.anim) ? L.anim : 'none', angle: fin(L.angle) ? clamp(L.angle, 1, 360) : 360, rot: fin(L.rot) ? clamp(L.rot, -3600, 3600) : 0,
  };
}
/* `luz` de antes: un tipo de TOKEN_LIGHTS o un radio en casillas de luz cálida parpadeante */
function lightFromOld(v) {
  if (typeof v === 'string') {
    const P = TOKEN_LIGHT_DEFS[v];
    return P ? { preset: v, on: true, bright: P.bright, dim: P.dim, color: P.color, intensity: P.intensity, anim: P.anim, angle: P.angle || 360, rot: 0 } : noLight();
  }
  if (!fin(v)) return null;
  const r = clamp(Math.round(v), 0, 12);
  return r ? { preset: 'custom', on: true, bright: r * 2.5, dim: r * 2.5, color: '#ff9c50', intensity: 0.9, anim: 'flicker', angle: 360, rot: 0 } : noLight();
}

/* Ficha de un personaje (`sheet`): los campos de la ficha de JA-VTT (name, kind, size, color, hidden, vision,
   sight y darkvision en pies, light, conditions, elevation en pies, ac, hp {cur,max,temp}) más speed (pies) e
   init del 3D y sus extras neutral, tiny y small. Lee también las fichas de antes (team, hp/hpMax, vision y dark
   en casillas, luz). Lo que no se puede deducir se omite (el cliente pone el valor del sprite); con una ficha
   completa da lo mismo que `Fichas.norm` del cliente (lo compara test/frontend.test.js). */
function cleanSheet(s) {
  if (!plainObject(s)) return {};
  const int = (v, a, b) => clamp(Math.round(v), a, b);
  const out = {};
  if (typeof s.name === 'string' && s.name.trim()) out.name = s.name.slice(0, 40);
  const newKind = s.kind === 'player' || s.kind === 'enemy', kind = newKind ? s.kind : TEAM_KIND[s.team];
  if (kind) { out.kind = kind; if (kind === 'enemy' && (newKind ? s.neutral === true : s.team === 'npc')) out.neutral = true; }
  const hasSize = s.size !== undefined;
  out.size = hasSize && [1, 2, 3, 4].includes(s.size) ? s.size : 1;
  if (out.size === 1 && hasSize && (s.size === 0.5 || s.tiny === true)) out.tiny = true;
  else if (out.size === 1 && hasSize && s.small === true) out.small = true;
  if (hex6(s.color)) out.color = s.color.toLowerCase();
  out.hidden = !!s.hidden;
  if (fin(s.vision)) { out.vision = true; out.sight = int(s.vision, 1, 60) * 5; } else {
    out.vision = s.vision !== false;
    if (fin(s.sight)) out.sight = int(s.sight, 0, 5000);
  }
  if (fin(s.darkvision)) out.darkvision = int(s.darkvision, 0, 300); else if (fin(s.dark)) out.darkvision = int(s.dark, 0, 24) * 5;
  const light = plainObject(s.light) ? cleanTokenLight(s.light) : lightFromOld(s.luz);
  if (light) out.light = light;
  out.conditions = Array.isArray(s.conditions) ? [...new Set(s.conditions.filter((x) => CONDITION_IDS.includes(x)))] : [];
  out.elevation = fin(s.elevation) ? int(s.elevation, -9999, 9999) : 0;
  if (fin(s.ac)) out.ac = int(s.ac, 0, 99);
  if (plainObject(s.hp) && fin(s.hp.max)) {
    const max = int(s.hp.max, 1, 9999);
    out.hp = { cur: fin(s.hp.cur) ? int(s.hp.cur, 0, max) : max, max, temp: fin(s.hp.temp) ? int(s.hp.temp, 0, 9999) : 0 };
  } else if (fin(s.hpMax)) {
    const max = int(s.hpMax, 1, 9999);
    out.hp = { cur: fin(s.hp) ? int(s.hp, 0, max) : max, max, temp: 0 };
  }
  if (fin(s.speed)) out.speed = int(s.speed, 0, 120);
  if (fin(s.init)) out.init = int(s.init, -10, 20);
  return out;
}
function cleanToken(t) {
  if (!plainObject(t) || typeof t.kind !== 'string' || !/^[A-Za-z0-9_]{1,24}$/.test(t.kind) || !Number.isInteger(t.x) || !Number.isInteger(t.z)) return null;
  return {
    kind: t.kind, x: clamp(t.x, 0, MAP_MAX), z: clamp(t.z, 0, MAP_MAX), fx: Math.sign(t.fx | 0), fz: Math.sign(t.fz | 0),
    sheet: cleanSheet(t.sheet), owner: typeof t.owner === 'string' && /^\d{1,15}$/.test(t.owner) ? t.owner : null,
  };
}
function cleanTokens(map) {
  const out = {};
  if (!plainObject(map)) return out;
  for (const [id, t] of Object.entries(map).slice(0, 500)) {
    if (!tokenId(id)) continue;
    const c = cleanToken(t);
    if (c) out[id] = c;
  }
  return out;
}

/* Documento de la mesa en vivo tal como se guarda. `tokens` (opcional): las fichas de la mesa, para nombrar las entradas de
   un combate de antes. `board` (Ruling R3b): Map de definiciones `p:` del tablero, para cleanMap. */
function cleanLiveDoc(key, data, tokens, board) {
  if (!LIVE_KEYS.includes(key) || !plainObject(data)) return null;
  let doc;
  if (key === 'board') {
    doc = { open: !!data.open, rev: Number.isInteger(data.rev) ? data.rev : 0 };
    if (docId(data.scene)) doc.scene = data.scene; // la escena guardada que muestra la mesa (para cruzar portales)
    if ('board' in data) { const map = cleanMap(data.board, board); if (!map) return null; doc.board = map; }
  } else if (key === 'tokens') {
    doc = { tokens: cleanTokens(data.tokens) };
  } else if (key === 'doors') {
    doc = { d: {} };
    for (const [k, v] of Object.entries(plainObject(data.d) ? data.d : {}).slice(0, 5000)) if (/^\d{1,3}_\d{1,3}$/.test(k)) doc.d[k] = v ? 1 : 0;
  } else if (key === 'plans') {
    // los planos de los jugadores (los del director van en la escena, live/board): { plans: { id: plano } }; null lo quita
    doc = { plans: {} };
    for (const [k, v] of Object.entries(plainObject(data.plans) ? data.plans : {}).slice(0, 200)) {
      const p = /^\d{1,9}$/.test(k) && plainObject(v) ? cleanPlan(Object.assign({}, v, { id: Number(k) }), MAP_MAX, MAP_MAX) : null;
      if (p && p.owner) doc.plans[k] = p;
    }
  } else {
    doc = cleanCombat(data, tokens);
  }
  return bytes(doc) > LIVE_MAX_BYTES ? null : doc;
}

/* Mezcla profunda de `update` (como el almacén de documentos al que llama el cliente) */
function merge(a, b) {
  for (const k of Object.keys(b)) {
    const v = b[k];
    if (plainObject(v) && plainObject(a[k])) merge(a[k], v);
    else a[k] = v;
  }
  return a;
}

/* Puertas que un jugador quiere abrir o cerrar: las que cambian tienen que ser puertas de la escena de la mesa, sin llave, y
   el tablero tiene que dejar a los jugadores abrirlas (playersDoors, como JA-VTT). Devuelve un texto de error o null.
   `ctx.pieces` (Ruling R3b, si viene): Map de definiciones `p:` del tablero, para que una puerta `p:` se reconozca igual
   que una de fábrica. */
function playerDoors(doc, current, ctx) {
  const settings = cleanSettings(ctx && ctx.settings);
  const board = ctx && ctx.board && plainObject(ctx.board.board) ? ctx.board.board : null;
  const pieces = ctx && ctx.pieces;
  for (const [k, v] of Object.entries(doc.d)) {
    if ((current.d && current.d[k] ? 1 : 0) === v) continue;
    const [x, z] = k.split('_').map(Number);
    const door = board && (board.props || []).find((p) => Catalogo.isDoor(p, pieces) && p.x === x && p.z === z);
    if (!door) return 'Ahí no hay ninguna puerta';
    if (!settings.playersDoors) return 'El director no deja a los jugadores abrir puertas';
    if (door.locked) return 'Esa puerta está cerrada con llave';
  }
  return null;
}

/* ¿Puede este miembro aplicar este cambio a la mesa en vivo? Devuelve el documento nuevo
   (ya saneado) o un texto de error. `current` es el documento actual (o null); `ctx` = { board: el documento
   live/board, settings: los ajustes del tablero, tokens: las fichas de live/tokens, pieces: Map de definiciones `p:`
   del tablero (Ruling R3b) } para las puertas, el combate y los planos del jugador. */
function liveChange(member, key, op, data, current, ctx) {
  if (!LIVE_KEYS.includes(key) || !['set', 'update', 'delete'].includes(op)) return { error: 'Operación no válida' };
  const gm = member.role === 'gm';
  if (op === 'delete') return gm ? { doc: null } : { error: 'Sólo el director puede cerrar la mesa' };
  if (op === 'update' && !current) {
    if (key !== 'plans') return { error: 'Ese documento no existe' };
    current = { plans: {} }; // una mesa abierta antes de que hubiera planos
  }
  const tokens = ctx && ctx.tokens ? ctx.tokens : {};
  const pieces = ctx && ctx.pieces;
  if (!gm && key === 'combat' && op === 'update') return playerCombat(String(member.user_id), current, plainObject(data) ? data : {}, tokens);
  const next = op === 'update' ? merge(JSON.parse(JSON.stringify(current)), plainObject(data) ? data : {}) : data;
  const doc = cleanLiveDoc(key, next, tokens, pieces);
  if (!doc) return { error: 'Datos no válidos' };
  if (gm) return { doc };
  if (key === 'doors' && op === 'update') { const err = playerDoors(doc, current, ctx); return err ? { error: err } : { doc }; }
  if (key === 'plans' && op === 'update') {
    // un jugador pone, cambia y quita sólo sus planos (como playerUpsert de JA-VTT), hasta MAX_PLAYER_PLANS
    const uid = String(member.user_id), before = (cleanLiveDoc('plans', current) || { plans: {} }).plans;
    for (const k of new Set([...Object.keys(before), ...Object.keys(doc.plans)])) {
      if (JSON.stringify(before[k]) === JSON.stringify(doc.plans[k])) continue;
      if ((before[k] && before[k].owner !== uid) || (doc.plans[k] && doc.plans[k].owner !== uid)) return { error: 'Sólo puedes cambiar tus propios planos' };
    }
    if (Object.values(doc.plans).filter((p) => p.owner === uid).length > MAX_PLAYER_PLANS) return { error: `Como mucho ${MAX_PLAYER_PLANS} planos por jugador` };
    return { doc };
  }
  if (key === 'tokens' && op === 'update') {
    // un jugador sólo cambia sus personajes, y no puede regalarlos ni crear otros
    const uid = String(member.user_id);
    // lo de antes, también saneado: una ficha guardada con el formato de antes se compara ya traducida
    const before = cleanTokens(current.tokens);
    for (const [id, t] of Object.entries(doc.tokens)) {
      const old = before[id];
      if (JSON.stringify(old) === JSON.stringify(t)) continue;
      if (!old || old.owner !== uid || t.owner !== uid || t.kind !== old.kind) return { error: 'Solo puedes mover tus propios personajes' };
      if (GM_SHEET_KEYS.some((k) => JSON.stringify(old.sheet[k]) !== JSON.stringify(t.sheet[k]))) return { error: 'Sólo el director cambia el bando, el tamaño, la visión o la visibilidad de una ficha' };
    }
    for (const id of Object.keys(before)) if (!doc.tokens[id]) return { error: 'Solo puedes mover tus propios personajes' };
    return { doc };
  }
  return { error: 'Sólo el director puede cambiar la mesa' };
}

/* Definición de pieza del tablero (p:…), como la valida el cliente: Catalogo.validateDef */
const cleanPiece = (o) => Catalogo.validateDef(o);

module.exports = {
  ENVS, ENV_IDS, cleanEnv, cleanZoneCells,
  WALL_KINDS, DOOR_PROPS, WALL_PROPS, PORTAL_LOOKS, PASSABLE_PROPS, PROP_SPANS, stairsId, cleanWallProp, fixPortalIds, gridOf, arrival, portalIn, nearPortal,
  travelPlan, clearPortalsTo, tokensToMinis, minisToTokens, HP_VISIBILITY, BOARD_KEYS, DEFAULT_SETTINGS, cleanSettings, HOST_SETTINGS, settingsParts,
  SCENE_MAX_BYTES, CAMPAIGN_MAX_BYTES, LAYER_MAX_BYTES, MAX_LAYERS, BODY_LIMITS, docBytes: bytes,
  SCENE_FLAGS, cleanSceneFlags, PLAN_SHAPES, MAX_PLAYER_PLANS, cleanPlan, cleanNote, cleanInitiative, cleanCombat, playerCombat,
  sheetFor, tokenFor, tokensFor, sceneFor, combatFor, liveDocFor, campaignFor, playerDoors, cleanPiece,
  LIVE_KEYS, MAP_MAX, CHAR_SIZES, ROOF_MATS, ROOF_SHAPES, cleanRoof, LIGHT_PRESETS, ANIMS, TOKEN_LIGHTS, TOKEN_LIGHT_DEFS, CONDITION_IDS, cleanSheet, cleanLightProp, str, docId, cleanMap, cleanCampaign, cleanDrawing, drawingRecord, cleanLiveDoc, cleanTokens, liveChange, merge,
};
