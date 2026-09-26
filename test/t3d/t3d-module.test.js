'use strict';
/* El módulo del tablero 3D montado en un anfitrión mínimo: sólo el pool, memberRole y postChat. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, resetSchema } = require('./helpers/db');
const { createTablero3D } = require('../../modules/tablero3d');

let m;
const chat = [];
before(async () => {
  await resetSchema();
  m = createTablero3D({ pool: db.pool, memberRole: async () => 'gm', postChat: async (...a) => { chat.push(a); } });
});
after(async () => { await m.close(); await db.close(); });

const conn = (board, user, role = 'gm') => {
  const sent = [];
  return { sent, ws: { send: (x) => sent.push(typeof x === 'string' ? JSON.parse(x) : x) }, user, role, board: { id: board } };
};

test('módulo: nombre, carpeta pública y migración ya aplicada', async () => {
  assert.equal(m.name, 't3d');
  assert.equal(m.publicDir, path.join(__dirname, '..', '..', 'modules', 'tablero3d', 'public'));
  assert.deepEqual(await m.migrate(), []);
  assert.deepEqual(await m.describeBoards([]), []);
  assert.deepEqual(await m.tagBoards([]), []);
});

test('módulo: tipo de mesa — join no atiende un tablero 2D; markBoard lo hace 3D; tagBoards sólo añade t3d', async () => {
  const gm = await db.createUser('ModTipo', 'h');
  const b2 = await db.createBoard('Plano', gm.id);
  const b3 = await db.createBoard('Hondo', gm.id);
  const a = conn(b2.id, gm);
  assert.deepEqual(await m.join(a), {}, 'un tablero 2D no entra en la mesa 3D');
  assert.equal(await m.ws(a, { t: 'live', key: 'doors', op: 'set', data: { d: {} } }), false);
  assert.equal(m.isLoaded(b2.id), false);
  assert.equal(await m.markBoard(b3.id), true);
  assert.equal(await m.markBoard(b3.id), true, 'idempotente');
  assert.equal(await m.markBoard('no-existe'), false);
  const list = [{ id: b2.id, scenes: 4, name: 'Plano' }, { id: b3.id, scenes: 1, name: 'Hondo' }];
  assert.deepEqual(await m.tagBoards(list), [{ id: b2.id, scenes: 4, name: 'Plano' }, { id: b3.id, scenes: 1, name: 'Hondo', t3d: true }], 'no pisa las escenas del anfitrión');
  assert.deepEqual((await m.describeBoards([{ id: b3.id }]))[0], { id: b3.id, scenes: 0, t3d: true });
});

test('módulo: con allBoards3D la migración marca como 3D los tableros existentes; sin él, ninguno', async () => {
  const gm = await db.createUser('ModTodos', 'h');
  const b = await db.createBoard('Antiguo', gm.id);
  const plain = createTablero3D({ pool: db.pool, memberRole: async () => 'gm', postChat: async () => {} });
  await plain.migrate();
  assert.deepEqual(await plain.tagBoards([{ id: b.id }]), [{ id: b.id }]);
  await plain.close();
  const all = createTablero3D({ pool: db.pool, allBoards3D: true, memberRole: async () => 'gm', postChat: async () => {} });
  assert.deepEqual(await all.migrate(), []);
  assert.deepEqual(await all.tagBoards([{ id: b.id }]), [{ id: b.id, t3d: true }]);
  await all.close();
});

test('módulo: join, mensajes, tirada al chat del anfitrión y leave', async () => {
  const gm = await db.createUser('ModGm', 'h');
  const board = await db.createBoard('Mod', gm.id);
  await m.markBoard(board.id);
  const a = conn(board.id, gm);
  const b = conn(board.id, gm, 'player');
  assert.equal(await m.ws(a, { t: 'live' }), false, 'sin join el módulo no atiende');
  const st = await m.join(a);
  assert.deepEqual(Object.keys(st).sort(), ['live', 'peer', 'peers', 'settings']);
  assert.deepEqual(st.settings, require('../../modules/tablero3d/rules').DEFAULT_SETTINGS, 'los ajustes del tablero 3D llegan con el estado (por defecto, como JA-VTT)');
  await m.join(b);
  assert.equal(a.sent.at(-1).t, 'peers', 'los demás se enteran de quien entra');
  assert.equal(await m.ws(a, { t: 'otro' }), false);
  assert.equal(await m.ws(a, { t: 'roll', formula: '2d6' }), true);
  assert.deepEqual(chat.map((c) => [c[0], c[1], c[2], c[3].formula]), [[board.id, { id: gm.id, name: 'ModGm', color: gm.color }, 'roll', '2d6']]);
  assert.equal(await m.ws(a, { t: 'live', req: 1, key: 'doors', op: 'set', data: { d: {} } }), true);
  assert.equal(b.sent.at(-1).t, 'doc');
  m.leave(b); m.leave(b);
  assert.equal(a.sent.at(-1).peers.length, 1);
  // sin touchBoard en el anfitrión el volcado funciona igual
  await m.flushAll();
  assert.equal((await db.pool.query('SELECT key FROM t3d.live_docs WHERE board_id = $1', [board.id])).rows[0].key, 'doors');
  m.leave(a);
});

test('módulo: si el volcado falla lo reintenta; borrar el tablero lo olvida', async () => {
  const gm = await db.createUser('ModGm2', 'h');
  const board = await db.createBoard('Mod2', gm.id);
  await m.markBoard(board.id);
  const a = conn(board.id, gm);
  await m.join(a);
  await m.ws(a, { t: 'live', key: 'combat', op: 'set', data: { active: false, order: [] } });
  await db.pool.query('DELETE FROM public.boards WHERE id = $1', [board.id]); // el volcado chocará con la clave ajena
  const logged = [];
  const orig = console.error; console.error = (...x) => logged.push(x.join(' '));
  try { await m.flushAll(); m.leave(a); await m.flushAll(); } finally { console.error = orig; }
  assert.equal(logged.length, 2);
  assert.match(logged[0], /No se pudo guardar la mesa 3D/);
  assert.equal(m.isLoaded(board.id), true, 'lo pendiente no se pierde mientras falle');
  m.onBoardDeleted(board.id);
  assert.equal(m.isLoaded(board.id), false);
});

/* Ola final, M7: borrar el tablero olvida también su contador de versiones de piezas (piecesRev). */
test('módulo: borrar el tablero olvida su contador de piezas (piecesRev)', async () => {
  const { Readable } = require('node:stream');
  const gm = await db.createUser('ModGm7', 'h');
  const board = await db.createBoard('Mod7', gm.id);
  await m.markBoard(board.id);
  const body = JSON.stringify({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_c' },
    shape: { w: 1, d: 1, height: 1, layer: 'object' }, components: { move: { block: true } } });
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method: 'PUT', headers: { 'content-length': String(Buffer.byteLength(body)) } });
  let status = 0;
  const res = { writeHead: (s) => { status = s; }, end: () => {} };
  await m.api(req, res, new URL('http://x/api/t3d/boards/' + board.id + '/pieces/cofre01'), gm, ['t3d', 'boards', String(board.id), 'pieces', 'cofre01']);
  assert.equal(status, 200);
  assert.equal(m.piecesRevOf(String(board.id)), 1);
  m.onBoardDeleted(String(board.id));
  assert.equal(m.piecesRevOf(String(board.id)), undefined);
});
