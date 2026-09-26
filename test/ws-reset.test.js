'use strict';
/* Un cliente que corta (RST) justo cuando el servidor ya está contestando el upgrade (401/400 o el
   cierre del `catch`) no debe tumbar el proceso: en `server.on('upgrade', ...)` el socket no tiene
   escucha de 'error' hasta que `server/ws.js` (`new Socket(sock)`) pone la suya, y ese `sock.end()`/
   `sock.write()` puede fallar de forma asíncrona (ya fuera del try/catch de ese manejador) cuando el
   cliente ya mandó el RST. Ver server/app.js, server.on('upgrade'). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { resetSchema } = require('./helpers/db');
const app = require('../server/app');

let base, port;
const caught = [];
function onUncaught(e) { caught.push(e); }

before(async () => {
  await resetSchema();
  await app.prepare();
  port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
  // instalado durante toda la vida del fichero: el ECONNRESET async puede llegar bastante después
  // de que la última conexión del bombardeo se haya "resuelto" desde el punto de vista del cliente.
  process.on('uncaughtException', onUncaught);
});
after(async () => {
  process.removeListener('uncaughtException', onUncaught);
  await app.stop();
});

/* Abre una conexión TCP cruda, manda una petición de upgrade sin cookie de sesión y corta con RST
   en cuanto llega el primer byte de respuesta: eso garantiza que la petición ya se entregó y que el
   servidor ya está a mitad de contestar (401/400) o de cerrar el socket — justo la ventana async en
   la que un `sock.end()`/`sock.write()` sin escucha de 'error' revienta el proceso más tarde.
   (Resetear justo tras escribir, sin esperar respuesta, no lo reproduce de forma fiable: en loopback
   el RST local puede descartar el propio envío antes de que llegue al servidor.) */
function rawUpgradeThenReset(path) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.on('error', () => resolve()); // el cliente también puede ver ECONNRESET; no es lo que se prueba aquí
    sock.once('data', () => {
      if (typeof sock.resetAndDestroy === 'function') sock.resetAndDestroy();
      else { sock.setNoDelay(true); sock.destroy(); }
      resolve();
    });
    sock.on('connect', () => {
      const req = `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n';
      sock.write(req);
    });
  });
}

test('muchas conexiones que cortan (RST) justo al recibir respuesta del upgrade no tumban el proceso', async () => {
  const N = 500;
  await Promise.all(Array.from({ length: N }, () => rawUpgradeThenReset('/ws?board=x')));
  // deja correr lo que quedó pendiente de verdad (el ECONNRESET async puede llegar bastante después
  // de que el cliente ya se haya "resuelto" con su propio error o con el primer byte de datos)
  await new Promise((r) => setTimeout(r, 2000));
  assert.equal(caught.length, 0, `uncaughtException capturada (${caught.length}): ${caught.map((e) => e.stack || e.message).join('\n')}`);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
});
