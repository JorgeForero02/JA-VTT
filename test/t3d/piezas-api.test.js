'use strict';
/* API de definiciones de piezas del tablero (fase 0: sin pantalla todavía). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { t3dDb, resetSchema } = require('./helpers/db');
const { cuenta, llamar, mesa3d } = require('./helpers/mesa');
const R = require('../../modules/tablero3d/rules');
const F = require('./helpers/fixtures');
const app = require('../../server/app');

let base;
before(async () => { await resetSchema(); await app.prepare(); base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.stop(); });

const cofre = (id) => ({ schema: 1, id: 'p:' + id, name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
  shape: { w: 1, d: 1, height: 1, orient: true, layer: 'object' }, components: { move: { block: true }, sight: 'none', light: 'none' } });

test('piezas: el director guarda, lista y borra; el jugador sólo lee y no ve las gmOnly', async () => {
  const gm = await cuenta(base, 'PzGm'), pl = await cuenta(base, 'PzPl');
  const b = await mesa3d(base, gm, 'Piezas');
  await llamar(base, gm, 'POST', `/api/boards/${b.id}/members`, { name: 'PzPl' });
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/cofre01', cofre('cofre01'))).status, 200);
  assert.equal((await llamar(base, gm, 'PUT', url + '/muro01', Object.assign(cofre('muro01'), { components: { move: { block: true }, sight: 'none', light: 'none', gmOnly: true } }))).status, 200);
  assert.deepEqual((await llamar(base, gm, 'GET', url)).data.pieces.map((p) => p.id).sort(), ['p:cofre01', 'p:muro01']);
  assert.deepEqual((await llamar(base, pl, 'GET', url)).data.pieces.map((p) => p.id), ['p:cofre01'], 'el jugador no ve la gmOnly');
  assert.equal((await llamar(base, pl, 'PUT', url + '/x1', cofre('x1'))).status, 403);
  assert.equal((await llamar(base, gm, 'DELETE', url + '/cofre01')).status, 200);
  assert.deepEqual((await llamar(base, gm, 'GET', url)).data.pieces.map((p) => p.id), ['p:muro01']);
});

test('piezas: validación del cuerpo y el id de la ruta', async () => {
  const gm = await cuenta(base, 'PzGm2');
  const b = await mesa3d(base, gm, 'Validacion');
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/malo', { id: 'p:malo', class: 'nave' })).status, 400);
  assert.equal((await llamar(base, gm, 'PUT', url + '/otro', cofre('distinto'))).status, 400, 'el id del cuerpo tiene que ser el de la ruta');
  assert.equal((await llamar(base, gm, 'PUT', url + '/A-B', cofre('A-B'))).status, 400, 'id: minúsculas y cifras');
});

/* Ronda de arreglos 1, Menor 4: 300 piezas por tablero, sembradas directamente en la base (t3dDb) para que la
   prueba sea rápida; una 301.ª nueva no cabe, pero sustituir una de las 300 ya existentes sigue dando 200. */
test('piezas: tope de 300 por tablero; sustituir una ya colocada en el tope sigue dando 200', async () => {
  const gm = await cuenta(base, 'PzGm4');
  const b = await mesa3d(base, gm, 'Tope300');
  for (let i = 0; i < 300; i++) {
    const id = 'p:auto' + String(i).padStart(3, '0');
    await t3dDb.q.upsertPiece(b.id, id, 'Auto', Object.assign(cofre(String(id.slice(2))), { id }));
  }
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/nueva301', cofre('nueva301'))).status, 413, 'la 301.ª pieza nueva no cabe');
  assert.equal((await llamar(base, gm, 'PUT', url + '/auto000', cofre('auto000'))).status, 200, 'sustituir una de las 300 ya colocadas sí cabe');
});

/* Ronda de arreglos 1, «Importante 1b»: no se puede borrar una definición que sigue colocada en alguna escena
   guardada; en cuanto se quita de la escena (PUT sin ella), el DELETE ya funciona. */
test('piezas: no se puede borrar una definición colocada en el tablero (409); tras quitarla de la escena, sí (200)', async () => {
  const gm = await cuenta(base, 'PzGm5'), pl = await cuenta(base, 'PzPl5');
  const b = await mesa3d(base, gm, 'EnUso');
  await llamar(base, gm, 'POST', `/api/boards/${b.id}/members`, { name: 'PzPl5' });
  const pieces = `/api/t3d/boards/${b.id}/pieces`, scenes = `/api/t3d/boards/${b.id}/scenes`;
  await llamar(base, gm, 'PUT', pieces + '/muro01', Object.assign(cofre('muro01'), { components: { move: { block: true }, sight: 'none', light: 'none', gmOnly: true } }));
  const conPieza = F.map(8, { props: [{ type: 'obj:o_muro01', def: 'p:muro01', x: 1, z: 1 }] });
  assert.equal((await llamar(base, gm, 'PUT', scenes + '/colocada', conPieza)).status, 200);
  const del1 = await llamar(base, gm, 'DELETE', pieces + '/muro01');
  assert.deepEqual([del1.status, del1.data.error], [409, 'Esa pieza está colocada en el tablero: quítala de sus escenas antes de borrarla']);
  // sigue sin llegarle al jugador (gmOnly), esté o no colocada
  const vistaPl = (await llamar(base, pl, 'GET', scenes + '/colocada')).data.scene;
  assert.deepEqual(vistaPl.props.map((p) => p.def), []);
  await llamar(base, gm, 'PUT', scenes + '/colocada', F.map(8, { props: [] }));
  assert.equal((await llamar(base, gm, 'DELETE', pieces + '/muro01')).status, 200, 'sin colocar, el borrado ya funciona');
});

/* Ronda de arreglos 1, Menor 4: la cuota (q.boardUsage) cuenta las piezas colocadas en el tablero. */
test('cuota: boardUsage cuenta las piezas del tablero por su tamaño', async () => {
  const gm = await cuenta(base, 'PzGm6');
  const b = await mesa3d(base, gm, 'CuotaPiezas');
  const def = cofre('cofre01');
  assert.equal((await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/pieces/cofre01`, def)).status, 200);
  const usage = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/usage`)).data.usage;
  assert.equal(usage.bytes, R.docBytes(R.cleanPiece(def)), 'los bytes de la definición guardada cuentan en la cuota del tablero');
});

test('piezas: una escena con una pieza del tablero se guarda; con una que no existe, se descarta esa pieza', async () => {
  const gm = await cuenta(base, 'PzGm3');
  const b = await mesa3d(base, gm, 'Escena');
  await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/pieces/cofre01`, cofre('cofre01'));
  const map = F.map(8, { props: [{ type: 'obj:o_cofre01', def: 'p:cofre01', x: 1, z: 1 }, { type: 'obj:o_nada0001', def: 'p:nada0001', x: 2, z: 2 }] });
  assert.equal((await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/scenes/sc1`, map)).status, 200);
  const sc = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/scenes/sc1`)).data.scene;
  assert.deepEqual(sc.props.map((p) => p.def), ['p:cofre01']);
});
