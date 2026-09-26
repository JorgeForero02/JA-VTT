'use strict';
/* T3d: escenas, dibujos y campañas por la API REST del módulo, contra una mesa 3D real de JA-VTT
   (creada con mesa3d(), como el selector de «Nuevo tablero»). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const F = require('./helpers/fixtures');
const { cuenta, llamar, mesa3d } = require('./helpers/mesa');
const app = require('../../server/app');

let base;
before(async () => {
  await resetSchema();
  await app.prepare();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
});
after(async () => { await app.stop(); });

async function boardWithPlayer(prefix) {
  const gm = await cuenta(base, prefix + 'Gm');
  const pl = await cuenta(base, prefix + 'Pl');
  const b = await mesa3d(base, gm, 'Mesa ' + prefix);
  const info = await llamar(base, gm, 'GET', `/api/boards/${b.id}`);
  await llamar(base, pl, 'POST', '/api/join', { code: info.data.board.invite_code });
  return { gm, pl, b };
}

test('escenas: el director guarda, lista, abre y borra; el jugador sólo lee', async () => {
  const { gm, pl, b } = await boardWithPlayer('E');
  const url = `/api/t3d/boards/${b.id}/scenes`;
  assert.equal((await llamar(base, gm, 'PUT', `${url}/b1`, F.map(8))).status, 200);
  assert.equal((await llamar(base, gm, 'PUT', `${url}/b2`, F.map(16, { name: 'Cueva' }))).status, 200);
  const list = (await llamar(base, pl, 'GET', url)).data.scenes;
  assert.deepEqual(list.map((s) => s.id), ['b2', 'b1']);
  assert.equal(list[0].name, 'Cueva');
  assert.equal(list[0].h.length, 256);
  assert.ok(list[0].updated > 0);
  assert.equal((await llamar(base, pl, 'GET', `${url}/b1`)).data.scene.w, 8);
  assert.equal((await llamar(base, pl, 'GET', `${url}/b9`)).status, 404);
  assert.equal((await llamar(base, pl, 'PUT', `${url}/b3`, F.map(8))).status, 403);
  assert.equal((await llamar(base, gm, 'PUT', `${url}/b3`, { w: 2 })).status, 400);
  assert.equal((await llamar(base, gm, 'PUT', `${url}/a.b`, F.map(8))).status, 400);
  assert.equal((await llamar(base, gm, 'POST', url, F.map(8))).status, 404);
  assert.equal((await llamar(base, gm, 'DELETE', `${url}/b1`)).status, 200);
  assert.equal((await llamar(base, gm, 'GET', url)).data.scenes.length, 1);
  assert.equal((await llamar(base, gm, 'GET', '/api/boards')).data.boards[0].scenes, 1);
  const usage = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/usage`)).data.usage;
  assert.ok(usage.bytes > 0 && usage.quota > usage.bytes);
});

test('dibujos: se guardan con capas y vuelven en el formato del cliente', async () => {
  const { gm, pl, b } = await boardWithPlayer('D');
  const url = `/api/t3d/boards/${b.id}/drawings`;
  assert.equal((await llamar(base, gm, 'PUT', `${url}/c_heroe1`, F.drawing('c_heroe1', 2))).status, 200);
  const [rec] = (await llamar(base, pl, 'GET', url)).data.drawings;
  assert.equal(rec.key, 'c_heroe1');
  assert.equal(rec.layers.length, 2);
  assert.equal(rec.layers[0].sheet, F.PNG_1x1);
  assert.equal(rec.layers[1].vis, false);
  assert.equal(rec.charSize, 'medium', 'un personaje sin tamaño es Mediano');
  assert.equal((await llamar(base, gm, 'PUT', `${url}/c_ogro1`, Object.assign(F.drawing('c_ogro1'), { charSize: 'large', w: 64, h: 96 }))).status, 200);
  assert.equal((await llamar(base, pl, 'GET', url)).data.drawings.find((x) => x.key === 'c_ogro1').charSize, 'large', 'el tamaño del arte vuelve al cliente');
  assert.equal((await llamar(base, gm, 'DELETE', `${url}/c_ogro1`)).status, 200);
  // las casillas usan claves con «:» (g:top); el id de la URL va saneado (g_top) y la clave vuelve intacta
  const tile = Object.assign(F.drawing('g:top'), { kind: 'tile', target: 'g:top' });
  assert.equal((await llamar(base, gm, 'PUT', `${url}/g_top`, tile)).status, 200);
  const back = (await llamar(base, pl, 'GET', url)).data.drawings.find((x) => x.target === 'g:top');
  assert.equal(back.key, 'g:top');
  await llamar(base, gm, 'DELETE', `${url}/g_top`);
  // un objeto que da luz guarda dónde está la luz; las capas, su opacidad y bloqueo (migración 002)
  const farol = Object.assign(F.drawing('o_farol1', 2), { kind: 'obj', target: 'new', light: true, count: 12, cols: 12, lightSpec: { px: 4, py: 5, s: 9, r: 7, c: '#88ccff', f: 0 } });
  farol.layers[1].op = 40; farol.layers[1].lock = true;
  assert.equal((await llamar(base, gm, 'PUT', `${url}/o_farol1`, farol)).status, 200);
  const lit = (await llamar(base, pl, 'GET', url)).data.drawings.find((x) => x.key === 'o_farol1');
  assert.deepEqual(lit.lightSpec, { px: 4, py: 5, s: 9, r: 7, c: '#88ccff', f: 0 });
  assert.deepEqual(lit.layers.map((l) => [l.op, l.lock]), [[100, false], [40, true]]);
  await llamar(base, gm, 'DELETE', `${url}/o_farol1`);
  assert.equal((await llamar(base, gm, 'PUT', `${url}/malo`, { kind: 'x' })).status, 400);
  assert.equal((await llamar(base, pl, 'DELETE', `${url}/c_heroe1`)).status, 403);
  assert.equal((await llamar(base, gm, 'DELETE', `${url}/c_heroe1`)).status, 200);
  assert.equal((await llamar(base, gm, 'GET', url)).data.drawings.length, 0);
});

test('campañas: se guardan saneadas y se listan', async () => {
  const { gm, pl, b } = await boardWithPlayer('C');
  const url = `/api/t3d/boards/${b.id}/campaigns`;
  assert.equal((await llamar(base, gm, 'PUT', `${url}/cbrezo`, F.campaign('cbrezo'))).status, 200);
  const [c] = (await llamar(base, pl, 'GET', url)).data.campaigns;
  assert.equal(c.id, 'cbrezo');
  assert.deepEqual(Object.keys(c.boards).sort(), ['tcueva', 'tpueblo']);
  assert.equal((await llamar(base, gm, 'PUT', `${url}/cmal`, { boards: {} })).status, 400);
  assert.equal((await llamar(base, gm, 'DELETE', `${url}/cbrezo`)).status, 200);
});
