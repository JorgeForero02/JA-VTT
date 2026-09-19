'use strict';
/* Colisión de fichas con muros (core.js: moveBlocked / tryMove), ejecutando el código real del cliente en un vm. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const ctx = {
    window: {}, document: { querySelector: () => null, querySelectorAll: () => [] },
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem() {} },
    console, Math, JSON, Object, Array, Number, String, Date, Map, Set, Float32Array, Uint8Array,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core.js'), 'utf8');
  // los const/function de un script clásico no salen del vm: se exponen a mano
  vm.runInContext(src + '\nthis.__x={S,moveBlocked,tryMove,blocks,CELL};', ctx);
  return ctx.__x;
}
const wall = (id, ax, ay, bx, by) => ({ id, type: 'wall', kind: 'wall', a: { x: ax, y: ay }, b: { x: bx, y: by } });
const token = (x, y, size = 1) => ({ id: 9, type: 'token', kind: 'player', x, y, size });

test('de frente a un muro la ficha avanza hasta la distancia de choque, no se queda donde estaba', () => {
  const C = loadCore();
  C.S.walls = [wall(1, -100, -50, 100, -50)];
  const n = C.tryMove(token(0, 0), { x: 0, y: -100 });
  assert.equal(n.x, 0);
  assert.ok(n.y < -25 && n.y > -50, `se acerca al muro sin cruzarlo: ${JSON.stringify(n)}`);
});

test('un muro no bloquea más allá de su extremo: junto al final se pasa aunque el objetivo quede cerca de la esquina', () => {
  const C = loadCore();
  C.S.walls = [wall(1, -100, -50, 100, -50)];
  // el objetivo está a 9 px de la esquina (100,-50) pero fuera del muro (t>1): no hay pared ahí
  assert.deepEqual(C.tryMove(token(108, -20), { x: 108, y: -45 }), { x: 108, y: -45 });
  // pisar el interior del muro sigue bloqueado
  assert.ok(C.moveBlocked({ x: 0, y: -20 }, { x: 0, y: -45 }, 17));
});

test('al chocar con un muro diagonal la ficha resbala a lo largo del muro en vez de quedarse quieta', () => {
  const C = loadCore();
  C.S.walls = [wall(1, -200, -200, 200, 200)];   // diagonal 45°, la ficha arriba-derecha (x>y)
  const n = C.tryMove(token(20, -20), { x: -30, y: 70 });   // empuje a través del muro con componente a lo largo
  assert.notDeepEqual(n, { x: 20, y: -20 }, 'no se queda quieta');
  const d = (n.x - n.y) / Math.SQRT2;   // distancia al muro x=y
  assert.ok(d > 16 && d < 26, `se acerca hasta la distancia de choque sin cruzar (radio·0,8 ≈ 17): ${d.toFixed(1)}`);
  assert.ok(n.x > 20 && n.y > -20, `resbala hacia abajo-derecha: ${JSON.stringify(n)}`);
});

test('resbalar nunca atraviesa otro muro (esquina)', () => {
  const C = loadCore();
  C.S.walls = [wall(1, -200, -50, 200, -50), wall(2, 100, -50, 100, 200)];   // esquina: techo + pared derecha
  const n = C.tryMove(token(60, -20), { x: 140, y: -120 });   // hacia arriba-derecha, a través de la esquina
  assert.ok(!C.moveBlocked({ x: 60, y: -20 }, n, 17), 'la posición final es alcanzable sin cruzar');
  assert.ok(n.x < 100 && n.y > -50, `se queda dentro de la esquina: ${JSON.stringify(n)}`);
  assert.ok(n.x > 60 || n.y < -20, `pero avanza algo: ${JSON.stringify(n)}`);
});
