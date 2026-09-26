'use strict';
/* El catálogo de piezas (modules/tablero3d/public/catalogo.js) dice lo mismo que el código de antes de la fase 0
   (fixtures/fabrica-antes.json, foto fija) para cada pieza de fábrica, y sus consultas y su validación funcionan.
   Ronda de arreglos 1: aserciones directas sobre la definición (no sólo vía blocks()), defIdOf/complete sin
   confiar en un `def` ajeno, el respaldo a la raíz de un estado sólo para open/locked, blocks() sin wallKind por
   componentes ('limited' tapa como 'block'), validateDef con todos los campos de §3.2 y sus rechazos, FACTORY
   congelado en profundidad. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../modules/tablero3d/public/catalogo.js');
const ANTES = require('./fixtures/fabrica-antes.json');

test('catálogo: cada pieza de fábrica se comporta como antes (paso, vista, luz, puerta, varias casillas, luz fija)', () => {
  for (const [t, a] of Object.entries(ANTES)) {
    const p = { type: t, x: 0, z: 0, v: 0 }, q = { type: t, x: 0, z: 0, v: 1 };
    const def = C.defOf(p);
    assert.ok(def, `${t}: tiene definición`);
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
    // aserciones directas sobre la definición (ronda 1, punto 1): no sólo vía blocks()/consultas derivadas
    assert.equal(C.comp(def, {}, 'sight'), a.sight ? 'block' : 'none', `${t}: componente sight`);
    assert.equal(C.comp(def, {}, 'light'), a.lightBlock ? 'block' : 'none', `${t}: componente light`);
    assert.equal(!!C.comp(def, {}, 'hide'), a.hide, `${t}: componente hide`);
    assert.equal(def.shape.orient, a.orient, `${t}: shape.orient`);
    assert.equal(def.shape.random, a.rand, `${t}: shape.random`);
    assert.equal((def.components.door || {}).lift || 0, a.lift, `${t}: door.lift`);
    assert.equal(def.shape.low, a.low, `${t}: shape.low`);
    assert.equal(!!def.components.door, a.door, `${t}: componente door presente`);
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

test('catálogo: portal de suelo no tapa vista ni luz pero sí el paso', () => {
  const suelo = { type: 'portal', x: 0, z: 0, look: 'trapdoor' };
  assert.equal(C.blocks(suelo, 'sight'), false);
  assert.equal(C.blocks(suelo, 'light'), false);
  assert.equal(C.blocksMove(suelo), true);
  assert.equal(C.blocks({ type: 'portal', x: 0, z: 0, look: 'door' }, 'sight'), true);
});

test('catálogo: terrenos — tabla completa de las 10 letras (paso, vista, luz, líquido, peligro, animado)', () => {
  // tomada de TERR/PATHG en tablero3d.js: sólo 'w' (muro) bloquea vista y luz; 'l' (lava) bloquea el paso, es
  // peligrosa y animada; '~' (agua) es líquida y animada; el resto no tiene ninguna de estas banderas.
  const TABLA = {
    g: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    a: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    p: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    s: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    o: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    c: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    n: { move: false, sight: false, light: false, liquid: false, hazard: false, anim: false },
    w: { move: true, sight: true, light: true, liquid: false, hazard: false, anim: false },
    l: { move: true, sight: false, light: false, liquid: false, hazard: true, anim: true },
    '~': { move: false, sight: false, light: false, liquid: true, hazard: false, anim: true },
  };
  for (const [l, e] of Object.entries(TABLA)) {
    const t = C.TERRAIN[l];
    assert.ok(t, `terreno ${l}`);
    assert.equal(C.comp(t, {}, 'move').block, e.move, `${l}: paso`);
    assert.equal(C.comp(t, {}, 'sight') !== 'none', e.sight, `${l}: vista`);
    assert.equal(C.comp(t, {}, 'light') !== 'none', e.light, `${l}: luz`);
    assert.equal(!!C.comp(t, {}, 'terrain').liquid, e.liquid, `${l}: líquido`);
    assert.equal(!!C.comp(t, {}, 'terrain').hazard, e.hazard, `${l}: peligro`);
    assert.equal(!!C.comp(t, {}, 'terrain').anim, e.anim, `${l}: animado`);
  }
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

test('catálogo: complete() copia state y target sin aliasing con la pieza original', () => {
  const original = { type: 'portal', x: 0, z: 0, id: 1, look: 'door', target: { scene: 'a', portal: 2 } };
  const q = C.complete(original);
  q.target.scene = 'cambiado';
  assert.equal(original.target.scene, 'a', 'el target de la original no cambia');
  const original2 = { type: 'unknown-xyz', x: 0, z: 0, state: { foo: 1 } };
  const q2 = C.complete(original2);
  q2.state.foo = 99;
  assert.equal(original2.state.foo, 1, 'el state de la original no cambia aunque no haya definición con estados');
});

test('catálogo: complete() no escribe `def` si no hay definición posible (nada de def: null)', () => {
  const q = C.complete({ type: 'tipo-inventado-xyz', x: 0, z: 0 });
  assert.equal('def' in q, false);
});

test('catálogo: defIdOf no confía en un `def` ajeno; sólo un `def` p: bien formado sustituye al derivado de `type`', () => {
  assert.equal(C.defIdOf({ type: 'barrier', def: 'f:chest' }), 'f:barrier', 'un def ajeno (f:) se ignora');
  assert.equal(C.gmOnly({ type: 'barrier', def: 'f:chest', x: 0, z: 0 }), true, 'sigue siendo una barrera');
  const nope = { type: 'door', def: 'f:nope', x: 0, z: 0 };
  assert.equal(C.blocksMove(nope), true, 'un def ajeno que no existe también se ignora');
  assert.equal(C.complete(nope).def, 'f:door');
  assert.equal(C.defIdOf({ type: 'chest', def: 'd:x' }), 'f:chest', 'un def con prefijo d: no sustituye a un type de fábrica');
  assert.equal(C.defIdOf({ type: 'obj:o_abcd1234', def: 'p:cofre01' }), 'p:cofre01', 'un def p: bien formado sí sustituye al derivado del dibujo');
});

test('catálogo: el respaldo a la raíz de un estado sólo vale para open/locked, con coerción !!v', () => {
  const p = { type: 'door', x: 0, z: 0, open: 1, locked: 0 };
  const st = C.stateOf(p, C.defOf(p));
  assert.equal(st.open, true, 'open:1 (dato viejo) se coerciona a true');
  assert.equal(st.locked, false, 'locked:0 se coerciona a false');
});

test('catálogo: sin wallKind, blocks() decide por componentes; "limited" tapa igual que "block"', () => {
  const board = new Map();
  const def = C.validateDef({ schema: 1, id: 'p:vidrio01', name: 'Vidrio', class: 'object', art: { base: 'o_vidrio' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'object' },
    components: { move: { block: false }, sight: 'limited', light: 'none' }, variants: [], interactions: [], reactions: [] });
  board.set(def.id, def);
  const p = { type: 'vidrio', def: def.id, x: 0, z: 0 };
  assert.equal(C.blocks(p, 'sight', board), true, '"limited" tapa como "block" hasta su fase (§3.2)');
  assert.equal(C.blocks(p, 'light', board), false);
  assert.equal(C.blocks(p, 'move', board), false);
});

test('catálogo: FACTORY está congelado en profundidad', () => {
  assert.throws(() => { C.FACTORY['f:chest'].components.move.block = false; });
  assert.equal(C.blocksMove({ type: 'chest', x: 0, z: 0 }), true, 'no cambió');
});

test('catálogo: validateDef — acepta una definición bien hecha, recorta topes y rechaza lo raro', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' },
    states: { lid: { values: [false, true], initial: false } },
    variants: [{ when: { lid: true }, set: { art: 'o_cofre02' } }], interactions: [], reactions: [] });
  assert.ok(d);
  assert.equal(C.validateDef(Object.assign({}, d, { id: 'f:hack' })), null, 'el prefijo f: es sólo de fábrica (aislado: el resto es válido)');
  assert.equal(C.validateDef(Object.assign({}, d, { id: 'd:hack' })), null, 'el prefijo d: es sólo del dibujo calculado');
  assert.equal(C.validateDef(Object.assign({}, d, { class: 'nave' })), null);
  assert.equal(C.validateDef(Object.assign({}, d, { schema: 2 })), null, 'schema fijo en 1');
  assert.equal(C.validateDef(Object.assign({}, d, { shape: Object.assign({}, d.shape, { w: 9 }) })), null, 'w ≤ 8');
});

test('catálogo: validateDef — estados: topes, duplicados, NaN/Infinity y nombres reservados', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' }, variants: [], interactions: [], reactions: [] });
  const withStates = (states) => C.validateDef(Object.assign({}, d, { states, variants: [] }));
  assert.equal(withStates({ a: { values: [1, 2, 3, 4, 5], initial: 1 } }), null, '≤ 4 valores');
  assert.equal(withStates({ a: { values: [false, true], initial: false }, b: { values: [false, true], initial: false },
    c: { values: [false, true], initial: false }, dd: { values: [false, true], initial: false },
    e: { values: [false, true], initial: false } }), null, '≤ 4 estados');
  assert.equal(withStates({ a: { values: [1, 1], initial: 1 } }), null, 'valores duplicados');
  assert.equal(withStates({ a: { values: [NaN, 1], initial: 1 } }), null, 'NaN no es un valor válido');
  assert.equal(withStates({ a: { values: [Infinity, 1], initial: 1 } }), null, 'Infinity no es un valor válido');
  assert.equal(withStates({ x: { values: [false, true], initial: false } }), null, '"x" choca con el campo de la pieza colocada');
  assert.equal(withStates({ open: { values: [false, true], initial: false } }), null, '"open" choca con el espejo de las puertas');
});

test('catálogo: validateDef — más de 16 variantes y más de 64 KB (medido en bytes UTF-8) rechazan la definición', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' },
    states: { lid: { values: [false, true], initial: false } },
    variants: [{ when: { lid: true }, set: { art: 'o_cofre02' } }], interactions: [], reactions: [] });
  const muchas = Array.from({ length: 17 }, () => ({ when: { lid: true }, set: { sight: 'none' } }));
  assert.equal(C.validateDef(Object.assign({}, d, { variants: muchas })), null, '> 16 variantes');
  const enorme = Object.assign({}, d, { states: { a: { values: [false, 'x'.repeat(70000)], initial: false } }, variants: [] });
  assert.equal(C.validateDef(enorme), null, '> 64 KB en bytes UTF-8');
});

test('catálogo: validateDef — rechaza interactions/reactions que no estén vacías (reservados)', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' }, variants: [], interactions: [], reactions: [] });
  assert.equal(C.validateDef(Object.assign({}, d, { interactions: [{ x: 1 }] })), null);
  assert.equal(C.validateDef(Object.assign({}, d, { reactions: [{ x: 1 }] })), null);
});

test('catálogo: validateDef — sanea y devuelve todos los campos de §3.2 (redondeos aparte)', () => {
  const entrada = {
    schema: 1, id: 'p:allfields01', name: 'Todo', class: 'terrain', template: 'basic',
    art: { base: 'o_all', byState: { 'lit=true': 'o_all_lit' } },
    shape: { w: 2, d: 3, height: 1.5, orient: true, random: false, layer: 'wall', low: true },
    components: {
      move: { block: true, sides: 'NE' }, sight: 'limited', light: 'block',
      emitLight: { preset: 'torch', r: 10, color: '#ff8800', intensity: 1.2, anim: 'flicker', angle: 90, h: 2, origin: { px: 5, py: 6, s: 1 } },
      surface: { walkable: true, height: 4 }, cost: 2, hide: true, gmOnly: true,
      door: { lift: 1.5 }, portal: { looks: ['door', 'cave'] },
      terrain: { liquid: true, hazard: false, anim: true, prio: 3, fringe: 'edge' },
    },
    states: { lit: { values: [false, true], initial: false } },
    variants: [{ when: { lit: true }, set: { sight: 'none' } }],
    interactions: [], reactions: [],
  };
  const d = C.validateDef(entrada);
  assert.ok(d, 'la definición completa se acepta');
  assert.equal(d.template, 'basic');
  assert.deepEqual(d.art, { base: 'o_all', byState: { 'lit=true': 'o_all_lit' } });
  assert.deepEqual(d.shape, { w: 2, d: 3, height: 1.5, orient: true, random: false, layer: 'wall', low: true });
  assert.deepEqual(d.components.move, { block: true, sides: 'NE' });
  assert.equal(d.components.sight, 'limited');
  assert.equal(d.components.light, 'block');
  assert.deepEqual(d.components.emitLight, { preset: 'torch', r: 10, color: '#ff8800', intensity: 1.2, anim: 'flicker', angle: 90, h: 2, origin: { px: 5, py: 6, s: 1 } });
  assert.deepEqual(d.components.surface, { walkable: true, height: 4 });
  assert.equal(d.components.cost, 2);
  assert.equal(d.components.hide, true);
  assert.equal(d.components.gmOnly, true);
  assert.deepEqual(d.components.door, { lift: 1.5 });
  assert.deepEqual(d.components.portal, { looks: ['door', 'cave'] });
  assert.deepEqual(d.components.terrain, { liquid: true, hazard: false, anim: true, prio: 3, fringe: 'edge' });
  assert.deepEqual(d.states, { lit: { values: [false, true], initial: false } });
  assert.deepEqual(d.variants, [{ when: { lit: true }, set: { sight: 'none' } }]);
  assert.equal(d.wallKind, undefined, 'validateDef no escribe wallKind: sólo lo llevan los muros de fábrica');
});

test('catálogo: validateDef — el componente terrain sólo se guarda con class: "terrain"', () => {
  const d = C.validateDef({ schema: 1, id: 'p:obj01', name: 'Objeto', class: 'object', art: { base: 'o_x' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none', terrain: { liquid: true } }, variants: [], interactions: [], reactions: [] });
  assert.equal(d.components.terrain, undefined);
});
