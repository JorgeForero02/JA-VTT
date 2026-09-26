'use strict';
/* T6d contra el servidor: la mesa en vivo se reparte filtrada por conexión (director, dueño y otro jugador), los ajustes del
   tablero cambian lo que ve cada uno al momento, la iniciativa de JA-VTT, los planos de los jugadores, las anotaciones, la
   lectura de escenas por REST y los dados (diceEnabled). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const F = require('./helpers/fixtures');
const app = require('../../server/app');

let base;
before(async () => {
  await resetSchema();
  await app.prepare();
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => { await app.stop(); });

async function account(name) {
  const res = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user };
}
async function call(who, method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: who.cookie }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
/* director, dos jugadores y la mesa abierta con cuatro fichas: la de P1, un orco, un goblin oculto y el lobo oculto de P2 */
async function mesa(prefix) {
  const gm = await account(prefix + 'Gm'), p1 = await account(prefix + 'P1'), p2 = await account(prefix + 'P2');
  const b = (await call(gm, 'POST', '/api/boards', { name: 'Mesa ' + prefix })).data.board;
  await call(gm, 'POST', `/api/t3d/boards/${b.id}`); // JA-VTT: marca el tablero como mesa 3D
  const code = (await call(gm, 'GET', `/api/boards/${b.id}`)).data.board.invite_code;
  for (const p of [p1, p2]) await call(p, 'POST', '/api/join', { code });
  const ws = {};
  for (const [k, who] of Object.entries({ gm, p1, p2 })) { ws[k] = connect(base, b.id, who.cookie, '/t3d/ws'); await ws[k].opened; await ws[k].next((m) => m.t === 'state'); }
  let req = 0;
  const live = (w, key, op, data) => { const r = ++req; w.send({ t: 'live', req: r, key, op, data }); return w.next((m) => m.t === 'ack' && m.req === r); };
  const board = F.map(8, { minis: [], notes: [{ id: 1, x: 1, z: 1, text: 'Cofre' }, { id: 2, x: 2, z: 2, text: 'Emboscada', gmOnly: true }], plans: [{ id: 1, shape: 'circle', a: { x: 4, z: 4 }, b: { x: 6, z: 4 } }] });
  assert.equal((await live(ws.gm, 'board', 'set', { open: true, rev: 1, board })).ok, true);
  const tokens = {
    k1: F.token(p1.user.id, { sheet: { name: 'Aria', kind: 'player', hp: { cur: 7, max: 12, temp: 0 }, ac: 16, speed: 30 } }),
    o1: F.token(null, { kind: 'goblin', x: 5, sheet: { name: 'Orco', kind: 'enemy', hp: { cur: 9, max: 20, temp: 0 }, ac: 13, speed: 30 } }),
    g1: F.token(null, { kind: 'goblin', x: 6, sheet: { name: 'Goblin', kind: 'enemy', hidden: true, hp: { cur: 7, max: 7, temp: 0 }, ac: 15 } }),
    w1: F.token(p2.user.id, { kind: 'wolf', x: 1, sheet: { name: 'Lobo', kind: 'player', hidden: true, hp: { cur: 11, max: 11, temp: 0 }, ac: 13, speed: 40 } }),
  };
  assert.equal((await live(ws.gm, 'tokens', 'set', { tokens })).ok, true);
  return { gm, p1, p2, b, ws, live, url: `/api/t3d/boards/${b.id}` };
}
const tokensDoc = (w, pred = () => true) => w.next((m) => m.t === 'doc' && m.key === 'tokens' && pred(m.data)).then((m) => m.data);
const closeAll = async (ws) => { for (const w of Object.values(ws)) await w.close(); };

test('mesa en vivo por conexión: el jugador no recibe fichas ocultas ajenas ni CA de otros; el director, todo', async () => {
  const { ws, live } = await mesa('Pv');
  const g = (await tokensDoc(ws.gm)).tokens, a = (await tokensDoc(ws.p1)).tokens, c = (await tokensDoc(ws.p2)).tokens;
  assert.deepEqual(Object.keys(g).sort(), ['g1', 'k1', 'o1', 'w1']);
  assert.equal(g.o1.sheet.ac, 13);
  assert.deepEqual(Object.keys(a).sort(), ['k1', 'o1'], 'P1: ni el goblin oculto ni el lobo oculto de P2');
  assert.deepEqual([a.k1.sheet.ac, a.o1.sheet.ac, a.o1.sheet.withheld], [16, undefined, ['ac']], 'su CA sí; la del orco, no');
  assert.deepEqual(Object.keys(c).sort(), ['k1', 'o1', 'w1'], 'P2 ve su lobo oculto');
  assert.equal(c.k1.sheet.ac, undefined, 'y no la CA de la ficha de P1');
  // el jugador mueve su ficha: el eco de P2 sigue filtrado y la ficha oculta no bloquea nada (no la conoce)
  assert.equal((await live(ws.p1, 'tokens', 'update', { tokens: { k1: Object.assign({}, a.k1, { x: 6 }) } })).ok, true, 'puede pisar la casilla del goblin oculto');
  const moved = await tokensDoc(ws.p2, (d) => d.tokens.k1 && d.tokens.k1.x === 6);
  assert.equal(moved.tokens.g1, undefined);
  // al hacerla visible, le llega
  await live(ws.gm, 'tokens', 'update', { tokens: { g1: Object.assign({}, g.g1, { sheet: Object.assign({}, g.g1.sheet, { hidden: false }) }) } });
  assert.equal((await tokensDoc(ws.p1, (d) => !!d.tokens.g1)).tokens.g1.sheet.ac, undefined);
  await closeAll(ws);
});

test('ajustes en vivo: hpVisibility cambia al momento la vida que llega a los jugadores; la iniciativa, initiativeShown', async () => {
  const { ws, live, gm, url } = await mesa('Hv');
  await tokensDoc(ws.p1); await tokensDoc(ws.gm);
  assert.equal((await call(gm, 'PATCH', url + '/settings', { hpVisibility: 'gm' })).status, 200);
  const hidden = (await tokensDoc(ws.p1, (d) => d.tokens.o1 && !d.tokens.o1.sheet.hp)).tokens;
  assert.deepEqual([hidden.o1.sheet.withheld, hidden.k1.sheet.hp.cur], [['ac', 'hp'], 7], 'sin números de otros; los suyos, sí');
  await call(gm, 'PATCH', url + '/settings', { hpVisibility: 'bar_only' });
  const bar = (await tokensDoc(ws.p2, (d) => d.tokens.o1 && d.tokens.o1.sheet.hpBar)).tokens;
  assert.deepEqual([bar.o1.sheet.hp, bar.o1.sheet.hpBar, bar.k1.sheet.hpBar.cur], [undefined, { cur: 0.45, temp: 0 }, 0.6]);
  assert.ok(await ws.gm.silence((m) => m.t === 'doc' && m.key === 'tokens'), 'al director no se le reenvía nada');
  // combate: el director pone la iniciativa (formato JA-VTT); por defecto los jugadores no ven el orden, sólo su turno
  const initiative = { entries: [{ id: 1, name: 'Goblin', value: 18, tokenId: 'g1' }, { id: 2, name: 'Aria', value: 15, tokenId: 'k1' }, { id: 3, name: 'Orco', value: 9, tokenId: 'o1' }], turn: 1, round: 1 };
  await live(ws.gm, 'combat', 'set', { initiative, left: 6, dashed: false });
  const c1 = await ws.p1.next((m) => m.t === 'doc' && m.key === 'combat');
  assert.deepEqual([c1.data.initiative, c1.data.current, c1.data.active], [null, 'k1', true]);
  assert.equal((await ws.p2.next((m) => m.t === 'doc' && m.key === 'combat')).data.current, null);
  await call(gm, 'PATCH', url + '/settings', { initiativeShown: true });
  const c2 = await ws.p2.next((m) => m.t === 'doc' && m.key === 'combat' && m.data.initiative);
  assert.deepEqual(c2.data.initiative.entries.map((e) => e.name), ['Aria', 'Orco'], 'sin la ficha oculta');
  // P1 pasa su turno: el servidor avanza al orco
  assert.equal((await live(ws.p2, 'combat', 'update', { next: true })).ok, false, 'P2 no puede pasar el turno de P1');
  assert.equal((await live(ws.p1, 'combat', 'update', { left: 3 })).ok, true);
  assert.equal((await live(ws.p1, 'combat', 'update', { next: true })).ok, true);
  const c3 = await ws.gm.next((m) => m.t === 'doc' && m.key === 'combat' && m.data.initiative.turn === 2);
  assert.deepEqual([c3.data.current, c3.data.left], ['o1', 6]);
  await closeAll(ws);
});

test('planos y anotaciones en vivo: los del jugador los ven todos; los del director, al publicarlos; gmOnly sólo el director', async () => {
  const { ws, live, url, gm, p1, b } = await mesa('Pl');
  const bd = await ws.p1.next((m) => m.t === 'doc' && m.key === 'board');
  assert.deepEqual([bd.data.board.notes.map((n) => n.text), bd.data.board.plans], [['Cofre'], []]);
  const gmBoard = await ws.gm.next((m) => m.t === 'doc' && m.key === 'board');
  assert.deepEqual([gmBoard.data.board.notes.length, gmBoard.data.board.plans.length], [2, 1]);
  await live(ws.gm, 'plans', 'set', { plans: {} });
  const mine = { shape: 'cone', a: { x: 1.5, z: 1.5 }, b: { x: 4.5, z: 1.5 }, owner: String(p1.user.id), color: '#ff8800' };
  assert.equal((await live(ws.p1, 'plans', 'update', { plans: { 7: mine } })).ok, true);
  assert.equal((await ws.p2.next((m) => m.t === 'doc' && m.key === 'plans' && m.data.plans[7])).data.plans[7].shape, 'cone');
  assert.equal((await live(ws.p2, 'plans', 'update', { plans: { 7: null } })).ok, false, 'no quita el plano de otro');
  await live(ws.gm, 'board', 'set', { open: true, rev: 2, board: Object.assign({}, gmBoard.data.board, { plansReleased: true }) });
  assert.equal((await ws.p2.next((m) => m.t === 'doc' && m.key === 'board' && m.data.rev === 2)).data.board.plans.length, 1, 'publicados, los ve');
  // por REST, el jugador lee las escenas guardadas igual de filtradas
  await call(gm, 'PUT', `${url}/scenes/s1`, Object.assign({}, gmBoard.data.board, { minis: [{ kind: 'goblin', x: 1, z: 1, id: 'g1', sheet: { hidden: true } }, { kind: 'goblin', x: 2, z: 2, id: 'o1', sheet: { ac: 12 } }] }));
  const seen = (await call(p1, 'GET', `${url}/scenes/s1`)).data.scene;
  assert.deepEqual([seen.notes.length, seen.minis.map((m) => [m.id, m.sheet.ac])], [1, [['o1', undefined]]]);
  assert.equal((await call(p1, 'GET', `${url}/scenes`)).data.scenes[0].minis.length, 1);
  assert.equal((await call(gm, 'GET', `${url}/scenes/s1`)).data.scene.notes.length, 2, 'el director, todo');
  assert.ok(b.id);
  await closeAll(ws);
});

test('dados: la tirada la hace el servidor para todos; con diceEnabled apagado nadie tira', async () => {
  const { ws, gm, url } = await mesa('Dd');
  ws.p1.send({ t: 'roll', req: 1, formula: '3d6', label: 'Daño' });
  const r = await ws.p2.next((m) => m.t === 'msg' && m.topic === 'roll');
  assert.deepEqual([r.data.formula, r.data.label, r.data.dice[0].rolls.length], ['3d6', 'Daño', 3]);
  assert.deepEqual((await ws.p1.next((m) => m.t === 'msg' && m.topic === 'roll')).data, r.data, 'quien tira también la recibe');
  await call(gm, 'PATCH', url + '/settings', { diceEnabled: false });
  await ws.p1.next((m) => m.t === 'settings');
  ws.gm.send({ t: 'roll', req: 2, formula: 'd20' });
  assert.match((await ws.gm.next((m) => m.t === 'ack' && m.req === 2)).error, /desactivados/);
  assert.ok(await ws.p1.silence((m) => m.t === 'msg' && m.topic === 'roll'));
  await closeAll(ws);
});
