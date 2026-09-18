'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const app = require('../server/app');

let base;
before(async () => {
  await resetSchema();
  await app.prepare();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
});
after(async () => { await app.stop(); });

/* Cliente mínimo que conserva la cookie de sesión */
function client() {
  let cookie = '';
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method, headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, setCookie: set, cookie };
  }
  return { call, get cookie() { return cookie; } };
}

test('health responde sin sesión', async () => {
  const r = await client().call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
});

test('registro: crea la cuenta, deja cookie y /me responde', async () => {
  const c = client();
  const r = await c.call('POST', '/api/register', { name: 'Ana', password: 'secreto1' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.name, 'Ana');
  assert.match(r.setCookie, /^jav_session=[0-9a-f]{48}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000$/);
  const me = await c.call('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.name, 'Ana');
  assert.equal(me.data.user.password_hash, undefined);
});

test('registro: nombre repetido (sin distinguir mayúsculas) da 409', async () => {
  const r = await client().call('POST', '/api/register', { name: 'ANA', password: 'secreto1' });
  assert.equal(r.status, 409);
  assert.equal(r.setCookie, null);
});

test('registro: contraseña corta o nombre inválido dan 400', async () => {
  assert.equal((await client().call('POST', '/api/register', { name: 'Bea', password: '12345' })).status, 400);
  assert.equal((await client().call('POST', '/api/register', { name: 'B', password: 'secreto1' })).status, 400);
  assert.equal((await client().call('POST', '/api/register', { name: 'Bea<script>', password: 'secreto1' })).status, 400);
});

test('login: contraseña correcta da cookie; incorrecta o usuario inexistente dan 401 sin cookie', async () => {
  const ok = await client().call('POST', '/api/login', { name: 'ana', password: 'secreto1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, 'Ana');
  assert.ok(ok.setCookie);
  const bad = await client().call('POST', '/api/login', { name: 'ana', password: 'secreto2' });
  assert.equal(bad.status, 401);
  assert.equal(bad.setCookie, null);
  const ghost = await client().call('POST', '/api/login', { name: 'nadie', password: 'secreto2' });
  assert.equal(ghost.status, 401);
  assert.equal(ghost.data.error, bad.data.error);
});

test('sin sesión, la API privada da 401; tras logout la cookie deja de valer', async () => {
  assert.equal((await client().call('GET', '/api/boards')).status, 401);
  const c = client();
  await c.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  assert.equal((await c.call('GET', '/api/boards')).status, 200);
  const out = await c.call('POST', '/api/logout');
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /Max-Age=0/);
});

test('tableros: crear, listar, unirse por código; añadir miembro exige usuario registrado', async () => {
  const gm = client();
  await gm.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  const created = await gm.call('POST', '/api/boards', { name: 'La mesa' });
  assert.equal(created.status, 201);
  const boardId = created.data.board.id;
  const detail = await gm.call('GET', `/api/boards/${boardId}`);
  assert.equal(detail.data.board.role, 'gm');
  assert.match(detail.data.board.invite_code, /^[A-Z2-9]{6}$/);

  const player = client();
  await player.call('POST', '/api/register', { name: 'Bea', password: 'secreto1' });
  const joined = await player.call('POST', '/api/join', { code: detail.data.board.invite_code.toLowerCase() });
  assert.equal(joined.status, 200);
  const asPlayer = await player.call('GET', `/api/boards/${boardId}`);
  assert.equal(asPlayer.data.board.role, 'player');
  assert.equal(asPlayer.data.board.invite_code, undefined);

  assert.equal((await gm.call('POST', `/api/boards/${boardId}/members`, { name: 'Nadie' })).status, 404);
  await client().call('POST', '/api/register', { name: 'Cris', password: 'secreto1' });
  const added = await gm.call('POST', `/api/boards/${boardId}/members`, { name: 'cris' });
  assert.equal(added.status, 200);
  assert.deepEqual(added.data.members.map((m) => m.name).sort(), ['Ana', 'Bea', 'Cris']);
  assert.equal((await player.call('POST', `/api/boards/${boardId}/members`, { name: 'Ana' })).status, 404);
});

test('crear tablero 2.5D: se guarda el modo y se lista; un modo inválido cae a 2d', async () => {
  const gm = client();
  await gm.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  const r = await gm.call('POST', '/api/boards', { name: 'Cripta', mode: '2.5d' });
  assert.equal(r.status, 201);
  assert.equal(r.data.board.mode, '2.5d');
  const bad = await gm.call('POST', '/api/boards', { name: 'Plano', mode: 'iso' });
  assert.equal(bad.data.board.mode, '2d');
  const list = await gm.call('GET', '/api/boards');
  const modes = Object.fromEntries(list.data.boards.map((b) => [b.name, b.mode]));
  assert.equal(modes.Cripta, '2.5d');
  assert.equal(modes.Plano, '2d');
  const one = await gm.call('GET', `/api/boards/${r.data.board.id}`);
  assert.equal(one.data.board.mode, '2.5d');
});

test('imágenes: subir, descargar bytes idénticos, cuota y permisos', async () => {
  const gm = client();
  await gm.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  const boardId = (await gm.call('POST', '/api/boards', { name: 'Imgs' })).data.board.id;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const up = await gm.call('POST', `/api/boards/${boardId}/images`, { name: 'mapa', category: 'board', data: 'data:image/png;base64,' + png.toString('base64'), width: 4, height: 4, ppc: 50 });
  assert.equal(up.status, 201);
  assert.equal(up.data.image.category, 'board');
  const got = await gm.call('GET', `/api/images/${up.data.image.id}`);
  assert.equal(got.status, 200);
  assert.ok(got.data.equals(png));
  const list = await gm.call('GET', `/api/boards/${boardId}/images`);
  assert.equal(list.data.usage.count, 1);
  assert.equal(list.data.usage.bytes, png.length);
  assert.equal((await gm.call('POST', `/api/boards/${boardId}/images`, { data: 'data:text/plain;base64,AAAA' })).status, 400);

  const stranger = client();
  await stranger.call('POST', '/api/register', { name: 'Dani', password: 'secreto1' });
  assert.equal((await stranger.call('GET', `/api/images/${up.data.image.id}`)).status, 403);
});

test('imágenes: la categoría arte25 (Arte 2.5D) se acepta y se lista como las demás', async () => {
  const gm = client();
  await gm.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  const boardId = (await gm.call('POST', '/api/boards', { name: 'Arte', mode: '2.5d' })).data.board.id;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const up = await gm.call('POST', `/api/boards/${boardId}/images`, { name: 'piezas', category: 'arte25', data: 'data:image/png;base64,' + png.toString('base64'), width: 32, height: 16 });
  assert.equal(up.status, 201);
  assert.equal(up.data.image.category, 'arte25');
  const list = await gm.call('GET', `/api/boards/${boardId}/images`);
  assert.equal(list.data.images.filter((m) => m.category === 'arte25').length, 1);
  const patched = await gm.call('PATCH', `/api/images/${up.data.image.id}`, { category: 'arte25', name: 'piezas 2' });
  assert.equal(patched.status, 200);
  assert.equal((await gm.call('GET', `/api/boards/${boardId}/images`)).data.images[0].category, 'arte25');
});

test('persistencia: los objetos volcados sobreviven a vaciar la caché en memoria', async () => {
  const gm = client();
  await gm.call('POST', '/api/login', { name: 'Ana', password: 'secreto1' });
  const boardId = (await gm.call('POST', '/api/boards', { name: 'Persistente' })).data.board.id;
  const board = await db.q.board(boardId);
  const token = { id: 4242, type: 'token', x: 300, y: 350, name: 'Guerrera', size: 1 };
  await db.q.upsertObject(boardId, token.id, board.active_scene, 'token', token);
  const portals = await gm.call('GET', `/api/boards/${boardId}/scenes/${board.active_scene}/portals`);
  assert.equal(portals.status, 200);
  assert.ok(app.live.has(boardId));
  const sc = app.live.get(boardId).scenes.get(board.active_scene);
  sc.objects.get(token.id).x = 999; sc.dirty.add(token.id);
  await app.flushAll();
  assert.equal(app.live.has(boardId), false, 'sin clientes, el tablero sale de memoria tras volcar');
  const stored = await db.q.sceneObjects(board.active_scene);
  assert.equal(stored[0].x, 999);
});
