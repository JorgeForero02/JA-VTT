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

## Modo 2.5D (rama `modo-25d-fase-a`; fase A cerrada, B–E en curso)

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
| `index.js` | `createEngine(stage, opts)`: renderer, escena, luces, enlace de módulos, bucle; `window.D3 = {mount, unmount, resize, rotate, setEnv, isMounted}` para los scripts clásicos |

- Look fiel a r128: `THREE.ColorManagement.enabled = false` (global al módulo three) + salida
  `LinearSRGBColorSpace`; luces ×π (r170 quitó el modo legado); sombras suaves parcheando
  `ShaderChunk.lights_fragment_begin` (en r170 `onBeforeCompile` ve el template sin expandir). Los
  dados reactivan la gestión de color sólo mientras construyen materiales (`withColorManagement`).
- Shell: `render.syncStageMode()` monta/desmonta según `is25()`; en 2.5D los canvas 2D se ocultan,
  `loop` sólo hace `Net.tick()`, los handlers de puntero/teclado de `editor.js` devuelven pronto y el
  rail muestra sólo Seleccionar/Desplazar. `#stage canvas{pointer-events:none}` ⇒ el motor escucha en
  `#stage`. El entorno y la luz ambiental de la escena llegan al motor por `D3.setEnv` (local y remoto).
- Pendiente (fases B–E): terreno persistente (`terrain`), ops `terrain`, fichas/luces/niebla, panel,
  arte propio, agua/explosiones. Planes en `superpowers/plans/`.

## Decisiones y trampas

- **Imágenes dentro de PostgreSQL** (bytea): un `pg_dump` respalda todo; a cambio, la base
  crece con los mapas (cuota 500 MB por tablero, 15 MB por imagen).
- **Escalado horizontal no soportado**: el estado vivo está en memoria de un proceso.
  Una réplica = un proceso.
- **`ON CONFLICT DO NOTHING` en `addMember`**: unirse dos veces es idempotente.
- El cliente sigue guardando preferencias en `localStorage` con prefijo `jav.`.
