# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-26 — Tablero 3D: documentación traída, guardado automático y Mesa → Conexión

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
