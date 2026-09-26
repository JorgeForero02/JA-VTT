'use strict';
/* API de definiciones de piezas del tablero (fase 0: sin pantalla todavía). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const { cuenta, llamar, mesa3d } = require('./helpers/mesa');
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

test('piezas: validación, id de la ruta y tope por tablero', async () => {
  const gm = await cuenta(base, 'PzGm2');
  const b = await mesa3d(base, gm, 'Topes');
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/malo', { id: 'p:malo', class: 'nave' })).status, 400);
  assert.equal((await llamar(base, gm, 'PUT', url + '/otro', cofre('distinto'))).status, 400, 'el id del cuerpo tiene que ser el de la ruta');
  assert.equal((await llamar(base, gm, 'PUT', url + '/A-B', cofre('A-B'))).status, 400, 'id: minúsculas y cifras');
});

test('piezas: una escena con una pieza del tablero se guarda; con una que no existe, se descarta esa pieza', async () => {
  const gm = await cuenta(base, 'PzGm3');
  const b = await mesa3d(base, gm, 'Escena');
  await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/pieces/cofre01`, cofre('cofre01'));
  const F = require('./helpers/fixtures');
  const map = F.map(8, { props: [{ type: 'obj:o_cofre01', def: 'p:cofre01', x: 1, z: 1 }, { type: 'obj:o_nada0001', def: 'p:nada0001', x: 2, z: 2 }] });
  assert.equal((await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/scenes/sc1`, map)).status, 200);
  const sc = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/scenes/sc1`)).data.scene;
  assert.deepEqual(sc.props.map((p) => p.def), ['p:cofre01']);
});
