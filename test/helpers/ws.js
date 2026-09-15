'use strict';
/* Cliente WebSocket de pruebas con cola de mensajes y espera por tipo. */

function connect(base, boardId, cookie) {
  const url = base.replace(/^http/, 'ws') + `/ws?board=${encodeURIComponent(boardId)}`;
  const ws = new WebSocket(url, { headers: { Cookie: cookie } });
  const queue = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) { const [w] = waiters.splice(i, 1); w.resolve(msg); return; }
    queue.push(msg);
  };
  const next = (match, timeoutMs = 2000) => new Promise((resolve, reject) => {
    const i = queue.findIndex(match);
    if (i >= 0) return resolve(queue.splice(i, 1)[0]);
    const timer = setTimeout(() => { waiters.splice(waiters.findIndex((w) => w.resolve === resolve), 1); reject(new Error('Sin mensaje a tiempo')); }, timeoutMs);
    waiters.push({ match, resolve: (m) => { clearTimeout(timer); resolve(m); } });
  });
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('No se pudo conectar')); });
  const send = (o) => ws.send(JSON.stringify(o));
  const silence = (match, ms = 300) => new Promise((resolve) => setTimeout(() => resolve(!queue.some(match)), ms));
  const close = () => new Promise((resolve) => { ws.onclose = resolve; ws.close(); });
  return { ws, opened, next, send, silence, close, queue };
}

module.exports = { connect };
