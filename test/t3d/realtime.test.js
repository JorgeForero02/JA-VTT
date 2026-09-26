'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, t3dDb, resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const F = require('./helpers/fixtures');
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
  return res.json();
}
async function mesa(prefix) {
  const gm = await account(prefix + 'Gm');
  const pl = await account(prefix + 'Pl');
  const b = (await call(gm, 'POST', '/api/boards', { name: 'Mesa ' + prefix })).board;
  await call(gm, 'POST', `/api/t3d/boards/${b.id}`); // JA-VTT: marca el tablero como mesa 3D
  const code = (await call(gm, 'GET', `/api/boards/${b.id}`)).board.invite_code;
  await call(pl, 'POST', '/api/join', { code });
  return { gm, pl, b };
}
const waitFlush = () => new Promise((r) => setTimeout(r, 700));
let reqId = 0;
const liveMsg = (key, op, data) => ({ t: 'live', req: ++reqId, key, op, data });

test('sin sesión el WebSocket se rechaza; un ajeno al tablero recibe error y cierre', async () => {
  const anon = connect(base, 'x', '', '/t3d/ws');
  await assert.rejects(anon.opened);
  const { b } = await mesa('A');
  const other = await account('AOtro');
  const ws = connect(base, b.id, other.cookie, '/t3d/ws');
  await ws.opened;
  const err = await ws.next((m) => m.t === 'error');
  assert.match(err.error, /No perteneces/);
});

test('al conectar llega el estado: rol, par, miembros, conectados y mesa vacía', async () => {
  const { gm, pl, b } = await mesa('S');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened;
  const st = await g.next((m) => m.t === 'state');
  assert.equal(st.role, 'gm');
  assert.match(st.peer, /^p[0-9a-f]{10}$/);
  // JA-VTT: la conexión propia del módulo (/t3d/ws) manda siempre board:{id}, sin invite_code (eso es
  // del núcleo, en su propio /ws); aquí no hay board completo que distinga director de jugador.
  assert.deepEqual(st.board, { id: b.id });
  assert.equal(st.members.length, 2);
  assert.deepEqual(st.live, {});
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened;
  const ps = await p.next((m) => m.t === 'state');
  assert.equal(ps.role, 'player');
  assert.deepEqual(ps.board, { id: b.id });
  const peers = await g.next((m) => m.t === 'peers' && m.peers.length === 2);
  assert.deepEqual(peers.online.map((o) => o.role).sort(), ['gm', 'player']);
  await p.close();
  await g.next((m) => m.t === 'peers' && m.peers.length === 1);
  await g.close();
});

test('mesa en vivo: el director abre la mesa y el jugador la recibe; el jugador mueve sólo lo suyo', async () => {
  const { gm, pl, b } = await mesa('L');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; await p.next((m) => m.t === 'state');
  g.send(liveMsg('board', 'set', { open: true, rev: 1, board: F.map(8, { props: [{ type: 'door', x: 2, z: 3, v: 0, open: false }] }) }));
  assert.equal((await g.next((m) => m.t === 'ack')).ok, true);
  await g.next((m) => m.t === 'doc' && m.key === 'board'); // el eco también llega a quien lo manda
  assert.equal((await p.next((m) => m.t === 'doc' && m.key === 'board')).data.board.w, 8);
  const tokens = { tokens: { k1: F.token(pl.user.id), g1: F.token(null, { kind: 'goblin' }) } };
  g.send(liveMsg('tokens', 'set', tokens));
  await p.next((m) => m.t === 'doc' && m.key === 'tokens');
  // el jugador mueve su caballero
  p.send(liveMsg('tokens', 'update', { tokens: { k1: F.token(pl.user.id, { x: 6 }) } }));
  assert.equal((await p.next((m) => m.t === 'ack')).ok, true);
  const seen = await g.next((m) => m.t === 'doc' && m.key === 'tokens' && m.data.tokens.k1.x === 6);
  assert.equal(seen.data.tokens.g1.kind, 'goblin');
  // pero no el goblin del director, ni la escena
  p.send(liveMsg('tokens', 'update', { tokens: { g1: F.token(null, { kind: 'goblin', x: 1 }) } }));
  const nope = await p.next((m) => m.t === 'ack');
  assert.equal(nope.ok, false);
  assert.match(nope.error, /propios/);
  p.send(liveMsg('board', 'set', { open: false }));
  assert.equal((await p.next((m) => m.t === 'ack')).ok, false);
  assert.ok(await g.silence((m) => m.t === 'doc' && m.key === 'board'), 'nada llega al director');
  // puertas: cualquiera, si son puertas de la escena, sin llave y el tablero lo deja (ver test de portales y puertas)
  g.send(liveMsg('doors', 'set', { d: {} })); await g.next((m) => m.t === 'ack');
  p.send(liveMsg('doors', 'update', { d: { '2_3': 1 } }));
  assert.deepEqual((await g.next((m) => m.t === 'doc' && m.key === 'doors' && m.data.d['2_3'])).data, { d: { '2_3': 1 } });
  await p.close(); await g.close();
});

test('persistencia: la mesa se vuelca a PostgreSQL y vuelve al reconectar', async () => {
  const { gm, b } = await mesa('P');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  g.send(liveMsg('combat', 'set', { initiative: { entries: [{ id: 1, name: 'Aria', value: 17, tokenId: 'k1', roll: 15, init: 2 }], turn: 0, round: 3 }, left: 6 }));
  await g.next((m) => m.t === 'ack');
  await g.close();
  await waitFlush();
  const rows = await t3dDb.q.liveDocs(b.id);
  assert.equal(rows.find((r) => r.key === 'combat').data.initiative.round, 3);
  // JA-VTT: no hay forma de observar la descarga en memoria desde fuera — server/app.js no exporta su
  // instancia del módulo (`t3d`), y su propio mapa `live` (core, exportado) sólo lo llenan las conexiones
  // por /ws; una mesa que sólo se tocó por /t3d/ws nunca aparece ahí, con o sin clientes. Se comprueba
  // en su lugar lo que sí es observable: el volcado a PostgreSQL de arriba.
  // un combate guardado con el formato de antes (order) vuelve como iniciativa de JA-VTT, con el nombre de la ficha
  await t3dDb.q.upsertLiveDoc(b.id, 'tokens', { tokens: { k1: F.token(null, { sheet: { name: 'Brenna' } }) } });
  await t3dDb.q.upsertLiveDoc(b.id, 'combat', { active: true, order: [{ id: 'k1', roll: 15, total: 17, init: 2 }], turn: 0, round: 3, left: 6, dashed: false });
  const again = connect(base, b.id, gm.cookie, '/t3d/ws'); await again.opened;
  const st = await again.next((m) => m.t === 'state');
  assert.deepEqual(st.live.combat, { initiative: { entries: [{ id: 1, name: 'Brenna', value: 17, tokenId: 'k1', roll: 15, init: 2 }], turn: 0, round: 3 }, left: 6, dashed: false, active: true, current: 'k1' });
  // cerrar la mesa borra el documento
  again.send(liveMsg('combat', 'delete'));
  await again.next((m) => m.t === 'doc' && m.key === 'combat' && m.data === null);
  await again.close();
  await waitFlush();
  assert.equal((await t3dDb.q.liveDocs(b.id)).some((r) => r.key === 'combat'), false);
});

test('momentos: tiradas y señales llegan a todos; las tiradas quedan en el registro', async () => {
  const { gm, pl, b } = await mesa('R');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; const gs = await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; await p.next((m) => m.t === 'state');
  g.send({ t: 'roll', formula: '1d20+3', adv: 1 });
  const got = await p.next((m) => m.t === 'msg' && m.topic === 'roll');
  assert.equal(got.by, String(gm.user.id));
  assert.equal(got.peer, gs.peer);
  assert.deepEqual([got.data.formula, got.data.adv, got.data.dice[0].rolls.length, got.data.total], ['2d20+3', 1, 2, Math.max(...got.data.dice[0].rolls) + 3], 'con ventaja: dos d20, cuenta el mayor');
  p.send({ t: 'emit', topic: 'roll', data: { formula: 'd20', total: 20 } });
  assert.match((await p.next((m) => m.t === 'error')).error, /no válido/, 'una tirada sólo la manda el servidor');
  p.send({ t: 'emit', topic: 'ping', data: { x: 2, z: 3 } });
  assert.deepEqual((await g.next((m) => m.t === 'msg' && m.topic === 'ping')).data, { x: 2, z: 3 });
  p.send({ t: 'emit', topic: 'nota', data: { t: 'x'.repeat(5000) } });
  assert.match((await p.next((m) => m.t === 'error')).error, /no válido/);
  p.send({ t: 'roll', req: 4, formula: '1d7' });
  assert.match((await p.next((m) => m.t === 'ack' && m.req === 4)).error, /No hay dados de 7 caras/);
  // JA-VTT: no hay GET /api/boards/:id/rolls; el registro de tiradas es el chat (chat_messages, kind='roll')
  const rolls = (await db.pool.query("SELECT body FROM chat_messages WHERE board_id = $1 AND kind = 'roll'", [b.id])).rows;
  assert.equal(rolls.length, 1);
  assert.deepEqual(rolls[0].body, got.data, 'en el registro, el cuerpo de JA-VTT');
  const chat = await db.pool.query('SELECT kind, user_id FROM public.chat_messages WHERE board_id = $1', [b.id]);
  assert.deepEqual(chat.rows, [{ kind: 'roll', user_id: gm.user.id }], 'la tirada va al chat del núcleo');
  await p.close(); await g.close();
});

test('presencia: se reparte a todos y null la borra', async () => {
  const { gm, pl, b } = await mesa('Q');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; const ps = await p.next((m) => m.t === 'state');
  p.send({ t: 'presence', patch: { role: 'player', cell: [2, 3] } });
  await g.next((m) => m.t === 'peers' && m.peers.some((x) => x.peer === ps.peer && x.presence.cell));
  p.send({ t: 'presence', patch: { cell: null } });
  const cleared = await g.next((m) => m.t === 'peers' && m.peers.some((x) => x.peer === ps.peer && x.presence.role === 'player' && !('cell' in x.presence)));
  assert.deepEqual(cleared.peers.find((x) => x.peer === ps.peer).presence, { role: 'player' });
  p.send({ t: 'presence', patch: { big: 'x'.repeat(5000) } });
  assert.match((await p.next((m) => m.t === 'error')).error, /grande/);
  p.send({ t: 'ping', at: 5 });
  assert.equal((await p.next((m) => m.t === 'pong')).at, 5);
  p.send({ t: 'desconocido' }); p.ws.send('no es json');
  assert.ok(await p.silence((m) => m.t === 'error'));
  await p.close(); await g.close();
});

// JA-VTT: el /ws genérico del núcleo no tiene ningún puente con el módulo (server/app.js no llama a
// t3d.join/ws/leave desde su onSocket, a diferencia del anfitrión mínimo de t3d-host.test.js, que sí lo
// hace a mano); en JA-VTT la única mesa en vivo de una mesa 3D es la de /t3d/ws, así que las dos
// conexiones de esta prueba (director y jugador) usan esa ruta.
test('conexión propia del módulo (/t3d/ws, la de JA-VTT): la del director y la del jugador comparten la mesa; expulsar y borrar la cierran', async () => {
  const { gm, pl, b } = await mesa('Own');
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws');
  const st = await p.next((m) => m.t === 'state');
  assert.deepEqual([st.role, st.board.id, st.members.length, typeof st.peer], ['player', b.id, 2, 'string']);
  assert.equal((await g.next((m) => m.t === 'peers')).peers.length, 2, 'el director ve entrar al jugador en la misma mesa 3D');
  g.send(liveMsg('doors', 'set', { d: { '1_1': 1 } }));
  assert.deepEqual((await p.next((m) => m.t === 'doc')).data, { d: { '1_1': 1 } });
  await call(gm, 'DELETE', `/api/boards/${b.id}/members/${pl.user.id}`);
  assert.equal((await p.next((m) => m.t === 'kicked')).t, 'kicked');
  assert.equal(await p.closed(), 4403);
  const p2 = connect(base, b.id, gm.cookie, '/t3d/ws'); await p2.next((m) => m.t === 'state');
  await call(gm, 'DELETE', `/api/boards/${b.id}`);
  assert.equal((await p2.next((m) => m.t === 'kicked')).deleted, true);
  assert.equal(await p2.closed(), 4403);
});
