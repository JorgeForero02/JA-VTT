'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blankTerrain, generate, encode, decode, cleanTerrainOp, applyTerrainOp } = require('../server/terrain');

function arraysEqual(a, b) {
  return assert.deepEqual(Array.from(a), Array.from(b));
}

function terrainEqual(t, r) {
  assert.equal(t.n, r.n);
  arraysEqual(t.h, r.h);
  arraysEqual(t.m, r.m);
  arraysEqual(t.chan, r.chan);
  assert.deepEqual(t.extras, r.extras);
  assert.equal(t.version, r.version);
}

test('blankTerrain(22) devuelve arrays de 484 celdas y sin manantiales', () => {
  const t = blankTerrain(22);
  assert.equal(t.h.length, 484);
  assert.equal(t.m.length, 484);
  assert.equal(t.chan.length, 484);
  assert.deepEqual(t.extras.springs, []);
});

test('generate(valle) produce un valle determinista con agua, objetos y monturas', () => {
  const t = generate('valle');
  assert.equal(t.n, 22);
  assert.equal(t.extras.springs.length, 1);
  assert.ok(t.extras.sinks.length > 0);
  assert.equal(t.extras.pools.length, t.extras.sinks.length);
  const fixed = Object.values(t.extras.objs).filter(o => o.rot !== null || ['cofre', 'barrilx', 'barril', 'caja', 'valla', 'lapida', 'cruz', 'craneo', 'taburete', 'mesa', 'pino', 'arbol'].includes(o.kind));
  assert.ok(fixed.length >= 8);
  assert.ok(Object.values(t.extras.objs).some(o => o.kind === 'arbol' || o.kind === 'pino'));
  assert.equal(Object.keys(t.extras.mounts).length, 3);
  assert.ok(Array.from(t.chan).some(v => v === 1));
  const t2 = generate('valle');
  terrainEqual(t, t2);
});

test('generate(cripta) produce una cripta sin manantiales y con tres puertas', () => {
  const t = generate('cripta');
  assert.equal(t.n, 22);
  assert.equal(t.extras.springs.length, 0);
  const doors = Object.values(t.extras.objs).filter(o => o.kind === 'puerta');
  assert.equal(doors.length, 3);
});

test('generate(otra) lanza un error', () => {
  assert.throws(() => generate('otra'), /Escena desconocida/);
});

test('cleanTerrainOp sanea rangos y tamaños', () => {
  let op = cleanTerrainOp({ type: 'cells', cells: [{ i: 0, h: 12 }] });
  assert.equal(op.cells[0].h, 9);
  op = cleanTerrainOp({ type: 'cells', cells: [{ i: 0, m: 9 }] });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'cells', cells: Array.from({ length: 2001 }, (_, k) => ({ i: k, h: 1 })) });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'cells', cells: [{ i: 5 }] });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'grow', pad: 8 });
  assert.equal(op.pad, 8);
  op = cleanTerrainOp({ type: 'grow', pad: 5 });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'obj', i: 0, kind: 'dragon', rot: 0 });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'mount', key: '5:2', kind: 'estandarte' });
  assert.equal(op.key, '5:2');
  op = cleanTerrainOp({ type: 'mount', key: '5:2', kind: 'barril' });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'water', springs: Array.from({ length: 65 }, (_, k) => ({ cell: k, rate: 0.5, cap: 1 })) });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'settings', style: 'dibujado' });
  assert.equal(op, null);
  op = cleanTerrainOp({ type: 'settings', style: 'drawn', fogAlpha: 2 });
  assert.equal(op.fogAlpha, 1);
});

test('applyTerrainOp muta el terreno e incrementa la versión', () => {
  const t = blankTerrain(22);
  applyTerrainOp(t, cleanTerrainOp({ type: 'cells', cells: [{ i: 0, h: 5 }] }));
  assert.equal(t.version, 1);
  assert.equal(t.h[0], 5);
});

test('applyTerrainOp(grow) lanza si se supera el tamaño máximo', () => {
  const t = blankTerrain(118);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'grow', pad: 8 })), /Tablero en su tamaño máximo/);
});

test('applyTerrainOp(grow) recoloca objetos y mounts según la fórmula del cliente', () => {
  const t = blankTerrain(22);
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 0, kind: 'arbol', rot: null }));
  applyTerrainOp(t, cleanTerrainOp({ type: 'grow', pad: 8 }));
  assert.equal(t.n, 38);
  assert.ok(t.extras.objs[312]);
});

test('applyTerrainOp(door) abre una puerta existente', () => {
  const t = generate('cripta');
  const doorCell = Object.keys(t.extras.objs).find(i => t.extras.objs[i].kind === 'puerta');
  applyTerrainOp(t, cleanTerrainOp({ type: 'door', i: Number(doorCell), open: true }));
  assert.equal(t.extras.objs[doorCell].open, true);
});

test('encode/decode es ida y vuelta idéntica', () => {
  const t = generate('valle');
  const row = encode(t);
  const d = decode(row);
  terrainEqual(t, d);
});
