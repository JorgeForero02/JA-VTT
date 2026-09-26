'use strict';
/* El catálogo de piezas (modules/tablero3d/public/catalogo.js) dice lo mismo que el código de antes de la fase 0
   (fixtures/fabrica-antes.json, foto fija) para cada pieza de fábrica, y sus consultas y su validación funcionan. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../modules/tablero3d/public/catalogo.js');
const ANTES = require('./fixtures/fabrica-antes.json');

test('catálogo: cada pieza de fábrica se comporta como antes (paso, vista, luz, puerta, varias casillas, luz fija)', () => {
  for (const [t, a] of Object.entries(ANTES)) {
    const p = { type: t, x: 0, z: 0, v: 0 }, q = { type: t, x: 0, z: 0, v: 1 };
    assert.ok(C.defOf(p), `${t}: tiene definición`);
    assert.equal(C.blocksMove(p), !a.walk, `${t}: paso (las puertas, cerradas)`);
    assert.deepEqual(C.span(p), a.span, `${t}: casillas`);
    assert.deepEqual(C.span(q), [a.span[1], a.span[0]], `${t}: casillas girada`);
    assert.equal(C.isLow(p), a.low, `${t}: la maleza lo oculta`);
    assert.equal(C.wallKind(p), a.wallKind, `${t}: tipo de muro`);
    assert.equal(C.isDoor(p), a.door, `${t}: puerta`);
    assert.equal(C.gmOnly(p), a.gmOnly, `${t}: sólo director`);
    assert.equal(C.surface(p), a.deck, `${t}: tarima`);
    assert.deepEqual(C.emitLight(p), a.emit, `${t}: luz fija`);
    for (const f of ['sight', 'light', 'hide']) {
      const antes = a.wallKind ? (f === 'hide' ? a.hide || a.sight : f === 'sight' ? a.sight : a.lightBlock) : false;
      assert.equal(C.blocks(p, f), antes, `${t}: tapa ${f}`);
    }
  }
});

test('catálogo: puerta abierta no tapa ni bloquea; con llave sigue cerrada', () => {
  for (const t of ['door', 'gate']) {
    assert.equal(C.blocksMove({ type: t, x: 0, z: 0, open: true }), false);
    assert.equal(C.blocks({ type: t, x: 0, z: 0, open: true }, 'sight'), false);
    assert.equal(C.blocks({ type: t, x: 0, z: 0, state: { open: true } }, 'sight'), false, 'lee state');
    assert.equal(C.blocks({ type: t, x: 0, z: 0, open: false, locked: true }, 'sight'), true);
  }
});

test('catálogo: portal de suelo no tapa vista ni luz pero sí el paso; el mágico alumbra', () => {
  const suelo = { type: 'portal', x: 0, z: 0, look: 'trapdoor' };
  assert.equal(C.blocks(suelo, 'sight'), false);
  assert.equal(C.blocks(suelo, 'light'), false);
  assert.equal(C.blocksMove(suelo), true);
  assert.equal(C.blocks({ type: 'portal', x: 0, z: 0, look: 'door' }, 'sight'), true);
});

test('catálogo: terrenos — muro y lava no se pisan; el muro tapa vista y luz', () => {
  for (const l of 'gapsow~cnl') assert.ok(C.TERRAIN[l], `terreno ${l}`);
  assert.equal(C.comp(C.TERRAIN.w, {}, 'move').block, true);
  assert.equal(C.comp(C.TERRAIN.w, {}, 'sight'), 'block');
  assert.equal(C.comp(C.TERRAIN.l, {}, 'move').block, true);
  assert.equal(C.comp(C.TERRAIN.g, {}, 'move').block, false);
});

test('catálogo: dibujo de objeto antiguo = definición calculada d: sólida, 1×1 y al azar', () => {
  const p = { type: 'obj:o_abcd1234', x: 1, z: 1 };
  assert.equal(C.defIdOf(p), 'd:o_abcd1234');
  assert.equal(C.blocksMove(p), true);
  assert.deepEqual(C.span(p), [1, 1]);
  assert.equal(C.isLow(p), true, 'la maleza lo puede ocultar, como hoy');
});

test('catálogo: complete() añade def, uid y state sin tocar la original ni perder campos', () => {
  const p = { type: 'door', x: 2, z: 3, v: 1, open: true, locked: true };
  const q = C.complete(p);
  assert.equal(p.uid, undefined, 'no muta');
  assert.equal(q.def, 'f:door');
  assert.match(q.uid, /^u[a-z0-9]{8}$/);
  assert.deepEqual(q.state, { open: true, locked: true });
  assert.equal(q.open, true, 'espejo para volver atrás');
  assert.equal(q.locked, true);
  const portal = C.complete({ type: 'portal', x: 0, z: 0, id: 3, look: 'cave', target: { scene: 'b1', portal: 2 }, name: 'Cueva' });
  assert.equal(portal.id, 3, 'el id entero del portal no se toca');
  assert.deepEqual(portal.target, { scene: 'b1', portal: 2 });
  assert.equal(C.complete(q).uid, q.uid, 'un uid que ya está se conserva');
});

test('catálogo: validateDef — acepta una definición bien hecha, recorta topes y rechaza lo raro', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' },
    states: { open: { values: [false, true], initial: false } },
    variants: [{ when: { open: true }, set: { art: 'o_cofre02' } }], interactions: [], reactions: [] });
  assert.ok(d);
  assert.equal(C.validateDef({ id: 'f:hack', class: 'object' }), null, 'el prefijo f: es sólo de fábrica');
  assert.equal(C.validateDef(Object.assign({}, d, { class: 'nave' })), null);
  assert.equal(C.validateDef(Object.assign({}, d, { states: { a: { values: [1, 2, 3, 4, 5] } } })), null, '≤ 4 valores');
  assert.equal(C.validateDef(Object.assign({}, d, { shape: Object.assign({}, d.shape, { w: 9 }) })), null, 'w ≤ 8');
});
