'use strict';
/* Catálogo de piezas del tablero 3D (Tablero3D.Catalogo en el navegador; require() en el servidor). Una pieza es una
   DEFINICIÓN (forma + componentes + estados + variantes) y cada objeto colocado en la escena apunta a una (`def`) y
   guarda su `uid` y su `state`. Esquema: docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md §3.2.
   Las piezas de fábrica de abajo reproducen lo que hacía el código antes de la fase 0 (test/t3d/catalogo.test.js). */
(function (root) {
  const SCHEMA = 1;
  const SENSE = ['none', 'limited', 'block'];
  const CLASSES = ['terrain', 'object', 'wall', 'hanging'];
  const LAYERS = ['ground', 'object', 'wall', 'hanging'];
  const WALL_KINDS = ['door', 'window', 'veil', 'cover', 'barrier', 'portal'];
  const PORTAL_LOOKS = { door: true, stairs: false, cave: true, trapdoor: false, magic: true };   // ¿de pie? (los de suelo no tapan)
  const DEF_ID = /^(f|p|d):[A-Za-z0-9_~-]{1,40}$/;
  const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  /* ---- fábrica ---- una línea por tipo: [casillas, banderas]. Banderas: o orienta · W se pisa · r giro al azar ·
     G sólo director · L objeto bajo (la maleza lo oculta) · D puerta · k:<tipo> muro de JA-VTT · d:<n> tarima ·
     e:<r>:<h> luz fija · lift:<n> puerta que sube. Salen de PROP3D/WALL_TYPES/rules.js de antes (fabrica-antes.json). */
  const RAW = {
    window: [[1, 1], 'o k:window'], veil: [[1, 1], 'o W k:veil'], cover: [[1, 1], 'W r k:cover'], barrier: [[1, 1], 'o G k:barrier'],
    portal: [[1, 1], 'o k:portal'], portal_stairs: [[1, 1], 'o'], portal_cave: [[1, 1], 'o'], portal_trap: [[1, 1], 'o'], portal_magic: [[1, 1], 'o'],
    door: [[1, 1], 'o D k:door'], chest: [[1, 1], 'r L'], barrel: [[1, 1], 'r L'], table: [[1, 1], 'o L'], bed: [[1, 1], 'o L'],
    shelf: [[1, 1], 'o L'], fence: [[1, 1], 'o'], well: [[1, 1], ''], lamp: [[1, 1], 'r e:5:2.125'], stairs: [[1, 1], 'W'],
    torch: [[1, 1], 'r e:4:1.125'], bridge: [[1, 1], 'o W d:16'], bridge2: [[2, 1], 'o W d:16'], gate: [[1, 1], 'o D k:door lift:1.5'],
    gatearch: [[1, 1], 'o'], stall: [[2, 1], 'o'], stall2: [[2, 1], 'o'], windmill: [[3, 3], 'o'], belfry: [[1, 1], ''], post: [[1, 1], ''],
    cart: [[2, 1], 'o L'], crates: [[1, 1], 'r L'], bench: [[1, 1], 'o L'], picket: [[1, 1], 'o L'], stonewall: [[1, 1], 'o L'],
    sign: [[1, 1], 'o L'], tree: [[1, 1], 'r'], brazier: [[1, 1], 'e:6:0.8'], light: [[1, 1], 'W'],
  };
  const WALLS = {   // lo que tapa cada tipo de muro de JA-VTT (WALL_TYPES: sight, light, move, hide)
    door: { sight: 1, light: 1 }, window: {}, veil: { sight: 1, light: 1 }, cover: { hide: 1 }, barrier: {}, portal: { sight: 1, light: 1 },
  };
  function factoryObject(type, span, flags) {
    const f = flags.split(' ').filter(Boolean), has = (k) => f.includes(k), val = (k) => (f.find((x) => x.startsWith(k + ':')) || '').slice(k.length + 1);
    const kind = val('k') || null, W = kind ? WALLS[kind] : null, deck = +val('d') || 0, e = val('e');
    const def = {
      schema: SCHEMA, id: 'f:' + type, name: type, class: kind ? 'wall' : 'object',
      art: { base: type },
      shape: { w: span[0], d: span[1], height: 1, orient: has('o'), random: has('r'), layer: kind ? 'wall' : 'object', low: has('L') },
      components: {
        move: { block: !has('W') }, sight: W && W.sight ? 'block' : 'none', light: W && W.light ? 'block' : 'none',
        ...(W && W.hide ? { hide: true } : {}), ...(has('G') ? { gmOnly: true } : {}), ...(deck ? { surface: { walkable: true, height: deck } } : {}),
        ...(e ? { emitLight: { r: +e.split(':')[0], h: +e.split(':')[1] } } : {}),
        ...(has('D') ? { door: val('lift') ? { lift: +val('lift') } : {} } : {}), ...(kind === 'portal' ? { portal: { looks: Object.keys(PORTAL_LOOKS) } } : {}),
      },
      interactions: [], reactions: [], kind,
    };
    if (has('D')) {
      def.states = { open: { values: [false, true], initial: false }, locked: { values: [false, true], initial: false } };
      def.variants = [{ when: { open: true }, set: { move: { block: false }, sight: 'none', light: 'none' } }];
    }
    return def;
  }
  // terrenos (letras de M.t): muro y lava no se pisan; el muro tapa vista y luz; '~' es el agua de las escenas de antes
  const TERR_RAW = { g: '', a: '', p: '', s: '', o: '', c: '', n: '', w: 'B S', l: 'B H A', '~': 'Q' };
  function factoryTerrain(l, flags) {
    const f = flags.split(' ');
    return {
      schema: SCHEMA, id: 'f:' + l, name: l, class: 'terrain', art: { base: l },
      shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'ground' },
      components: { move: { block: f.includes('B') }, sight: f.includes('S') ? 'block' : 'none', light: f.includes('S') ? 'block' : 'none',
        terrain: { liquid: f.includes('Q'), hazard: f.includes('H'), anim: f.includes('A') } },
      interactions: [], reactions: [],
    };
  }
  const FACTORY = {};
  for (const [t, [span, flags]] of Object.entries(RAW)) FACTORY['f:' + t] = factoryObject(t, span, flags);
  const TERRAIN = {};
  for (const [l, flags] of Object.entries(TERR_RAW)) TERRAIN[l] = FACTORY['f:' + l] = factoryTerrain(l, flags);
  for (const d of Object.values(FACTORY)) Object.freeze(d);

  /* ---- de pieza colocada a definición ---- */
  function defIdOf(p) {
    if (!p || typeof p.type !== 'string') return null;
    if (typeof p.def === 'string' && DEF_ID.test(p.def)) return p.def;
    if (/^obj:o_[a-z0-9]{4,16}$/.test(p.type)) return 'd:' + p.type.slice(4);
    return FACTORY['f:' + p.type] ? 'f:' + p.type : null;
  }
  // dibujo de objeto antiguo (`obj:o_…`): lo que hacía antes — sólido, 1×1, giro al azar, bajo (la maleza lo oculta)
  const drawingDef = (id) => ({ schema: SCHEMA, id, name: id.slice(2), class: 'object', art: { base: id.slice(2) },
    shape: { w: 1, d: 1, height: 1, orient: false, random: true, layer: 'object', low: true },
    components: { move: { block: true }, sight: 'none', light: 'none' }, interactions: [], reactions: [], kind: null });
  function defOf(p, board) {
    const id = defIdOf(p);
    if (!id) return null;
    if (id.startsWith('f:')) return FACTORY[id] || null;
    if (id.startsWith('d:')) return drawingDef(id);
    return (board && board.get(id)) || null;
  }
  // estado de una pieza: `state` (formato nuevo) o, en las escenas de antes, `open`/`locked` en la raíz
  function stateOf(p, def) {
    const out = {};
    for (const [k, s] of Object.entries((def && def.states) || {})) {
      const v = plain(p.state) && k in p.state ? p.state[k] : k in p ? p[k] : s.initial;
      out[k] = s.values.includes(v) ? v : s.initial;
    }
    return out;
  }
  function comp(def, state, name) {
    if (!def) return undefined;
    let v = def.components[name];
    for (const va of def.variants || []) if (Object.entries(va.when).every(([k, x]) => state[k] === x) && name in va.set) v = va.set[name];
    return v;
  }
  const eff = (p, board, name) => { const d = defOf(p, board); return d ? comp(d, stateOf(p, d), name) : undefined; };
  const wallKind = (p, board) => { const d = defOf(p, board); return d ? d.kind || null : null; };
  const isDoor = (p, board) => { const d = defOf(p, board); return !!(d && d.components.door); };
  const blocksMove = (p, board) => { const m = eff(p, board, 'move'); return !!(m && m.block); };
  function blocks(p, flag, board) {
    const d = defOf(p, board);
    if (!d || !d.kind) return false;                                    // como Muros.blocks: sólo los muros de JA-VTT tapan
    if (flag === 'move') return blocksMove(p, board);
    if (d.kind === 'portal' && !PORTAL_LOOKS[p.look in PORTAL_LOOKS ? p.look : 'door']) return false;   // portal de suelo
    const st = stateOf(p, d);
    if (flag === 'hide') return !!comp(d, st, 'hide') || comp(d, st, 'sight') === 'block';
    return comp(d, st, flag) === 'block';
  }
  function span(p, board) {
    const d = defOf(p, board);
    const s = d ? [d.shape.w, d.shape.d] : [1, 1];
    return (p.v | 0) % 2 ? [s[1], s[0]] : s;
  }
  const emitLight = (p, board) => { const e = eff(p, board, 'emitLight'); return e ? { r: e.r, h: e.h } : null; };
  const isLow = (p, board) => { const d = defOf(p, board); return !!(d && d.shape.low); };
  const gmOnly = (p, board) => !!eff(p, board, 'gmOnly');
  const surface = (p, board) => { const s = eff(p, board, 'surface'); return s ? s.height : 0; };

  /* ---- completar una pieza colocada (lectura de escenas v1 y v2; cliente y servidor igual) ---- */
  const newUid = () => { let s = 'u'; for (let i = 0; i < 8; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]; return s; };
  function complete(p, board) {
    const q = Object.assign({}, p), d = defOf(p, board);
    q.def = defIdOf(p);
    if (typeof q.uid !== 'string' || !/^u[a-z0-9]{8}$/.test(q.uid)) q.uid = newUid();
    if (d && d.states) {
      q.state = stateOf(p, d);
      if ('open' in q.state) q.open = q.state.open;                     // espejo para volver atrás (se quita en la fase 2)
      if (q.state.locked) q.locked = true; else delete q.locked;
    }
    return q;
  }

  /* ---- validar una definición del tablero (p:) ---- */
  function validateDef(o) {
    if (!plain(o) || typeof o.id !== 'string' || !/^p:[a-z0-9]{2,40}$/.test(o.id)) return null;
    if (!CLASSES.includes(o.class)) return null;
    const sh = plain(o.shape) ? o.shape : {}, int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    if (!int(sh.w, 1, 8) || !int(sh.d, 1, 8)) return null;
    const height = Number.isFinite(sh.height) && sh.height >= 0 && sh.height <= 8 ? Math.round(sh.height * 4) / 4 : 1;
    const c = plain(o.components) ? o.components : {};
    const sense = (v) => (SENSE.includes(v) ? v : 'none');
    const states = {};
    for (const [k, s] of Object.entries(plain(o.states) ? o.states : {})) {
      if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(k) || !plain(s) || !Array.isArray(s.values) || s.values.length < 2 || s.values.length > 4) return null;
      if (!s.values.every((v) => ['boolean', 'number', 'string'].includes(typeof v))) return null;
      states[k] = { values: s.values.slice(), initial: s.values.includes(s.initial) ? s.initial : s.values[0] };
    }
    if (Object.keys(states).length > 4) return null;
    const def = {
      schema: SCHEMA, id: o.id, name: String(o.name || 'Pieza').trim().slice(0, 40) || 'Pieza', class: o.class,
      ...(typeof o.template === 'string' ? { template: o.template.slice(0, 24) } : {}),
      art: { base: plain(o.art) && typeof o.art.base === 'string' ? o.art.base.slice(0, 40) : '' },
      shape: { w: sh.w, d: sh.d, height, orient: !!sh.orient, random: !!sh.random, layer: LAYERS.includes(sh.layer) ? sh.layer : 'object', low: !!sh.low },
      components: { move: { block: !!(plain(c.move) && c.move.block) }, sight: sense(c.sight), light: sense(c.light),
        ...(c.hide ? { hide: true } : {}), ...(c.gmOnly ? { gmOnly: true } : {}) },
      ...(Object.keys(states).length ? { states } : {}),
      variants: [], interactions: [], reactions: [], kind: null,
    };
    for (const v of Array.isArray(o.variants) ? o.variants.slice(0, 16) : []) {
      if (!plain(v) || !plain(v.when) || !plain(v.set)) return null;
      if (!Object.entries(v.when).every(([k, x]) => states[k] && states[k].values.includes(x))) return null;
      const set = {};
      if (plain(v.set.move)) set.move = { block: !!v.set.move.block };
      if ('sight' in v.set) set.sight = sense(v.set.sight);
      if ('light' in v.set) set.light = sense(v.set.light);
      if (typeof v.set.art === 'string') set.art = v.set.art.slice(0, 40);
      def.variants.push({ when: Object.assign({}, v.when), set });
    }
    return JSON.stringify(def).length <= 64 * 1024 ? def : null;
  }

  const Catalogo = { SCHEMA, FACTORY, TERRAIN, PORTAL_LOOKS, WALL_KINDS, defIdOf, defOf, stateOf, comp, blocks, blocksMove, wallKind,
    isDoor, span, emitLight, isLow, gmOnly, surface, complete, newUid, validateDef };
  if (typeof module === 'object' && module.exports) module.exports = Catalogo;
  else (root.Tablero3D = root.Tablero3D || {}).Catalogo = Catalogo;
})(typeof window !== 'undefined' ? window : globalThis);
