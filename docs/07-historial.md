# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-26 — P-48: puertas `p:` por toda su huella y `WALLAT` con varias piezas por casilla (rama `p48-piezas`, sin desplegar)

- **Qué** (sólo en `modules/tablero3d/public/tablero3d.js`; sólo alcanzable con piezas `p:`, las de fábrica son 1×1):
  - **(a)** una puerta de varias casillas bloquea (`blocked`/`doorShut`/`lockedDoors`) **todas** las de su huella
    (`propCells`), como `gridOf`/`gmOnlyBlockCells` del servidor: en `refreshEntities`, `toggleDoor` (abrir/cerrar;
    `lockDoor` pasa por los dos), `doorAt` (la puerta con esquina en la casilla primero; si no, la que la cubre: menú
    contextual y apertura al pasar desde cualquier casilla; la mesa en vivo sigue con la clave `x_z` de la esquina),
    `doorRelight` (cada casilla cuenta para las luces cercanas) y `openings` (la luz de fuera entra por cada casilla).
  - **(b)** `WALLAT` pasa a casilla → **lista** de piezas (`wallAdd`); `GRID.bk` y `AGRID.bk` usan `wallBlocks`: tapa si
    alguna tapa. Antes una `p:` que tapa puesta sobre una ventana de fábrica la pisaba o quedaba pisada según el orden.
  - `probe('cell', x, z)` (sólo lectura, para las pruebas): `{blocked, shut, locked}` de una casilla.
- **Por qué:** menores de la revisión final de la fase 0 (P-48); el cliente dejaba cruzar la segunda casilla de una
  puerta `p:` cerrada que el servidor sí bloquea, y la vista a través de una ventana dependía del orden de las piezas.
- **Test primero:** dos pasos nuevos en `test/e2e/t3d.mjs` — puerta `p:` 2×1 en un hueco de muro, tocada en su casilla
  que no es la esquina (cerrada: las dos bloqueadas; abierta: ninguna; con llave `probe('route')` = null; sin llave el
  director la cruza) y `p:` con `sight:'block'` sobre una ventana (antes y después en la lista: tapa; importada la escena
  sin ella, se ve). **Sin el arreglo fallaban los dos** (35/37: la casilla (4,4) libre y sin menú de puerta; la ventana
  pisaba la `p:`). Roto a propósito después: `toggleDoor` sólo sobre la esquina → falla el paso (a). Contrato en
  `test/t3d/frontend.test.js` (+1 test, 2 aserciones puestas al día).
- **Verificado:** `node --test --test-concurrency=1 test/t3d/*.test.js` → 221/221 · `npx eslint modules/tablero3d test/t3d
  test/e2e/t3d.mjs` limpio · `npm run test:t3d` → **37/37** tres veces seguidas (el paso de equivalencia de fábrica
  sigue idéntico).
- **Rendimiento de `refreshEntities`** (escena 160×160 con 5000 objetos: 26 tipos de fábrica —puertas, ventanas, velos,
  maleza, barreras, luces, puentes, puestos…— y un 15 % de `p:` de 2×1/1×1 —velo, puerta, farol, mesa—; `probe` temporal
  que lo llama 30 veces tras 5 de calentamiento; `main` @ b77950b en un worktree temporal contra esta rama, alternando,
  tres tandas cada una; Edge headless con SwiftShader; ni el guion ni el `probe` quedan en el repo):

  | | tanda 1 | tanda 2 | tanda 3 | mediana | media |
  |---|---|---|---|---|---|
  | `main` (mediana por tanda, ms) | 460 | 434 | 439 | 439 | 453 |
  | `p48-piezas` (ms) | 482 | 424 | 445 | 445 | 446 |

  → **×1,01** (mediana; ×0,99 en media), dentro del ×1,15. Los números absolutos no se comparan con los 128/140 ms de
  la fase 0: otra escena (con puertas y `p:`) y otra forma de llamar; lo que vale es el cociente en la misma máquina.
- **Carrera del paso nuevo, causa confirmada y arreglada (no tapada):** el paso (a) no abrió su escena una vez de
  cinco. El motor abre «la última guardada», y medido en el navegador «Piezas 2» se volvía a guardar unos 0,4 s después
  de que `/pieces` se recuperara (paso M4/M5), aunque nadie la había tocado. `autoKey()` serializa con
  `Catalogo.complete(…, PIECES)`: la línea base del autoguardado se tomó con las `p:` opacas y, al llegar las
  definiciones, la clave cambiaba y se guardaba sola. Eso rompía «abrir no guarda» y podía adelantar esa escena a una
  recién guardada. **Arreglo** en `loadPieces`: si la escena abierta sigue igual que su línea base (su clave con las
  piezas de antes), se rehace la base al cargar las definiciones en vez de guardar; si se editó mientras tanto, se
  guarda como siempre. Test primero: el paso M4/M5 exige que el `updated` de la escena no cambie en los 5 s tras
  curarse; fallaba antes (`…050007` → `…052973`). El paso (a) queda sin reintentos: un PUT y una recarga.
  `frontend.test.js` +1 aserción. `test:t3d` → **37/37 cinco veces seguidas**; `test/t3d` 221/221; eslint limpio.
- **Menores de la revisión de la rama (aprobada sin críticos ni importantes), arreglados en la misma rama:**
  - **Paso M4/M5 que muerde:** `upd0` se lee con `/pieces` aún caído (antes, tras curarse: podía llegar tarde); la espera
    de 5 s queda comentada como deliberada (más de dos ciclos de `AUTO_MS`). Sin el arreglo de `loadPieces`, falla.
  - **`doorRelight` con puerta `p:`:** paso nuevo — puerta `p:` 1×8 en una columna de muro, antorcha (r 4) junto a la
    casilla (6,10) y lejos de la esquina (6,4); al abrirla tocando en (6,10), la luz de (7,10) sube al momento. Con
    `doorRelight` sólo desde la esquina, falla (0,333 → 0,333).
  - **Reja `p:`:** `GRID.door`/`AGRID.door` miran `doorSeal` (sólo puertas de fábrica cerradas, que tapan como un
    muro); una puerta `p:` tapa vista y luz por sus componentes y su estado desde `WALLAT` (ya entraba por `senseOf`).
    Paso nuevo: reja `p:` 2×1 (`door`, `sight`/`light` `'none'`) cerrada con llave → se ve a través en sus dos
    casillas y no se pasa; la puerta `p:` con `sight:'block'` sigue tapando. Fallaba antes (`los` false).
  - **`toggleDoor` y otras piezas en la casilla:** rehace `blocked`/`doorShut`/`doorSeal` de cada casilla de la puerta
    con todas las piezas que la cubren (`recalcCell`, el mismo criterio que `refreshEntities`). Paso nuevo con JSON
    importado: cofre en (4,4) bajo una puerta `p:` 2×1 → al abrir, (4,4) sigue bloqueada. Fallaba antes (se liberaba).
  - **Cambio de comportamiento sólo alcanzable con JSON importado:** con `WALLAT` por listas, **dos muros de fábrica en
    la misma casilla tapan si cualquiera tapa**; antes ganaba el último de la lista. El editor no deja apilarlos.
  - `probe('cell')` devuelve también `seal`. `docs/01` (línea larga partida) y `README` del módulo al día.
  - **Verificado:** `test/t3d` 221/221 · eslint limpio · `test:t3d` → **40/40 cinco veces seguidas**. El nuevo coste en
    `refreshEntities` es un `Muros.kindOf` por puerta cerrada (despreciable frente a la medida de arriba).
- **Revertir:** `git revert` de los commits del arreglo (`1abf164`, el de la carrera del autoguardado y el de los
  menores de la revisión); sin migraciones ni datos.

## 2026-09-26 — Despliegue de main @ d69bd08 (fase 0 del arte propio + arreglo de caída del upgrade)

- **Antes:** ensayo de sólo lectura con los datos reales (`cleanMap`/`cleanCampaign` nuevos sobre la escena y la campaña de
  producción): 1 escena idéntica; campaña «cbrezo» 218→218 y 27→27 piezas con los mismos tipos, fichas y techos; sólo cae
  `open:false` en objetos que no son puertas (sin efecto); ningún farol/antorcha/brasero redibujado (el cambio de luz de los
  dibujos no afecta a nada existente). Copia: `vps1new:/root/backups/ja-vtt-predeploy/jav-2026-09-26-2331-pre-fase0.sql.gz`.
- **Qué:** `fase0-piezas` → `main` (avance rápido) y deploy `bylfgv5smpaofhrgxoimnri1`.
- **Verificado desde el servidor:** `finished` en `d69bd08`; app/db healthy; log `t3d/007-piezas.sql`; `/`, `/api/health`,
  `/t3d/t3d.js`, `/t3d/catalogo.js` 200; el cliente servido carga `catalogo.js`; datos intactos (4 usuarios, 6 tableros, 1 mesa
  3D, 1 escena, 1 campaña; `t3d.pieces` vacía). No se corrió `test:t3d` contra producción (crearía cuentas de prueba).
- **Revertir:** redeploy de `0b12ed4` en Coolify; la migración 007 es aditiva (`DROP TABLE t3d.pieces` si hiciera falta) y las
  escenas v2 las lee la versión anterior (espejo `open`/`locked`); o restaurar la copia.

## 2026-09-26 — El servidor sobrevive a un RST antes de que ws.js escuche 'error' (excepción puntual al anfitrión 2D, rama `fase0-piezas`)

- **Qué:** primera línea de `server.on('upgrade', ...)` en `server/app.js`: `sock.on('error', () => {})`.
- **Por qué:** entre que llega la petición de upgrade y que `server/ws.js` (`new Socket(sock)`) pone su
  propia escucha de `'error'`, el socket crudo no tiene ninguna; un cliente que corta con RST durante
  `userFrom`, la respuesta 401, el 400 de `acceptUpgrade` o el `sock.destroy()` del `catch` hace que
  `sock.end()`/`sock.write()` falle **de forma asíncrona**, ya fuera de ese `try/catch` — `uncaughtException`
  sin escucha, y cae el proceso entero (2D y 3D). Medido en producción: 4–6 de cada 300 conexiones sin sesión.
- **Test primero** (`test/ws-reset.test.js`, nuevo): 500 conexiones TCP crudas piden `/ws?board=x` sin
  cookie y cortan con `resetAndDestroy()` en cuanto llega el primer byte de respuesta (justo la ventana
  donde el servidor ya está contestando); se instala un `process.on('uncaughtException')` durante toda
  la vida del test. **Sin la línea, el test falla 5/5** (el `ECONNRESET` async tumba el proceso, node
  lo reporta como actividad asíncrona tras terminar el hook `before`). **Con la línea, pasa 5/5** y
  `GET /api/health` sigue en 200.
- **Verificado:** `node --test test/ws-reset.test.js` → 5/5 con el arreglo · `npm run check` completo
  (lint + todos los tests, 2D y 3D) → verde, tres veces seguidas · `test/realtime.test.js` (el flake de
  P-28) → 5/5 seguidas, limpio; **P-28 cerrado**.
- **Revertir:** quitar esa línea de `server/app.js` (commit único, sin migraciones).

## 2026-09-26 — Fase 0: ola final de arreglos tras la revisión de toda la rama (rama `fase0-piezas`, sin desplegar)

- **Qué** (decisiones en `.superpowers/sdd/2026-09-26-fase0-cimientos-piezas/final-fix.md`, Rulings R19–R21):
  - **I1** el servidor conserva opacas las piezas `p:` sin definición (como el cliente, R15): `cleanProp` guarda
    sólo `type`/`def`/`uid`/`x`/`z`/`v`/`level`/`side` y un `state` plano; al jugador no le llegan y su casilla sale
    en `blockCells` (1×1); `pieceInUse` mira también `t3d.live_docs`; `PUT` de pieza: terreno → 400, cambio de
    `class` en uso → 409.
  - **I2** el motor tapa vista, luz y maleza por componentes: una pieza sin `wallKind` que pueda tapar entra en
    `WALLAT` en todas sus casillas y `GRID.bk` pregunta con las definiciones del tablero.
  - **I3** una puerta `p:` tiene estado: `validateDef` sintetiza `open`/`locked` y la variante abierta de fábrica
    (spec §3.2).
  - **I4** `Catalogo.factoryType`: lo que decide por tipo (portal, luz, puerta, ventana, escalera, árbol) sólo
    vale para piezas de fábrica, en el servidor y en el cliente.
  - **Menores**: uid repetidos deterministas en los dos lados (M1), `level`/`side` en el cliente (M2), árbol
    `v:3` (M3, era un fallo real: la escena se quedaba a medias), abrir sin esperar a `/pieces` (M4) y luz/niebla
    rehechas al cargarlas (M5), un solo `doorRelight` por lote de la mesa en vivo (M6), `piecesRev` olvidado al
    borrar el tablero (M7), contrato de migración con tablas y filas de `t3d` (M8), documentación (M9),
    cobertura de `catalogo.js` en `npm test` (M10) y `span` que sólo gira con `orient` (M11).
- **Por qué:** la revisión de la rama encontró que el servidor aún descartaba piezas que el cliente conservaba,
  que el motor sólo tapaba por `wallKind` y que el tipo decidía comportamiento en piezas que no eran de fábrica;
  la fase 1 habría tenido que rehacerlo (cero pendientes, decisión del usuario).
- **Cambio visible (sólo con piezas `p:`, que aún no existen en producción)**: un objeto `p:` cuyo tipo empieza
  por `obj:` alumbra con su `emitLight` si no hay dibujo con ese nombre (antes, nunca).
- **Verificado:** `node --test --test-concurrency=1 test/t3d/*.test.js` → 220/220 · eslint limpio ·
  `npm run test:t3d` → **35/35** (3 pasos nuevos; el de equivalencia de fábrica sigue idéntico). Cada arreglo roto
  a propósito; detalle en `final-fix-report.md` de esa carpeta.
- **Revertir:** `git revert` de los commits de la ola (`b8e38ce..HEAD`); sin migraciones nuevas.

## 2026-09-26 — Fase 0 del arte propio: cimientos de las piezas (rama `fase0-piezas`, sin desplegar)

- **Qué:** cimientos para que las fases 1–6 de la hoja de ruta del arte propio (P-38) añadan piezas con
  comportamiento sin reescribir el motor cada vez. Catálogo único
  (`modules/tablero3d/public/catalogo.js`, cliente y servidor) con las 38 piezas de fábrica y los 10 terrenos
  como definiciones por componente (`move`, `sight`, `light`, `door`, `portal`, `emitLight`, `surface`, `hide`,
  `gmOnly`, `terrain`), sustituyendo las listas repetidas de antes (`DOOR_PROPS`, `PASSABLE_PROPS`,
  `PROP_SPANS` en `rules.js`, `muros.js` y `PROP3D`). Esquema de pieza colocada (`v: 2`, `def`/`uid`/`state`,
  prefijos `f:`/`p:`/`d:`) validado en el servidor (`cleanProp`/`cleanMap`), con tabla nueva `t3d.pieces`
  (migración `007-piezas.sql`) y su API (`GET/PUT/DELETE …/pieces[/:pid]`, tope 300 y 64 KB). Detalle completo
  en [docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md](superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md)
  (§6 «Resultado»); estado técnico en [01](01-arquitectura.md) y [02](02-funcional.md).
- **Por qué:** el «qué es cada tipo» estaba repetido en tres sitios sin test que los comparara, y una
  investigación previa (hoja de ruta del arte propio, P-38) encontró fallos reales de privacidad y de
  saneado que convenía cerrar antes de construir piezas propias encima.
- **Fallos reales encontrados y arreglados** (cada uno con su test, roto una vez a propósito):
  - **Privacidad — barreras al jugador:** las piezas `gmOnly` (barreras) llegaban al jugador por la escena,
    por una campaña y por la mesa en vivo; sólo el cliente las escondía. Ahora `sceneFor`/`campaignFor`/
    `liveDocFor` no las mandan. Efecto colateral (Ruling R18): sin la pieza, el jugador podía arrastrar su
    ficha a través de la barrera porque el servidor nunca ha validado los caminos (`R.liveChange` sólo mira
    dueño y rol) — se cerró mandando la casilla bloqueada sin tipo ni arte (`blockCells`, campo derivado, no
    se guarda); el cliente la trata como impasable. Ampliado a una definición `gmOnly` **borrada** mientras la
    pieza seguía colocada (fallar cerrado: sin definición que resolver, tampoco llega al jugador) y a un
    `DELETE` de definición en uso (409, en vez de dejar piezas huérfanas).
  - **Validación — campos sin sanear:** un objeto que no era luz ni muro se guardaba tal cual, sin comprobar
    `x`/`z` ni tipo, y una pieza podía quedarse con campos ajenos (un cofre con `target`/`color` de un portal).
    Ahora cada pieza se valida contra su definición y sólo guarda los campos propios de su categoría.
  - **Luz tras una puerta:** al abrir o cerrar una puerta no se recalculaba la luz de las antorchas o faroles
    de detrás (`lightDirty=true` no bastaba: `relight()` sale si ninguna ficha lleva luz encima). Arreglado con
    `doorRelight`, que sí rehace los bloques de alrededor de la puerta cuando alguna fuente la alcanza.
  - **`def` falso:** una pieza podía llevar un `def` que no le correspondía (una barrera con `def:'f:chest'`);
    el catálogo ahora deriva siempre `f:`/`d:` de `type` y sólo un `p:` bien formado sustituye.
  - **Mesa huérfana (Tarea 8b, hallado al medir el flake conocido):** quien entraba justo cuando el volcado
    automático descargaba una mesa vacía se quedaba en una mesa sin clientes (`TypeError` en `state`, mensajes
    ignorados en silencio). Arreglado en `join` (`index.js`).
- **Cambios visibles aceptados** (no son regresiones, son la consecuencia correcta de cerrar la privacidad):
  - Al jugador le **crece hierba** en la casilla donde antes veía (aunque no pudiera cruzarla) la barrera del
    director: es más privado, no menos.
  - Un dibujo que sustituye a un farol, una antorcha o un brasero **manda sobre su luz** (si no tiene luz
    propia, ese objeto se apaga) y un árbol o un aspecto de portal con dibujo propio con luz **puede
    alumbrar**, cosa que antes no podía. Ratificado (Ruling R16): el aspecto de un portal usa su propio dibujo
    para decidir su luz, no el tipo genérico «portal».
- **Verificado:** `node --test --test-concurrency=1 test/t3d/*.test.js` → 207/207 (el flake conocido de
  «mesa en vivo» de `realtime.test.js`, causa 2 de la Tarea 8b, deja de reproducirse: 0/5 tandas completas
  tras el arreglo) · `npx eslint modules/tablero3d test/t3d test/e2e/t3d.mjs` → limpio · `npm run test:t3d` →
  **32/32** (antes de la fase, 26/26; nuevos: catálogo/§6, escena vieja de ida y vuelta, pieza `p:` opaca,
  barrera R18) · equivalencia en navegador (Tarea 7: la misma escena de referencia con muros, puertas,
  puentes, maleza, portal mágico… antes y después del motor por catálogo) → caminos, puertas, tarimas, luz y
  niebla idénticos, hasta 0,000 de diferencia · rendimiento en una escena 160×160 con 5000 objetos (Tarea 9,
  tabla completa en `task-9-report.md`): `refreshEntities` 128 ms → 140 ms (×1,09, dentro del ×1,15 de
  margen), fps 46 → 46 (sin cambio), camino largo (310 casillas) 44 ms → 43 ms (sin cambio) — **DONE**, sin
  necesidad de optimizar.
- **Revertir:** `git revert` de los commits `9a4c834..f935ff5` sobre `main` (o del commit de fusión, si se
  fusiona con `--no-ff`); la migración `t3d/007-piezas.sql` es aditiva (tabla nueva, sin tocar las demás) —
  si hiciera falta deshacerla del todo, `DROP TABLE t3d.pieces` en la base (pierde las definiciones `p:` que
  se hubieran creado; en esta fase no hay ninguna piezas propias creadas todavía, sólo el cimiento). Sin
  desplegar: no hay nada que revertir en producción.

## 2026-09-26 — Tablero 3D: documentación traída, guardado automático y Mesa → Conexión

- **Desplegado:** `main @ 0b12ed4` (deployment `td1pkzrluvctlpmbony9paay`): `finished`, app/db healthy, `/t3d/tablero3d.js` con `autoSave` y `main.js` con `t3dStatusText`; datos intactos (4 usuarios, 6 tableros, 1 mesa 3D).

- **Qué:** (1) `docs/` y README de `3d-tablero@403d6a5` en `modules/tablero3d/docs/` con índice propio; el módulo
  se mantiene aquí desde hoy (regla en [04](04-convenciones.md) B.1b; pendientes abiertos del 3D en 06, P-37 a P-42);
  su prueba de humo pasa a `npm run test:t3d`. (2) Guardado automático de la escena 3D (o de la campaña) del director,
  cada 2 s si cambió; «Guardar en el tablero» pasa a «Guardar como nueva»; Ctrl+S guarda al momento. (3) Mesa →
  Conexión en una mesa 3D: estado de las dos conexiones y del render 3D, «Probar conexión» mide las dos
  (`mount().status()/ping()`, `Net.onPong`); «Vista» y «Atajos» del 2D ocultos.
- **Por qué:** petición del usuario: el 3D no guardaba solo como el 2D y «Probar conexión» medía sólo la del chat.
- **Verificado:** `test:t3d` 26/26 (5 pasos nuevos, en rojo antes de implementar; mutaciones: sin guardado automático
  caen 2, sin `pong` del 3D cae 1; el paso del chat, que a veces leía la casilla antes de tiempo, ahora espera) ·
  campaña: se guarda la campaña y no se crean escenas sueltas · `test:ui` 54/54 · `check` 100/100 (una pasada tras
  `test:ui` dio los fallos intermitentes de P-28; tres seguidas después, verdes).
- **Revertir:** `git revert` de los commits; sin migración ni cambios de servidor.

## 2026-09-26 — Despliegue de main @ f3e5f68 (tablero 3D, módulo activo)

- **Qué:** copia `pg_dump` de la base en `vps1new:/root/backups/ja-vtt-predeploy/jav-2026-09-26-1527-pre-t3d.sql.gz`
  (4 usuarios, 5 tableros, 441 objetos); `integracion-tablero-3d` → `main` (avance rápido, rama borrada) y
  `POST /api/v1/deploy` (deployment `b3yoctn983f9fy6fizeu7ibs`).
- **Verificado desde el servidor:** `finished` en `f3e5f68`; `app`/`db` healthy; log con `t3d/001…006`;
  `/api/health`, `/`, `/t3d/t3d.js` y `/t3d/t3d.css` en 200; HTML y `render.js` servidos con las líneas `t3d`;
  datos intactos (4/5/441) y `t3d.boards` vacía: los tableros existentes siguen 2D. No se corrió `test:ja-vtt`
  contra producción (crearía cuentas de prueba).
- **Revertir:** sin borrar nada, `T3D=off` en las variables de la app en Coolify + redeploy; o redeploy de
  `be83c7e` y `DROP SCHEMA t3d CASCADE`; o restaurar la copia.

## 2026-09-26 — Integración del tablero 3D (rama `integracion-tablero-3d`)

- **Qué:** `modules/tablero3d` copiado tal cual de `3d-tablero@403d6a5` y montado con su guía
  (`docs/08-integracion-ja-vtt.md` de ese repo, versión T8): 78 líneas añadidas y 7 sustituidas en 7
  archivos (`Dockerfile` en ISO-8859-1, `server/app.js`, `public/index.html`,
  `public/js/{main,editor,render,weather}.js`), todas marcadas `// t3d` o `t3d:`. Test nuevo
  `test/t3d.test.js` (escenas de una mesa 3D, rutas 404 en una 2D, ajustes guardados en
  `boards.settings`). La guía estaba validada contra `d68f41f`; `main` sólo añadía docs, así que
  ningún anclaje cambió y los datos de contrato del módulo siguen valiendo.
- **Por qué:** decisión del usuario: el 3D entra como segundo tipo de mesa, sin fusionar los proyectos.
- **Verificado:** `check` 100/100 (98 + 2), funciones 83,33 % (umbral 82; sin el test nuevo bajaba a
  82,05 %); el test se rompió a propósito (sin `setBoardSettings` y sin `tagBoards`: los dos en
  rojo) · `test:ui` 54/54 (igual que antes) · `test:ja-vtt` del módulo 20/20 contra el servidor
  local y 20/20 contra `docker compose` · compose: `t3d/001…006` tras las del núcleo sobre la
  base local existente, sus 4 tableros siguen 2D, `test:e2e` 11/11 · `T3D=off` en base nueva: sin
  esquema `t3d`, `/t3d/t3d.js` vacío 200, resto 404, sin selector ni etiquetas y sin errores de
  consola · expulsar a un jugador cierra su `/t3d/ws` (4403) y borrar el tablero deja `t3d` sin filas.
- **Revertir:** quitar las líneas `t3d` (`grep -n t3d Dockerfile server/app.js public/index.html
  public/js/*.js`; las sustituidas vuelven a su forma: `Net.connect(id);`, `boards: await
  q.boardsForUser(user.id)`, `await db.migrate()`, la comprobación `/ws` y la llamada a
  `onSocket`, `sendInitiative(b)` al final de `handleOps` y el `return` de `Weather`), borrar
  `modules/tablero3d` y `test/t3d.test.js`, y en la base `DROP SCHEMA t3d CASCADE`. Sin borrar
  datos basta `T3D=off`.

## 2026-09-25 — `main` pasa a ser la rama única; se retira el trabajo experimental

- **Qué:** borradas las ramas `clima-2d`, `modo-25d-fase-a` y `ui-panel` (local y GitHub; todo su trabajo 2D ya estaba en `release`) y el material experimental suelto de la carpeta. Después `main` se reescribió con `release` (`git push --force origin release:main`, lanzado por el usuario), Coolify pasó a `git_branch=main` por API (sin redeploy: mismo código) y `release` se borró en local y GitHub.
- **Por qué:** decisión del usuario: no se sigue esa línea; una sola rama estable; se queda `main` por ser la rama por defecto de GitHub.
- **Revertir:** no aplica (decisión deliberada). Coolify: `PATCH git_branch=release` si se recrea esa rama. Producción no cambió de código.

## 2026-09-21 — Despliegue de release @ be83c7e (panel, CA, línea en los muros)

- **Qué:** `ui-panel` → `release` (avance rápido) y `POST /api/v1/deploy` (deployment `syvxcebmeloabwf6nki0tegg`), 10 commits sobre `aa59e2b`. Antes: `test:ui` 54/54, `check` 98/98, pila local + `test:e2e` 11/11.
- **Verificado desde el servidor:** `finished` en `be83c7e`, `app`/`db` healthy, `/api/health` ok, JS servido con `acOn`/`upAsk`/`popRight`/`libSearch`; datos intactos (4 usuarios, 5 tableros, 440 objetos).
- **Revertir:** redeploy de `aa59e2b` en Coolify (o `git revert` en `release` + deploy). Sin migración.

## 2026-09-21 — Clase de armadura (CA) opcional en las fichas

- **Qué:** `token.ac` (0–99, opcional) saneado en `rules.js`; el dueño la edita (`playerUpsert`); `objectFor` la quita siempre de las fichas ajenas para los jugadores; interruptor de tablero `acEnabled` (true por defecto) en Mesa → Chat, dados y fichas; campo en el editor y en el Estado; escudo con el número en la esquina inferior izquierda de la ficha.
- **Por qué:** petición del usuario: la CA «opcional como el resto» (vida y condiciones).
- **Verificado:** tests de reglas y de tiempo real (rojos antes; mutación de `objectFor` detectada) · `test:ui` 54/54 con paso de CA · `check` 98/98.
- **Revertir:** `git revert` del commit; sin migración (la CA vive en `objects.data`).

## 2026-09-21 — Panel lateral: menús por encima, legibilidad, dados, iniciativa, biblioteca, subida y 5 pestañas (rama `ui-panel`)

- **Qué:** siete commits sobre `release`: (1) escala de capas `--z-panel < --z-pop < --z-toast < --z-modal` y `placePop` a la izquierda del panel (el editor quedaba 278/300 px tapado) + desplegables enteros; (2) cifras `lining-nums`, nombres repetidos numerados, fila que resalta su objeto en el mapa; (3) dados en rejilla, contador por dado, aviso en la bandeja e interruptor «Tirada oculta a los jugadores»; (4) iniciativa en rejilla 2×2, «Vaciar» con segundo clic en vez de `confirm()`; (5) biblioteca con buscador y desplegable; (6) subida en dos pasos con «¿Qué es?» y «Tablero» → «Mapa» para la imagen de fondo; (7) cinco pestañas (Escena, Luces, Fichas, Mesa, Chat).
- **Por qué:** revisión de interfaz del usuario; el editor abierto desde el panel era inusable desde que el panel es una capa (09fe180).
- **Verificado:** `test:ui` 53/53 con un paso por punto (cada uno rojo antes del cambio) · `check` 95/95.
- **Revertir:** `git revert` de los commits de `ui-panel`; sin migración ni cambios de servidor.

## 2026-09-21 — Luz: el ambiente exterior ya no se cuela como línea sobre los muros de una zona interior

- **Qué:** `buildLightMask` resta cada zona interior con relleno **y contorno** (2 px en pantalla). `release` `8b6d4b4`.
- **Por qué:** el borde antialias de la zona y el de la línea de visión coincidían sobre el muro y dejaban media franja de ambiente: una línea clara a lo largo de los muros vista desde dentro (alfa de la oscuridad 238 en vez de 255).
- **Verificado:** paso nuevo en `test:ui` (238 → 254) · `check` verde en las dos ramas.
- **Revertir:** `git revert 8b6d4b4`.

## 2026-09-21 — Producción pasa de `prod-2d` a `release`

- **Qué:** rama `release` creada desde `prod-2d` (`aa59e2b`) y subida; `PATCH git_branch=release` + deploy `b98xacyqucsqosqxa9ujxh5p` (commit `aa59e2b`, sólo docs respecto a lo desplegado).
- **Verificado desde el servidor:** `git_branch=release`, `running:healthy`, `/api/health` ok, JS servido con `noteVisibleToPlayers`.
- **Después:** el usuario dio por bueno el despliegue y `prod-2d` se borró en local y en GitHub (estaba contenida entera en `release`). Flujo de ramas en [04](04-convenciones.md) B.2.
- **Revertir:** `PATCH git_branch=<rama>` + deploy; `prod-2d` se puede recrear desde `aa59e2b`.

## 2026-09-19 — Despliegue de prod-2d @ 6a05644 (plan B: regla multitramo, anotaciones, P-27)

- **Qué:** push de `prod-2d` y `POST /api/v1/deploy` (deployment `94gpa6e5pmqgvdrj8iqeqbfg`), 10 commits sobre `d54cc6a`.
- **Verificado desde el servidor:** `app`/`db` healthy (los primeros ~30 s Traefik da 503 mientras arranca el healthcheck: normal), `GET /` 200, `/api/health` ok, JS servido con `rulerSegments`/`drawNotes`/`noteVisibleToPlayers`; datos intactos (4 usuarios, 5 tableros, 440 objetos).
- **Revertir:** redeploy del commit `d54cc6a` en Coolify (o `git revert` + deploy). Sin migración.

## 2026-09-19 — P-27: las notas publicadas se ven sólo donde el grupo ve

- **Qué:** `noteVisibleToPlayers` en `core.js` + salto en `drawNotes` de `render.js`. Una nota publicada sólo se pinta para el jugador si alguna de sus fichas con visión la alcanza a ver (luz o visión en la oscuridad, sin muro por medio). Tests: `frontend.test.js` (+1), `ui.mjs` (paso ciego + paso iluminado con ficha Vigía).
- **Por qué:** decisión del usuario (P-27); evitaba leer notas en zonas a oscuras o sin explorar.
- **Revertir:** `git revert` del commit.

## 2026-09-19 — Regla multitramo y anotaciones (plan B; P-22, P-23)

- **Qué:** `rulerSegments` + `UI.act.pts` (Espacio / clic derecho); tipo `note` con `gmOnly`, herramienta N, capa `notes`, render con pin. Sin migración. Tests: `frontend.test.js` (+4), `rules.test.js` (+1), `realtime.test.js` (+1), `ui.mjs` (+5 pasos).
- **Por qué:** spec `2026-09-19-condiciones-srd-y-tactica-design.md` §4–5.
- **Revertir:** `git revert` de los commits `feat(regla)…` y `feat(notas)…`/`feat(rules): tipo note…` de esta fecha. Notas ya guardadas quedan en `objects` con `type='note'`: `sanitize` las descarta si el tipo no existe, no rompen nada.

## 2026-09-19 — Despliegue de prod-2d @ d54cc6a (plan A + interruptores)

- **Qué:** push de `prod-2d` y `POST /api/v1/deploy` (deployment `w6xppwptjnfoxc53i3jkegm7`), 17 commits sobre `5252403`.
- **Verificado desde el servidor:** `app`/`db` healthy, `GET /` 200, `/api/health` ok, JS servido con `drawTokenStatus`/`openStatus`/`conditionsEnabled`; datos intactos (4 usuarios, 5 tableros, 440 objetos).
- **Revertir:** en Coolify, redeploy del commit `5252403` (o `git revert` en `prod-2d` + deploy). Sin migración: la base no cambia.

## 2026-09-19 — Interruptores de vida y condiciones por tablero

- **Qué:** ajustes de tablero `hpEnabled` y `conditionsEnabled` (booleanos en `DEFAULT_BOARD`, `true` por defecto).
  Checkboxes en Ajustes → Chat, dados y fichas; helpers `hpOn()` y `condsOn()` en el cliente. Si se apagan,
  se ocultan barra de vida, badges de condiciones, pastilla de elevación y el popover Estado (o sus secciones)
  sin borrar los datos de las fichas. Deshabilita el selector de visibilidad de vida si la vida está apagada.
- **Por qué:** el usuario lleva vida y efectos en otro sistema (hoja externa, papel o app) y no quiere verlos en el tablero.
- **Revertir:** `git revert` del commit.

## 2026-09-19 — Fichas: condiciones SRD, vida y altura (plan A; P-19, P-20, P-21)

- **Qué:** `token.conditions`, `token.hp {cur,max,temp}`, `token.elevation`; ajuste de tablero `hpVisibility`;
  proyección `objectFor` en el servidor; popover «Estado», badges, barra y etiqueta en el cliente. Sin migración
  (jsonb). Tests: `rules.test.js` (+4), `realtime.test.js` (+1), `frontend.test.js` (+3), `ui.mjs` (+5 pasos).
- **Por qué:** spec `2026-09-19-condiciones-srd-y-tactica-design.md` §1–3.
- **Revertir:** `git revert` de los commits `feat(rules)…`, `feat(ws)…`, `feat(cliente)…`, `feat(render)…`,
  `feat(ui)…` y `test(ui)…` de esta fecha. Los campos que queden en `objects.data` son inofensivos: `sanitize`
  los ignora si no los conoce.

## 2026-09-19 — P-04 a N2 y limpieza de pendientes

- **Qué:** `npm test` mide cobertura de `server/**` y falla bajo 78/72/82 (líneas/ramas/funciones). `06` reescrito: tabla unificada, P-05 cerrado (ya estaba implementado), P-19…P-24 con sus planes.
- **Por qué:** P-04 pedía N2; la tabla de 06 estaba partida por un párrafo y P-05 llevaba hecho sin cerrarse.
- **Revertir:** `git revert` de los dos commits; el script `test` anterior era `node --test --test-concurrency=1 "test/*.test.js"`.

## 2026-09-16 — Ajustes de chat/dados para todos, tiradas privadas, dados rediseñados, favicon

**Qué** — `diceEnabled` junto a `chatEnabled`, ambos en la pestaña Ajustes y apagan la función
para todo el mundo (la pestaña Chat desaparece si no queda nada). Tirada privada del director
(candado / `/rs`): sólo a sus pantallas, sin guardar. Dados: rótulos colocados por la geometría
real de cada cara (centro y radio inscrito; en el d4 un número por vértice), acabado con degradado
del color del jugador, filigrana dorada y número marfil con borde. Iniciativa: editor rehecho
(cabecera con ronda y turno, filas con marcador, herramientas agrupadas) y barra con colores
fijos (no dependía del tema y salía ilegible en tema claro). Favicon SVG propio (d20) en vez de emoji.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Recuperación de contraseña, chat, dados 3D e iniciativa

**Qué** — spec en `superpowers/specs/2026-09-16-chat-dados-iniciativa-recuperacion-design.md`.
Servidor: migración 002 (`users.recovery_code`, `chat_messages`), `server/dice.js`, rutas
`/api/recover`, `/api/me/recovery`, `/api/me/password`, mensajes WS `chat`/`roll`/`initiative`,
ajustes `chatEnabled` e `initiativeShown`. Cliente: pestaña Chat con botonera de dados y `/r`,
capa de dados 3D (`dice3d.js`, three.js + cannon-es; el servidor decide el resultado y el cliente
rotula las caras para que la que cae arriba lo muestre), barra de iniciativa sobre el mapa con
editor en Mesa, Perfil con código de recuperación y cambio de contraseña, «¿Olvidaste la
contraseña?» en la entrada. Prueba visual con Playwright + Edge (`npm run test:ui`, 14/14).
**Por qué** — pedido del usuario; comparación con otros VTT.
**Revertir** — `git revert` de los commits del 2026-09-16 (server y cliente); la migración 002 es
aditiva y puede quedarse.

## 2026-09-16 — Producción en https://tablero.supportive.pro

**Qué** — repo privado `JorgeForero02/JA-VTT`; app Coolify `ja-vtt` (uuid
`d6qlm5kzdoitlacr5br29fna`, proyecto D&D) desde `docker-compose.yml`, dominio
`tablero.supportive.pro` (antes PlanarAlly, borrado por el usuario; quedan sus tres volúmenes
`aloj51hvldbfcmvbxfkumfpq_planarally-*` sin uso). Detalle en [03](03-despliegue.md).
**Por qué** — pedido del usuario tras aprobar la prueba local.
**Evidencia** — 200 y certificado desde dentro; e2e 10/10 por WSS; restart por API sin perder
filas (3 usuarios, 2 tableros, 75 objetos). Cuentas `gm-mu3ck9p7`/`pl-mu3ck9p7` del e2e quedan
en la base (borrado remoto bloqueado por el clasificador); borrar con
`DELETE FROM users WHERE name IN ('gm-mu3ck9p7','pl-mu3ck9p7')`.
**Revertir** — `DELETE /api/v1/applications/d6qlm5kzdoitlacr5br29fna` (con volúmenes si se quiere
borrar la base) y quitar la deploy key del repo.

## 2026-09-15 — Nace Just Another VTT a partir de Mini VTT

**Qué**
- Repo git nuevo (`main`); commit inicial con el código original como línea base.
- Renombrado completo: paquete, UI, cookie (`jav_session`), localStorage (`jav.*`).
- SQLite → **PostgreSQL** (`pg`), migraciones SQL, todas las consultas asíncronas.
- **Login con contraseña** (scrypt); registro abierto; añadir miembro por nombre exige cuenta.
- `app.js` reescrito asíncrono: cola por tablero, cerrojo de volcado, cierre ordenado.
- Dockerfile + `docker-compose.yml` (Coolify) + override local; `.env.example`.
- Tests: 32 con `node:test` (db, auth, API, tiempo real, frontend) + e2e de 11 pasos.
- Docs 00–07, `CLAUDE.md`, `AGENTS.md`, README actualizado. Se retiran `iniciar.bat/sh`.

**Por qué** — el usuario quiere desplegarlo en vps1new con persistencia fiable y un login
mínimo; SQLite en un volumen y cuentas sin contraseña no servían.

**Cómo revertir** — el commit `chore: import Mini VTT source as baseline` es el original
funcional con SQLite. No hay migración de datos entre ambos (la base pg nace vacía).

**Evidencia** — `npm run check` 32/32 · `npm run test:e2e` 11/11 con `docker compose restart app`
· `down`+`up` conserva 2 usuarios, 1 tablero, 1 objeto.

## 2026-09-15 — Botón en la cabecera para ocultar el panel derecho

**Qué** — `#panelToggle` pasa a verse siempre. En pantallas anchas pliega la columna del
panel (`#app.noPanel`) y guarda la preferencia en `localStorage` (`jav.panel`); en
estrechas sigue abriendo el panel como capa. Iconos Lucide `panel-right-open/close`.
**Por qué** — pedido del usuario: más espacio de mapa en escritorio.
**Revertir** — `git revert` del commit `feat(ui): botón para ocultar el panel lateral`.

## 2026-09-16 — Cursores suaves y guardas contra el doble clic

**Qué** — los cursores de los demás se interpolan 110 ms hacia su posición nueva (misma
técnica que las fichas, `cursorPos` en `net.js`) y se envían cada ~50 ms. `withBusy()`
(`store.js`) desactiva los botones de un formulario mientras dura la petición: entrar / crear
cuenta, crear tablero, unirse por código, añadir miembro, regenerar código; crear escena lleva
un cerrojo de 1,5 s. Sin tests nuevos por decisión del usuario (cambios visuales).
**Revertir** — `git revert` del commit.

## 2026-09-16 — Test de viaje por portal; HTTP/3 desactivado en el Traefik de vps1new

**Qué** — `test/portal.test.js` reproduce el viaje de un jugador por un portal (ficha con luz,
escena nueva, director en origen, base, reconexión): verde. HTTP/3 quitado del proxy de Coolify
por los errores `ERR_QUIC_PROTOCOL_ERROR`/`ERR_SSL_PROTOCOL_ERROR` en el navegador del usuario
(Norton). El reinicio a mano del proxy dejó ~10 min sin servicio a las apps compose; detalle y
regla nueva en `vps1new:/root/docs/07` y `/05`.

## 2026-09-16 — Modelo de visión: sin tope de alcance, visión en la oscuridad absoluta

**Qué** — se retira «Alcance máximo» (`sight`) del editor y del render: era un tope duro que
dejaba en negro todo lo que quedara más allá, incluidas luces de la escena y la antorcha propia
(así estaban las fichas del usuario, a 10–20 ft). La visión en la oscuridad pasa a ser absoluta
dentro de su radio (antes iluminaba al 55–62 %); las luces sólo aportan lo que sobresale. Lo
iluminado que se ve queda explorado de lleno en la niebla (`EXP.boost`), aunque la luz sea tenue.
El campo `sight` sigue aceptándose en el servidor y se ignora.
**Por qué** — pedido del usuario tras confundirle el tope en producción.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Orientar la linterna sorda de una ficha

**Qué** — con la ficha seleccionada aparece la línea del cono y un tirador en su extremo;
arrastrarlo gira la luz (pasos de 15°, Alt = libre). Lo puede usar el director y el dueño de la
ficha. El jugador ve además el campo «Dirección (°)» en el editor de su ficha si la luz es un
cono. Antes sólo el director podía cambiar la dirección, y sólo a mano desde el editor.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Giro de la linterna: fino y con tres tiradores

Giro de 1° por defecto (Alt = pasos de 15°) y tres puntos de agarre sobre la línea del cono
(junto a la ficha, a media luz, en el extremo) para no tener que alejar el zoom.

## 2026-09-16 — Fix: la ficha «saltaba atrás» al arrastrar o girar la luz (jsonb reordena claves)

**Qué** — `jsonb` devuelve los objetos con las claves en otro orden. El servidor comparaba el
resultado del cambio del jugador con lo recibido por `JSON.stringify` textual → siempre
«distinto» → mandaba una corrección (`fix`) en cada envío con datos de 80 ms antes → la ficha o
la linterna retrocedían un instante. Ahora compara con claves ordenadas (`rules.sameObject`), y
el cliente ignora correcciones sobre el objeto que está arrastrando (reenvía lo suyo).
**Regresión de la migración a PostgreSQL** (con SQLite el texto conservaba el orden). Tests:
`test/rules.test.js` y caso en `test/realtime.test.js` que recarga el tablero de la base.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Niebla explorada sin dientes de sierra

Memoria de exploración al 20 % (antes 12 %; 160 bloques máx. en vez de 260 para no subir el
consumo) y desenfoque leve (`EXP.blur`) al pintarla. Los tiles guardados con la resolución
vieja se escalan al cargar.

## 2026-09-16 — Tipo de muro «Maleza»

**Qué** — nuevo `kind: 'cover'`: no bloquea vista del fondo, ni luz, ni paso; pero para los
jugadores esconde las fichas (no propias) y los objetos que queden detrás. Se implementa como un
tercer tipo de línea de visión `'hide'` (muros que tapan la vista + maleza) usado sólo por
`visibleToPlayers` y `propVisibleToPlayers`. Aparece en la barra de muros, leyenda, editor y
menú «Convertir en…» automáticamente (catálogo `WALL_TYPES`). Servidor: `WALL_KINDS` lo acepta.
**Revertir** — `git revert` del commit; los muros ya guardados como `cover` pasarían a `wall`.

## 2026-09-16 — Editar articulaciones de muros siempre

Los extremos de muro se arrastran con cualquier número de muros seleccionados (antes sólo con
≤ 8, así que una sala o un círculo no se podía retocar) y también con la herramienta de muros
activa: pinchar una articulación existente la mueve en vez de empezar un tramo; los tramos que
comparten ese punto se mueven juntos. Con la herramienta activa, los puntos se pintan grandes.

## 2026-09-16 — Producción: chat, dados, iniciativa y recuperación desplegados (cfaa9dc)

Migración 002 aplicada en vps1new al arrancar; e2e 10/10 por WSS. Las cuentas existentes reciben
su código de recuperación al entrar o al abrir Perfil.

## 2026-09-16 — Sin plantillas; licencias en orden

**Qué** — se retiran las plantillas Granja y Herbolario: `templates.js`, `public/muestras`,
selectores y botones, `seedSamples`; migración 003 borra las 6 imágenes de muestra de la base
(las fichas que las usaban quedan sin retrato). Se añaden `LICENSE` (MIT, coherente con
`package.json`) y `THIRD-PARTY-LICENSES.md` con el inventario de terceros y sus avisos.
**Por qué** — pedido del usuario; el mapa del Herbolario era de procedencia no documentada.
**Revertir** — `git revert`; las imágenes borradas por la migración no vuelven (no había copia).

## 2026-09-16 — Luces más suaves

La luz de una ficha y las luces sueltas usan la posición interpolada (`displayPos`), así se
deslizan con la ficha en vez de saltar; las luces que mueve otro también se interpolan (120 ms).
El parpadeo se redibuja a 30 fps (antes 24) y pierde el componente rápido que temblaba.

## 2026-09-16 — Movimiento remoto continuo

Sustituye la interpolación fija de 120 ms (se paraba entre paquetes → tirones) por una
persecución exponencial continua (`chase`, τ = 70 ms) para fichas, luces y cursores; los envíos
de cambios pasan de 80 a 40 ms y los de cursor de 50 a 33 ms; la animación se redibuja a 60 fps
mientras haya algo moviéndose. Más CPU en el cliente sólo durante el movimiento; el servidor no
cambia (reenvía lo que llega).

## 2026-09-16 — Animación de luces: sólo se redibujan las capas de luz

Los fotogramas de animación (parpadeo, pulso) ya no repintan mapa, cuadrícula, fichas, línea de
visión ni controles: sólo máscara de luz, brillo y oscuridad. Elimina los tiempos irregulares por
frame que se veían como tirones en la luz de pulso.

## 2026-09-16 — Luz sin borde duro; pulso más suave

La máscara de luz pasaba de brillante a tenue en un 4 % del radio (anillo duro) y el pulso
movía ese anillo ±5 % con la intensidad bajando al 72 %: se veía a saltos aunque los fps fueran
estables (comprobado con capturas consecutivas en Edge headless). Ahora la transición ocupa del
−10 % al +14 % del radio brillante y el pulso es ±3 % de radio e intensidad 80–100 %.

## 2026-09-16 — Fotograma de luz 3,5× más barato

Medido en Edge headless a 1920×1080 con escala 2: 58 ms por fotograma animado (dos composiciones
`destination-out` a pantalla completa a 3064×2052 px) → 16 ms. Dos cambios: las capas de luz
(máscara, visión, exploración, brillo, oscuridad) se dibujan a escala 1 y el navegador las
amplía (son degradados, no se nota); la niebla explorada desenfocada se compone sólo en los
fotogramas completos y los de animación reutilizan la imagen. Mapa, fichas y controles siguen a
la escala nativa. Guion de medida: ver `05-runbook` (perfilado).

## 2026-09-16 — Pulso sin escalones

El pulso variaba la intensidad de la máscara de oscuridad (alfa) despacio y para todo el disco a
la vez: con alfa de 8 bits eso se ve como escalones de 1/255 sincronizados. Ahora el pulso respira
en radio (±4,5 %) y en el tinte de color del brillo (82–100 %), y deja la máscara quieta. El
parpadeo no lo sufría por ser rápido y ruidoso.

## 2026-09-16 — Pulso sólo espacial; bandeja de dados

Pulso: respira el radio (±5 %) y la proporción brillante/tenue (±12 %), sin tocar ningún alfa
global (ni máscara ni tinte). Dados: la botonera llena una **bandeja** (clic = +1, Mayús ×2,
Ctrl ×3); se tira con «Tirar», Enter o sola a los 2,5 s; la fórmula acepta términos separados
por espacio (`2d8 1d4 +2`). Menos brillo especular en los dados 3D.

## 2026-09-16 — Fix: exportar escena fallaba (`usedImageIds is not defined`)

Fallo heredado del Mini VTT original: la función nunca existió. Definida (imágenes usadas por
tableros/objetos y fichas). Probado en Edge headless: el .json exportado incluye muros, fichas y
la imagen en base64.

## 2026-09-16 — Render adaptativo y lectura de rendimiento

El cliente mide cuánto tarda cada fotograma de luz. Si supera el 75 % del intervalo de pantalla
durante 12 fotogramas, baja las capas de luz a 0,5× y la animación a la mitad de la frecuencia
de pantalla (cadencia regular). Si sobra margen durante 4 s, vuelve a 1×. Mesa → Conexión muestra
«Render de luz: N ms por fotograma (pantalla X Hz), capas de luz a S×» para diagnosticar en el
navegador del usuario.

## 2026-09-16 — Fix: la animación de luz iba a ~9 fps (realimentación de la cadencia)

La cadencia adaptativa medía el intervalo entre fotogramas *animados* y lo usaba como umbral
para animar el siguiente: se realimentaba y bajaba hasta ~110 ms (el usuario midió «pantalla 9
Hz», render 0,2 ms). Ahora la frecuencia de pantalla se mide con todos los fotogramas del bucle
y la animación va cada frame (o uno de cada dos, contado, en calidad reducida). Medido en Edge:
59,5 fotogramas animados/s con intervalo 16,7 ms constante.

## 2026-09-16 — Fix urgente: `hexA is not defined` (brillo de luces roto en producción ~15 min)

El parche de la cadencia borró `hexA` al reemplazar el bloque del bucle. Restaurada; test de
contrato nuevo que comprueba que toda función usada en `render.js` está definida. Lección: para
cambios de cliente, `npm run test:ui` antes de desplegar, no sólo `npm run check`.

## 2026-09-16 — Dithering en la máscara de luz

Con cadencia y coste ya correctos (60 Hz, 0,2 ms medidos por el usuario), lo que quedaba del
pulso era banding: 255 niveles de alfa en un degradado grande dan anillos de ~3 px que reptan al
cambiar el radio. Se suma un patrón fijo de ruido de ±1 nivel a la máscara (`dither`), que rompe
los anillos sin grano visible. Pulso algo más contenido (±3,5 % radio, ±10 % núcleo).

## 2026-09-16 (noche) — Fix: niebla granulada por el dithering

El ruido se sumaba a la máscara de luz, y la memoria de exploración acumula esa máscara frame a
frame: los píxeles de ruido se «exploraban» solos y la niebla salía con manchas. Ahora el ruido se
aplica sólo a la capa de oscuridad final (no se acumula). Migración 004 borra la niebla guardada
(un día de exploración, contaminada). Los jugadores vuelven a explorar desde cero.
