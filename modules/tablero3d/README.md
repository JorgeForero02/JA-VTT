# Módulo `tablero3d` — referencia técnica

Estado al 2026-09-26 (cierre de la ronda T1–T7). El tablero de rol en pixel art 3D como **módulo
montable**: servidor (API `/api/t3d/`, mesa en vivo, reglas y SQL en el esquema PostgreSQL `t3d`) y
cliente (`Tablero3D.mount`, servido en `/t3d/`). Vive en el repositorio Tablero pixel y se copia tal
cual dentro de un anfitrión con el núcleo de Just Another VTT (JA-VTT, rama `release`).

Este archivo es la documentación propia del módulo y viaja con la carpeta: sólo enlaza dentro de
`modules/tablero3d/`. Lo que el anfitrión tiene que añadir (líneas exactas, verificación, reversión)
está en el repositorio Tablero pixel, `docs/08-integracion-ja-vtt.md`; el comportamiento visible y la
API, en su `docs/02-funcional.md`.

## Índice

- [Contenido de la carpeta](#contenido-de-la-carpeta)
- [Interfaz con el anfitrión](#interfaz-con-el-anfitrión-createtablero3dhost)
- [Mesa en vivo en el servidor](#mesa-en-vivo-en-el-servidor)
- [Datos: esquema `t3d`](#datos-esquema-t3d)
- [Formato de los documentos](#formato-de-los-documentos)
- [Cliente: `Tablero3D.mount`](#cliente-tablero3dmountroot-opts)
- [Aislamiento: prefijo `t3d-`](#aislamiento-prefijo-t3d-)
- [Motor 3D](#motor-3d) (luz y niebla, ambiente, fichas, techos, muros y portales, armonía con JA-VTT)
- [Contratos con JA-VTT](#contratos-con-ja-vtt)

## Contenido de la carpeta

| Archivo | Qué hace |
|---|---|
| [`index.js`](index.js) | `createTablero3D(host)`: API `/api/t3d/`, estáticos `/t3d/`, conexión `/t3d/ws`, mesa en vivo en memoria (JSDoc completo en el archivo) |
| [`rules.js`](rules.js) | Saneado de escenas, campañas, dibujos y mesa; permisos del jugador; privacidad por rol (`liveDocFor`) |
| [`dice.js`](dice.js) | Dados con la notación y el cuerpo de tirada de JA-VTT (el servidor tira) |
| [`db.js`](db.js) | TODAS las consultas del módulo (esquema `t3d`) y sus migraciones |
| `migrations/NNN-*.sql` | Esquema `t3d`, control en `t3d.schema_migrations` |
| `public/` | Cliente del módulo, servido en `/t3d/` (tabla en [Cliente](#cliente-tablero3dmountroot-opts)) |

Regla: **nadie fuera de `db.js` escribe SQL del módulo**. Se llama a `q.<consulta>()` o a
`tx(async (t) => …)`; `t` tiene las mismas consultas dentro de una transacción. Sin dependencias
propias: usa el `pg` del anfitrión y el `ws.js` del anfitrión (RFC 6455, idéntico en JA-VTT y en
Tablero pixel).

## Interfaz con el anfitrión: `createTablero3D(host)`

JSDoc completo en [`index.js`](index.js). El anfitrión da:

- `pool` — su `pg.Pool`, que ya convierte BIGINT a Number.
- `memberRole(boardId, userId)` → `'gm' | 'player' | null`.
- `postChat(boardId, user, kind, body)` — `user` = `{ id, name, color }`; las tiradas van a su
  `chat_messages` con kind `roll` y el cuerpo de JA-VTT `{ formula, dice, mod, total, label? }`.
- Opcionales: `touchBoard(boardId)`; `enabled` (`false` = módulo apagado: no migra, rutas 404,
  `t3d.js` vacío); `allBoards3D` (`true` sólo en un anfitrión en el que todo tablero es 3D, como
  Tablero pixel: `migrate()` marca como 3D los tableros que haya, en cada arranque).
- Opcionales, **juntos** (T8): `boardSettings(boardId)` → objeto y `setBoardSettings(boardId, patch)`. Con
  ellos los ajustes del tablero con clave de JA-VTT (`HOST_SETTINGS` de `rules.js`: su `BOARD_KEYS` salvo
  `initiative`) son **los del anfitrión**, la única fuente: el módulo los lee con `boardSettings` (JA-VTT:
  `b.settings` en memoria o, sin abrir, `boards.settings` con `DEFAULT_BOARD`) y los sanea con
  `cleanSettings`; cuando el director los cambia en el 3D, manda al anfitrión con `setBoardSettings` esas
  claves ya saneadas (el anfitrión las guarda y avisa a sus clientes) y en `t3d.boards.settings` guarda sólo
  las claves propias del 3D (hoy ninguna; `settingsParts`). Sin ellos (suelto, como Tablero pixel) todo va
  en `t3d.boards.settings`. `initiative` no se comparte: la del 3D es el documento `combat`.

El módulo devuelve:

| Miembro | Qué hace |
|---|---|
| `name`, `publicDir` | `'t3d'` y la carpeta del cliente |
| `migrate()` | sus migraciones; después de las del anfitrión |
| `serve(req, res, url)` | sus estáticos bajo `/t3d/` |
| `api(req, res, url, user, parts)` | rutas `/api/t3d/…` (`parts[0] === 't3d'`); lee su propio cuerpo JSON con el límite de cada ruta (`BODY_LIMITS` de `rules.js`: el documento más grande que acepta + 64 KB; ajustes 64 KB; dibujo 42,7 MB); más grande, 413 en castellano sin leer el resto |
| `settingsChanged(boardId)` | el anfitrión con `boardSettings` avisa de que cambió sus ajustes por su cuenta (JA-VTT: desde su pestaña Mesa, `handleOps`): la mesa abierta los relee y, si cambian, reparte `settings` y las vistas que dependen de ellos. Además los relee antes de cada `live`, `roll`, `travel` y `gather`, y al entrar alguien |
| `socket(ws, user, boardId)` | su conexión propia `/t3d/ws`, con cola por tablero y latido |
| `kick(boardId, uid)` | cierra las conexiones de quien sale o es expulsado |
| `onBoardDeleted(id)` | cierra sus conexiones y olvida la mesa |
| `markBoard(id)` | el servidor del anfitrión marca 3D un tablero que acaba de crear (sin permisos ni plazo) |
| `tagBoards(boards)` | sólo añade `t3d: true` a las mesas 3D (lo que usa JA-VTT) |
| `describeBoards(boards)` | `tagBoards` + `scenes`, para un anfitrión sin escenas propias |
| `flushAll()`, `isLoaded(id)`, `close()` | volcado, consulta y cierre de la mesa en vivo (vuelca con su propio temporizador) |
| `join(conn)`, `ws(conn, msg)`, `leave(conn)` | para un anfitrión que reparta la mesa por su propio WebSocket: `join` da los campos extra del `state` (`peer`, `peers`, `live`, `settings`); `ws` atiende `live`, `emit`, `presence`, `roll`, `travel`, `gather`; `conn` = `{ ws, user, role, board: { id } }`, por la cola del tablero |

**Tipo de mesa**: un tablero es 3D si tiene fila en `t3d.boards`; se elige al crear el tablero y es
fijo (no hay ruta ni consulta que la quite: se va sólo con el tablero, en cascada; el `POST` que la
pone sólo vale 10 minutos tras `boards.created_at`). En un tablero 2D las rutas del 3D responden 404
«Este tablero no es una mesa 3D», `/t3d/ws` cierra con 4404 y `join` devuelve `{}` sin meterlo en la
mesa.

Dos formas de llevar la mesa en vivo, que comparten la misma mesa en memoria:

- **Por el WebSocket del anfitrión** (Tablero pixel): `/ws` → `join`/`ws`/`leave`; el cliente monta
  con `net: Net`.
- **Conexión propia** (JA-VTT, cuyo `Net` no reparte mensajes a módulos): `/t3d/ws` →
  `socket`; el cliente monta sin `net`.

## Mesa en vivo en el servidor

- La mesa en vivo de cada tablero (documentos, pares y presencia) vive en un Map del módulo. Cada
  mensaje entra en la **cola por tablero**; los cambios se vuelcan con su temporizador.
- **Privacidad por conexión** (`rules.liveDocFor`): `broadcastDoc` manda cada documento de la mesa a
  cada conexión con su vista (`tokensFor`, `sceneFor`, `combatFor`; una vez por usuario y rol),
  también en el `state` de `join` (`viewFor`), al cruzar portales y al cambiar los ajustes (se
  reenvían `tokens` y `combat` a los jugadores) o las fichas (se reenvía `combat`). Las escenas y
  campañas que un jugador lee por REST van igual de filtradas (`sceneFor`, `campaignFor`). Nada del
  módulo manda un documento con `broadcast` sin filtrar.
- El servidor valida cada cambio (`rules.liveChange`): el director cambia todo; un jugador sólo
  mueve y edita sus propios personajes (`owner` = su id), pone y quita sus planos, pasa el turno o
  gasta el movimiento de una ficha suya en su turno (`playerCombat`), y abre o cierra puertas:
  puertas de la escena de la mesa (`live/board`), sin llave (`locked`) y si el tablero lo deja
  (`playersDoors`, en memoria en la mesa y guardado en `t3d.boards.settings` o, integrado, en los del
  anfitrión). Lo demás recibe un
  `ack` con error y no se reparte.
- **Portales** (T6b): mensajes `travel` (`portal`, `tokens`, `all`) y `gather` (`scene`), con `ack`
  (`moved`, `left`, o `asked` si lo pide un jugador). El director: el servidor mueve las fichas
  (`travelPlan`), guarda la escena de origen (con quien se queda) y la de destino en una transacción
  y reparte `live/board` (con `scene`) y `live/tokens` de la escena nueva. El jugador: sólo con su
  ficha, junto al portal; el servidor avisa a los directores (`msg` `travelAsk`). Al borrar una
  escena, sus portales de llegada se quedan sin destino en las escenas guardadas (sin tocar su
  `updated_at`) y en la mesa abierta.
- **Ajustes**: al cambiarlos (`PATCH …/settings`) llega `settings` a la mesa; también va en el `state`.
  Integrado (`boardSettings`), también cuando cambian en el anfitrión: con `settingsChanged` al momento y,
  sin aviso, antes de la siguiente tirada, cambio de la mesa o cruce (`syncSettings`: nunca se decide con
  unos viejos).
- **Tiradas** (T6d): mensaje `roll` (`formula`, `label`, `adv`): el servidor tira (`dice.js`), manda a
  todos `msg` `roll` con el cuerpo y lo guarda con `host.postChat` (kind `roll`); con `diceEnabled`
  apagado responde error. El `emit` de los temas `roll` y `travelAsk` lo rechaza el servidor (sólo
  los manda él).
- **Escena por jugador** (`board_members.scene_id`): no se implementa. La mesa en vivo es un solo
  `live/board`; escenas por jugador exigen una mesa por escena (documentos, niebla y fichas por
  escena), filtrar cada mensaje por escena y rehacer portales, reunir y la UI de «llevar» (en JA-VTT
  es su modelo base). Queda en la hoja de ruta (R15).

## Datos: esquema `t3d`

Referencias a `public.boards(id)` y `public.users(id)` con `ON DELETE CASCADE`: borrar un tablero o
un usuario en el anfitrión borra lo suyo del 3D.

- `boards` — tipo de mesa: `board_id` PK → `public.boards` en cascada, `created_at` y `settings`
  jsonb (suelto: los ajustes del tablero 3D con las claves de JA-VTT, todas las de su `BOARD_KEYS` salvo
  `initiative`, `{}` = los valores por defecto de JA-VTT; integrado con `boardSettings`, sólo las claves
  propias del 3D, hoy ninguna). Fila = mesa 3D.
- `scenes` — mapa 3D serializado en `data` jsonb (ver [Formato](#formato-de-los-documentos));
  `width` y `depth` 4–160; id generado en el cliente, único por tablero; `size`, bytes del JSON guardado
  (migración 006).
- `campaigns` — `data` jsonb: escenas de la campaña y notas del director; `size` como en `scenes`.
- `drawings` — metadatos del dibujo; `key` es la clave del arte que sustituye o añade (p. ej.
  `g:top`) y el id es esa clave saneada (`g_top`); `light_spec` jsonb dice dónde alumbra un objeto
  (píxel, rebanada, radio, color y parpadeo); `char_size`, el tamaño del arte de un personaje (NULL =
  Mediano) → `drawing_layers` (una hoja PNG por capa en `bytea`, con `opacity` 0–100 y `locked`).
- `live_docs` — mesa en vivo: `board`, `tokens`, `combat` (la iniciativa de JA-VTT), `doors`, `plans`
  (los planos de los jugadores). Documento nuevo = `LIVE_KEYS` de `rules.js` + el `CHECK` de la tabla
  (migración nueva) + el `DB.doc('live/…')` del motor.
- `schema_migrations` — control propio; cerrojo `pg_advisory_lock` 7318206 (el del núcleo de JA-VTT
  es 7318204). El módulo nunca escribe en el control de migraciones del anfitrión.

Migraciones (`migrations/NNN-nombre.sql`, siempre con `t3d.` delante de cada tabla y con
`IF NOT EXISTS`, porque la misma migración tiene que valer en una base de JA-VTT): se aplican solas al
arrancar, después de las del anfitrión, y nunca se edita una ya aplicada en un despliegue. Cuota por
tablero: 500 MB (dibujos + escenas + campañas), aparte de la de imágenes del anfitrión, con una sola
medida: la suma de `size`, que `db.js` pone al escribir —bytes UTF-8 del mismo JSON que manda a Postgres
para escenas y campañas, bytes de las capas PNG (sin base64) para los dibujos—; al sustituir un documento
cuenta su tamaño nuevo y no el viejo (`boardUsage(boardId, except)`). Lo guardado antes de 006 lo mide
`migrate()` al arrancar. La mesa en vivo (`live_docs`) no cuenta. Tiempos en milisegundos desde época
(BIGINT).

## Formato de los documentos

Lo que guarda cada documento del módulo. Cliente y servidor sanean igual (un test compara cada par).

### Escena (`t3d.scenes.data`)

Un documento jsonb con el mapa entero (alturas y terreno en cadenas de `w×d` caracteres). Campos:

- **Ambiente** (T6c, los de la escena de JA-VTT): `env` (`interior`, `day`, `dusk`, `night`),
  `ambient` 0–1 y `darkColor` `#RRGGBB`. Una escena de antes con `night: true` abre de noche; sin
  él, de día (`Ambiente.norm` = `cleanEnv` del servidor).
- **Zonas interiores**: `zoneCells`, una letra por casilla (`0` automática —sólo la del techo o
  ninguna—, `1` interior, `2` al aire libre aunque haya techo); sólo se guarda si el director pinta
  algo. Una escena sin `zoneCells` sólo tiene las zonas de sus techos.
- **Luces sueltas** (`type:'light'`), con los nombres de JA-VTT: `preset` (uno de los 12 tipos de
  `LIGHT_PRESETS` o `custom`), `color`, `intensity` 0–1,2, `anim` (`none|flicker|soft|pulse`), `angle`
  1–360 y `rot` en grados (cono; 0 = este, 90 = sur), `darkness`, `on` y `name` (≤ 40), más las del
  3D: radio `r` 1–24 casillas y altura `h` 0–4. Las de antes (`r`, `h`, `c`, `f`) se leen igual
  (`c` → `color`, `f:0` → `anim:'none'`, si no `flicker`; tipo `custom`): `normLight` (cliente) =
  `cleanLightProp` (servidor).
- **Techos** (`roofs[]`, hasta 300): rectángulo `{x, z, w, d}` de al menos 2×2 dentro del mapa, con
  `mat` (`tile` teja roja, `slate` pizarra, `thatch` paja, `shingle` tablillas, `copper` cobre con
  verdín), `shape` (`gable` a dos aguas, `hip` a cuatro aguas, `flat` plano con almenas —sin
  material—, `cone` cónico, `shed` a un agua) y, opcional, `rot` 0–3: sin él la cumbrera va a lo
  largo del lado largo; con él, par = este–oeste e impar = norte–sur (en el de un agua, 0 cae al sur,
  1 al este, 2 al norte y 3 al oeste). Un techo de antes (sólo `x, z, w, d`) es de teja a dos aguas;
  lo que no es válido se descarta (`normRoof` = `cleanRoof`). La base del techo es la cima de sus
  muros; sin muros (un cobertizo sobre postes), el suelo más alto + 4 pasos.
- **Objetos** (`props[]`): `type`, `x`, `z`, `v` (0–3: giro de 90° en 90°) y, las puertas, `open` y,
  si la tiene, `locked: true`. Los de varias casillas ocupan desde su esquina `(x, z)` un rectángulo
  que se gira con `v`.
- **Muros por casilla**: `wall` = la casilla de terreno `'w'`; `door` = los objetos puerta (`door`,
  `gate`) con `open` y `locked`; `window`, `veil`, `cover`, `barrier` y `portal` = objetos del mismo
  nombre en `props` (`Muros.normProp` = `cleanWallProp`). Una escena de antes se guarda igual (ningún
  campo nuevo en lo que ya había; `locked` sólo si es `true`).
- **Portales** (`type: 'portal'`): `id` (entero, único en la escena), `look` (`door`, `stairs`,
  `cave`, `trapdoor`, `magic`), `name` (≤ 40) y `target: { scene, portal }` (la escena guardada del
  tablero —en una campaña, la de la campaña— y el portal de llegada, o `null`). Las escaleras de
  campaña de antes (`stairs` con `to`, `tx`, `tz`) se leen como portales de aspecto escalera con ids
  que salen de su casilla (`stairsId`), así la ida encuentra la vuelta.
- **Ajustes de escena** (T6d): `grid`, `snap`, `animate`, `plansReleased` (`cleanSceneFlags` =
  `Ajustes.sceneFlags`), por defecto sí, sí, sí, no; `fog` es la niebla de guerra de Partida.
- **Planos del director** (`plans`, hasta 100, `cleanPlan`) y **anotaciones** (`notes`,
  `cleanNote`: `text` ≤ 200, `gmOnly`).
- **Personajes** (`minis[]`): sprite (`kind`: uno de los 21 de `CHARS` o `c_…` dibujado), posición,
  orientación, `id`, `owner` y su ficha `sheet`.

### Ficha (`sheet`)

En las escenas y en `live/tokens`. Sólo lo que usa la mesa, con los campos de la ficha de JA-VTT;
`Fichas.norm` (cliente) = `cleanSheet` (servidor).

| Campo | Qué | Rango |
|---|---|---|
| `name` | nombre | ≤ 40 |
| `kind` | `player` (del grupo: revela lo que ve) o `enemy` | |
| `neutral` | extra del 3D: enemigo neutral (aldeanos) | sólo con `kind: 'enemy'` |
| `size` | casillas por lado, como JA-VTT | 1–4 |
| `tiny`, `small` | extras del 3D: Diminuto y Pequeño (1 casilla, sprite menor) | sólo con `size: 1` |
| `color` | color del filo de la peana (si no, el del bando) | `#rrggbb` |
| `hidden` | oculta para los jugadores (el director la ve a medias) | |
| `vision`, `sight`, `darkvision` | tiene visión propia; alcance y visión en la oscuridad **en pies** (`sight: 0` = sin límite, hasta 300) | 0–5000 / 0–300 |
| `light` | luz que lleva: el objeto de JA-VTT (`preset` de `TOKEN_LIGHTS`, `on`, `bright`, `dim`, `color`, `intensity`, `anim`, `angle`, `rot`) | |
| `conditions` | estados de JA-VTT (`CONDITION_IDS`: 14 del SRD + 6 de mesa) | sin repetir |
| `elevation` | altura en pies | −9999–9999 |
| `ac`, `hp` | clase de armadura; vida `{cur, max, temp}` | 0–99; `max` 1–9999 |
| `speed`, `init` | del 3D: velocidad en pies (combate) y modificador de iniciativa | 0–120; −10–20 |

Lo que el servidor no manda al jugador va en `withheld` (`['ac']` o `['ac','hp']`) y, con
`hpVisibility: 'bar_only'`, `hpBar = { cur, temp }` (fracciones de la vida máxima en pasos de 0,05,
nunca 0 si vive ni 1 si le falta algo). Compatibilidad: `team` (`pc` → `player`, `enemy` → `enemy`,
`npc` → `enemy` + `neutral`), `hp`/`hpMax` → `hp: {cur, max, temp: 0}`, `vision`/`dark` en casillas →
`sight`/`darkvision` en pies (× 5), `luz` (tipo de `TOKEN_LIGHTS` → su `light` de JA-VTT; radio en
casillas → `light` a medida de luz cálida con `bright` = `dim` = radio × 2,5). Campos que sólo cambia
el director: `GM_SHEET_KEYS` (bando, tamaño, visión y visibilidad); lo que no ve un jugador de fichas
ajenas: `sheetFor`.

### Mesa en vivo (`t3d.live_docs`)

- `live/board` — la escena de la mesa (con ambiente y zonas) y `scene`.
- `live/tokens` — los personajes con su ficha.
- `live/combat` — `{ initiative: { entries: [{ id, name, value, tokenId, hidden?, roll, init }], turn,
  round }, left, dashed }` (`tokenId` es el id de la ficha 3D, texto; `roll` es el d20 e `init` el
  modificador, que desempata; `left` es el movimiento que le queda al turno, en casillas, y `dashed` la
  carrera; `cleanCombat`; el de antes con `order` se traduce al abrir la mesa y en el
  cliente, `Ajustes.readCombat`). `combatFor` añade `active` y `current` (la ficha del turno si la
  puede ver) y, al jugador sin `initiativeShown`, `initiative: null`; al jugador se le cambia `turn` a
  la posición en su lista filtrada. El director pone el combate entero (`set`); el jugador sólo
  `update` con `{ next: true }` (el servidor pasa a la siguiente ficha viva y le da su movimiento) o
  `{ left, dashed }`.
- `live/doors` — puertas abiertas y cerradas de la mesa.
- `live/plans` — `{ plans: { id: plano } }` de los jugadores (migración `005-planos-en-vivo.sql`);
  `null` quita uno; un jugador sólo los suyos, hasta 40. Plano (`type: 'plan'` de JA-VTT): `shape`
  `line`/`circle`/`rect`/`cone`, `a` y `b` en casillas continuas `{x, z}`, `owner` (id en texto),
  `color` y, la línea de un conjuro, `area`.

### Dibujo

Un objeto que da luz guarda `lightSpec` `{px, py, s, r, c, f}` y, si se eligió, su tipo `preset`
(sin cono ni oscuridad: toma su intensidad y animación; el servidor recorta la posición al tamaño del
dibujo); cada capa guarda `op` (0–100) y `lock`. Un personaje guarda `charSize` (`tiny`, `small`,
`medium`, `large`, `huge`, `gargantuan`; columna `char_size`): el lienzo mide el de ese tamaño a la
resolución del dibujo (a 16 px por casilla: 10×14, 12×18, 16×24, 32×48, 48×72, 64×96; ×2 a 32 y ×4 a
64). Sin tamaño o con uno desconocido, Mediano (`cleanDrawing`). Las claves de casilla llevan `:`
(`g:top`); el id en la URL es la clave saneada.

## Cliente: `Tablero3D.mount(root, opts)`

| Archivo (`public/`) | Qué hace |
|---|---|
| `t3d.js` | Único script que carga el anfitrión: define `Tablero3D.mount`; al montar carga lo demás |
| `t3d.html` | Marcado en `<template data-slot="…">`: menú de escenas, acciones de cabecera, raíl + lienzo, pestañas y sus secciones, ventanas y editor de dibujo |
| `t3d.css` | Estilos, todos bajo `.t3d-root` y con las variables del anfitrión |
| `icons-t3d.js` | `Tablero3D.icons`: los 25 iconos Lucide que JA-VTT no trae; `t3d.js` los añade al `ICONS` del anfitrión sin pisar ninguno (si no hay `ICONS`, los pinta él) |
| `mesa.js` | `Tablero3D.createMesa(net)`: el adaptador `mesa.use('db' \| 'room' \| 'user' \| 'downloads')` sobre el `Net` del anfitrión |
| `vision.js` | `Tablero3D.Vision`: línea de visión y alcance de la luz sobre la rejilla (`los`, `lightReaches`) |
| `catalogo.js` | `Tablero3D.Catalogo` en el navegador, `module.exports` en Node (`require()` desde `rules.js`): catálogo único de piezas (fase 0, 2026-09-26) — las definiciones de fábrica (`FACTORY`) generadas del resto del motor, y las consultas por componente que sustituyen las listas sueltas de antes: `defOf`/`defIdOf` (tipo o `def` → definición), `complete` (pieza + definición → pieza con todo completo, `def`/`uid`/`state`), `blocksMove`, `span`, `isDoor`, `isLow`, `gmOnly`, `wallKind`, `surface`, `emitLight`, `stateOf`, `blocks` (paso/vista/luz por componente), `validateDef` (saneado y validación de una definición `p:` del tablero) y `newUid`. Esquema completo en [docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md](../../docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md) §3.2 |
| `muros.js` | `Tablero3D.Muros`: los tipos de muro de JA-VTT (`WALL_TYPES`: ids, nombres, iconos, colores, trazos, descripciones y banderas), qué tapa cada uno (`blocks`), el saneado de puertas, ventanas, velos, maleza, barreras y portales (`normProp`, que también pasa las escaleras de campaña de antes a portales), ids de portal (`fixPortalIds`) y la llegada junto al portal de destino (`gridOf`, `arrival`, `near`) |
| `ambiente.js` | `Tablero3D.Ambiente`: los momentos de luz de JA-VTT (`ENVS`) y su aspecto 3D (`LOOK`, `look`, `mix`, `torchK`), la lectura de la escena (`norm`), las zonas interiores por casilla (`interiorMask`, `cleanCells`) y la luz de fuera que entra por ventanas y puertas abiertas (`windowLight`, `field`, `ambientLit`) |
| `ajustes.js` | `Tablero3D.Ajustes`: los ajustes del tablero de JA-VTT (`DEFAULTS`, `HP_VISIBILITY`, `norm` = `cleanSettings`), los de escena (`sceneFlags`), los planos (`normPlan`, `measure`: las casillas de cada plantilla de Partida, `planOf`, `planCells`), las anotaciones (`normNote`) y la iniciativa (`normInitiative`, `readCombat`) |
| `dados.js` | `Tablero3D.Dados`: dados con la notación y el cuerpo de tirada de JA-VTT (`parse`, `roll`, `text`), la misma cuenta que `dice.js` del servidor |
| `fichas.js` | `Tablero3D.Fichas`: la ficha (`norm`, que lee también las de antes y guarda `withheld`/`hpBar`), tamaños (`SIZES`), estados (`CONDITIONS`), luz de ficha (`tokenLight`), ocupación y distancias (`footprint`, `gap`, `anchorFor`) y caminos para fichas de n×n (`fits`, `paths`, `route`) |
| `personajes.js` | `Tablero3D.Personajes`: el arte de los 16 personajes medianos de fábrica, pintado a mano; `art(P)` recibe las rampas del motor |
| `tablero3d.js` | `Tablero3D._engine(ctx)`: el motor 3D, el editor de escenas, el editor de dibujo, la partida, las campañas y la mesa en vivo |
| `vendor/three.min.js` | three.js r128 (define `THREE`; licencia MIT en `vendor/three.LICENSE`) |

`vision.js`, `muros.js`, `ambiente.js`, `ajustes.js`, `dados.js`, `fichas.js` y `personajes.js` no
tienen dependencias. Se prueban en el repositorio Tablero pixel: `test/frontend.test.js` (visión, muros,
ambiente, fichas, personajes) y `test/cliente-armonia.test.js` (ajustes, dados).

`opts` (JSDoc completo en `public/t3d.js`): `boardId`, `net` (opcional: el `Net` del anfitrión; sin
él, el módulo abre su conexión `/t3d/ws` con reconexión y la cierra al desmontar), `user` y `role`
iniciales (manda el `state` del servidor), `icon(nombre)` (por defecto `window.svgIcon`),
`showTab(nombre, reveal)` (gancho de pestañas del anfitrión) y `onDom(root)` (el marcado ya está
puesto y el motor aún no arrancó: el anfitrión recuerda las secciones plegadas y elige la pestaña
guardada). Devuelve `{ ready, unmount, status, ping, probe }`. `status()` da la conexión del 3D y el
rendimiento del motor (`{ connected, sent, recv, render: { fps, ms, calls, triangles } }`) y `ping()` una promesa con la
ida y vuelta en ms por `/t3d/ws` (JA-VTT los usa en Mesa → Conexión, 2026-09-26).

`probe` es de sólo lectura y sólo para las pruebas visuales (ningún anfitrión lo usa): `'tokens'`
(fichas con tamaño, escala, peana, estados y si se ven); `'route', id, x, z` (coste o null);
`'sprite', clave` (si lo sustituye un dibujo propio, las medidas de la textura que se pinta y una suma
de sus píxeles); `'props'` (objetos con su tipo de muro, puerta abierta o con llave, portal y si se
ven); `'los', x0, z0, x1, z1, kind`; `'fog', x, z`; `'screen', x, z` (dónde cae la casilla en
pantalla); `'scene'` (id, nombre, medidas y ajustes); `'roofs'`; `'env'`, `'ambient', x, z`,
`'interior', x, z`, `'light', x, z`; `'combat'`, `'plans'`, `'notes'` y `'log'` (registro de dados).

- **Carga**: en paralelo `t3d.css` y `t3d.html` y en orden `vendor/three.min.js`, `vision.js`, `catalogo.js`,
  `fichas.js`, `muros.js`, `ambiente.js`, `ajustes.js`, `dados.js`, `personajes.js`, `mesa.js`,
  `icons-t3d.js` y `tablero3d.js`; mete cada plantilla en el hueco `data-t3d-slot="<nombre>"` del
  anfitrión (`display:contents`; si falta, al final de `root`) y arranca el motor. **Nada de esto se carga
  antes de montar**: en una página que no monta una mesa 3D sólo está `t3d.js` (11 KB); three.js r128
  (589 KB) llega con el primer `mount`. En JA-VTT convive con su propio three.js (módulo ES r170 de sus
  dados 3D): no se pueden compartir.
- **Pestañas**: el módulo no trae marco de pestañas; pone sus botones (`data-tab="t3d-scene |
  t3d-tokens | t3d-game | t3d-camp"`) y sus secciones (`.tabpane` con el mismo `data-pane`) en los
  huecos `tabs` y `panes` del panel del anfitrión, y sus secciones «Mesa en vivo» y «Atajos» en los
  huecos `live` y `live-end` de la pestaña Mesa del anfitrión (la busca por `data-pane` o, si no lo
  hay, por el id sin `tab-`: `#tab-live` → `live`). El anfitrión cambia de pestaña al pulsar
  cualquier `[data-tab]`; el motor pide mostrar una con `showTab` y abre él mismo su sección.
- **Mesa**: se monta **antes** de `Net.connect(id)`. `mount` se suscribe al `Net` al momento, guarda
  los mensajes mientras bajan los scripts y los reproduce en el adaptador. Para volver a montar hay
  que reconectar (el adaptador necesita el `state` de la entrada).
- **Rol**: `root` lleva `t3d-root` y, si el rol no es `gm`, `t3d-player`, que oculta `.t3d-gm`.
- **Desmontar**: `unmount()` para el bucle, quita las escuchas de ventana, temporizadores y
  observadores, suelta WebGL, quita el marcado y se desuscribe del `Net` (probado en `test:ui`). Aun así, el anfitrión de
  Tablero pixel **recarga la página** al cambiar de tablero o volver al panel: es más fiable que
  confiar en el desmontaje de un motor con tanto estado.

## Aislamiento: prefijo `t3d-`

- **Todos los ids del módulo** llevan `t3d-` (`#t3d-rail`, `#t3d-stage`, `#t3d-mapName`…). El motor
  los busca con `$('rail')`, que antepone el prefijo; nunca con `document.getElementById` ni
  `document.querySelector`.
- **Clases propias** con `t3d-` (`t3d-palgrid`, `t3d-art`, `t3d-hint`…). **Sin prefijo** sólo los
  componentes del anfitrión, que son los de JA-VTT con los mismos estilos: `btn`, `sq`, `ghost`,
  `primary`, `fold`, `foldBody`, `foldTitle`, `tabs`, `tabpane`, `tool`, `railsep`, `scenePop`,
  `sceneBtn`, `sceneCreate`, `item`, `empty`, `field`, `gateField`, `check`, `env`, `keys`,
  `popSub`, `row`, `hsep`, `hideSm`…
- `data-tab`, `data-pane` y `data-fold` del módulo también con `t3d-` (JA-VTT ya usa «vista»,
  «mesa» y «atajos»). Las consultas por `data-tool`, `data-map`… se hacen dentro de un contenedor
  del módulo (JA-VTT también usa `data-tool`).
- **Estilos** en `t3d.css`: cada selector empieza por `.t3d-root`; ninguna variable propia, sólo las
  del anfitrión: `--ink`, `--panel`, `--raise`, `--line`, `--bone`, `--fog`, `--amber`,
  `--amber-ink`, `--amber-soft`, `--rust`, `--verdigris`, `--shadow`, `--sans`, `--serif`,
  `--z-modal`, `--z-pop`, `--z-toast`.
- **Globales**: `Tablero3D` (con `mount`, `createMesa`, `Vision`, `Fichas`, `Muros`, `Ambiente`,
  `Ajustes`, `Dados`, `Personajes`, `icons` y `_engine`) y `THREE` al montar.
- **Preferencias** en `localStorage`: el motor usa `tablero:*` y `t3d-*`.

## Motor 3D

### Luz y niebla

- La luz por casilla es **RGB** (`L`, 3 valores por casilla). Cada fuente (luz suelta, objeto que
  alumbra o personaje con «Luz que lleva») tiene posición continua, altura, radio, color y
  parpadeo; `computeLight` suma las que llegan (`Vision.lightReaches`: muros, desniveles y puertas
  cerradas hacen sombra). El sombreador (`lightFor`) suma a ese color el ambiente que llega a la
  casilla (ver [Ambiente e interiores](#ambiente-e-interiores)): las fuentes pesan más cuanto menos
  ambiente hay (`Ambiente.torchK`: 0,35 a pleno día, 1,15 a oscuras).
- **Tipos de fuente** (T4): `LIGHT_TYPES` del motor tiene los 12 ids, nombres e iconos de
  `LIGHT_PRESETS` de JA-VTT. De JA-VTT sólo se toman los tipos; el motor es el mismo. Cada tipo se
  traduce a sus parámetros: radio = (pies brillantes + tenues) / 5 casillas, altura, color de
  JA-VTT, intensidad (el `k` de siempre) y animación.

  | Tipo | Radio | Altura | Color | Int. | Anim. | Extra |
  |---|---|---|---|---|---|---|
  | candle Vela | 2 | 0,75 | #ffc878 | 0,9 | flicker | |
  | torch Antorcha | 8 | 1,25 | #ffa652 | 1 | flicker | |
  | lantern Farol | 12 | 1,5 | #ffd28f | 0,9 | soft | |
  | bullseye Linterna sorda | 24 | 1,25 | #ffe6b8 | 1 | none | cono 60° |
  | campfire Hoguera | 8 | 0,5 | #ff8f3f | 1 | flicker | |
  | brazier Brasero | 5 | 0,75 | #ff7a35 | 0,95 | flicker | |
  | magic Luz mágica | 8 | 1,5 | #dde8ff | 0,9 | none | |
  | crystal Cristal arcano | 6 | 1 | #a98bff | 0,9 | pulse | |
  | moon Rayo de luna | 4 | 2 | #9dbbff | 0,65 | none | sin halo |
  | daylight Luz diurna | 24 | 2 | #fff1d0 | 0,8 | none | sin halo; a la altura de un muro, no lo salta |
  | window Luz de ventana | 6 | 1,5 | #ffe9c2 | 0,85 | none | cono 120°, sin halo |
  | darkness Oscuridad mágica | 3 | 1 | — | — | — | resta la luz |

  Extensiones pequeñas del motor: **cono** (`angle` < 360 hacia `rot`, 0 = este, 90 = sur): en
  `addLight` las casillas fuera del ángulo no reciben luz y el borde se funde 12°. **Oscuridad**
  (`darkness`): no suma; tras las luces, las casillas a su alcance (con sombras y cono como una
  luz) quedan con `L = −1` y `DK = 1`. El sombreador lleva a casi negro la luz negativa (tapa también
  el ambiente; los bordes se funden al promediar las esquinas), los sprites dentro se ven como
  silueta, los halos de dentro se ocultan y la niebla no deja ver esas casillas a nadie, ni con
  visión en la oscuridad (como `magic` en `lightAt` de JA-VTT). **Animación**: el parpadeo global
  del terreno (`uFlicker`) no cambia; `flicker`, `soft` y `pulse` varían el halo de cada fuente
  (`glowAnim`: el parpadeo de siempre, un vaivén suave y una respiración lenta), `none` lo deja fijo.
  **Apagada** (`on:false`): no alumbra. La luz de ficha de un tipo usa sus mismos parámetros a la
  altura de la mano; la linterna sorda apunta hacia donde mira el personaje. Una luz de ficha a
  medida alumbra con radio (`bright`+`dim`)/5 casillas.
- En edición (herramienta Luz) se ve el cono de las luces dirigidas (sólo el de la elegida, si hay
  una) y el nombre de cada luz con `name` sobre el tablero (capa `.t3d-tags`).
- La niebla es una textura con filtro lineal muestreada en la posición continua, con escalones
  tramados; lo recién visto aparece en fundido (`fogTick`). Se ve lo que está en la línea de
  visión (`Vision.los`) y, donde el ambiente no basta (JA-VTT: ambiente que llega × `ambient` ≤ 0,25:
  de noche, en interior o dentro de una zona interior aunque fuera sea de día), más allá de la visión
  en la oscuridad sólo lo iluminado. Ven las fichas del bando Jugador con visión (visión
  compartida); en la mesa en vivo con `sharedVision` apagado, cada jugador ve sólo desde las suyas
  (si no tiene, desde el grupo), como `canSee` de JA-VTT (`fogViewers`).

### Ambiente e interiores

- **Momentos de luz** (`ambiente.js`, T6c): los `ENVS` de JA-VTT con sus ids, nombres, iconos y
  descripciones. Elegir un momento pone su `ambient` y su `dark`, y el director los afina (deslizador
  «Luz ambiental» y selector «Color de la oscuridad» en la sección Iluminación de la pestaña Escena).
  Sustituye al interruptor Noche de antes (`state.night`, `applyMode`, `uTorchK`). Lo propio del
  3D, por momento (`LOOK`):

  | Momento | `ambient` | `darkColor` (JA-VTT) | Tinte a pleno | Cielo (arriba · horizonte · fondo) |
  |---|---|---|---|---|
  | interior Interior | 0 | #0B0E11 | 0,95 0,86 0,72 | el de la oscuridad |
  | day Exterior de día | 1 | #0E1316 | 1 1 1 | #6fa7c9 · #d8e6c4 · #7fa8b8 |
  | dusk Atardecer | 0,55 | #1A1220 | 1,08 0,76 0,62 | #2b2150 · #e0876a · #6e4a66 |
  | night Noche | 0,18 | #081026 | 0,58 0,64 0,92 (luna) | #07051a · #241a44 · #0d0a1c |

  `look`: color de la oscuridad = `darkColor` × 2,2; ambiente = oscuridad + (tinte − oscuridad) ×
  `ambient`^0,7 (interior casi negro, noche azul, atardecer cálido); el cielo se funde hacia el de la
  oscuridad si `ambient` baja del de su momento; los halos, opacidad 1 − 0,7 × `ambient`. Al cambiar,
  todo (uniformes `uAmbient`, `uDark`, `uLevel`, cielo, fondo, halos y la luz de los sprites) se funde
  en 0,9 s (`envTick`); al abrir una escena, sin fundido (en la mesa en vivo, el cambio del director
  sí se funde).
- **Zonas interiores** (`zone` de JA-VTT), por casilla: `INTERIOR` = los rectángulos de los techos
  (cada techo crea la suya) + lo que pinta el director (`zoneCells`). Herramienta **Zona interior**
  (tecla Z, icono `house` de JA-VTT; el de Techos pasa a `warehouse`): rectángulo arrastrando, pincel
  (con el tamaño de `[`/`]`) y borrar (sobre un techo, deja la casilla al aire libre). En edición el
  director ve el contorno a trazos del color de JA-VTT (#B79BD8) y, con la herramienta, el relleno
  (`drawZones`). Dentro no llega el ambiente (sólo las luces y la visión en la oscuridad), la niebla
  aplica la regla de la oscuridad aunque fuera sea de día y los techos se siguen abriendo al entrar.
  Para el clima (hoja de ruta R7) el motor expone `isInterior(i)`: ahí no caerá.
- **Ventanas y puertas abiertas** (`windowLight`): una ventana (o puerta abierta) con interior a un
  lado y exterior sin muro al otro alumbra hacia dentro como una fuente del motor: desde el borde
  interior de su casilla, cono de 120° (borde fundido 12°), radio 5, sombras con
  `Vision.lightReaches` sobre la rejilla sin los muros recortados al abrir un techo (`AGRID`), y lo
  que llega se suma (hasta 1). No es una luz de color: es **el ambiente de fuera** que entra, así que
  de día es un rayo claro, al atardecer cálido, de noche un poco de luna, y en interior nada.
- **Por casilla** (`computeAmbient`, en cada `computeLight`, al cambiar techos, zonas o al abrir una
  puerta): `AMBF[i]` = cuánto ambiente llega (1 fuera; dentro, lo de las ventanas). Viaja al
  sombreador en una textura de `w × d` (`uAmbT`): canal r = fuera/dentro (se lee sin fundir, en la
  casilla), canal g = el ambiente que llega (fundido entre casillas; fuera 1 salvo en los muros).
  `lightFor(s, torch, a)` usa `a = ambAt(p)`: ambiente `mix(uDark, uAmbient, a)` y fuentes ×
  `torchK(uLevel × a)`; el tejado usa `a = 1`. Los sprites (`lightAt`) hacen la misma cuenta en la CPU
  y los halos de dentro de una zona brillan como a oscuras. Cambiar de momento no rehace geometría:
  sólo uniformes. Un material nuevo que tenga que oscurecerse en las zonas interiores lleva `...ambU`
  en sus uniformes y llama a `lightFor(s, torch, ambAt(p))` (el tejado, con `1.0`).
- **Coste**: la textura y el cálculo de ventanas son O(casillas + ventanas × 60); con SwiftShader el
  pueblo sigue en 20–23 fps y las mismas llamadas.

### Fichas

- **Modelo** (T5): la ficha (`sheet`, ver [Ficha](#ficha-sheet)); el personaje guarda aparte su
  sprite (`kind`: uno de los 21 de `CHARS` —`knight`, `goblin`, `villager`, `wolf`, `ogre`…— o `c_…`
  dibujado), posición, orientación, `id` y `owner`. Lo que el motor necesita en casillas sale de los
  pies (`Fichas.sightCells`, `darkCells`: pies / 5). `normSheet` del motor = `Fichas.norm(ficha,
  defaultSheet(sprite))`: la ficha guardada, de ahora o de antes, sobre la del sprite (el ogro nace
  Grande; la rata, Diminuta).
- **Tamaños**: `Fichas.SIZES` — Diminuto (1 casilla, peana ×0,5), Pequeño (1, ×0,8), Mediano (1, ×1),
  Grande (2×2), Enorme (3×3), Colosal (4×4). Cada tamaño tiene su **lienzo de arte** (`art`, a 16
  texeles por casilla): 10×14, 12×18, 16×24, 32×48, 48×72 y 64×96; `scale` = alto del arte / 24 (ojos
  y luz que lleva).
- **Densidad de píxel constante (T5b)**: el texel de un personaje mide lo mismo que el del terreno
  (1/`TEX` de casilla, a 16, 32 o 64). El sprite **no se escala por el tamaño de la ficha**: sus
  medidas en el mundo salen de sus propios píxeles (`spriteDims` = `Fichas.spriteWorld(ancho, alto,
  res)`: el de fábrica se pinta a 16 por casilla y se amplía con EPX a `TEX`; el dibujado, a su `res`,
  y `buildCharTex` lo lleva a `TEX` píxel a píxel). Por eso cada criatura grande tiene arte propio a su
  tamaño (ogro 32×48, trol 48×72, gólem de piedra 64×96; rata 10×14 y niño 12×18). Una ficha con arte
  de otro tamaño (un caballero puesto en Grande) se ve a su escala de píxel sobre la peana de su
  tamaño, con un aviso en la ficha («El arte es de tamaño Mediano…»): mejor un personaje pequeño en
  una peana grande que píxeles el doble de gordos que el suelo. `CHARS` lista los de fábrica con el
  tamaño de su arte (`CHAR_ART`); de ahí salen la paleta de Personajes, «Todo el arte» y el tamaño con
  el que nace cada ficha (`defaultSheet`; un personaje dibujado nace del tamaño de su dibujo). Las
  criaturas grandes se modelan en el motor con `sculpt`: elipsoides, cápsulas y bloques sombreados
  con la luz de arriba a la izquierda del resto del arte en 4–5 tonos de su rampa, pliegue oscuro
  donde una pieza tapa a otra y contorno de tinta.
- **Arte de los personajes medianos (T5c)**: los 16 de fábrica están **pintados a mano, texel a
  texel**, en `personajes.js` (a 16×24, `sculpt` no da forma a volúmenes de 3–4 texeles): rejillas de
  24 filas × 16 letras por vista (frente, espalda y perfil; el perfil izquierdo es el espejo) y una
  clave de colores común (`KEY`: tinta, piel, metal, oro, madera) más la de cada personaje; `like`
  reutiliza las filas de otro con su paleta (el molinero es el aldeano enharinado). Reglas del estilo,
  las del terreno, los techos y las criaturas grandes: luz de arriba a la izquierda (columna izquierda
  clara, derecha oscura), rampas de 3–4 tonos **del motor** (`art(P)` recibe `G`, `D`, `S`, `B`, `W`,
  `SA`, `WA`, `SL`, `TH`, `FL`, `EXTRA_RAMPS`, la piel del ogro, el hueso y las runas: el caballero
  lleva el rojo de las tejas; el goblin, la piel del ogro), sombras frías y luces cálidas, pliegue
  oscuro donde una pieza tapa a otra y siluetas que se leen a este tamaño (cabeza grande, casco,
  sombrero, capucha, arma). Las dos rampas nuevas (piel `SKIN` y metal `METAL`, `RAMPS`) entran en la
  paleta del editor de dibujo. El motor los pinta (`handArt`) y les pone el **contorno selectivo**
  (`selout`): tinta abajo y a la derecha y, en el lado de la luz, el color de la pieza oscurecido (42 %
  pieza + 58 % tinta). Nace cada uno con su ficha (`SHEET_OF`: bando, vida, CA, iniciativa, velocidad;
  el nombre sale de `CHARS`).
- **Ocupación**: una ficha de n casillas ocupa `[x, x+n) × [z, z+n)` (esquina, como un personaje de
  1); su centro es `(x+n/2, z+n/2)` y se apoya en la casilla más alta de las suyas (`footY`). Tocar una
  casilla la lleva a `Fichas.anchorFor` (queda encima, dentro del mapa).
- **Caminos**: `Fichas.route`/`paths` sobre la rejilla `PATHG` del motor (pisable: sin muro, lava,
  agua honda ni objeto, salvo puertas cerradas, que se abren al pasar; difícil: agua poco profunda) y
  las casillas de las demás fichas. Una ficha de n×n avanza si todas sus casillas caben, están libres
  y no difieren más de 2 alturas entre sí, y si cada una sube o baja como mucho 2 respecto a la que
  deja (subir 2 o pisar agua = difícil, coste doble); en diagonal no corta esquinas. Con n = 1 es el
  algoritmo de antes, idéntico. Distancias de borde a borde con `Fichas.gap` (regla y menú
  contextual).
- **Visión y luz**: ve desde cualquiera de sus casillas (unión de las líneas de visión), a una altura
  de ojo de 1,2 × escala + 0,3 sobre el suelo (1,5 en un Mediano) más su `elevation`; el alcance
  (`sight`, `darkvision`) se mide desde su borde. Sólo revelan las `kind: 'player'` con `vision`. La
  luz que lleva sale de su centro a 1,1 × escala (máx. 1,6) de altura.
- **Aspecto** (`addTokenParts`, `updateToken`): el sprite es un billboard del tamaño de sus píxeles
  (salta 1 texel al respirar); debajo, una **peana** (cilindro bajo, 0,12 de alto, sin tapa inferior)
  con textura pixel art de 16 px por casilla y EPX como el terreno: losas de piedra (rampa `S`) con un
  filo de 2 px del color de la ficha (`color` o el del bando: jugador `#7fb2e5`, enemigo `#d9705f` —los
  de JA-VTT—, neutral `#e8c05a`), una por color y tamaño (`baseTexCache`); tapa y lateral toman la luz
  de la casilla del centro (`lightAt`), igual que el sprite. **Sombra de contacto** tramada (Bayer)
  compartida. **Anillo de selección**: trazos dorados con contorno de tinta de 16 px por casilla para
  cada tamaño (`ringTex`), que avanzan a saltos (quieto con movimiento reducido). **Estado**
  (`updateStatus`): un billboard por ficha con un lienzo de 1 px = 1/16 de casilla, rehecho sólo si
  cambia: chapas de 9 px con la abreviatura (letras de 3×5, `GLYPH`) y el color de JA-VTT, la altura
  (`+15'`) y la barra de vida de 4 px (verde, ámbar, rojo como JA-VTT y la temporal en cian), justo
  encima del dibujo (`artTop` por el alto en el mundo del sprite, sea del tamaño que sea); toma algo de
  la luz de la escena. La vida se ve con la ficha elegida, bajo el cursor o herida (`hpShown`: sólo con
  `hpEnabled` y si el servidor la manda, entera o como `hpBar`). Oculta (`hidden`): el director la ve a
  medias, el jugador no. El cliente (`withheld`, `hpView`, `alive`) no pinta lo que no sabe: una ficha
  ajena sin vida se da por viva, con barra se pinta la barra.
- **Coste**: por ficha, peana (2 llamadas), sombra y, si se ve, estado (1): en el pueblo de ejemplo
  (11 fichas) 126 → 142 llamadas de dibujo; con SwiftShader (sin GPU) los fps quedan en el mismo rango
  (23 antes; 21–25 después, según el encuadre).

### Techos y estructuras

- **Techos** (T6): cada techo de `M.roofs` es una malla propia (`roofGeo`) con el material `roofMat`:
  el mismo sombreado por luz y niebla que el terreno, pero la textura se muestrea con coordenadas del
  mundo (`aRUv`, 1 casilla de textura por unidad: la densidad de 16 texeles por casilla del terreno) y
  se repite con `fract` dentro de su casilla del atlas (`aTile`), así que un faldón de cualquier
  tamaño o inclinación no se estira. Las hileras van a lo largo del alero y «hacia abajo» en la
  casilla es hacia el alero. Materiales en `ROOF_MATS`: teja roja (casilla 27, la de siempre), pizarra
  (31), paja (41), tablillas (42) y cobre con verdín (43), pintados como el terreno (rampas propias
  `SL`, `TH`, `SH`, `CU`, EPX y el grano fino de `detailPass`, salvo la paja); cada uno tiene su clave
  en «Todo el arte» (`roof:top`, `roof:slate`, `roof:thatch`, `roof:shingle`, `roof:copper`;
  `ROOF_KEY` → casilla) y su remate de hastial (madera `o` o muro `w`, del arte actual). Formas: **a
  dos aguas** (hastiales en el plano del muro, aleros y remates de 0,25 y caballete), **a cuatro
  aguas** (faldones hasta la cumbrera acortada; si el lado corto manda, pirámide), **a un agua**
  (pared alta y laterales con el remate), **cónico** (12 o 16 caras con faldón que tapa el encuentro
  con el muro y una aguja; para torres de 2×2 o más) y **plano con almenas** (azotea de losas `s`,
  pretil y merlones de muro `w`; no usa material). Pendiente 0,42 (a un agua 0,3); cónico, alto 1,9 ×
  radio. `roofAxis` da la cumbrera (`rot` o el lado largo). Sombra por la normal con la misma luz que
  los laterales del terreno.
- **Luz en los techos**: `roofLight` (tras cada `computeLight`) da a cada vértice la luz de la casilla
  de fuera más cercana, atenuada con la altura (0,38 en el alero, casi nada en la cumbrera): los
  faroles de la calle alumbran los aleros; las luces de dentro no atraviesan el tejado.
- **Abrir y ocultar**: igual para todas las formas (`roofTick`): en juego se abre el techo de la casa
  en la que está (o a una casilla de su puerta) la ficha elegida o la del turno, y los muros de dentro
  se recortan (`RCAP`); en edición se ocultan todos **salvo con la herramienta Techos**, que los enseña
  para ver material y forma. Herramienta (tecla 7): paleta de materiales, formas con su silueta en
  píxeles (`shapeThumb`), dirección y **R** (`turnRoof`); tocar dentro de un techo lo elige
  (`state.roofSel`) y el panel lo cambia (`editRoof`, con deshacer).
- **Objetos por capas** (`PROP3D`): `fn(x, z, s)` en texeles base; cada rebanada de alta resolución
  usa la rebanada base que le toca (`propFn`: la misma densidad vertical que el terreno; antes, a 32
  px, las comparaciones con alturas exactas no se cumplían y faltaban aros, baldas y la llama de los
  faroles). Volúmenes hechos la primera vez que se usan (`pstack`) y miniaturas en caché (`PSLICES`).
  Extensiones: `span:[w,d]` (varias casillas desde la esquina `(x, z)`, girado con `v`: ocupa y
  bloquea todas; lo usan `propSpan`/`propCells`/`propCovers` en colocación, borrado, ocupación, luz y
  minimapa), `door` (puerta: `Catalogo.isDoor`), `lift` (la puerta sube en vez de girar) + `frame` (una
  segunda pieza fija, oculta en la paleta con `hidden`: el arco de `gate`), `deck` (puente:
  `computeDecks` da a cada casilla la altura de la orilla más alta a lo largo del paso en `DECK`;
  `PATHG` la pisa como suelo, `footY` pone ahí las fichas y el objeto se baja para que su tarima quede
  a esa altura), `noShadow` y `cat` (filtro de la paleta: Estructuras, Naturaleza, Mobiliario,
  Decorado, Luz). Estructuras: puesto de fruta y de telas (2×1), puente de madera (1) y ancho (2×1),
  puerta de la muralla (rastrillo) con su arco, molino de viento (3×3, aspas fijas), campanario,
  poste, carreta (2×1), cajas y barriles, banco, valla de estacas, murete de piedra y letrero; el pozo
  (cubo, manivela, musgo). Muros, torres y atalaya son casillas de muro `w` con techos plano o
  cónico: se abren al entrar como una casa. Un objeto por capas nuevo entra solo en «Todo el arte»
  (`OBJ_TARGETS` sale de `PROP3D`).
- **Coste**: un techo = 1 llamada; un objeto = 2 (con sombra), la puerta de la muralla 3. El pueblo de
  ejemplo (48×40, antes 40×34) con SwiftShader: vista inicial 152 → 173 llamadas, alejada 345 → 393;
  20–23 fps antes y después.

### Muros y portales

- **Tipos** (`muros.js`, T6b): los siete de `WALL_TYPES` de JA-VTT con sus ids, nombres, iconos,
  colores, trazos, descripciones y banderas (`sight` tapa la vista, `light` la luz, `move` el paso,
  `hide` oculta fichas y objetos de detrás; `door`, `portal`).
- **Representación, por casilla** (primera fase; JA-VTT usa segmentos finos entre casillas, que
  quedan en la hoja de ruta, R13): ver [Escena](#escena-t3dscenesdata). Así no hace falta otra capa
  en el mapa. `refreshEntities` llena `WALLAT` (casilla → lista de piezas que pueden
  tapar; tapa si alguna tapa), `doorShut` y `lockedDoors` (todas las casillas de cada puerta), y `HAS_COVER`.
- **Reglas por casilla** (`Muros.blocks`, el `blocks()` de JA-VTT: una puerta abierta no tapa nada;
  `'hide'` = lo que tapa la vista + la maleza): `Vision.los`/`lightReaches` reciben `g.bk(i, flag)`;
  una puerta cerrada, un velo, un portal de pie o la maleza (sólo para `'hide'`) tapan lo que pasa a
  menos de 1 de su suelo (desde lo alto se ve por encima), y la casilla de origen y la de destino no
  tapan. El paso: la ventana, la barrera y el portal ocupan su casilla (`block`), el velo y la maleza
  se pisan (`walk`); `PATHG.open` cruza una puerta cerrada sólo si quien mueve puede abrirla
  (`passDoor`: sin llave y, si es jugador en la mesa en vivo, con `playersDoors`). Portales de suelo
  (escalera, trampilla) no tapan vista ni luz; los de pie (puerta, cueva, mágico), sí.
- **Maleza (cover)**: la niebla marca la casilla como vista (el suelo y la luz se ven), pero las
  fichas y los objetos pequeños (mobiliario, decorado, dibujados) de una casilla que sólo se ve a
  través de maleza no se pintan: `hideOK(i)` = algún ojo del grupo la ve con `Vision.los(…, 'hide')`;
  se calcula al preguntar y se guarda hasta la siguiente niebla (`HV`). Se ve a quien está **dentro**
  de la hierba y, desde dentro, hacia fuera; no a quien está detrás. Muros, estructuras y árboles no
  se ocultan. Sin niebla, la maleza no oculta (como sin visión en JA-VTT).
- **Aspecto**: objetos por capas (`PROP3D`, ocultos en la paleta de objetos y en «Todo el arte»,
  editables y restaurables): `window` (tramo de muro de ladrillo con alféizar, dintel, marco y cristal
  con parteluz), `veil` (cortina violeta con pliegues y barra, entreabierta abajo), `cover` (hierba
  alta con espigas, al azar), `barrier` (sólo el contorno a trazos del color de JA-VTT, `gmOnly`: el
  jugador no la ve), y los aspectos del portal (`Muros.PORTAL_LOOKS` → `portal` puerta en arco de
  sillares con gema rosa, `portal_stairs` escalera que baja con postes, `portal_cave` boca de cueva,
  `portal_trap` trampilla con argolla, `portal_magic` aro de piedra con runas y remolino, que alumbra
  con el tipo de luz `crystal`). `propKind(p)` elige el objeto del aspecto.
- **Herramienta Muros** (tecla M, `data-tool="wall"`): paleta con los siete tipos (icono y color de
  JA-VTT). Muro pinta casillas `'w'` (con el pincel); los demás se colocan de uno en uno (sobre un muro
  abren el hueco: la casilla toma el suelo de al lado), se orientan solos a lo largo del muro vecino
  y, tocados otra vez, se eligen: panel con la llave de la puerta, el aspecto, nombre, destino (escena
  y portal de llegada) y «Enlazar también la vuelta» de un portal, R gira y «Quitar».
- **Cruzar** (`travelDialog`: con la ficha, «Con todo el grupo» o, el director sin ficha, «Ir sin
  fichas»), cuando una ficha llega junto a un portal (a una casilla o menos, `Muros.near`), se toca el
  portal o se usa su menú:
  - en una **campaña**, en el cliente (`campGo`, como los pasos de antes), con `Muros.arrival`;
  - **fuera de la mesa en vivo**, el director manda su escena al servidor (`POST …/travel`) y abre la
    de destino que le devuelve; el servidor guarda las dos (la de origen, con quien se queda);
  - **en la mesa en vivo**, la mesa **sigue la escena del director** (`live/board.scene`): ver
    [Mesa en vivo en el servidor](#mesa-en-vivo-en-el-servidor).
- **Llegada** (`arrival`, la idea de `arrivalPoints` de JA-VTT por casillas): se recorre lo pisable
  desde las casillas de al lado del portal de destino, primero la más cercana al punto de entrada de
  la escena (el lado por el que se anda), y cada ficha toma el primer hueco en que cabe (n×n casillas
  libres, sin muro, lava, agua, objeto que ocupe ni otra ficha); sin portal, junto al punto de
  entrada. La que no cabe se queda donde estaba. El servidor coloca con `PASSABLE_PROPS`/`PROP_SPANS`
  de `rules.js`, espejo de `Muros.PASSABLE`/`Muros.SPANS`.
- **«Reunir al grupo»** (`gather` de JA-VTT): todas las fichas del bando Jugador de la escena abierta
  van a otra escena, junto a su punto de entrada.

### Armonía con JA-VTT en el motor (T6d)

- **Ajustes del tablero**: el motor los aplica con `hpOn`, `acOn`, `condsOn`, `diceOn` (ficha, estado
  sobre el tablero, orden de combate, dados), `fogViewers` (`sharedVision`) y las casillas
  `BOARD_TOGGLES` de la pestaña Mesa.
- **Iniciativa**: en el motor `GM.cur` es la ficha del turno (`curMini`).
- **Planos**: `Ajustes.measure` es la cuenta de casillas de las plantillas de siempre (sale del motor)
  y `planCells` pinta un plano con la misma; `drawPlans` hace una malla por plano del color de su
  dueño.
- **Anotaciones**: etiquetas en la capa `.t3d-tags` (como los nombres de las luces).
- **Dados**: `dados.js` con la forma de `server/dice.js` de JA-VTT (misma notación, mismos errores y
  mismo cuerpo); extra `adv`. Fuera de la mesa en vivo tira el cliente con la misma cuenta.
- **Ajustes de escena**: `animOn()` (= `animate` y sin movimiento reducido) congela `uFrame`,
  `uFlicker`, el tiempo del agua, el fuego de los braseros, los halos (`glowAnim`) y la respiración de
  las fichas. La cuadrícula es una malla de líneas (`buildGrid`, 1 llamada) en el borde de cada
  casilla sobre su cara de arriba, con el sombreador de niebla; se rehace al cambiar alturas.

## Contratos con JA-VTT

Los nombres y valores que el módulo copia de JA-VTT se comprueban contra fijos sacados del commit
`d68f41f` de JA-VTT, en el repositorio Tablero pixel (`test/fixtures/ja-vtt/`): ids, clases, iconos,
variables CSS, tipos de luz (`light-presets.json`), estados (`conditions.json`), tipos de muro
(`wall-types.json`), momentos de luz (`envs.json`), ajustes del tablero (`board-settings.json`), dados
(`dice.json`) y migraciones. `test/frontend.test.js` comprueba además que el motor no busca ids sin
el prefijo (`$('nombre')`, nunca `document.getElementById`/`querySelector`), que cada clase sin prefijo
existe en el CSS del anfitrión y en JA-VTT (`clases.json`), que `t3d.css` sólo usa variables de JA-VTT
(`variables-css.json`) y que no se carga nada por CDN. Si JA-VTT cambia alguno, se regeneran los fijos y se ajustan las copias
del módulo; qué tocar en cada caso está en el runbook de Tablero pixel (`docs/05-runbook.md`,
«Gotchas»).
