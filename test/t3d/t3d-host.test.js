'use strict';
/* Anfitrión mínimo: un servidor HTTP que monta el módulo del tablero 3D sólo con la interfaz
   documentada en docs/08-integracion-ja-vtt.md (pool, memberRole, postChat, touchBoard →
   migrate, serve, api, socket, kick, onBoardDeleted, close), igual que lo haría Just Another VTT.
   El usuario sale de una cookie `uid` (JA-VTT lo saca de su tabla sessions). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { db, resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const F = require('./helpers/fixtures');
const { acceptUpgrade } = require('../../server/ws');
const { createTablero3D } = require('../../modules/tablero3d');

const { q } = db;
const chat = [];
let t3d, server, base;

/* ---- el anfitrión: lo que la guía pide añadir, nada más ---- */
function makeHost(opts = {}) {
  const mod = createTablero3D(Object.assign({
    pool: db.pool,
    memberRole: async (boardId, uid) => (await q.member(boardId, uid))?.role || null,
    postChat: (boardId, user, kind, body) => { const saved = q.insertChat(boardId, user.id, kind, body); chat.push({ boardId, user, kind, body, saved }); return saved; },
    touchBoard: q.touchBoard,
  }, opts));
  const userFrom = async (req) => {
    const m = /(?:^|;\s*)uid=(\d+)/.exec(req.headers.cookie || '');
    return m ? q.userById(Number(m[1])) : null;
  };
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/t3d/')) return mod.serve(req, res, url);
      const parts = url.pathname.split('/').filter(Boolean).slice(1);
      const user = await userFrom(req);
      if (!user) { res.writeHead(401); return res.end(); }
      if (parts[0] === mod.name) return await mod.api(req, res, url, user, parts);
      res.writeHead(404); res.end();
    } catch (e) {
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  srv.on('upgrade', async (req, sock) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname !== '/t3d/ws') return sock.destroy();
    const user = await userFrom(req);
    if (!user) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
    const ws = acceptUpgrade(req, sock);
    if (ws) await mod.socket(ws, user, url.searchParams.get('board') || '');
  });
  return { mod, srv };
}

before(async () => {
  await resetSchema();
  ({ mod: t3d, srv: server } = makeHost());
  assert.deepEqual(await t3d.migrate(), [], 'el módulo migra después del núcleo; ya estaba al día');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await t3d.close();
  await new Promise((r) => server.close(r));
  await db.close();
});

async function people(prefix, mark = true) {
  const gm = await db.createUser(prefix + 'Gm', 'h');
  const pl = await db.createUser(prefix + 'Pl', 'h');
  const other = await db.createUser(prefix + 'Otro', 'h');
  const board = await db.createBoard('Mesa ' + prefix, gm.id);
  await q.addMember(board.id, pl.id, 'player');
  const cookie = (u) => `uid=${u.id}`;
  // como JA-VTT tras crear un tablero con «Mesa 3D»: el navegador del director lo marca
  if (mark) assert.equal((await call(cookie(gm), 'POST', `/api/t3d/boards/${board.id}`)).status, 200);
  return { gm, pl, other, board, cookie };
}
const call = async (cookie, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
};

test('anfitrión mínimo: sirve el cliente del módulo bajo /t3d/ sin su propio servidor de archivos', async () => {
  const js = await fetch(base + '/t3d/t3d.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(await js.text(), /T\.mount=function/);
  assert.equal((await fetch(base + '/t3d/icons-t3d.js')).status, 200);
  assert.match((await fetch(base + '/t3d/t3d.css')).headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(base + '/t3d/no-existe.js')).status, 404);
  assert.equal((await fetch(base + '/t3d/..%2findex.js')).status, 403, 'no sale de su carpeta');
  assert.equal((await fetch(base + '/t3d/')).status, 403, 'la carpeta no se lista');
  assert.equal((await fetch(base + '/t3d/%E0%A4%A')).status, 400);
});

test('anfitrión mínimo: la API guarda y lista escenas con los permisos del núcleo', async () => {
  const { pl, other, board, cookie, gm } = await people('Api');
  const put = await call(cookie(gm), 'PUT', `/api/t3d/boards/${board.id}/scenes/b1`, F.map(8, { name: 'Cueva' }));
  assert.equal(put.status, 200, put.body);
  const list = JSON.parse((await call(cookie(pl), 'GET', `/api/t3d/boards/${board.id}/scenes`)).body);
  assert.deepEqual(list.scenes.map((s) => s.name), ['Cueva']);
  assert.equal((await call(cookie(pl), 'PUT', `/api/t3d/boards/${board.id}/scenes/b2`, F.map(8))).status, 403);
  assert.equal((await call(cookie(other), 'GET', `/api/t3d/boards/${board.id}/scenes`)).status, 404);
  assert.equal((await call(cookie(gm), 'PUT', `/api/t3d/boards/${board.id}/scenes/b3`, '{')).status, 400);
});

test('anfitrión mínimo: tipo de mesa — se consulta, se elige al crear, es fijo y un tablero 2D no tiene 3D', async () => {
  const { gm, pl, other, board, cookie } = await people('Tipo', false);
  const url = `/api/t3d/boards/${board.id}`;
  assert.deepEqual(JSON.parse((await call(cookie(pl), 'GET', url)).body), { board: { id: board.id, t3d: false, role: 'player' } });
  assert.equal((await call(cookie(other), 'GET', url)).status, 404, 'quien no es miembro no lo ve');
  for (const [method, path] of [['GET', '/scenes'], ['PUT', '/scenes/b1'], ['GET', '/campaigns'], ['GET', '/drawings'], ['GET', '/usage']]) {
    const r = await call(cookie(gm), method, url + path, method === 'PUT' ? F.map(8) : undefined);
    assert.deepEqual([r.status, JSON.parse(r.body).error], [404, 'Este tablero no es una mesa 3D'], method + path);
  }
  const w = connect(base, board.id, cookie(gm), '/t3d/ws');
  assert.equal((await w.next((m) => m.t === 'error')).error, 'Este tablero no es una mesa 3D');
  assert.equal(await w.closed(), 4404);

  assert.equal((await call(cookie(pl), 'POST', url)).status, 403, 'sólo el director elige el tipo');
  assert.deepEqual(JSON.parse((await call(cookie(gm), 'POST', url)).body), { board: { id: board.id, t3d: true, role: 'gm' } });
  assert.equal((await call(cookie(gm), 'POST', url)).status, 200, 'marcarlo otra vez no falla');
  const del = await call(cookie(gm), 'DELETE', url);
  assert.deepEqual([del.status, JSON.parse(del.body).error], [409, 'El tipo de mesa es fijo: un tablero 3D no vuelve a 2D']);
  assert.equal((await call(cookie(gm), 'PUT', url)).status, 404);
  assert.equal(JSON.parse((await call(cookie(pl), 'GET', url)).body).board.t3d, true, 'sigue siendo 3D');
  assert.equal((await call(cookie(gm), 'GET', url + '/scenes')).status, 200);

  // un tablero 2D con más de 10 minutos ya no puede pasar a 3D
  const old = await people('Viejo', false);
  await db.pool.query('UPDATE public.boards SET created_at = $2 WHERE id = $1', [old.board.id, Date.now() - 11 * 60 * 1000]);
  const late = await call(old.cookie(old.gm), 'POST', `/api/t3d/boards/${old.board.id}`);
  assert.deepEqual([late.status, JSON.parse(late.body).error], [409, 'El tipo de mesa se elige al crear el tablero y ya no se puede cambiar']);
  assert.equal(JSON.parse((await call(old.cookie(old.gm), 'GET', `/api/t3d/boards/${old.board.id}`)).body).board.t3d, false);
});

test('anfitrión mínimo: /t3d/ws — estado, mesa en vivo de ida y vuelta, tirada al chat del anfitrión', async () => {
  const { gm, pl, other, board, cookie } = await people('Ws');
  const a = connect(base, board.id, cookie(gm), '/t3d/ws');
  const st = await a.next((m) => m.t === 'state');
  assert.deepEqual({ me: st.me, role: st.role, board: st.board }, { me: { id: gm.id, name: 'WsGm', color: gm.color }, role: 'gm', board: { id: board.id } });
  assert.deepEqual(st.members.map((m) => [m.name, m.role]), [['WsGm', 'gm'], ['WsPl', 'player']]);
  assert.deepEqual(st.online.map((u) => u.name), ['WsGm']);
  assert.match(st.peer, /^p[0-9a-f]{10}$/);
  assert.deepEqual(st.live, {});
  const b = connect(base, board.id, cookie(pl), '/t3d/ws');
  assert.equal((await b.next((m) => m.t === 'state')).role, 'player');
  assert.equal((await a.next((m) => m.t === 'peers')).peers.length, 2, 'el director ve entrar al jugador');

  a.send({ t: 'live', req: 7, key: 'doors', op: 'set', data: { d: { '3_4': 1 } } });
  assert.deepEqual(await a.next((m) => m.t === 'ack'), { t: 'ack', req: 7, ok: true });
  assert.deepEqual((await b.next((m) => m.t === 'doc')).data, { d: { '3_4': 1 } });
  b.send({ t: 'live', req: 8, key: 'board', op: 'set', data: { open: true } });
  assert.equal((await b.next((m) => m.t === 'ack')).ok, false, 'el jugador no abre la mesa');

  a.send({ t: 'roll', req: 9, formula: 'd20+2', label: 'Ataque' });
  const got = (await b.next((m) => m.t === 'msg' && m.topic === 'roll')).data;
  assert.deepEqual([got.formula, got.dice.length, got.mod, got.label, got.total === got.dice[0].rolls[0] + 2], ['1d20+2', 1, 2, 'Ataque', true]);
  assert.deepEqual((await a.next((m) => m.t === 'ack' && m.req === 9)).roll, got, 'quien tira recibe el resultado en el ack');
  await chat.at(-1).saved; // el módulo contesta y reparte la tirada antes de guardarla en el chat
  const row = (await db.pool.query('SELECT user_id, kind, body FROM chat_messages WHERE board_id = $1', [board.id])).rows;
  assert.deepEqual(row, [{ user_id: gm.id, kind: 'roll', body: got }], 'la tirada va al chat del anfitrión con el cuerpo de JA-VTT');
  assert.deepEqual(chat.at(-1).user, { id: gm.id, name: 'WsGm', color: gm.color }, 'postChat recibe el usuario para el chat del anfitrión');

  b.send({ t: 'presence', patch: { cur: [1, 2] } });
  assert.deepEqual((await a.next((m) => m.t === 'peers' && m.peers.some((p) => p.presence.cur))).peers.find((p) => p.by === String(pl.id)).presence, { cur: [1, 2] });
  a.send({ t: 'ping', at: 5 });
  assert.deepEqual(await a.next((m) => m.t === 'pong'), { t: 'pong', at: 5 });
  a.ws.send('no es json'); a.send({ t: 'otro' }); a.ws.send('3');
  assert.ok(await a.silence((m) => m.t === 'error'), 'lo que no entiende lo ignora');

  // quien no es miembro: error y cierre 4403
  const c = connect(base, board.id, cookie(other), '/t3d/ws');
  assert.match((await c.next((m) => m.t === 'error')).error, /No perteneces/);
  assert.equal(await c.closed(), 4403);

  // la mesa se vuelca en t3d.live_docs
  await t3d.flushAll();
  assert.deepEqual((await db.pool.query('SELECT key FROM t3d.live_docs WHERE board_id = $1', [board.id])).rows, [{ key: 'doors' }]);
  await b.close();
  assert.equal((await a.next((m) => m.t === 'peers')).peers.length, 1, 'al irse el jugador los demás se enteran');
  await a.close();
});

test('anfitrión mínimo: la conexión propia y la del anfitrión (join/ws) comparten la mesa', async () => {
  const { gm, pl, board, cookie } = await people('Mix');
  const a = connect(base, board.id, cookie(pl), '/t3d/ws');
  await a.next((m) => m.t === 'state');
  const sent = [];
  const conn = { ws: { send: (x) => sent.push(typeof x === 'string' ? JSON.parse(x) : x) }, user: gm, role: 'gm', board: { id: board.id } };
  const extra = await t3d.join(conn);
  assert.equal(extra.peers.length, 2);
  assert.equal(await t3d.ws(conn, { t: 'live', key: 'combat', op: 'set', data: { active: true, order: [] } }), true);
  assert.equal((await a.next((m) => m.t === 'doc')).key, 'combat');
  t3d.leave(conn);
  await a.close();
});

test('anfitrión mínimo: expulsar y borrar el tablero cierran las conexiones propias', async () => {
  const { gm, pl, board, cookie } = await people('Kick');
  const a = connect(base, board.id, cookie(gm), '/t3d/ws');
  const b = connect(base, board.id, cookie(pl), '/t3d/ws');
  await a.next((m) => m.t === 'state'); await b.next((m) => m.t === 'state');
  t3d.kick(board.id, pl.id);
  assert.deepEqual(await b.next((m) => m.t === 'kicked'), { t: 'kicked' });
  assert.equal(await b.closed(), 4403);
  t3d.kick('otro-tablero', gm.id);
  t3d.onBoardDeleted(board.id);
  assert.deepEqual(await a.next((m) => m.t === 'kicked'), { t: 'kicked', deleted: true });
  assert.equal(await a.closed(), 4403);
  assert.equal(t3d.isLoaded(board.id), false);
  await q.deleteBoard(board.id);
});

test('anfitrión mínimo: close() cierra las conexiones propias y vuelca la mesa', async () => {
  const { gm, board, cookie } = await people('Close');
  const { mod, srv } = makeHost();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const a = connect(url, board.id, cookie(gm), '/t3d/ws');
  await a.next((m) => m.t === 'state');
  a.send({ t: 'live', req: 1, key: 'tokens', op: 'set', data: { t1: F.token(gm.id) } });
  await a.next((m) => m.t === 'ack');
  await mod.close();
  assert.equal(await a.closed(), 1001);
  assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM t3d.live_docs WHERE board_id = $1', [board.id])).rows[0].n, 1);
  await new Promise((r) => srv.close(r));
});

test('anfitrión mínimo: con enabled:false el módulo no migra, no sirve nada y rechaza la conexión', async () => {
  const { gm, board, cookie } = await people('Off');
  const { mod, srv } = makeHost({ enabled: false });
  assert.equal(mod.enabled, false);
  assert.deepEqual(await mod.migrate(), []);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const js = await fetch(url + '/t3d/t3d.js');
  assert.equal(js.status, 200, 't3d.js existe (vacío) para que la página no dé error');
  assert.doesNotMatch(await js.text(), /Tablero3D/);
  assert.equal((await fetch(url + '/t3d/t3d.css')).status, 404);
  assert.equal((await fetch(url + `/api/t3d/boards/${board.id}/scenes`, { headers: { Cookie: cookie(gm) } })).status, 404);
  const a = connect(url, board.id, cookie(gm), '/t3d/ws');
  assert.match((await a.next((m) => m.t === 'error')).error, /no está activado/);
  assert.equal(await a.closed(), 4404);
  // el resto de ganchos no hace nada y no deja temporizadores
  mod.kick(board.id, gm.id); mod.onBoardDeleted(board.id); mod.leave({});
  assert.equal(await mod.settingsChanged(board.id), undefined, 'JA-VTT lo llama al cambiar sus ajustes aunque el módulo esté apagado');
  assert.deepEqual(await mod.describeBoards([{ id: board.id }]), [{ id: board.id }]);
  assert.deepEqual(await mod.tagBoards([{ id: board.id }]), [{ id: board.id }]);
  assert.equal(await mod.markBoard(board.id), false);
  assert.deepEqual(await mod.join({}), {});
  assert.equal(await mod.ws({}, { t: 'live' }), false);
  assert.equal(mod.isLoaded(board.id), false);
  await mod.flushAll(); await mod.close();
  await new Promise((r) => srv.close(r));
});

/* ---- integrado (T8): los ajustes del tablero son los del anfitrión (JA-VTT: b.settings), con boardSettings/setBoardSettings ---- */
function hostWithSettings() {
  const store = new Map(), writes = [];
  const h = makeHost({
    boardSettings: async (id) => store.get(id) || null,
    setBoardSettings: async (id, patch) => { writes.push(patch); store.set(id, Object.assign({}, store.get(id), patch)); },
  });
  return Object.assign(h, { store, writes });
}
async function listen(srv) { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${srv.address().port}`; }
const callAt = async (url, cookie, method, path, body) => {
  const res = await fetch(url + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : body && JSON.stringify(body) });
  return { status: res.status, body: await res.text() };
};
const R = require('../../modules/tablero3d/rules');

test('integrado: los ajustes con clave de JA-VTT se leen y guardan en el anfitrión; t3d.boards.settings sólo guarda los propios', async () => {
  const { pl, board, cookie, gm } = await people('Aj');
  const H = hostWithSettings(); const url = await listen(H.srv);
  const init = { entries: [{ id: 1, name: 'Orco', value: 12 }], turn: 0, round: 1 };
  H.store.set(board.id, { diceEnabled: false, chatEnabled: true, hpVisibility: 'gm', initiative: init });
  // una copia vieja en el 3D (de antes de integrarlo) ya no manda
  await db.pool.query('UPDATE t3d.boards SET settings = $2 WHERE board_id = $1', [board.id, JSON.stringify({ chatEnabled: false, diceEnabled: true })]);
  const s = `/api/t3d/boards/${board.id}/settings`;
  assert.deepEqual(JSON.parse((await callAt(url, cookie(pl), 'GET', s)).body).settings, R.cleanSettings({ diceEnabled: false, hpVisibility: 'gm' }));
  const put = await callAt(url, cookie(gm), 'PATCH', s, { chatEnabled: false, hpVisibility: 'nada', foo: 1, initiative: { entries: [] } });
  assert.equal(put.status, 200, put.body);
  const want = R.cleanSettings({ diceEnabled: false, hpVisibility: 'gm', chatEnabled: false });
  assert.deepEqual(JSON.parse(put.body).settings, want);
  assert.deepEqual(H.writes, [want], 'al anfitrión van sus claves (BOARD_KEYS sin initiative), saneadas');
  assert.deepEqual(H.store.get(board.id).initiative, init, 'la iniciativa del anfitrión no se toca');
  assert.deepEqual((await db.pool.query('SELECT settings FROM t3d.boards WHERE board_id = $1', [board.id])).rows[0].settings, {}, 'en el 3D, sólo las claves propias (hoy ninguna)');
  // sin nada en el anfitrión: los valores por defecto de JA-VTT
  H.store.delete(board.id);
  assert.deepEqual(JSON.parse((await callAt(url, cookie(gm), 'GET', s)).body).settings, R.DEFAULT_SETTINGS);
  // el jugador lee las escenas con la privacidad de los ajustes del anfitrión (hpVisibility 'gm': sin vida ajena)
  H.store.set(board.id, { hpVisibility: 'gm' });
  await callAt(url, cookie(gm), 'PUT', `/api/t3d/boards/${board.id}/scenes/s1`, F.map(8));
  const mini = JSON.parse((await callAt(url, cookie(pl), 'GET', `/api/t3d/boards/${board.id}/scenes/s1`)).body).scene.minis[0];
  assert.equal(mini.sheet.hp, undefined, JSON.stringify(mini.sheet));
  await H.mod.close(); await new Promise((r) => H.srv.close(r));
});

test('integrado: la mesa 3D sigue los ajustes del anfitrión — cada tirada los relee y settingsChanged los reparte', async () => {
  const { pl, board, cookie, gm } = await people('Sync');
  const H = hostWithSettings(); const url = await listen(H.srv);
  H.store.set(board.id, { chatEnabled: false });
  const a = connect(url, board.id, cookie(gm), '/t3d/ws');
  assert.equal((await a.next((m) => m.t === 'state')).settings.chatEnabled, false, 'el state lleva los del anfitrión');
  const b = connect(url, board.id, cookie(pl), '/t3d/ws');
  await b.next((m) => m.t === 'state');
  // el anfitrión apaga los dados por su cuenta (sin avisar): la tirada siguiente ya no pasa y la mesa se entera
  H.store.set(board.id, { chatEnabled: false, diceEnabled: false });
  a.send({ t: 'roll', req: 1, formula: 'd20' });
  assert.match((await a.next((m) => m.t === 'ack' && m.req === 1)).error, /desactivados/);
  assert.equal((await b.next((m) => m.t === 'settings')).settings.diceEnabled, false);
  assert.ok(await b.silence((m) => m.t === 'msg' && m.topic === 'roll'));
  // y con aviso (su pestaña Mesa): settingsChanged reparte al momento, sin esperar a otro mensaje
  H.store.set(board.id, { chatEnabled: true, diceEnabled: true });
  await H.mod.settingsChanged(board.id);
  assert.deepEqual([(await b.next((m) => m.t === 'settings')).settings.chatEnabled, (await a.next((m) => m.t === 'settings' && m.settings.diceEnabled)).settings.chatEnabled], [true, true]);
  await H.mod.settingsChanged(board.id);
  assert.ok(await b.silence((m) => m.t === 'settings'), 'sin cambios no se reparte nada');
  await H.mod.settingsChanged('otro');
  a.send({ t: 'roll', req: 2, formula: 'd20' });
  assert.equal((await a.next((m) => m.t === 'ack' && m.req === 2)).ok, true);
  await a.close(); await b.close();
  await H.mod.close(); await new Promise((r) => H.srv.close(r));
});

/* ---- límites de cuerpo por ruta y cuota con una sola medida (T8) ---- */
test('límites: cada ruta admite el cuerpo de su documento más grande; lo que pasa, 413 en castellano sin cortar la conexión', async () => {
  const { board, cookie, gm } = await people('Lim');
  const u = `/api/t3d/boards/${board.id}`;
  const big = (n) => JSON.stringify({ x: 'a'.repeat(n) });
  const small = await call(cookie(gm), 'PATCH', u + '/settings', big(R.BODY_LIMITS.small));
  assert.deepEqual([small.status, JSON.parse(small.body).error], [413, 'La petición es demasiado grande: aquí se admiten hasta 64 KB']);
  const scene = await call(cookie(gm), 'PUT', u + '/scenes/s1', big(R.BODY_LIMITS.scenes));
  assert.deepEqual([scene.status, JSON.parse(scene.body).error], [413, 'La petición es demasiado grande: aquí se admiten hasta 2,1 MB']);
  const travel = await call(cookie(gm), 'POST', u + '/travel', big(R.BODY_LIMITS.travel));
  assert.equal(travel.status, 413);
  // un ajuste de más de 64 KB no se admite aunque llegue a trozos (sin Content-Length)
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(base + u + '/settings', { method: 'PATCH', headers: { Cookie: cookie(gm), 'Content-Type': 'application/json' } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, text, chunked: req.getHeader('content-length') === undefined }));
    });
    req.on('error', reject);
    req.write('{"x":"'); for (let i = 0; i < 20; i++) req.write('a'.repeat(4096)); req.end('"}');
  });
  assert.deepEqual([chunked.status, JSON.parse(chunked.text).error, chunked.chunked], [413, 'La petición es demasiado grande: aquí se admiten hasta 64 KB', true]);
  // lo que cabe pasa: un dibujo por encima del tope de escena, dentro del suyo
  const d = F.drawing('c_grande', 1);
  d.frameNames = Array.from({ length: 3 }, () => 'n'); d.pad = 'p'.repeat(R.BODY_LIMITS.scenes);
  assert.equal((await call(cookie(gm), 'PUT', u + '/drawings/c_grande', d)).status, 200);
});

test('cuota: bytes del JSON guardado de escenas y campañas y de las capas PNG de los dibujos; sustituir un documento no cuenta dos veces', async () => {
  const { board, cookie, gm } = await people('Cuota');
  const u = `/api/t3d/boards/${board.id}`;
  const usage = async () => JSON.parse((await call(cookie(gm), 'GET', u + '/usage')).body).usage;
  const sceneBytes = R.docBytes(R.cleanMap(F.map(8)));
  assert.equal((await call(cookie(gm), 'PUT', u + '/scenes/s1', F.map(8))).status, 200);
  assert.equal((await usage()).bytes, sceneBytes, 'la escena cuenta lo que ocupa su JSON');
  assert.equal((await call(cookie(gm), 'PUT', u + '/scenes/s1', F.map(8))).status, 200);
  assert.equal((await usage()).bytes, sceneBytes, 'guardarla otra vez no la cuenta dos veces');
  const png = Buffer.from(F.PNG_1x1.split(',')[1], 'base64').length;
  assert.equal((await call(cookie(gm), 'PUT', u + '/drawings/c_heroe1', F.drawing('c_heroe1', 2))).status, 200);
  assert.equal((await usage()).bytes, sceneBytes + 2 * png, 'el dibujo cuenta sus capas PNG (sin base64)');
  const camp = F.campaign('cq');
  assert.equal((await call(cookie(gm), 'PUT', u + '/campaigns/cq', camp)).status, 200);
  const all = sceneBytes + 2 * png + R.docBytes(R.cleanCampaign(camp));
  const { bytes, quota } = await usage();
  assert.deepEqual([bytes, quota], [all, 500 * 1024 * 1024]);
  // casi lleno: otra escena no cabe, pero la misma escena sí se puede volver a guardar
  await db.pool.query('UPDATE t3d.scenes SET size = $3 WHERE board_id = $1 AND id = $2', [board.id, 's1', quota - (all - sceneBytes) - 10]);
  const full = await call(cookie(gm), 'PUT', u + '/scenes/s2', F.map(8));
  assert.deepEqual([full.status, JSON.parse(full.body).error], [413, 'El almacén del tablero está lleno']);
  assert.equal((await call(cookie(gm), 'PUT', u + '/campaigns/cq', camp)).status, 200, 'sustituir la campaña cabe');
  assert.equal((await call(cookie(gm), 'PUT', u + '/campaigns/cr', camp)).status, 413);
  assert.equal((await call(cookie(gm), 'PUT', u + '/drawings/c_otro', F.drawing('c_otro', 1))).status, 413);
  assert.equal((await call(cookie(gm), 'PUT', u + '/scenes/s1', F.map(8))).status, 200, 'sustituir la escena cabe');
  assert.equal((await usage()).bytes, all);
  // lo guardado antes de la migración 006 (size NULL) se mide al arrancar con la misma cuenta
  await db.pool.query('UPDATE t3d.scenes SET size = NULL WHERE board_id = $1', [board.id]);
  await db.pool.query('UPDATE t3d.campaigns SET size = NULL WHERE board_id = $1', [board.id]);
  assert.deepEqual(await t3d.migrate(), []);
  assert.equal((await usage()).bytes, all);
});
