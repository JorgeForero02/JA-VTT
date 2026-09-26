'use strict';
/* Escenas en el servidor tras la fase 0: una escena vieja se completa sin perder nada, cada pieza se valida contra su
   definición, al jugador no le llegan las barreras (gmOnly) y las puertas guardan también open/locked (volver atrás). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../modules/tablero3d/rules');
const Catalogo = require('../../modules/tablero3d/public/catalogo.js');
const F = require('./helpers/fixtures');
const GM = { role: 'gm', user_id: '1' }, PL = { role: 'player', user_id: '2' };

// Ronda de arreglos 1, ruling R3b: un tablero con dos piezas `p:` (muro01 con gmOnly, cofre01 que bloquea) para probar
// que todo camino que sanea o filtra una escena conoce las definiciones del tablero, no sólo las de fábrica.
function boardConDosPiezas() {
  const board = new Map();
  board.set('p:muro01', Catalogo.validateDef({
    id: 'p:muro01', schema: 1, class: 'wall', art: { base: 'muro01' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'wall', low: false },
    components: { move: { block: true }, sight: 'block', light: 'block', gmOnly: true },
  }));
  board.set('p:cofre01', Catalogo.validateDef({
    id: 'p:cofre01', schema: 1, class: 'object', art: { base: 'cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'object', low: false },
    components: { move: { block: true }, sight: 'none', light: 'none' },
  }));
  return board;
}
function escenaConPiezasDeTablero(board) {
  return R.cleanMap(F.map(8, { props: [
    { type: 'muro01', def: 'p:muro01', x: 1, z: 1 },
    { type: 'cofre01', def: 'p:cofre01', x: 2, z: 1 },
  ] }), board);
}

test('escena vieja: se completa (v:2, def, uid, state) sin perder ningún dato y descarta sólo el tipo inexistente', () => {
  const m = R.cleanMap(F.escenaVieja());
  assert.equal(m.v, 2);
  const by = (t) => m.props.find((p) => p.type === t);
  assert.equal(m.props.length, 8, 'la nave espacial no existe: fuera; lo demás, dentro');
  for (const p of m.props) { assert.match(p.uid, /^u[a-z0-9]{8}$/); assert.ok(p.def); }
  assert.deepEqual(by('door').state, { open: false, locked: true });
  assert.equal(by('door').locked, true, 'espejo');
  assert.equal(by('gate').open, true);
  const portales = m.props.filter((p) => p.type === 'portal');
  assert.deepEqual(portales.map((p) => [p.look, p.id]).sort(), [['cave', 7], ['stairs', 1 + 4 * 160 + 4]].sort(), 'la escalera de antes pasa a portal');
  assert.deepEqual(portales.find((p) => p.look === 'cave').target, { scene: 'bOtra', portal: 2 });
  assert.equal(by('obj:o_abcd1234').def, 'd:o_abcd1234');
  assert.equal(by('light').preset, 'torch');
  assert.equal(by('bridge2').def, 'f:bridge2');
});

test('escena: guardar dos veces da lo mismo (los uid se conservan)', () => {
  const a = R.cleanMap(F.escenaVieja()), b = R.cleanMap(a);
  assert.deepEqual(b, a);
});

test('escena: pieza fuera del mapa, giro raro o uid repetido se arreglan sin perder piezas', () => {
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'chest', x: 9, z: 1 }, { type: 'chest', x: 1, z: -1 }, { type: 'chest', x: 1.5, z: 1 },
    { type: 'chest', x: 1, z: 1, v: 7, uid: 'uaaaaaaaa' }, { type: 'barrel', x: 2, z: 1, uid: 'uaaaaaaaa' },
  ] }));
  assert.equal(m.props.length, 2, 'las tres fuera de rango o no enteras se descartan');
  assert.equal(m.props[0].v, 0);
  assert.notEqual(m.props[0].uid, m.props[1].uid, 'uid repetido: el segundo toma uno nuevo');
});

test('privacidad: al jugador no le llegan las barreras (gmOnly); al director sí', () => {
  const m = R.cleanMap(F.escenaVieja());
  assert.ok(R.sceneFor(m, GM, null).props.some((p) => p.type === 'barrier'));
  assert.ok(!R.sceneFor(m, PL, null).props.some((p) => p.type === 'barrier'));
  const camp = R.campaignFor({ id: 'c1', name: 'C', boards: { a: { name: 'A', data: m } }, notes: {}, cur: 'a' }, PL, null);
  assert.ok(!camp.boards.a.data.props.some((p) => p.type === 'barrier'), 'también en campañas');
  const live = R.liveDocFor('board', { open: true, rev: 1, board: m }, PL, null, {});
  assert.ok(!live.board.props.some((p) => p.type === 'barrier'), 'y en la mesa en vivo');
});

test('puertas en vivo: el jugador abre la gate (puerta del catálogo) y no la de llave', () => {
  const board = { open: true, board: R.cleanMap(F.escenaVieja()) };
  const ctx = { board, settings: { playersDoors: true } };
  assert.equal(R.playerDoors({ d: { '2_2': 1 } }, { d: {} }, ctx), null, 'gate: sí');
  assert.match(R.playerDoors({ d: { '1_2': 1 } }, { d: {} }, ctx), /llave/);
  assert.match(R.playerDoors({ d: { '5_5': 1 } }, { d: {} }, ctx), /ninguna puerta/);
});

test('espejo: si sólo cambia el `state` (sin tocar la raíz), open/locked de la raíz se corrigen para la vuelta atrás', () => {
  // una puerta cuyo `state` ya trae open:true pero cuya raíz (de antes de completarse) no lo refleja todavía:
  // el espejo tiene que corregir la raíz, o una versión anterior que sólo lee open/locked se quedaría con la puerta cerrada
  const m = R.cleanMap(F.map(8, { props: [{ type: 'door', x: 1, z: 1, state: { open: true, locked: false } }] }));
  assert.equal(m.props[0].open, true, 'espejo: la raíz se pone al día con el estado');
  assert.equal(m.props[0].locked, undefined, 'sin llave: se quita de la raíz (no false residual)');
});

test('llegada por portal: la rejilla sale del catálogo (el puente se pisa; el cofre no; y una puerta abierta sigue ocupando su casilla)', () => {
  const m = R.cleanMap(F.map(8, { props: [{ type: 'bridge', x: 1, z: 1 }, { type: 'chest', x: 2, z: 1 }, { type: 'door', x: 3, z: 1, open: true }] }));
  const g = R.gridOf(m);
  assert.equal(g.open(1 * 8 + 1), true);
  assert.equal(g.open(1 * 8 + 2), false);
  assert.equal(g.open(1 * 8 + 3), false, 'una puerta abierta sigue ocupando su casilla para la llegada, como antes');
});

// Ronda de arreglos 1, punto 1: el `def` restaurado por el ruling R1 tiene que resolver una definición real, o una
// barrera/puerta con un `def` ajeno pasaría validada y dejaría de comportarse como lo que es.
test('cleanProp: un `def` ajeno (p: sin resolver) descarta la pieza; uno que no es p: lo deriva el catálogo del `type`', () => {
  const sinTablero = R.cleanMap(F.map(8, { props: [
    { type: 'barrier', x: 1, z: 1, def: 'p:zzzz' },
    { type: 'door', x: 2, z: 1, def: 'p:zzzz' },
    { type: 'barrier', x: 3, z: 1, def: 'f:chest' },
  ] }));
  assert.equal(sinTablero.props.length, 1, 'las dos con def p: sin tablero se descartan; la de f: ajeno no');
  const barrera = sinTablero.props[0];
  assert.equal(barrera.type, 'barrier', 'el catálogo deriva f: del type: sigue siendo una barrera, no un cofre');
  assert.equal(barrera.def, 'f:barrier');
  assert.ok(!R.sceneFor(sinTablero, PL, null).props.some((p) => p.type === 'barrier'), 'sigue sin llegar al jugador (gmOnly)');
});

// Ronda de arreglos 1, punto 3: SCENE_MAX_BYTES seguía sin tener test propio; con las piezas ya validadas, el relleno
// se cuela por las fichas (minis), que no sanean sus campos ajenos.
test('cleanMap: SCENE_MAX_BYTES sigue rechazando una escena demasiado grande', () => {
  const big = F.map(8, { minis: Array.from({ length: 500 }, () => ({ kind: 'knight', x: 0, z: 0, pad: 'x'.repeat(5000) })) });
  assert.equal(R.cleanMap(big), null);
});

// Ronda de arreglos 1, ruling R3b: cada camino que sanea o filtra una escena conoce las definiciones `p:` del tablero.
test('R3b: cleanMap(m, board) conserva las piezas p: del tablero (no se pierden en silencio)', () => {
  const board = boardConDosPiezas();
  const m = escenaConPiezasDeTablero(board);
  assert.equal(m.props.length, 2, 'ninguna de las dos piezas p: se pierde con el tablero a mano');
  assert.deepEqual(m.props.map((p) => p.def).sort(), ['p:cofre01', 'p:muro01']);
});

test('R3b: sceneFor(..., board) no manda al jugador una pieza p: con gmOnly', () => {
  const board = boardConDosPiezas();
  const m = escenaConPiezasDeTablero(board);
  assert.ok(R.sceneFor(m, GM, null, board).props.some((p) => p.def === 'p:muro01'), 'al director sí le llega');
  assert.ok(!R.sceneFor(m, PL, null, board).props.some((p) => p.def === 'p:muro01'), 'al jugador no');
});

test('R3b: campaignFor(..., board) filtra igual las piezas p: de cada escena', () => {
  const board = boardConDosPiezas();
  const m = escenaConPiezasDeTablero(board);
  const camp = R.campaignFor({ id: 'c1', name: 'C', boards: { a: { name: 'A', data: m } }, notes: {}, cur: 'a' }, PL, null, board);
  assert.ok(!camp.boards.a.data.props.some((p) => p.def === 'p:muro01'));
});

test('R3b: liveDocFor(..., board) filtra igual las piezas p: de la mesa en vivo', () => {
  const board = boardConDosPiezas();
  const m = escenaConPiezasDeTablero(board);
  const live = R.liveDocFor('board', { open: true, rev: 1, board: m }, PL, null, {}, board);
  assert.ok(!live.board.props.some((p) => p.def === 'p:muro01'));
});

test('R3b: gridOf(m, board) bloquea la casilla de una pieza p: (el cofre del tablero)', () => {
  const board = boardConDosPiezas();
  const m = escenaConPiezasDeTablero(board);
  const g = R.gridOf(m, board);
  assert.equal(g.open(1 * 8 + 2), false, 'p:cofre01 bloquea su casilla igual que uno de fábrica');
});
