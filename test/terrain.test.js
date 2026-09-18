'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blankTerrain, generate, encode, decode, cleanTerrainOp, applyTerrainOp, BORDERS, SCENE_INFO } = require('../server/terrain');

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

test('cleanTerrainOp(obj) conserva locked sólo si es booleano', () => {
  let op = cleanTerrainOp({ type: 'obj', i: 3, kind: 'puerta', rot: null, locked: true });
  assert.equal(op.locked, true);
  op = cleanTerrainOp({ type: 'obj', i: 3, kind: 'puerta', rot: null, locked: 'si' });
  assert.equal('locked' in op, false);
});

test('applyTerrainOp(obj) guarda locked cuando viene', () => {
  const t = blankTerrain(22);
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 3, kind: 'puerta', rot: null, locked: true }));
  assert.equal(t.extras.objs[3].locked, true);
});

test('encode/decode es ida y vuelta idéntica', () => {
  const t = generate('valle');
  const row = encode(t);
  const d = decode(row);
  terrainEqual(t, d);
});

test('SCENE_INFO describe qué escenas generan decorado', () => {
  assert.equal(SCENE_INFO.valle.randomTrees, true);
  assert.equal(SCENE_INFO.valle.tufts, true);
  assert.equal(SCENE_INFO.cripta.randomTrees, false);
  assert.equal(SCENE_INFO.blank.randomTrees, false);
});

test('generate y blankTerrain guardan la escena y el offset', () => {
  const v = generate('valle');
  assert.equal(v.extras.scene, 'valle');
  assert.equal(v.extras.off, 0);
  const c = generate('cripta');
  assert.equal(c.extras.scene, 'cripta');
  assert.equal(c.extras.off, 0);
  const b = blankTerrain(22);
  assert.equal(b.extras.scene, 'blank');
  assert.equal(b.extras.off, 0);
});

test('grow reproduce el borde y los árboles del cliente', () => {
  const t = generate('valle');
  const oldH = t.h[0];
  const oldM = t.m[0];
  applyTerrainOp(t, cleanTerrainOp({ type: 'grow', pad: 8 }));
  assert.equal(t.n, 38);
  assert.equal(t.extras.off, 8);
  const N = t.n;
  const inRing = (i) => {
    const x = i % N, z = Math.floor(i / N);
    return x < 8 || z < 8 || x >= 30 || z >= 30;
  };
  assert.equal(t.h[0], BORDERS.valle(0 - 8, 0 - 8).h);
  assert.equal(t.m[0], 0);
  assert.equal(t.h[8 * N + 8], oldH);
  assert.equal(t.m[8 * N + 8], oldM);
  const grownObjs = Object.keys(t.extras.objs).map(Number);
  assert.ok(grownObjs.some(i => inRing(i) && ['arbol', 'pino'].includes(t.extras.objs[i].kind)));
  const t2 = generate('valle');
  applyTerrainOp(t2, cleanTerrainOp({ type: 'grow', pad: 8 }));
  assert.deepEqual(Object.keys(t.extras.objs).sort(), Object.keys(t2.extras.objs).sort());
});

test('cleanTerrainOp(settings) no acepta scene ni off', () => {
  const op = cleanTerrainOp({ type: 'settings', scene: 'cripta', off: 9, mist: 0.5 });
  assert.equal(op.type, 'settings');
  assert.equal(op.mist, 0.5);
  assert.equal('scene' in op, false);
  assert.equal('off' in op, false);
});

test('grow en blank deja el anillo plano y sin objetos', () => {
  const t = blankTerrain(22);
  applyTerrainOp(t, cleanTerrainOp({ type: 'grow', pad: 8 }));
  assert.equal(t.extras.scene, 'blank');
  assert.equal(t.extras.off, 8);
  const N = t.n;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const ox = x - 8, oz = z - 8;
      if (ox >= 0 && oz >= 0 && ox < 22 && oz < 22) continue;
      const i = z * N + x;
      assert.equal(t.h[i], 1, `h en (${x},${z})`);
      assert.equal(t.m[i], 0, `m en (${x},${z})`);
    }
  }
  assert.deepEqual(Object.keys(t.extras.objs), []);
});

test('applyTerrainOp lanza si la casilla cae fuera del tablero (obj, door, mount, water)', () => {
  const t = blankTerrain(22);
  const out = 22 * 22;
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: out, kind: 'barril' })), /fuera del tablero/);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'door', i: out, open: true })), /fuera del tablero/);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'mount', key: out + ':1', kind: 'estandarte' })), /fuera del tablero/);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'water', springs: [{ cell: out, rate: .05, cap: .5 }], sinks: [], evap: .001, edgeDrain: true })), /fuera del tablero/);
  assert.equal(t.version, 0, 'ninguna op inválida cambia la versión');
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: out - 1, kind: 'barril' }));
  assert.equal(t.version, 1);
});

test('cleanTerrainOp(settings) recorta los rangos que usa el panel 2.5D', () => {
  const op = cleanTerrainOp({ type: 'settings', style: 'pixel32', fogAlpha: 1.5, mist: -1, cutOn: true, cutH: 12, focus: false, autoGrow: true, evap: 0.2, edgeDrain: false });
  assert.equal(op.style, 'pixel32'); assert.equal(op.fogAlpha, 1); assert.equal(op.mist, 0); assert.equal(op.cutH, 9); assert.equal(op.evap, 0.05);
  assert.equal(op.focus, false); assert.equal(op.autoGrow, true); assert.equal(op.edgeDrain, false);
  assert.equal(cleanTerrainOp({ type: 'settings', style: 'oleo' }), null);
});

test('mount: sólo en la cara de un muro más alto que la casilla contigua; quitar siempre vale', () => {
  const { mountValid } = require('../server/terrain');
  const t = blankTerrain(22);
  const wall = 5 * 22 + 5, east = wall + 1;
  t.h[wall] = 4; t.h[east] = 1;
  t.h[wall - 1] = 4;
  assert.equal(mountValid(t, wall, 0), true, 'cara este: la contigua está más baja');
  assert.equal(mountValid(t, wall, 1), false, 'cara oeste: misma altura');
  applyTerrainOp(t, cleanTerrainOp({ type: 'mount', key: wall + ':0', kind: 'estandarte' }));
  assert.equal(t.extras.mounts[wall + ':0'].kind, 'estandarte');
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'mount', key: wall + ':1', kind: 'estandarte' })), /muro más alto/);
  assert.equal(t.extras.mounts[wall + ':1'], undefined);
  applyTerrainOp(t, cleanTerrainOp({ type: 'mount', key: wall + ':0', kind: null }));
  assert.equal(t.extras.mounts[wall + ':0'], undefined);
  assert.equal(mountValid(t, 21, 0), false, 'borde: la contigua cae fuera');
});

test('obj: open viaja con la op y sobrevive a girar o bloquear', () => {
  const t = blankTerrain(22);
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 30, kind: 'puerta', rot: 0 }));
  applyTerrainOp(t, cleanTerrainOp({ type: 'door', i: 30, open: true }));
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 30, kind: 'puerta', rot: Math.PI / 2, open: true, locked: false }));
  assert.equal(t.extras.objs[30].open, true);
  assert.equal(t.extras.objs[30].rot, Math.PI / 2);
  assert.equal(cleanTerrainOp({ type: 'obj', i: 30, kind: 'puerta', open: 'sí' }).open, undefined);
});

test('art: claves válidas, límites de cuadros y de entradas, objetos propios', () => {
  const { CHAR_KINDS } = require('../server/terrain');
  assert.ok(CHAR_KINDS.includes('guerrera') && CHAR_KINDS.length === 12);
  const t = blankTerrain(22);
  assert.deepEqual(t.extras.art, {}, 'el terreno nace con extras.art vacío');
  const rect = [0, 0, 16, 16];
  const ok = cleanTerrainOp({ type: 'art', add: { key: 'tile:0:top', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [rect] } });
  assert.equal(ok.add.key, 'tile:0:top');
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'tile:0:top', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [rect, rect] } }), null, 'un tile lleva un solo cuadro');
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'tile:9:top', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [rect] } }), null, 'material fuera de catálogo');
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'char:dragon:idle', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [rect] } }), null);
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'obj:barril', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: Array(65).fill(rect) } }), null, 'más de 64 cuadros');
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'obj:barril', imgId: '../x', fw: 16, fh: 16, ppc: 16, frames: [rect] } }), null, 'imgId inválido');
  assert.equal(cleanTerrainOp({ type: 'art', add: { key: 'obj:barril', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [{ x: 0, y: 0, w: 16, h: 16 }] } }), null, 'los cuadros son arrays [x,y,w,h], no objetos');
  applyTerrainOp(t, ok);
  assert.deepEqual(t.extras.art['tile:0:top'].frames, [rect]);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'art', add: { key: 'obj:propio-abc', imgId: 'img_1', fw: 16, fh: 16, ppc: 16, frames: [rect] } })), /Primero define/);
  applyTerrainOp(t, cleanTerrainOp({ type: 'art', add: { key: 'newobj:propio-abc', name: 'Tótem', move: true, sight: false, fixed: true, mount: false } }));
  applyTerrainOp(t, cleanTerrainOp({ type: 'art', add: { key: 'obj:propio-abc', imgId: 'img_1', fw: 16, fh: 24, ppc: 16, frames: [rect] } }));
  assert.equal(t.extras.art['newobj:propio-abc'].name, 'Tótem');
  applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 40, kind: 'propio-abc', rot: 0 }));
  assert.equal(t.extras.objs[40].kind, 'propio-abc');
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'obj', i: 41, kind: 'propio-zzz', rot: 0 })), /desconocido/);
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'mount', key: '5:0', kind: 'propio-abc' })), /muro más alto|colgar/);
  applyTerrainOp(t, cleanTerrainOp({ type: 'art', remove: 'tile:0:top' }));
  assert.equal(t.extras.art['tile:0:top'], undefined);
  applyTerrainOp(t, cleanTerrainOp({ type: 'art', clear: true }));
  for (let k = 0; k < 200; k++) applyTerrainOp(t, cleanTerrainOp({ type: 'art', add: { key: 'newchar:propio-' + k.toString(36).padStart(2, 'a'), name: 'C' + k } }));
  assert.throws(() => applyTerrainOp(t, cleanTerrainOp({ type: 'art', add: { key: 'newchar:propio-zzz', name: 'X' } })), /máximo 200/);
  applyTerrainOp(t, cleanTerrainOp({ type: 'art', clear: true }));
  assert.deepEqual(t.extras.art, {});
});
