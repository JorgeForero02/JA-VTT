'use strict';
/* t3d: el módulo del tablero 3D montado (modules/tablero3d, guía docs/08 de Tablero pixel):
   una mesa 3D guarda y lista sus escenas, y sus ajustes son los del tablero de JA-VTT */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const app = require('../server/app');

let base;
before(async () => {
  // resetSchema() borra `public` en cascada, lo que deja el esquema t3d sin sus claves ajenas: se rehace entero
  await db.pool.query('DROP SCHEMA IF EXISTS t3d CASCADE');
  await resetSchema();
  await app.prepare();
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => { await app.stop(); });

async function director(name) {
  const reg = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  const headers = { 'Content-Type': 'application/json', Cookie: reg.headers.get('set-cookie').split(';')[0] };
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
}

// una escena 3D mínima con la forma que manda el cliente del módulo (serialize)
const scene = (n = 8) => ({
  v: 1, name: 'Claro', w: n, d: n, h: '2'.repeat(n * n), t: 'g'.repeat(n * n), wsrc: '0'.repeat(n * n),
  props: [], roofs: [], start: [n >> 1, n >> 1], minis: [], env: 'day', ambient: 1, darkColor: '#0E1316', fog: false, seen: '',
});

test('t3d: una mesa 3D guarda y lista sus escenas; una mesa 2D no tiene rutas del 3D', async () => {
  const call = await director('Directora3d');
  const mesa3d = (await call('POST', '/api/boards', { name: 'Mesa 3D' })).data.board;
  const mesa2d = (await call('POST', '/api/boards', { name: 'Mesa 2D' })).data.board;
  assert.equal((await call('POST', `/api/t3d/boards/${mesa3d.id}`)).data.board.t3d, true);

  assert.deepEqual((await call('PUT', `/api/t3d/boards/${mesa3d.id}/scenes/claro`, scene())).data, { ok: true });
  const { scenes } = (await call('GET', `/api/t3d/boards/${mesa3d.id}/scenes`)).data;
  assert.deepEqual(scenes.map((s) => [s.id, s.name, s.w]), [['claro', 'Claro', 8]]);

  assert.equal((await call('GET', `/api/t3d/boards/${mesa2d.id}`)).data.board.t3d, false);
  assert.equal((await call('GET', `/api/t3d/boards/${mesa2d.id}/scenes`)).status, 404);
  const { boards } = (await call('GET', '/api/boards')).data;
  assert.deepEqual(boards.map((b) => [b.name, !!b.t3d]).sort(), [['Mesa 2D', false], ['Mesa 3D', true]]);
});

test('t3d: una mesa 3D lee y cambia los ajustes del tablero de JA-VTT', async () => {
  const call = await director('Director3d');
  const { board } = (await call('POST', '/api/boards', { name: 'Mesa 3D' })).data;
  assert.equal((await call('POST', `/api/t3d/boards/${board.id}`)).data.board.t3d, true);
  assert.equal((await call('GET', `/api/t3d/boards/${board.id}/settings`)).data.settings.diceEnabled, true);
  assert.equal((await call('PATCH', `/api/t3d/boards/${board.id}/settings`, { diceEnabled: false })).data.settings.diceEnabled, false);
  assert.equal((await db.q.board(board.id)).settings.diceEnabled, false, 'guardado en boards.settings de JA-VTT');
});
