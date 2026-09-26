# 01 — Arquitectura

Estado técnico al 2026-09-15.

## Stack

| Pieza | Elección | Nota |
|---|---|---|
| Runtime | Node.js ≥ 22.5 (imagen `node:22-alpine`) | `fetch` y `WebSocket` globales se usan en tests |
| HTTP + WebSocket | `node:http` + `server/ws.js` (RFC 6455 propio) | Sin Express ni `ws` |
| Base de datos | PostgreSQL 16, driver `pg` | Única dependencia de producción |
| Cliente | HTML + CSS + scripts clásicos (`public/js/*.js`) que comparten ámbito global; `dice3d.js` es un módulo ES | Sin bundler. three.js + cannon-es vendorizados en `public/js/vendor` sólo para los dados 3D |
| Tests | `node:test` contra un Postgres real | Sin framework |

## Capas

```
public/            Presentación (navegador)
server/app.js      HTTP, API REST, tiempo real, caché de tableros en memoria
server/rules.js    Dominio: saneado de objetos, permisos de jugador, visibilidad
server/auth.js     Dominio: contraseñas (scrypt)
server/db.js       Infraestructura: pool pg, migraciones, TODAS las consultas SQL
server/ws.js       Infraestructura: protocolo WebSocket
modules/tablero3d/ Módulo del tablero 3D (esquema t3d, API /api/t3d, cliente /t3d/, WebSocket /t3d/ws)
```

Regla: **nadie fuera de `db.js` escribe SQL**. `app.js` llama a `q.<consulta>()` o a
`tx(async (t) => …)`; `t` tiene las mismas consultas dentro de una transacción.

## Modelo de datos (`server/migrations/001-inicial.sql`)

`users` (nombre único sin distinguir mayúsculas, `password_hash`) → `sessions` (token en
cookie `jav_session`, 1 año) · `boards` (dueño, `invite_code`, `settings` jsonb,
`active_scene`) → `scenes` (settings jsonb, orden) → `objects` (`data` jsonb; id BIGINT
generado en cliente como `Date.now()*1000+aleatorio`) · `board_members` (rol `gm|player`,
escena en la que está cada uno) · `images` (bytes en `bytea`, miniatura opcional; `board_id`
NULL = sin tablero, ya no se usa) · `fog` (un PNG por casilla, por usuario y escena) · `chat_messages` (texto, tirada o aviso, `body` jsonb)
· `users.recovery_code` (migración 002).

Tiempos en milisegundos desde época (BIGINT). `pg` devuelve BIGINT como texto: `db.js`
registra un parser a `Number` (todos los valores caben en 2^53).

Objetos de tipo `token` en `objects.data`:
- `conditions: string[]` — ids del catálogo `CONDITION_IDS` (`server/rules.js`; espejo `CONDITIONS` en `public/js/core.js`, test de contrato en `frontend.test.js`). Siempre presente.
- `hp?: {cur, max, temp}` — enteros ≥ 0, `cur ≤ max`. Sólo existe si `max` se ha fijado; sin `hp` no hay barra.
- `elevation: number` — pies, entero ±9999, 0 por defecto.
- `ac?: number` — clase de armadura, entero 0–99. Sólo existe si se ha fijado. `R.objectFor` la quita **siempre** de las fichas ajenas antes de enviarlas a un jugador (la CA de un enemigo es del director); la edita el director y el dueño de la ficha.

- `note` — `{x, y, text (≤200), gmOnly}`. Sólo el director la crea/edita (`playerUpsert` devuelve `null` para el tipo). Con `gmOnly` no se envía a jugadores (`visibleTo`); al cambiar `gmOnly` el `handleOps` existente manda `up`/`del`. Capa `notes` en `LAYER_IDS`/`LAYERS`.

Ajustes de **tablero** (`DEFAULT_BOARD`): `hpVisibility: 'all' | 'gm' | 'bar_only'`, `hpEnabled: boolean`, `acEnabled: boolean` y `conditionsEnabled: boolean` (ambos `true` por defecto; si se apagan ocultan barra, badges, pastilla y popover sin borrar los datos). Con `'gm'` el servidor quita
`hp` de las fichas ajenas antes de enviarlas a un jugador (`R.objectFor`, aplicada en `stateFor`, `handleOps`
y `moveUser`; al cambiar el ajuste cada jugador recibe un `state` completo). `'bar_only'` viaja entero y lo
respeta el cliente al pintar (los números se pueden leer desde la consola: aceptado, es cosmética).
Permisos: el dueño de la ficha edita `conditions`, `hp` y `elevation` (`playerUpsert`); el resto de campos
siguen siendo del director.

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
- La regla multitramo es estado de UI (`UI.act.pts`), no viaja por red; su aritmética es `rulerSegments` en `core.js`.
- `SIGTERM`/`SIGINT`: cierra sockets, vuelca todo, cierra el pool y sale. Docker manda
  `SIGTERM` al hacer `restart`/`stop`, por eso nada se pierde.
- Miembros del tablero en caché (`b.members`), refrescada al añadir/quitar.

## Cuentas

Registro abierto (`POST /api/register`) con nombre (2–24 caracteres) y contraseña (≥ 6).
Hash `scrypt$N$sal$hash` con `crypto.scrypt` nativo. Login devuelve el mismo 401 para
usuario inexistente y contraseña mala. Sin rate-limit, sin recuperación de contraseña:
decisión del usuario (proyecto casi privado), ver spec en `superpowers/specs/`.

## Módulo del tablero 3D (`modules/tablero3d`, desde 2026-09-26)

Copiado tal cual del repo `3d-tablero` (`403d6a5`); no se edita aquí. Interfaz en
[modules/tablero3d/README.md](../modules/tablero3d/README.md) y guía de montaje en
`3d-tablero/docs/08-integracion-ja-vtt.md`. Lo que JA-VTT le añade son 78 líneas marcadas
`// t3d` (o `t3d:` en HTML/CSS) en `Dockerfile`, `server/app.js`, `public/index.html` y
`public/js/{main,editor,render,weather}.js`: `grep -n t3d` las encuentra todas.

- **Tipo de mesa**: al crear un tablero se elige Mesa 2D o Mesa 3D y no cambia. Un tablero es 3D
  si tiene fila en `t3d.boards`; el resto del núcleo no cambia de esquema.
- **Datos**: esquema PostgreSQL `t3d` (`boards`, `scenes`, `campaigns`, `drawings`,
  `drawing_layers`, `live_docs`, `schema_migrations`), con claves ajenas a `public.boards` y
  `public.users` en cascada. Migraciones propias (`modules/tablero3d/migrations`, cerrojo
  7318206) que corren **después** de las del núcleo en `prepare()`. Todo su SQL en su `db.js`.
- **Tiempo real**: conexión propia `/t3d/ws` (el `Net` de JA-VTT no reparte a módulos). En una
  mesa 3D el `Net` de JA-VTT se conecta igual: da chat, miembros y la pestaña Mesa.
- **Compartido**: cuentas, cookie, miembros y roles, `chat_messages` (las tiradas del 3D llegan
  como `roll`) y los **ajustes del tablero** (`boards.settings`, única fuente: el 3D los lee y
  cambia con `boardSettings`/`setBoardSettings`).
- **Con la mesa 3D abierta** el bucle 2D no dibuja y el clima 2D se desmonta (`render.js`, `weather.js`).
- **Guardado automático** (cliente del módulo): cada 2 s compara la escena serializada (o la campaña) con
  lo último guardado y, si cambió, la guarda por la API de siempre (`PUT …/scenes/:id`, `…/campaigns/:id`).
- **Conexión**: `Tablero3D.mount` expone `status()` y `ping()`; `main.js` los junta con los del `Net` en
  Mesa → Conexión (`net.js` deja medir su `pong` con `Net.onPong`, línea `// t3d`).
- **Interruptor**: `T3D=off` apaga el módulo (sin migrar, rutas 404, `/t3d/t3d.js` vacío).
- Trampa de tests: `resetSchema()` borra `public` en cascada y deja `t3d` sin sus claves
  ajenas; `test/t3d.test.js` borra también `t3d` antes de empezar.

### Piezas con comportamiento (fase 0, 2026-09-26)

Cimientos para que las fases siguientes añadan piezas propias sin reescribir el motor cada vez. Todo en
`modules/tablero3d/public/catalogo.js` (cliente y servidor, `require()` desde `rules.js`); detalle completo en
[docs/superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md](superpowers/specs/2026-09-26-fase0-cimientos-piezas-design.md) §3.2.

- **Catálogo único** (`Tablero3D.Catalogo` en el navegador, `module.exports` en Node): las 38 piezas de fábrica
  (32 objetos, árbol, brasero, luz, 7 tipos de muro de JA-VTT) más los 10 terrenos, generadas del código de
  antes (`PROP3D`, `WALL_TYPES`, `TERR`), y las consultas por componente (`defOf`, `complete`, `blocksMove`,
  `span`, `isDoor`, `gmOnly`, `wallKind`, `surface`, `isLow`, `emitLight`, `factoryType`, `dedupeUids`,
  `validateDef`) que sustituyen las
  listas repetidas de antes (`DOOR_PROPS`, `PASSABLE_PROPS`, `PROP_SPANS`, en `rules.js` y `muros.js`).
- **Definición** (`schema: 1`; prefijo del id: `f:` fábrica, `p:` pieza del tablero en `t3d.pieces`, `d:`
  calculada de un dibujo de objeto antiguo): `class`, `art`, `shape` (`w`, `d`, `height`, `orient`, `random`,
  `layer`, `low`), `components` (`move.block`, `sight`/`light` — `'none'|'limited'|'block'`, `emitLight`,
  `surface`, `cost`, `hide`, `gmOnly`, `door.lift`, `portal.looks`, `terrain`), `states` (≤ 4, ≤ 4 valores
  cada uno) y `variants` (la última que cumple gana). Campos reservados sin usar todavía: `level`/`side`
  (pisos y muros finos, fase 4), `interactions`/`reactions` (fases 2 y 5). Nombres de estado reservados
  (no puede llamarse igual que un campo de la pieza colocada): `type def uid x z v level side state id look
  target name preset r h color intensity anim angle rot darkness on open locked`.
- **Pieza colocada** (un elemento de `props[]` en la escena, formato v2): `type`, `def?` (si falta, sale de
  `type`), `uid` (`'u'` + 8 caracteres `[a-z0-9]`, fijo desde que la pieza existe), `x`, `z`, `v`, `state?`
  según la definición y los campos propios de siempre (puerta: `open`/`locked`; luz: `preset`, `r`, `h`…;
  portal: `id`, `look`, `target`). **Vuelta atrás**: una puerta escribe su estado en `state` **y** en
  `open`/`locked` de la raíz (lo que lee la versión anterior); la copia se quita en la fase 2.
- **`t3d.pieces`** (migración `007-piezas.sql`): definiciones propias del tablero (`p:`), clave
  `(board_id, id)`, en cascada con `public.boards`; cuentan en la cuota (500 MB) por su tamaño. Tope: 300 por
  tablero, 64 KB por definición. API: `GET/PUT/DELETE /api/t3d/boards/:id/pieces[/:pid]` (ver
  [02](02-funcional.md)).
- **`blockCells`** (Ruling R18, campo derivado, nunca guardado): al jugador, `sceneFor`/`campaignFor`/
  `liveDocFor` sustituyen las piezas `gmOnly` que bloquean el paso (barreras) por un conjunto de índices de
  casilla (`z*w+x`), sin tipo ni arte. El cliente (`Muros.gridOf`, `PATHG.open`, `occupied`) las trata como
  impasables y no las dibuja: restaura el comportamiento de antes de la fase 0 (el jugador no cruzaba la
  barrera) sin revelarle la pieza. Es la base de las puertas secretas (fase 2).
- **Reglas de durabilidad** (decisión del usuario: «será la base y será caro de cambiar»): claves de datos en
  inglés siempre; una escena vieja (v1, sin `def`/`uid`/`state`) se completa al leerla, nunca se traduce con
  pérdida; el servidor valida cada pieza contra su definición (`cleanProp`) y descarta lo que no resuelve,
  salvo una pieza `p:` cuya definición falta, que se conserva **opaca** (sólo `type`, `def`, `uid`, `x`, `z`,
  `v`, `level`/`side` y un `state` plano), como en el cliente; al jugador no le llega y su casilla le sale en
  `blockCells` (fallar cerrado). Borrar una definición `p:` en uso (escenas, campañas, mesa en vivo cargada o
  volcada) o cambiarle la `class` responde 409; una definición de terreno propio, 400 (fase 3).
- **Por componentes, no por tipo** (ola final): lo que decide por tipo (`'portal'`, `'light'`, `'window'`,
  `'stairs'`, `'tree'`…) usa `Catalogo.factoryType` (sólo piezas `f:`), en el servidor y en el cliente. En el
  motor, una pieza sin `wallKind` que pueda tapar vista, luz o maleza entra en `WALLAT` en todas sus casillas y
  `GRID.bk` pregunta a `Catalogo.blocks` con las definiciones del tablero; `WALLAT` guarda varias piezas por
  casilla y tapa si alguna tapa (P-48). Una puerta `p:` tiene los estados `open`/`locked` de la de fábrica
  (spec §3.2) y bloquea, se abre y se toca en todas las casillas de su huella, como `gridOf` del servidor (P-48). Si `/pieces` falla, la escena y la mesa se abren igual (las `p:`
  quedan opacas) y sólo el guardado espera; al llegar las definiciones se rehacen luz y niebla.

## Decisiones y trampas

- **Imágenes dentro de PostgreSQL** (bytea): un `pg_dump` respalda todo; a cambio, la base
  crece con los mapas (cuota 500 MB por tablero, 15 MB por imagen).
- **Escalado horizontal no soportado**: el estado vivo está en memoria de un proceso.
  Una réplica = un proceso.
- **`ON CONFLICT DO NOTHING` en `addMember`**: unirse dos veces es idempotente.
- El cliente sigue guardando preferencias en `localStorage` con prefijo `jav.`.
