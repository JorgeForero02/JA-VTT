'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/rules');
const T = require('../server/terrain');

test('sameObject ignora el orden de las claves, también anidadas', () => {
  assert.equal(R.sameObject({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }), true);
  assert.equal(R.sameObject({ a: 1 }, { a: 2 }), false);
  assert.equal(R.sameObject({ a: [1, { k: 1, j: 2 }] }, { a: [1, { j: 2, k: 1 }] }), true);
  assert.equal(R.sameObject({ a: [1, 2] }, { a: [2, 1] }), false);
});

test('playerUpsert: girar la luz propia devuelve un objeto igual al enviado (sin corrección)', () => {
  const uid = 7;
  const old = R.sanitize({ id: 1, type: 'token', kind: 'player', owner: uid, x: 100, y: 100, name: 'A', size: 1, hidden: false, vision: true, sight: 0, darkvision: 0, light: { on: true, preset: 'bullseye', bright: 60, dim: 60, color: '#FFE6B8', intensity: 1, anim: 'none', angle: 60, rot: 0 } });
  // jsonb devuelve las claves en otro orden al recargar de la base: se emula aquí
  const fromDb = JSON.parse(R.stableJson(old));
  const neu = R.sanitize(Object.assign({}, old, { light: Object.assign({}, old.light, { rot: 37 }) }));
  const result = R.playerUpsert(uid, fromDb, neu, { settings: {} }, 1, 0);
  assert.ok(result);
  assert.equal(result.light.rot, 37);
  assert.notEqual(JSON.stringify(result), JSON.stringify(neu), 'el orden de claves difiere tras pasar por jsonb');
  assert.equal(R.sameObject(result, neu), true, 'pero el contenido es el mismo: no hay que corregir al cliente');
});

test('sanitize acepta el tipo de muro "cover" (maleza)', () => {
  const w = R.sanitize({ id: 5, type: 'wall', kind: 'cover', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });
  assert.equal(w.kind, 'cover');
  assert.equal(R.sanitize({ id: 6, type: 'wall', kind: 'inventado', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }).kind, 'wall');
});

test('mode: sólo 2d o 2.5d; por defecto 2d; es ajuste de tablero', () => {
  assert.deepEqual(R.MODES, ['2d', '2.5d']);
  assert.equal(R.cleanSettings({ mode: '2.5d' }).mode, '2.5d');
  assert.equal(R.cleanSettings({ mode: '3d' }).mode, undefined);
  assert.equal(R.DEFAULT_BOARD.mode, '2d');
  assert.equal(R.splitSettings({ mode: '2.5d', env: 'day' }).board.mode, '2.5d');
  assert.equal(R.splitSettings({ mode: '2.5d', env: 'day' }).scene.mode, undefined);
});

test('boardSettingsPatch: descarta mode (inmutable) pero conserva el resto de ajustes de tablero', () => {
  const { board, scene } = R.boardSettingsPatch({ mode: '2.5d', sharedVision: false, env: 'night' });
  assert.equal(board.mode, undefined);
  assert.equal(board.sharedVision, false);
  assert.equal(scene.env, 'night');
});

test('terrainOpAllowed: el director puede todo; el jugador solo puertas no bloqueadas si el tablero lo permite', () => {
  const gm = { role: 'gm' };
  const player = { role: 'player' };
  const terrain = T.generate('cripta');
  const doorCell = Number(Object.keys(terrain.extras.objs).find((i) => terrain.extras.objs[i].kind === 'puerta'));
  assert.equal(R.terrainOpAllowed(gm, { type: 'cells', cells: [{ i: 0, h: 5 }] }, {}, terrain), true);
  assert.equal(R.terrainOpAllowed(player, { type: 'cells', cells: [{ i: 0, h: 5 }] }, {}, terrain), false);
  assert.equal(R.terrainOpAllowed(player, { type: 'door', i: doorCell, open: true }, {}, terrain), true);
  assert.equal(R.terrainOpAllowed(player, { type: 'door', i: doorCell, open: true }, { playersDoors: false }, terrain), false);
  terrain.extras.objs[doorCell].locked = true;
  assert.equal(R.terrainOpAllowed(player, { type: 'door', i: doorCell, open: true }, {}, terrain), false);
  assert.equal(R.terrainOpAllowed(player, { type: 'door', i: 12345, open: true }, {}, terrain), false);
  const barrelCell = Number(Object.keys(terrain.extras.objs).find((i) => terrain.extras.objs[i].kind === 'barril'));
  assert.equal(R.terrainOpAllowed(player, { type: 'door', i: barrelCell, open: true }, {}, terrain), false);
});

test('cleanTerrainOp se reexporta desde terrain.js', () => {
  assert.equal(R.cleanTerrainOp, T.cleanTerrainOp);
});

test('sanitize: token.art se guarda recortado a 40 y no aparece si viene vacío', () => {
  const base = { id: 1, type: 'token', x: 0, y: 0 };
  assert.equal(R.sanitize(Object.assign({}, base, { art: 'knight_f' })).art, 'knight_f');
  assert.equal(R.sanitize(Object.assign({}, base, { art: 'x'.repeat(41) })).art.length, 40);
  assert.equal(R.sanitize(base).art, undefined);
  assert.equal(R.sanitize(Object.assign({}, base, { art: 7 })).art, undefined);
});

test('sanitize: light.mount cuelga la luz de una celda; celda inválida = sin mount', () => {
  const base = { id: 2, type: 'light', x: 0, y: 0 };
  assert.deepEqual(R.sanitize(Object.assign({}, base, { mount: { cell: 5, dir: 2 } })).mount, { cell: 5, dir: 2 });
  assert.deepEqual(R.sanitize(Object.assign({}, base, { mount: { cell: 5 } })).mount, { cell: 5, dir: 0 });
  assert.deepEqual(R.sanitize(Object.assign({}, base, { mount: { cell: 5, dir: 9 } })).mount, { cell: 5, dir: 0 });
  assert.equal(R.sanitize(Object.assign({}, base, { mount: { cell: -1 } })).mount, undefined);
  assert.equal(R.sanitize(base).mount, undefined);
});
