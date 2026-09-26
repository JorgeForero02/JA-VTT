# 05 — Runbook

## Postgres de pruebas (puerto 55433)

Con Docker:

```bash
docker run -d --name tp-test-pg -e POSTGRES_USER=tp -e POSTGRES_PASSWORD=tp \
  -e POSTGRES_DB=tp_test -p 55433:5432 postgres:16-alpine
```

Sin Docker (como en las sesiones T1–T7), un Postgres 16 local con usuario `tp`:

```bash
initdb -D <carpeta> -U tp --auth=trust
pg_ctl -D <carpeta> -o '-p 55433' -l <carpeta>/log start
psql -h localhost -p 55433 -U tp -d postgres -c "CREATE DATABASE tp_test"
```

`tp-test-pg` (o el local) es la base que usan los tests por defecto (`TEST_DATABASE_URL`, ver
`test/helpers/db.js`). **Los tests borran los esquemas `public` y `t3d` enteros**: nunca apuntarlos a otra base.
Usa el puerto 55433 para no chocar con el `jav-test-pg` de Just Another VTT (55432).

## Desarrollo sin Docker para la app

```bash
DATABASE_URL=postgres://tp:tp@localhost:55433/tp_test PORT=3000 node server.js   # o npm start
```

## Comandos

| Qué | Comando |
|---|---|
| Lint | `npm run lint` |
| Tests (170) + cobertura con umbral (`server/**` y `modules/**/*.js` sin `public/`) | `npm test` — serie, contra `TEST_DATABASE_URL` (por defecto `postgres://tp:tp@localhost:55433/tp_test`) |
| Lint + tests | `npm run check` |
| Arrancar la app | `npm start` (= `node server.js`; necesita `DATABASE_URL`, `PORT` opcional) |
| Prueba visual (96 pasos) | `npm run test:ui` (ver abajo; `BASE_URL` por defecto `http://localhost:3999`) |
| Humo en Just Another VTT (20 pasos) | `npm run test:ja-vtt` (ver abajo; `BASE_URL` por defecto `http://localhost:3000`) |
| Pila local | `docker compose up -d --build` · `docker compose logs -f app` · `docker compose down` |
| E2E contra la pila (13 pasos) | `npm run test:e2e` (`BASE_URL` para otra URL, por defecto `http://localhost:3000`; `E2E_RESTART=no` si no puede reiniciar el contenedor) |
| E2E sin Docker | servidor local (`npm start` con `DATABASE_URL`) y `E2E_RESTART=no npm run test:e2e` (así se verificó T7: 13/13) |
| Consola SQL | `docker compose exec db psql -U tp -d tp` |
| Backup / restore | ver [03-despliegue.md](03-despliegue.md) |

> Si `npm test` falla por cobertura (`does not meet threshold`) con todos los tests en verde, no bajes
> el umbral: añade el test que falta. Los umbrales viven en `package.json` (script `test`). El cliente
> no entra en la cobertura (se prueba por contrato en `test/frontend.test.js` y
> `test/cliente-armonia.test.js`, y visualmente con `npm run test:ui`).

## Prueba visual (Playwright)

```bash
psql -h localhost -p 55433 -U tp -d postgres -c "CREATE DATABASE tp_ui"   # una vez (con Docker: docker exec tp-test-pg psql …)
DATABASE_URL=postgres://tp:tp@localhost:55433/tp_ui PORT=3999 node server.js &
npm run test:ui          # 96 pasos: cuentas, módulo 3D (montaje, globales, desmontaje, montaje sin net como en JA-VTT), edición, luces (12 tipos, linterna sorda girada con R), techos (a cuatro aguas de pizarra con la herramienta, R, guardado), escenas y «Taller de luces», fichas (tamaños, Grande que no pasa una puerta, estados; capturas 09 de día y de noche), el pueblo (techos de cada material y forma, estructuras, cada vecino con su personaje; capturas 10 de día y de noche desde el sureste y el noroeste y de cerca en la plaza y el molino, 10c/10d), arte por tamaño (capturas 11), desfile de los 21 personajes de fábrica junto a casas, techos y árboles (escena importada; capturas 12 de día y de noche), muros y portales (los siete tipos de JA-VTT, llave, ventana, velo, maleza y barrera; dos escenas enlazadas, cruzar y reunir al grupo; capturas 13 y 14 de día y de noche), ambiente e interiores (los cuatro momentos de JA-VTT con fundido, deslizador y deshacer, una casa de día con la luz de su ventana, una zona interior pintada en campo abierto que se oscurece y oculta al goblin en la niebla hasta que hay una antorcha, guardado con `env`/`ambient`/`darkColor`/`zoneCells`, una escena de antes con `night` que abre de noche; capturas 16), dibujo (con un caballero redibujado que sustituye al de fábrica), invitación, mesa en vivo (el jugador ve el atardecer que pone el director, captura 07b; con puertas: el jugador no abre la de llave ni con `playersDoors` apagado, no ve la barrera; captura 15), ajustes de JA-VTT y privacidad en la mesa en vivo (T6d: con «Sólo el director» el jugador no recibe la vida ni la CA del goblin, con «sólo la barra» sólo la barra —captura 17—, el lobo oculto no le llega ni le corta el paso, la iniciativa oculta y luego mostrada sin la ficha oculta, el círculo del director sólo al publicarlo y el cubo del jugador para todos —captura 18—, la anotación «Sólo el director» no le llega, sin dados con «Dados» apagado, cuadrícula; la tirada en `chat_messages` con el cuerpo de JA-VTT), móvil
```

Integración en Just Another VTT (con JA-VTT en marcha y los pasos de [08](08-integracion-ja-vtt.md)):

```bash
BASE_URL=http://localhost:3000 npm run test:ja-vtt   # 20 pasos: selector Mesa 2D/3D, la mesa 3D abre en 3D, pestañas, iconos, teclado, mesa en vivo, la tirada en su chat como tirada, los ajustes del 3D en su pestaña Mesa (una vez, sin la iniciativa 2D), los «Dados» de JA-VTT bloquean las tiradas 3D, el «Chat de texto» del 3D apaga el de JA-VTT, el 2D no dibuja con el 3D abierto, tipo fijo, mesa 2D sin módulo, etiquetas del panel
```

Copia de prueba de JA-VTT sin Docker (así se verificó T8): `git clone <ja-vtt> <carpeta>` (nunca un worktree del
repositorio de referencia), `git checkout d68f41f`, aplicar [08](08-integracion-ja-vtt.md), enlazar o instalar sus
`node_modules`, y con el Postgres de pruebas:

```bash
psql -h localhost -p 55433 -U tp -d postgres -c "CREATE DATABASE jav_test" -c "CREATE DATABASE jav_run"
TEST_DATABASE_URL=postgres://tp:tp@localhost:55433/jav_test npm run check        # en la carpeta de JA-VTT
DATABASE_URL=postgres://tp:tp@localhost:55433/jav_run PORT=3997 node server.js &   # parar con kill <PID>, nunca pkill -f node
BASE_URL=http://localhost:3997 npm run test:ja-vtt                                   # en este repo
```

Borrar las bases al terminar (`DROP DATABASE jav_test`, `jav_run`).

Las dos pruebas usan el Edge o Chrome instalado (`channel`, no descargan navegadores); en un servidor
sin ellos, `CHROMIUM_PATH=/ruta/a/chrome`. El tablero necesita WebGL: la prueba lanza el navegador con
SwiftShader, que funciona sin GPU. Capturas en `test/e2e/capturas/` (ignorada por git) o en la carpeta
que se pase como argumento: `BASE_URL=http://localhost:3998 node test/e2e/ui.mjs /tmp/capturas`.

## Añadir una migración

1. Del núcleo: `server/migrations/NNN-<nombre>.sql`. Del tablero 3D:
   `modules/tablero3d/migrations/NNN-<nombre>.sql`, siempre con `t3d.` delante de cada tabla y
   con `IF NOT EXISTS` (la misma migración tiene que valer en una base de JA-VTT).
2. Arrancar la app (o `npm test`): se aplica y se anota en `public.schema_migrations` o
   `t3d.schema_migrations`. El módulo migra después del núcleo.
3. Documentar el modelo en [01](01-arquitectura.md) si cambia (y, si es del módulo, en
   [`modules/tablero3d/README.md`](../modules/tablero3d/README.md#datos-esquema-t3d)).

## Gotchas

- `npm test` con decenas de fallos `ECONNREFUSED 127.0.0.1:55433` y la cobertura por debajo del umbral: el
  Postgres de pruebas no está levantado (ver arriba), no es un fallo del código.
- Postgres local que se cae con «could not stat data directory … Permission denied»: el usuario
  `postgres` tiene que poder recorrer toda la ruta de la carpeta de datos. En las sesiones en la nube la
  carpeta temporal de la sesión vuelve a quedar en 0700; poner el clúster en `/var/lib/postgresql/…`
  (así se verificó el 2026-09-26).
- `node --test test/` falla con «Cannot find module»: hay que pasar el glob `"test/*.test.js"`
  (ya lo hace `npm test`).
- Los tests se ejecutan en serie (`--test-concurrency=1`) porque comparten la base.
- Cambiar la migración 001 exige `docker compose down -v` en local (ya está aplicada en el volumen).
- **Documento nuevo de la mesa en vivo** = dos sitios: `LIVE_KEYS` en `modules/tablero3d/rules.js`
  (y el `CHECK` de `t3d.live_docs`, con migración del módulo) **y** el `DB.doc('live/…')` del motor. El test de contrato
  de `frontend.test.js` avisa si se desincronizan.
- **Tipo de mesa**: todo lo del 3D exige fila en `t3d.boards`. Un test que cree un tablero con
  `db.createBoard` (sin pasar por `POST /api/boards`) tiene que marcarlo (`t3d.markBoard(id)` o
  `POST /api/t3d/boards/:id`) o recibirá 404 «Este tablero no es una mesa 3D». Un tablero de este repo
  que no se vea en 3D se arregla reiniciando la app (`allBoards3D` marca todos al arrancar).
- La cookie de sesión es `jav_session` (antes `tp_session`): tras actualizar, cada usuario vuelve
  a iniciar sesión una vez.
- **Cliente del módulo 3D** (`modules/tablero3d/public/`, servido en `/t3d/`): un id nuevo en
  `t3d.html` lleva el prefijo `t3d-` y el motor lo busca **sin** prefijo con `$('nombre')`; una
  clase propia, `t3d-…`, y su estilo en `t3d.css` bajo `.t3d-root`. Sin prefijo sólo componentes del
  anfitrión que también existan en JA-VTT. `test/frontend.test.js` avisa de cada desliz.
- **Material o forma de techo nuevo**: tres sitios, `ROOF_MATS`/`ROOF_MAT_IDS` o `ROOF_SHAPES`/`ROOF_SHAPE_IDS` del
  motor (el material, con su casilla libre del atlas pintada con `paint`), `ROOF_MATS`/`ROOF_SHAPES` de
  `modules/tablero3d/rules.js` y, la forma, su caso en `roofGeo`. `frontend.test.js` compara `normRoof` con
  `cleanRoof` y avisa de casillas repetidas. Un objeto por capas nuevo entra solo en «Todo el arte» (`OBJ_TARGETS`
  sale de `PROP3D`); el test exige que pinte algo y que `N`×4 ≤ 256 y `H`×4 ≤ 512 (editable a 64 px).
- **Personaje de fábrica nuevo** (Mediano): su rejilla en `personajes.js` (24 filas × 16 letras por vista,
  colores de las rampas que recibe `art(P)`; `like` para otra paleta de las mismas filas), su fila en `CHARS`
  del motor (sprite, nombre, tamaño) y, si no es un jugador de 20 PG, su ficha en `SHEET_OF`. `frontend.test.js`
  comprueba filas, letras, contorno, colores de la paleta y nombres (`MEDIUM` y la lista de nombres); el desfile
  de `test:ui` (`PARADE`) cuenta 21. Uno Grande o mayor se modela con `sculpt` en el motor (T5b).
- **Momentos de luz de JA-VTT** (T6c): si JA-VTT cambia `ENVS` (su `core.js` o su `server/rules.js`), regenerar
  `test/fixtures/ja-vtt/envs.json` y ajustar `ENVS` de `modules/tablero3d/public/ambiente.js` y `ENVS` de
  `modules/tablero3d/rules.js`; un momento nuevo necesita además su fila en `LOOK` (tinte y cielo). `Ambiente.norm` (cliente)
  y `cleanEnv` (servidor) deben leer igual una escena (también las de antes con `night`): un test los compara. El ambiente
  por casilla viaja al sombreador en la textura `uAmbT`: un material nuevo que tenga que oscurecerse en las zonas
  interiores lleva `...ambU` en sus uniformes y llama a `lightFor(s, torch, ambAt(p))` (el tejado, con `1.0`).
- **Tipos de muro de JA-VTT** (T6b): si JA-VTT cambia `WALL_TYPES` o `WALL_KINDS`, regenerar
  `test/fixtures/ja-vtt/wall-types.json` y ajustar `WALL_TYPES` de `modules/tablero3d/public/muros.js` y `WALL_KINDS`
  de `modules/tablero3d/rules.js` (el contrato de `frontend.test.js` dice qué falta). **Aspecto de portal nuevo**: su
  objeto por capas en `PROP3D` (oculto y `block`), su fila en `Muros.PORTAL_LOOKS` y su id en `PORTAL_LOOKS` de
  `rules.js`. `Muros.normProp` (cliente) y `cleanWallProp` (servidor) deben leer igual un objeto de muro: un test los
  compara.
- **Objeto que se pisa o de varias casillas**: además de `walk`/`span` en `PROP3D`, `Muros.PASSABLE`/`Muros.SPANS` y
  `PASSABLE_PROPS`/`PROP_SPANS` de `rules.js` (el servidor coloca con ellos a las fichas que cruzan un portal);
  `frontend.test.js` los compara con `PROP3D`.
- **Puertas en la mesa en vivo**: el servidor sólo deja a un jugador abrir o cerrar puertas que estén en la escena de
  la mesa (`live/board`), sin llave y con `playersDoors`: un test que abra puertas como jugador tiene que publicar
  antes una escena con esa puerta.
- **Ajustes de tablero de JA-VTT** (T6d): si JA-VTT cambia `BOARD_KEYS`, `DEFAULT_BOARD`, `HP_VISIBILITY`, `DEFAULT_SCENE` o los
  textos de «Reglas para jugadores» / «Chat, dados y fichas», regenerar `test/fixtures/ja-vtt/board-settings.json` y ajustar
  `DEFAULT_SETTINGS`/`SCENE_FLAGS` de `modules/tablero3d/rules.js`, `DEFAULTS`/`SCENE_FLAGS` de `public/ajustes.js`, las casillas
  de `t3d.html` (pestaña Mesa) y `BOARD_TOGGLES` del motor (los tests de `test/armonia.test.js` y `test/cliente-armonia.test.js`
  dicen qué falta). Un campo nuevo de la ficha que el jugador no debe ver de fichas ajenas: `sheetFor` de `rules.js`.
- **Dados de JA-VTT**: si cambia su `server/dice.js`, regenerar `test/fixtures/ja-vtt/dice.json` y ajustar
  `modules/tablero3d/dice.js` y `public/dados.js` (la misma cuenta; un test los compara con el fijo y entre sí).
- **Privacidad de la mesa en vivo**: nada del módulo manda un documento de la mesa con `broadcast`; siempre `broadcastDoc`
  (y el `state` con `viewFor`), que lo filtra para cada conexión (`rules.liveDocFor`). Un test que mire lo que recibe un
  jugador tiene que conectar como jugador (`test/privacidad.test.js`).
- Un icono nuevo del módulo: si JA-VTT no lo tiene (`test/fixtures/ja-vtt/icons.json`), va en
  `modules/tablero3d/public/icons-t3d.js`, **no** en `public/js/icons.js` (que es el de JA-VTT tal cual).
- **Tipo de luz nuevo o cambiado en JA-VTT**: regenerar `test/fixtures/ja-vtt/light-presets.json` (sus
  `LIGHT_PRESETS`/`TOKEN_LIGHTS` de `core.js` y `LIGHT_PRESETS`/`ANIMS` de `server/rules.js`) y
  ajustar `LIGHT_TYPES` del motor y las listas de `modules/tablero3d/rules.js`: el contrato de
  `frontend.test.js` dice qué falta. `normLight` (cliente) y `cleanLightProp` (servidor) deben leer
  igual una luz: otro test los compara.
- **Campo nuevo o cambiado en la ficha**: tres sitios, `Fichas.norm` (`modules/tablero3d/public/fichas.js`),
  `cleanSheet` (`modules/tablero3d/rules.js`) y `defaultSheet` del motor; `frontend.test.js` compara
  cliente y servidor con fichas completas. Si sólo lo cambia el director, también `GM_SHEET_KEYS`.
  Estados de JA-VTT nuevos: regenerar `test/fixtures/ja-vtt/conditions.json` (su `CONDITION_IDS` y
  `CONDITIONS`) y, si traen letras nuevas, añadirlas a `GLYPH` del motor (el test lo avisa).
- Fijos de JA-VTT (`test/fixtures/ja-vtt/`: ids, clases, iconos, variables CSS, tipos de luz, estados, tipos de muro, momentos de luz, ajustes del tablero, dados y migraciones, commit
  `d68f41f`): para actualizarlos, ver `test/fixtures/ja-vtt/migrations/README.md`.
- `test/ja-vtt-contract.test.js` crea y borra el esquema temporal `jav_ref` en la base de tests.
- **Cuota y límites de la API del módulo** (T8): el uso es la suma de `size` de `t3d.scenes`, `t3d.campaigns` y
  `t3d.drawings`; lo pone `db.js` al escribir (nunca a mano: una consulta nueva que cambie `data` tiene que poner
  `size` con `jsonOf`). Un documento nuevo que suba el tope de su tipo en `rules.js` (`SCENE_MAX_BYTES`, etc.) sube
  solo su límite de cuerpo (`BODY_LIMITS`); una ruta nueva con cuerpo necesita su entrada en `BODY_LIMITS`.
- **Ajustes integrados** (T8): con `boardSettings`/`setBoardSettings` del anfitrión, `t3d.boards.settings` queda en
  `{}`: mirar los ajustes en `boards.settings` de JA-VTT. Un ajuste nuevo de JA-VTT en `BOARD_KEYS` entra solo en
  `HOST_SETTINGS`; uno sólo del 3D va fuera de `BOARD_KEYS` y se guarda en `t3d.boards.settings`.
- Las claves de los dibujos de casillas llevan `:` (`g:top`); el id en la URL es la clave saneada
  (`g_top`) y la clave original se guarda en `drawings.key`.
