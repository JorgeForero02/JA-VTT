'use strict';
/* Cliente WebSocket de pruebas con cola de mensajes y espera por tipo. */

/* `path`: '/ws' (el del anfitrión) o '/t3d/ws' (la conexión propia del módulo del tablero 3D) */
function connect(base, boardId, cookie, path = '/ws') {
  const url = base.replace(/^http/, 'ws') + `${path}?board=${encodeURIComponent(boardId)}`;
  const ws = new WebSocket(url, { headers: { Cookie: cookie } });
  const queue = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) { const [w] = waiters.splice(i, 1); w.resolve(msg); return; }
    queue.push(msg);
  };
  const next = (match, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const i = queue.findIndex(match);
    if (i >= 0) return resolve(queue.splice(i, 1)[0]);
    const timer = setTimeout(() => { waiters.splice(waiters.findIndex((w) => w.resolve === resolve), 1); reject(new Error('Sin mensaje a tiempo')); }, timeoutMs);
    waiters.push({ match, resolve: (m) => { clearTimeout(timer); resolve(m); } });
  });
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('No se pudo conectar')); });
  const closedCode = new Promise((resolve) => ws.addEventListener('close', (e) => resolve(e.code)));
  const closed = (ms = 5000) => Promise.race([closedCode, new Promise((resolve, reject) => setTimeout(() => reject(new Error('No se cerró a tiempo')), ms).unref())]);
  const send = (o) => ws.send(JSON.stringify(o));
  const silence = (match, ms = 300) => new Promise((resolve) => setTimeout(() => resolve(!queue.some(match)), ms));
  const close = () => new Promise((resolve) => { ws.onclose = resolve; ws.close(); });
  return { ws, opened, closed, next, send, silence, close, queue };
}

module.exports = { connect };
