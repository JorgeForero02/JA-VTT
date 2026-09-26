'use strict';
/* Ruling R3b (Tarea 5): toda ruta que sanea o filtra una escena tiene que recibir las definiciones `p:` del tablero.
   Este archivo cubre los tres caminos que la Tarea 4 dejó sin probar porque entonces no había piezas de verdad
   (T5): borrar una escena (clearPortalsTo reescribe TODAS las escenas del tablero), la vista REST del jugador
   (sceneFor) y la mesa en vivo (liveDocFor). Un tablero con una pieza normal (`p:cofre01`) y una sólo del
   director (`p:muro01`, gmOnly) en la escena A, con un portal a la escena B. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const { cuenta, llamar, mesa3d } = require('./helpers/mesa');
const { connect } = require('./helpers/ws');
const F = require('./helpers/fixtures');
const app = require('../../server/app');

let base;
before(async () => { await resetSchema(); await app.prepare(); base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.stop(); });

const pieza = (id, extra = {}) => Object.assign({ schema: 1, id: 'p:' + id, name: id, class: 'object', art: { base: 'o_' + id },
  shape: { w: 1, d: 1, height: 1, orient: true, layer: 'object' }, components: { move: { block: true }, sight: 'none', light: 'none' } }, extra);

async function tableroConPiezas(prefijo) {
  const gm = await cuenta(base, prefijo + 'Gm'), pl = await cuenta(base, prefijo + 'Pl');
  const b = await mesa3d(base, gm, 'Wiring' + prefijo);
  await llamar(base, gm, 'POST', `/api/boards/${b.id}/members`, { name: prefijo + 'Pl' });
  const pieces = `/api/t3d/boards/${b.id}/pieces`;
  await llamar(base, gm, 'PUT', pieces + '/cofre01', pieza('cofre01'));
  await llamar(base, gm, 'PUT', pieces + '/muro01', pieza('muro01', { components: { move: { block: true }, sight: 'none', light: 'none', gmOnly: true } }));
  await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/scenes/B`, F.map(8));
  const sceneA = F.map(8, { props: [
    { type: 'obj:o_cofre01', def: 'p:cofre01', x: 1, z: 1 },
    { type: 'obj:o_muro01', def: 'p:muro01', x: 2, z: 2 },
    { type: 'portal', x: 3, z: 3, id: 1, look: 'door', target: { scene: 'B', portal: null } },
  ] });
  assert.equal((await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/scenes/A`, sceneA)).status, 200);
  return { gm, pl, b };
}

test('borrar la escena B (clearPortalsTo reescribe todas las escenas): la A conserva sus dos piezas del tablero', async () => {
  const { gm, b } = await tableroConPiezas('Del');
  assert.equal((await llamar(base, gm, 'DELETE', `/api/t3d/boards/${b.id}/scenes/B`)).status, 200);
  const sc = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/scenes/A`)).data.scene;
  const pDefs = sc.props.map((p) => p.def).filter((d) => d.startsWith('p:'));
  assert.deepEqual(pDefs.sort(), ['p:cofre01', 'p:muro01'], 'ninguna de las dos se pierde al reescribir la escena');
  assert.equal(sc.props.find((p) => p.type === 'portal').target, null, 'el portal que llevaba a la escena borrada se queda sin destino');
});

test('el jugador que lee la escena A por REST no ve la pieza gmOnly del tablero', async () => {
  const { pl, b } = await tableroConPiezas('Rest');
  const sc = (await llamar(base, pl, 'GET', `/api/t3d/boards/${b.id}/scenes/A`)).data.scene;
  assert.deepEqual(sc.props.map((p) => p.def).filter((d) => d.startsWith('p:')), ['p:cofre01'], 'sin p:muro01 (gmOnly)');
});

test('el jugador en la mesa en vivo no recibe la pieza gmOnly del tablero al abrir la escena A', async () => {
  const { gm, pl, b } = await tableroConPiezas('Live');
  const sceneA = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/scenes/A`)).data.scene;
  const g = connect(base, b.id, gm.cookie, '/t3d/ws'); await g.opened; await g.next((m) => m.t === 'state');
  const p = connect(base, b.id, pl.cookie, '/t3d/ws'); await p.opened; await p.next((m) => m.t === 'state');
  g.send({ t: 'live', req: 1, key: 'board', op: 'set', data: { open: true, rev: 1, scene: 'A', board: sceneA } });
  await g.next((m) => m.t === 'ack');
  const doc = await p.next((m) => m.t === 'doc' && m.key === 'board');
  assert.deepEqual(doc.data.board.props.map((pp) => pp.def).filter((d) => d.startsWith('p:')), ['p:cofre01'], 'sin p:muro01 en la mesa en vivo del jugador');
  await g.close(); await p.close();
});
