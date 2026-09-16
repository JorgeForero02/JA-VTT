'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/rules');

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
