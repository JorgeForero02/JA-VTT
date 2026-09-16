'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, resetSchema } = require('./helpers/db');

before(async () => { await resetSchema(); });
after(async () => { await db.close(); });

test('migrate es idempotente: segunda pasada no aplica nada', async () => {
  const again = await db.migrate();
  assert.deepEqual(again, []);
  const { rows } = await db.pool.query('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(rows.map((r) => r.version), [1, 2]);
});

test('usuarios: crear, buscar sin distinguir mayúsculas, nombre duplicado falla', async () => {
  const ana = await db.createUser('Ana', 'hash-ana');
  assert.equal(typeof ana.id, 'number');
  assert.equal(ana.name, 'Ana');
  assert.match(ana.color, /^#[0-9A-F]{6}$/i);
  assert.equal((await db.q.userByName('ANA')).id, ana.id);
  assert.equal(await db.q.userByName('nadie'), null);
  await assert.rejects(db.createUser('ana', 'otro'), /users_name_ci/);
});

test('sesiones: token resuelve al usuario sin exponer el hash; borrar la sesión la invalida', async () => {
  const bea = await db.createUser('Bea', 'hash-bea');
  const token = await db.createSession(bea.id);
  assert.equal(token.length, 48);
  const u = await db.q.sessionUser(token);
  assert.equal(u.id, bea.id);
  assert.equal(u.password_hash, undefined);
  await db.q.deleteSession(token);
  assert.equal(await db.q.sessionUser(token), null);
});

test('tablero: se crea con escena activa, dueño como gm y código de invitación', async () => {
  const gm = await db.createUser('Director', 'h');
  const board = await db.createBoard('Mesa uno', gm.id);
  assert.equal(board.name, 'Mesa uno');
  assert.match(board.invite_code, /^[A-Z2-9]{6}$/);
  assert.deepEqual(board.settings, {});
  const scenes = await db.q.scenes(board.id);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].id, board.active_scene);
  const member = await db.q.member(board.id, gm.id);
  assert.equal(member.role, 'gm');
  assert.equal(member.scene_id, board.active_scene);
  const list = await db.q.boardsForUser(gm.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].members, 1);
  assert.equal(list[0].scenes, 1);
  assert.equal(list[0].owner_name, 'Director');
});

test('objetos: upsert guarda JSON y lo devuelve como objeto; ids grandes no pierden precisión', async () => {
  const gm = await db.createUser('Gm2', 'h');
  const board = await db.createBoard('Objetos', gm.id);
  const id = Date.now() * 1000 + 999;
  const token = { id, type: 'token', x: 100, y: 200, name: 'Guerrera' };
  await db.q.upsertObject(board.id, id, board.active_scene, 'token', token);
  await db.q.upsertObject(board.id, id, board.active_scene, 'token', Object.assign({}, token, { x: 150 }));
  const objects = await db.q.sceneObjects(board.active_scene);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].id, id);
  assert.equal(objects[0].x, 150);
  await db.q.deleteObject(board.id, id);
  assert.deepEqual(await db.q.sceneObjects(board.active_scene), []);
});

test('escenas: borrar la escena borra sus objetos y su niebla en cascada', async () => {
  const gm = await db.createUser('Gm3', 'h');
  const board = await db.createBoard('Cascada', gm.id);
  const sceneId = db.newSceneId();
  await db.q.insertScene(sceneId, board.id, 'Segunda', { env: 'night' }, 1);
  await db.q.upsertObject(board.id, 1, sceneId, 'wall', { id: 1, type: 'wall' });
  await db.q.upsertFog(sceneId, gm.id, 0, 0, Buffer.from([1, 2, 3]));
  assert.equal((await db.q.scenes(board.id))[1].settings.env, 'night');
  await db.q.deleteScene(sceneId);
  assert.deepEqual(await db.q.sceneObjects(sceneId), []);
  assert.deepEqual(await db.q.fogFor(sceneId, gm.id), []);
});

test('niebla: upsert reemplaza el tile y devuelve Buffer', async () => {
  const gm = await db.createUser('Gm4', 'h');
  const board = await db.createBoard('Niebla', gm.id);
  await db.q.upsertFog(board.active_scene, gm.id, 2, 3, Buffer.from('aaa'));
  await db.q.upsertFog(board.active_scene, gm.id, 2, 3, Buffer.from('bbb'));
  const tiles = await db.q.fogFor(board.active_scene, gm.id);
  assert.equal(tiles.length, 1);
  assert.ok(Buffer.isBuffer(tiles[0].data));
  assert.equal(tiles[0].data.toString(), 'bbb');
  await db.q.clearFog(board.active_scene);
  assert.deepEqual(await db.q.fogFor(board.active_scene, gm.id), []);
});

test('imágenes: muestras se siembran una vez; bytes idénticos; uso por tablero', async () => {
  const dir = path.join(__dirname, '..', 'public', 'muestras');
  assert.equal(await db.seedSamples(dir), 6);
  assert.equal(await db.seedSamples(dir), 0);
  const gm = await db.createUser('Gm5', 'h');
  const board = await db.createBoard('Imgs', gm.id);
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  await db.q.insertImage({ id: 'img1', boardId: board.id, ownerId: gm.id, name: 'x', category: 'prop', mime: 'image/webp', width: 10, height: 20, ppc: 0, size: bytes.length, origin: 'local', data: bytes, thumb: null, thumbMime: null });
  const row = await db.q.imageData('img1');
  assert.ok(row.data.equals(bytes));
  const usage = await db.q.boardUsage(board.id);
  assert.equal(usage.count, 1);
  assert.equal(usage.bytes, bytes.length);
  const list = await db.q.imagesForBoard(board.id);
  assert.equal(list.length, 7);
  assert.ok(list.every((i) => i.data === undefined));
  await db.q.deleteImage('img1');
  assert.equal(await db.q.imageMeta('img1'), null);
});

test('tx: si falla dentro, no queda nada escrito', async () => {
  const gm = await db.createUser('Gm6', 'h');
  const board = await db.createBoard('Tx', gm.id);
  await assert.rejects(db.tx(async (t) => {
    await t.renameBoard('Renombrado', board.id);
    throw new Error('boom');
  }), /boom/);
  assert.equal((await db.q.board(board.id)).name, 'Tx');
});

test('borrar tablero limpia miembros, escenas, objetos e imágenes', async () => {
  const gm = await db.createUser('Gm7', 'h');
  const board = await db.createBoard('Borrar', gm.id);
  await db.q.upsertObject(board.id, 5, board.active_scene, 'token', { id: 5 });
  await db.q.insertImage({ id: 'img-del', boardId: board.id, ownerId: gm.id, name: 'x', category: 'prop', mime: 'image/webp', width: 1, height: 1, ppc: 0, size: 1, origin: 'local', data: Buffer.from([0]), thumb: null, thumbMime: null });
  await db.q.deleteBoard(board.id);
  assert.equal(await db.q.member(board.id, gm.id), null);
  assert.deepEqual(await db.q.scenes(board.id), []);
  assert.equal(await db.q.imageMeta('img-del'), null);
  assert.deepEqual(await db.q.sceneObjects(board.active_scene), []);
});
