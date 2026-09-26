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
// I1 (ola final): la de `def` p: sin resolver ya no se descarta: se conserva opaca (sin el trato de barrera ni de puerta).
test('cleanProp: un `def` p: sin resolver deja la pieza opaca (sin trato de fábrica); uno que no es p: lo deriva el catálogo del `type`', () => {
  const sinTablero = R.cleanMap(F.map(8, { props: [
    { type: 'barrier', x: 1, z: 1, def: 'p:zzzz' },
    { type: 'door', x: 2, z: 1, def: 'p:zzzz', open: true, locked: true },
    { type: 'barrier', x: 3, z: 1, def: 'f:chest' },
  ] }));
  assert.equal(sinTablero.props.length, 3, 'ninguna se pierde');
  const [op1, op2] = sinTablero.props;
  assert.deepEqual([op1.def, op2.def], ['p:zzzz', 'p:zzzz'], 'las dos opacas conservan su def');
  assert.deepEqual(Object.keys(op2).sort(), ['def', 'type', 'uid', 'v', 'x', 'z'], 'opaca: sin open/locked (no es una puerta de fábrica)');
  const barrera = sinTablero.props[2];
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

// Tarea 7, ronda de arreglos 1 (menor 2): una definición de terreno (f:g, f:w… o una p: de clase terrain) no es una pieza
// que se coloque en `props`: el terreno vive en las letras de M.t. Antes `cleanProp` la aceptaba porque defOf la resolvía.
test('cleanProp: una pieza cuyo tipo es un terreno (f:g, f:w o p: de clase terrain) se descarta', () => {
  const board = new Map([['p:suelo01', Catalogo.validateDef({
    id: 'p:suelo01', schema: 1, class: 'terrain', art: { base: 'suelo01' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'ground', low: false },
    components: { move: { block: false }, sight: 'none', light: 'none' },
  })]]);
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'g', x: 1, z: 1 }, { type: 'w', x: 2, z: 1 }, { type: 'suelo01', def: 'p:suelo01', x: 3, z: 1 }, { type: 'chest', x: 4, z: 1 },
  ] }), board);
  assert.deepEqual(m.props.map((p) => p.type), ['chest'], 'sólo queda el cofre');
});

// Ruling R18: al jugador no le llegan las barreras (gmOnly), pero sí las casillas que bloquean el paso (`blockCells`,
// índices z*w+x ordenados y sin repetir), sin tipo, arte ni uid; así su cliente sigue sin poder cruzarlas (como antes de T4).
test('R18: el jugador recibe blockCells con las casillas de la barrera y ninguna pieza barrier; el director no', () => {
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'barrier', x: 0, z: 7 }, { type: 'barrier', x: 3, z: 2 }, { type: 'barrier', x: 3, z: 2, v: 1 }, { type: 'chest', x: 5, z: 5 },
  ] }));
  const pl = R.sceneFor(m, PL, null);
  assert.deepEqual(pl.blockCells, [2 * 8 + 3, 7 * 8 + 0], 'ordenadas y sin repetir; el cofre (no gmOnly) no cuenta');
  assert.ok(!pl.props.some((p) => p.type === 'barrier'));
  assert.ok(!JSON.stringify(pl).includes('barrier'), 'ni el tipo ni nada de la barrera');
  assert.equal(R.sceneFor(m, GM, null).blockCells, undefined, 'el director tiene las piezas: sin blockCells');
  assert.equal(R.sceneFor(R.cleanMap(F.map(8, { props: [{ type: 'chest', x: 5, z: 5 }] })), PL, null).blockCells, undefined, 'sin barreras: sin campo');
  const camp = R.campaignFor({ id: 'c1', name: 'C', boards: { a: { name: 'A', data: m } }, notes: {}, cur: 'a' }, PL, null);
  assert.deepEqual(camp.boards.a.data.blockCells, pl.blockCells, 'también en campañas');
  const live = R.liveDocFor('board', { open: true, rev: 1, board: m }, PL, null, {});
  assert.deepEqual(live.board.blockCells, pl.blockCells, 'y en la mesa en vivo');
});

test('R18: una p: gmOnly que bloquea (con su tamaño y giro) sale en blockCells; una gmOnly que no bloquea, no', () => {
  const board = boardConDosPiezas();
  board.set('p:valla02', Catalogo.validateDef({
    id: 'p:valla02', schema: 1, class: 'wall', art: { base: 'valla02' },
    shape: { w: 2, d: 1, height: 1, orient: true, random: false, layer: 'wall', low: false },
    components: { move: { block: true }, sight: 'none', light: 'none', gmOnly: true },
  }));
  board.set('p:marca01', Catalogo.validateDef({
    id: 'p:marca01', schema: 1, class: 'object', art: { base: 'marca01' },
    shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'object', low: false },
    components: { move: { block: false }, sight: 'none', light: 'none', gmOnly: true },
  }));
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'muro01', def: 'p:muro01', x: 1, z: 1 }, { type: 'cofre01', def: 'p:cofre01', x: 2, z: 1 },
    { type: 'valla02', def: 'p:valla02', x: 4, z: 4 }, { type: 'valla02', def: 'p:valla02', x: 6, z: 5, v: 1 },
    { type: 'marca01', def: 'p:marca01', x: 0, z: 0 },
  ] }), board);
  assert.equal(m.props.length, 5);
  const pl = R.sceneFor(m, PL, null, board);
  assert.deepEqual(pl.blockCells, [1 * 8 + 1, 4 * 8 + 4, 4 * 8 + 5, 5 * 8 + 6, 6 * 8 + 6], 'muro01 1×1; valla 2×1 y girada 1×2; ni el cofre ni la marca');
  assert.deepEqual(pl.props.map((p) => p.def), ['p:cofre01']);
});

test('R18: blockCells es derivado: cleanMap no lo conserva', () => {
  const m = R.cleanMap(Object.assign(F.map(8, { props: [{ type: 'barrier', x: 1, z: 1 }] }), { blockCells: [0, 1, 2] }));
  assert.equal(m.blockCells, undefined);
  assert.equal(R.cleanMap(R.sceneFor(m, PL, null)).blockCells, undefined, 'ni aunque vuelva la vista del jugador');
});

/* Ola final, I3 (Ruling R20): una puerta p: tiene estado como la de fábrica. Una gmOnly abierta no bloquea: no sale en blockCells. */
test('I3: una puerta p: gmOnly abierta no sale en blockCells; cerrada, sí', () => {
  const def = Catalogo.validateDef({ schema: 1, id: 'p:secreta01', name: 'Secreta', class: 'wall', art: { base: 'o_sec' },
    shape: { w: 1, d: 1, height: 1, orient: true, layer: 'wall' },
    components: { move: { block: true }, sight: 'block', light: 'block', door: {}, gmOnly: true } });
  const board = new Map([[def.id, def]]);
  const m = R.cleanMap(F.map(8, { props: [{ type: 'o_sec', def: def.id, x: 1, z: 1, open: true }, { type: 'o_sec', def: def.id, x: 3, z: 1 }] }), board);
  assert.deepEqual(m.props.map((p) => [p.state, p.open]), [[{ open: true, locked: false }, true], [{ open: false, locked: false }, false]], 'estado y espejo');
  assert.deepEqual(R.sceneFor(m, PL, null, board).blockCells, [1 * 8 + 3], 'sólo la cerrada');
});

/* Ola final, I4: una pieza p: con type 'portal', 'door' o 'light' no recibe el trato de fábrica (cleanWallProp,
   cleanLightProp, id de portal, espejo de puerta, cruces), sólo lo que diga su definición. */
test('I4: piezas p: con type portal/door/light no se tratan como las de fábrica', () => {
  const def = Catalogo.validateDef({ schema: 1, id: 'p:cosa01', name: 'Cosa', class: 'object', art: { base: 'o_cosa' },
    shape: { w: 1, d: 1, height: 1, orient: true, layer: 'object' }, components: { move: { block: true }, sight: 'none', light: 'none' } });
  const board = new Map([[def.id, def]]);
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'portal', def: def.id, x: 1, z: 1, id: 5, look: 'magic', target: { scene: 'otra', portal: 1 } },
    { type: 'door', def: def.id, x: 2, z: 1, open: true, locked: true },
    { type: 'light', def: def.id, x: 3, z: 1, preset: 'torch', r: 8, h: 1 },
    { type: 'stairs', def: def.id, x: 4, z: 1, to: 'cabajo', tx: 1, tz: 1 },
    { type: 'portal', x: 5, z: 1, look: 'door' },
  ] }), board);
  const [pt, dr, lt, st, real] = m.props;
  assert.deepEqual(Object.keys(pt).sort(), ['def', 'type', 'uid', 'v', 'x', 'z'], 'el portal p: no tiene id, look ni target');
  assert.deepEqual(Object.keys(dr).sort(), ['def', 'type', 'uid', 'v', 'x', 'z'], 'la puerta p: (sin componente door) no guarda open/locked');
  assert.deepEqual(Object.keys(lt).sort(), ['def', 'type', 'uid', 'v', 'x', 'z'], 'la luz p: no pasa por cleanLightProp');
  assert.deepEqual([st.type, st.def], ['stairs', def.id], 'la escalera p: no se convierte en portal');
  assert.equal(real.id, 1, 'el único portal de fábrica toma el id 1 (el p: no cuenta)');
  assert.equal(R.portalIn(m, 5), null, 'el p: no es un portal al que llegar');
  assert.equal(R.clearPortalsTo(Object.assign({}, m, { props: [Object.assign({}, pt, { target: { scene: 'otra' } })] }), 'otra'), false, 'ni se le quita destino');
  assert.deepEqual(R.fixPortalIds([{ type: 'portal', def: def.id, x: 0, z: 0 }]), [{ type: 'portal', def: def.id, x: 0, z: 0 }], 'fixPortalIds no le pone id');
});

/* Ola final, M1: uid repetidos → el mismo resultado en dos guardados (determinista, en los dos lados con Catalogo.dedupeUids). */
test('M1: el mismo mapa con uid repetidos da los mismos uid en dos guardados', () => {
  const raw = () => F.map(8, { props: [{ type: 'chest', x: 1, z: 1, uid: 'uaaaaaaaa' }, { type: 'barrel', x: 2, z: 1, uid: 'uaaaaaaaa' }, { type: 'crates', x: 3, z: 1, uid: 'uaaaaaaaa' }] });
  const a = R.cleanMap(raw()), b = R.cleanMap(raw());
  assert.deepEqual(a.props.map((p) => p.uid), b.props.map((p) => p.uid));
  assert.equal(a.props[0].uid, 'uaaaaaaaa', 'el primero conserva el suyo');
  assert.equal(new Set(a.props.map((p) => p.uid)).size, 3);
});
