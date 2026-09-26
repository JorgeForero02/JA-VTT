# Refactor SOLID de `tablero3d.js` — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** partir `modules/tablero3d/public/tablero3d.js` (5241 líneas, un cierre) en módulos por capas sin cambiar el comportamiento, quitar los 10 parches de reasignación y dejar reglas (ESLint, pruebas, docs) que impidan volver atrás.

**Architecture:** hojas puras UMD (`base`, `luces`, `objetos3d`, `escena`, `mapas`, `pixel`) probadas en node; fábricas de navegador con dependencias explícitas (`arte-procedural`, `ui3d`, `editor-arte`); el núcleo queda en `tablero3d.js`, que las usa por alias. Antes de mover nada se congela el comportamiento con fotos doradas y pasos e2e nuevos.

**Tech Stack:** Node 22 (`node:test`, `vm`), Playwright + Edge (`test:t3d`), three.js vendorizado, ESLint 9 (flat config).

**Spec:** `docs/superpowers/specs/2026-09-26-refactor-tablero3d-design.md` (léela entera antes de la tarea 1).

## Global Constraints

- **Refactor = sin cambio de comportamiento.** Única excepción: la tarea 10 (D1, aprobada). Una divergencia observada → parar e informar.
- Todos los ficheros nuevos en `modules/tablero3d/public/`. No tocar el 2D (`public/`, `server/`) salvo `eslint.config.mjs` y `package.json`.
- Módulos **puros**: sin DOM, sin `THREE`, sin estado global; UMD exactamente como el final de `catalogo.js`:
  `if (typeof module === 'object' && module.exports) module.exports = X; else (root.Tablero3D = root.Tablero3D || {}).X = X;`
  dentro de `(function (root) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);`
- **Fábricas**: `T3D.Nombre = function (deps) { … return {…}; }` registradas en `window.Tablero3D`; todo lo que usan del motor llega en `deps`; el estado que el motor reasigna llega como función lectora (`getM()`, `getTEX()`), nunca copiado.
- Sólo `$()` para el DOM (prohibido `getElementById`/`querySelector` en el módulo; ya lo comprueba `frontend.test.js:51`).
- Orden de carga en `t3d.js` (`loadAssets`): `three → vision → fichas → catalogo → muros → ambiente → ajustes → dados → personajes → base → luces → objetos3d → escena → mapas → pixel → mesa → icons-t3d → addIcons() → ui3d → arte-procedural → editor-arte → tablero3d`, cada uno con su guarda `if(!T.X)`.
- Una dependencia de producción (`pg`); no se añade ninguna.
- Tope por fichero nuevo: 1100 líneas. Meta `tablero3d.js` ≈ 2600.
- Pruebas durante las tareas: **sólo 3D** — `node --test test/t3d/` y `npm run test:t3d` (servidor: `DATABASE_URL=postgres://jav:jav@localhost:55432/jav_ui PORT=3999 node server.js`, contenedor `jav-test-pg`). La pasada completa (check + test:ui + test:t3d + compose/e2e) sólo en la tarea 11.
- Las fotos doradas de la tarea 1 (`test/t3d/fixtures/motor-antes.json`, `test/e2e/fixtures/motor-escenas.json`) y `fabrica-antes.json` **no se regeneran nunca** después de la tarea 1.
- Commits en `main`, mensaje en inglés estilo convencional, terminado en `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. No push.

## Review Focus

1. **Orden de inicialización (TDZ):** código que se ejecuta al cargar (`paint()` 77–232, `buildArt()` 951, `buildShade()` 3243, IIFE 3111) debe seguir ejecutándose en el mismo orden relativo → lo cubren los pasos «el motor pinta» y la foto `atlas` de la tarea 1.
2. **Estado reasignado leído por copia:** `TEX`, `SPR`, `atlasTex`, `CSTACK`, `M` cambian de identidad (resolución, nuevo mapa, arte propio) → paso de la tarea 1 «cambiar resolución y abrir otro mapa mantiene sprites y arte propio».
3. **Parches:** el orden guardia-en-vivo → turno → mover → sincronizar de `moveMiniTo` y el `AUTO.at=0; autoBaseline()` tras `loadMap` → pasos de combate y de autoguardado (el existente «abrir no guarda nada» cubre `loadMap`).
4. **Editor de arte con dibujos guardados**: abrir desde la biblioteca un dibujo de otra sesión y el borrador automático → paso «guardar, recargar, sigue en la biblioteca y en la paleta».
5. **Jugador (no director) en mesa en vivo**: guardas de `startCombat/nextTurn/setFog` → paso «el jugador no puede empezar combate ni cambiar la niebla».

---

### Task 1: Red de seguridad (fotos doradas + pasos e2e nuevos)

**Files:**
- Create: `test/t3d/tools/foto-motor.cjs` (captura única), `test/t3d/fixtures/motor-antes.json`, `test/t3d/motor-fotos.test.js`, `test/e2e/t3d-motor.mjs`, `test/e2e/fixtures/motor-escenas.json`
- Modify: `modules/tablero3d/public/tablero3d.js` (sólo `probe`: dos consultas nuevas de lectura), `package.json` (`test:t3d`)

**Interfaces:**
- Produces: `probe('serialized')` → `JSON.parse(JSON.stringify(serialize()))` con `seed` borrado; `probe('atlas')` → `{w,h,sum}` del lienzo `atlasCanvas` (misma suma que `'sprite'`: `sum=(sum*31+d[i])>>>0`). Ayudante de test `load(name)` en `motor-fotos.test.js` que devuelve la implementación **actual** (recortada del texto con `between`) y que las tareas 3–5 cambian por el módulo.

- [ ] **Step 1: probes nuevas.** En `probe` (tablero3d.js ~5211) añadir, antes de `return null;`:

```js
  // refactor (red de seguridad): la escena tal como se guarda (sin la semilla, que es azar) y la suma del atlas de casillas
  if(q==='serialized'){ const o=JSON.parse(JSON.stringify(serialize())); delete o.seed; return o; }
  if(q==='atlas'){ const d=atlasCanvas.getContext('2d').getImageData(0,0,atlasCanvas.width,atlasCanvas.height).data; let sum=0;
    for(let i=0;i<d.length;i++) sum=(sum*31+d[i])>>>0; return {w:atlasCanvas.width,h:atlasCanvas.height,sum}; }
```

- [ ] **Step 2: foto node.** `test/t3d/tools/foto-motor.cjs` recorta del texto actual (como hace `frontend.test.js:229` `engineConst` y `:386` `between`) y ejecuta en `vm`:
  - `WARM, LIGHT_TYPES, LIGHT_IDS, OBJ_LIGHT_IDS, LIGHT_ANIMS, TOKEN_LIGHTS, HEX6, normLight, lightOfType, lightName, hexRGB, lightRGB`;
  - `mulberry32, hash, pick`;
  - `demoMap()`, `dungeonMap(32,7)`, `dungeonMap(48,12345)`, `townMap()`, `lightWorkshopMap()` con las dependencias que ya recorta el test (`frontend.test.js:277, 375, 379–380, 442, 803` muestran los trozos que necesitan).
  Salida `motor-antes.json`:

```json
{ "luces": { "normLight": [ /* normLight(x) para cada x de CASOS_LUZ */ ], "lightOfType": { "<id>": {} }, "lightRGB": {} },
  "azar": { "mulberry32_7": [/* 8 valores */], "hash": [/* hash(x,z,s) para 16 tríos */] },
  "mapas": { "demo": {}, "dungeon32_7": {}, "dungeon48_12345": {}, "town": {}, "taller": {} } }
```

  Los mapas se guardan con los `Int8Array/Uint8Array` pasados a `Array.from` y **sin `seed`**. `CASOS_LUZ` (en el propio script y en el test, idénticos):

```js
const CASOS_LUZ = [{}, { preset: 'torch' }, { r: 99, h: -3, color: '#ABCDEF', intensity: 5, anim: 'pulse', angle: 0, rot: 9999 },
  { c: '#112233', f: 0 }, { preset: 'nope', name: '  Farol del puerto  ' }, { r: 'x', h: 'y', on: false, darkness: 1 }];
```

  Ejecutar una vez: `node test/t3d/tools/foto-motor.cjs` → escribe `test/t3d/fixtures/motor-antes.json`. Si el fichero existe, el script **se niega** a sobrescribir (`fs.existsSync` → `process.exit(1)` con mensaje «no se regenera»).

- [ ] **Step 3: test node.** `test/t3d/motor-fotos.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const FOTO = require('./fixtures/motor-antes.json');
const { load, CASOS_LUZ, plain } = require('./helpers/motor');   // load('luces'|'azar'|'mapas') → implementación actual
test('luces: normLight, lightOfType y lightRGB iguales a la foto', () => {
  const L = load('luces');
  assert.deepEqual(CASOS_LUZ.map((c) => L.normLight(c)), FOTO.luces.normLight);
  for (const id of L.LIGHT_IDS) assert.deepEqual(L.lightOfType(id), FOTO.luces.lightOfType[id], id);
  for (const h of ['#ff9c50', '#000000', 'mal']) assert.deepEqual(L.lightRGB(h), FOTO.luces.lightRGB[h], h);
});
test('azar: mulberry32 y hash iguales a la foto', () => {
  const A = load('azar'); const r = A.mulberry32(7);
  assert.deepEqual(Array.from({ length: 8 }, () => r()), FOTO.azar.mulberry32_7);
  assert.deepEqual(FOTO.azar.hash.map(([x, z, s]) => [x, z, s, A.hash(x, z, s)]), FOTO.azar.hash);
});
test('mapas: los cuatro generadores dan lo mismo que antes', () => {
  const G = load('mapas');
  assert.deepEqual(plain(G.demoMap()), FOTO.mapas.demo);
  assert.deepEqual(plain(G.dungeonMap(32, 7)), FOTO.mapas.dungeon32_7);
  assert.deepEqual(plain(G.dungeonMap(48, 12345)), FOTO.mapas.dungeon48_12345);
  assert.deepEqual(plain(G.townMap()), FOTO.mapas.town);
  assert.deepEqual(plain(G.lightWorkshopMap()), FOTO.mapas.taller);
});
```

  (`FOTO.azar.hash` guarda tuplas `[x,z,s,valor]`.) `test/t3d/helpers/motor.js` exporta `load`, `CASOS_LUZ`, `plain` (typed arrays → arrays, borra `seed`); en esta tarea `load` recorta del texto con el mismo código que `foto-motor.cjs` (compártelo: el script hace `require('../helpers/motor')`).

- [ ] **Step 4: romper a propósito.** Cambia temporalmente `r:8` de `torch` en `LIGHT_TYPES` → `node --test test/t3d/motor-fotos.test.js` FALLA; revierte → PASA.

- [ ] **Step 5: e2e nuevo `test/e2e/t3d-motor.mjs`** (mismo arranque que `t3d.mjs:10–45`: `launch`, `page`, `register`, `step`, cuenta de director y de jugador, tablero «Mesa 3D»). Pasos, cada uno con `step(...)`:
  1. **atlas y sprites**: `probe('atlas')` y `probe('sprite','knight')` igual a la foto e2e.
  2. **escenas**: importar 3 escenas (una v1 sin `def/uid`, una v2 con piezas `p:` y puerta, una con techos, notas y planos; constrúyelas en el propio script, 16×16, como `t3d.mjs` hace con `importJson`) y comparar `probe('serialized')` con la foto.
  3. **mapas de ejemplo**: abrir los botones `[data-map]` (pueblo, mazmorra, demo, taller) y comparar `probe('props').length` y `probe('serialized').props.length` con la foto.
  4. **resolución**: cambiar la resolución de píxel (botón de VIEWUI, :2515) ida y vuelta → `probe('atlas')` vuelve a la foto.
  5. **editor de arte**: abrir (`#t3d-artOpen`), asistente «Nuevo dibujo» tipo objeto, pintar un píxel en el lienzo, «Probar» → la paleta tiene un `obj:o_…` y se coloca en (5,5) (`probe('props')` lo lista); volver, «Guardar»; recargar → sigue en la biblioteca (`GET /api/t3d/boards/:id/drawings` lo lista) y en la paleta.
  6. **deshacer**: en modo edición pintar terreno en (2,2); `Ctrl+Z` → `probe('serialized').t` vuelve; `Ctrl+Y` / rehacer → cambia; botón `#t3d-undo` → vuelve.
  7. **combate**: dos fichas; empezar combate; mover la que no tiene turno → rechazado (`probe('tokens')` sin cambio); mover la del turno → `probe('combat').left` baja; siguiente turno; terminar → `probe('combat').active===false`.
  8. **jugador en vivo**: con la mesa en vivo, el jugador no puede empezar combate ni cambiar la niebla (el estado del director no cambia).
  9. sin errores de consola.
  Las fotos e2e se guardan con `FOTO=1 npm run test:t3d` en `test/e2e/fixtures/motor-escenas.json` (el script se niega a sobrescribir si existe); sin `FOTO`, compara.

- [ ] **Step 6:** `package.json`: `"test:t3d": "node test/e2e/t3d.mjs && node test/e2e/t3d-motor.mjs"`. Capturar la foto e2e una vez, luego correr sin `FOTO`: todo verde. Romper a propósito un paso (p. ej. cambiar el número esperado de props) → FAIL; revertir.

- [ ] **Step 7: Commit** `test(t3d): golden snapshots and e2e safety net before refactor`.

### Task 2: ESLint del módulo, `readEngine()` y trinquete provisional

**Files:** Modify `eslint.config.mjs`, `test/t3d/frontend.test.js`, `test/t3d/cliente-armonia.test.js`; Create `test/t3d/helpers/engine.js`.

**Interfaces:** Produces `readEngine()` → texto de todos los ficheros del motor concatenados en orden de carga (lista `ENGINE_FILES` exportada del mismo helper; las tareas 3–8 le añaden cada fichero nuevo).

- [ ] **Step 1:** `test/t3d/helpers/engine.js`:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MOD = path.join(__dirname, '..', '..', '..', 'modules', 'tablero3d', 'public');
// ficheros del motor en orden de carga (t3d.js loadAssets); cada extracción añade el suyo
const ENGINE_FILES = ['tablero3d.js'];
const readEngine = () => ENGINE_FILES.map((f) => fs.readFileSync(path.join(MOD, f), 'utf8')).join('\n');
module.exports = { MOD, ENGINE_FILES, readEngine };
```

  En `frontend.test.js:20` y `cliente-armonia.test.js` cambiar `readMod('tablero3d.js')` del motor por `readEngine()`.
- [ ] **Step 2:** `eslint.config.mjs`: añadir dos bloques:

```js
  {
    // tablero 3D: módulos del cliente (scripts clásicos). Los nuevos se revisan enteros; el núcleo, sin no-undef.
    files: ['modules/tablero3d/public/*.js'],
    ignores: ['modules/tablero3d/public/tablero3d.js', 'modules/tablero3d/public/t3d.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...browserGlobals, THREE: 'readonly', module: 'writable', globalThis: 'readonly' } },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }], 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'max-lines': ['error', { max: 1100 }] },
  },
  {
    files: ['modules/tablero3d/public/tablero3d.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...browserGlobals, THREE: 'readonly' } },
    rules: { 'no-func-assign': 'off', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'max-lines': ['error', { max: 5300 }] },
  },
```

  (`no-func-assign` se enciende en la tarea 9, cuando no queden parches.) Si los ficheros existentes (`fichas.js`, `vision.js`…) fallan `recommended`, **no se arreglan**: se añaden a `ignores` del primer bloque con un comentario «módulo anterior al refactor» y se anota en el informe.
- [ ] **Step 3:** `npx eslint modules/tablero3d/public` verde; `node --test test/t3d/` verde. Romper a propósito: añade `const a=1; const a=2;` en tablero3d.js → lint FALLA; revertir.
- [ ] **Step 4: Commit** `chore(t3d): lint client module and read engine files as a set in tests`.

### Task 3: `base.js` y `luces.js`

**Files:** Create `modules/tablero3d/public/base.js`, `modules/tablero3d/public/luces.js`, `test/t3d/luces.test.js`; Modify `tablero3d.js` (UTIL :25–27 y parte de :556; LIGHT :1232–1266 salvo lo que lea `L`, `WALLAT` o `PIECES`), `t3d.js`, `test/t3d/helpers/motor.js`, `test/t3d/helpers/engine.js`, `test/t3d/frontend.test.js` (:131, :138, :148, :150, :229–234), `package.json` (cobertura).

**Interfaces:**
- Produces `Tablero3D.Base = { mulberry32, hash, pick, hexRGB }` y `Tablero3D.Luces = { WARM, HEX6, LIGHT_TYPES, LIGHT_IDS, OBJ_LIGHT_IDS, LIGHT_ANIMS, TOKEN_LIGHTS, normLight, lightOfType, lightName, lightRGB }` (`luces.js` usa `Base.hexRGB`; en node, `require('./base')`).
- En `tablero3d.js`, tras la línea de alias (:9): `const {mulberry32,hash,pick,hexRGB}=T3D.Base; const {WARM,HEX6,LIGHT_TYPES,LIGHT_IDS,OBJ_LIGHT_IDS,LIGHT_ANIMS,TOKEN_LIGHTS,normLight,lightOfType,lightName,lightRGB}=T3D.Luces;` — el resto del motor no cambia ni un nombre.

- [ ] **Step 1:** `test/t3d/luces.test.js` — `require` de los dos módulos: casos de §Task 1 más propiedades: `normLight` acota `r` a 1–24 y `h` a múltiplos de 0,25 en 0–4; `lightOfType('nope')===null`; `OBJ_LIGHT_IDS` no incluye `darkness`, `bullseye`, `window`; `hexRGB('#ff0080')` → `[255,0,128]`. Correr → FALLA (no existen).
- [ ] **Step 2:** crear los módulos moviendo el código **literal** (sin reformatear líneas), con el envoltorio UMD de Global Constraints. Borrar las definiciones del motor y poner los alias. `helpers/motor.js`: `load('luces')` → `require('…/luces.js')`, `load('azar')` → `require('…/base.js')`. `engineConst` de `frontend.test.js:229` pasa a `require` del módulo.
- [ ] **Step 3:** `t3d.js` loadAssets: `if(!T.Base)await loadScript(BASE+'base.js'); if(!T.Luces)await loadScript(BASE+'luces.js');` tras `personajes`. Actualizar las listas de `frontend.test.js` :131, :138, :148 y :150 (claves `Base`, `Luces`). `ENGINE_FILES` = `['base.js','luces.js','tablero3d.js']`. Cobertura: `--test-coverage-include="modules/tablero3d/public/base.js" --test-coverage-include="modules/tablero3d/public/luces.js"`.
- [ ] **Step 4:** `node --test test/t3d/` + `npx eslint modules/tablero3d/public` + `npm run test:t3d` verdes (fotos intactas).
- [ ] **Step 5: Commit** `refactor(t3d): extract base and light data modules`.

### Task 4: `objetos3d.js` y `mapas.js`

**Files:** Create `modules/tablero3d/public/objetos3d.js`, `modules/tablero3d/public/mapas.js`, `test/t3d/mapas.test.js`; Modify `tablero3d.js` (PROP3D datos :713–921; GENMAP :1778–1836; TOWN :4601–4734), `t3d.js`, helpers, `frontend.test.js` (anclas :277, :375, :379–380, :390–392, :442, :803), `test/t3d/tools/foto-fabrica.cjs` (:12–17), `package.json`.

**Interfaces:**
- `Tablero3D.Objetos3D = { PROP3D, …las constantes de color que sólo usan los datos }`. Si `PROP3D` contiene funciones de pintado que usan lienzo, **sólo** se mueven los datos y `propSlices` si es pura; lo que pinte se queda para la tarea 6. `foto-fabrica.cjs` pasa a `require('…/objetos3d.js').PROP3D` y `fabrica-antes.json` debe seguir igual.
- `Tablero3D.Mapas = { demoMap, dungeonMap, townMap, lightWorkshopMap }`. Sus dependencias del motor (`defaultSheet`, `normSheet`, `lightOfType`, `LIGHT_TYPES`, `mulberry32`, `hash`) se toman de `Base`/`Luces`; `defaultSheet/normSheet` se mueven a `mapas.js` **sólo si** no dependen de nada del cierre; si dependen (`SHEET_OF`, `CHARS`), `Mapas` se construye con `Tablero3D.Mapas.make({defaultSheet, normSheet})` y exporta `make` (documentarlo en la cabecera).
- En el motor: alias `const {demoMap,dungeonMap,townMap,lightWorkshopMap}=…;` en el mismo punto del cierre donde estaban.

- [ ] **Step 1:** `mapas.test.js`: cada generador devuelve `w,d` y `h.length===w*d`, `t` sólo con letras de `TERR` (copiar la lista desde el motor en el test), y `dungeonMap(32,7)` es determinista (dos llamadas iguales salvo `seed`). FALLA.
- [ ] **Step 2:** mover, alias, cargar en `t3d.js` tras `luces`, listas de `frontend.test.js`, `ENGINE_FILES`, cobertura, `helpers/motor.js` `load('mapas')` → módulo. Las anclas de texto que recortaban estos trozos pasan a `require`.
- [ ] **Step 3:** `node --test test/t3d/` (fotos `motor-antes.json` y `fabrica-antes.json` sin tocar) + lint + `npm run test:t3d` verdes.
- [ ] **Step 4: Commit** `refactor(t3d): extract prop data and map generators`.

### Task 5: `escena.js`

**Files:** Create `modules/tablero3d/public/escena.js`, `test/t3d/escena.test.js`; Modify `tablero3d.js` (:3035–3039 `blankMap`, :3052 `levelSide`, :3053–3108 `serialize/deserialize/readExtras/sceneExtras`, `normRoof` :215–234, `campValid`), `t3d.js`, helpers, `frontend.test.js`, `package.json`.

**Interfaces:**
- `Tablero3D.Escena = { levelSide, readExtras, sceneExtras, normRoof, blankMap(n,terr,env,seed), read(o, deps), write(model, deps) }` donde
  - `deps = { pieces, opaque(p), ft(p), terr, miniKinds, normSheet }` (Catalogo, Muros, Ambiente, Ajustes y Luces se toman de `Tablero3D`/`require`);
  - `read` = cuerpo de `deserialize` **sin** la semilla: devuelve el objeto sin `seed`;
  - `write(model, deps)` con `deps` además `{ env, fog }` = cuerpo de `serialize` sin `syncMinis()`; muta `p.uid` igual que hoy.
- En el motor quedan envoltorios de una línea con los mismos nombres:

```js
function deserialize(o){ return {...Escena.read(o,escenaDeps()),seed:(Math.random()*1e9)|0}; }
function serialize(){ syncMinis(); return Escena.write(M,{...escenaDeps(),env:ENV,fog:!!state.fog}); }
const escenaDeps=()=>({pieces:PIECES,opaque,ft:FT,terr:TERR,miniKinds:MINI_KINDS,normSheet});
function blankMap(n,terr,env){ return Escena.blankMap(n,terr,env,(Math.random()*1e9)|0); }
```

  Ojo: hoy `deserialize` pone `seed` **antes** de `start` y `...readExtras`; el orden de claves sólo importa si algo itera el objeto. `probe('serialized')` borra `seed`: la foto e2e lo cubre.

- [ ] **Step 1:** `escena.test.js` (node, con `catalogo`, `muros`, `ambiente`, `ajustes`, `luces` cargados en `vm` o por `require` si son UMD; los que no, con `vm` como `frontend.test.js:567`): ida y vuelta `write(read(o))` de las 3 escenas del Step 5.2 de la tarea 1 (cópialas a `test/t3d/fixtures/motor-escenas-entrada.json`); `read` rechaza `w=3`, `h` de longitud errónea y terreno desconocido; conserva `p:` opacas; `blockCells` fuera de rango se descartan. FALLA.
- [ ] **Step 2:** mover, envoltorios, carga tras `mapas`, listas, `ENGINE_FILES`, cobertura.
- [ ] **Step 3:** `node --test test/t3d/` + lint + `npm run test:t3d` (paso «escenas» contra la foto) verdes.
- [ ] **Step 4: Commit** `refactor(t3d): extract scene serialization as a pure module`.

### Task 6: `arte-procedural.js`

**Files:** Create `modules/tablero3d/public/arte-procedural.js`; Modify `tablero3d.js` (ATLAS :46–262, SPRITES :263–657, CUSTOMART :658–712, PROP3D pintado + `buildArt` :922–956), `t3d.js`, helpers, `frontend.test.js` (recortes :292, :390–392, :471, :520, `buildCharTex`, `tileSource16`, `applyTileOverrides`), `cliente-armonia.test.js` si recorta algo de aquí.

**Interfaces:**
- `Tablero3D.ArteProcedural = function (deps)` con `deps = { THREE, Personajes, Fichas, Objetos3D, Base, getTEX }` → devuelve un objeto con **getters** para lo que el motor reasigna y funciones para lo demás:

```js
return {
  get SPR(){ return SPR; }, get STACK(){ return STACK; }, get STK(){ return STK; }, get atlasTex(){ return atlasTex; }, set atlasTex(v){ atlasTex=v; },
  get CSTACK(){ return CSTACK; }, get PSTACK(){ return PSTACK; }, get atlasCanvas(){ return atlasCanvas; },
  CUSTOM, TERR, ROOF_MATS, G, D, S, /* …constantes de paleta que el motor usa… */
  atlas, uvc, edgeUV, buildArt, composeAtlas, buildCharTex, applyTileOverrides, stackFromSlices, stackGeo, placeholderStack,
  paintStack, stackTree, propSlices, pstack, CAN, CHARS, CHAR_ART, HANDART, /* …la lista exacta la fija el implementador y la documenta en la cabecera… */
};
```

  En el motor: `const ART3=T3D.ArteProcedural({THREE,Personajes,Fichas,Objetos3D:T3D.Objetos3D,Base:T3D.Base,getTEX:()=>TEX});` en el punto donde empezaba ATLAS (:46), y cada uso de un nombre reasignable pasa a `ART3.SPR`, etc. **Los nombres no reasignables** se desestructuran una vez (`const {atlas,uvc,…}=ART3;`). `TEX` se sigue declarando en el motor (lo cambia VIEWUI :2515) y el módulo lo lee con `getTEX()`.
- `mkCanvas`, `R`, `outline`, `mirror`, `tex`, `BAYER` se mueven aquí si sólo los usa el arte; si los usa también el núcleo, se exportan y el motor los desestructura.

- [ ] **Step 1:** probar primero que la foto e2e cubre esto: cambiar temporalmente un color de `G` → `npm run test:t3d` FALLA en «atlas y sprites»; revertir.
- [ ] **Step 2:** mover, construir, reemplazar usos. Todo el código que hoy se ejecuta al cargar (`paint()`, `buildArt()`) se ejecuta dentro de la fábrica, que se invoca en :46 → mismo orden.
- [ ] **Step 3:** los recortes de texto de `frontend.test.js` que ejecutaban trozos de aquí pasan a construir la fábrica en `vm` con un lienzo falso **sólo si** el test necesita píxeles; si comprobaba datos (paleta, `CHAR_ART`, `GLYPH`), leerlos del objeto devuelto. Si alguno no se puede migrar sin DOM real, se sustituye por el paso e2e equivalente y se anota en el informe.
- [ ] **Step 4:** `node --test test/t3d/` + lint + `npm run test:t3d` verdes; `wc -l` de `tablero3d.js` en el informe.
- [ ] **Step 5: Commit** `refactor(t3d): extract procedural art as an injected factory`.

### Task 7: `ui3d.js` y `pixel.js`

**Files:** Create `modules/tablero3d/public/ui3d.js`, `modules/tablero3d/public/pixel.js`, `test/t3d/pixel.test.js`; Modify `tablero3d.js` (`mkBtn/sepEl/lblEl` :3626–3628; `el/esc` GAMEUI; `thumbCanvas`; `lsGet/lsSet`; puros de ART y ARTADJ: `flipH, flipV, rot90, lineCb, rgb2hsl, hsl2rgb, hueRamp, parsePalette, reduceToPalette, replaceColor, mapPixels`), `t3d.js`, helpers, `package.json`.

**Interfaces:**
- `Tablero3D.UI = function ({ $, icon })` → `{ el, esc, mkBtn, sepEl, lblEl, thumbCanvas, lsGet, lsSet }`. En el motor, justo tras la línea de alias: `const {el,esc,mkBtn,sepEl,lblEl,thumbCanvas,lsGet,lsSet}=T3D.UI({$,icon:ctx.icon});`
- `Tablero3D.Pixel = { flipH, flipV, rot90, lineCb, rgb2hsl, hsl2rgb, hueRamp, parsePalette, reduceToPalette, replaceColor, mapPixels }` — puras sobre `Uint8ClampedArray` + `w,h`. Si alguna toca `ART` o el lienzo, se parte: el núcleo puro va a `pixel.js`, el envoltorio con `ART` se queda para la tarea 8.

- [ ] **Step 1:** `pixel.test.js`: `rot90` cuatro veces = identidad en 3×2; `flipH` dos veces = identidad; `hsl2rgb(...rgb2hsl(r,g,b))` ≈ `[r,g,b]` (±1) para 50 colores de `mulberry32(3)`; `lineCb` de (0,0) a (3,1) visita 4 píxeles en orden; `parsePalette('#ff0000\n#00ff00')` → 2 colores; `reduceToPalette` deja sólo colores de la paleta. FALLA.
- [ ] **Step 2:** mover, alias, cargar (`pixel` tras `mapas`; `ui3d` tras `addIcons()`), listas, `ENGINE_FILES`, cobertura de `pixel.js`.
- [ ] **Step 3:** `node --test test/t3d/` + lint + `npm run test:t3d` verdes.
- [ ] **Step 4: Commit** `refactor(t3d): extract UI helpers and pure pixel operations`.

### Task 8: `editor-arte.js`

**Files:** Create `modules/tablero3d/public/editor-arte.js`; Modify `tablero3d.js` (ART :3219–4086 restante, PANELS :5011–5057 salvo la ayuda `SHEETS` si no es del editor, ARTADJ :5058–5145 restante), `t3d.js`, helpers, `frontend.test.js` (`ART_IC` :118–119 y los ids del editor siguen comprobándose contra `readEngine()`).

**Interfaces:**
- `Tablero3D.EditorArte = function (api)`; cabecera del fichero con la lista cerrada de `api` y de lo que devuelve. `api` (mínimo; el implementador la completa con lo que falte y lo documenta):

```js
{ $, icon, ui /* T3D.UI */, pixel /* T3D.Pixel */, art /* instancia ArteProcedural */, Catalogo, Fichas, Personajes,
  getM, getENV, getTEX, getDB, getDL, uniforms,
  rebuild, buildDecor, buildRoofs, refreshEntities, syncMinis, renderPalette, layout, resize, showHint, applyArtMaps,
  every, on, propOpts, setPropSel /* (i) => state.propSel=i */, setTool }
```

  Devuelve `{ open, close, isOpen, key, preview, loadAllAssets, registerDoc, applyCustom, docInfo, openNewDlg, artTab }` (`ART.open` → `isOpen()`, `artKey` → `key`, `artPreview` → `preview`; INPUT y LOOP pasan a usar estos nombres).
- En el motor: `const EDITOR=T3D.EditorArte({...});` en el punto donde empezaba ART (:3219); los manejadores que ART registraba al cargar (`$('artSave').onclick`…) se registran dentro de la fábrica en la misma posición relativa. `loadAllAssets` sigue llamándose desde STORE (:3121) como `EDITOR.loadAllAssets()`.

- [ ] **Step 1:** comprobar que el e2e cubre el editor: romper `docToRecord` (p. ej. `res:0`) → paso «editor de arte» FALLA; revertir.
- [ ] **Step 2:** mover, construir, sustituir los usos entrantes (`ART.open`, `artKey`, `artPreview`, `loadAllAssets`, `registerDoc`, `applyCustom`). Ninguna referencia a `ART` fuera de `editor-arte.js` (`grep -n "\bART\b" tablero3d.js` vacío).
- [ ] **Step 3:** `node --test test/t3d/` + lint (`editor-arte.js` ≤ 1100 líneas; si no cabe, partir el borrador/biblioteca en `editor-arte-biblioteca.js` con su propia fábrica) + `npm run test:t3d` verdes. `wc -l` en el informe.
- [ ] **Step 4: Commit** `refactor(t3d): extract pixel-art editor behind an explicit API`.

### Task 9: Quitar los 10 parches

**Files:** Modify `tablero3d.js` (parches :4201–4204 y :4946–4962, definiciones originales de `moveMiniTo` :2443, `loadMap` :1938, `startCombat/nextTurn/endCombat/dash` GAME, `undo/redo/endStroke` EDITOR, `setFog` FOG, botón :2771), `eslint.config.mjs`, `test/t3d/frontend.test.js`.

**Interfaces:** nombres públicos sin cambio. Versiones base renombradas: `moveMini` (original de :2443), `combatMove` (cuerpo del parche :4202 que llama a `moveMini`), `loadMapLocal`, `startCombatLocal`, `nextTurnLocal`, `endCombatLocal`, `dashLocal`, `undoLocal`, `redoLocal`, `endStrokeLocal`, `setFogLocal`.

- [ ] **Step 1:** test de cableado en `frontend.test.js`:

```js
test('el motor no reasigna funciones (sin parches)', () => {
  const src = readEngine();
  for (const f of ['moveMiniTo', 'loadMap', 'startCombat', 'nextTurn', 'endCombat', 'dash', 'undo', 'redo', 'endStroke', 'setFog']) {
    assert.doesNotMatch(src, new RegExp(`(^|[;\\s])${f}=function`, 'm'), f);
    assert.equal((src.match(new RegExp(`function ${f}\\(`, 'g')) || []).length, 1, f);
  }
  assert.match(src, /\$\('undo'\)\.onclick=undoLocal; \$\('redo'\)\.onclick=redoLocal;/);   // D1 se arregla en la tarea 10
});
```

  FALLA.
- [ ] **Step 2:** para cada parche: renombrar la original a `…Local` (o `moveMini`/`combatMove`), escribir la pública como **declaración** con el cuerpo del parche llamando a la local. Ejemplo exacto para el caso compuesto:

```js
function moveMiniTo(b,x,z,quiet){   // permiso en vivo → turno de combate → mover → sincronizar
  if(LIVE.on&&!canControl(b)){ if(!quiet) showHint(miniName(b)+' lo controla otra persona.',1600); return false; }
  const okm=combatMove(b,x,z,quiet); if(okm&&LIVE.on){ liveTok(b); if(GM.active) liveCombat(); } return okm;
}
```

  y `loadMap`: `function loadMap(...a){ const r=loadMapLocal(...a); AUTO.at=0; autoBaseline(); return r; }`. La declaración pública se coloca **donde estaba el parche** (las funciones declaradas se elevan: el orden de llamada no cambia). Botón: `$('undo').onclick=undoLocal; $('redo').onclick=redoLocal;`.
- [ ] **Step 3:** `eslint.config.mjs`: en el bloque de `tablero3d.js`, `'no-func-assign': 'error'`. Romper a propósito: reponer `undo=function(){}` → lint FALLA; revertir.
- [ ] **Step 4:** `node --test test/t3d/` + lint + `npm run test:t3d` (pasos de combate, jugador en vivo, deshacer, autoguardado) verdes.
- [ ] **Step 5: Commit** `refactor(t3d): replace function monkey-patches with explicit composition`.

### Task 10: D1 — botones deshacer/rehacer avisan a la mesa en vivo

**Files:** Modify `tablero3d.js` (:2771), `test/t3d/frontend.test.js` (aserción de la tarea 9), `test/e2e/t3d-motor.mjs`.

- [ ] **Step 1:** paso e2e nuevo: con la mesa en vivo, el director pinta terreno, pulsa el **botón** deshacer → el jugador recibe el tablero sin el cambio (`probe('serialized').t` del jugador igual al de antes del trazo, esperando con `waitForFunction`, 5 s). FALLA con el código de la tarea 9.
- [ ] **Step 2:** `$('undo').onclick=()=>undo(); $('redo').onclick=()=>redo();` y actualizar la aserción de la tarea 9 a `/\$\('undo'\)\.onclick=\(\)=>undo\(\); \$\('redo'\)\.onclick=\(\)=>redo\(\);/`.
- [ ] **Step 3:** `node --test test/t3d/` + `npm run test:t3d` verdes.
- [ ] **Step 4: Commit** `fix(t3d): undo/redo buttons sync the live table like Ctrl+Z`.

### Task 11: Trinquete final, documentación y pasada completa

**Files:** Modify `eslint.config.mjs`, `docs/01-arquitectura.md`, `docs/04-convenciones.md`, `docs/05-runbook.md`, `docs/07-historial.md`, `docs/06-pendientes.md`, `modules/tablero3d/docs/` (índice del módulo si lista ficheros), memoria del proyecto.

- [ ] **Step 1:** `max-lines` de `tablero3d.js` = su `wc -l` redondeado a la centena superior. Comentario en `eslint.config.mjs`: «trinquete: bajar está permitido; subir es decisión explícita en docs/04».
- [ ] **Step 2:** `docs/04-convenciones.md`, sección nueva «Arquitectura del cliente 3D»: diagrama de capas de la spec §2; reglas §2.1; prohibido reasignar funciones (`no-func-assign`); trinquete; pruebas que ejecutan (regex sólo para cableado, con `readEngine()`); dónde va lo nuevo (fase 1: panel «Comportamiento» → `editor-arte.js`; datos/plantillas puros → módulo puro nuevo o `catalogo.js`). Corregir los umbrales de cobertura a los reales de `package.json` (78/72/82).
- [ ] **Step 3:** `docs/01` (mapa de ficheros del cliente 3D), `docs/05` (cómo capturar/no capturar fotos: `FOTO=1` sólo la primera vez), `docs/07` (qué · por qué · revertir: `git revert` del rango de la tarea 1 a la 11), `docs/06` (sin pendientes nuevos; D1 cerrado).
- [ ] **Step 4:** pasada completa: `npm run check`, `npm run test:ui`, `npm run test:t3d`, `docker compose up -d --build && npm run test:e2e`. Todo verde.
- [ ] **Step 5: Commit** `docs(t3d): client architecture rules and line-count ratchet`.
