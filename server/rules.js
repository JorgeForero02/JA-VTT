'use strict';
/* Validación de todo lo que llega de los navegadores y reglas de permisos.
   El servidor es la autoridad: el director puede todo; un jugador solo
   puede mover y personalizar su propio personaje (y abrir puertas si el
   director lo permite). */

const TYPES = ['wall', 'light', 'token', 'asset', 'plan', 'zone'];
const WALL_KINDS = ['wall', 'door', 'window', 'veil', 'cover', 'barrier', 'portal'];
const LIGHT_PRESETS = ['candle', 'torch', 'lantern', 'bullseye', 'campfire', 'brazier', 'magic', 'crystal', 'moon', 'daylight', 'window', 'darkness', 'custom', 'none'];
const ANIMS = ['none', 'flicker', 'soft', 'pulse'];
const ENVS = ['interior', 'day', 'dusk', 'night'];
const MODES = ['2d', '2.5d'];
const LAYER_IDS = ['map', 'props', 'zones', 'plans', 'tokens', 'lights', 'walls'];

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const col = (v, d = '#FFFFFF') => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
const pt = (v) => (v && fin(v.x) && fin(v.y) ? { x: clamp(v.x, -1e7, 1e7), y: clamp(v.y, -1e7, 1e7) } : null);
const imgId = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);

function cleanLight(L) {
  if (!L || typeof L !== 'object') return null;
  return {
    preset: LIGHT_PRESETS.includes(L.preset) ? L.preset : 'custom',
    on: !!L.on,
    bright: fin(L.bright) ? clamp(L.bright, 0, 300) : 0,
    dim: fin(L.dim) ? clamp(L.dim, 0, 300) : 0,
    color: col(L.color),
    intensity: fin(L.intensity) ? clamp(L.intensity, 0, 1.2) : 1,
    anim: ANIMS.includes(L.anim) ? L.anim : 'none',
    angle: fin(L.angle) ? clamp(L.angle, 1, 360) : 360,
    rot: fin(L.rot) ? clamp(L.rot, -3600, 3600) : 0,
  };
}
const noLight = () => ({ preset: 'none', on: false, bright: 0, dim: 0, color: '#FFFFFF', intensity: 1, anim: 'none', angle: 360, rot: 0 });

function sanitize(o) {
  if (!o || typeof o !== 'object' || !TYPES.includes(o.type) || !fin(o.id) || !Number.isInteger(o.id)) return null;
  const c = { id: o.id, type: o.type };
  if (o.type === 'wall') {
    const a = pt(o.a), b = pt(o.b);
    if (!a || !b) return null;
    Object.assign(c, { kind: WALL_KINDS.includes(o.kind) ? o.kind : 'wall', a, b, open: !!o.open, locked: !!o.locked });
    if (fin(o.group)) c.group = o.group;
    if (c.kind === 'portal') {
      c.open = false;
      c.name = str(o.name, 40);
      const t = o.target;
      c.target = t && typeof t.scene === 'string' && /^s_[a-f0-9]{12}$/.test(t.scene)
        ? { scene: t.scene, portal: Number.isInteger(t.portal) ? t.portal : null } : null;
    }
    return c;
  }
  if (o.type === 'plan') {
    const a = pt(o.a), b = pt(o.b);
    if (!a || !b) return null;
    Object.assign(c, { shape: ['line', 'circle', 'rect', 'cone'].includes(o.shape) ? o.shape : 'line', a, b });
    if (Number.isInteger(o.owner)) { c.owner = o.owner; c.color = col(o.color, '#8EC5E8'); }
    return c;
  }
  const p = pt(o);
  if (!p) return null;
  c.x = p.x; c.y = p.y;
  if (o.type === 'light') {
    Object.assign(c, cleanLight(o), { name: str(o.name, 40), darkness: !!o.darkness });
    return c;
  }
  if (o.type === 'zone') {
    if (!fin(o.w) || !fin(o.h)) return null;
    Object.assign(c, { w: Math.abs(o.w), h: Math.abs(o.h), name: str(o.name, 40) });
    if (Array.isArray(o.pts)) {
      const pts = o.pts.slice(0, 600).map(pt).filter(Boolean);
      if (pts.length > 2) c.pts = pts;
    }
    return c;
  }
  if (o.type === 'asset') {
    if (!fin(o.w) || !fin(o.h)) return null;
    Object.assign(c, {
      kind: o.kind === 'prop' ? 'prop' : 'map', name: str(o.name, 60), img: imgId(o.img),
      w: clamp(o.w, 5, 1e6), h: clamp(o.h, 5, 1e6), rot: fin(o.rot) ? o.rot : 0,
      opacity: fin(o.opacity) ? clamp(o.opacity, 0, 1) : 1,
    });
    const P = o.physics;
    if (P && fin(P.group) && ['rect', 'ellipse'].includes(P.shape) && WALL_KINDS.includes(P.kind)) c.physics = { group: P.group, shape: P.shape, kind: P.kind };
    return c;
  }
  if (o.type === 'token') {
    return Object.assign(c, {
      kind: o.kind === 'enemy' ? 'enemy' : 'player', name: str(o.name, 40), size: [1, 2, 3, 4].includes(o.size) ? o.size : 1,
      color: col(o.color, '#7FB2E5'), hidden: !!o.hidden, vision: o.vision !== false,
      sight: fin(o.sight) ? clamp(o.sight, 0, 5000) : 0, darkvision: fin(o.darkvision) ? clamp(o.darkvision, 0, 300) : 0,
      light: cleanLight(o.light) || noLight(), img: imgId(o.img), owner: Number.isInteger(o.owner) ? o.owner : null,
    });
  }
  return null;
}

const BOARD_KEYS = ['mode', 'sharedVision', 'playersDoors', 'chatEnabled', 'diceEnabled', 'initiativeShown', 'initiative'];
function cleanSettings(sc) {
  const o = {};
  if (!sc || typeof sc !== 'object') return o;
  if (ENVS.includes(sc.env)) o.env = sc.env;
  if (MODES.includes(sc.mode)) o.mode = sc.mode;
  if (fin(sc.ambient)) o.ambient = clamp(sc.ambient, 0, 1);
  if (typeof sc.darkColor === 'string') o.darkColor = col(sc.darkColor, '#0B0E11');
  for (const k of ['fog', 'grid', 'snap', 'animate', 'plansReleased', 'sharedVision', 'playersDoors', 'chatEnabled', 'diceEnabled', 'initiativeShown']) if (typeof sc[k] === 'boolean') o[k] = sc[k];
  if (sc.initiative !== undefined) o.initiative = cleanInitiative(sc.initiative);
  if (sc.layers && typeof sc.layers === 'object') {
    o.layers = {};
    for (const id of LAYER_IDS) {
      const v = sc.layers[id];
      o.layers[id] = { visible: !(v && v.visible === false), locked: !!(v && v.locked) };
    }
  }
  return o;
}

const DEFAULT_SCENE = { env: 'interior', ambient: 0, darkColor: '#0B0E11', fog: true, grid: true, snap: true, animate: true, plansReleased: false };
const DEFAULT_BOARD = { mode: '2d', sharedVision: true, playersDoors: true, chatEnabled: true, diceEnabled: true, initiativeShown: false, initiative: { entries: [], turn: 0, round: 1 } };
function splitSettings(sc) {
  const all = cleanSettings(sc), board = {}, scene = {};
  for (const [k, v] of Object.entries(all)) (BOARD_KEYS.includes(k) ? board : scene)[k] = v;
  return { board, scene };
}

/* Iniciativa: lista ordenada por el director. `tokenId` enlaza con una ficha (para ocultar a los
   jugadores las de fichas ocultas); las entradas sueltas no lo llevan. */
const MAX_INITIATIVE = 60;
function cleanInitiative(v) {
  const src = v && typeof v === 'object' ? v : {};
  const entries = (Array.isArray(src.entries) ? src.entries : []).slice(0, MAX_INITIATIVE).map((e) => {
    if (!e || typeof e !== 'object') return null;
    const out = { id: fin(e.id) ? Math.round(e.id) : Date.now(), name: str(e.name, 40).trim() || 'Sin nombre', value: fin(e.value) ? clamp(Math.round(e.value * 100) / 100, -99, 999) : 0 };
    if (fin(e.tokenId)) out.tokenId = e.tokenId;
    if (typeof e.hidden === 'boolean') out.hidden = e.hidden;
    return out;
  }).filter(Boolean);
  const turn = fin(src.turn) ? clamp(Math.round(src.turn), 0, Math.max(0, entries.length - 1)) : 0;
  const round = fin(src.round) ? clamp(Math.round(src.round), 1, 9999) : 1;
  return { entries, turn, round };
}
/* Lo que un jugador puede ver de la iniciativa: nada si está oculta; sin las fichas ocultas si no */
function initiativeFor(board, member, objects) {
  if (member.role === 'gm') return board.initiative;
  if (!board.initiativeShown) return null;
  const hiddenTokens = new Set([...objects].filter((o) => o.type === 'token' && o.hidden).map((o) => o.id));
  const entries = board.initiative.entries.filter((e) => !e.hidden && !(e.tokenId != null && hiddenTokens.has(e.tokenId)));
  return { entries, turn: board.initiative.turn, round: board.initiative.round };
}

/* Decide qué versión de un objeto se acepta de un jugador. Devuelve el
   objeto resultante o null si el cambio no está permitido. */
const MAX_PLAYER_PLANS = 40;
function playerUpsert(uid, old, neu, board, ownedCount, plansCount) {
  if (neu.type === 'plan') {
    if (old ? old.owner !== uid : plansCount >= MAX_PLAYER_PLANS) return null;
    return Object.assign({}, neu, { owner: uid });
  }
  if (neu.type === 'token') {
    if (old) {
      if (old.owner !== uid) return null;
      return Object.assign({}, old, {
        x: neu.x, y: neu.y, name: neu.name || old.name, color: neu.color, img: neu.img, light: neu.light,
      });
    }
    if (ownedCount >= 1 || neu.kind !== 'player' || neu.owner !== uid) return null;
    return Object.assign({}, neu, { hidden: false, vision: true, sight: 0, darkvision: 0, size: 1 });
  }
  if (neu.type === 'wall' && old && old.kind === 'door' && board.settings.playersDoors !== false && !old.locked) {
    return Object.assign({}, old, { open: !!neu.open });
  }
  return null;
}

/* JSON con las claves ordenadas: para comparar objetos sin que importe el orden */
function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sameObject = (a, b) => stableJson(a) === stableJson(b);

/* Qué ve un jugador: sin fichas ocultas (salvo las suyas) ni planos sin publicar */
function visibleTo(o, member, settings) {
  if (member.role === 'gm') return true;
  if (o.type === 'token' && o.hidden && o.owner !== member.user_id) return false;
  if (o.type === 'plan' && !settings.plansReleased && o.owner == null) return false;
  return true;
}

module.exports = { sanitize, cleanSettings, splitSettings, DEFAULT_SCENE, DEFAULT_BOARD, MODES, playerUpsert, visibleTo, str, stableJson, sameObject, cleanInitiative, initiativeFor };
