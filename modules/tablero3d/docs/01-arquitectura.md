# 01 — Arquitectura

Estado técnico al 2026-09-26 (cierre de la ronda T1–T7). Es la de Just Another VTT (rama `release`)
aplicada al tablero 3D: un **núcleo** con la forma del de JA-VTT más el **módulo** `modules/tablero3d`.
Lo interno del módulo (interfaz con el anfitrión, mesa en vivo, formato de los documentos,
`Tablero3D.mount`, motor 3D) está en su propia referencia,
[`modules/tablero3d/README.md`](../modules/tablero3d/README.md), que viaja con la carpeta.

## Stack

| Pieza | Elección | Nota |
|---|---|---|
| Runtime | Node.js ≥ 22.8 (`engines`; imagen `node:22-alpine`) | `fetch` y `WebSocket` globales se usan en tests; el umbral de cobertura de `node --test` exige 22.8 |
| HTTP + WebSocket | `node:http` + `server/ws.js` (RFC 6455 propio, copia del de JA-VTT) | Sin Express ni `ws` |
| Base de datos | PostgreSQL 16, driver `pg` | Única dependencia de producción |
| Cliente | HTML + CSS + scripts clásicos: anfitrión en `public/`, módulo 3D en `modules/tablero3d/public/` (servido en `/t3d/`) | Sin bundler. three.js r128 vendorizado en `modules/tablero3d/public/vendor` |
| Tests | `node:test` contra un Postgres real; Playwright para la prueba visual | Sin framework |

## Capas

```
public/                        Presentación del anfitrión (navegador): la forma de JA-VTT
server/                        NÚCLEO, con la forma del de JA-VTT (al unir se usa el de JA-VTT)
  app.js                       HTTP, cuentas, tableros, miembros, chat, WebSocket; monta el módulo
  rules.js                     Dominio del núcleo
  auth.js                      Contraseñas (scrypt) — idéntico a JA-VTT
  db.js                        Pool pg, migraciones y TODAS las consultas del núcleo
  ws.js                        Protocolo WebSocket — idéntico a JA-VTT
modules/tablero3d/             MÓDULO del tablero 3D, montable en JA-VTT (ver su README)
  index.js                     createTablero3D(host): API /api/t3d/, mesa en vivo en memoria
  rules.js                     Saneado, permisos del jugador, privacidad por rol
  dice.js                      Dados de JA-VTT (el servidor tira)
  db.js                        TODAS las consultas del módulo (esquema t3d) y sus migraciones
  migrations/NNN-*.sql         Esquema t3d, control en t3d.schema_migrations
  public/                      Cliente del módulo, servido en /t3d/ (Tablero3D.mount)
```

Regla: **nadie fuera de `server/db.js` escribe SQL del núcleo, y nadie fuera de
`modules/tablero3d/db.js` escribe SQL del módulo**. Se llama a `q.<consulta>()` o a
`tx(async (t) => …)`; `t` tiene las mismas consultas dentro de una transacción.

### Montaje del módulo en este repo

`server/app.js` crea el módulo con `allBoards3D` y monta en el bloque «módulo t3d» y las líneas
marcadas `// t3d`: crear, migrar tras el núcleo, `/api/t3d/`, estáticos `/t3d/` (`t3d.serve`),
`state` + mensajes WS por el `/ws` del núcleo (`join`/`ws`/`leave`), `/t3d/ws` en el `upgrade`,
cierre de conexión, expulsión (`kick`), alta (`markBoard` en `POST /api/boards`: todo tablero es 3D)
y borrado de tablero, panel (`describeBoards`) y apagado. JA-VTT monta el mismo módulo con su conexión
propia `/t3d/ws` y elige el tipo de mesa en «Nuevo tablero»: [08](08-integracion-ja-vtt.md).

### Cliente anfitrión

El cliente son dos piezas: el **anfitrión** (`public/`, con la forma del de JA-VTT: entrada, panel de
tableros, perfil, cabecera, panel lateral con pestañas y participantes) y el **módulo tablero 3D**
(`/t3d/t3d.js` y lo que carga), que el anfitrión monta al abrir un tablero con
`Tablero3D.mount(root, { net: Net, … })`.

| Archivo | Qué hace |
|---|---|
| `public/js/store.js` | `$`, `apiJson`, `withBusy`, `toast` (las mismas utilidades que JA-VTT) |
| `public/js/icons.js` | Iconos Lucide (`ICONS`, `svgIcon`, `hydrate`): exactamente los de JA-VTT (lo comprueba `test/frontend.test.js`) |
| `public/js/net.js` | `Net`: WebSocket del tablero abierto (estado, miembros, conectados, avisos). Para los módulos: `onMessage(fn)` (cada mensaje del servidor) y `sendRaw(obj)` (mismo nombre que en JA-VTT) |
| `public/js/main.js` | Entrada, panel de tableros, perfil, rutas `#/tablero/<id>`, cabecera, pestañas (`selectTab`), secciones plegables recordadas y participantes; llama a `Tablero3D.mount` y recarga la página al cambiar de tablero |

Preferencias en `localStorage`: el anfitrión guarda `tp.pestana`, `tp.paneles` y `tp.panel` (JA-VTT
usa `jav.`); el motor, `tablero:*`.

## Modelo de datos

Núcleo en `public` (`server/migrations/`, mismas columnas que JA-VTT tras sus migraciones 001–004,
probado en `test/ja-vtt-contract.test.js`): `users` (nombre único sin distinguir mayúsculas,
`password_hash`, `recovery_code`) → `sessions` (token en cookie `jav_session`, 1 año, como JA-VTT) ·
`boards` (dueño, `invite_code`, `settings` jsonb, `active_scene`) · `board_members` (rol `gm|player`,
`scene_id`) · `chat_messages` (tiradas de la mesa, las últimas 200). `active_scene` y `scene_id` sólo
existen para tener el núcleo de JA-VTT; aquí quedan en NULL.

Módulo en el esquema `t3d` (detalle de columnas y documentos en el
[README del módulo](../modules/tablero3d/README.md#datos-esquema-t3d)): `boards` (fila = mesa 3D, con
los ajustes del tablero 3D) · `scenes` (mapa 3D en `data` jsonb, con ambiente, zonas, luces, techos,
objetos, muros, portales, planos, anotaciones y personajes con su ficha) · `campaigns` · `drawings` →
`drawing_layers` · `live_docs` (`board`, `tokens`, `combat`, `doors`, `plans`).

Migraciones del núcleo:
- `001-inicial.sql`, `002-luz-y-capas.sql` — crearon el 3D en `public`.
- `003-nucleo-ja-vtt-y-esquema-t3d.sql` — añade `active_scene`/`scene_id`, crea `t3d` y **muda** las
  tablas del 3D de `public` a `t3d` (`ALTER TABLE … SET SCHEMA`, con datos, claves e índices) si
  existen, son las nuestras (`scenes` con `width`) y el módulo no creó ya las suyas.

Migraciones del módulo (`t3d/`, todo con `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`):
- `001-esquema.sql` — el esquema.
- `002-tableros-3d.sql` — `t3d.boards`, vacía: en JA-VTT sus tableros siguen siendo 2D.
- `003-arte-por-tamano.sql` — `drawings.char_size` y alto máximo de un dibujo 256 → 384 (un Colosal a 64 px).
- `004-ajustes-del-tablero.sql` — `boards.settings` jsonb (`{}` = los valores por defecto de JA-VTT);
  desde T6d guarda todos sus ajustes de tablero salvo la iniciativa, sin tocar las tablas del anfitrión.
  Integrado con `boardSettings`/`setBoardSettings` (JA-VTT, T8) esos ajustes son los del anfitrión y aquí
  quedan sólo las claves propias del 3D (hoy ninguna).
- `005-planos-en-vivo.sql` — el documento `plans` de `live_docs`.
- `006-tamano-guardado.sql` — `size` en `scenes` y `campaigns` (bytes del JSON guardado, para la cuota); lo
  anterior sin medir (NULL) lo mide `migrate()` al arrancar.

Resultado: una base nueva, una de un despliegue anterior y una de JA-VTT acaban igual (probado en
`test/db.test.js`). Ficheros `NNN-nombre.sql` aplicados en orden al arrancar —núcleo y luego
módulo—, registrados en `public.schema_migrations` y `t3d.schema_migrations`, cada uno bajo su
`pg_advisory_lock`. Tiempos en milisegundos desde época (BIGINT); `pg` devuelve BIGINT como texto y
`db.js` registra un parser a `Number`. Cuota por tablero: 500 MB (dibujos + escenas + campañas), como
la de imágenes de JA-VTT, con una sola medida (T8): la suma de `size` —bytes UTF-8 del JSON que se guarda
de cada escena y campaña y bytes de las capas PNG de cada dibujo—; el documento que se sustituye no cuenta
dos veces. Cada ruta del módulo lee el cuerpo con su límite (`BODY_LIMITS`, [02](02-funcional.md#api-resumen)).

## Tiempo real

- El núcleo guarda cada tablero abierto en `live` (Map: clientes, miembros, cola); el módulo, la mesa
  en vivo del tablero (documentos, pares y presencia) en su propio Map.
- Cada mensaje WebSocket entra en una **cola por tablero** (`enqueue`): los manejadores nunca se
  solapan para el mismo tablero. El núcleo atiende `ping`; el resto va a `t3d.ws`.
- Los cambios marcan `dirty`/`removed`; `flush()` los vuelca cada 400 ms en una transacción, con
  cerrojo y reintento si falla. Sin clientes, el tablero se descarga de memoria tras volcar.
- El módulo reparte cada documento **filtrado por conexión** y valida cada cambio en `rules.js`
  (permisos del jugador, puertas, portales, tiradas): detalle en
  [Mesa en vivo en el servidor](../modules/tablero3d/README.md#mesa-en-vivo-en-el-servidor); mensajes
  en la tabla de la API de [02](02-funcional.md#api-resumen).
- `SIGTERM`/`SIGINT`: cierra sockets, vuelca la mesa del módulo (`t3d.close()`), cierra el pool y sale.

## Decisiones y trampas

- **No se fusiona con JA-VTT**: se copia su forma, no su código de dominio; `auth.js` y `ws.js` son
  copias idénticas a propósito. El módulo se monta en JA-VTT con 78 líneas en 7 archivos ([08](08-integracion-ja-vtt.md)).
- **Escenas como un documento jsonb**, no objeto por objeto como en JA-VTT: el motor 3D serializa
  el mapa entero (alturas y terreno en cadenas de `w×d` caracteres) y así lo carga. Separarlo en
  filas no aporta nada hasta que haya edición colaborativa de escenas.
- **Muros por casilla**, no segmentos finos como JA-VTT (hoja de ruta R13); **sin escena por
  jugador** (la mesa en vivo sigue la escena del director; R15).
- **Dibujos en `bytea`**, como las imágenes de JA-VTT: un `pg_dump` respalda todo.
- **Escalado horizontal no soportado**: la mesa en vivo está en memoria de un proceso.
