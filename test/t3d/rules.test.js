'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../modules/tablero3d/rules');
const core = require('../../server/rules');
const F = require('./helpers/fixtures');
// Tarea 4: toda pieza colocada se completa con def/uid (y state, si tiene) contra el catálogo (Catalogo.complete).
// Estos tests portados comparaban el objeto exacto de antes: se quita def/uid (uid es al azar) para seguir comparando lo mismo.
const stripMeta = (p) => { const rest = Object.assign({}, p); delete rest.def; delete rest.uid; return rest; };

test('cleanMap: acepta un mapa del cliente y descarta claves ajenas', () => {
  const m = R.cleanMap(Object.assign(F.map(8), { hack: '<script>' }));
  assert.equal(m.w, 8);
  assert.equal(m.hack, undefined);
  assert.equal(m.minis.length, 1);
  assert.deepEqual(m.start, [4, 4]);
});

test('cleanMap: rechaza tamaños, alturas y terrenos inválidos', () => {
  assert.equal(R.cleanMap(null), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { w: 3 })), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { w: 200, d: 8 })), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { h: '2'.repeat(10) })), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { h: 'z'.repeat(64) })), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { t: 'x'.repeat(64) })), null);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { wsrc: 'nope' })).wsrc, undefined);
  assert.equal(R.cleanMap(Object.assign(F.map(8), { name: '' })).name, 'Escena');
});

test('cleanMap: un campo ajeno en cada pieza (relleno) ya no infla la escena: se descarta al validar contra el catálogo (Tarea 4)', () => {
  // antes de la Tarea 4 este relleno pasaba tal cual y hacía crecer la escena hasta rechazarla (> SCENE_MAX_BYTES);
  // ahora cada pieza se valida contra su definición y sólo se guardan sus campos propios, así que la escena sigue siendo válida y pequeña
  const big = F.map(8, { props: Array.from({ length: 5000 }, () => ({ type: 'tree', x: 1, z: 1, pad: 'x'.repeat(500) })) });
  const m = R.cleanMap(big);
  assert.ok(m, 'el relleno ajeno no cuenta: la escena sigue siendo válida');
  assert.ok(m.props.every((p) => !('pad' in p)), 'el campo ajeno se descarta');
  assert.ok(R.docBytes(m) < R.SCENE_MAX_BYTES / 4, 'sin el relleno el tamaño real se queda muy por debajo del tope');
});

test('cleanProp: cada pieza guarda sólo lo suyo — un cofre pierde los campos ajenos; luz y portal conservan los suyos; level/side inválidos, fuera (ronda de arreglos 1)', () => {
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'chest', x: 1, z: 1, name: 'Cofre del tesoro', target: { scene: 'x', portal: 1 }, color: '#ff0000', open: true, level: 3, side: 'N' },
    { type: 'light', x: 2, z: 1, preset: 'torch', r: 6, h: 1, color: '#ff9c50', intensity: 1, anim: 'flicker', angle: 10, rot: 20, darkness: true, on: false, name: 'Farol', hack: 1 },
    { type: 'portal', x: 3, z: 1, id: 5, look: 'cave', target: { scene: 'b1', portal: 2 }, name: 'Cueva', color: 'no', preset: 'no' },
    { type: 'chest', x: 4, z: 1, level: 99, side: 'X' },
    { type: 'chest', x: 5, z: 1, level: 3.5, side: 'NE' },
  ] }));
  const by = (x) => m.props.find((p) => p.x === x);
  assert.deepEqual(Object.keys(by(1)).sort(), ['def', 'level', 'side', 'type', 'uid', 'v', 'x', 'z'].sort(), 'un cofre no es puerta/luz/portal: pierde name/target/color/open, conserva level/side válidos');
  assert.equal(by(1).level, 3);
  assert.equal(by(1).side, 'N');
  assert.deepEqual(Object.keys(by(2)).sort(), ['angle', 'anim', 'color', 'darkness', 'def', 'h', 'intensity', 'name', 'on', 'preset', 'r', 'rot', 'type', 'uid', 'v', 'x', 'z'].sort(), 'la luz conserva sus propios campos (y nada de `hack`)');
  assert.deepEqual(Object.keys(by(3)).sort(), ['def', 'id', 'look', 'name', 'target', 'type', 'uid', 'v', 'x', 'z'].sort(), 'el portal conserva id/look/target/name (no color/preset, que no son suyos)');
  assert.equal(by(4).level, undefined, 'level fuera de 0–15 se quita');
  assert.equal(by(4).side, undefined, 'side que no es N/E/S/W se quita');
  assert.equal(by(5).level, undefined, 'level no entero se quita');
  assert.equal(by(5).side, undefined, '"NE" no es un lado válido');
});

test('cleanCampaign: conserva escenas válidas, notas y la escena actual', () => {
  const raw = F.campaign();
  raw.boards.MAL = { name: 'x', data: F.map(8) };
  raw.boards.trota = { name: 'x', data: { w: 1 } };
  raw.notes.tpueblo.push({ x: 'no', z: 1, text: 'x' });
  const c = R.cleanCampaign(raw);
  assert.deepEqual(Object.keys(c.boards).sort(), ['tcueva', 'tpueblo']);
  assert.equal(c.notes.tpueblo.length, 1);
  assert.deepEqual(c.notes.tcueva, []);
  assert.equal(c.cur, 'tpueblo');
  assert.equal(R.cleanCampaign(Object.assign(F.campaign(), { cur: 'nada' })).cur, 'tpueblo');
  assert.equal(R.cleanCampaign({ id: 'c1', boards: {} }), null);
  assert.equal(R.cleanCampaign({ id: '../x', boards: F.campaign().boards }), null);
});

test('cleanDrawing: convierte las hojas en bytes; drawingRecord devuelve el formato del cliente', () => {
  const parsed = R.cleanDrawing(F.drawing('c_heroe1', 2));
  assert.equal(parsed.layers.length, 2);
  assert.ok(Buffer.isBuffer(parsed.layers[0].data));
  assert.equal(parsed.layers[1].visible, false);
  assert.equal(parsed.drawing.size, parsed.layers[0].data.length * 2);
  const row = { id: 'c_heroe1', key: 'c_heroe1', kind: 'char', target: 'c_heroe1', name: 'Héroe', res: 32, width: 32, height: 32, light: false, frames: 3, cols: 3, frame_names: ['a'], updated_at: 5 };
  const rec = R.drawingRecord(row, parsed.layers);
  assert.equal(rec.layers[0].sheet, F.PNG_1x1);
  assert.equal(rec.count, 3);
  assert.equal(rec.w, 32);
});

test('cleanDrawing: un personaje guarda el tamaño de su arte (T5b); los de antes y los raros son Medianos; hasta 384 de alto', () => {
  const big = Object.assign(F.drawing('c_gigante1'), { charSize: 'gargantuan', res: 64, w: 256, h: 384 });
  const parsed = R.cleanDrawing(big);
  assert.equal(parsed.drawing.charSize, 'gargantuan');
  assert.equal(parsed.drawing.height, 384, 'un colosal a 64 px por casilla: 64×96 × 4');
  assert.deepEqual(R.CHAR_SIZES, ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
  assert.equal(R.cleanDrawing(F.drawing('c_heroe1')).drawing.charSize, 'medium', 'sin tamaño: Mediano');
  assert.equal(R.cleanDrawing(Object.assign(F.drawing('c_heroe1'), { charSize: 'titánico' })).drawing.charSize, 'medium');
  assert.equal(R.cleanDrawing(Object.assign(F.drawing('g:top'), { kind: 'tile', charSize: 'large' })).drawing.charSize, null, 'sólo los personajes tienen tamaño');
  assert.equal(R.cleanDrawing(Object.assign({}, big, { h: 385 })), null);
  assert.equal(R.cleanDrawing(Object.assign({}, big, { w: 257 })), null);
  const row = { key: 'c_gigante1', kind: 'char', target: 'new', name: 'G', res: 64, width: 256, height: 384, light: false, char_size: 'gargantuan', frames: 3, cols: 3, frame_names: [], updated_at: 1 };
  assert.equal(R.drawingRecord(row, parsed.layers).charSize, 'gargantuan');
  assert.equal(R.drawingRecord(Object.assign({}, row, { char_size: null }), parsed.layers).charSize, 'medium', 'un personaje de antes de la migración 003');
  assert.equal(R.drawingRecord(Object.assign({}, row, { kind: 'tile', char_size: null }), parsed.layers).charSize, undefined);
});

test('cleanDrawing: la luz de un objeto y la opacidad y el bloqueo de las capas se sanean', () => {
  const obj = Object.assign(F.drawing('o_farol1', 2), { kind: 'obj', target: 'new', light: true, count: 20, cols: 20,
    lightSpec: { px: 99, py: -3, s: 7.4, r: 40, c: '#AABBCC', f: 0 } });
  obj.layers[0].op = 55.4; obj.layers[0].lock = true; obj.layers[1].op = 'mucho';
  const parsed = R.cleanDrawing(obj);
  assert.deepEqual(parsed.drawing.lightSpec, { px: 31, py: 0, s: 7, r: 12, c: '#aabbcc', f: 0 });
  assert.equal(parsed.layers[0].opacity, 55);
  assert.equal(parsed.layers[0].locked, true);
  assert.equal(parsed.layers[1].opacity, 100);
  assert.equal(parsed.layers[1].locked, false);
  assert.deepEqual(R.cleanDrawing(Object.assign({}, obj, { lightSpec: { c: 'rojo' } })).drawing.lightSpec, { px: 15, py: 15, s: 0, r: 6, c: '#ff9c50', f: 1 });
  assert.equal(R.cleanDrawing(Object.assign({}, obj, { lightSpec: 'x' })).drawing.lightSpec, null);
  assert.equal(R.cleanDrawing(Object.assign({}, obj, { light: false })).drawing.lightSpec, null, 'sin luz no guarda la posición');
  assert.equal(R.cleanDrawing(Object.assign({}, obj, { kind: 'char' })).drawing.lightSpec, null, 'sólo los objetos dan luz');
  const row = { key: 'o_farol1', kind: 'obj', target: 'new', name: 'Farol', res: 32, width: 32, height: 32, light: true, light_spec: parsed.drawing.lightSpec, frames: 20, cols: 20, frame_names: [], updated_at: 1 };
  const rec = R.drawingRecord(row, parsed.layers);
  assert.deepEqual(rec.lightSpec, parsed.drawing.lightSpec);
  assert.equal(rec.layers[0].op, 55);
  assert.equal(rec.layers[0].lock, true);
  assert.equal(R.drawingRecord(Object.assign({}, row, { light_spec: null }), [{ name: 'a', visible: true, mime: 'image/png', data: Buffer.from('x') }]).layers[0].op, 100, 'capas de antes de la migración 002');
});

test('cleanDrawing: rechaza tipos, tamaños y hojas que no son PNG', () => {
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { kind: 'otro' })), null);
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { key: '../x' })), null);
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { key: 'g:top', kind: 'tile' })).drawing.key, 'g:top');
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { w: 999 })), null);
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { layers: [] })), null);
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { layers: [{ sheet: 'data:image/gif;base64,AAAA' }] })), null);
  assert.equal(R.cleanDrawing(Object.assign(F.drawing(), { layers: Array(9).fill({ sheet: F.PNG_1x1 }) })), null);
});

test('cleanLiveDoc: cada documento de la mesa se sanea con su forma', () => {
  assert.equal(R.cleanLiveDoc('otra', {}), null);
  assert.deepEqual(R.cleanLiveDoc('board', { open: 1, rev: 3 }), { open: true, rev: 3 });
  assert.equal(R.cleanLiveDoc('board', { open: true, board: { w: 1 } }), null);
  assert.equal(R.cleanLiveDoc('board', { open: true, rev: 1, board: F.map(8) }).board.w, 8);
  const tk = R.cleanLiveDoc('tokens', { tokens: { k1: F.token(7), 'MAL ID': F.token(7), k2: { kind: 'x' } } });
  assert.deepEqual(Object.keys(tk.tokens), ['k1']);
  assert.equal(tk.tokens.k1.owner, '7');
  assert.deepEqual(tk.tokens.k1.sheet.hp, { cur: 10, max: 12, temp: 0 });
  const lit = R.cleanTokens({ t1: F.token(1, { sheet: { dark: 30, luz: 99 } }) }).t1.sheet;
  assert.deepEqual([lit.darkvision, lit.light.bright + lit.light.dim], [120, 60], 'visión en la oscuridad y luz que lleva de antes, acotadas (24 y 12 casillas)');
  assert.deepEqual(R.cleanLiveDoc('doors', { d: { '3_4': true, 'x': 1 } }), { d: { '3_4': 1 } });
  // el combate de antes (order) pasa a la iniciativa de JA-VTT: una entrada por ficha, con su nombre si se sabe
  const cb = R.cleanLiveDoc('combat', { active: true, order: [{ id: 'k1', roll: 12, total: 14, init: 2 }, { id: 'MAL' }], turn: 0, round: 2, left: 6 }, { k1: { sheet: { name: 'Aria' } } });
  assert.deepEqual(cb, { initiative: { entries: [{ id: 1, name: 'Aria', value: 14, tokenId: 'k1', roll: 12, init: 2 }], turn: 0, round: 2 }, left: 6, dashed: false });
  assert.deepEqual(R.cleanLiveDoc('combat', { active: true, order: [] }).initiative.entries, []);
  assert.deepEqual(R.cleanLiveDoc('combat', { active: false, order: [{ id: 'k1', total: 3 }], round: 4 }).initiative, { entries: [], turn: 0, round: 4 }, 'sin combate activo, sin entradas');
  assert.equal(R.cleanLiveDoc('combat', { order: [{ id: 'k1', total: 3 }], active: true }).initiative.entries[0].name, 'Sin nombre');
  assert.deepEqual(R.cleanLiveDoc('plans', { plans: { 3: { shape: 'circle', a: { x: 1, z: 1 }, b: { x: 3, z: 1 }, owner: '7' }, 4: { shape: 'cone', a: { x: 1, z: 1 }, b: { x: 3, z: 1 } }, x: {} } }),
    { plans: { 3: { id: 3, shape: 'circle', a: { x: 1, z: 1 }, b: { x: 3, z: 1 }, owner: '7', color: '#8ec5e8' } } }, 'en la mesa sólo los planos con dueño');
});

test('liveChange: el director puede todo; el jugador sólo mueve lo suyo y abre puertas', () => {
  const gm = { role: 'gm', user_id: 1 };
  const pl = { role: 'player', user_id: 2 };
  const tokens = { tokens: { k1: R.cleanTokens({ k1: F.token(2) }).k1, g1: R.cleanTokens({ g1: F.token(null, { kind: 'goblin' }) }).g1 } };
  assert.ok(R.liveChange(gm, 'board', 'set', { open: true, rev: 1, board: F.map(8) }, null).doc);
  assert.equal(R.liveChange(gm, 'board', 'delete', null, null).doc, null);
  assert.match(R.liveChange(pl, 'board', 'set', { open: true }, null).error, /director/);
  assert.match(R.liveChange(pl, 'board', 'delete', null, null).error, /director/);
  assert.match(R.liveChange(pl, 'combat', 'set', { active: false }, null).error, /director/);
  assert.match(R.liveChange(gm, 'nada', 'set', {}, null).error, /no válida/);
  assert.match(R.liveChange(gm, 'tokens', 'update', {}, null).error, /no existe/);
  assert.match(R.liveChange(gm, 'board', 'set', { board: { w: 1 } }, null).error, /no válidos/);
  // mover su personaje
  const moved = R.liveChange(pl, 'tokens', 'update', { tokens: { k1: F.token(2, { x: 5 }) } }, tokens);
  assert.equal(moved.doc.tokens.k1.x, 5);
  assert.equal(moved.doc.tokens.g1.kind, 'goblin', 'update mezcla, no reemplaza');
  // no puede mover el del director, regalarse fichas ni crear otras
  assert.match(R.liveChange(pl, 'tokens', 'update', { tokens: { g1: F.token(null, { kind: 'goblin', x: 9 }) } }, tokens).error, /propios/);
  assert.match(R.liveChange(pl, 'tokens', 'update', { tokens: { g1: F.token(2, { kind: 'goblin' }) } }, tokens).error, /propios/);
  assert.match(R.liveChange(pl, 'tokens', 'update', { tokens: { k9: F.token(2) } }, tokens).error, /propios/);
  assert.match(R.liveChange(pl, 'tokens', 'update', { tokens: { k1: F.token(3) } }, tokens).error, /propios/);
  assert.match(R.liveChange(pl, 'tokens', 'set', { tokens: {} }, tokens).error, /director/);
  // puertas: las de la escena de la mesa
  const board = { open: true, rev: 1, board: R.cleanMap(F.map(8, { props: [{ type: 'door', x: 1, z: 1, v: 0, open: false }] })) };
  assert.deepEqual(R.liveChange(pl, 'doors', 'update', { d: { '1_1': 1 } }, { d: {} }, { board }).doc, { d: { '1_1': 1 } });
});

test('merge: mezcla objetos anidados y sustituye listas', () => {
  assert.deepEqual(R.merge({ a: { b: 1, c: 2 }, l: [1] }, { a: { c: 3 }, l: [2] }), { a: { b: 1, c: 3 }, l: [2] });
});

test('núcleo: server/rules.js sólo tiene reglas del núcleo; las del 3D viven en el módulo', () => {
  assert.equal(core.str('abcdef', 3), 'abc');
  assert.equal(core.str(5, 3), '');
  // JA-VTT: su server/rules.js es el motor 2D completo (muchas más claves que el host mínimo de 3d-tablero,
  // que sólo tenía `str`); lo que importa es que ninguna regla del 3D vive ahí, no que la lista sea sólo ['str'].
  for (const k of ['cleanMap', 'cleanCampaign', 'cleanDrawing', 'drawingRecord', 'cleanLiveDoc', 'cleanTokens', 'liveChange', 'LIVE_KEYS']) {
    assert.ok(R[k], k);
    assert.equal(core[k], undefined, `core no debe tener ${k}`);
  }
});

test('cleanMap: las luces sueltas guardan los campos de JA-VTT saneados y las de antes se traducen', () => {
  const old = { type: 'light', x: 2, z: 3, v: 0, open: false, r: 5, h: 1.25, c: '#FF9C50', f: 0, hack: 1 };
  const bad = { type: 'light', x: 4, z: 4, v: 0, preset: 'laser', r: 99, h: 9, color: 'rojo', intensity: 5, anim: 'wobble', angle: 0, rot: 99999, darkness: 'sí', on: false, name: 'x'.repeat(60) };
  const cone = { type: 'light', x: 1, z: 1, preset: 'bullseye', r: 24, h: 1.25, color: '#FFE6B8', intensity: 1, anim: 'none', angle: 60, rot: 90, darkness: false, on: true, name: ' Linterna ' };
  const tree = { type: 'tree', x: 1, z: 1, v: 2 };
  const m = R.cleanMap(F.map(8, { props: [old, bad, cone, tree] }));
  for (const p of m.props) assert.match(p.uid, /^u[a-z0-9]{8}$/);
  assert.deepEqual(stripMeta(m.props[0]), { type: 'light', x: 2, z: 3, v: 0, preset: 'custom', r: 5, h: 1.25, color: '#ff9c50', intensity: 1, anim: 'none', angle: 360, rot: 0, darkness: false, on: true });
  assert.deepEqual(stripMeta(m.props[1]), { type: 'light', x: 4, z: 4, v: 0, preset: 'custom', r: 24, h: 4, color: '#ff9c50', intensity: 1.2, anim: 'flicker', angle: 1, rot: 3600, darkness: true, on: false, name: 'x'.repeat(40) });
  assert.deepEqual(stripMeta(m.props[2]), { type: 'light', x: 1, z: 1, v: 0, preset: 'bullseye', r: 24, h: 1.25, color: '#ffe6b8', intensity: 1, anim: 'none', angle: 60, rot: 90, darkness: false, on: true, name: 'Linterna' });
  assert.deepEqual(stripMeta(m.props[3]), tree, 'los demás objetos no cambian');
  assert.equal(R.cleanLightProp({ type: 'light', x: 0, z: 0, f: 1 }).anim, 'flicker', 'f: 1 era una llama');
});

test('cleanTokens: la luz que lleva es el objeto light de JA-VTT; la de antes (tipo o casillas) se traduce', () => {
  const light = (sheet) => R.cleanTokens({ t1: F.token(1, { sheet }) }).t1.sheet.light;
  const none = { preset: 'none', on: false, bright: 0, dim: 0, color: '#ffffff', intensity: 1, anim: 'none', angle: 360, rot: 0 };
  assert.deepEqual(light({ luz: 'bullseye' }), { preset: 'bullseye', on: true, bright: 60, dim: 60, color: '#ffe6b8', intensity: 1, anim: 'none', angle: 60, rot: 0 });
  assert.equal(light({ luz: 'crystal' }).anim, 'pulse');
  assert.deepEqual(light({ luz: 'campfire' }), none, 'una hoguera no se lleva en la mano');
  assert.deepEqual(light({ luz: 'none' }), none);
  assert.deepEqual(light({ luz: 6 }), { preset: 'custom', on: true, bright: 15, dim: 15, color: '#ff9c50', intensity: 0.9, anim: 'flicker', angle: 360, rot: 0 }, '6 casillas de luz cálida');
  assert.deepEqual(light({ luz: -3 }), none);
  assert.deepEqual(light({ light: { preset: 'laser', on: 1, bright: 900, dim: -4, color: 'rojo', intensity: 7, anim: 'x', angle: 0, rot: 1e9 } }),
    { preset: 'custom', on: true, bright: 300, dim: 0, color: '#ffffff', intensity: 1.2, anim: 'none', angle: 1, rot: 3600 });
  assert.equal(light({ light: { preset: 'torch', on: true, color: '#FFA652' } }).color, '#ffa652');
  assert.equal(light({ name: 'x' }), undefined, 'sin luz ni luz de antes, no se inventa');
});

test('cleanSheet: una ficha de antes (team, hp/hpMax, vision y dark en casillas) pasa a los campos de JA-VTT', () => {
  const old = { name: 'Caballero', hp: 10, hpMax: 12, ac: 16, speed: 30, init: 2, team: 'pc', vision: 12, dark: 2, luz: 'torch', hack: 1 };
  const s = R.cleanSheet(old);
  assert.deepEqual(Object.keys(s).sort(), ['ac', 'conditions', 'darkvision', 'elevation', 'hidden', 'hp', 'init', 'kind', 'light', 'name', 'sight', 'size', 'speed', 'vision']);
  assert.deepEqual([s.kind, s.hp, s.sight, s.darkvision, s.vision, s.size, s.hidden, s.elevation], ['player', { cur: 10, max: 12, temp: 0 }, 60, 10, true, 1, false, 0]);
  assert.equal(s.light.preset, 'torch');
  assert.deepEqual([R.cleanSheet({ team: 'enemy' }).kind, R.cleanSheet({ team: 'enemy' }).neutral], ['enemy', undefined]);
  assert.deepEqual([R.cleanSheet({ team: 'npc' }).kind, R.cleanSheet({ team: 'npc' }).neutral], ['enemy', true], 'el neutral de antes es un enemigo neutral');
  assert.equal(R.cleanSheet({ team: 'otro' }).kind, undefined, 'sin bando conocido lo pone el cliente');
  assert.deepEqual(R.cleanSheet(old), R.cleanSheet(R.cleanSheet(old)), 'sanear dos veces da lo mismo');
  assert.deepEqual(R.cleanSheet('x'), {});
});

test('cleanSheet: tamaños 1–4 de JA-VTT, Diminuto y Pequeño son 1 casilla; estados, vida, CA y altura acotados', () => {
  const sz = (o) => { const s = R.cleanSheet(o); return [s.size, !!s.tiny, !!s.small]; };
  assert.deepEqual(sz({ size: 2 }), [2, false, false]);
  assert.deepEqual(sz({ size: 4, tiny: true }), [4, false, false], 'sólo una ficha de 1 casilla es diminuta');
  assert.deepEqual(sz({ size: 0.5 }), [1, true, false], 'medio (de otra mesa) = diminuto');
  assert.deepEqual(sz({ size: 1, tiny: true, small: true }), [1, true, false]);
  assert.deepEqual(sz({ size: 1, small: true }), [1, false, true]);
  assert.deepEqual(sz({ size: 7 }), [1, false, false]);
  const s = R.cleanSheet({ kind: 'enemy', neutral: true, conditions: ['prone', 'prone', 'bored', 'dead'], hp: { cur: 50, max: 20, temp: -3 }, ac: 140, elevation: 12.4, color: '#D9705F', sight: -5, darkvision: 900, vision: false, hidden: 1 });
  assert.deepEqual(s.conditions, ['prone', 'dead'], 'ids de JA-VTT sin repetir');
  assert.deepEqual(s.hp, { cur: 20, max: 20, temp: 0 });
  assert.deepEqual([s.ac, s.elevation, s.color, s.sight, s.darkvision, s.vision, s.hidden, s.neutral], [99, 12, '#d9705f', 0, 300, false, true, true]);
  assert.equal(R.cleanSheet({ kind: 'player', neutral: true }).neutral, undefined, 'un personaje jugador no es neutral');
  assert.deepEqual(R.cleanSheet({ hp: { max: 8 } }).hp, { cur: 8, max: 8, temp: 0 });
});

test('cleanMap: las fichas de los personajes de una escena se sanean igual', () => {
  const m = R.cleanMap(F.map(8, { minis: [{ kind: 'knight', x: 1, z: 1, fx: 0, fz: 1, id: 'k1', sheet: { name: 'Aria', team: 'pc', hp: 5, hpMax: 9, vision: 12, dark: 0, luz: 0 } }, { kind: 'goblin', x: 2, z: 2 }] }));
  assert.deepEqual([m.minis[0].sheet.kind, m.minis[0].sheet.hp.cur, m.minis[0].sheet.light.preset, m.minis[0].id], ['player', 5, 'none', 'k1']);
  assert.equal(m.minis[1].sheet, undefined, 'sin ficha: el cliente pone la del sprite');
});

test('liveChange: el jugador cambia vida, estados, luz y altura de su ficha, pero no bando, tamaño, visión ni visibilidad', () => {
  const pl = { role: 'player', user_id: 2 };
  const tokens = { tokens: R.cleanTokens({ k1: F.token(2), g1: F.token(null, { kind: 'goblin' }) }) };
  const mine = (sheet) => ({ tokens: { k1: Object.assign(F.token(2), { sheet: Object.assign({}, tokens.tokens.k1.sheet, sheet) }) } });
  assert.deepEqual(R.liveChange(pl, 'tokens', 'update', mine({ hp: { cur: 3, max: 12, temp: 4 }, conditions: ['prone'], elevation: 10, light: { preset: 'torch', on: true } }), tokens).doc.tokens.k1.sheet.hp, { cur: 3, max: 12, temp: 4 });
  for (const change of [{ size: 2 }, { hidden: true }, { kind: 'enemy' }, { darkvision: 60 }, { sight: 5 }, { vision: false }, { size: 1, tiny: true }]) {
    assert.match(R.liveChange(pl, 'tokens', 'update', mine(change), tokens).error || '', /director/, JSON.stringify(change));
  }
  assert.ok(R.liveChange({ role: 'gm', user_id: 1 }, 'tokens', 'update', mine({ size: 3, hidden: true }), tokens).doc, 'el director sí');
  // una mesa guardada con fichas de antes: moverse no cuenta como cambiar las fichas de los demás
  const legacy = { tokens: { k1: F.token(2), g1: F.token(null, { kind: 'goblin' }) } };
  assert.equal(R.liveChange(pl, 'tokens', 'update', { tokens: { k1: F.token(2, { x: 6 }) } }, legacy).doc.tokens.k1.x, 6);
});

test('cleanDrawing: la luz de un objeto puede tomar un tipo sin cono ni oscuridad', () => {
  const obj = (preset) => R.cleanDrawing(Object.assign(F.drawing('o_farol1', 1), { kind: 'obj', target: 'new', light: true, count: 20, cols: 20, lightSpec: { px: 3, py: 3, s: 2, r: 6, c: '#ffd28f', f: 1, preset } })).drawing.lightSpec.preset;
  assert.equal(obj('lantern'), 'lantern');
  assert.equal(obj('crystal'), 'crystal');
  for (const p of ['darkness', 'bullseye', 'window', 'custom', 'laser', undefined]) assert.equal(obj(p), undefined, String(p));
});

test('cleanMap: techos con material, forma y giro; los de antes son de teja a dos aguas y los que no caben se descartan', () => {
  const m = R.cleanMap(F.map(8, { roofs: [
    { x: 1, z: 1, w: 3, d: 2 },
    { x: 0, z: 4, w: 4, d: 3, mat: 'slate', shape: 'hip', rot: 1, hack: 1 },
    { x: 4, z: 0, w: 2, d: 2, mat: 'oro', shape: 'cúpula', rot: 7 },
    { x: 6, z: 6, w: 3, d: 2 },
    { x: 1, z: 1, w: 1, d: 3 },
    { x: 1.5, z: 1, w: 2, d: 2 },
    'techo',
  ] }));
  assert.deepEqual(m.roofs, [
    { x: 1, z: 1, w: 3, d: 2, mat: 'tile', shape: 'gable' },
    { x: 0, z: 4, w: 4, d: 3, mat: 'slate', shape: 'hip', rot: 1 },
    { x: 4, z: 0, w: 2, d: 2, mat: 'tile', shape: 'gable' },
  ]);
  assert.deepEqual(R.ROOF_MATS, ['tile', 'slate', 'thatch', 'shingle', 'copper']);
  assert.deepEqual(R.ROOF_SHAPES, ['gable', 'hip', 'flat', 'cone', 'shed']);
  for (const shape of R.ROOF_SHAPES) for (const mat of R.ROOF_MATS) assert.deepEqual(R.cleanRoof({ x: 0, z: 0, w: 2, d: 2, mat, shape, rot: 3 }, 8, 8), { x: 0, z: 0, w: 2, d: 2, mat, shape, rot: 3 });
});

/* ---- T6b: muros de JA-VTT por casilla, puertas con llave, portales ---- */
const withProps = (props, extra = {}) => R.cleanMap(F.map(8, Object.assign({ props, minis: [] }, extra)));

test('muros: los objetos de muro se sanean (puerta con llave, ventana, velo, maleza, barrera) y lo ajeno se descarta', () => {
  const m = withProps([
    { type: 'door', x: 1, z: 1, v: 1, open: 1, locked: true, hack: 1 }, { type: 'gate', x: 2, z: 1, v: 9, locked: 'sí' },
    { type: 'window', x: 3, z: 1, v: 1, open: true, locked: true }, { type: 'veil', x: 4, z: 1 }, { type: 'cover', x: 5, z: 1, v: 2 },
    { type: 'barrier', x: 6, z: 1, v: 3 }, { type: 'window', x: 1.5, z: 1 }, { type: 'veil', x: -1, z: 1 }, { type: 'tree', x: 1, z: 2, v: 0, open: false, extra: 1 },
  ]);
  assert.deepEqual(m.props.map(stripMeta), [
    { type: 'door', x: 1, z: 1, v: 1, open: true, locked: true, state: { open: true, locked: true } },
    { type: 'gate', x: 2, z: 1, v: 0, open: false, state: { open: false, locked: false } },
    { type: 'window', x: 3, z: 1, v: 1 }, { type: 'veil', x: 4, z: 1, v: 0 }, { type: 'cover', x: 5, z: 1, v: 2 }, { type: 'barrier', x: 6, z: 1, v: 3 },
    { type: 'tree', x: 1, z: 2, v: 0 },
  ], 'una casilla que no es entera se descarta; los demás objetos pasan como antes (Tarea 4: def/uid/state completos; ' +
    'un campo ajeno como `extra` ya no se guarda sin validar; ronda de arreglos 1: un `open` que no es de una puerta tampoco)');
  assert.deepEqual(R.WALL_KINDS, ['wall', 'door', 'window', 'veil', 'cover', 'barrier', 'portal']);
});

test('portales: id único, aspecto, nombre y destino { scene, portal } saneados, como JA-VTT', () => {
  const m = withProps([
    { type: 'portal', x: 1, z: 1, id: 4, look: 'magic', name: '  Arco  ', target: { scene: 'b1', portal: 2 } },
    { type: 'portal', x: 2, z: 1, id: 4, look: 'portal-de-oro', target: { scene: '../x', portal: 1 } },
    { type: 'portal', x: 3, z: 1, target: { scene: 'b2', portal: 'uno' }, open: true },
    { type: 'portal', x: 4, z: 1, id: 2.5, name: 'x'.repeat(50), target: 'b3' },
  ]);
  assert.deepEqual(m.props.map((p) => p.id), [4, 5, 6, 7], 'repetidos y ausentes toman el siguiente libre');
  assert.deepEqual(stripMeta(m.props[0]), { type: 'portal', x: 1, z: 1, v: 0, id: 4, look: 'magic', target: { scene: 'b1', portal: 2 }, name: 'Arco' });
  assert.deepEqual([m.props[1].look, m.props[1].target], ['door', null]);
  assert.deepEqual(m.props[2].target, { scene: 'b2', portal: null });
  assert.equal(m.props[2].open, undefined, 'un portal no se abre');
  assert.equal(m.props[3].name.length, 40);
  assert.equal(m.props[3].target, null);
});

test('portales: las escaleras de campaña de antes pasan a portales con aspecto de escalera y encuentran su vuelta', () => {
  const c = R.cleanCampaign(F.campaign());
  const a = R.cleanMap(F.map(8, { props: [{ type: 'stairs', x: 2, z: 3, v: 0, open: false, to: 'tcueva', tx: 5, tz: 6 }, { type: 'stairs', x: 4, z: 4, v: 0 }] }));
  const b = R.cleanMap(F.map(16, { props: [{ type: 'stairs', x: 5, z: 6, v: 0, open: false, to: 'tpueblo', tx: 2, tz: 3 }] }));
  assert.deepEqual(stripMeta(a.props[0]), { type: 'portal', x: 2, z: 3, v: 0, id: R.stairsId(2, 3), look: 'stairs', target: { scene: 'tcueva', portal: R.stairsId(5, 6) } });
  assert.equal(b.props[0].id, a.props[0].target.portal, 'la ida lleva al id de la vuelta');
  assert.equal(b.props[0].target.portal, a.props[0].id);
  assert.deepEqual(stripMeta(a.props[1]), { type: 'stairs', x: 4, z: 4, v: 0 }, 'una escalera sin destino sigue siendo un objeto');
  assert.equal(R.cleanMap(F.map(8, { props: [{ type: 'stairs', x: 1, z: 1, to: 'MAL/X' }] })).props.length, 0);
  assert.equal(R.cleanMap(F.map(8, { props: [{ type: 'stairs', x: 1, z: 1, to: 'tcueva' }] })).props[0].target.portal, null);
  assert.ok(c.boards.tpueblo.data.props.every((p) => p.type !== 'stairs' || !p.to), 'también dentro de las campañas');
});

test('puertas: el jugador no abre una puerta con llave, ni ninguna si el tablero no lo deja (playersDoors), ni lo que no es puerta', () => {
  const pl = { role: 'player', user_id: 2 }, gm = { role: 'gm', user_id: 1 };
  const board = { open: true, rev: 1, board: withProps([{ type: 'door', x: 1, z: 1, v: 0 }, { type: 'door', x: 2, z: 2, v: 0, locked: true }, { type: 'gate', x: 3, z: 3, v: 0 }]) };
  const cur = { d: { '3_3': 1 } };
  const open = (who, d, settings) => R.liveChange(who, 'doors', 'update', { d }, cur, { board, settings });
  assert.deepEqual(open(pl, { '1_1': 1 }).doc.d, { '1_1': 1, '3_3': 1 }, 'por defecto, como JA-VTT, los jugadores abren');
  assert.deepEqual(open(pl, { '3_3': 0 }).doc.d, { '3_3': 0 }, 'y cierran; la puerta de la muralla también es una puerta');
  assert.match(open(pl, { '2_2': 1 }).error, /llave/);
  assert.match(open(pl, { '1_1': 1 }, { playersDoors: false }).error, /no deja/);
  assert.match(open(pl, { '5_5': 1 }).error, /ninguna puerta/);
  assert.match(R.liveChange(pl, 'doors', 'update', { d: { '1_1': 1 } }, cur, {}).error, /ninguna puerta/, 'sin mesa abierta no hay puertas');
  assert.ok(open(pl, { '3_3': 1 }).doc, 'lo que no cambia no cuenta');
  assert.ok(open(gm, { '2_2': 1 }, { playersDoors: false }).doc, 'el director abre cualquiera');
  assert.match(R.liveChange(pl, 'doors', 'set', { d: {} }, cur, { board }).error, /director/);
});

test('ajustes del tablero: los de JA-VTT con sus valores por defecto; sólo booleanos y hpVisibility válido, sobre los guardados', () => {
  const D = R.DEFAULT_SETTINGS;
  assert.deepEqual(R.cleanSettings(null), D);
  assert.deepEqual(R.cleanSettings({ playersDoors: false, otro: 1 }), Object.assign({}, D, { playersDoors: false }));
  assert.deepEqual(R.cleanSettings({ playersDoors: 'no' }, { playersDoors: false }), Object.assign({}, D, { playersDoors: false }));
  assert.deepEqual(R.cleanSettings({ hpVisibility: 'bar_only', initiativeShown: true, acEnabled: 0 }, { hpVisibility: 'gm', acEnabled: false }),
    Object.assign({}, D, { hpVisibility: 'bar_only', initiativeShown: true, acEnabled: false }));
  assert.equal(R.cleanSettings({ hpVisibility: 'todos' }, { hpVisibility: 'gm' }).hpVisibility, 'gm');
  assert.equal(R.cleanSettings({ initiative: { entries: [] } }).initiative, undefined, 'la iniciativa vive en live/combat');
});

/* escena con una casa de muros ('w') y un portal en el muro norte: la llegada es por dentro, del lado por el que se anda */
function house(extra = {}) {
  const w = 8, t = [...'g'.repeat(64)];
  for (let x = 1; x <= 6; x++) { t[1 * w + x] = 'w'; t[6 * w + x] = 'w'; }
  for (let z = 1; z <= 6; z++) { t[z * w + 1] = 'w'; t[z * w + 6] = 'w'; }
  t[1 * w + 3] = 'g';
  return R.cleanMap(F.map(8, Object.assign({ t: t.join(''), start: [3, 4], minis: [], props: [{ type: 'portal', x: 3, z: 1, id: 1, look: 'door' }] }, extra)));
}

test('llegada: junto al portal de destino, del lado por el que se anda, una casilla libre por ficha y del tamaño de cada una', () => {
  const m = house();
  const g = R.gridOf(m);
  assert.equal(g.open(1 * 8 + 3), false, 'el portal no se pisa');
  assert.deepEqual(R.arrival(g, 3, 1, [1, 1, 1], m.start), [[3, 2], [4, 2], [2, 2]], 'dentro de la casa (hacia el punto de entrada), al lado del portal');
  assert.deepEqual(R.arrival(g, 3, 1, [1], [3, 0])[0], [3, 0], 'si la entrada está fuera, por fuera');
  assert.deepEqual(R.arrival(g, 3, 1, [2], m.start)[0], [3, 2], 'una ficha grande necesita 2×2 casillas libres');
  assert.deepEqual(R.arrival(g, 3, 1, [4, 4], m.start), [[2, 2], null], 'la casa entera para una Colosal; otra ya no cabe y no llega');
  const busy = house({ minis: [{ kind: 'knight', x: 3, z: 2, sheet: {} }], props: [{ type: 'portal', x: 3, z: 1, id: 1 }, { type: 'barrel', x: 2, z: 2 }, { type: 'veil', x: 4, z: 2 }] });
  assert.deepEqual(R.arrival(R.gridOf(busy), 3, 1, [1, 1], busy.start), [[4, 2], [5, 2]], 'no encima de otras fichas ni de objetos; un velo se pisa');
});

test('viaje: las fichas cruzan a la otra escena junto a su portal; las que no caben se quedan; reunir lleva al grupo', () => {
  const src = R.cleanMap(F.map(8, { minis: [
    { kind: 'knight', x: 1, z: 1, id: 'k1', owner: '7', sheet: { kind: 'player' } },
    { kind: 'mage', x: 2, z: 1, id: 'k2', sheet: { kind: 'player' } },
    { kind: 'goblin', x: 5, z: 5, id: 'g1', sheet: { kind: 'enemy' } }] }));
  const dst = house();
  const one = R.travelPlan(src, dst, { portal: 1, ids: ['k1'] });
  assert.deepEqual(one.moved, ['k1']);
  assert.deepEqual(one.src.minis.map((q) => q.id), ['k2', 'g1'], 'el viajero deja la escena de origen');
  const k1 = one.dst.minis.find((q) => q.id === 'k1');
  assert.deepEqual([k1.x, k1.z, k1.owner], [3, 2, '7'], 'llega junto al portal y sigue siendo de su dueño');
  assert.deepEqual(one.dst.start, [3, 2], 'la cámara llega con él');
  assert.equal(src.minis.length, 3, 'no toca las escenas que recibe');
  const all = R.travelPlan(src, dst, { portal: null, players: true });
  assert.deepEqual(all.moved, ['k1', 'k2'], 'reunir al grupo: todas las fichas del bando Jugador');
  assert.deepEqual(all.dst.minis.map((q) => [q.x, q.z]), [[3, 4], [4, 4]], 'sin portal, junto al punto de entrada');
  const tiny = R.cleanMap(F.map(4, { t: 'wwwwwggwwwwwwwww', minis: [], props: [] }));
  const cramped = R.travelPlan(src, tiny, { portal: 9, players: true });
  assert.deepEqual([cramped.moved, cramped.left], [['k1', 'k2'], []]);
  const full = R.travelPlan(src, R.cleanMap(F.map(4, { t: 'wwwwwgwwwwwwwwww', minis: [], props: [] })), { players: true });
  assert.deepEqual([full.moved, full.left, full.src.minis.length], [['k1'], ['k2'], 2], 'la que no cabe se queda en su escena');
  const same = R.travelPlan(src, src, { players: true });
  assert.deepEqual(same.src.minis.map((q) => q.id).sort(), ['g1', 'k1', 'k2'], 'reunir en la misma escena mueve sin duplicar');
  assert.equal(same.src, same.dst);
});

test('viaje: junto al portal, fichas de la mesa ↔ personajes de la escena y portales sin destino al borrar la escena', () => {
  assert.equal(R.nearPortal({ x: 2, z: 2, sheet: {} }, { x: 3, z: 3 }), true);
  assert.equal(R.nearPortal({ x: 1, z: 2, sheet: {} }, { x: 3, z: 3 }), false);
  assert.equal(R.nearPortal({ x: 0, z: 0, sheet: { size: 2 } }, { x: 2, z: 2 }), true, 'de borde a borde, con su tamaño');
  const minis = R.tokensToMinis({ k1: F.token(7), 'MAL ID': F.token(7) });
  assert.deepEqual(minis.map((q) => [q.id, q.owner, q.x]), [['k1', '7', 3]]);
  let n = 0;
  const back = R.minisToTokens([...minis, { kind: 'goblin', x: 1, z: 1, sheet: {} }, { kind: 'goblin', x: 1, z: 2, id: 'k1' }, { kind: '../', x: 1, z: 1 }], () => 'n' + ++n);
  assert.deepEqual(Object.keys(back), ['k1', 'n1', 'n2'], 'sin id o con id repetido reciben uno nuevo; lo que no es válido se descarta');
  assert.equal(back.k1.owner, '7');
  const m = withProps([{ type: 'portal', x: 1, z: 1, id: 1, target: { scene: 'b1', portal: 1 } }, { type: 'portal', x: 2, z: 1, id: 2, target: { scene: 'b2', portal: null } }]);
  assert.equal(R.clearPortalsTo(m, 'b1'), true);
  assert.deepEqual(m.props.map((p) => p.target), [null, { scene: 'b2', portal: null }]);
  assert.equal(R.clearPortalsTo(m, 'b1'), false);
  assert.equal(R.portalIn(m, 2).x, 2);
  assert.equal(R.portalIn(m, 9), null);
});

/* ---- ambiente e interiores (T6c) ---- */
test('cleanMap: el ambiente de la escena con los campos de JA-VTT (env, ambient, darkColor); las de antes (night) pasan a noche o día', () => {
  const m = R.cleanMap(F.map(8, { env: 'dusk', ambient: 0.4, darkColor: '#1a1220' }));
  assert.deepEqual([m.env, m.ambient, m.darkColor], ['dusk', 0.4, '#1A1220']);
  assert.equal(m.night, undefined, 'ya no se guarda night');
  const old = F.map(8); delete old.env; delete old.ambient; delete old.darkColor;
  assert.deepEqual(R.cleanEnv(R.cleanMap(Object.assign({}, old, { night: true }))), { env: 'night', ambient: 0.18, darkColor: '#081026' });
  const day = R.cleanMap(Object.assign({}, old, { night: false }));
  assert.deepEqual([day.env, day.ambient, day.darkColor], ['day', 1, '#0E1316']);
  // lo que no vale toma lo del momento: ambient fuera de 0–1 se recorta, un color que no es #rrggbb o un momento desconocido no pasan
  const bad = R.cleanMap(F.map(8, { env: 'eclipse', night: true, ambient: 3, darkColor: 'javascript:' }));
  assert.deepEqual([bad.env, bad.ambient, bad.darkColor], ['night', 1, '#081026']);
  assert.deepEqual(R.cleanEnv({ env: 'interior', ambient: -1 }), { env: 'interior', ambient: 0, darkColor: '#0B0E11' });
  assert.deepEqual(R.cleanEnv({ env: 'interior', ambient: '0.5' }).ambient, 0);
});

test('cleanMap: las zonas interiores pintadas (zoneCells, una letra por casilla) se guardan si valen; sin ellas, nada', () => {
  const n = 64, zc = '0'.repeat(10) + '11' + '0'.repeat(20) + '2' + '0'.repeat(n - 33);
  assert.equal(R.cleanMap(F.map(8, { zoneCells: zc })).zoneCells, zc);
  assert.equal(R.cleanMap(F.map(8)).zoneCells, undefined, 'una escena de antes no tiene zonas pintadas');
  assert.equal(R.cleanMap(F.map(8, { zoneCells: '0'.repeat(n) })).zoneCells, undefined, 'si no pinta nada, no se guarda');
  assert.equal(R.cleanMap(F.map(8, { zoneCells: '1'.repeat(n - 1) })).zoneCells, undefined, 'otro tamaño que el mapa');
  assert.equal(R.cleanMap(F.map(8, { zoneCells: '3'.repeat(n) })).zoneCells, undefined);
  assert.equal(R.cleanMap(F.map(8, { zoneCells: ['1'] })).zoneCells, undefined);
  // la mesa en vivo reparte la escena del director con su ambiente y sus zonas
  const doc = R.cleanLiveDoc('board', { open: true, rev: 2, board: F.map(8, { env: 'night', ambient: 0.3, zoneCells: zc }) });
  assert.deepEqual([doc.board.env, doc.board.ambient, doc.board.zoneCells], ['night', 0.3, zc]);
});

/* ---- Tarea 5, R12(a): una puerta `p:` sin estados no debe guardar open/locked en crudo ---- */
// una puerta del tablero (sin `states`: el autor de la definición no los declaró); no pasa por cleanWallProp
// (que sólo conoce los tipos de fábrica), así que cleanProp tiene que coaccionar open/locked por su cuenta.
const puertaSinEstados = { schema: 1, id: 'p:puerta1', name: 'Puerta', class: 'wall', art: { base: 'y' },
  shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'wall', low: false },
  components: { move: { block: true }, sight: 'block', light: 'block', door: {} }, variants: [], interactions: [], reactions: [] };

test('cleanProp: una puerta `p:` sin estados coacciona open/locked igual que cleanWallProp (R12a)', () => {
  const board = new Map([[puertaSinEstados.id, puertaSinEstados]]);
  const m = R.cleanMap(F.map(8, { props: [{ type: 'y', def: 'p:puerta1', x: 1, z: 1, open: 1, locked: 'no' }] }), board);
  const p = m.props[0];
  assert.equal(p.open, true, 'open se coacciona a booleano (antes: el 1 crudo)');
  assert.equal(p.locked, undefined, '"no" es verdadero en JS: sin coacción quedaría cerrada con llave');
});

/* ---- Tarea 5, R12(b): lo que dejó sin probar la Tarea 4 en los caminos que ahora reciben `board` ---- */
const cofreDef = { schema: 1, id: 'p:cofre1', name: 'Cofre', class: 'object', art: { base: 'z' },
  shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object', low: false },
  components: { move: { block: true }, sight: 'none', light: 'none' }, variants: [], interactions: [], reactions: [] };

test('cleanCampaign y cleanLiveDoc(board) conservan una pieza `p:` del tablero si reciben sus definiciones (R12b)', () => {
  const board = new Map([[cofreDef.id, cofreDef]]);
  const raw = Object.assign({}, F.campaign(), { boards: { tpueblo: { name: 'Pueblo', data: F.map(8, { props: [{ type: 'z', def: 'p:cofre1', x: 1, z: 1 }] }) } } });
  const camp = R.cleanCampaign(raw, board);
  assert.deepEqual(camp.boards.tpueblo.data.props.map((p) => p.def), ['p:cofre1'], 'con las definiciones a mano, la pieza no se descarta');
  // I1 (ola final): sin ellas, la pieza ya no se pierde: se conserva opaca (sólo type, def, uid, x, z, v)
  const opaca = R.cleanCampaign(raw).boards.tpueblo.data.props;
  assert.deepEqual(opaca.map((p) => [p.type, p.def, p.x, p.z, p.v]), [['z', 'p:cofre1', 1, 1, 0]], 'sin ellas, se conserva opaca');
  const doc = R.cleanLiveDoc('board', { open: true, rev: 1, board: F.map(8, { props: [{ type: 'z', def: 'p:cofre1', x: 2, z: 2 }] }) }, null, board);
  assert.deepEqual(doc.board.props.map((p) => p.def), ['p:cofre1']);
});

test('playerDoors reconoce una puerta `p:` del tablero por ctx.pieces, igual que una de fábrica (R12b)', () => {
  const pieces = new Map([[puertaSinEstados.id, puertaSinEstados]]);
  const board = { open: true, board: { props: [{ type: 'y', def: 'p:puerta1', x: 2, z: 2, open: false }] } };
  const doc = { d: { '2_2': 1 } };
  assert.equal(R.playerDoors(doc, { d: {} }, { settings: { playersDoors: true }, board, pieces }), null, 'la reconoce y la deja abrir');
  assert.match(R.playerDoors(doc, { d: {} }, { settings: { playersDoors: true }, board }), /ninguna puerta/, 'sin ctx.pieces no la reconoce');
});

/* Ronda de arreglos 1, «Importante 1a» (fallar cerrado): si a una pieza colocada le borran su definición del
   tablero (p. ej. se quitó de t3d.pieces, aunque siguiera puesta en la escena), Catalogo.gmOnly no puede
   consultarla y da `false` — así que sceneFor tiene que descartarla igual que si fuera gmOnly, no sólo cuando
   lo es. El director, que ve la escena cruda, la sigue viendo (para poder quitarla). */
test('sceneFor: una pieza sin definición (borrada mientras estaba colocada) no llega al jugador, pero el director la sigue viendo (R12/Importante 1a)', () => {
  const pl = { role: 'player', user_id: 2 }, gm = { role: 'gm', user_id: 1 };
  const map = { props: [{ type: 'x', def: 'p:borrada', uid: 'u1', x: 1, z: 1, v: 0 }], minis: [], notes: [], plans: [] };
  assert.deepEqual(R.sceneFor(map, pl, {}, new Map()).props, [], 'sin su definición, el jugador no la recibe');
  assert.deepEqual(R.sceneFor(map, gm, {}, new Map()), map, 'el director ve la escena tal cual (para poder quitarla)');
});

test('travelPlan: una pieza `p:` que bloquea cuenta como ocupada al buscar sitio de llegada (R12b)', () => {
  const muroDef = { schema: 1, id: 'p:muro1', name: 'Muro', class: 'object', art: { base: 'm' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object', low: false },
    components: { move: { block: true }, sight: 'none', light: 'none' }, variants: [], interactions: [], reactions: [] };
  const board = new Map([[muroDef.id, muroDef]]);
  const src = R.cleanMap(F.map(8, { minis: [{ kind: 'knight', x: 0, z: 0, id: 'k1', sheet: { kind: 'player' } }] }));
  const dst = R.cleanMap(F.map(8, { start: [3, 3], minis: [], props: [{ type: 'm', def: 'p:muro1', x: 3, z: 3 }] }), board);
  const plan = R.travelPlan(src, dst, { portal: null, players: true }, board);
  assert.deepEqual(plan.moved, ['k1']);
  const k1 = plan.dst.minis.find((q) => q.id === 'k1');
  assert.notDeepEqual([k1.x, k1.z], [3, 3], 'la pieza del tablero bloquea la casilla como si fuera de fábrica');
});
