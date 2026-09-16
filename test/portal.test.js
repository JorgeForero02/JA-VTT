'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const { connect } = require('./helpers/ws');
const app = require('../server/app');

let base, gmCookie, plCookie, boardId, sceneA;
const json = (cookie, method, path, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }).then((r) => r.json());
async function session(name) {
  const res = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  return res.headers.get('set-cookie').split(';')[0];
}
before(async () => {
  await resetSchema(); await app.prepare();
  base = `http://127.0.0.1:${await app.listen(0)}`;
  gmCookie = await session('Dire'); plCookie = await session('Juga');
  boardId = (await json(gmCookie, 'POST', '/api/boards', { name: 'Portales' })).board.id;
  const code = (await json(gmCookie, 'GET', `/api/boards/${boardId}`)).board.invite_code;
  await json(plCookie, 'POST', '/api/join', { code });
  sceneA = (await db.q.board(boardId)).active_scene;
});
after(async () => { await app.stop(); });

const isState = (m) => m.t === 'state';

test('viaje por portal: el jugador cambia de escena con su ficha y su luz; la ficha desaparece de la escena origen', async () => {
  const gm = connect(base, boardId, gmCookie); const pl = connect(base, boardId, plCookie);
  await gm.opened; await pl.opened; await gm.next(isState); await pl.next(isState);

  // escena B con una luz propia; el director la crea sin abrirla
  gm.send({ t: 'scene', op: 'create', name: 'Sótano' });
  const scenes = await gm.next((m) => m.t === 'scenes' && m.scenes.length === 2);
  const sceneB = scenes.scenes.find((s) => s.id !== sceneA).id;

  // portal en A hacia B, ficha del jugador con antorcha al lado del portal
  const portal = { id: 9001, type: 'wall', kind: 'portal', a: { x: 200, y: 100 }, b: { x: 200, y: 200 }, target: { scene: sceneB, portal: null } };
  const token = { id: 9002, type: 'token', kind: 'player', name: 'Heroína', owner: (await db.q.userByName('Juga')).id, x: 175, y: 150, size: 1, hidden: false, vision: true, light: { on: true, preset: 'torch', bright: 20, dim: 20, color: '#FFA652', intensity: 1, anim: 'flicker', angle: 360, rot: 0 } };
  gm.send({ t: 'ops', scene: sceneA, up: [portal, token], del: [] });
  const got = await pl.next((m) => m.t === 'ops' && m.up && m.up.length === 2);
  assert.equal(got.up.find((o) => o.id === 9002).light.on, true, 'la luz llega encendida al jugador');

  pl.send({ t: 'travel', portal: 9001 });
  const state = await pl.next(isState);
  assert.equal(state.scene.id, sceneB, 'el jugador está en la escena B');
  const mine = state.objects.find((o) => o.id === 9002);
  assert.ok(mine, 'su ficha viaja con él');
  assert.equal(mine.light.on, true, 'la luz sigue encendida tras el viaje');
  assert.equal(mine.owner, token.owner);
  assert.equal(state.settings.env, 'interior', 'la escena nueva llega con sus ajustes por defecto');

  const del = await gm.next((m) => m.t === 'ops' && m.del && m.del.includes(9002));
  assert.ok(del, 'el director en A ve desaparecer la ficha');
  const where = await gm.next((m) => m.t === 'scenes' && m.where[String(token.owner)] === sceneB);
  assert.ok(where);

  await app.flushAll();
  const inB = await db.q.sceneObjects(sceneB);
  assert.deepEqual(inB.map((o) => o.id), [9002]);
  assert.equal((await db.q.sceneObjects(sceneA)).some((o) => o.id === 9002), false);

  // el director viaja solo a mirar: recibe estado de B con la ficha y su luz
  gm.send({ t: 'travel', portal: 9001 });
  const gmState = await gm.next(isState);
  assert.equal(gmState.scene.id, sceneB);
  assert.equal(gmState.objects.find((o) => o.id === 9002).light.on, true);

  // el jugador reconecta: sigue en B con su ficha
  await pl.close();
  const again = connect(base, boardId, plCookie); await again.opened;
  const st2 = await again.next(isState);
  assert.equal(st2.scene.id, sceneB);
  assert.ok(st2.objects.find((o) => o.id === 9002));
  await gm.close(); await again.close();
});
