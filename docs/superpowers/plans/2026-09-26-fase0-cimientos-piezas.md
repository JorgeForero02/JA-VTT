# Fase 0 — Cimientos de las piezas con comportamientos · Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el tablero 3D decida paso, vista, luz, puertas, portales y privacidad por los
**componentes de una definición de pieza** (catálogo único, cliente y servidor) y no por el identificador,
sin cambio visible, con la red de tests del módulo portada.

**Arquitectura:** un catálogo UMD (`modules/tablero3d/public/catalogo.js`) define las piezas de fábrica y
las funciones puras que responden «¿esta pieza bloquea / tapa / alumbra / es puerta?»; `rules.js` (servidor)
y el motor (`tablero3d.js`, `muros.js`) dejan de consultar listas por tipo y le preguntan al catálogo. Las
escenas mantienen su lista `props`; cada pieza gana `def`, `uid`, `state` (y reserva `level`, `side`).

**Tecnologías:** Node 22 (`node:test`), PostgreSQL 16, three.js r128 (vendorizado), Playwright (pruebas de
navegador). Sin dependencias nuevas.

**Spec:** [`docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md`](../specs/2026-09-26-fase0-cimientos-piezas-design.md)
(léela entera antes de empezar: §3.2 es el esquema que NO se puede cambiar después).

## Restricciones globales

- **Frontera**: sólo se edita `modules/tablero3d/**`, `test/t3d/**` (nuevo), `test/e2e/t3d.mjs`,
  `package.json` (sólo el script `test`) y `docs/**`. **Nada en `server/`, `public/` (2D) ni `test/*.test.js`
  existentes.** Si algo parece exigirlo: parar y consultar.
- **Sin cambio visible** salvo los arreglos de la spec §6 (cada uno con su test).
- Claves de datos **en inglés**; textos de interfaz y comentarios **en castellano**.
- Esquema exacto de la spec §3.2: `definition.schema = 1`; escenas guardadas con `v: 2`; prefijos de
  definición `f:`, `p:`, `d:`; `uid` = `'u'` + 8 caracteres `[a-z0-9]`; ≤ 4 estados de ≤ 4 valores;
  300 definiciones por tablero; 64 KB por definición.
- **Vuelta atrás**: las puertas escriben `state: {open, locked}` **y** `open`/`locked` en la raíz.
- Test primero; cada test roto una vez a propósito (mutación manual) y anotado en el commit.
- `npm run check` verde antes de cada commit (necesita `docker start jav-test-pg`).
- Estilo del módulo: `'use strict'`, comillas simples, punto y coma (servidor, 2 espacios); el cliente
  del módulo sigue su estilo compacto actual.
- Commits: Conventional Commits en castellano, terminando con
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Foco de revisión (lo que más puede morder y dónde queda cubierto)

1. **Escena vieja guardada en producción** (v1, con puertas con llave, portales con destino, dibujos
   `obj:o_…`, escaleras de campaña de antes) → se abre y se guarda sin perder nada. Tarea 4 (servidor) y
   Tarea 7 (cliente) con `F.escenaVieja()` que reúne todos esos casos.
2. **Jugador que mira la escena** → no recibe barreras (`gmOnly`) ni por REST, ni por la mesa en vivo, ni en
   campañas. Tarea 4, test de privacidad en los tres caminos.
3. **Dos pestañas o dos clientes que colocan piezas** → `uid` repetido: el servidor lo renueva y no pierde
   ninguna pieza. Tarea 4 (`uid` duplicado).
4. **Volver a la versión anterior tras desplegar** → las puertas siguen abiertas/cerradas/con llave porque se
   escribe también `open`/`locked`. Tarea 4 (test de espejo).
5. **Escena grande** (160×160, 5000 objetos) → `refreshEntities` y la visión no se vuelven lentos. Tarea 9
   (medida antes/después).

---

## Estructura de archivos

| Archivo | Qué es | Tarea |
|---|---|---|
| `test/t3d/helpers/{db,ws,fixtures,mesa}.js` | ayudantes de los tests portados (db resetea `public` y `t3d`) | 1 |
| `test/t3d/fixtures/ja-vtt/*.json` | datos de referencia de JA-VTT copiados de `3d-tablero` | 1 |
| `test/t3d/*.test.js` | tests portados de `3d-tablero/test/` | 1–2 |
| `test/t3d/contrato.test.js` | los datos de referencia coinciden con el código real de JA-VTT | 2 |
| `test/t3d/tools/foto-fabrica.cjs` + `test/t3d/fixtures/fabrica-antes.json` | foto del comportamiento de hoy | 3 |
| `modules/tablero3d/public/catalogo.js` | **catálogo único** (UMD): definiciones de fábrica y consultas | 3 |
| `test/t3d/catalogo.test.js` | equivalencia con la foto + consultas + validación | 3 |
| `modules/tablero3d/rules.js` | servidor: `cleanProp`, `cleanMap`, `sceneFor`, `playerDoors`, `gridOf` por catálogo | 4 |
| `test/t3d/piezas-escena.test.js` | compatibilidad de escenas, privacidad, `uid`, espejo de puertas | 4 |
| `modules/tablero3d/migrations/007-piezas.sql`, `db.js`, `index.js` | tabla y API de definiciones | 5 |
| `test/t3d/piezas-api.test.js` | API de piezas: permisos, validación, topes, cuota | 5 |
| `modules/tablero3d/public/muros.js` | pide al catálogo (sin listas propias) | 6 |
| `modules/tablero3d/public/t3d.js` | carga `catalogo.js` antes que `muros.js` | 6 |
| `modules/tablero3d/public/tablero3d.js` | motor por componentes; `serialize`/`deserialize` | 7–8 |
| `test/e2e/t3d.mjs` | pasos nuevos: luz tras puerta, barrera del jugador | 8 |
| `docs/01–07`, `modules/tablero3d/README.md` | documentación | 9 |

---

### Tarea 1: Portar los tests del módulo (red de seguridad)

**Archivos:**
- Crear: `test/t3d/helpers/db.js`, `test/t3d/helpers/ws.js`, `test/t3d/helpers/fixtures.js`, `test/t3d/helpers/mesa.js`
- Crear: `test/t3d/fixtures/ja-vtt/` (copia de `3d-tablero/test/fixtures/ja-vtt/*.json`, sin `migrations/`)
- Crear: `test/t3d/{t3d-module,t3d-host,rules,armonia,cliente-armonia,frontend,privacidad,portales,realtime,db,api}.test.js`
- Modificar: `package.json` (script `test`)

**Interfaces:**
- Produce: `require('./helpers/db')` → `{ db, t3dDb, dropSchemas, resetSchema }` (resetea `public` **y** `t3d`);
  `require('./helpers/mesa')` → `{ servidor(), cuenta(base, nombre), llamar(base, quien, metodo, ruta, cuerpo), mesa3d(base, quien, nombre) }`.

- [ ] **Paso 1: ayudantes.** `test/t3d/helpers/db.js`:

```js
'use strict';
/* Base de pruebas del tablero 3D dentro de JA-VTT. `resetSchema()` borra `public` Y `t3d`: con sólo
   `public`, el esquema t3d se quedaría sin sus claves ajenas. Nunca apuntar a producción. */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://jav:jav@localhost:55432/jav_test';
const db = require('../../../server/db');
const t3dDb = require('../../../modules/tablero3d/db').createDb(db.pool);

async function dropSchemas() {
  await db.pool.query('DROP SCHEMA IF EXISTS t3d CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
async function resetSchema() {
  await dropSchemas();
  return [...await db.migrate(), ...await t3dDb.migrate()];
}
module.exports = { db, t3dDb, dropSchemas, resetSchema };
```

`ws.js` y `fixtures.js`: copia literal de `3d-tablero/test/helpers/ws.js` y `.../fixtures.js`.
`mesa.js` (nuevo, lo usan los tests de servidor):

```js
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
```

- [ ] **Paso 2: comprobar que la respuesta de registro de JA-VTT trae `user`.**
  Ejecuta: `grep -n "'/api/register'\|register" server/app.js | head` y confirma que responde `{ user, recovery… }`.
  Si la clave se llama distinto, ajusta `cuenta()` (sólo aquí).

- [ ] **Paso 3: copiar los tests portables** de `3d-tablero/test/` a `test/t3d/` con estas sustituciones
  (y ninguna otra), en este orden:

| Buscar | Sustituir por |
|---|---|
| `require('../modules/tablero3d` | `require('../../modules/tablero3d` |
| `require('../server/` | `require('../../server/` |
| `path.join(__dirname, '..', 'modules'` | `path.join(__dirname, '..', '..', 'modules'` |
| `path.join(__dirname, 'fixtures'` | igual (la carpeta `fixtures/` va junto a los tests) |
| lecturas del cliente del anfitrión de `3d-tablero` (`'..', 'public', 'js', 'icons.js'`, `'..', 'public', 'css', 'app.css'`) | `'..', '..', 'public', 'js', 'icons.js'` / `'..', '..', 'public', 'css', 'app.css'` (los reales de JA-VTT) |

  Suites y qué se porta de cada una:
  - `t3d-module.test.js`, `t3d-host.test.js`, `rules.test.js` (usa `core.str`: el `str` de `server/rules.js`
    de JA-VTT existe y es igual), `armonia.test.js`, `cliente-armonia.test.js`, `frontend.test.js`: **enteras**.
  - `privacidad.test.js`, `portales.test.js`: enteras, con dos cambios en su función `mesa(...)`/de montaje:
    tras crear el tablero, `await llamar(base, gm, 'POST', \`/api/t3d/boards/${b.id}\`)`; y cada
    `connect(base, b.id, cookie)` pasa a `connect(base, b.id, cookie, '/t3d/ws')`.
  - `realtime.test.js`: los tests «sin sesión…», «al conectar llega el estado…», «mesa en vivo…»,
    «persistencia…», «momentos…», «presencia…» y «conexión propia del módulo (/t3d/ws…)», con los mismos dos
    cambios. **No** se porta «expulsar o borrar el tablero cierra la conexión; renombrar y unirse avisan» (es
    del `/ws` del anfitrión de aquel repo; lo cubren los tests de JA-VTT). En «momentos», la comprobación del
    registro (`GET /api/boards/:id/rolls`, que JA-VTT no tiene) se sustituye por:
    `const rolls = (await db.pool.query("SELECT body FROM chat_messages WHERE board_id = $1 AND kind = 'roll'", [b.id])).rows;`
  - `db.test.js`: sólo «migrate es idempotente…», «módulo: luz de los objetos…», «módulo: su migración se
    puede repetir…», «dibujos: se guardan con sus capas…», «dibujos: un personaje guarda el tamaño…»,
    «campañas y mesa en vivo…», «borrar un tablero borra en cascada…» (sólo las tablas `t3d.*`) y «base con
    el núcleo de JA-VTT…». El resto son del núcleo de aquel repo.
  - `api.test.js`: sólo «escenas…», «dibujos…» y «campañas…», creando la mesa con `mesa3d()`.
  - `ja-vtt-contract.test.js`: **no** se porta (lo sustituye la Tarea 2).

- [ ] **Paso 4: incluir los tests en `npm test`.** En `package.json`, script `test`:
  - añadir `\"test/t3d/*.test.js\"` detrás de `\"test/*.test.js\"`;
  - añadir `--test-coverage-include=\"modules/tablero3d/*.js\"` (sólo el servidor del módulo; `public/` queda fuera).
  Los umbrales no cambian.

- [ ] **Paso 5: ejecutar.** `docker start jav-test-pg && npm test`.
  Esperado: todo verde. Si un test portado falla **por una diferencia de anfitrión** (los ajustes del tablero
  son los de JA-VTT, el registro de tiradas va al chat…), ajusta la expectativa y déjalo escrito en una línea
  `// JA-VTT: <por qué>`. **Nunca** se relaja una comprobación de privacidad: si falla una, se para y se consulta.

- [ ] **Paso 6: mutación por suite.** Rompe a mano una regla por suite y confirma rojo; luego restaura:
  `rules.js` `sceneFor` → quitar el filtro de `hidden` (privacidad y rules en rojo); `index.js` `kick` →
  cuerpo vacío (t3d-host en rojo); `muros.js` `blocks` → `return false` (frontend en rojo).

- [ ] **Paso 7: commit.**

```bash
git add test/t3d package.json
git commit -m "test(t3d): tests del módulo del tablero 3D portados de 3d-tablero contra el servidor de JA-VTT"
```

---

### Tarea 2: Contrato vivo con JA-VTT (los datos de referencia no se desfasan)

**Archivos:** Crear `test/t3d/contrato.test.js`.

- [ ] **Paso 1: test** (rojo si algún dato de referencia no coincide con el código real):

```js
'use strict';
/* Los datos de referencia de test/t3d/fixtures/ja-vtt (copiados de 3d-tablero, commit d68f41f) tienen que
   seguir siendo los del código real de JA-VTT: si el 2D cambia, este test lo avisa. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { db, resetSchema, t3dDb } = require('./helpers/db');
const ROOT = path.join(__dirname, '..', '..');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ja-vtt', n), 'utf8'));
const leer = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// public/js/core.js es un script clásico: se evalúa con lo mínimo del navegador y se devuelven sus catálogos
function core() {
  const ctx = { matchMedia: () => ({ matches: false }), document: { querySelector: () => null, querySelectorAll: () => [] } };
  vm.createContext(ctx);
  return vm.runInContext(leer('public', 'js', 'core.js') + '\n;({ WALL_TYPES, LIGHT_PRESETS, TOKEN_LIGHTS, ENVS, CONDITIONS })', ctx);
}

before(async () => { await resetSchema(); });
after(async () => { await db.close(); });

test('contrato: iconos, variables CSS, ajustes, condiciones y dados son los del código real de JA-VTT', () => {
  const icons = Object.keys(JSON.parse(/const ICONS=(\{.*?\});/s.exec(leer('public', 'js', 'icons.js'))[1]));
  for (const k of fx('icons.json').iconos) assert.ok(icons.includes(k), `icono ${k}`);
  const css = leer('public', 'css', 'app.css');
  for (const v of fx('variables-css.json').variables) assert.ok(css.includes(v + ':'), `variable ${v}`);
  const R = require(path.join(ROOT, 'server', 'rules.js'));
  const bs = fx('board-settings.json');
  assert.deepEqual(R.DEFAULT_BOARD, bs.DEFAULT_BOARD);
  assert.deepEqual(R.DEFAULT_SCENE, bs.DEFAULT_SCENE);
  assert.deepEqual([...R.CONDITION_IDS], fx('conditions.json').ids);
  const dice = require(path.join(ROOT, 'server', 'dice.js'));
  for (const [f, esperado] of Object.entries(fx('dice.json').parse)) {
    let got; try { got = dice.parse(f); } catch (e) { got = { error: e.message }; }
    assert.deepEqual(JSON.parse(JSON.stringify(got)), esperado, `fórmula ${f}`);
  }
});

test('contrato: tipos de muro, luces y momentos del cliente de JA-VTT', () => {
  const C = core();
  const wt = fx('wall-types.json').types;
  for (const [k, t] of Object.entries(wt)) for (const f of ['sight', 'light', 'move', 'hide', 'door', 'portal']) assert.equal(!!C.WALL_TYPES[k][f], !!t[f], `${k}.${f}`);
  assert.deepEqual(Object.keys(C.LIGHT_PRESETS), Object.keys(fx('light-presets.json').presets));
  assert.deepEqual([...C.TOKEN_LIGHTS], fx('light-presets.json').tokenLights);
  assert.deepEqual(Object.keys(C.ENVS), fx('envs.json').ids);
});

test('contrato: el módulo migra sobre la base de JA-VTT sin tocar sus tablas, y dos veces igual', async () => {
  const antes = (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows;
  assert.deepEqual(await t3dDb.migrate(), []);
  const despues = (await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows;
  assert.deepEqual(despues, antes);
});
```

- [ ] **Paso 2:** `node --test test/t3d/contrato.test.js`. Esperado: verde. Si `dice.parse` o una forma no
  coincide con lo guardado en el JSON, compárala a mano: es la señal de desfase que buscamos (anótala en
  `docs/06`); **no** cambies el JSON sin entender qué cambió en JA-VTT.
- [ ] **Paso 3: mutación:** cambia en la copia de trabajo `fixtures/ja-vtt/icons.json` un icono por `'no-existe'`
  → rojo; restaura.
- [ ] **Paso 4: commit** `test(t3d): contrato vivo de los datos de referencia con el código de JA-VTT`.

---

### Tarea 3: Foto del comportamiento de hoy + catálogo único

**Archivos:**
- Crear: `test/t3d/tools/foto-fabrica.cjs`, `test/t3d/fixtures/fabrica-antes.json`
- Crear: `modules/tablero3d/public/catalogo.js`
- Crear: `test/t3d/catalogo.test.js`

**Interfaces (produce; lo usan las tareas 4–8):**

```text
Catalogo.SCHEMA = 1
Catalogo.FACTORY            { 'f:<tipo>': definition }   (38 objetos + 10 terrenos)
Catalogo.defIdOf(p)         → 'f:chest' | 'd:o_xxxx' | 'p:…' | null        (de una pieza colocada)
Catalogo.defOf(p, board?)   → definition | null   (board = Map de definiciones 'p:' del tablero)
Catalogo.comp(def, state, name) → valor efectivo del componente `name` aplicando las variantes
Catalogo.blocksMove(p, board?)  → bool     (la casilla entera; puerta abierta no)
Catalogo.blocks(p, flag, board?) → bool    (flag: 'sight'|'light'|'move'|'hide'; como Muros.blocks de hoy)
Catalogo.wallKind(p, board?)    → 'door'|'window'|'veil'|'cover'|'barrier'|'portal'|null
Catalogo.isDoor(p, board?)      → bool
Catalogo.span(p, board?)        → [w, d] con el giro aplicado
Catalogo.emitLight(p, board?)   → { r, h } | null      (luz fija de la definición; la luz suelta y la del dibujo las sigue calculando el motor)
Catalogo.isLow(p, board?)       → bool     (lo que la maleza puede ocultar: mobiliario, decorado y dibujos)
Catalogo.gmOnly(p, board?)      → bool
Catalogo.surface(p, board?)     → número de pasos de tarima (deck) o 0
Catalogo.complete(p)            → la pieza con def, uid y state completos (no muta la original)
Catalogo.newUid()               → 'u' + 8 [a-z0-9]
Catalogo.validateDef(def)       → definition saneada | null
Catalogo.TERRAIN                { letra: definition } (alias de FACTORY['f:<letra>'])
```

- [ ] **Paso 1: la foto.** `test/t3d/tools/foto-fabrica.cjs` (se ejecuta **una vez, antes de tocar el motor**,
  y su salida se commitea como referencia fija):

```js
'use strict';
/* Foto del comportamiento de las piezas de fábrica ANTES de la fase 0: lee PROP3D de tablero3d.js (las banderas
   anteriores a `fn:`), Muros (kindOf, WALL_TYPES, PASSABLE, SPANS) y las listas del servidor (rules.js). Uso:
   node test/t3d/tools/foto-fabrica.cjs > test/t3d/fixtures/fabrica-antes.json  (sólo una vez; es la referencia). */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const MOD = path.join(__dirname, '..', '..', '..', 'modules', 'tablero3d');
const src = fs.readFileSync(path.join(MOD, 'public', 'tablero3d.js'), 'utf8');
const a = src.indexOf('const PROP3D={');
let depth = 0, i = a + 13;
const start = i;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
const body = src.slice(start + 1, i);
const P3 = {};
for (const m of body.matchAll(/\n {2}([a-zA-Z0-9_]+):\{/g)) {
  const from = m.index + m[0].length, to = body.indexOf('fn:', from);
  P3[m[1]] = Function('return {' + body.slice(from, to).replace(/,\s*$/, '') + '}')();
}
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(MOD, 'public', 'muros.js'), 'utf8'), ctx);
const Mu = ctx.window.Tablero3D.Muros;
const R = require(path.join(MOD, 'rules.js'));
const out = {};
for (const t of [...Object.keys(P3), 'tree', 'brazier', 'light']) {
  const P = P3[t] || {}, k = Mu.kindOf({ type: t }), W = k ? Mu.WALL_TYPES[k] : null;
  out[t] = {
    span: P.span || [1, 1], orient: !!P.orient, walk: t === 'light' || !!P.walk, deck: P.deck || 0, door: !!P.door, lift: P.lift || 0,
    gmOnly: !!P.gmOnly, rand: t === 'tree' || !!P.rand, wallKind: k,
    sight: W ? !!W.sight : false, lightBlock: W ? !!W.light : false, hide: W ? !!W.hide : false, portal: !!(W && W.portal),
    emit: t === 'brazier' ? { r: 6, h: 0.8 } : P.light ? { r: P.light, h: (P.lightS || 16) / 16 } : null,
    cat: P.cat || null, hidden: !!P.hidden,
    // lo que la maleza puede ocultar: la regla de hideable() de antes (propCat ∈ furniture/decor/mine, sin tipo de muro ni luz)
    low: !k && t !== 'light' && t !== 'tree' && t !== 'brazier' && !P.light && !['fence', 'stairs'].includes(t) && (!P.cat || P.cat === 'decor' || P.cat === 'furniture'),
    server: { passable: R.PASSABLE_PROPS.includes(t), span: R.PROP_SPANS[t] || null, door: R.DOOR_PROPS.includes(t) },
  };
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
```

  Ejecuta: `node test/t3d/tools/foto-fabrica.cjs > test/t3d/fixtures/fabrica-antes.json`.
  Esperado: 38 entradas (`window … sign`, `tree`, `brazier`, `light`). Comprobación rápida (debe salir
  «0 discrepancias»): que `walk` coincide con `server.passable` y `span` con `server.span||[1,1]` en todas.

- [ ] **Paso 2: test de equivalencia (rojo: aún no hay catálogo).** `test/t3d/catalogo.test.js`:

```js
'use strict';
/* El catálogo de piezas (modules/tablero3d/public/catalogo.js) dice lo mismo que el código de antes de la fase 0
   (fixtures/fabrica-antes.json, foto fija) para cada pieza de fábrica, y sus consultas y su validación funcionan. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../modules/tablero3d/public/catalogo.js');
const ANTES = require('./fixtures/fabrica-antes.json');

test('catálogo: cada pieza de fábrica se comporta como antes (paso, vista, luz, puerta, varias casillas, luz fija)', () => {
  for (const [t, a] of Object.entries(ANTES)) {
    const p = { type: t, x: 0, z: 0, v: 0 }, q = { type: t, x: 0, z: 0, v: 1 };
    assert.ok(C.defOf(p), `${t}: tiene definición`);
    assert.equal(C.blocksMove(p), !a.walk, `${t}: paso (las puertas, cerradas)`);
    assert.deepEqual(C.span(p), a.span, `${t}: casillas`);
    assert.deepEqual(C.span(q), [a.span[1], a.span[0]], `${t}: casillas girada`);
    assert.equal(C.isLow(p), a.low, `${t}: la maleza lo oculta`);
    assert.equal(C.wallKind(p), a.wallKind, `${t}: tipo de muro`);
    assert.equal(C.isDoor(p), a.door, `${t}: puerta`);
    assert.equal(C.gmOnly(p), a.gmOnly, `${t}: sólo director`);
    assert.equal(C.surface(p), a.deck, `${t}: tarima`);
    assert.deepEqual(C.emitLight(p), a.emit, `${t}: luz fija`);
    for (const f of ['sight', 'light', 'hide']) {
      const antes = a.wallKind ? (f === 'hide' ? a.hide || a.sight : f === 'sight' ? a.sight : a.lightBlock) : false;
      assert.equal(C.blocks(p, f), antes, `${t}: tapa ${f}`);
    }
  }
});

test('catálogo: puerta abierta no tapa ni bloquea; con llave sigue cerrada', () => {
  for (const t of ['door', 'gate']) {
    assert.equal(C.blocksMove({ type: t, x: 0, z: 0, open: true }), false);
    assert.equal(C.blocks({ type: t, x: 0, z: 0, open: true }, 'sight'), false);
    assert.equal(C.blocks({ type: t, x: 0, z: 0, state: { open: true } }, 'sight'), false, 'lee state');
    assert.equal(C.blocks({ type: t, x: 0, z: 0, open: false, locked: true }, 'sight'), true);
  }
});

test('catálogo: portal de suelo no tapa vista ni luz pero sí el paso; el mágico alumbra', () => {
  const suelo = { type: 'portal', x: 0, z: 0, look: 'trapdoor' };
  assert.equal(C.blocks(suelo, 'sight'), false);
  assert.equal(C.blocks(suelo, 'light'), false);
  assert.equal(C.blocksMove(suelo), true);
  assert.equal(C.blocks({ type: 'portal', x: 0, z: 0, look: 'door' }, 'sight'), true);
});

test('catálogo: terrenos — muro y lava no se pisan; el muro tapa vista y luz', () => {
  for (const l of 'gapsow~cnl') assert.ok(C.TERRAIN[l], `terreno ${l}`);
  assert.equal(C.comp(C.TERRAIN.w, {}, 'move').block, true);
  assert.equal(C.comp(C.TERRAIN.w, {}, 'sight'), 'block');
  assert.equal(C.comp(C.TERRAIN.l, {}, 'move').block, true);
  assert.equal(C.comp(C.TERRAIN.g, {}, 'move').block, false);
});

test('catálogo: dibujo de objeto antiguo = definición calculada d: sólida, 1×1 y al azar', () => {
  const p = { type: 'obj:o_abcd1234', x: 1, z: 1 };
  assert.equal(C.defIdOf(p), 'd:o_abcd1234');
  assert.equal(C.blocksMove(p), true);
  assert.deepEqual(C.span(p), [1, 1]);
  assert.equal(C.isLow(p), true, 'la maleza lo puede ocultar, como hoy');
});

test('catálogo: complete() añade def, uid y state sin tocar la original ni perder campos', () => {
  const p = { type: 'door', x: 2, z: 3, v: 1, open: true, locked: true };
  const q = C.complete(p);
  assert.equal(p.uid, undefined, 'no muta');
  assert.equal(q.def, 'f:door');
  assert.match(q.uid, /^u[a-z0-9]{8}$/);
  assert.deepEqual(q.state, { open: true, locked: true });
  assert.equal(q.open, true, 'espejo para volver atrás');
  assert.equal(q.locked, true);
  const portal = C.complete({ type: 'portal', x: 0, z: 0, id: 3, look: 'cave', target: { scene: 'b1', portal: 2 }, name: 'Cueva' });
  assert.equal(portal.id, 3, 'el id entero del portal no se toca');
  assert.deepEqual(portal.target, { scene: 'b1', portal: 2 });
  assert.equal(C.complete(q).uid, q.uid, 'un uid que ya está se conserva');
});

test('catálogo: validateDef — acepta una definición bien hecha, recorta topes y rechaza lo raro', () => {
  const d = C.validateDef({ schema: 1, id: 'p:cofre01', name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
    shape: { w: 1, d: 1, height: 1, orient: true, random: false, layer: 'object' },
    components: { move: { block: true }, sight: 'none', light: 'none' },
    states: { open: { values: [false, true], initial: false } },
    variants: [{ when: { open: true }, set: { art: 'o_cofre02' } }], interactions: [], reactions: [] });
  assert.ok(d);
  assert.equal(C.validateDef({ id: 'f:hack', class: 'object' }), null, 'el prefijo f: es sólo de fábrica');
  assert.equal(C.validateDef(Object.assign({}, d, { class: 'nave' })), null);
  assert.equal(C.validateDef(Object.assign({}, d, { states: { a: { values: [1, 2, 3, 4, 5] } } })), null, '≤ 4 valores');
  assert.equal(C.validateDef(Object.assign({}, d, { shape: Object.assign({}, d.shape, { w: 9 }) })), null, 'w ≤ 8');
});
```

  Ejecuta: `node --test test/t3d/catalogo.test.js` → **FAIL** (`Cannot find module …catalogo.js`).

- [ ] **Paso 3: el catálogo.** `modules/tablero3d/public/catalogo.js`:

```js
'use strict';
/* Catálogo de piezas del tablero 3D (Tablero3D.Catalogo en el navegador; require() en el servidor). Una pieza es una
   DEFINICIÓN (forma + componentes + estados + variantes) y cada objeto colocado en la escena apunta a una (`def`) y
   guarda su `uid` y su `state`. Esquema: docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md §3.2.
   Las piezas de fábrica de abajo reproducen lo que hacía el código antes de la fase 0 (test/t3d/catalogo.test.js). */
(function (root) {
  const SCHEMA = 1;
  const SENSE = ['none', 'limited', 'block'];
  const CLASSES = ['terrain', 'object', 'wall', 'hanging'];
  const LAYERS = ['ground', 'object', 'wall', 'hanging'];
  const WALL_KINDS = ['door', 'window', 'veil', 'cover', 'barrier', 'portal'];
  const PORTAL_LOOKS = { door: true, stairs: false, cave: true, trapdoor: false, magic: true };   // ¿de pie? (los de suelo no tapan)
  const DEF_ID = /^(f|p|d):[A-Za-z0-9_~-]{1,40}$/;
  const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  /* ---- fábrica ---- una línea por tipo: [casillas, banderas]. Banderas: o orienta · W se pisa · r giro al azar ·
     G sólo director · L objeto bajo (la maleza lo oculta) · D puerta · k:<tipo> muro de JA-VTT · d:<n> tarima ·
     e:<r>:<h> luz fija · lift:<n> puerta que sube. Salen de PROP3D/WALL_TYPES/rules.js de antes (fabrica-antes.json). */
  const RAW = {
    window: [[1, 1], 'o k:window'], veil: [[1, 1], 'o W k:veil'], cover: [[1, 1], 'W r k:cover'], barrier: [[1, 1], 'o G k:barrier'],
    portal: [[1, 1], 'o k:portal'], portal_stairs: [[1, 1], 'o'], portal_cave: [[1, 1], 'o'], portal_trap: [[1, 1], 'o'], portal_magic: [[1, 1], 'o'],
    door: [[1, 1], 'o D k:door'], chest: [[1, 1], 'r L'], barrel: [[1, 1], 'r L'], table: [[1, 1], 'o L'], bed: [[1, 1], 'o L'],
    shelf: [[1, 1], 'o L'], fence: [[1, 1], 'o'], well: [[1, 1], ''], lamp: [[1, 1], 'r e:5:2.125'], stairs: [[1, 1], 'W'],
    torch: [[1, 1], 'r e:4:1.125'], bridge: [[1, 1], 'o W d:16'], bridge2: [[2, 1], 'o W d:16'], gate: [[1, 1], 'o D k:door lift:1.5'],
    gatearch: [[1, 1], 'o'], stall: [[2, 1], 'o'], stall2: [[2, 1], 'o'], windmill: [[3, 3], 'o'], belfry: [[1, 1], ''], post: [[1, 1], ''],
    cart: [[2, 1], 'o L'], crates: [[1, 1], 'r L'], bench: [[1, 1], 'o L'], picket: [[1, 1], 'o L'], stonewall: [[1, 1], 'o L'],
    sign: [[1, 1], 'o L'], tree: [[1, 1], 'r'], brazier: [[1, 1], 'e:6:0.8'], light: [[1, 1], 'W'],
  };
  const WALLS = {   // lo que tapa cada tipo de muro de JA-VTT (WALL_TYPES: sight, light, move, hide)
    door: { sight: 1, light: 1 }, window: {}, veil: { sight: 1, light: 1 }, cover: { hide: 1 }, barrier: {}, portal: { sight: 1, light: 1 },
  };
  function factoryObject(type, span, flags) {
    const f = flags.split(' ').filter(Boolean), has = (k) => f.includes(k), val = (k) => (f.find((x) => x.startsWith(k + ':')) || '').slice(k.length + 1);
    const kind = val('k') || null, W = kind ? WALLS[kind] : null, deck = +val('d') || 0, e = val('e');
    const def = {
      schema: SCHEMA, id: 'f:' + type, name: type, class: kind ? 'wall' : 'object',
      art: { base: type },
      shape: { w: span[0], d: span[1], height: 1, orient: has('o'), random: has('r'), layer: kind ? 'wall' : 'object', low: has('L') },
      components: {
        move: { block: !has('W') }, sight: W && W.sight ? 'block' : 'none', light: W && W.light ? 'block' : 'none',
        ...(W && W.hide ? { hide: true } : {}), ...(has('G') ? { gmOnly: true } : {}), ...(deck ? { surface: { walkable: true, height: deck } } : {}),
        ...(e ? { emitLight: { r: +e.split(':')[0], h: +e.split(':')[1] } } : {}),
        ...(has('D') ? { door: val('lift') ? { lift: +val('lift') } : {} } : {}), ...(kind === 'portal' ? { portal: { looks: Object.keys(PORTAL_LOOKS) } } : {}),
      },
      interactions: [], reactions: [], kind,
    };
    if (has('D')) {
      def.states = { open: { values: [false, true], initial: false }, locked: { values: [false, true], initial: false } };
      def.variants = [{ when: { open: true }, set: { move: { block: false }, sight: 'none', light: 'none' } }];
    }
    return def;
  }
  // terrenos (letras de M.t): muro y lava no se pisan; el muro tapa vista y luz; '~' es el agua de las escenas de antes
  const TERR_RAW = { g: '', a: '', p: '', s: '', o: '', c: '', n: '', w: 'B S', l: 'B H A', '~': 'Q' };
  function factoryTerrain(l, flags) {
    const f = flags.split(' ');
    return {
      schema: SCHEMA, id: 'f:' + l, name: l, class: 'terrain', art: { base: l },
      shape: { w: 1, d: 1, height: 1, orient: false, random: false, layer: 'ground' },
      components: { move: { block: f.includes('B') }, sight: f.includes('S') ? 'block' : 'none', light: f.includes('S') ? 'block' : 'none',
        terrain: { liquid: f.includes('Q'), hazard: f.includes('H'), anim: f.includes('A') } },
      interactions: [], reactions: [],
    };
  }
  const FACTORY = {};
  for (const [t, [span, flags]] of Object.entries(RAW)) FACTORY['f:' + t] = factoryObject(t, span, flags);
  const TERRAIN = {};
  for (const [l, flags] of Object.entries(TERR_RAW)) TERRAIN[l] = FACTORY['f:' + l] = factoryTerrain(l, flags);
  for (const d of Object.values(FACTORY)) Object.freeze(d);

  /* ---- de pieza colocada a definición ---- */
  function defIdOf(p) {
    if (!p || typeof p.type !== 'string') return null;
    if (typeof p.def === 'string' && DEF_ID.test(p.def)) return p.def;
    if (/^obj:o_[a-z0-9]{4,16}$/.test(p.type)) return 'd:' + p.type.slice(4);
    return FACTORY['f:' + p.type] ? 'f:' + p.type : null;
  }
  // dibujo de objeto antiguo (`obj:o_…`): lo que hacía antes — sólido, 1×1, giro al azar, bajo (la maleza lo oculta)
  const drawingDef = (id) => ({ schema: SCHEMA, id, name: id.slice(2), class: 'object', art: { base: id.slice(2) },
    shape: { w: 1, d: 1, height: 1, orient: false, random: true, layer: 'object', low: true },
    components: { move: { block: true }, sight: 'none', light: 'none' }, interactions: [], reactions: [], kind: null });
  function defOf(p, board) {
    const id = defIdOf(p);
    if (!id) return null;
    if (id.startsWith('f:')) return FACTORY[id] || null;
    if (id.startsWith('d:')) return drawingDef(id);
    return (board && board.get(id)) || null;
  }
  // estado de una pieza: `state` (formato nuevo) o, en las escenas de antes, `open`/`locked` en la raíz
  function stateOf(p, def) {
    const out = {};
    for (const [k, s] of Object.entries((def && def.states) || {})) {
      const v = plain(p.state) && k in p.state ? p.state[k] : k in p ? p[k] : s.initial;
      out[k] = s.values.includes(v) ? v : s.initial;
    }
    return out;
  }
  function comp(def, state, name) {
    if (!def) return undefined;
    let v = def.components[name];
    for (const va of def.variants || []) if (Object.entries(va.when).every(([k, x]) => state[k] === x) && name in va.set) v = va.set[name];
    return v;
  }
  const eff = (p, board, name) => { const d = defOf(p, board); return d ? comp(d, stateOf(p, d), name) : undefined; };
  const wallKind = (p, board) => { const d = defOf(p, board); return d ? d.kind || null : null; };
  const isDoor = (p, board) => { const d = defOf(p, board); return !!(d && d.components.door); };
  const blocksMove = (p, board) => { const m = eff(p, board, 'move'); return !!(m && m.block); };
  function blocks(p, flag, board) {
    const d = defOf(p, board);
    if (!d || !d.kind) return false;                                    // como Muros.blocks: sólo los muros de JA-VTT tapan
    if (flag === 'move') return blocksMove(p, board);
    if (d.kind === 'portal' && !PORTAL_LOOKS[p.look in PORTAL_LOOKS ? p.look : 'door']) return false;   // portal de suelo
    const st = stateOf(p, d);
    if (flag === 'hide') return !!comp(d, st, 'hide') || comp(d, st, 'sight') === 'block';
    return comp(d, st, flag) === 'block';
  }
  function span(p, board) {
    const d = defOf(p, board);
    const s = d ? [d.shape.w, d.shape.d] : [1, 1];
    return (p.v | 0) % 2 ? [s[1], s[0]] : s;
  }
  const emitLight = (p, board) => { const e = eff(p, board, 'emitLight'); return e ? { r: e.r, h: e.h } : null; };
  const isLow = (p, board) => { const d = defOf(p, board); return !!(d && d.shape.low); };
  const gmOnly = (p, board) => !!eff(p, board, 'gmOnly');
  const surface = (p, board) => { const s = eff(p, board, 'surface'); return s ? s.height : 0; };

  /* ---- completar una pieza colocada (lectura de escenas v1 y v2; cliente y servidor igual) ---- */
  const newUid = () => { let s = 'u'; for (let i = 0; i < 8; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]; return s; };
  function complete(p, board) {
    const q = Object.assign({}, p), d = defOf(p, board);
    q.def = defIdOf(p);
    if (typeof q.uid !== 'string' || !/^u[a-z0-9]{8}$/.test(q.uid)) q.uid = newUid();
    if (d && d.states) {
      q.state = stateOf(p, d);
      if ('open' in q.state) q.open = q.state.open;                     // espejo para volver atrás (se quita en la fase 2)
      if (q.state.locked) q.locked = true; else delete q.locked;
    }
    return q;
  }

  /* ---- validar una definición del tablero (p:) ---- */
  function validateDef(o) {
    if (!plain(o) || typeof o.id !== 'string' || !/^p:[a-z0-9]{2,40}$/.test(o.id)) return null;
    if (!CLASSES.includes(o.class)) return null;
    const sh = plain(o.shape) ? o.shape : {}, int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    if (!int(sh.w, 1, 8) || !int(sh.d, 1, 8)) return null;
    const height = Number.isFinite(sh.height) && sh.height >= 0 && sh.height <= 8 ? Math.round(sh.height * 4) / 4 : 1;
    const c = plain(o.components) ? o.components : {};
    const sense = (v) => (SENSE.includes(v) ? v : 'none');
    const states = {};
    for (const [k, s] of Object.entries(plain(o.states) ? o.states : {})) {
      if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(k) || !plain(s) || !Array.isArray(s.values) || s.values.length < 2 || s.values.length > 4) return null;
      if (!s.values.every((v) => ['boolean', 'number', 'string'].includes(typeof v))) return null;
      states[k] = { values: s.values.slice(), initial: s.values.includes(s.initial) ? s.initial : s.values[0] };
    }
    if (Object.keys(states).length > 4) return null;
    const def = {
      schema: SCHEMA, id: o.id, name: String(o.name || 'Pieza').trim().slice(0, 40) || 'Pieza', class: o.class,
      ...(typeof o.template === 'string' ? { template: o.template.slice(0, 24) } : {}),
      art: { base: plain(o.art) && typeof o.art.base === 'string' ? o.art.base.slice(0, 40) : '' },
      shape: { w: sh.w, d: sh.d, height, orient: !!sh.orient, random: !!sh.random, layer: LAYERS.includes(sh.layer) ? sh.layer : 'object', low: !!sh.low },
      components: { move: { block: !!(plain(c.move) && c.move.block) }, sight: sense(c.sight), light: sense(c.light),
        ...(c.hide ? { hide: true } : {}), ...(c.gmOnly ? { gmOnly: true } : {}) },
      ...(Object.keys(states).length ? { states } : {}),
      variants: [], interactions: [], reactions: [], kind: null,
    };
    for (const v of Array.isArray(o.variants) ? o.variants.slice(0, 16) : []) {
      if (!plain(v) || !plain(v.when) || !plain(v.set)) return null;
      if (!Object.entries(v.when).every(([k, x]) => states[k] && states[k].values.includes(x))) return null;
      const set = {};
      if (plain(v.set.move)) set.move = { block: !!v.set.move.block };
      if ('sight' in v.set) set.sight = sense(v.set.sight);
      if ('light' in v.set) set.light = sense(v.set.light);
      if (typeof v.set.art === 'string') set.art = v.set.art.slice(0, 40);
      def.variants.push({ when: Object.assign({}, v.when), set });
    }
    return JSON.stringify(def).length <= 64 * 1024 ? def : null;
  }

  const Catalogo = { SCHEMA, FACTORY, TERRAIN, PORTAL_LOOKS, WALL_KINDS, defIdOf, defOf, stateOf, comp, blocks, blocksMove, wallKind,
    isDoor, span, emitLight, isLow, gmOnly, surface, complete, newUid, validateDef };
  if (typeof module === 'object' && module.exports) module.exports = Catalogo;
  else (root.Tablero3D = root.Tablero3D || {}).Catalogo = Catalogo;
})(typeof window !== 'undefined' ? window : globalThis);
```

> Nota para quien ejecute: en el primer test la aserción de paso lee «¿bloquea?». En la foto, `walk` = se pisa;
> las puertas (`door`, `gate`) bloquean **cerradas**. Si al pasar el test ves que alguna fila de `RAW` no
> coincide con `fabrica-antes.json`, **corrige `RAW`** (la foto manda), nunca la foto.

- [ ] **Paso 4:** `node --test test/t3d/catalogo.test.js` → PASS (7/7).
- [ ] **Paso 5: mutación:** en `RAW`, `stall: [[2, 1], 'o']` → `[[1, 1], 'o']` → rojo en «casillas»; restaura.
  `WALLS.veil` → `{}` → rojo en «tapa sight»; restaura.
- [ ] **Paso 6: commit** `feat(t3d): catálogo único de piezas (definiciones de fábrica y consultas por componente)`.

---

### Tarea 4: Servidor por catálogo (validación, privacidad, puertas, llegada)

**Archivos:**
- Modificar: `modules/tablero3d/rules.js` (`cleanProp`, `cleanMap`, `sceneFor`, `playerDoors`, `gridOf`, y las
  constantes `DOOR_PROPS`, `PASSABLE_PROPS`, `PROP_SPANS`, `isWallProp`)
- Crear: `test/t3d/piezas-escena.test.js`
- Modificar: `test/t3d/helpers/fixtures.js` (añadir `escenaVieja()`)

**Interfaces:**
- Consume: `Catalogo.{defOf, complete, blocksMove, span, isDoor, gmOnly, wallKind}` (Tarea 3).
- Produce: `R.cleanMap(o, board?)` (nuevo 2.º argumento opcional: `Map` de definiciones `p:` del tablero);
  escenas saneadas con `v: 2` y cada `props[i]` con `def`, `uid` (únicos) y `state` en las piezas con estados.

- [ ] **Paso 1: la escena vieja de referencia** (`fixtures.js`, añadir y exportar):

```js
// escena con el formato de antes de la fase 0 (v:1): puertas con llave, portal con destino, escalera de campaña de antes,
// dibujo propio, luz suelta, barrera (sólo director), puente de dos casillas y un tipo inexistente (se descarta)
function escenaVieja() {
  return map(8, { v: 1, props: [
    { type: 'door', x: 1, z: 2, v: 1, open: false, locked: true },
    { type: 'gate', x: 2, z: 2, v: 0, open: true },
    { type: 'portal', x: 3, z: 3, v: 0, id: 7, look: 'cave', target: { scene: 'bOtra', portal: 2 }, name: 'Cueva' },
    { type: 'stairs', x: 4, z: 4, to: 'cabajo', tx: 1, tz: 1 },
    { type: 'obj:o_abcd1234', x: 5, z: 5, v: 2 },
    { type: 'light', x: 6, z: 6, preset: 'torch', r: 8, h: 1.25, color: '#ffa652', intensity: 1, anim: 'flicker', on: true },
    { type: 'barrier', x: 0, z: 7, v: 0 },
    { type: 'bridge2', x: 2, z: 6, v: 1 },
    { type: 'nave_espacial', x: 1, z: 1 },
  ] });
}
```

- [ ] **Paso 2: tests (rojos).** `test/t3d/piezas-escena.test.js`:

```js
'use strict';
/* Escenas en el servidor tras la fase 0: una escena vieja se completa sin perder nada, cada pieza se valida contra su
   definición, al jugador no le llegan las barreras (gmOnly) y las puertas guardan también open/locked (volver atrás). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../modules/tablero3d/rules');
const F = require('./helpers/fixtures');
const GM = { role: 'gm', user_id: '1' }, PL = { role: 'player', user_id: '2' };

test('escena vieja: se completa (v:2, def, uid, state) sin perder ningún dato y descarta sólo el tipo inexistente', () => {
  const m = R.cleanMap(F.escenaVieja());
  assert.equal(m.v, 2);
  const by = (t) => m.props.find((p) => p.type === t);
  assert.equal(m.props.length, 8, 'la nave espacial no existe: fuera; lo demás, dentro');
  for (const p of m.props) { assert.match(p.uid, /^u[a-z0-9]{8}$/); assert.ok(p.def); }
  assert.deepEqual(by('door').state, { open: false, locked: true });
  assert.equal(by('door').locked, true, 'espejo');
  assert.equal(by('gate').open, true);
  const portales = m.props.filter((p) => p.type === 'portal');
  assert.deepEqual(portales.map((p) => [p.look, p.id]).sort(), [['cave', 7], ['stairs', 1 + 4 * 160 + 4]].sort(), 'la escalera de antes pasa a portal');
  assert.deepEqual(portales.find((p) => p.look === 'cave').target, { scene: 'bOtra', portal: 2 });
  assert.equal(by('obj:o_abcd1234').def, 'd:o_abcd1234');
  assert.equal(by('light').preset, 'torch');
  assert.equal(by('bridge2').def, 'f:bridge2');
});

test('escena: guardar dos veces da lo mismo (los uid se conservan)', () => {
  const a = R.cleanMap(F.escenaVieja()), b = R.cleanMap(a);
  assert.deepEqual(b, a);
});

test('escena: pieza fuera del mapa, giro raro o uid repetido se arreglan sin perder piezas', () => {
  const m = R.cleanMap(F.map(8, { props: [
    { type: 'chest', x: 9, z: 1 }, { type: 'chest', x: 1, z: -1 }, { type: 'chest', x: 1.5, z: 1 },
    { type: 'chest', x: 1, z: 1, v: 7, uid: 'uaaaaaaaa' }, { type: 'barrel', x: 2, z: 1, uid: 'uaaaaaaaa' },
  ] }));
  assert.equal(m.props.length, 2, 'las tres fuera de rango o no enteras se descartan');
  assert.equal(m.props[0].v, 0);
  assert.notEqual(m.props[0].uid, m.props[1].uid, 'uid repetido: el segundo toma uno nuevo');
});

test('privacidad: al jugador no le llegan las barreras (gmOnly); al director sí', () => {
  const m = R.cleanMap(F.escenaVieja());
  assert.ok(R.sceneFor(m, GM, null).props.some((p) => p.type === 'barrier'));
  assert.ok(!R.sceneFor(m, PL, null).props.some((p) => p.type === 'barrier'));
  const camp = R.campaignFor({ id: 'c1', name: 'C', boards: { a: { name: 'A', data: m } }, notes: {}, cur: 'a' }, PL, null);
  assert.ok(!camp.boards.a.data.props.some((p) => p.type === 'barrier'), 'también en campañas');
  const live = R.liveDocFor('board', { open: true, rev: 1, board: m }, PL, null, {});
  assert.ok(!live.board.props.some((p) => p.type === 'barrier'), 'y en la mesa en vivo');
});

test('puertas en vivo: el jugador abre la gate (puerta del catálogo) y no la de llave', () => {
  const board = { open: true, board: R.cleanMap(F.escenaVieja()) };
  const ctx = { board, settings: { playersDoors: true } };
  assert.equal(R.playerDoors({ d: { '2_2': 0 } }, { d: {} }, ctx), null, 'gate: sí');
  assert.match(R.playerDoors({ d: { '1_2': 1 } }, { d: {} }, ctx), /llave/);
  assert.match(R.playerDoors({ d: { '5_5': 1 } }, { d: {} }, ctx), /ninguna puerta/);
});

test('llegada por portal: la rejilla sale del catálogo (el puente se pisa; el cofre no)', () => {
  const m = R.cleanMap(F.map(8, { props: [{ type: 'bridge', x: 1, z: 1 }, { type: 'chest', x: 2, z: 1 }] }));
  const g = R.gridOf(m);
  assert.equal(g.open(1 * 8 + 1), true);
  assert.equal(g.open(1 * 8 + 2), false);
});
```

  Ejecuta `node --test test/t3d/piezas-escena.test.js` → FAIL (sin `v: 2`, sin `uid`, la barrera llega al jugador).

- [ ] **Paso 3: implementación en `rules.js`.** Arriba, junto a los `require`:

```js
const Catalogo = require('./public/catalogo.js');
```

Sustituye `PASSABLE_PROPS`, `PROP_SPANS` y `DOOR_PROPS` por consultas (mantén los nombres exportados para no
romper a quien los lea, calculados desde el catálogo):

```js
/* Qué es cada tipo lo dice el catálogo (public/catalogo.js); estas listas se calculan de él y se mantienen por compatibilidad */
const FACTORY_TYPES = Object.keys(Catalogo.FACTORY).filter((k) => Catalogo.FACTORY[k].class !== 'terrain').map((k) => k.slice(2));
const DOOR_PROPS = FACTORY_TYPES.filter((t) => Catalogo.isDoor({ type: t }));
const PASSABLE_PROPS = FACTORY_TYPES.filter((t) => !Catalogo.blocksMove({ type: t }) && !Catalogo.isDoor({ type: t }));
const PROP_SPANS = Object.fromEntries(FACTORY_TYPES.map((t) => [t, Catalogo.span({ type: t })]).filter(([, s]) => s[0] > 1 || s[1] > 1));
```

`cleanProp` valida toda pieza (y completa def/uid/state). Sustituye la línea `const cleanProp = …` por:

```js
/* Una pieza de la escena: tiene que existir su definición (fábrica, dibujo antiguo o del tablero), estar en el mapa y tener
   giro 0–3. Las luces y los muros conservan su saneado propio; luego se completa def, uid y state (Catalogo.complete). */
function cleanProp(p, w, d, board) {
  if (!intIn(p.x, 0, w - 1) || !intIn(p.z, 0, d - 1)) return null;
  const base = p.type === 'light' ? cleanLightProp(p) : isWallProp(p) ? cleanWallProp(p) : Object.assign({}, p, { v: intIn(p.v, 0, 3) ? p.v : 0 });
  if (!base || !Catalogo.defOf(base, board)) return null;
  const keep = { type: base.type, x: base.x, z: base.z, v: base.v | 0 };
  for (const k of ['open', 'locked', 'id', 'look', 'target', 'name', 'preset', 'r', 'h', 'color', 'intensity', 'anim', 'angle', 'rot', 'darkness', 'on', 'def', 'uid', 'state', 'level', 'side']) if (k in base) keep[k] = base[k];
  return Catalogo.complete(keep, board);
}
```

En `cleanMap(o)`: firma `function cleanMap(o, board)`, la línea de `props` pasa a

```js
  map.props = fixPortalIds(Array.isArray(o.props) ? o.props.filter(plainObject).slice(0, 5000).map((p) => cleanProp(p, w, d, board)).filter(Boolean) : []);
  const uids = new Set();
  for (const p of map.props) { while (uids.has(p.uid)) p.uid = Catalogo.newUid(); uids.add(p.uid); }
```

y `const map = { v: 1, …` pasa a `const map = { v: 2, …`.

> `cleanLightProp` no comprueba `x`/`z`: ahora lo hace `cleanProp` antes, para todos.

`sceneFor` (tras la línea `const out = Object.assign({}, map);`):

```js
  // lo que sólo ve el director (barreras; mañana, secretas) no sale del servidor
  if (Array.isArray(map.props)) out.props = map.props.filter((p) => !Catalogo.gmOnly(p));
```

`playerDoors`: la búsqueda de la puerta pasa a

```js
    const door = board && (board.props || []).find((p) => Catalogo.isDoor(p) && p.x === x && p.z === z);
```

`gridOf`: el bucle de objetos pasa a

```js
  for (const p of m.props || []) {
    if (!Catalogo.blocksMove(p) && !Catalogo.isDoor(p)) continue;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.z)) continue;
    const [sw, sd] = Catalogo.span(p);
    off(p.x, p.z, sw, sd);
  }
```

(una puerta ocupa su casilla para la llegada, abierta o no, como hoy: antes `door` no estaba en `PASSABLE_PROPS`).

- [ ] **Paso 4:** `node --test test/t3d/piezas-escena.test.js` → PASS; `npm run check` → verde (los tests
  portados de privacidad y portales siguen verdes).
- [ ] **Paso 5: mutación (una a una):** quitar el filtro `gmOnly` de `sceneFor` → rojo «privacidad»; quitar el
  bucle de `uids` → rojo «uid repetido»; en `Catalogo.complete` quitar la línea del espejo `open` → rojo «espejo».
- [ ] **Paso 6: commit** `feat(t3d): el servidor valida cada pieza por el catálogo y no manda al jugador lo que es sólo del director`.

---

### Tarea 5: Definiciones del tablero (tabla, API, cuota)

**Archivos:**
- Crear: `modules/tablero3d/migrations/007-piezas.sql`
- Modificar: `modules/tablero3d/db.js` (consultas), `modules/tablero3d/index.js` (ruta `pieces`, cuota)
- Crear: `test/t3d/piezas-api.test.js`

**Interfaces:**
- Produce: `GET /api/t3d/boards/:id/pieces` → `{ pieces: [definition] }`; `PUT …/pieces/:pid` (cuerpo = definition,
  `id` = `'p:' + pid`) → `{ ok: true }`; `DELETE …/pieces/:pid` → `{ ok: true }`. `q.boardPieces(boardId)` → `Map(id → def)`.

- [ ] **Paso 1: tests (rojos)** `test/t3d/piezas-api.test.js`:

```js
'use strict';
/* API de definiciones de piezas del tablero (fase 0: sin pantalla todavía). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetSchema } = require('./helpers/db');
const { cuenta, llamar, mesa3d } = require('./helpers/mesa');
const app = require('../../server/app');

let base;
before(async () => { await resetSchema(); await app.prepare(); base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.stop(); });

const cofre = (id) => ({ schema: 1, id: 'p:' + id, name: 'Cofre', class: 'object', art: { base: 'o_cofre01' },
  shape: { w: 1, d: 1, height: 1, orient: true, layer: 'object' }, components: { move: { block: true }, sight: 'none', light: 'none' } });

test('piezas: el director guarda, lista y borra; el jugador sólo lee y no ve las gmOnly', async () => {
  const gm = await cuenta(base, 'PzGm'), pl = await cuenta(base, 'PzPl');
  const b = await mesa3d(base, gm, 'Piezas');
  await llamar(base, gm, 'POST', `/api/boards/${b.id}/members`, { name: 'PzPl' });
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/cofre01', cofre('cofre01'))).status, 200);
  assert.equal((await llamar(base, gm, 'PUT', url + '/muro01', Object.assign(cofre('muro01'), { components: { move: { block: true }, sight: 'none', light: 'none', gmOnly: true } }))).status, 200);
  assert.deepEqual((await llamar(base, gm, 'GET', url)).data.pieces.map((p) => p.id).sort(), ['p:cofre01', 'p:muro01']);
  assert.deepEqual((await llamar(base, pl, 'GET', url)).data.pieces.map((p) => p.id), ['p:cofre01'], 'el jugador no ve la gmOnly');
  assert.equal((await llamar(base, pl, 'PUT', url + '/x1', cofre('x1'))).status, 403);
  assert.equal((await llamar(base, gm, 'DELETE', url + '/cofre01')).status, 200);
  assert.deepEqual((await llamar(base, gm, 'GET', url)).data.pieces.map((p) => p.id), ['p:muro01']);
});

test('piezas: validación, id de la ruta y tope por tablero', async () => {
  const gm = await cuenta(base, 'PzGm2');
  const b = await mesa3d(base, gm, 'Topes');
  const url = `/api/t3d/boards/${b.id}/pieces`;
  assert.equal((await llamar(base, gm, 'PUT', url + '/malo', { id: 'p:malo', class: 'nave' })).status, 400);
  assert.equal((await llamar(base, gm, 'PUT', url + '/otro', cofre('distinto'))).status, 400, 'el id del cuerpo tiene que ser el de la ruta');
  assert.equal((await llamar(base, gm, 'PUT', url + '/A-B', cofre('A-B'))).status, 400, 'id: minúsculas y cifras');
});

test('piezas: una escena con una pieza del tablero se guarda; con una que no existe, se descarta esa pieza', async () => {
  const gm = await cuenta(base, 'PzGm3');
  const b = await mesa3d(base, gm, 'Escena');
  await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/pieces/cofre01`, cofre('cofre01'));
  const F = require('./helpers/fixtures');
  const map = F.map(8, { props: [{ type: 'obj:o_cofre01', def: 'p:cofre01', x: 1, z: 1 }, { type: 'obj:o_nada0001', def: 'p:nada0001', x: 2, z: 2 }] });
  assert.equal((await llamar(base, gm, 'PUT', `/api/t3d/boards/${b.id}/scenes/sc1`, map)).status, 200);
  const sc = (await llamar(base, gm, 'GET', `/api/t3d/boards/${b.id}/scenes/sc1`)).data.scene;
  assert.deepEqual(sc.props.map((p) => p.def), ['p:cofre01']);
});
```

- [ ] **Paso 2:** `node --test test/t3d/piezas-api.test.js` → FAIL (404).
- [ ] **Paso 3: migración** `modules/tablero3d/migrations/007-piezas.sql`:

```sql
-- Fase 0 del arte propio: definiciones de piezas del tablero (docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md).
-- Una fila = una definición `p:…` (forma, componentes, estados, variantes); las piezas de fábrica viven en el catálogo, no aquí.
CREATE TABLE IF NOT EXISTS t3d.pieces (
  board_id   TEXT    NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  id         TEXT    NOT NULL CHECK (id ~ '^p:[a-z0-9]{2,40}$'),
  name       TEXT    NOT NULL,
  data       JSONB   NOT NULL,
  size       BIGINT  NOT NULL,
  created_at BIGINT  NOT NULL,
  updated_at BIGINT  NOT NULL,
  PRIMARY KEY (board_id, id)
);
```

- [ ] **Paso 4: consultas** en `db.js` (dentro de `makeQueries`, junto a las de campañas):

```js
    // definiciones de piezas del tablero (p:…); cuentan en la cuota con su `size`
    pieces: (boardId) => all('SELECT id, name, data, updated_at FROM t3d.pieces WHERE board_id = $1 ORDER BY id', [boardId]),
    countPieces: async (boardId) => (await one('SELECT COUNT(*)::int AS n FROM t3d.pieces WHERE board_id = $1', [boardId])).n,
    upsertPiece: (boardId, id, name, data) => run(`INSERT INTO t3d.pieces (board_id, id, name, data, size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (board_id, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, size = EXCLUDED.size, updated_at = EXCLUDED.updated_at`, [boardId, id, name, ...jsonOf(data), now()]),
    deletePiece: (boardId, id) => run('DELETE FROM t3d.pieces WHERE board_id = $1 AND id = $2', [boardId, id]),
```

y en `boardUsage` suma una línea más (con `except` para `kind === 'pieces'`):

```sql
      + (SELECT COALESCE(SUM(size), 0) FROM t3d.pieces WHERE board_id = $1 AND NOT ($2 = 'pieces' AND id = $3))::bigint
```

- [ ] **Paso 5: ruta** en `index.js`, en `api()` justo antes de `if (['scenes', 'campaigns', 'drawings'].includes(kind))`:

```js
    if (kind === 'pieces') return piecesRoutes(req, res, id, role, itemId);
```

y la función (junto a `settingsRoute`):

```js
  /* Definiciones de piezas del tablero (fase 0 del arte propio): las leen los miembros (el jugador, sin las gmOnly) y las
     cambia el director. El id de la ruta es el de la definición sin «p:». */
  const MAX_PIECES = 300;
  async function boardPieces(id) { return new Map((await q.pieces(id)).map((r) => [r.id, r.data])); }
  async function piecesRoutes(req, res, id, role, pid) {
    const M = req.method;
    if (!pid) {
      if (M !== 'GET') return fail(res, 404, 'Ruta no encontrada');
      const defs = (await q.pieces(id)).map((r) => r.data).filter((d) => role === 'gm' || !(d.components && d.components.gmOnly));
      return json(res, 200, { pieces: defs });
    }
    if (role !== 'gm') return fail(res, 403, 'Solo el director cambia las piezas del tablero');
    if (!/^[a-z0-9]{2,40}$/.test(pid)) return fail(res, 400, 'Identificador no válido');
    if (M === 'DELETE') { await q.deletePiece(id, 'p:' + pid); await touch(id); return json(res, 200, { ok: true }); }
    if (M !== 'PUT') return fail(res, 404, 'Ruta no encontrada');
    const body = await readJson(req, R.BODY_LIMITS.small);
    const def = R.cleanPiece(body);
    if (!def || def.id !== 'p:' + pid) return fail(res, 400, 'La pieza no es válida');
    const exists = (await q.pieces(id)).some((r) => r.id === def.id);
    if (!exists && (await q.countPieces(id)) >= MAX_PIECES) return fail(res, 413, `Un tablero admite hasta ${MAX_PIECES} piezas`);
    if (await overQuota(id, 'pieces', def.id, R.docBytes(def))) return fail(res, 413, 'El almacén del tablero está lleno');
    await q.upsertPiece(id, def.id, def.name, def);
    await touch(id);
    return json(res, 200, { ok: true });
  }
```

En `contentRoutes`, el `PUT` de escenas pasa las piezas del tablero a `cleanMap`:
`const map = R.cleanMap(body, await boardPieces(id));`. En `rules.js` exporta `cleanPiece`:

```js
/* Definición de pieza del tablero (p:…), como la valida el cliente: Catalogo.validateDef */
const cleanPiece = (o) => Catalogo.validateDef(o);
```

(y añádelo a `module.exports`).

- [ ] **Paso 6:** `npm run check` → verde; los 3 tests nuevos PASS.
- [ ] **Paso 7: mutación:** quitar el `.filter((d) => role === 'gm' || …)` → rojo «no ve las gmOnly»; restaura.
- [ ] **Paso 8: commit** `feat(t3d): definiciones de piezas del tablero (tabla t3d.pieces, API y cuota)`.

---

### Tarea 6: `muros.js` y la carga del catálogo en el cliente

**Archivos:** Modificar `modules/tablero3d/public/muros.js`, `modules/tablero3d/public/t3d.js`.

**Interfaces:** Consume `Tablero3D.Catalogo`. `Muros` mantiene su interfaz (`kindOf`, `blocks`, `gridOf`,
`PASSABLE`, `SPANS`, `DOOR_PROPS`…) pero calcula desde el catálogo.

- [ ] **Paso 1: test en `test/t3d/frontend.test.js`** (añadir al final; carga `catalogo.js` y `muros.js` en el
  mismo contexto `vm`, como ya hace ese archivo con `muros.js`; si el archivo usa un ayudante `load(...)`,
  úsalo con `['catalogo.js', 'muros.js']`):

```js
test('Muros por catálogo: kindOf, blocks y gridOf iguales que el servidor para la escena vieja', () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  for (const f of ['catalogo.js', 'muros.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tablero3d', 'public', f), 'utf8'), ctx);
  const Mu = ctx.window.Tablero3D.Muros, R = require('../../modules/tablero3d/rules');
  const m = R.cleanMap(F2.escenaVieja());
  const a = Mu.gridOf(m), b = R.gridOf(m);
  for (let i = 0; i < m.w * m.d; i++) assert.equal(a.open(i), b.open(i), `casilla ${i}`);
  assert.equal(Mu.kindOf({ type: 'gate' }), 'door');
  assert.equal(Mu.blocks({ type: 'door', open: true }, 'sight'), false);
  assert.deepEqual([...Mu.PASSABLE].sort(), [...R.PASSABLE_PROPS].sort());
});
```

  Ejecuta `npm test` → FAIL (`muros.js` aún usa sus listas; `escenaVieja` trae `uid`/`def` que `gridOf` ignora,
  así que este test puede pasar por casualidad: la mutación del paso 4 lo confirma).

- [ ] **Paso 2: `muros.js`.** Al principio del cuerpo (tras `(window.Tablero3D=…).Muros=(()=>{`):

```js
  const C=window.Tablero3D.Catalogo;   // catalogo.js se carga antes (t3d.js)
```

Sustituye las definiciones de `DOOR_PROPS`, `PROP_KINDS`, `PASSABLE`, `SPANS`, `kindOf`, `blocks` y `spanOf` por:

```js
  const FACT=Object.keys(C.FACTORY).filter(k=>C.FACTORY[k].class!=='terrain').map(k=>k.slice(2));
  const DOOR_PROPS=FACT.filter(t=>C.isDoor({type:t}));
  const PROP_KINDS=['window','veil','cover','barrier','portal'];
  const PASSABLE=FACT.filter(t=>!C.blocksMove({type:t})&&!C.isDoor({type:t}));
  const SPANS=Object.fromEntries(FACT.map(t=>[t,C.span({type:t})]).filter(([,s])=>s[0]>1||s[1]>1));
  const kindOf=p=>!p||typeof p.type!=='string'?null:C.wallKind(p);
  // ¿tapa este objeto (flag: 'sight' | 'light' | 'move' | 'hide')? Lo dice su definición (catalogo.js)
  function blocks(p,flag){ return C.blocks(p,flag); }
```

y en `gridOf`, el bucle de objetos:

```js
    for(const p of m.props||[]) if(p&&(C.blocksMove(p)||C.isDoor(p))&&Number.isInteger(p.x)&&Number.isInteger(p.z)){ const [sw,sd]=C.span(p); off(p.x,p.z,sw,sd); }
```

- [ ] **Paso 3: `t3d.js`** — en `loadAssets`, antes de `if(!T.Muros)await loadScript(BASE+'muros.js');`:

```js
        if(!T.Catalogo)await loadScript(BASE+'catalogo.js');
```

- [ ] **Paso 4:** `npm test` → PASS. Mutación: en `catalogo.js` `RAW.bridge` quitar `W` → el test compara ambos
  lados (los dos cambian igual): comprueba que **falla el de equivalencia** de la Tarea 3; restaura.
- [ ] **Paso 5:** `npm run test:ui` (54/54) y `BASE_URL=http://localhost:3999 npm run test:t3d` (26/26), con el
  servidor de pruebas reiniciado (runbook).
- [ ] **Paso 6: commit** `refactor(t3d): muros.js pregunta al catálogo (sin listas propias)`.

---

### Tarea 7: Motor por componentes y formato de escena en el cliente

**Archivos:** Modificar `modules/tablero3d/public/tablero3d.js`, `modules/tablero3d/public/mesa.js` (colección `pieces`).

**Interfaces:** Consume `Tablero3D.Catalogo` (`const Catalogo=T3D.Catalogo` junto a los demás al inicio del motor)
y `PIECES` (Map de definiciones `p:` del tablero, vacío hasta la fase 1; se llena con `GET …/pieces` si hay `DB`).

Cambios exactos (buscar la línea de la izquierda; cada uno es un reemplazo completo de esa línea o función):

- [ ] **Paso 1: consultas por componente** (un solo commit al final de los pasos 1–4):

| Buscar | Reemplazar por |
|---|---|
| `const isDoorType=t=>!!(PROP3D[t]&&PROP3D[t].door);` | `const isDoorType=t=>Catalogo.isDoor({type:t},PIECES);` |
| `function propSpan(p){ const P=PROP3D[p.type]; if(!P\|\|!P.span) return [1,1]; const [a,b]=P.span; return ((p.v\|0)%2)?[b,a]:[a,b]; }` | `function propSpan(p){ return Catalogo.span(p,PIECES); }` |
| en `refreshEntities`: `const decks=M.props.filter(p=>PROP3D[p.type]&&PROP3D[p.type].deck);` | `const decks=M.props.filter(p=>Catalogo.surface(p,PIECES));` |
| en `refreshEntities`: `else if(p.type!=='light'&&!(PROP3D[p.type]&&PROP3D[p.type].walk)) for(…)` | `else if(Catalogo.blocksMove(p,PIECES)) for(const [cx,cz] of propCells(p)) if(inb(cx,cz)) blocked.add(idx(cx,cz));` |
| en `refreshEntities`: `if(b&&PROP3D[b.kind]&&PROP3D[b.kind].gmOnly) b.gmOnly=true;` | `if(b&&Catalogo.gmOnly(p,PIECES)) b.gmOnly=true;` |
| en `computeDecks`: `PROP3D[…].deck` (si aparece) | `Catalogo.surface(p,PIECES)` |
| `function occupied(x,z,forMini){ return M.props.some(p=>p.type!=='light'&&!(forMini&&PROP3D[p.type]&&PROP3D[p.type].walk&&!PROP3D[p.type].deck)&&propCovers(p,x,z))…` | `function occupied(x,z,forMini){ return M.props.some(p=>p.type!=='light'&&!(forMini&&!Catalogo.blocksMove(p,PIECES)&&!Catalogo.surface(p,PIECES))&&propCovers(p,x,z))…` (el resto de la línea igual) |
| `const hideable=b=>!!b.prop&&b.kind!=='light'&&!Muros.kindOf(b.prop)&&['furniture','decor','mine'].includes(propCat(…));` | `const hideable=b=>!!b.prop&&b.kind!=='light'&&!Muros.kindOf(b.prop)&&Catalogo.isLow(b.prop,PIECES);` |
| en `doorPose`: `PROP3D[b.kind].lift` | `(Catalogo.defOf(b.prop,PIECES).components.door.lift\|\|0)` |

> Comprobación de `isLow`: `propCat` devuelve `furniture`, `decor` o `mine` exactamente para las filas `L` de
> `RAW` (mobiliario sin `cat`, `cat:'decor'` y dibujos). Si alguna no coincide, **corrige `RAW` en el catálogo**.

- [ ] **Paso 2: la luz fija de los objetos** — en `propLight`, la última línea
  `const P3=PROP3D[p.type]; if(P3&&P3.light) return mk(0,(P3.lightS||16)/16,0,P3.light,WARM,1);` y la del brasero
  `if(p.type==='brazier') return mk(0,0.8,0,6,WARM,1);` se quitan, y en el sitio de la última (tras la línea del
  portal) va una sola:

```js
  const E=Catalogo.emitLight(p,PIECES); if(E) return mk(0,E.h,0,E.r,WARM,1);
```

  y la línea `if(CUSTOM.objs[p.type]&&CUSTOM.objs[p.type].light) return spec(p.type);` pasa a:

```js
  // un dibujo que sustituye a un objeto de fábrica manda sobre su luz: con luz, la suya; con light:false, ninguna (arreglo §6)
  if(CUSTOM.objs[propArtKey(p)]) return CUSTOM.objs[propArtKey(p)].light?spec(propArtKey(p)):null;
```

  con `const propArtKey=p=>p.type==='tree'?'tree'+((p.v|0)%3):p.type;` definida junto a `propKind` (los árboles
  guardan su dibujo como `tree0`–`tree2`: así pueden tener luz propia, arreglo §6).

- [ ] **Paso 3: `deserialize`** — el filtro de tipos y el `map` de `props` pasan a:

```js
  const props=(Array.isArray(o.props)?o.props:[]).filter(p=>p&&typeof p.type==='string'&&Catalogo.defOf(p,PIECES)&&ok(p.x,p.z))
    .map(p=>{ const q={type:p.type,x:p.x,z:p.z,v:Math.max(0,Math.min(3,p.v|0)),open:isDoorType(p.type)&&!!(p.state&&'open' in p.state?p.state.open:p.open)};
      if(typeof p.uid==='string') q.uid=p.uid; if(typeof p.def==='string') q.def=p.def;
      if(p.state&&typeof p.state==='object') q.state=Object.assign({},p.state);
      if(p.type==='light') Object.assign(q,normLight(p));
      const wp=Muros.normProp(p); if(wp) Object.assign(q,wp,{open:isDoorType(wp.type)&&!!q.open});
      if(p.state&&p.state.locked) q.locked=true;
      return Catalogo.complete(q,PIECES); }).slice(0,5000);
```

- [ ] **Paso 4: `serialize`** — la línea de `props` pasa a (se guarda lo nuevo; `v:2`):

```js
    props:M.props.map(p=>{ const q=Catalogo.complete({type:p.type,x:p.x,z:p.z,v:p.v||0,open:!!p.open,...(p.locked?{locked:true}:{}),...(p.uid?{uid:p.uid}:{}),...(p.def?{def:p.def}:{}),...(p.state?{state:p.state}:{}),
      ...(p.type==='light'?normLight(p):{}),...(Muros.kindOf(p)?Muros.normProp(p):{})},PIECES); if(!p.uid) p.uid=q.uid; return q; }),
```

  y `return { v:1, name:…` pasa a `return { v:2, name:…`.

  En `toggleDoor` y `lockDoor`, tras cambiar `p.open` / `p.locked`, mantener `p.state` al día:

```js
  p.state=Object.assign({},p.state,{open:!!p.open,locked:!!p.locked});
```

  Y donde se crean piezas nuevas (`applyTool` objeto, `placeWall`, `campLink`), añadir `uid:Catalogo.newUid()`
  al objeto literal que se hace `push` a `M.props` (buscar `M.props.push(`; son 5 sitios).

- [ ] **Paso 5: `PIECES`** — en `mesa.js`, `COLLECTIONS` gana la colección de piezas:

```js
  const COLLECTIONS={boards:'scenes',assets:'drawings',campaigns:'campaigns',pieces:'pieces'};
```

  (y el comentario de la línea 5 la menciona). En el motor, junto a `let CAMP=null;`: `let PIECES=new Map();` y,
  donde se llama `setTimeout(loadAllAssets,0)` al arrancar, antes: `setTimeout(loadPieces,0);` con

```js
// definiciones de piezas del tablero (p:…); vacías hasta la fase 1. Se cargan antes que las escenas para poder leerlas
async function loadPieces(){ if(!DB) return; try{ const q=await DB.collection('pieces').get(); PIECES=new Map(q.docs.map(d=>{ const x=d.data(); return [x.id,x]; })); }catch(e){} }
```

- [ ] **Paso 6:** `npm test`, `npm run test:ui` (54/54), `test:t3d` (26/26). Todo verde.
- [ ] **Paso 7: mutación:** en `refreshEntities` usar `!Catalogo.blocksMove(...)` (invertido) → `test:t3d` o
  `test:ui` de 3D rojo (las fichas atraviesan cofres); restaura.
- [ ] **Paso 8: commit** `refactor(t3d): el motor decide paso, puertas, tarimas, maleza y luz fija por el catálogo; escenas v2 con uid`.

---

### Tarea 8: Arreglos visibles y pruebas de navegador

**Archivos:** Modificar `modules/tablero3d/public/tablero3d.js` (`toggleDoor`), `test/e2e/t3d.mjs`.

- [ ] **Paso 1: comprobar el fallo de la luz tras la puerta** (spec §6) con `probe('light', x, z)` antes de
  arreglar: en `test/e2e/t3d.mjs`, tras abrir la mesa del director, añade el paso (rojo si el fallo existe):

```js
  // §6: al abrir una puerta, la luz de una antorcha que hay detrás llega a la casilla de delante sin esperar a otro cambio
  const luzPuerta = await gm.evaluate(async () => {
    const v = window.JustAnotherVTT && window.JustAnotherVTT.t3d; if (!v) return 'sin probe';
    return v.probe('doorLight');   // probe añadido en el paso 2: monta puerta cerrada + antorcha detrás, abre y mide
  });
  step('luz: al abrir una puerta, la antorcha de detrás alumbra al momento', luzPuerta && luzPuerta.after > luzPuerta.before + 0.05, JSON.stringify(luzPuerta));
```

  Si el `probe` necesita exponerse, se hace por la vía que ya usa `test:t3d` para `probe` (buscar `probe` en
  `test/e2e/t3d.mjs`). Ejecuta: si el paso **pasa** sin arreglo, el fallo no existe: quita el arreglo del paso 3,
  deja el test y anótalo en `docs/07` («visto en código, no se reproduce»).

- [ ] **Paso 2:** `probe('doorLight')` en el motor (sólo lectura del resultado; monta en una escena temporal en
  memoria, mide `probe('light')` en la casilla delante de la puerta, llama a `toggleDoor`, espera un fotograma y
  vuelve a medir; restaura la escena).
- [ ] **Paso 3: arreglo** en `toggleDoor`, tras `computeAmbient();`:

```js
  lightDirty=true;   // la luz de las fuentes de detrás de la puerta también cambia (antes sólo la de fuera, §6)
```

  (`lightDirty` es el aviso que ya usa el motor para recalcular la luz; comprobar que el bucle lo atiende).
- [ ] **Paso 4: paso de privacidad en navegador** en `test/e2e/t3d.mjs`: el director coloca una barrera; el
  jugador en la mesa en vivo **no la tiene en sus datos** (`probe('props')` sin `barrier`) y sigue sin poder cruzarla.
- [ ] **Paso 5:** `test:t3d` (28/28), `test:ui` (54/54), `npm run check`.
- [ ] **Paso 6: commit** `fix(t3d): la luz de detrás de una puerta se recalcula al abrirla; pruebas de barrera del jugador`.

---

### Tarea 9: Rendimiento, documentación y despliegue

- [ ] **Paso 1: medida antes/después** — en `main` (antes) y en la rama (después), con el servidor local y
  una escena 160×160 con 5000 objetos (`townMap` grande o generada en `probe`): tiempo de `refreshEntities` y
  fps durante 10 s (`probe` o `performance.now` en la consola de Playwright). Criterio: después ≤ antes × 1,15.
  Anotar la tabla en `docs/07`.
- [ ] **Paso 2: docs** — `docs/01` (catálogo, esquema de pieza, `t3d.pieces`, escenas v2), `docs/02` (API de
  piezas en la tabla), `docs/05` (`test/t3d`, `foto-fabrica.cjs`: **no volver a generarla**), `docs/06`
  (P-41 cerrado; P-38 fase 0 hecha; P-43: quitar el espejo `open`/`locked` en la fase 2), `docs/07` (entrada con
  qué/por qué/verificación/revertir), `modules/tablero3d/README.md` (`catalogo.js`, `status/ping` ya estaba).
- [ ] **Paso 3: verificación final completa:** `npm run check`, `npm run test:ui`, `npm run test:t3d`,
  `docker compose up -d --build && npm run test:e2e`, y `test:t3d` contra el compose.
- [ ] **Paso 4: revisión** de toda la rama (subagente revisor) antes del merge.
- [ ] **Paso 4b: comprobación de datos de producción antes del despliegue** (el arreglo de la luz de los dibujos
  que sustituyen objetos cambia algo visible si en producción hay un farol, antorcha o brasero redibujado **sin luz**):
  `SELECT board_id, id, light_spec IS NOT NULL AS luz FROM t3d.drawings WHERE key IN ('lamp','torch','brazier');`
  Si sale alguno con `luz = false`, avisar al usuario antes de desplegar.
- [ ] **Paso 5: despliegue sólo con aprobación del usuario**: copia de la base de producción
  (`pg_dump` en `/root/backups/ja-vtt-predeploy/`), merge a `main`, push, deploy por API, verificación desde el
  servidor (migración `t3d/007` en el log, `/t3d/catalogo.js` 200, escenas de producción abren igual:
  `SELECT id FROM t3d.scenes` y abrir cada una con el director en el navegador), docs de servidor (`/root/docs/07`).
