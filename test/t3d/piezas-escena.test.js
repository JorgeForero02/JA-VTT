'use strict';
/* Escenas en el servidor tras la fase 0: una escena vieja se completa sin perder nada, cada pieza se valida contra su
   definición, al jugador no le llegan las barreras (gmOnly) y las puertas guardan también open/locked (volver atrás). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../modules/tablero3d/rules');
const F = require('./helpers/fixtures');
const GM = { role: 'gm', user_id: '1' }, PL = { role: 'player', user_id: '2' };

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

test('llegada por portal: la rejilla sale del catálogo (el puente se pisa; el cofre no)', () => {
  const m = R.cleanMap(F.map(8, { props: [{ type: 'bridge', x: 1, z: 1 }, { type: 'chest', x: 2, z: 1 }] }));
  const g = R.gridOf(m);
  assert.equal(g.open(1 * 8 + 1), true);
  assert.equal(g.open(1 * 8 + 2), false);
});
