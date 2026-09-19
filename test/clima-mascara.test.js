'use strict';
/* Máscara de zonas interiores del clima (weather.js): el recorte de polígonos al rectángulo de pantalla. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWeather() {
  const ctx = { document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, Math, JSON, Object, Array, Number, String, Promise };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'weather.js'), 'utf8') + '\nthis.__w=Weather;', ctx);
  const w = ctx.__w;
  // los objetos salen de otro realm (prototipos distintos): se comparan por JSON
  return { clipPolyRect: (...a) => JSON.parse(JSON.stringify(w.clipPolyRect(...a))) };
}
const P = (...c) => { const o = []; for (let i = 0; i < c.length; i += 2) o.push({ x: c[i], y: c[i + 1] }); return o; };

test('clipPolyRect: un polígono dentro del rectángulo no cambia; uno fuera desaparece', () => {
  const W = loadWeather();
  assert.deepEqual(W.clipPolyRect(P(10, 10, 90, 10, 50, 80), 0, 0, 100, 100), P(10, 10, 90, 10, 50, 80));
  assert.deepEqual(W.clipPolyRect(P(200, 200, 300, 200, 250, 300), 0, 0, 100, 100), []);
});

test('clipPolyRect: un polígono que sale por un borde se recorta y todos sus puntos quedan dentro', () => {
  const W = loadWeather();
  const out = W.clipPolyRect(P(50, 50, 150, 50, 150, 150, 50, 150), 0, 0, 100, 100);
  assert.deepEqual(out, P(50, 50, 100, 50, 100, 100, 50, 100));
  // saliendo por dos lados y por arriba (como una zona al desplazar el tablero)
  const big = W.clipPolyRect(P(-50, -50, 150, -50, 150, 60, -50, 60), 0, 0, 100, 100);
  assert.ok(big.length >= 4 && big.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100), JSON.stringify(big));
});

test('la máscara recorta cada zona a la pantalla y el rectángulo exterior sobresale de ella (el agujero siempre queda dentro)', () => {
  const w = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'weather.js'), 'utf8');
  assert.match(w, /g\.beginFill\(0xffffff\);g\.drawRect\(-64,-64,fx\.w\+128,fx\.h\+128\)/);
  assert.match(w, /const poly=clipPolyRect\(pts,0,0,fx\.w,fx\.h\);if\(poly\.length<3\)continue;/);
  assert.match(w, /g\.beginHole\(\);g\.drawPolygon\(poly\.flatMap\(p=>\[p\.x,p\.y\]\)\);g\.endHole\(\)/);
});
