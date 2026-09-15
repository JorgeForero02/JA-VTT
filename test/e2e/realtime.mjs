#!/usr/bin/env node
/* Prueba de extremo a extremo contra la pila de docker compose ya levantada.
   Uso: BASE_URL=http://localhost:3000 node test/e2e/realtime.mjs
   Registra dos cuentas nuevas, comprueba que un movimiento viaja de un cliente a otro,
   reinicia el contenedor de la app y verifica que el estado sigue ahí. */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connect } = require('../helpers/ws.js');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const RESTART = process.env.E2E_RESTART !== 'no';
const suffix = Date.now().toString(36);
const steps = [];
const step = (name, ok, detail = '') => { steps.push(ok); console.log(`${ok ? 'OK ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) throw new Error(name); };

async function register(name) {
  const res = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  if (res.status !== 201) throw new Error(`register ${name}: ${res.status}`);
  return res.headers.get('set-cookie').split(';')[0];
}
const api = (cookie, method, path, body) => fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
const waitHealthy = async (ms = 60000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

step('la aplicación responde', await waitHealthy(20000));
const gmCookie = await register(`gm-${suffix}`);
const plCookie = await register(`pl-${suffix}`);
step('registro de dos cuentas con contraseña', true);
step('login con contraseña incorrecta se rechaza', (await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `gm-${suffix}`, password: 'mala' }) })).status === 401);

const board = (await api(gmCookie, 'POST', '/api/boards', { name: `E2E ${suffix}` })).data.board;
const detail = (await api(gmCookie, 'GET', `/api/boards/${board.id}`)).data.board;
step('unirse por código de invitación', (await api(plCookie, 'POST', '/api/join', { code: detail.invite_code })).status === 200);

const gm = connect(BASE, board.id, gmCookie);
const pl = connect(BASE, board.id, plCookie);
await gm.opened; await pl.opened;
const gmState = await gm.next((m) => m.t === 'state');
await pl.next((m) => m.t === 'state');
step('ambos clientes conectados por WebSocket y con estado', gmState.role === 'gm');

const tokenId = Date.now();
const token = { id: tokenId, type: 'token', x: 125, y: 175, name: 'Goblin', owner: null, size: 1, hidden: false };
let t0 = Date.now();
gm.send({ t: 'ops', scene: gmState.scene.id, up: [token], del: [] });
let got = await pl.next((m) => m.t === 'ops' && m.up && m.up.some((o) => o.id === tokenId));
step('la ficha creada por el director llega al jugador', got.up[0].x === 125, `${Date.now() - t0} ms`);

t0 = Date.now();
gm.send({ t: 'ops', scene: gmState.scene.id, up: [Object.assign({}, token, { x: 475, y: 325 })], del: [] });
got = await pl.next((m) => m.t === 'ops' && m.up && m.up.some((o) => o.id === tokenId && o.x === 475));
step('el movimiento llega al jugador', got.up[0].y === 325, `${Date.now() - t0} ms`);

pl.send({ t: 'ops', scene: gmState.scene.id, up: [Object.assign({}, token, { x: 5, y: 5 })], del: [] });
const fix = await pl.next((m) => m.t === 'ops' && m.fix);
step('el jugador no puede mover una ficha ajena (corrección del servidor)', fix.up[0].x === 475);

await gm.close(); await pl.close();

if (RESTART) {
  await new Promise((r) => setTimeout(r, 1000)); // margen para el volcado periódico (400 ms)
  execSync('docker compose restart app', { stdio: 'ignore' });
  step('contenedor de la app reiniciado y sano de nuevo', await waitHealthy());
}

const again = connect(BASE, board.id, plCookie);
await again.opened;
const state = await again.next((m) => m.t === 'state');
const stored = state.objects.find((o) => o.id === tokenId);
step(RESTART ? 'tras el reinicio la ficha sigue en su posición' : 'al reconectar la ficha sigue en su posición', !!stored && stored.x === 475 && stored.y === 325);
step('la sesión (cookie) sigue siendo válida tras el reinicio', (await api(plCookie, 'GET', '/api/me')).status === 200);
await again.close();

console.log(`\n${steps.length}/${steps.length} pasos correctos`);
process.exit(0);
