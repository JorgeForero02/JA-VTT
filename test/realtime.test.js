'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const app = require('../server/app');

let base, gmCookie, playerCookie, boardId, sceneId;

async function session(name) {
  await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  return res.headers.get('set-cookie').split(';')[0];
}
const json = (cookie, method, path, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }).then((r) => r.json());

before(async () => {
  await resetSchema();
  await app.prepare();
  base = `http://127.0.0.1:${await app.listen(0)}`;
  gmCookie = await session('Directora');
  playerCookie = await session('Jugador');
  const created = await json(gmCookie, 'POST', '/api/boards', { name: 'Mesa viva' });
  boardId = created.board.id;
  const detail = await json(gmCookie, 'GET', `/api/boards/${boardId}`);
  await json(playerCookie, 'POST', '/api/join', { code: detail.board.invite_code });
  sceneId = (await db.q.board(boardId)).active_scene;
});
after(async () => { await app.stop(); });

const isOps = (m) => m.t === 'ops';
const isState = (m) => m.t === 'state';

test('sin cookie el WebSocket se rechaza; sin pertenecer al tablero, se expulsa', async () => {
  const anon = connect(base, boardId, '');
  await assert.rejects(anon.opened);
  const stranger = await session('Extraño');
  const c = connect(base, boardId, stranger);
  await c.opened;
  const err = await c.next((m) => m.t === 'error');
  assert.match(err.error, /No perteneces/);
});

test('al conectar cada cliente recibe su estado y la lista de conectados', async () => {
  const gm = connect(base, boardId, gmCookie);
  await gm.opened;
  const state = await gm.next(isState);
  assert.equal(state.role, 'gm');
  assert.equal(state.scene.id, sceneId);
  assert.equal(state.board.invite_code.length, 6);
  const player = connect(base, boardId, playerCookie);
  await player.opened;
  const ps = await player.next(isState);
  assert.equal(ps.role, 'player');
  assert.equal(ps.board.invite_code, undefined);
  const scenes = await gm.next((m) => m.t === 'scenes' && m.online.length === 2);
  assert.deepEqual(scenes.online.map((u) => u.name).sort(), ['Directora', 'Jugador']);
  await gm.close(); await player.close();
});

test('un cambio del director llega al jugador en la misma escena; se persiste en la base', async () => {
  const gm = connect(base, boardId, gmCookie);
  const player = connect(base, boardId, playerCookie);
  await gm.opened; await player.opened;
  await gm.next(isState); await player.next(isState);
  const token = { id: 1001, type: 'token', x: 125, y: 175, name: 'Goblin', owner: null, size: 1, hidden: false };
  const t0 = Date.now();
  gm.send({ t: 'ops', scene: sceneId, up: [token], del: [] });
  const got = await player.next(isOps);
  assert.ok(Date.now() - t0 < 1000, 'llega en menos de un segundo');
  assert.equal(got.up.length, 1);
  assert.equal(got.up[0].id, 1001);
  assert.equal(got.up[0].x, 125);
  assert.ok(await gm.silence(isOps), 'el emisor no recibe eco de su propio cambio');
  await app.flushAll();
  const stored = await db.q.sceneObjects(sceneId);
  assert.equal(stored.find((o) => o.id === 1001).x, 125);
  await gm.close(); await player.close();
});

test('un jugador no puede mover una ficha ajena: recibe corrección y nadie más recibe nada', async () => {
  const gm = connect(base, boardId, gmCookie);
  const player = connect(base, boardId, playerCookie);
  await gm.opened; await player.opened;
  await gm.next(isState); await player.next(isState);
  player.send({ t: 'ops', scene: sceneId, up: [{ id: 1001, type: 'token', x: 900, y: 900, name: 'Goblin', owner: null, size: 1, hidden: false }], del: [] });
  const fix = await player.next((m) => m.t === 'ops' && m.fix);
  assert.equal(fix.up[0].x, 125);
  assert.ok(await gm.silence(isOps));
  await gm.close(); await player.close();
});

test('una ficha oculta por el director no se envía al jugador ni al conectar', async () => {
  const gm = connect(base, boardId, gmCookie);
  const player = connect(base, boardId, playerCookie);
  await gm.opened; await player.opened;
  await gm.next(isState); await player.next(isState);
  gm.send({ t: 'ops', scene: sceneId, up: [{ id: 1002, type: 'token', x: 25, y: 25, name: 'Secreto', owner: null, size: 1, hidden: true }], del: [] });
  assert.ok(await player.silence((m) => m.t === 'ops' && m.up && m.up.some((o) => o.id === 1002)));
  await player.close();
  const again = connect(base, boardId, playerCookie);
  await again.opened;
  const state = await again.next(isState);
  assert.deepEqual(state.objects.map((o) => o.id), [1001]);
  await gm.close(); await again.close();
});

test('el estado sobrevive a expulsar el tablero de memoria: reconectar lo recupera de PostgreSQL', async () => {
  await app.flushAll();
  assert.equal(app.live.has(boardId), false);
  const player = connect(base, boardId, playerCookie);
  await player.opened;
  const state = await player.next(isState);
  assert.equal(state.objects.find((o) => o.id === 1001).x, 125);
  await player.close();
});

test('un jugador que gira su propia luz no recibe corrección (las claves vienen reordenadas de jsonb)', async () => {
  const uid = (await db.q.userByName('Jugador')).id;
  const token = { id: 1003, type: 'token', kind: 'player', owner: uid, x: 225, y: 225, name: 'Linterna', size: 1, hidden: false, vision: true, sight: 0, darkvision: 0, light: { on: true, preset: 'bullseye', bright: 60, dim: 60, color: '#FFE6B8', intensity: 1, anim: 'none', angle: 60, rot: 0 } };
  await db.q.upsertObject(boardId, token.id, sceneId, 'token', token);
  await app.flushAll();
  assert.equal(app.live.has(boardId), false, 'el tablero se recarga de la base, con el orden de claves de jsonb');
  const player = connect(base, boardId, playerCookie);
  await player.opened;
  const state = await player.next(isState);
  const mine = state.objects.find((o) => o.id === 1003);
  assert.ok(mine);
  player.send({ t: 'ops', scene: sceneId, up: [Object.assign({}, mine, { light: Object.assign({}, mine.light, { rot: 45 }) })], del: [] });
  assert.ok(await player.silence((m) => m.t === 'ops' && m.fix, 500), 'sin mensaje fix');
  await app.flushAll();
  const stored = (await db.q.sceneObjects(sceneId)).find((o) => o.id === 1003);
  assert.equal(stored.light.rot, 45);
  await player.close();
});
