# 01 — Arquitectura

Estado técnico al 2026-09-15.

## Stack

| Pieza | Elección | Nota |
|---|---|---|
| Runtime | Node.js ≥ 22.5 (imagen `node:22-alpine`) | `fetch` y `WebSocket` globales se usan en tests |
| HTTP + WebSocket | `node:http` + `server/ws.js` (RFC 6455 propio) | Sin Express ni `ws` |
| Base de datos | PostgreSQL 16, driver `pg` | Única dependencia de producción |
| Cliente | HTML + CSS + scripts clásicos (`public/js/*.js`) que comparten ámbito global; `dice3d.js` es un módulo ES | Sin bundler. three.js + cannon-es vendorizados en `public/js/vendor` sólo para los dados 3D; PixiJS 7.4.2 + `weather-fx.js` vendorizados y **cargados sólo cuando una escena 2D tiene clima** |
| Tests | `node:test` contra un Postgres real | Sin framework |

## Capas

```
public/            Presentación (navegador)
server/app.js      HTTP, API REST, tiempo real, caché de tableros en memoria
server/rules.js    Dominio: saneado de objetos, permisos de jugador, visibilidad
server/auth.js     Dominio: contraseñas (scrypt)
server/db.js       Infraestructura: pool pg, migraciones, TODAS las consultas SQL
server/ws.js       Infraestructura: protocolo WebSocket
```

Regla: **nadie fuera de `db.js` escribe SQL**. `app.js` llama a `q.<consulta>()` o a
`tx(async (t) => …)`; `t` tiene las mismas consultas dentro de una transacción.

## Modelo de datos (`server/migrations/001-inicial.sql`)

`users` (nombre único sin distinguir mayúsculas, `password_hash`) → `sessions` (token en
cookie `jav_session`, 1 año) · `boards` (dueño, `invite_code`, `settings` jsonb,
`active_scene`) → `scenes` (settings jsonb, orden) → `objects` (`data` jsonb; id BIGINT
generado en cliente como `Date.now()*1000+aleatorio`) · `board_members` (rol `gm|player`,
escena en la que está cada uno) · `images` (bytes en `bytea`, miniatura opcional; `board_id`
NULL = sin tablero, ya no se usa; categoría `arte25` = hojas de piezas para el arte propio 2.5D) · `fog` (por usuario y escena: en 2D un PNG por bloque `cx,cy`; en 2.5D una sola fila `cx=cy=0` con un byte por casilla) · `chat_messages` (texto, tirada o aviso, `body` jsonb)
· `users.recovery_code` (migración 002).

Tiempos en milisegundos desde época (BIGINT). `pg` devuelve BIGINT como texto: `db.js`
registra un parser a `Number` (todos los valores caben en 2^53).

Migraciones: ficheros `NNN-nombre.sql` aplicados en orden al arrancar, registrados en
`schema_migrations`, bajo `pg_advisory_lock` para que dos réplicas no choquen.

## Tiempo real

- Un tablero abierto vive en `live` (Map) con sus escenas y objetos en memoria.
- Cada mensaje WebSocket entra en una **cola por tablero** (`enqueue`): los manejadores son
  `async` pero nunca se solapan entre sí para el mismo tablero.
- Los cambios marcan `dirty`/`removed`; `flush()` los vuelca cada 400 ms en una transacción.
  Un cerrojo (`b.flushing`) impide dos volcados simultáneos; si el volcado falla, los
  cambios se vuelven a marcar y se reintenta en el siguiente ciclo.
- Sin clientes, el tablero se descarga de memoria tras volcar. Al reconectar se recarga de
  la base (así se prueba la persistencia en `test/realtime.test.js`).
- El servidor valida cada operación (`rules.js`) y sólo reenvía a cada cliente lo que ese
  cliente puede ver (fichas ocultas y planos sin publicar no salen del servidor).
- `SIGTERM`/`SIGINT`: cierra sockets, vuelca todo, cierra el pool y sale. Docker manda
  `SIGTERM` al hacer `restart`/`stop`, por eso nada se pierde.
- Miembros del tablero en caché (`b.members`), refrescada al añadir/quitar.

## Cuentas

Registro abierto (`POST /api/register`) con nombre (2–24 caracteres) y contraseña (≥ 6).
Hash `scrypt$N$sal$hash` con `crypto.scrypt` nativo. Login devuelve el mismo 401 para
usuario inexistente y contraseña mala. Sin rate-limit, sin recuperación de contraseña:
decisión del usuario (proyecto casi privado), ver spec en `superpowers/specs/`.

## Clima 2D (`public/js/weather.js`, 2026-09-18)

Spec: [superpowers/specs/2026-09-18-clima-2d-design.md](superpowers/specs/2026-09-18-clima-2d-design.md).

```
#stage:  cScene → cWeather (Pixi) → cGlow → cDark → cOver
```

- `Weather` es el **único** puente con `vendor/weather-fx.js` (partículas con paralaje, agua simulada
  en CPU que refracta el tablero, gradación, rayos). `sync()` en cada frame completo de `drawAll`
  y en `syncStageMode`: carga las dos librerías con `<script>` dinámico la primera vez, monta,
  cambia de efecto/parámetros o destruye (id `none` o modo 2.5D). `invalidate()` tras
  `drawScene` resube `cScene` como textura (nunca en frames `lightsOnly`); `resize()` desde `resize()`.
- La capa refracta sólo `cScene`; brillo, oscuridad y controles quedan **encima sin deformar**, así la
  oscuridad tapa el clima donde el jugador no ve (sin fugas). Fogonazo del rayo sólo en zona vista.
- `S.animate=false` → `pause`. `PERF.scale<1` → `refraction:0` (el shader caro), partículas siguen.
  Sin WebGL → aviso y sin clima. Rayos y gotas son aleatorios locales, no se sincronizan.
- Zonas interiores: `maskZones()` pone a `fx.scene` una máscara (pantalla menos las zonas, en píxeles de
  pantalla) salvo que el tipo esté en `weather.indoor`; se recalcula en cada frame completo.
- Dato: ajuste de escena `weather:{id,intensity,wind,indoor?}`; `rules.cleanSettings` sanea (`WEATHER_IDS`);
  `core.js WEATHERS` es la lista para el panel sin cargar la librería. Un test exige que las tres
  listas coincidan con los `register()` de la librería.

## Modo 2.5D (rama `modo-25d-fase-a`; fases A–D cerradas, E en curso)

Diseño: `superpowers/specs/2026-09-16-modo-25d-design.md`. Estado y decisiones: [08](08-traspaso-opencode.md).

- `boards.settings.mode` ∈ {`2d`, `2.5d`}, fijado en `createBoard` e **inmutable**: `rules.boardSettingsPatch()`
  lo elimina de cualquier `settings` que llegue por `ops` o `replace`. Los tableros anteriores no lo
  tienen y se leen como `2d` (`COALESCE` en `boardsForUser`).
- **Motor** en `public/js/d3/` (módulos ES sobre el mismo three r170 de los dados; port del prototipo
  `diorama-jav/`, gitignorado). Sin bundler: `index.html` carga `js/d3/index.js` como `type="module"`.

| Módulo | Responsabilidad |
|---|---|
| `ctx.js` | Estado compartido: `G` (mundo por celda: alturas `H`, materiales `M`, agua `W`, objetos, luces, fichas…), `S` (ajustes de escena), `R` (renderer, escena, cámara, luces, `stage`, `toast`), `U` (uniforms), constantes y helpers de índice |
| `art.js` | Atlas (`packs25.png` + `packmap.js`), cuatro estilos, catálogos `CHAR_INFO`/`OBJ_KINDS`/`MATS`, texturas (`ART.TEX`), arte propio (vacío hasta la fase D) |
| `terrain.js` | Pedestal y bloques instanciados por material (`initTerrain`, `buildTerrain`, `vh`) |
| `world.js` | Escenas de muestra, crecimiento del tablero, objetos, piezas de pared, puertas, marcas de agua, `relayout` |
| `water.js` | Shader, malla, simulación por tuberías y partículas del agua |
| `vision.js` | Parche de shader (niebla, luz, sombras suaves), LOS por alturas, mapa de luz, visión y explorado |
| `chars.js` | Sprites, fichas, luces portadas, pathfinding y movimiento; tablas `ENVS`/`LIGHT_PRESETS` |
| `fx.js` | Bruma, luciérnagas, explosiones; objeto `hooks` que `index.js` rellena para evitar importes circulares |
| `camera.js` | Cámara orbital (estado en `CAM`), entorno (`stepEnv`), posproceso |
| `input.js` | Raycast, cursor y anillo, herramientas del director (sin UI), punteros y teclado |
| `light-map.js` | Módulo puro (importable en Node): traduce una luz de JA-VTT a la definición del motor — los radios, color y animación mandan tal cual; el preset del diorama sólo elige el sprite (`SPRITE_OF`, `defFor`) |
| `index.js` | `createEngine(stage, opts)`: renderer, escena, luces, enlace de módulos, bucle; `window.D3 = {mount, unmount, resize, rotate, setEnv, setView, isMounted, loadTerrain, applyRemoteOp, version, setTool, setToolOption, catalog, syncObjects, debug, pickCell, pickPlace, select, exploredBytes, exploredDirty, loadExplored, resetExplored, terrainOp, settings25, customArt, styles, artThumb}` para los scripts clásicos |

- Look fiel a r128: `THREE.ColorManagement.enabled = false` (global al módulo three) + salida
  `LinearSRGBColorSpace`; luces ×π (r170 quitó el modo legado); sombras suaves parcheando
  `ShaderChunk.lights_fragment_begin` (en r170 `onBeforeCompile` ve el template sin expandir). Los
  dados reactivan la gestión de color sólo mientras construyen materiales (`withColorManagement`).
- Shell: `render.syncStageMode()` monta/desmonta según `is25()`; en 2.5D los canvas 2D se ocultan,
  `loop` sólo hace `Net.tick()`, los handlers de puntero/teclado de `editor.js` devuelven pronto y el
  rail muestra sólo Seleccionar/Desplazar. `#stage canvas{pointer-events:none}` ⇒ el motor escucha en
  `#stage`. El entorno y la luz ambiental de la escena llegan al motor por `D3.setEnv` (local y remoto).
- **Terreno persistente (fase B).** Tabla `terrain` (migración 005): una fila por escena 2.5D con
  `n`, `h`/`m`/`chan` (un byte por celda: altura 0..9, material 0..6, cauce), `extras` jsonb
  (objetos por celda con `kind/rot/locked/open`, piezas de pared `'wall:dir'`, manantiales, desagües,
  agua inicial `pools`, ajustes, `scene` y `off` del borde) y `version`. `server/terrain.js` es un
  **módulo puro** (sin three, sin red) con el formato, los límites, los catálogos de juego (`MATS`,
  `OBJ_KINDS`), la generación de las escenas de muestra (`valle`, `cripta`, `blank`), `cleanTerrainOp`
  y `applyTerrainOp`; `public/js/d3/catalog.js` repite los catálogos y un test impide que diverjan
  (también con las banderas de `art.js`). El agua (`W`) no se guarda ni viaja: cada cliente la simula
  desde las fuentes.
- **Protocolo `terrain`.** El estado (`t:'state'`) incluye `terrain` (base64). Mensaje
  `{t:'terrain', scene, op:{type, …, version}}` con `type` ∈ cells · grow · obj · door · mount · water ·
  settings. El servidor: `cleanTerrainOp` → `terrainOpAllowed` (director todo; jugador sólo `door` con
  `playersDoors` y puerta sin `locked`) → si `op.version ≠ version` responde `full` sin aplicar →
  `applyTerrainOp` → `terrainDirty` (lo vuelca `flush()` con `upsertTerrain`) → `ack` al emisor y
  `{op, version}` al resto de la escena. Op inválida o sin permiso → `{fix:true, full}`. `want:'full'`
  devuelve el blob. El cliente aplica en local con `version+1` antes de enviar (`input.sendOp`); un
  conflicto se resuelve recargando el `full`. `grow` se aplica con el mismo borde y los mismos árboles
  aleatorios en servidor y cliente (misma semilla `rng(off*131+n)`).
- **Fichas y luces (fase C).** No hay modelo nuevo: el motor **refleja** `S.tokens`/`S.lights` del
  estado clásico. `chars.syncTokens/syncLights` crean, actualizan y borran sprites por el id de
  JA-VTT (`c.vid`); las fichas de la escena de muestra tienen `vid=null` y no se tocan. Casilla ↔
  píxel: `cellFromPx(x,y) = I(⌊x/CELL⌋+OFF, ⌊y/CELL⌋+OFF)` y `pxOfCell` (centro de la casilla), con
  `CELL=50` (`G.cellPx`, por `opts.cell`) y `G.OFF` = cuánto creció el mundo por el lado negativo.
  `token.art` elige la criatura de `CHAR_INFO` (si no vale: `guerrera` para jugadores, `goblin` para
  enemigos). `light.mount {cell,dir}` cuelga la luz de la cara `dir` de la celda `cell`. Cada luz
  lleva su definición real (`l.def`, de `light-map.js`) y `vision.defOf(l)` la usa en vez del preset:
  así `bullseye`, `window` y `custom` alumbran con sus radios aunque el diorama no los tenga (el cono
  de la linterna sorda no se dibuja aún: alumbra en redondo). `window.S` se publica desde `core.js`
  porque los módulos ES no ven los `const` del ámbito global de los scripts clásicos.
- **Refresco del motor.** `net.js` llama a `D3.syncObjects()` tras cada `state`/`ops`; como el servidor
  **no hace eco de las ops al emisor**, `editor.changed()` también lo llama en 2.5D para que quien
  edita vea su cambio. El motor tiene bandera `ready`: montar es inmediato pero `start()` carga el
  arte de forma asíncrona; hasta entonces `syncObjects` no hace nada y `setView` guarda la vista
  pendiente (sin esto `addChar` reventaba con `ART.art=null`). El entorno del tablero se pasa al
  montar (`opts.env/ambient`) y se aplica de golpe en el primer fotograma (`setEnv(…, true)`).
- **Movimiento.** Clic en ficha controlable → `select`; clic en casilla → `findPath` (alturas ≤1,
  objetos, fichas) y animación por tramos; al **terminar el camino** `hooks.moved(c)` avisa una sola
  vez y el shell (`editor.onToken25Move`) escribe `x/y` → `changed()` → una `op` normal. Permiso:
  `R.canMove(vid)` = `editor.canMove25` (director: todas; jugador: `canControl`). El servidor no valida
  rutas (como en 2D). Crear fichas: herramientas Ficha/Enemigo del rail en 2.5D llaman a `D3.pickCell`
  y crean la ficha en el centro de la casilla; la herramienta `ficha` del motor no hace nada para que
  ese clic no mueva.
- **Ver como.** `D3.setView({view, uid, gm, shared})`: `view` ∈ `'gm'` (director en vista Director:
  `viewers()=[]`, sin niebla, `uFogOn=0`) · `'party'` · `vid`. `vision.viewers()` reproduce el de
  `core.js`: fichas de jugador con visión y no ocultas; si no soy director y `sharedVision=false`,
  sólo las mías (**y si no tengo ninguna, ninguna**: divergencia deliberada con el 2D, que cae de
  vuelta al grupo — pendiente P-11). `editor.view25()` traduce `UI.role`/`UI.viewAs`/`S.sharedVision`
  y se llama desde `setRole`, el selector «Ver como», `applyState` y `applyOps`. El aviso `#blindNote`
  lo decide el motor (`opts.onBlind`). Las fichas de jugador se ven siempre entre ellas; los enemigos
  sólo si algún observador los ve (`strongView`).
- **Niebla por celda.** `G.exploredUser` (un byte por casilla: 255 explorado, 0 no) se marca en
  `computeVision` cuando algún observador ve la casilla y alimenta `tMem` junto al explorado por
  ficha. `render.loadFog/takeDirtyFog/resetExplored` delegan en D3 cuando `is25()`: el dato viaja como
  `'base64:'+bytes` (frente a `data:image/png;base64,` del 2D), una fila `cx=cy=0` por escena y
  usuario; el servidor sólo acepta ese formato en tableros 2.5D y el PNG en 2D (`handleFog`). Si el
  tamaño guardado no coincide con `N*N` se descarta (el jugador vuelve a explorar). `growWorld`
  recoloca `exploredUser` con el resto del mundo. El director no explora ni sube niebla.
- **Un solo camino de edición (fase D).** Todo lo que el director cambia del terreno pasa por
  `D3.terrainOp(op)` = `input.sendOp`: aplica en local con `version+1` y emite por `onTerrainOp`. El
  servidor no hace eco al emisor (sólo `ack`), por eso el panel no puede limitarse a `Net.terrain`.
  Las ops remotas entran por `applyRemoteOp`, que devuelve `false` si `applyTerrainOp` lanza y así
  `net.js` pide el terreno completo (`want:'full'`).
- **Ajustes 2.5D de la escena (D1).** Viven en `terrain.extras` (`style, fogAlpha, mist, cutOn, cutH,
  focus, autoGrow, evap, edgeDrain`) y viajan por la op `settings`. `D3.settings25()` los lee para el
  panel «Mapa 2.5D»; `style` se aplica con `chars.restyle` (que reasigna también el atlas del terreno
  vía `hooks.atlasChanged`) y se lee de `extras` al cargar. Estilos: `packs`, `pixel`, `pixel32`, `drawn`.
- **Luces y menú contextual (D2).** La herramienta Luz crea luces de JA-VTT en la casilla tocada o,
  si el clic cae en la cara de un muro más alto (`pickAt().wall`), colgadas: `x,y` = centro de la casilla
  contigua y `mount={cell: pared, dir}` (`D3.pickPlace`). El servidor exige `mountValid` (misma regla
  que el cliente: contigua dentro y más baja) para colgar piezas. Clic derecho sin arrastrar →
  `hooks.context` → `opts.onContext(describePick)`: fichas y luces abren el menú normal de JA-VTT;
  objetos de terreno y piezas colgadas, un menú propio (abrir/cerrar, llave, girar sólo en `fixed`,
  quitar) que manda ops `door`/`obj`/`mount`. La op `obj` **reemplaza** el objeto: `open`/`locked`
  sobreviven sólo si el emisor los reenvía (el menú lo hace; el cliente aplica `open` al recibirla).
- **Arte propio (D3).** `images.category='arte25'` guarda hojas de piezas; `extras.art` guarda
  **rectángulos**, no bitmaps: `tile:<mat>:<top|side|fill>` · `char:<kind>:<idle|run>` · `obj:<kind>` →
  `{imgId, fw, fh, ppc, frames:[[x,y,w,h],…]}` (≤ 64 cuadros; tile 1), y las definiciones
  `newchar:propio-<id>` `{name}` / `newobj:propio-<id>` `{name, move, sight, fixed, mount}`. Op
  `art {add|remove|clear}` (regex de clave `ART_KEY`, ≤ 200 entradas; `char:/obj:propio-*` exigen su
  `new*`; `obj`/`mount` con kind propio exigen `newobj` y, para colgar, `newobj.mount`). El motor recorta
  en cada cliente (`art.setCustomArt(list, getImage)` con `getImg` de JA-VTT; `world.refreshCustomArt`
  reintenta ≤ 20 veces mientras cargan imágenes; los objetos cuya imagen falta esperan en `deferred`)
  y vacía `STYLE_CACHE` para rehacer el atlas. Un kind propio existe en `CHAR_INFO`/`OBJ_KINDS` sólo con
  su arte recortado; antes de rehacerlos, sus instancias se retiran (si no, `removeObj` reventaba) y
  las consultas `isDoor/blocksMove/blocksSight` toleran kinds desconocidos. «Quitar» limpia usos
  (`D3.customArt().uses`, incluidos los diferidos) antes de `art remove`.
- **Aspecto de ficha (D4).** `token.art` = clave de criatura (12 del catálogo + `propio-*`); el editor
  muestra miniaturas generadas por el motor (`D3.artThumb`) en vez del retrato; un `art` de criatura ya
  borrada cae al arte por defecto. `playerUpsert` deja al dueño cambiar `art` (como `img`).
- Pendiente (fase E): cono de la linterna sorda, tamaño de ficha >1, agua/explosiones sincronizadas,
  cascada en servidor al quitar `newobj`/`newchar` (hoy los `obj:`/`char:` asociados los borra el
  cliente). Planes en `superpowers/plans/`.

## Decisiones y trampas

- **Imágenes dentro de PostgreSQL** (bytea): un `pg_dump` respalda todo; a cambio, la base
  crece con los mapas (cuota 500 MB por tablero, 15 MB por imagen).
- **Escalado horizontal no soportado**: el estado vivo está en memoria de un proceso.
  Una réplica = un proceso.
- **`ON CONFLICT DO NOTHING` en `addMember`**: unirse dos veces es idempotente.
- El cliente sigue guardando preferencias en `localStorage` con prefijo `jav.`.
