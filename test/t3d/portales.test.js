'use strict';
/* T6b: puertas con llave y playersDoors, ajustes del tablero 3D, portales entre escenas (REST y mesa en vivo), reunir al
   grupo y portales sin destino al borrar una escena. Contra el servidor real (núcleo + módulo) y PostgreSQL. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const F = require('./helpers/fixtures');
const R = require('../../modules/tablero3d/rules');
const app = require('../../server/app');

let base;
before(async () => {
  await resetSchema();
  await app.prepare();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
});
after(async () => { await app.stop(); });

async function account(name) {
  const res = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  const data = await res.json();
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: data.user };
}
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: who.cookie }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
async function mesa(prefix) {
  const gm = await account(prefix + 'Gm');
  const pl = await account(prefix + 'Pl');
  const b = (await call(gm, 'POST', '/api/boards', { name: 'Mesa ' + prefix })).data.board;
  await call(gm, 'POST', `/api/t3d/boards/${b.id}`); // JA-VTT: marca el tablero como mesa 3D (aquí, un tablero recién creado no lo es)
  const code = (await call(gm, 'GET', `/api/boards/${b.id}`)).data.board.invite_code;
  await call(pl, 'POST', '/api/join', { code });
  return { gm, pl, b, url: `/api/t3d/boards/${b.id}` };
}
let reqId = 0;
const liveMsg = (key, op, data) => ({ t: 'live', req: ++reqId, key, op, data });
const reqMsg = (t, data) => Object.assign({ t, req: ++reqId }, data);

/* dos escenas: el pueblo (8×8) con un portal en (4,4) hacia la cueva, y la cueva (8×8) con muros y su portal de vuelta en el muro norte */
function pueblo(extra = {}) {
  return F.map(8, Object.assign({ name: 'Pueblo', minis: [
    { kind: 'knight', x: 4, z: 5, id: 'k1', sheet: { kind: 'player' } },
    { kind: 'mage', x: 1, z: 1, id: 'k2', sheet: { kind: 'player' } },
    { kind: 'goblin', x: 6, z: 6, id: 'g1', sheet: { kind: 'enemy' } }],
  props: [{ type: 'portal', x: 4, z: 4, id: 1, look: 'stairs', target: { scene: 'cueva', portal: 7 } }] }, extra));
}
function cueva() {
  const t = [...'s'.repeat(64)];
  for (let x = 0; x < 8; x++) t[8 + x] = 'w';
  t[8 + 3] = 's';
  return F.map(8, { name: 'Cueva', t: t.join(''), start: [3, 5], minis: [], props: [{ type: 'portal', x: 3, z: 1, id: 7, look: 'cave', target: { scene: 'pueblo', portal: 1 } }] });
}
async function escenas(gm, url) {
  assert.equal((await call(gm, 'PUT', `${url}/scenes/pueblo`, pueblo())).status, 200);
  assert.equal((await call(gm, 'PUT', `${url}/scenes/cueva`, cueva())).status, 200);
}

test('ajustes del tablero 3D: los de JA-VTT por defecto; sólo el director los cambia y la mesa abierta se entera', async () => {
  const { gm, pl, b, url } = await mesa('Aj');
  const D = R.DEFAULT_SETTINGS, off = Object.assign({}, D, { playersDoors: false });
  assert.deepEqual((await call(pl, 'GET', `${url}/settings`)).data, { settings: D });
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened;
  assert.deepEqual((await p.next((m) => m.t === 'state')).settings, D, 'llegan con el estado');
  assert.equal((await call(pl, 'PATCH', `${url}/settings`, { playersDoors: false })).status, 403);
  assert.deepEqual((await call(gm, 'PATCH', `${url}/settings`, { playersDoors: false, raro: 1 })).data, { settings: off });
  assert.deepEqual((await p.next((m) => m.t === 'settings')).settings, off);
  assert.deepEqual((await call(gm, 'PATCH', `${url}/settings`, { playersDoors: 'sí' })).data.settings, off, 'lo que no es booleano no cambia nada');
  assert.equal((await call(gm, 'GET', `${url}/settings`)).data.settings.playersDoors, false, 'se guarda');
  assert.equal((await call(gm, 'POST', `${url}/settings`, {})).status, 404);
  await p.close();
});

test('puertas en la mesa en vivo: el jugador no abre la de llave ni ninguna con playersDoors apagado; el director sí', async () => {
  const { gm, pl, b, url } = await mesa('Pu');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; await p.next((m) => m.t === 'state');
  const props = [{ type: 'door', x: 1, z: 1, v: 0 }, { type: 'door', x: 2, z: 2, v: 0, locked: true }];
  g.send(liveMsg('board', 'set', { open: true, rev: 1, board: F.map(8, { props }) })); await g.next((m) => m.t === 'ack');
  g.send(liveMsg('doors', 'set', { d: {} })); await g.next((m) => m.t === 'ack');
  p.send(liveMsg('doors', 'update', { d: { '1_1': 1 } }));
  assert.equal((await p.next((m) => m.t === 'ack')).ok, true);
  p.send(liveMsg('doors', 'update', { d: { '2_2': 1 } }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /llave/);
  await call(gm, 'PATCH', `${url}/settings`, { playersDoors: false });
  await p.next((m) => m.t === 'settings');
  p.send(liveMsg('doors', 'update', { d: { '1_1': 0 } }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /no deja/);
  g.send(liveMsg('doors', 'update', { d: { '2_2': 1 } }));
  assert.equal((await g.next((m) => m.t === 'ack')).ok, true, 'el director abre la de llave');
  await p.close(); await g.close();
});

test('portales: la lista de una escena (como /scenes/:id/portals de JA-VTT) y, al borrar una escena, los que llevaban allí se quedan sin destino', async () => {
  const { gm, pl, url } = await mesa('Po');
  await escenas(gm, url);
  const list = (await call(pl, 'GET', `${url}/scenes/cueva/portals`)).data;
  assert.deepEqual(list, { scene: { id: 'cueva', name: 'Cueva' }, portals: [{ id: 7, name: '', look: 'cave', target: { scene: 'pueblo', portal: 1 } }] });
  assert.equal((await call(pl, 'GET', `${url}/scenes/nada/portals`)).status, 404);
  const before = (await call(gm, 'GET', `${url}/scenes`)).data.scenes.map((s) => s.id);
  assert.equal((await call(gm, 'DELETE', `${url}/scenes/cueva`)).status, 200);
  const town = (await call(gm, 'GET', `${url}/scenes/pueblo`)).data.scene;
  assert.equal(town.props[0].target, null, 'el portal del pueblo ya no lleva a la cueva borrada');
  assert.deepEqual((await call(gm, 'GET', `${url}/scenes`)).data.scenes.map((s) => s.id), before.filter((id) => id !== 'cueva'), 'y la escena no pasa a ser «la última guardada»');
});

test('portales fuera de la mesa en vivo: el director cruza con una ficha o reúne al grupo; el servidor guarda las dos escenas', async () => {
  const { gm, pl, url } = await mesa('Vi');
  await escenas(gm, url);
  const body = { from: 'pueblo', map: pueblo(), portal: 1, tokens: ['k1'] };
  assert.equal((await call(pl, 'POST', `${url}/travel`, body)).status, 403, 'el jugador cruza en la mesa en vivo');
  assert.equal((await call(gm, 'POST', `${url}/travel`, { from: '../x', map: pueblo(), portal: 1 })).status, 400);
  assert.match((await call(gm, 'POST', `${url}/travel`, Object.assign({}, body, { portal: 9 }))).data.error, /no lleva/);
  assert.match((await call(gm, 'POST', `${url}/travel`, { from: 'pueblo', map: pueblo() })).data.error, /Elige la escena/);
  assert.equal((await call(gm, 'POST', `${url}/travel`, { from: 'pueblo', map: pueblo(), to: 'nada' })).status, 404);
  const r = (await call(gm, 'POST', `${url}/travel`, body)).data;
  assert.deepEqual([r.moved, r.left, r.scene.id], [['k1'], [], 'cueva']);
  const k1 = r.scene.minis.find((q) => q.id === 'k1');
  assert.deepEqual([k1.x, k1.z], [3, 2], 'llega junto al portal de la cueva, por dentro');
  const town = (await call(gm, 'GET', `${url}/scenes/pueblo`)).data.scene;
  assert.deepEqual(town.minis.map((q) => q.id), ['k2', 'g1'], 'y deja el pueblo');
  // reunir al grupo en la cueva: la maga va con el caballero; el goblin se queda
  const g = (await call(gm, 'POST', `${url}/travel`, { from: 'pueblo', map: town, to: 'cueva', all: true })).data;
  assert.deepEqual(g.moved, ['k2']);
  assert.deepEqual((await call(gm, 'GET', `${url}/scenes/cueva`)).data.scene.minis.map((q) => q.id), ['k1', 'k2']);
});

test('portales en la mesa en vivo: el jugador pide cruzar y el director decide; al cruzar, la mesa pasa a la otra escena', async () => {
  const { gm, pl, b, url } = await mesa('Mv');
  await escenas(gm, url);
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; await p.next((m) => m.t === 'state');
  p.send(reqMsg('travel', { portal: 1, tokens: ['k1'] }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /no está abierta/);
  const town = pueblo(); const tokens = {};
  for (const q of town.minis) tokens[q.id] = Object.assign(F.token(q.id === 'k1' ? pl.user.id : null), { kind: q.kind, x: q.x, z: q.z, sheet: q.sheet });
  delete town.minis;
  g.send(liveMsg('board', 'set', { open: true, rev: 1, board: town })); await g.next((m) => m.t === 'ack');
  g.send(liveMsg('tokens', 'set', { tokens })); await g.next((m) => m.t === 'ack');
  g.send(reqMsg('travel', { portal: 1, tokens: ['k1'] }));
  assert.match((await g.next((m) => m.t === 'ack')).error, /Guarda la escena/, 'la mesa tiene que mostrar una escena guardada');
  g.send(liveMsg('board', 'set', { open: true, rev: 2, scene: 'pueblo', board: town })); await g.next((m) => m.t === 'ack');
  // el jugador: sólo con lo suyo, junto al portal, y la decisión es del director
  p.send(reqMsg('travel', { portal: 1, tokens: ['k2'] }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /propios/);
  p.send(reqMsg('travel', { portal: 3, tokens: ['k1'] }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /no lleva/);
  p.send(reqMsg('gather', { scene: 'cueva' }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /director/);
  p.send(reqMsg('travel', { portal: 1, tokens: ['k1'] }));
  const asked = await p.next((m) => m.t === 'ack');
  assert.deepEqual([asked.ok, asked.asked], [true, true]);
  const ask = await g.next((m) => m.t === 'msg' && m.topic === 'travelAsk');
  assert.deepEqual([ask.data, ask.by], [{ portal: 1, token: 'k1', scene: 'cueva' }, String(pl.user.id)]);
  assert.ok(await p.silence((m) => m.t === 'doc' && m.key === 'board' && m.data.scene === 'cueva'), 'el jugador solo no mueve la mesa');
  // lejos del portal no puede pedirlo
  g.send(liveMsg('tokens', 'update', { tokens: { k1: Object.assign({}, tokens.k1, { x: 0, z: 7 }) } })); await g.next((m) => m.t === 'ack');
  p.send(reqMsg('travel', { portal: 1, tokens: ['k1'] }));
  assert.match((await p.next((m) => m.t === 'ack')).error, /Acércate/);
  // el director cruza con el caballero: la mesa pasa a la cueva y el goblin y la maga se quedan guardados en el pueblo
  g.send(reqMsg('travel', { portal: 1, tokens: ['k1'] }));
  const done = await g.next((m) => m.t === 'ack');
  assert.deepEqual([done.ok, done.moved], [true, ['k1']]);
  const board = await p.next((m) => m.t === 'doc' && m.key === 'board' && m.data.scene === 'cueva');
  assert.equal(board.data.board.name, 'Cueva');
  const tk = (await p.next((m) => m.t === 'doc' && m.key === 'tokens' && !m.data.tokens.g1)).data.tokens;
  assert.deepEqual([Object.keys(tk), tk.k1.x, tk.k1.z, tk.k1.owner], [['k1'], 3, 2, String(pl.user.id)], 'llega junto al portal y sigue siendo del jugador');
  assert.deepEqual((await call(gm, 'GET', `${url}/scenes/pueblo`)).data.scene.minis.map((q) => q.id), ['k2', 'g1']);
  // reunir al grupo: la mesa vuelve al pueblo con todas las fichas del bando Jugador
  g.send(reqMsg('gather', { scene: 'pueblo' }));
  assert.deepEqual((await g.next((m) => m.t === 'ack')).moved, ['k1']);
  const back = await p.next((m) => m.t === 'doc' && m.key === 'tokens' && m.data.tokens.k1 && m.data.tokens.k2);
  assert.deepEqual(Object.keys(back.data.tokens).sort(), ['g1', 'k1', 'k2']);
  g.send(reqMsg('gather', { scene: '../' }));
  assert.match((await g.next((m) => m.t === 'ack')).error, /Elige/);
  g.send(reqMsg('gather', { scene: 'nada' }));
  assert.match((await g.next((m) => m.t === 'ack')).error, /ya no existe/);
  // al borrar la cueva, el portal de la mesa abierta se queda sin destino y todos se enteran
  await call(gm, 'DELETE', `${url}/scenes/cueva`);
  const cleared = await p.next((m) => m.t === 'doc' && m.key === 'board' && m.data.board.props.every((q) => q.type !== 'portal' || !q.target));
  assert.equal(cleared.data.scene, 'pueblo');
  await p.close(); await g.close();
});
