# Fichas: condiciones SRD, HP y elevación — plan de implementación (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar P-04 (cobertura con umbral), sanear `docs/06-pendientes.md`, e implementar P-19 (condiciones), P-20 (HP) y P-21 (elevación) en las fichas: datos saneados en el servidor, permisos por dueño, visibilidad de HP configurable, y su dibujo y edición en el cliente.

**Architecture:** Los tres campos viajan dentro del objeto `token` (`objects.data` jsonb, sin migración). `server/rules.js` los sanea y decide permisos; `server/app.js` sólo aplica una proyección (`objectFor`) que quita el HP a los jugadores cuando el director lo reserva. En el cliente, `core.js` guarda el catálogo, `render.js` pinta badges/barra/etiqueta y `editor.js` ofrece un popover «Estado» desde el menú contextual más campos en el editor.

**Tech Stack:** Node 22+ (`node:test` con `--experimental-test-coverage`), PostgreSQL 16 (sólo para tests de integración), cliente vanilla (scripts clásicos, canvas 2D), Playwright + Edge para `npm run test:ui`.

**Spec:** `docs/superpowers/specs/2026-09-19-condiciones-srd-y-tactica-design.md` (requisitos 1–3 y su tabla de decisiones). Los requisitos 4–6 (regla multitramo, anotaciones, audio) van en planes B y C, **no aquí**.

**Rama:** `prod-2d` (producción). Un commit por tarea. **No desplegar** al terminar: el despliegue lo decide el usuario tras la revisión.

## Global Constraints

- Todo el SQL en `server/db.js`; **este plan no toca SQL ni añade migraciones** (los campos van en jsonb).
- Reglas de negocio sólo en `server/rules.js` (`sanitize`, `playerUpsert`, `objectFor`). `app.js` no decide nada: aplica.
- Una dependencia de producción (`pg`). Cero paquetes nuevos, ni en servidor ni en cliente.
- Cliente = scripts clásicos con ámbito global. Sin módulos ES nuevos, sin bundler.
- Textos de usuario en castellano. Estilo: `'use strict'`, comillas simples, punto y coma, 2 espacios; el cliente usa el estilo compacto existente (sin espacios tras `;` ni `,` en `editor.js`/`render.js`): imitarlo.
- Cada test se rompe una vez a propósito (mutación manual) y se vuelve a arreglar antes de commitear.
- `npm run check` verde antes de cada commit. `npm run test:ui` verde antes de dar por terminado el plan (se toca el cliente).
- Catálogo de condiciones, **exactamente estos 20 ids** (spec §1): `blinded charmed deafened frightened grappled incapacitated invisible paralyzed petrified poisoned prone restrained stunned unconscious` + `dead concentration exhaustion burning blessed marked`.
- HP: `hp: {cur, max, temp}` enteros ≥ 0; `elevation` entero en pies; `hpVisibility: 'all' | 'gm' | 'bar_only'` (spec, tabla de decisiones). Es **ajuste de tablero** (como `sharedVision`), no de escena.
- Los tests de integración necesitan el Postgres `jav-test-pg` (ver `docs/05-runbook.md`): `docker start jav-test-pg` si no está arriba.

---

## Mapa de ficheros

| Fichero | Responsabilidad en este plan |
|---|---|
| `package.json` | `npm test` con cobertura y umbral (P-04) |
| `docs/06-pendientes.md`, `docs/04-convenciones.md`, `docs/05-runbook.md`, `docs/07-historial.md`, `docs/01-arquitectura.md`, `docs/02-funcional.md`, `docs/00-INDEX.md`, `README.md` | Documentación (limpieza + estado + historial) |
| `server/rules.js` | `CONDITION_IDS`, saneado de `conditions`/`hp`/`elevation`, `hpVisibility` en ajustes de tablero, `playerUpsert` ampliado, `objectFor` |
| `server/app.js` | Aplicar `objectFor` en `stateFor`, `handleOps`, `moveUser`; reenviar estado a jugadores cuando cambia `hpVisibility` |
| `public/js/core.js` | `CONDITIONS` (catálogo con nombre, abreviatura y color), `hpVisibility` en `blankState` |
| `public/js/net.js` | `hpVisibility` en `SCENE_KEYS` (para que el director lo envíe) |
| `public/js/render.js` | `drawToken`: badges, barra de HP, etiqueta de elevación, velo de «muerto» |
| `public/js/editor.js` | popover `#statusPop` (condiciones, HP ±, elevación), entrada en menú contextual, campos en `openEditor`, select `#hpVisibility` |
| `public/index.html`, `public/css/app.css` | Marcado del popover y del select; estilos de los chips |
| `test/rules.test.js` | Unitarios de saneado, permisos y proyección |
| `test/realtime.test.js` | Integración: HP oculto a jugadores, permisos por WebSocket |
| `test/frontend.test.js` | Contrato cliente ↔ servidor (catálogo, hooks del DOM) |
| `test/e2e/ui.mjs` | Visual: badge, barra, etiqueta y visibilidad |

---

### Task 1: P-04 — cobertura con umbral en `npm test`

**Files:**
- Modify: `package.json` (script `test`, `engines`)
- Modify: `docs/04-convenciones.md` (Parte C, fila «Cobertura con umbral»)
- Modify: `docs/05-runbook.md` (tabla de comandos)

**Interfaces:**
- Produces: `npm test` falla si la cobertura de `server/**` baja de líneas 78 % · ramas 72 % · funciones 82 %. Baseline medida el 2026-09-19: 80,03 / 75,20 / 84,00 con 78 tests.

- [ ] **Step 1: Ver la cobertura actual (sin umbral)**

Run: `node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include="server/**" "test/*.test.js" 2>&1 | tail -15`
Expected: tabla con `all files | 80.03 | 75.20 | 84.00` (±1 punto), 78 tests, 0 fallos.

- [ ] **Step 2: Comprobar que el umbral muerde (test roto a propósito)**

Run: `node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include="server/**" --test-coverage-lines=99 "test/*.test.js" 2>&1 | tail -5; echo EXIT=$?`
Expected: `Error: 80.03% line coverage does not meet threshold of 99%.` y `EXIT=1`.

- [ ] **Step 3: Fijar el script con umbral**

En `package.json`, sustituir el script `test` y `engines`:

```json
"test": "node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=\"server/**\" --test-coverage-lines=78 --test-coverage-branches=72 --test-coverage-functions=82 \"test/*.test.js\"",
```

```json
"engines": {
  "node": ">=22.8"
},
```

(`--test-coverage-lines` y compañía existen desde Node 22.8; el PC tiene 24.11.)

- [ ] **Step 4: Verificar**

Run: `npm run check 2>&1 | tail -12; echo EXIT=$?`
Expected: lint limpio, `pass 78`, tabla de cobertura, `EXIT=0`.

- [ ] **Step 5: Documentar**

En `docs/04-convenciones.md` Parte C: cambiar `**Nivel declarado: N1.**` por `**Nivel declarado: N2** (cobertura con umbral desde el 2026-09-19).` y la fila:

```markdown
| Cobertura con umbral | incluida en `npm test` (`server/**`: líneas ≥ 78 %, ramas ≥ 72 %, funciones ≥ 82 %; baseline 80/75/84 el 2026-09-19) | obligatorio |
| Mutación automatizada | — | N3, pendiente P-04 |
```

En `docs/05-runbook.md`, en la tabla de comandos, la fila de `npm test` pasa a: `Tests (78) + cobertura con umbral` y añadir debajo de la tabla:

```markdown
> Si `npm test` falla por cobertura (`does not meet threshold`), no bajes el umbral: añade el test que
> falta. Los umbrales viven en `package.json` (script `test`). El cliente no entra en la cobertura
> (se prueba con `test/frontend.test.js` por contrato y con `npm run test:ui` visualmente).
```

- [ ] **Step 6: Commit**

```bash
git add package.json docs/04-convenciones.md docs/05-runbook.md
git commit -m "test: cobertura de server/** con umbral en npm test (P-04, N2)"
```

---

### Task 2: Limpieza de `docs/06-pendientes.md`

**Files:**
- Modify: `docs/06-pendientes.md`
- Modify: `docs/07-historial.md`

**Interfaces:** ninguna (sólo documentación).

- [ ] **Step 1: Verificar que P-05 ya está hecho (evidencia)**

Run: `grep -n "passwordForm" public/index.html public/js/main.js | head -3 && grep -n "me/password" test/mesa.test.js | head -2`
Expected: `index.html:77 <form id="passwordForm">`, `main.js:77`, y `mesa.test.js` con `POST /api/me/password` (test «cambiar contraseña exige la actual»).

- [ ] **Step 2: Reescribir `docs/06-pendientes.md` entero**

La tabla estaba partida por un párrafo (las filas P-07 en adelante no renderizaban como tabla). Contenido nuevo completo:

```markdown
# 06 — Pendientes

Actualizado: 2026-09-19. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-04 | P2 | Subir el pipeline a **N3**: mutación automatizada (N2 —cobertura con umbral— cerrado el 2026-09-19) | Comando en [04](04-convenciones.md) Parte C |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |
| P-07 | P2 | El pulso de luz aún se percibe «un poco» a saltos (usuario, 2026-09-16, con 60 Hz, 0,2 ms/frame y dithering ±1). Siguiente vuelta: dithering ±2 niveles o ruido temporal; medir con capturas consecutivas | El usuario lo da por fluido |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
| P-19 | P1 | Condiciones SRD y marcadores tácticos en fichas. Plan A: [plans/2026-09-19-fichas-condiciones-hp-elevacion.md](superpowers/plans/2026-09-19-fichas-condiciones-hp-elevacion.md) | Test en `rules.test.js` y visual en `npm run test:ui` |
| P-20 | P1 | Puntos de vida minimalistas en fichas (`hp`, `hpVisibility`). Plan A (mismo fichero) | Test en `rules.test.js`, `realtime.test.js` y `npm run test:ui` |
| P-21 | P1 | Elevación en fichas (`elevation`, pies). Plan A (mismo fichero) | Test en `rules.test.js` y `npm run test:ui` |
| P-22 | P2 | Regla de medición multitramo (waypoints con clic / espacio durante el arrastre de `ruler`). Spec: [specs/2026-09-19-condiciones-srd-y-tactica-design.md](superpowers/specs/2026-09-19-condiciones-srd-y-tactica-design.md) §4 · plan B pendiente de escribir | Medición compuesta en `npm run test:ui` |
| P-23 | P2 | Etiquetas / pines de texto en el mapa con `gmOnly`. Spec §5 · plan B | Test en `rules.test.js` y `npm run test:ui` |
| P-24 | P2 | Audio ambiental por escena y SFX (dados, puertas). Spec §6 · plan C | Prueba en navegador con sonido |

Cerrados: P-01, P-02, P-03 (2026-09-16); **P-05** el 2026-09-19 (ya existía `#passwordForm` en
`index.html` + `POST /api/me/password` con test en `mesa.test.js`: estaba hecho y sin cerrar);
**P-04 nivel N2** el 2026-09-19 (queda N3 con el mismo ID).

## Hallazgo ajeno a este repo (avisado al usuario el 2026-09-16)

El backup diario de vps1new escribe `dnd-pg.sql.gz` de **20 bytes** (vacío) y lo registra como OK:
el bloque de `dnd` en `/root/scripts/backup-coolify.sh` perdió las comillas
(`sh -c PGPASSWORD= pg_dumpall -U`). **La base de la plataforma D&D no tiene copia real.** Se
arregla en el servidor, no aquí.
```

- [ ] **Step 3: Entrada en `docs/07-historial.md`**

Añadir al principio de la lista de entradas (respetando el formato del fichero):

```markdown
## 2026-09-19 — P-04 a N2 y limpieza de pendientes

- **Qué:** `npm test` mide cobertura de `server/**` y falla bajo 78/72/82 (líneas/ramas/funciones). `06` reescrito: tabla unificada, P-05 cerrado (ya estaba implementado), P-19…P-24 con sus planes.
- **Por qué:** P-04 pedía N2; la tabla de 06 estaba partida por un párrafo y P-05 llevaba hecho sin cerrarse.
- **Revertir:** `git revert` de los dos commits; el script `test` anterior era `node --test --test-concurrency=1 "test/*.test.js"`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/06-pendientes.md docs/07-historial.md
git commit -m "docs: 06 con tabla unificada, P-05 cerrado y P-19..24 enlazados a planes"
```

---

### Task 3: `rules.js` — catálogo de condiciones y saneado de `conditions`

**Files:**
- Modify: `server/rules.js` (constantes tras `LAYER_IDS`; rama `o.type === 'token'` de `sanitize`; `module.exports`)
- Test: `test/rules.test.js`

**Interfaces:**
- Produces: `R.CONDITION_IDS: string[]` (20 ids, orden fijo); todo token saneado lleva `conditions: string[]` (siempre presente, sin duplicados, sólo ids del catálogo, en el orden recibido).

- [ ] **Step 1: Test que falla**

Añadir al final de `test/rules.test.js`:

```js
test('condiciones: catálogo de 20 ids; sanitize filtra las inventadas, quita duplicados y siempre deja un array', () => {
  assert.deepEqual(R.CONDITION_IDS, ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'dead', 'concentration', 'exhaustion', 'burning', 'blessed', 'marked']);
  const base = { id: 1, type: 'token', x: 0, y: 0 };
  assert.deepEqual(R.sanitize(Object.assign({ conditions: ['poisoned', 'invalid'] }, base)).conditions, ['poisoned']);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: ['prone', 'prone', 'dead', 7, null] }, base)).conditions, ['prone', 'dead']);
  assert.deepEqual(R.sanitize(base).conditions, []);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: 'prone' }, base)).conditions, []);
  assert.deepEqual(R.sanitize(Object.assign({ conditions: R.CONDITION_IDS.concat(['x']) }, base)).conditions, R.CONDITION_IDS);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^not ok|✖|fail" | head`
Expected: falla con `AssertionError` (`R.CONDITION_IDS` es `undefined`).

- [ ] **Step 3: Implementar**

En `server/rules.js`, tras `const LAYER_IDS = ...`:

```js
/* Condiciones del SRD 5e (14) + marcadores tácticos de mesa (6). El cliente tiene el mismo catálogo con
   nombre y color en public/js/core.js (un test de contrato los compara). */
const CONDITION_IDS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
  'dead', 'concentration', 'exhaustion', 'burning', 'blessed', 'marked',
];
```

En la rama `if (o.type === 'token')` de `sanitize`, sustituir el `return Object.assign(c, {...})` por:

```js
  if (o.type === 'token') {
    Object.assign(c, {
      kind: o.kind === 'enemy' ? 'enemy' : 'player', name: str(o.name, 40), size: [1, 2, 3, 4].includes(o.size) ? o.size : 1,
      color: col(o.color, '#7FB2E5'), hidden: !!o.hidden, vision: o.vision !== false,
      sight: fin(o.sight) ? clamp(o.sight, 0, 5000) : 0, darkvision: fin(o.darkvision) ? clamp(o.darkvision, 0, 300) : 0,
      light: cleanLight(o.light) || noLight(), img: imgId(o.img), owner: Number.isInteger(o.owner) ? o.owner : null,
      conditions: Array.isArray(o.conditions) ? [...new Set(o.conditions.filter((x) => CONDITION_IDS.includes(x)))] : [],
    });
    return c;
  }
```

En `module.exports` añadir `CONDITION_IDS`.

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 7`, `# fail 0`.
Mutación: quitar `[...new Set(` (dejar `o.conditions.filter(...)`) → el test debe fallar en la línea de `['prone','dead']`. Restaurar.

- [ ] **Step 5: `npm run check` y commit**

Run: `npm run check 2>&1 | tail -6`
Expected: lint limpio, `pass 79`, cobertura ≥ umbrales.

```bash
git add server/rules.js test/rules.test.js
git commit -m "feat(rules): catálogo de 20 condiciones y saneado de token.conditions"
```

---

### Task 4: `rules.js` — saneado de `hp` y `elevation`

**Files:**
- Modify: `server/rules.js` (rama token de `sanitize`)
- Test: `test/rules.test.js`

**Interfaces:**
- Produces: token saneado con `elevation: number` (entero, siempre presente, 0 por defecto, ±9999) y, **sólo si el emisor mandó `hp.max` numérico**, `hp: {cur, max, temp}` (enteros; `max` 0–9999; `cur` 0–`max`, por defecto `max`; `temp` 0–9999, por defecto 0). Sin `hp.max` no hay `hp` (ficha sin vida = sin barra).

- [ ] **Step 1: Test que falla**

```js
test('hp y elevación: enteros acotados; cur nunca supera max; sin max no hay hp; elevation siempre presente', () => {
  const base = { id: 2, type: 'token', x: 0, y: 0 };
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 15, max: 20 } }, base)).hp, { cur: 15, max: 20, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 25, max: 20, temp: 5.7 } }, base)).hp, { cur: 20, max: 20, temp: 6 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: -3, max: 20 } }, base)).hp, { cur: 0, max: 20, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { max: 12 } }, base)).hp, { cur: 12, max: 12, temp: 0 });
  assert.deepEqual(R.sanitize(Object.assign({ hp: { cur: 1, max: 99999 } }, base)).hp, { cur: 1, max: 9999, temp: 0 });
  assert.equal(R.sanitize(Object.assign({ hp: { cur: 5 } }, base)).hp, undefined);
  assert.equal(R.sanitize(Object.assign({ hp: 7 }, base)).hp, undefined);
  assert.equal(R.sanitize(base).hp, undefined);
  assert.equal(R.sanitize(Object.assign({ elevation: 20 }, base)).elevation, 20);
  assert.equal(R.sanitize(Object.assign({ elevation: -10.4 }, base)).elevation, -10);
  assert.equal(R.sanitize(Object.assign({ elevation: 1e9 }, base)).elevation, 9999);
  assert.equal(R.sanitize(Object.assign({ elevation: 'alto' }, base)).elevation, 0);
  assert.equal(R.sanitize(base).elevation, 0);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok 8 - hp y elevación…`.

- [ ] **Step 3: Implementar**

En la rama token de `sanitize`, justo antes de `return c;`:

```js
    c.elevation = fin(o.elevation) ? clamp(Math.round(o.elevation), -9999, 9999) : 0;
    if (o.hp && typeof o.hp === 'object' && fin(o.hp.max)) {
      const max = clamp(Math.round(o.hp.max), 0, 9999);
      c.hp = { cur: fin(o.hp.cur) ? clamp(Math.round(o.hp.cur), 0, max) : max, max, temp: fin(o.hp.temp) ? clamp(Math.round(o.hp.temp), 0, 9999) : 0 };
    }
```

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 8`, `# fail 0`.
Mutación: cambiar `clamp(Math.round(o.hp.cur), 0, max)` por `clamp(Math.round(o.hp.cur), 0, 9999)` → falla la línea de `{cur:25,max:20}`. Restaurar.

- [ ] **Step 5: `npm run check` y commit**

```bash
git add server/rules.js test/rules.test.js
git commit -m "feat(rules): token.hp {cur,max,temp} y token.elevation saneados"
```

---

### Task 5: `rules.js` — el dueño edita condiciones, HP y elevación de su ficha

**Files:**
- Modify: `server/rules.js` (`playerUpsert`, rama `neu.type === 'token'`)
- Test: `test/rules.test.js`

**Interfaces:**
- Consumes: `sanitize` de Tasks 3–4.
- Produces: `playerUpsert(uid, old, neu, board, ownedCount, plansCount)` devuelve, para una ficha propia, `old` con `x, y, name, color, img, light` **y ahora también `conditions`, `hp`, `elevation`** de `neu`. Para fichas ajenas sigue devolviendo `null` (comportamiento existente: el servidor manda corrección).

- [ ] **Step 1: Test que falla**

```js
test('playerUpsert: el dueño cambia condiciones, hp y elevación de su ficha; no toca tamaño ni visibilidad; ajena → null', () => {
  const uid = 7;
  const old = R.sanitize({ id: 3, type: 'token', kind: 'player', owner: uid, x: 0, y: 0, name: 'A', size: 2, hidden: false, hp: { cur: 10, max: 10 } });
  const neu = R.sanitize(Object.assign({}, old, { conditions: ['prone', 'blessed'], hp: { cur: 4, max: 10, temp: 3 }, elevation: 15, size: 4, hidden: true }));
  const r = R.playerUpsert(uid, old, neu, { settings: {} }, 1, 0);
  assert.deepEqual(r.conditions, ['prone', 'blessed']);
  assert.deepEqual(r.hp, { cur: 4, max: 10, temp: 3 });
  assert.equal(r.elevation, 15);
  assert.equal(r.size, 2, 'el tamaño sigue siendo cosa del director');
  assert.equal(r.hidden, false);
  // quitar la vida del todo (sin hp) también es del dueño
  assert.equal(R.playerUpsert(uid, old, R.sanitize(Object.assign({}, old, { hp: undefined })), { settings: {} }, 1, 0).hp, undefined);
  const ajena = R.sanitize({ id: 4, type: 'token', kind: 'enemy', owner: null, x: 0, y: 0, hp: { cur: 30, max: 30 } });
  assert.equal(R.playerUpsert(uid, ajena, R.sanitize(Object.assign({}, ajena, { hp: { cur: 0, max: 30 } })), { settings: {} }, 1, 0), null);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok 9` (`r.conditions` es `[]`).

- [ ] **Step 3: Implementar**

En `playerUpsert`, sustituir el `return Object.assign({}, old, {...})` de la ficha propia por:

```js
      return Object.assign({}, old, {
        x: neu.x, y: neu.y, name: neu.name || old.name, color: neu.color, img: neu.img, light: neu.light,
        conditions: neu.conditions, elevation: neu.elevation, hp: neu.hp,
      });
```

Ojo: `hp: neu.hp` puede ser `undefined`; `stableJson`/`JSON.stringify` lo omiten, así que no queda una clave `hp: undefined` en la base. Confírmalo en el Step 4.

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 9`.
Mutación: quitar `conditions: neu.conditions,` → falla. Restaurar.
Comprobación extra: `node -e "const R=require('./server/rules');console.log(JSON.stringify(R.playerUpsert(7,R.sanitize({id:1,type:'token',owner:7,x:0,y:0}),R.sanitize({id:1,type:'token',owner:7,x:0,y:0}),{settings:{}},1,0)))"` → no aparece `"hp"`.

- [ ] **Step 5: `npm run check` y commit**

```bash
git add server/rules.js test/rules.test.js
git commit -m "feat(rules): el dueño de la ficha edita conditions, hp y elevation"
```

---

### Task 6: `rules.js` — ajuste `hpVisibility` y proyección `objectFor`

**Files:**
- Modify: `server/rules.js` (`BOARD_KEYS`, `cleanSettings`, `DEFAULT_BOARD`, nueva `objectFor`, exports)
- Test: `test/rules.test.js`

**Interfaces:**
- Produces:
  - `cleanSettings({hpVisibility})` acepta sólo `'all' | 'gm' | 'bar_only'`; `splitSettings` lo clasifica como **tablero**; `DEFAULT_BOARD.hpVisibility === 'all'`.
  - `objectFor(o, member, boardSettings)` → el mismo objeto `o` (misma referencia) salvo cuando `member.role !== 'gm'`, `o.type === 'token'`, `o.hp` existe, `boardSettings.hpVisibility === 'gm'` y `o.owner !== member.user_id`: entonces una copia **sin `hp`**. `member` tiene la forma `{ role, user_id }` (la misma que usa `visibleTo`).

- [ ] **Step 1: Test que falla**

```js
test('hpVisibility: ajuste de tablero con tres valores; objectFor quita el hp a los jugadores en fichas ajenas sólo en modo gm', () => {
  assert.equal(R.DEFAULT_BOARD.hpVisibility, 'all');
  for (const v of ['all', 'gm', 'bar_only']) assert.equal(R.splitSettings({ hpVisibility: v }).board.hpVisibility, v);
  assert.equal(R.cleanSettings({ hpVisibility: 'nadie' }).hpVisibility, undefined);
  assert.equal(R.splitSettings({ hpVisibility: 'gm' }).scene.hpVisibility, undefined, 'no es ajuste de escena');
  const gmTok = R.sanitize({ id: 5, type: 'token', kind: 'enemy', owner: null, x: 0, y: 0, hp: { cur: 8, max: 20 }, conditions: ['prone'] });
  const mine = R.sanitize({ id: 6, type: 'token', kind: 'player', owner: 7, x: 0, y: 0, hp: { cur: 3, max: 9 } });
  const player = { role: 'player', user_id: 7 }, gm = { role: 'gm', user_id: 1 };
  const seen = R.objectFor(gmTok, player, { hpVisibility: 'gm' });
  assert.equal(seen.hp, undefined);
  assert.deepEqual(seen.conditions, ['prone'], 'las condiciones sí se ven');
  assert.deepEqual(gmTok.hp, { cur: 8, max: 20, temp: 0 }, 'el original no se toca');
  assert.equal(R.objectFor(mine, player, { hpVisibility: 'gm' }), mine, 'la propia, intacta');
  assert.equal(R.objectFor(gmTok, gm, { hpVisibility: 'gm' }), gmTok);
  for (const v of ['all', 'bar_only', undefined]) assert.equal(R.objectFor(gmTok, player, { hpVisibility: v }), gmTok, String(v));
  const wall = R.sanitize({ id: 8, type: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } });
  assert.equal(R.objectFor(wall, player, { hpVisibility: 'gm' }), wall);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok 10` (`DEFAULT_BOARD.hpVisibility` es `undefined`).

- [ ] **Step 3: Implementar**

```js
const HP_VISIBILITY = ['all', 'gm', 'bar_only'];
const BOARD_KEYS = ['sharedVision', 'playersDoors', 'chatEnabled', 'diceEnabled', 'initiativeShown', 'initiative', 'hpVisibility'];
```

En `cleanSettings`, tras la línea del bucle de booleanos:

```js
  if (HP_VISIBILITY.includes(sc.hpVisibility)) o.hpVisibility = sc.hpVisibility;
```

`DEFAULT_BOARD` pasa a:

```js
const DEFAULT_BOARD = { sharedVision: true, playersDoors: true, chatEnabled: true, diceEnabled: true, initiativeShown: false, hpVisibility: 'all', initiative: { entries: [], turn: 0, round: 1 } };
```

Tras `visibleTo`:

```js
/* Lo que un cliente recibe de un objeto visible: al jugador se le quita la vida de las fichas ajenas
   cuando el director la reserva (hpVisibility 'gm'). 'bar_only' lo respeta el cliente al pintar. */
function objectFor(o, member, board) {
  if (member.role === 'gm' || o.type !== 'token' || !o.hp || board.hpVisibility !== 'gm' || o.owner === member.user_id) return o;
  const copy = Object.assign({}, o);
  delete copy.hp;
  return copy;
}
```

Exportar `objectFor`.

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/rules.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 10`.
Mutación: quitar `|| o.owner === member.user_id` → falla «la propia, intacta». Restaurar.

- [ ] **Step 5: `npm run check` y commit**

```bash
git add server/rules.js test/rules.test.js
git commit -m "feat(rules): ajuste de tablero hpVisibility y proyección objectFor"
```

---

### Task 7: `app.js` — aplicar `objectFor` y reenviar estado al cambiar `hpVisibility`

**Files:**
- Modify: `server/app.js` (`stateFor` ~L207, `moveUser` ~L270, `handleOps` ~L293–358)
- Test: `test/realtime.test.js`

**Interfaces:**
- Consumes: `R.objectFor(o, member, b.settings)` (Task 6), `b.settings` = ajustes de tablero (ya incluye `DEFAULT_BOARD` al abrir el tablero: comprobar en `openBoard` que se hace `Object.assign({}, R.DEFAULT_BOARD, row.settings)` o equivalente; si no, `hpVisibility` será `undefined` y `objectFor` lo trata como `'all'`, que es lo mismo).
- Produces: todo envío de objetos a un cliente pasa por `objectFor`: estado inicial, `ops` a terceros, correcciones al propio emisor y llegada por portal. Cuando el director cambia `hpVisibility`, cada jugador recibe un `state` completo.

- [ ] **Step 1: Test de integración que falla**

Añadir al final de `test/realtime.test.js` (usa `gmCookie`, `playerCookie`, `sceneId`, `connect`, `isOps`, `isState` del fichero):

```js
test('hpVisibility gm: el jugador no recibe el hp de las fichas ajenas (estado, ops y correcciones); al volver a all lo recibe', async () => {
  const gm = connect(base, boardId, gmCookie);
  const player = connect(base, boardId, playerCookie);
  await gm.opened; await player.opened;
  await gm.next(isState); const ps0 = await player.next(isState);
  const playerId = ps0.me.id;
  const ogre = { id: 3001, type: 'token', kind: 'enemy', x: 100, y: 100, name: 'Ogro', owner: null, hp: { cur: 40, max: 59 }, conditions: ['prone'] };
  const hero = { id: 3002, type: 'token', kind: 'player', x: 200, y: 100, name: 'Héroe', owner: playerId, hp: { cur: 9, max: 12 } };
  gm.send({ t: 'ops', scene: sceneId, up: [ogre, hero], del: [], settings: { hpVisibility: 'gm' } });
  // el cambio de ajuste reenvía el estado completo al jugador, ya filtrado
  const st = await player.next(isState);
  const seenOgre = st.objects.find((o) => o.id === 3001), seenHero = st.objects.find((o) => o.id === 3002);
  assert.equal(st.settings.hpVisibility, 'gm');
  assert.equal(seenOgre.hp, undefined);
  assert.deepEqual(seenOgre.conditions, ['prone']);
  assert.deepEqual(seenHero.hp, { cur: 9, max: 12, temp: 0 }, 'la propia llega entera');
  // ops posteriores del director: también sin hp
  gm.send({ t: 'ops', scene: sceneId, up: [Object.assign({}, ogre, { hp: { cur: 10, max: 59 } })], del: [] });
  const ops = await player.next((m) => isOps(m) && m.up.some((o) => o.id === 3001));
  assert.equal(ops.up.find((o) => o.id === 3001).hp, undefined);
  // el jugador intenta curar al ogro: corrección, y la corrección tampoco trae hp
  player.send({ t: 'ops', scene: sceneId, up: [Object.assign({}, ogre, { hp: { cur: 59, max: 59 } })], del: [] });
  const fix = await player.next((m) => isOps(m) && m.fix);
  assert.equal(fix.up.find((o) => o.id === 3001).hp, undefined);
  await app.flushAll();
  assert.deepEqual((await db.q.sceneObjects(sceneId)).find((o) => o.id === 3001).hp, { cur: 10, max: 59, temp: 0 }, 'en la base sigue el valor del director');
  // el jugador edita su propia ficha: se acepta y el director lo recibe
  player.send({ t: 'ops', scene: sceneId, up: [Object.assign({}, hero, { hp: { cur: 3, max: 12, temp: 2 }, conditions: ['poisoned'], elevation: 10 })], del: [] });
  const toGm = await gm.next((m) => isOps(m) && m.up.some((o) => o.id === 3002));
  const heroGm = toGm.up.find((o) => o.id === 3002);
  assert.deepEqual(heroGm.hp, { cur: 3, max: 12, temp: 2 });
  assert.deepEqual(heroGm.conditions, ['poisoned']);
  assert.equal(heroGm.elevation, 10);
  // de vuelta a 'all': el jugador recibe el estado con el hp del ogro
  gm.send({ t: 'ops', scene: sceneId, up: [], del: [], settings: { hpVisibility: 'all' } });
  const st2 = await player.next(isState);
  assert.deepEqual(st2.objects.find((o) => o.id === 3001).hp, { cur: 10, max: 59, temp: 0 });
  await gm.close(); await player.close();
});
```

Nota: `db.q.sceneObjects(sceneId)` devuelve directamente los objetos (`data` jsonb ya desenvuelto, `server/db.js:119`). La escritura es diferida: `await app.flushAll()` antes de leer la base, como hacen los tests existentes de este fichero (L75, L109).

- [ ] **Step 2: Ver que falla**

Run: `node --test test/realtime.test.js 2>&1 | grep -E "^not ok|Sin mensaje" | head`
Expected: falla (`Sin mensaje a tiempo` esperando `state`, o `seenOgre.hp` definido).

- [ ] **Step 3: Implementar en `app.js`**

`stateFor` (~L207):

```js
    objects: [...sc.objects.values()].filter((o) => R.visibleTo(o, member, sc.settings)).map((o) => R.objectFor(o, member, b.settings)),
```

`moveUser` (~L270), donde se construye `vis`:

```js
        const member = { role: c.role, user_id: c.user.id };
        const vis = moved.filter((o) => R.visibleTo(o, member, target.settings)).map((o) => R.objectFor(o, member, b.settings));
```

(si la variable `member` ya existe en ese ámbito con ese nombre, reutilízala).

`handleOps`: donde se calcula `boardChanged`, detectar el cambio de visibilidad **antes** del `Object.assign(b.settings, board)`:

```js
  let resendPlayers = false, boardChanged = false, hpVisChanged = false;
  if (d.settings && gm) {
    const { board, scene } = R.splitSettings(d.settings);
    if ('plansReleased' in scene && scene.plansReleased !== sc.settings.plansReleased) resendPlayers = true;
    if ('hpVisibility' in board && board.hpVisibility !== b.settings.hpVisibility) hpVisChanged = true;
    const bsBefore = JSON.stringify(b.settings);
    Object.assign(sc.settings, scene); sc.settingsDirty = true;
    Object.assign(b.settings, board);
    if (JSON.stringify(b.settings) !== bsBefore) { b.settingsDirty = true; boardChanged = true; }
  }
```

Eco al emisor (correcciones), proyectado:

```js
  const back = corrections.filter(Boolean);
  for (const a of accepted) if (a.changed) back.push(a.obj);
  if (back.length || dels.length || (d.settings && !gm)) {
    const me = { role: c.role, user_id: c.user.id };
    c.ws.send({ t: 'ops', up: back.map((o) => R.objectFor(o, me, b.settings)), del: dels, settings: d.settings && !gm ? settingsFor(b, sc, c.role) : undefined, fix: true });
  }
```

Bucle a terceros:

```js
  for (const other of b.clients) {
    if (other === c) continue;
    const member = { role: other.role, user_id: other.user.id };
    if (other.role !== 'gm' && (hpVisChanged || (resendPlayers && other.sceneId === c.sceneId))) { await sendState(b, other); continue; }
    if (other.sceneId !== c.sceneId) {
      if (boardChanged) other.ws.send({ t: 'ops', settings: settingsFor(b, b.scenes.get(other.sceneId), other.role) });
      continue;
    }
    const up = [], del = [...removed];
    for (const a of accepted) {
      const vis = R.visibleTo(a.obj, member, sc.settings);
      if (vis) up.push(R.objectFor(a.obj, member, b.settings));
      else if (!a.old || R.visibleTo(a.old, member, sc.settings)) del.push(a.obj.id);
    }
    const settings = d.settings && gm ? settingsFor(b, sc, other.role) : undefined;
    if (up.length || del.length || settings) other.ws.send({ t: 'ops', up, del, settings, by: c.user.id });
  }
```

Busca cualquier otro `ws.send({ t: 'ops', up:` en `app.js` (por ejemplo `handleReplace`, `gather`) y aplica la misma proyección: `up.map((o) => R.objectFor(o, member, b.settings))`. Regla: **ningún objeto sale hacia un cliente sin pasar por `objectFor`**.

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/realtime.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: todos pasan.
Mutación: en el eco al emisor, quitar el `.map((o) => R.objectFor(...))` → falla la aserción de la corrección. Restaurar.

- [ ] **Step 5: `npm run check` y commit**

Run: `npm run check 2>&1 | tail -8`
Expected: verde, cobertura de `app.js` sube o se mantiene.

```bash
git add server/app.js test/realtime.test.js
git commit -m "feat(ws): el hp de las fichas ajenas no llega a los jugadores con hpVisibility gm"
```

---

### Task 8: Cliente — catálogo `CONDITIONS`, `hpVisibility` en estado y contrato con el servidor

**Files:**
- Modify: `public/js/core.js` (tras `const LAYER_OF=...`; `blankState`)
- Modify: `public/js/net.js` (`SCENE_KEYS`)
- Test: `test/frontend.test.js`

**Interfaces:**
- Produces (globales del cliente): `CONDITIONS` — objeto `{ [id]: { name, abbr, color } }` con los 20 ids en el mismo orden que `R.CONDITION_IDS`; `S.hpVisibility` ('all' por defecto) que el director envía en `settings` porque está en `SCENE_KEYS`.

- [ ] **Step 1: Test de contrato que falla**

```js
test('condiciones: el catálogo del cliente tiene los mismos 20 ids que el servidor, cada uno con nombre, abreviatura y color', () => {
  const R = require('../server/rules');
  const core = read('js/core.js');
  const m = core.match(/^const CONDITIONS=\{([\s\S]*?)\};$/m);
  assert.ok(m, 'const CONDITIONS={...}; en core.js');
  const ids = [...m[1].matchAll(/(\w+):\{name:'[^']+',abbr:'[A-ZÑ]{1,2}',color:'#[0-9A-Fa-f]{6}'\}/g)].map((x) => x[1]);
  assert.deepEqual(ids, R.CONDITION_IDS);
  assert.match(core, /hpVisibility:'all'/, 'blankState lleva hpVisibility');
  assert.match(read('js/net.js'), /'initiativeShown','hpVisibility'\]/, 'el director envía hpVisibility en settings');
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok … condiciones`.

- [ ] **Step 3: Implementar**

En `core.js`, tras `const COLL=...`:

```js
/* Condiciones del SRD + marcadores de mesa. Mismos ids que CONDITION_IDS en server/rules.js (test de contrato).
   abbr: 1–2 letras que caben en el badge; color: fondo del badge. */
const CONDITIONS={
  blinded:{name:'Cegado',abbr:'CE',color:'#5B5F66'},charmed:{name:'Hechizado',abbr:'HE',color:'#C86BA8'},
  deafened:{name:'Ensordecido',abbr:'EN',color:'#7A8590'},frightened:{name:'Asustado',abbr:'AS',color:'#8E6AC8'},
  grappled:{name:'Agarrado',abbr:'AG',color:'#A67C52'},incapacitated:{name:'Incapacitado',abbr:'IN',color:'#B0B0B0'},
  invisible:{name:'Invisible',abbr:'IV',color:'#6FB7D6'},paralyzed:{name:'Paralizado',abbr:'PA',color:'#D6C36F'},
  petrified:{name:'Petrificado',abbr:'PE',color:'#8C8C8C'},poisoned:{name:'Envenenado',abbr:'EV',color:'#5FA85A'},
  prone:{name:'Derribado',abbr:'DE',color:'#C98A3B'},restrained:{name:'Apresado',abbr:'AP',color:'#8A6D3B'},
  stunned:{name:'Aturdido',abbr:'AT',color:'#E0B84C'},unconscious:{name:'Inconsciente',abbr:'IC',color:'#4A4F57'},
  dead:{name:'Muerto',abbr:'MU',color:'#2B2B2B'},concentration:{name:'Concentración',abbr:'CO',color:'#4C8FE0'},
  exhaustion:{name:'Agotamiento',abbr:'AG',color:'#9A6F5F'},burning:{name:'En llamas',abbr:'LL',color:'#E0602E'},
  blessed:{name:'Bendecido',abbr:'BE',color:'#F0C74C'},marked:{name:'Marcado',abbr:'MA',color:'#D9705F'}
};
```

(`grappled` y `exhaustion` comparten `AG`: aceptado, el color los distingue y el nombre sale al pasar el ratón en el popover.)

En `blankState`, tras `sharedVision:true,playersDoors:true,` añadir `hpVisibility:'all',`.

En `net.js`, `SCENE_KEYS` termina en `...,'diceEnabled','initiativeShown','hpVisibility']`.

- [ ] **Step 4: Verde + mutación**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.
Mutación: renombrar `prone` a `prone2` en `core.js` → falla el `deepEqual`. Restaurar.

- [ ] **Step 5: `npm run check` y commit**

```bash
git add public/js/core.js public/js/net.js test/frontend.test.js
git commit -m "feat(cliente): catálogo CONDITIONS y ajuste hpVisibility en el estado"
```

---

### Task 9: `render.js` — badges, barra de HP, etiqueta de elevación y velo de muerto

**Files:**
- Modify: `public/js/render.js` (`drawToken`, ~L126–147; nueva `drawTokenStatus`)
- Test: `test/frontend.test.js` (contrato) — la prueba visual va en Task 11

**Interfaces:**
- Consumes: `CONDITIONS` (Task 8), `S.hpVisibility`, `isGM()`, `ownsToken(t)`, `px()`, `roundRect()`, `iconImage()`, `displayPos()`, `tokenRadius()`.
- Produces: `drawTokenStatus(c,t,P,r,player)` llamada desde `drawToken` justo antes del `c.restore()` final. Diseño:
  - **Badges**: fila centrada **encima** de la ficha (`y = P.y - r - px(9)`), círculos de radio `px(7)` con el `abbr` en `px(8)` negrita, fondo `CONDITIONS[id].color`, borde `#E9E3D5` de `px(1)`. Máximo 6; si hay más, el sexto es `+n`. Sólo a partir de `UI.cam.zoom > .35`.
  - **Barra de HP**: bajo la ficha, encima del nombre: `y = P.y + r + px(3)`, ancho `2r`, alto `px(5)`, fondo `rgba(18,22,25,.85)`, relleno verde `#6FBF73` (> 50 %), ámbar `#F0B35A` (> 25 %), rojo `#D9705F` (resto); `temp` como franja cian `#7FD6E5` sobre la barra, ancho `min(temp,max)/max`. Números `cur/max` (`+temp` si hay) en `px(10)` a la derecha del final de la barra **sólo si** `isGM() || ownsToken(t) || S.hpVisibility==='all'`. Si hay barra, el nombre baja `px(7)`.
  - **Elevación**: si `t.elevation` ≠ 0, pastilla en la esquina **superior izquierda** (`P.x - r*.75, P.y - r*.75`) con texto `+20'` / `-10'` en `px(10)`, fondo `rgba(18,22,25,.88)`, texto `#F4EEE2`. (El ojo de «oculta» sigue en la superior derecha.)
  - **Muerto**: si `conditions` incluye `dead`, velo `rgba(0,0,0,.55)` recortado al círculo y el icono `skull` (ya está en `ICONS`) centrado a `px(18)`.

- [ ] **Step 1: Test de contrato que falla**

```js
test('render: drawToken pinta badges de condiciones, barra de HP (números según hpVisibility), elevación y velo de muerto', () => {
  const r = read('js/render.js');
  assert.match(r, /^function drawTokenStatus\(c,t,P,r,player\)\{/m);
  assert.match(r, /drawTokenStatus\(c,t,P,r,player\)/, 'drawToken la llama');
  assert.match(r, /CONDITIONS\[id\]/);
  assert.match(r, /isGM\(\)\|\|ownsToken\(t\)\|\|S\.hpVisibility==='all'/, 'los números sólo con permiso');
  assert.match(r, /'#6FBF73':[^:]+'#F0B35A':'#D9705F'/, 'verde / ámbar / rojo');
  assert.match(r, /t\.elevation\)\{/, 'la etiqueta de elevación sólo si no es 0');
  assert.match(r, /includes\('dead'\)/);
  assert.match(r, /iconImage\('skull'/);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok … render: drawToken…`.

- [ ] **Step 3: Implementar**

Tras `drawToken` en `render.js`:

```js
/* Estado de la ficha: badges de condiciones encima, barra de vida debajo (antes del nombre), elevación en la
   esquina superior izquierda y velo con calavera si está muerta. Todo a tamaño constante en pantalla. */
function drawTokenStatus(c,t,P,r,player){
  const conds=t.conditions||[];
  if(conds.includes('dead')){
    c.save();c.beginPath();c.arc(P.x,P.y,r,0,Math.PI*2);c.clip();c.fillStyle='rgba(0,0,0,.55)';c.fillRect(P.x-r,P.y-r,r*2,r*2);c.restore();
    const ic=iconImage('skull','#E9E3D5'),s=px(18);if(ic.complete)c.drawImage(ic,P.x-s/2,P.y-s/2,s,s);
  }
  if(conds.length&&UI.cam.zoom>.35){
    const br=px(7),gap=px(2),shown=conds.length>6?5:conds.length,n=conds.length>6?6:conds.length;
    let x=P.x-((n*(br*2+gap))-gap)/2+br;const y=P.y-r-px(9);
    c.font=`700 ${px(8)}px "Alegreya Sans", system-ui, sans-serif`;c.textAlign='center';c.textBaseline='middle';
    for(let i=0;i<n;i++){
      const id=conds[i],more=i>=shown,C=CONDITIONS[id]||{abbr:'?',color:'#666'};
      c.beginPath();c.arc(x,y,br,0,Math.PI*2);c.fillStyle=more?'#3A4046':C.color;c.fill();c.lineWidth=px(1);c.strokeStyle='#E9E3D5';c.stroke();
      c.fillStyle='#F4EEE2';c.fillText(more?'+'+(conds.length-shown):C.abbr,x,y+px(.5));
      x+=br*2+gap;
    }
  }
  if(t.hp&&t.hp.max>0){
    const w=r*2,h=px(5),x=P.x-r,y=P.y+r+px(3),ratio=Math.max(0,Math.min(1,t.hp.cur/t.hp.max));
    c.fillStyle='rgba(18,22,25,.85)';roundRect(c,x-px(1),y-px(1),w+px(2),h+px(2),px(2));c.fill();
    c.fillStyle=ratio>.5?'#6FBF73':ratio>.25?'#F0B35A':'#D9705F';if(ratio>0)c.fillRect(x,y,w*ratio,h);
    if(t.hp.temp>0){c.fillStyle='#7FD6E5';c.fillRect(x,y,w*Math.min(t.hp.temp,t.hp.max)/t.hp.max,h*.4)}
    if(isGM()||ownsToken(t)||S.hpVisibility==='all'){
      const txt=`${t.hp.cur}/${t.hp.max}`+(t.hp.temp>0?` +${t.hp.temp}`:'');
      c.font=`600 ${px(10)}px "Alegreya Sans", system-ui, sans-serif`;c.textAlign='left';c.textBaseline='middle';
      const tw=c.measureText(txt).width;c.fillStyle='rgba(18,22,25,.85)';roundRect(c,x+w+px(3),y-px(3),tw+px(6),h+px(6),px(3));c.fill();
      c.fillStyle='#F4EEE2';c.fillText(txt,x+w+px(6),y+h/2);
    }
  }
  if(t.elevation){
    const txt=(t.elevation>0?'+':'')+t.elevation+"'",fs=px(10);
    c.font=`600 ${fs}px "Alegreya Sans", system-ui, sans-serif`;c.textAlign='center';c.textBaseline='middle';
    const tw=c.measureText(txt).width,cx=P.x-r*.75,cy=P.y-r*.75;
    c.fillStyle='rgba(18,22,25,.88)';roundRect(c,cx-tw/2-px(4),cy-fs/2-px(2),tw+px(8),fs+px(4),px(3));c.fill();
    c.fillStyle='#F4EEE2';c.fillText(txt,cx,cy+px(.5));
  }
}
```

En `drawToken`:
1. El bloque del nombre pasa a calcular `const y=P.y+r+px(4)+(t.hp&&t.hp.max>0?px(7):0);` (el nombre baja cuando hay barra).
2. Justo antes del último `c.restore();` de `drawToken`, añadir `drawTokenStatus(c,t,P,r,player);`.

`player` se pasa por si en el futuro la vista de jugador cambia el dibujo; hoy no se usa dentro (eslint del cliente no marca argumentos sin usar: comprueba con `npm run lint`; si marca, elimina el parámetro **y** ajusta la regex del test).

- [ ] **Step 4: Verde**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` y `npm run lint`
Expected: `# fail 0`, lint limpio (los scripts del cliente compilan: test «todos los scripts del cliente compilan»).

- [ ] **Step 5: Comprobación visual rápida a mano (no sustituye a Task 11)**

Run: `docker start jav-test-pg; DATABASE_URL=postgres://jav:jav@localhost:55432/jav_test PORT=3999 node server.js` (en segundo plano) y abre `http://localhost:3999`, crea un tablero, pon una ficha y en la consola del navegador:

```js
const t=S.tokens[0];t.conditions=['prone','poisoned','dead'];t.hp={cur:3,max:12,temp:2};t.elevation=20;changed();
```

Expected: tres badges encima, calavera y velo, barra roja con franja cian y `3/12 +2`, pastilla `+20'` arriba a la izquierda, nombre bajo la barra. Zoom con la rueda: los tamaños en pantalla no cambian.

- [ ] **Step 6: Commit**

```bash
git add public/js/render.js test/frontend.test.js
git commit -m "feat(render): badges de condiciones, barra de HP, elevación y velo de muerto en las fichas"
```

---

### Task 10: `editor.js` + HTML/CSS — popover «Estado», menú contextual, editor y ajuste de visibilidad

**Files:**
- Modify: `public/index.html` (tras `<div id="ctx" ...>` L142; bloque «Reglas para jugadores» L302–304)
- Modify: `public/css/app.css` (tras las reglas de `#ctx`, ~L97)
- Modify: `public/js/editor.js` (`openContext` ~L461 y ~L476; `openEditor` rama token ~L530–552; ajustes ~L714 y ~L852; nueva `openStatus`)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: `CONDITIONS`, `S.hpVisibility`, `ctxEl`, `placePop(el,sp)`, `closePops()`, `pushUndo()`, `changed()`, `snapshot()`, `ownsToken`, `isGM`, `svgIcon`, `hydrate`.
- Produces: `openStatus(o,sp)` (popover `#statusPop`); entrada «Estado…» en el menú contextual de fichas para director y dueño; campos «Vida»/«Altura» en el editor; `<select id="hpVisibility">` en Ajustes → Reglas para jugadores.

- [ ] **Step 1: Test de contrato que falla**

```js
test('estado de la ficha: popover #statusPop con chips, vida ± y altura; entrada en el menú contextual; select hpVisibility', () => {
  const html = read('index.html');
  assert.match(html, /<div id="statusPop" class="pop" role="dialog"[^>]*>/);
  assert.match(html, /<select id="hpVisibility" class="gmOnly">[\s\S]*<option value="all">[\s\S]*<option value="gm">[\s\S]*<option value="bar_only">/);
  const js = read('js/editor.js');
  assert.match(js, /^function openStatus\(o,sp\)\{/m);
  assert.match(js, /add\('heart-pulse','Estado: condiciones, vida y altura',\(\)=>openStatus\(o,sp\)\)/);
  assert.match(js, /\$\('#hpVisibility'\)\.onchange=e=>\{S\.hpVisibility=e\.target\.value;changed\(\)\}/);
  assert.match(js, /\$\('#hpVisibility'\)\.value=S\.hpVisibility\|\|'all'/);
  assert.match(js, /e\.deltaY<0\?1:-1/, 'la rueda sobre la vida suma o resta');
  assert.match(read('js/icons.js'), /"heart-pulse"/);
  assert.match(read('css/app.css'), /#statusPop \.chip\.on\{/);
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^not ok" | head`
Expected: `not ok … estado de la ficha`.

- [ ] **Step 3: HTML**

En `index.html`, justo después de `<div id="ctx" class="pop" role="menu"></div>`:

```html
    <div id="statusPop" class="pop" role="dialog" aria-label="Estado de la ficha">
      <div class="ctxTitle" id="statusTitle"></div>
      <div class="statusRow" id="statusHp">
        <span>Vida</span>
        <button class="btn sq ghost" id="hpMinus" title="Restar 1 (Mayús: 5)" aria-label="Restar vida">−</button>
        <input id="hpCur" type="number" min="0" max="9999" step="1" title="Rueda del ratón: ±1 (Mayús: ±5)">
        <span class="statusSep">/</span>
        <input id="hpMax" type="number" min="0" max="9999" step="1" title="Vida máxima">
        <button class="btn sq ghost" id="hpPlus" title="Sumar 1 (Mayús: 5)" aria-label="Sumar vida">+</button>
        <span class="statusSep">temp</span>
        <input id="hpTemp" type="number" min="0" max="9999" step="1" title="Vida temporal">
      </div>
      <div class="statusRow"><span>Altura (pies)</span><input id="elevation" type="number" min="-9999" max="9999" step="5"></div>
      <div class="chips" id="statusChips"></div>
      <div class="edNote">Clic en una condición para ponerla o quitarla. Sin vida máxima no se muestra la barra.</div>
    </div>
```

En «Reglas para jugadores», tras la línea de `#initiativeShown`:

```html
          <label class="field"><span>Vida de las fichas</span>
            <select id="hpVisibility" class="gmOnly">
              <option value="all">La ven todos (barra y números)</option>
              <option value="gm">Sólo el director (cada jugador ve la suya)</option>
              <option value="bar_only">Los jugadores ven sólo la barra</option>
            </select>
          </label>
```

- [ ] **Step 4: CSS**

Tras `#ctx button.danger{...}` en `app.css`:

```css
#statusPop{min-width:300px;max-width:360px;padding:8px}
#statusPop .statusRow{display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:13px;color:var(--fog)}
#statusPop .statusRow input{width:58px;text-align:center}
#statusPop .statusSep{color:var(--fog);opacity:.7}
#statusPop .chips{display:flex;flex-wrap:wrap;gap:5px;padding:6px}
#statusPop .chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:3px 9px 3px 5px;background:transparent;cursor:pointer;font-size:12px;color:var(--bone)}
#statusPop .chip .dot{width:14px;height:14px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 8px/1 var(--sans);color:#F4EEE2}
#statusPop .chip.on{background:var(--raise);border-color:var(--bone)}
```

(`--fog`, `--bone`, `--raise`, `--line`, `--sans` ya existen en `app.css`; compruébalo con `grep -n "^:root" -A12 public/css/app.css`.)

- [ ] **Step 5: Icono**

En `public/js/icons.js`, añadir dentro de `ICONS` (Lucide `heart-pulse`, licencia ISC):

```js
"heart-pulse": "<path d=\"M19.5 12.572 12 20l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572\" /> <path d=\"M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />"
```

- [ ] **Step 6: `editor.js` — popover, menú, editor y ajuste**

Tras `function closePops(){...}` (L433): incluir el nuevo pop en el cierre y en la lista de elementos que no propagan eventos al lienzo:

```js
const statusEl=$('#statusPop');
function closePops(){ctxEl.style.display='none';edEl.style.display='none';statusEl.style.display='none';edState=null}
```

y en la línea `for(const el of[ctxEl,edEl,$('#subbar'),$('#selbar')])` añadir `statusEl` a la lista.

Nueva función (tras `openContext`):

```js
/* Popover «Estado»: condiciones, vida y altura. Lo abren el director y el dueño de la ficha. Cada cambio
   entra en el historial de deshacer una sola vez por apertura (como el editor). */
function openStatus(o,sp){
  closePops();
  let snap=snapshot(),dirty=false;
  const touch=()=>{if(!dirty){pushUndo(snap);dirty=true}changed();paint()};
  $('#statusTitle').textContent=o.name||'Ficha';
  const cur=$('#hpCur'),max=$('#hpMax'),temp=$('#hpTemp'),elev=$('#elevation');
  const hp=()=>o.hp||(o.hp={cur:0,max:0,temp:0});
  const setHp=(k,v)=>{const h=hp();h[k]=clamp(Math.round(v)||0,0,9999);if(k==='max')h.cur=Math.min(h.cur,h.max);if(k==='cur')h.cur=Math.min(h.cur,h.max);if(h.max===0)delete o.hp;touch()};
  const paint=()=>{
    const h=o.hp||{cur:0,max:0,temp:0};
    if(document.activeElement!==cur)cur.value=h.cur;if(document.activeElement!==max)max.value=h.max;if(document.activeElement!==temp)temp.value=h.temp||0;
    if(document.activeElement!==elev)elev.value=o.elevation||0;
    const chips=$('#statusChips');chips.innerHTML='';
    for(const[id,C]of Object.entries(CONDITIONS)){
      const b=document.createElement('button');b.type='button';b.className='chip'+((o.conditions||[]).includes(id)?' on':'');b.title=C.name;b.dataset.cond=id;
      const d=document.createElement('span');d.className='dot';d.style.background=C.color;d.textContent=C.abbr;
      b.append(d,document.createTextNode(C.name));
      b.onclick=()=>{const c=new Set(o.conditions||[]);if(c.has(id))c.delete(id);else c.add(id);o.conditions=[...c];touch()};
      chips.appendChild(b);
    }
  };
  cur.oninput=()=>setHp('cur',+cur.value);max.oninput=()=>setHp('max',+max.value);temp.oninput=()=>setHp('temp',+temp.value);
  cur.onwheel=e=>{e.preventDefault();setHp('cur',hp().cur+(e.deltaY<0?1:-1)*(e.shiftKey?5:1))};
  $('#hpMinus').onclick=e=>setHp('cur',hp().cur-(e.shiftKey?5:1));$('#hpPlus').onclick=e=>setHp('cur',hp().cur+(e.shiftKey?5:1));
  elev.oninput=()=>{o.elevation=clamp(Math.round(+elev.value)||0,-9999,9999);touch()};
  paint();placePop(statusEl,sp);
}
```

Nota: si `snapshot`, `clamp` o `placePop` no son globales visibles desde `editor.js` (lo son hoy: `snapshot` en `editor.js`, `clamp` en `core.js`, `placePop` en `editor.js`), revísalo con `grep -n "^function placePop\|^const clamp\|^function snapshot" public/js/*.js`.

En `openContext`, rama `if(!gm){ ... }`, dentro de `if(ownsToken(o)){ ... }` añadir al final:

```js
add('heart-pulse','Estado: condiciones, vida y altura',()=>openStatus(o,sp));
```

y en la rama del director, dentro de `if(o.type==='token'){ ... }` (la que tiene «Mostrar a jugadores»), añadir como **primera** línea la misma llamada `add('heart-pulse','Estado: condiciones, vida y altura',()=>openStatus(o,sp));`. (Sí, es la misma línea en dos sitios: el test la busca una vez y basta con que exista; no la abstraigas.)

En `openEditor`, rama token: tanto en el bloque `if(!gm){...}` como en `if(gm){...}`, justo antes de `section('Retrato');`:

```js
      section('Vida y altura');
      num('Vida máxima',o.hp?o.hp.max:0,0,9999,1,v=>{if(v>0){o.hp=o.hp||{cur:v,max:v,temp:0};o.hp.max=v;o.hp.cur=Math.min(o.hp.cur,v)}else delete o.hp});
      num('Vida actual',o.hp?o.hp.cur:0,0,9999,1,v=>{if(o.hp)o.hp.cur=Math.min(v,o.hp.max)});
      num('Altura (pies)',o.elevation||0,-9999,9999,5,v=>o.elevation=v);
```

Ajustes: junto a `$('#sharedVision').onchange=...` (L714):

```js
$('#hpVisibility').onchange=e=>{S.hpVisibility=e.target.value;changed()};
```

y en la función que sincroniza los checkboxes (L852, donde está `$('#sharedVision').checked=...`):

```js
$('#hpVisibility').value=S.hpVisibility||'all';
```

- [ ] **Step 7: Verde**

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` y `npm run lint`
Expected: `# fail 0`, lint limpio.

- [ ] **Step 8: Comprobación a mano**

Con el servidor local (Task 9 Step 5): clic derecho en una ficha → «Estado…»: chips cambian de estado y los badges aparecen al instante; `−`/`+`/rueda mueven la vida y la barra; máxima 0 borra la barra; altura 20 muestra `+20'`. En Ajustes, «Vida de las fichas» = «Sólo el director» y abre una segunda pestaña como jugador (otro navegador o ventana privada): sin barra en las fichas ajenas. Deshacer (Ctrl+Z) revierte el popover en un paso.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/css/app.css public/js/icons.js public/js/editor.js test/frontend.test.js
git commit -m "feat(ui): popover Estado (condiciones, vida ±, altura), menú contextual y ajuste hpVisibility"
```

---

### Task 11: Prueba visual en `npm run test:ui`

**Files:**
- Modify: `test/e2e/ui.mjs` (antes del bloque «clima 2D», tras «chat y dados apagados…»)

**Interfaces:**
- Consumes: páginas `gm` y `pl` ya dentro del tablero; `pngPixels`, `step`, `shot`; globales del cliente `S`, `UI`, `Net`, `addObj`, `newToken`, `changed`, `requestRender`, `openStatus`.

- [ ] **Step 1: Añadir los pasos**

```js
  // fichas: condiciones, vida y altura (plan A). El director crea un ogro y el personaje del jugador
  const playerId = await pl.evaluate(() => UI.me.id);
  await gm.click('[data-tab="scene"]');
  await gm.evaluate((pid) => {
    UI.cam.zoom = 1; UI.cam.x = 800; UI.cam.y = 550;
    const ogre = addObj(newToken({ x: 700, y: 550 }, 'enemy', { hp: { cur: 10, max: 40, temp: 0 }, conditions: ['prone', 'poisoned'], elevation: 20 }));
    const hero = addObj(newToken({ x: 900, y: 550 }, 'player', { owner: pid, hp: { cur: 12, max: 12, temp: 0 } }));
    ogre.name = 'Ogro'; hero.name = 'Héroe'; changed();
  }, playerId);
  await pl.waitForFunction(() => S.tokens.some((t) => t.name === 'Ogro' && (t.conditions || []).includes('prone')), null, { timeout: 5000 });
  await pl.evaluate(() => { UI.cam.zoom = 1; UI.cam.x = 800; UI.cam.y = 550; requestRender(); });
  await gm.waitForTimeout(500); await pl.waitForTimeout(500);
  await shot(gm, '08-fichas-estado');
  // color del relleno de la barra del ogro (10/40 = 25 % → rojo) en la pantalla del jugador: la barra va bajo la ficha
  const stage2 = await pl.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const world2screen = (x, y) => [stage2.l + stage2.w / 2 + (x - 800), stage2.t + stage2.h / 2 + (y - 550)];
  const pxAt = async (page, x, y) => { const png = pngPixels(await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })); const i = (1 * png.w + 1) * png.ch; return [png.px[i], png.px[i + 1], png.px[i + 2]]; };
  const [bx, by] = world2screen(700 - 25 + 4, 550 + 25 + 3 + 2.5); // inicio de la barra (radio 25 a zoom 1)
  const bar = await pxAt(pl, bx, by);
  step('fichas: la barra de vida al 25 % es roja para el jugador', bar[0] > 170 && bar[1] < 140, `rgb(${bar})`);
  const plSeesOgreHp = await pl.evaluate(() => JSON.stringify((S.tokens.find((t) => t.name === 'Ogro') || {}).hp));
  step('fichas: con hpVisibility all el jugador recibe los números del ogro', plSeesOgreHp === '{"cur":10,"max":40,"temp":0}', plSeesOgreHp);
  // el director reserva la vida: el jugador pierde el hp del ogro pero conserva el suyo
  await gm.click('[data-tab="layers"]');
  await gm.selectOption('#hpVisibility', 'gm');
  await pl.waitForFunction(() => S.hpVisibility === 'gm' && !S.tokens.find((t) => t.name === 'Ogro').hp, null, { timeout: 5000 });
  const heroHp = await pl.evaluate(() => JSON.stringify(S.tokens.find((t) => t.name === 'Héroe').hp));
  step('fichas: con hpVisibility gm el jugador pierde el hp del ogro y conserva el suyo', heroHp === '{"cur":12,"max":12,"temp":0}', heroHp);
  // el jugador se pone «bendecido» y baja su vida desde el popover; el director lo ve
  await pl.evaluate(() => { const h = S.tokens.find((t) => t.name === 'Héroe'); openStatus(h, { x: 400, y: 300 }); });
  await pl.click('#statusPop .chip[data-cond="blessed"]');
  await pl.click('#hpMinus'); await pl.click('#hpMinus');
  await gm.waitForFunction(() => { const h = S.tokens.find((t) => t.name === 'Héroe'); return h && h.hp && h.hp.cur === 10 && (h.conditions || []).includes('blessed'); }, null, { timeout: 5000 });
  step('fichas: el jugador cambia condición y vida de su ficha y el director lo recibe', true);
  await shot(pl, '09-fichas-jugador');
  // el jugador intenta curar al ogro por debajo: el servidor lo corrige
  await pl.evaluate(() => { const o = S.tokens.find((t) => t.name === 'Ogro'); o.conditions = []; changed(); });
  await pl.waitForTimeout(1500);
  const fixed = await pl.evaluate(() => JSON.stringify(S.tokens.find((t) => t.name === 'Ogro').conditions));
  step('fichas: el jugador no puede tocar las condiciones del ogro (corrección del servidor)', fixed === '["prone","poisoned"]', fixed);
  await gm.selectOption('#hpVisibility', 'all');
  await pl.waitForFunction(() => S.hpVisibility === 'all', null, { timeout: 5000 });
  await gm.evaluate(() => { for (const t of S.tokens.filter((t) => ['Ogro', 'Héroe'].includes(t.name))) UI.selected = [t.id], deleteSel(); changed(); });
  await gm.waitForTimeout(400);
```

Nota sobre `deleteSel`: comprueba su nombre y firma real con `grep -n "^function deleteSel" public/js/editor.js`; si borra sólo la selección, la línea anterior funciona. Si la ficha del jugador queda «pegada» a la cámara del jugador (`centerView` sobre su ficha), no pasa nada: sólo miramos píxeles en la pestaña del jugador tras fijar `UI.cam` a mano.

- [ ] **Step 2: Ejecutar la prueba visual**

Run (servidor local en 3999 arriba, ver Task 9 Step 5): `npm run test:ui 2>&1 | tail -30`
Expected: todos los pasos `OK`, incluidos los 5 nuevos, y `sin errores de consola`. Abrir `test/e2e/capturas/08-fichas-estado.png` y `09-fichas-jugador.png` y comprobar a ojo: badges encima del ogro, `+20'` arriba a la izquierda, barra roja con `10/40` en la del director, y en la del jugador barra del héroe verde con `10/12`.

Si el píxel de la barra falla por un desplazamiento de 1–2 px, ajusta las coordenadas del punto medido (no el umbral de color) y documenta el porqué en un comentario de una línea.

- [ ] **Step 3: Mutación**

En `render.js`, cambiar `'#D9705F'` (rojo) por `'#6FBF73'` → el paso «barra al 25 % es roja» debe fallar. Restaurar.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/ui.mjs
git commit -m "test(ui): fichas con condiciones, vida (visibilidad gm/all) y altura en la prueba visual"
```

---

### Task 12: Documentación de cierre

**Files:**
- Modify: `docs/01-arquitectura.md` (modelo de datos: campos del token y ajuste de tablero)
- Modify: `docs/02-funcional.md` (qué ve y hace cada rol con condiciones/vida/altura)
- Modify: `docs/05-runbook.md` (gotcha nuevo)
- Modify: `docs/07-historial.md`, `docs/06-pendientes.md`, `docs/00-INDEX.md`
- Modify: `README.md` (sección «Qué puede hacer cada rol»)

- [ ] **Step 1: `01-arquitectura.md`**

En el modelo de datos, donde se describe `objects.data` del tipo `token`, añadir:

```markdown
- `conditions: string[]` — ids del catálogo `CONDITION_IDS` (`server/rules.js`; espejo `CONDITIONS` en `public/js/core.js`, test de contrato en `frontend.test.js`). Siempre presente.
- `hp?: {cur, max, temp}` — enteros ≥ 0, `cur ≤ max`. Sólo existe si `max` se ha fijado; sin `hp` no hay barra.
- `elevation: number` — pies, entero ±9999, 0 por defecto.

Ajuste de **tablero** `hpVisibility: 'all' | 'gm' | 'bar_only'` (`DEFAULT_BOARD`). Con `'gm'` el servidor quita
`hp` de las fichas ajenas antes de enviarlas a un jugador (`R.objectFor`, aplicada en `stateFor`, `handleOps`
y `moveUser`; al cambiar el ajuste cada jugador recibe un `state` completo). `'bar_only'` viaja entero y lo
respeta el cliente al pintar (los números se pueden leer desde la consola: aceptado, es cosmética).
Permisos: el dueño de la ficha edita `conditions`, `hp` y `elevation` (`playerUpsert`); el resto de campos
siguen siendo del director.
```

- [ ] **Step 2: `02-funcional.md`**

En la sección de fichas / roles:

```markdown
### Condiciones, vida y altura (2026-09-19)

- Clic derecho en una ficha → **Estado**: 20 condiciones (14 del SRD + muerto, concentración, agotamiento,
  en llamas, bendecido, marcado), vida actual/máxima/temporal con `−`/`+` (Mayús: 5) o rueda del ratón, y
  altura en pies. Lo abren el director (cualquier ficha) y el jugador (la suya).
- En el lienzo: badges de dos letras encima de la ficha (máximo 6, luego `+n`), barra de vida bajo la ficha
  (verde > 50 %, ámbar > 25 %, rojo; franja cian = vida temporal), pastilla `+20'` arriba a la izquierda si
  la altura no es 0, velo y calavera si está muerta.
- Ajustes → Reglas para jugadores → **Vida de las fichas**: todos · sólo el director (cada jugador sigue
  viendo la suya) · los jugadores ven sólo la barra.
```

- [ ] **Step 3: `05-runbook.md`** — en «Gotchas»:

```markdown
- **Añadir una condición** = dos sitios: `CONDITION_IDS` en `server/rules.js` **y** `CONDITIONS` en
  `public/js/core.js` (mismo orden). El test de contrato de `frontend.test.js` avisa si se desincronizan.
- **`hp` sin `max` no existe**: `sanitize` lo elimina. Para quitar la barra a una ficha, pon la vida máxima a 0.
```

- [ ] **Step 4: `07-historial.md`**

```markdown
## 2026-09-19 — Fichas: condiciones SRD, vida y altura (plan A; P-19, P-20, P-21)

- **Qué:** `token.conditions`, `token.hp {cur,max,temp}`, `token.elevation`; ajuste de tablero `hpVisibility`;
  proyección `objectFor` en el servidor; popover «Estado», badges, barra y etiqueta en el cliente. Sin migración
  (jsonb). Tests: `rules.test.js` (+4), `realtime.test.js` (+1), `frontend.test.js` (+3), `ui.mjs` (+5 pasos).
- **Por qué:** spec `2026-09-19-condiciones-srd-y-tactica-design.md` §1–3.
- **Revertir:** `git revert` de los commits `feat(rules)…`, `feat(ws)…`, `feat(cliente)…`, `feat(render)…`,
  `feat(ui)…` y `test(ui)…` de esta fecha. Los campos que queden en `objects.data` son inofensivos: `sanitize`
  los ignora si no los conoce.
```

- [ ] **Step 5: `06-pendientes.md`**

Mover P-19, P-20 y P-21 a la línea de cerrados: `**P-19, P-20, P-21** el 2026-09-19 (plan A; evidencia: tests de rules/realtime/frontend y capturas 08/09 de test:ui)`. Actualizar la fecha de cabecera.

- [ ] **Step 6: `00-INDEX.md`**

Actualizar «Última actualización», el conteo de tests (`npm test` → **83 tests**: confírmalo con la salida real), y en «Funciones» añadir `· condiciones, vida y altura en fichas (visibilidad de la vida configurable)`.

- [ ] **Step 7: `README.md`** — en «Qué puede hacer cada rol», una línea por rol:

```markdown
- Director: clic derecho en una ficha → **Estado** para condiciones, vida y altura; en Ajustes decide quién ve la vida.
- Jugador: lo mismo sobre su propio personaje.
```

- [ ] **Step 8: Verificación final y commit**

Run: `npm run check 2>&1 | tail -8` y `npm run test:ui 2>&1 | tail -5`
Expected: ambos verdes. `git status` sin ficheros sueltos (no commitear `diorama-jav/` ni capturas).

```bash
git add docs/ README.md
git commit -m "docs: condiciones, vida y altura en fichas (01, 02, 05, 06, 07, 00, README)"
```

**No desplegar.** Avisar al usuario: rama `prod-2d` lista para revisión; el despliegue (API de Coolify, ver `docs/03-despliegue.md`) y el porte a `clima-2d`/`main` se deciden después.

---

### Task 13 (añadida tras la revisión, 2026-09-19): interruptores de tablero «Vida» y «Condiciones y altura»

**Contexto:** el usuario lleva vida y efectos en otro sistema; quiere poder apagar estas funciones por tablero,
igual que chat y dados. Apagar **oculta**, no borra: los datos siguen en las fichas y reaparecen al encender.

**Files:**
- Modify: `server/rules.js` (`BOARD_KEYS`, bucle de booleanos en `cleanSettings`, `DEFAULT_BOARD`)
- Modify: `public/js/core.js` (`blankState`), `public/js/net.js` (`SCENE_KEYS`)
- Modify: `public/index.html` (fold «Chat y dados», L358–365), `public/js/editor.js`, `public/js/render.js`
- Test: `test/rules.test.js`, `test/frontend.test.js`, `test/e2e/ui.mjs`

**Interfaces:**
- Produces: ajustes de tablero `hpEnabled: boolean` y `conditionsEnabled: boolean` (ambos `true` por defecto).
  - `hpEnabled=false` → sin barra ni números en el lienzo, sin fila «Vida» en `#statusPop`, sin campos «Vida máxima/actual» en el editor, y el select `#hpVisibility` se deshabilita.
  - `conditionsEnabled=false` → sin badges, sin velo de muerto, sin pastilla de elevación, sin chips ni fila «Altura» en `#statusPop`, sin campo «Altura» en el editor.
  - Los dos en `false` → no aparece «Estado: condiciones, vida y altura» en el menú contextual ni la sección «Vida y altura» del editor.
  - Helpers globales en `core.js`: `const hpOn=()=>S.hpEnabled!==false;` y `const condsOn=()=>S.conditionsEnabled!==false;`

- [x] **Step 1: Test de reglas que falla**

```js
test('hpEnabled y conditionsEnabled: booleanos de tablero, true por defecto', () => {
  assert.equal(R.DEFAULT_BOARD.hpEnabled, true);
  assert.equal(R.DEFAULT_BOARD.conditionsEnabled, true);
  assert.deepEqual(R.splitSettings({ hpEnabled: false, conditionsEnabled: false }).board, { hpEnabled: false, conditionsEnabled: false });
  assert.deepEqual(R.splitSettings({ hpEnabled: 'no', conditionsEnabled: 0 }).board, {});
  assert.equal(R.splitSettings({ hpEnabled: false }).scene.hpEnabled, undefined);
});
```

Run: `node --test test/rules.test.js 2>&1 | grep -E "^not ok"` → falla (`DEFAULT_BOARD.hpEnabled` es `undefined`).

- [x] **Step 2: Servidor**

En `rules.js`: añadir `'hpEnabled', 'conditionsEnabled'` a `BOARD_KEYS` **y** al array del bucle de booleanos de `cleanSettings` (la línea `for (const k of ['fog', 'grid', ..., 'initiativeShown'])`); en `DEFAULT_BOARD` añadir `hpEnabled: true, conditionsEnabled: true`.

Run: `node --test test/rules.test.js 2>&1 | grep -E "^# (pass|fail)"` → verde. Mutación: quitar `'hpEnabled'` de `BOARD_KEYS` → falla la línea de `.scene.hpEnabled`. Restaurar.

- [x] **Step 3: Test de contrato del cliente que falla**

```js
test('interruptores de vida y condiciones: checkboxes en Ajustes, helpers hpOn/condsOn y el render los respeta', () => {
  const html = read('index.html');
  assert.match(html, /<input type="checkbox" id="hpEnabled"> Vida de las fichas/);
  assert.match(html, /<input type="checkbox" id="conditionsEnabled"> Condiciones y altura/);
  const core = read('js/core.js');
  assert.match(core, /hpEnabled:true,conditionsEnabled:true/);
  assert.match(core, /^const hpOn=\(\)=>S\.hpEnabled!==false;$/m);
  assert.match(core, /^const condsOn=\(\)=>S\.conditionsEnabled!==false;$/m);
  assert.match(read('js/net.js'), /'hpVisibility','hpEnabled','conditionsEnabled'\]/);
  const render = read('js/render.js');
  assert.match(render, /const conds=condsOn\(\)\?\(t\.conditions\|\|\[\]\):\[\];/);
  assert.match(render, /if\(hpOn\(\)&&t\.hp&&t\.hp\.max>0\)\{/);
  assert.match(render, /if\(condsOn\(\)&&t\.elevation\)\{/);
  assert.match(render, /\(hpOn\(\)&&t\.hp&&t\.hp\.max>0\?px\(7\):0\)/, 'el nombre sólo baja si hay barra visible');
  const editor = read('js/editor.js');
  assert.match(editor, /if\(hpOn\(\)\|\|condsOn\(\)\)add\('heart-pulse'/);
  assert.match(editor, /\$\('#hpEnabled'\)\.onchange=e=>\{S\.hpEnabled=e\.target\.checked;changed\(\)\}/);
  assert.match(editor, /\$\('#conditionsEnabled'\)\.onchange=e=>\{S\.conditionsEnabled=e\.target\.checked;changed\(\)\}/);
  assert.match(editor, /\$\('#statusHp'\)\.style\.display=hpOn\(\)\?'':'none'/);
  assert.match(editor, /\$\('#hpVisibility'\)\.disabled=!hpOn\(\)/);
});
```

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^not ok"` → falla.

- [x] **Step 4: Cliente**

`core.js`: en `blankState`, tras `hpVisibility:'all',` añadir `hpEnabled:true,conditionsEnabled:true,`. Tras la línea `const canControl=...` añadir:

```js
// interruptores de tablero: el usuario puede llevar vida y efectos en otro sistema
const hpOn=()=>S.hpEnabled!==false;
const condsOn=()=>S.conditionsEnabled!==false;
```

`net.js`: `SCENE_KEYS` termina en `...,'hpVisibility','hpEnabled','conditionsEnabled']`.

`index.html`, fold `data-fold="mesa"`: título `Chat, dados y fichas`; tras el checkbox de Dados:

```html
          <label class="check"><input type="checkbox" id="hpEnabled"> Vida de las fichas</label>
          <label class="check"><input type="checkbox" id="conditionsEnabled"> Condiciones y altura</label>
```

y el párrafo pasa a: `Lo que apagues desaparece para todo el mundo, tú incluido. Si apagas chat y dados, la pestaña Chat se quita. Vida y condiciones se ocultan pero no se borran.`

`render.js`, en `drawTokenStatus`:
- `const conds=condsOn()?(t.conditions||[]):[];`
- `if(hpOn()&&t.hp&&t.hp.max>0){` (barra)
- `if(condsOn()&&t.elevation){` (pastilla)
- en `drawToken`, el desplazamiento del nombre: `(hpOn()&&t.hp&&t.hp.max>0?px(7):0)`.

`editor.js`:
- Menú contextual: las dos líneas `add('heart-pulse',...)` pasan a `if(hpOn()||condsOn())add('heart-pulse','Estado: condiciones, vida y altura',()=>openStatus(o,sp));`
- `openStatus`, justo antes de `paint();placePop(statusEl,sp);`:
  `$('#statusHp').style.display=hpOn()?'':'none';$('#elevation').parentElement.style.display=condsOn()?'':'none';$('#statusChips').style.display=condsOn()?'':'none';`
- `openEditor`, en los dos bloques (`!gm` y `gm`): envolver la sección:
  ```js
      if(hpOn()||condsOn())section('Vida y altura');
      if(hpOn()){num('Vida máxima',...);num('Vida actual',...)}
      if(condsOn())num('Altura (pies)',...);
  ```
  (mismos cuerpos que ya existen; no cambiar las lambdas).
- Ajustes: junto a `$('#diceEnabled').onchange=...`:
  ```js
  $('#hpEnabled').onchange=e=>{S.hpEnabled=e.target.checked;changed()};
  $('#conditionsEnabled').onchange=e=>{S.conditionsEnabled=e.target.checked;changed()};
  ```
- `syncSceneInputs`: tras `$('#hpVisibility').value=...;` añadir
  `$('#hpEnabled').checked=hpOn();$('#conditionsEnabled').checked=condsOn();$('#hpVisibility').disabled=!hpOn();`
- Los popovers abiertos no se refrescan solos al cambiar el ajuste: aceptable (se cierran al hacer clic en el lienzo).

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` y `npm run lint` → verdes.

- [x] **Step 5: Paso visual en `ui.mjs`**

Justo antes de la línea `await gm.selectOption('#hpVisibility', 'all');` del bloque de fichas (Task 11), añadir. Ojo: en ese punto `hpVisibility` es `gm` y el ogro no tiene `hp` en el jugador, así que se mide la barra del **héroe** (12/12 → verde `#6FBF73`):

```js
  // interruptores: apagar «Vida de las fichas» quita la barra en el jugador (el dato sigue en la ficha)
  const [hx, hy] = world2screen(900 - 25 + 4, 550 + 25 + 3 + 2.5); // barra del héroe (radio 25 a zoom 1)
  const barOn = await pxAt(pl, hx, hy);
  await gm.uncheck('#hpEnabled');
  await pl.waitForFunction(() => S.hpEnabled === false, null, { timeout: 5000 });
  await pl.waitForTimeout(400);
  const barOff = await pxAt(pl, hx, hy);
  const heroKeeps = await pl.evaluate(() => !!S.tokens.find((t) => t.name === 'Héroe').hp);
  const isGreen = (p) => p[1] > 150 && p[0] < 140;
  step('fichas: con la vida apagada desaparece la barra (verde antes, no después) y la ficha conserva su hp', isGreen(barOn) && !isGreen(barOff) && heroKeeps, `rgb(${barOn}) → rgb(${barOff})`);
  await gm.check('#hpEnabled');
  await pl.waitForFunction(() => S.hpEnabled !== false, null, { timeout: 5000 });
```

Si el píxel no cae en la barra por 1–2 px, ajusta `hx, hy` (no los umbrales) y deja un comentario de una línea.

Run (servidor local en 3999): `npm run test:ui 2>&1 | tail -8` → 35/35.

- [x] **Step 6: Docs y commit**

`docs/02-funcional.md` (sección «Condiciones, vida y altura»): `- Ajustes → Chat, dados y fichas: **Vida de las fichas** y **Condiciones y altura** se apagan por tablero (se ocultan, no se borran) para quien lleve esto en otro sistema.`
`docs/01-arquitectura.md`: añadir `hpEnabled` y `conditionsEnabled` a la lista de ajustes de tablero.
`docs/07-historial.md`: entrada `## 2026-09-19 — Interruptores de vida y condiciones por tablero` (qué / por qué: el usuario lleva vida y efectos en otro sistema / revertir: `git revert` del commit).

```bash
npm run check && git add server public test docs && git commit -m "feat(mesa): interruptores de tablero para vida y condiciones/altura (se ocultan, no se borran)"
```

No incluir `diorama-jav/` en el commit (`git add` con rutas, nunca `-A`).

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec §1–3:** catálogo 20 ids (T3) · menú contextual para director y dueño (T10) · badges compactos (T9) · `hp/maxHp/tempHp` como `hp:{cur,max,temp}` (T4; el spec nombra `maxHp`/`tempHp`, la tabla de decisiones fija `hp:{cur,max,temp}`: se sigue la tabla) · sin hojas de personaje ✓ · visibilidad `all/gm/bar_only` (T6, T7, T9, T10) · edición con clic y rueda (T10) · elevación en pies con etiqueta sólo si ≠ 0 (T4, T9) · permisos por `ownsToken` (T5, T7). Criterios de aceptación 1–4 cubiertos por T3, T9/T11, T4 y T5/T7. El 5.º (regla con Espacio) es del plan B.
- **Sin placeholders:** cada paso lleva código o comando y salida esperada.
- **Nombres consistentes:** `CONDITION_IDS` (servidor) / `CONDITIONS` (cliente) · `objectFor(o, member, board)` · `hpVisibility` · `openStatus(o,sp)` · `drawTokenStatus(c,t,P,r,player)` · `#statusPop`, `#hpCur`, `#hpMax`, `#hpTemp`, `#hpMinus`, `#hpPlus`, `#elevation`, `#statusChips`, `#hpVisibility`.
