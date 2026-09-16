'use strict';
/* Recuperación de contraseña, chat, dados e iniciativa */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const app = require('../server/app');

let base, gmCookie, plCookie, boardId, sceneId;
const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}), body: JSON.stringify(body) });
const getJson = (path, cookie) => fetch(base + path, { headers: { Cookie: cookie } }).then((r) => r.json());
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

before(async () => {
  await resetSchema(); await app.prepare();
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => { await app.stop(); });

const isState = (m) => m.t === 'state';

test('registro devuelve código de recuperación; con él se cambia la contraseña y las sesiones viejas caen', async () => {
  const reg = await post('/api/register', { name: 'Ana', password: 'secreto1' });
  assert.equal(reg.status, 201);
  const body = await reg.json();
  assert.match(body.recovery_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const oldCookie = cookieOf(reg);
  assert.equal((await getJson('/api/me/recovery', oldCookie)).recovery_code, body.recovery_code);

  assert.equal((await post('/api/recover', { name: 'ana', code: 'MALO-MALO-MALO', password: 'nueva123' })).status, 401);
  assert.equal((await post('/api/recover', { name: 'ana', code: body.recovery_code, password: '123' })).status, 400);
  const rec = await post('/api/recover', { name: 'ana', code: body.recovery_code.toLowerCase().replace(/-/g, ' '), password: 'nueva123' });
  assert.equal(rec.status, 200, 'el código se acepta sin guiones ni mayúsculas');
  assert.equal((await post('/api/login', { name: 'Ana', password: 'secreto1' })).status, 401);
  assert.equal((await post('/api/login', { name: 'Ana', password: 'nueva123' })).status, 200);
  assert.equal((await fetch(base + '/api/me', { headers: { Cookie: oldCookie } })).status, 401, 'la sesión anterior ya no vale');
});

test('una cuenta sin código (anterior a la migración) recibe uno al entrar', async () => {
  await db.pool.query("UPDATE users SET recovery_code = NULL WHERE lower(name) = 'ana'");
  const login = await post('/api/login', { name: 'Ana', password: 'nueva123' });
  assert.equal(login.status, 200);
  const code = (await getJson('/api/me/recovery', cookieOf(login))).recovery_code;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await db.q.userByName('Ana')).recovery_code, code);
});

test('regenerar el código invalida el anterior; cambiar contraseña exige la actual', async () => {
  const login = await post('/api/login', { name: 'Ana', password: 'nueva123' });
  const cookie = cookieOf(login);
  const before = (await getJson('/api/me/recovery', cookie)).recovery_code;
  const after = (await (await post('/api/me/recovery', {}, cookie)).json()).recovery_code;
  assert.notEqual(before, after);
  assert.equal((await post('/api/recover', { name: 'Ana', code: before, password: 'otra1234' })).status, 401);
  assert.equal((await post('/api/me/password', { current: 'mal', password: 'otra1234' }, cookie)).status, 401);
  assert.equal((await post('/api/me/password', { current: 'nueva123', password: 'otra1234' }, cookie)).status, 200);
  assert.equal((await post('/api/login', { name: 'Ana', password: 'otra1234' })).status, 200);
});

test('chat y dados: llegan a todos, quedan en la base y vienen en el estado; el director puede apagarlos', async () => {
  gmCookie = cookieOf(await post('/api/register', { name: 'Dire', password: 'secreto1' }));
  plCookie = cookieOf(await post('/api/register', { name: 'Juga', password: 'secreto1' }));
  boardId = (await (await post('/api/boards', { name: 'Mesa' }, gmCookie)).json()).board.id;
  const code = (await getJson(`/api/boards/${boardId}`, gmCookie)).board.invite_code;
  await post('/api/join', { code }, plCookie);
  sceneId = (await db.q.board(boardId)).active_scene;

  const gm = connect(base, boardId, gmCookie), pl = connect(base, boardId, plCookie);
  await gm.opened; await pl.opened;
  const st = await gm.next(isState); await pl.next(isState);
  assert.deepEqual(st.chat, []);
  assert.equal(st.settings.chatEnabled, true);

  pl.send({ t: 'chat', text: '  hola mesa  ' });
  const got = await gm.next((m) => m.t === 'chat');
  assert.equal(got.msg.kind, 'text'); assert.equal(got.msg.body.text, 'hola mesa'); assert.equal(got.msg.user_name, 'Juga');
  assert.equal((await pl.next((m) => m.t === 'chat')).msg.id, got.msg.id, 'el emisor también lo recibe');

  pl.send({ t: 'roll', formula: '2d6+1', label: 'Ataque' });
  const roll = await gm.next((m) => m.t === 'chat' && m.msg.kind === 'roll');
  assert.equal(roll.msg.body.formula, '2d6+1'); assert.equal(roll.msg.body.label, 'Ataque');
  assert.equal(roll.msg.body.dice[0].rolls.length, 2);
  assert.equal(roll.msg.body.total, roll.msg.body.dice[0].rolls[0] + roll.msg.body.dice[0].rolls[1] + 1);
  await pl.next((m) => m.t === 'chat' && m.msg.kind === 'roll');

  pl.send({ t: 'roll', formula: 'd7' });
  assert.match((await pl.next((m) => m.t === 'error')).error, /No hay dados de 7/);

  // el director apaga el chat: nadie puede escribir (él tampoco); los dados siguen
  gm.send({ t: 'ops', scene: sceneId, up: [], del: [], settings: { chatEnabled: false } });
  const set = await pl.next((m) => m.t === 'ops' && m.settings);
  assert.equal(set.settings.chatEnabled, false);
  assert.equal(set.settings.diceEnabled, true);
  assert.equal(set.settings.initiative, undefined, 'la iniciativa no viaja dentro de los ajustes del jugador');
  pl.send({ t: 'chat', text: 'eh' });
  assert.match((await pl.next((m) => m.t === 'error')).error, /chat está desactivado/);
  gm.send({ t: 'chat', text: 'yo tampoco' });
  assert.match((await gm.next((m) => m.t === 'error')).error, /chat está desactivado/);
  pl.send({ t: 'roll', formula: 'd20' });
  await pl.next((m) => m.t === 'chat' && m.msg.kind === 'roll');
  await gm.next((m) => m.t === 'chat' && m.msg.kind === 'roll');
  // y apaga los dados: nadie tira
  gm.send({ t: 'ops', scene: sceneId, up: [], del: [], settings: { diceEnabled: false } });
  await pl.next((m) => m.t === 'ops' && m.settings && m.settings.diceEnabled === false);
  pl.send({ t: 'roll', formula: 'd20' });
  assert.match((await pl.next((m) => m.t === 'error')).error, /dados están desactivados/);
  gm.send({ t: 'roll', formula: 'd20', secret: true });
  assert.match((await gm.next((m) => m.t === 'error')).error, /dados están desactivados/);
  gm.send({ t: 'ops', scene: sceneId, up: [], del: [], settings: { diceEnabled: true } });
  await pl.next((m) => m.t === 'ops' && m.settings && m.settings.diceEnabled === true);

  // tirada privada del director: sólo él la recibe y no se guarda
  gm.send({ t: 'roll', formula: '1d20+2', secret: true, label: 'Percepción del goblin' });
  const secret = await gm.next((m) => m.t === 'chat' && m.msg.secret);
  assert.equal(secret.msg.body.label, 'Percepción del goblin');
  assert.ok(await pl.silence((m) => m.t === 'chat' && m.msg.secret, 400), 'el jugador no ve la tirada privada');
  pl.send({ t: 'roll', formula: 'd4', secret: true });
  const notSecret = await gm.next((m) => m.t === 'chat' && m.msg.kind === 'roll' && !m.msg.secret);
  assert.equal(notSecret.msg.body.formula, '1d4', 'un jugador no puede tirar en privado: su tirada es pública');

  await app.flushAll();
  const rows = await db.q.recentChat(boardId, 10);
  assert.equal(rows.length, 4, 'texto, tirada, tirada del jugador con chat apagado, d4 público; la privada no se guarda');
  await pl.close();
  const again = connect(base, boardId, plCookie); await again.opened;
  const st2 = await again.next(isState);
  assert.deepEqual(st2.chat.map((m) => m.kind), ['text', 'roll', 'roll', 'roll'], 'el historial llega en orden');
  assert.equal((await db.q.board(boardId)).settings.chatEnabled, false, 'el ajuste se persistió');
  await gm.close(); await again.close();
});

test('iniciativa: sólo el director la cambia; los jugadores la ven sólo si está activada y sin fichas ocultas', async () => {
  const gm = connect(base, boardId, gmCookie), pl = connect(base, boardId, plCookie);
  await gm.opened; await pl.opened;
  const gs = await gm.next(isState); const ps = await pl.next(isState);
  assert.deepEqual(gs.initiative, { entries: [], turn: 0, round: 1 });
  assert.equal(ps.initiative, null, 'oculta por defecto');

  gm.send({ t: 'ops', scene: sceneId, up: [{ id: 501, type: 'token', kind: 'enemy', name: 'Acechador', x: 25, y: 25, size: 1, hidden: true, owner: null }], del: [] });
  pl.send({ t: 'initiative', initiative: { entries: [{ id: 1, name: 'Tramposo', value: 99 }], turn: 0, round: 1 } });
  assert.ok(await gm.silence((m) => m.t === 'initiative', 300), 'lo del jugador se ignora');

  gm.send({ t: 'initiative', initiative: { entries: [{ id: 1, name: 'Lyra', value: 18 }, { id: 2, name: 'Acechador', value: 15, tokenId: 501 }, { id: 3, name: 'Goblin', value: 7.5 }, { id: 4, name: 'Secreto', value: 3, hidden: true }], turn: 1, round: 2 } });
  const gi = await gm.next((m) => m.t === 'initiative');
  assert.equal(gi.initiative.entries.length, 4); assert.equal(gi.initiative.turn, 1); assert.equal(gi.initiative.round, 2);
  const pi = await pl.next((m) => m.t === 'initiative');
  assert.equal(pi.initiative, null, 'sigue oculta para el jugador');

  gm.send({ t: 'ops', scene: sceneId, up: [], del: [], settings: { initiativeShown: true } });
  const shown = await pl.next((m) => m.t === 'initiative' && m.initiative);
  assert.deepEqual(shown.initiative.entries.map((e) => e.name), ['Lyra', 'Goblin'], 'sin la ficha oculta ni la entrada oculta');
  assert.equal(shown.initiative.round, 2);

  await app.flushAll();
  const stored = (await db.q.board(boardId)).settings;
  assert.equal(stored.initiative.entries.length, 4);
  assert.equal(stored.initiativeShown, true);
  await pl.close();
  const again = connect(base, boardId, plCookie); await again.opened;
  assert.equal((await again.next(isState)).initiative.entries.length, 2);
  await gm.close(); await again.close();
});
