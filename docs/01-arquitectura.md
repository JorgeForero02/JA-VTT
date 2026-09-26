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
- **Interruptor**: `T3D=off` apaga el módulo (sin migrar, rutas 404, `/t3d/t3d.js` vacío).
- Trampa de tests: `resetSchema()` borra `public` en cascada y deja `t3d` sin sus claves
  ajenas; `test/t3d.test.js` borra también `t3d` antes de empezar.

## Decisiones y trampas

- **Imágenes dentro de PostgreSQL** (bytea): un `pg_dump` respalda todo; a cambio, la base
  crece con los mapas (cuota 500 MB por tablero, 15 MB por imagen).
- **Escalado horizontal no soportado**: el estado vivo está en memoria de un proceso.
  Una réplica = un proceso.
- **`ON CONFLICT DO NOTHING` en `addMember`**: unirse dos veces es idempotente.
- El cliente sigue guardando preferencias en `localStorage` con prefijo `jav.`.
