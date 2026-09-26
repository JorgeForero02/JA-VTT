'use strict';
/* Cuentas y mesas 3D contra el servidor real de JA-VTT: registrar, llamar a la API y crear un tablero marcado 3D. */
async function cuenta(base, name) {
  const res = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'secreto1' }) });
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user };
}
async function llamar(base, who, method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: who.cookie }, body: body && JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : null };
}
// un tablero de JA-VTT marcado «Mesa 3D» (POST /api/t3d/boards/:id, como el selector de «Nuevo tablero»)
async function mesa3d(base, who, name) {
  const board = (await llamar(base, who, 'POST', '/api/boards', { name })).data.board;
  const r = await llamar(base, who, 'POST', `/api/t3d/boards/${board.id}`);
  if (!r.data || !r.data.board || r.data.board.t3d !== true) throw new Error('No se pudo marcar la mesa 3D');
  return board;
}
module.exports = { cuenta, llamar, mesa3d };
