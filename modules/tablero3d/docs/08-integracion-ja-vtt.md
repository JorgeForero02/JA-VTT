# 08 — Integrar el tablero 3D en Just Another VTT

Estado al 2026-09-26 (T8: ajustes, recorte del chat, cuota y rendimiento). Guía para montar el módulo `modules/tablero3d` dentro
de Just Another VTT (rama `release`, **commit `d68f41f`**) **sin cambiar nada dentro del módulo**:
sólo se añaden líneas en JA-VTT. Las líneas de JA-VTT que se tocan llevan el comentario `// t3d` (o
`t3d:` en HTML y CSS) para encontrarlas y quitarlas. Antes de empezar, leer
[«Limitaciones conocidas»](#limitaciones-conocidas-antes-de-integrar).

**Tipo de mesa (decisión del usuario, T3b)**: al crear un tablero se elige **Mesa 2D** o **Mesa 3D**
y el tipo **no cambia** después. Una mesa 3D abre directamente la vista 3D (no hay botón para
alternar); una mesa 2D es JA-VTT tal cual, sin rastro del módulo. Las tarjetas del panel llevan la
etiqueta «2D» o «3D».

**Verificado** (T8, 2026-09-26): esta guía aplicada **al pie de la letra** (sus bloques de código, la
tabla del paso 4 y el test recomendado de «Verificación», por un script que los lee de este archivo) sobre
un clon limpio de `d68f41f`: 78 líneas en 7 archivos, como dice «Pasos»; su `npm run lint` limpio; su
`npm test` **98/98** (el mismo número que sin el módulo; funciones 82,05 %, sin el módulo 83,48 %) y
**99/99** con el test recomendado (83,33 %); `npm run test:ja-vtt` (la prueba de humo
`test/e2e/ja-vtt.mjs` de este repo) **20/20** (selector en «Nuevo tablero», la mesa 3D abre en 3D,
pestañas, iconos, teclado, el jugador entra por el enlace, mesa en vivo, la tirada llega a su chat como
tirada, la pestaña Mesa enseña los ajustes una sola vez —los del 3D— y sin la iniciativa 2D, apagar los
«Dados» de JA-VTT bloquea las tiradas 3D en el servidor, el «Chat de texto» del 3D apaga el chat de
JA-VTT, el 2D no dibuja con el 3D abierto, tipo fijo, una mesa 2D sin módulo y con `/api/t3d` 404,
etiquetas del panel, sin errores de consola); con la guía de T7 los cuatro pasos nuevos fallan. Una
tirada 3D con el tablero cerrado en JA-VTT pasa por su recorte del chat (260 mensajes + 55 tiradas →
quedan 217; con la guía de T7, 315). Con `T3D=off`: sin esquema `t3d`, `/t3d/t3d.js` vacío (200), el
resto de `/t3d/` 404 y los ajustes de un tablero 2D siguen igual. Las verificaciones de cada tarea (T3,
T3b, T6d, T7, T8) están en [07](07-historial.md).

Desde T4–T6c las luces, la ficha, los muros y portales y el ambiente son los de JA-VTT sin tocar
ninguna línea suya (el módulo carga sus scripts y aplica sus migraciones solo). **T6d cambió dos
líneas de la guía**: `postChat` pasa el `kind` que recibe (las tiradas llegan al chat de JA-VTT como
tirada, `roll`, y no como texto; 3.1) y el estilo del paso 4 esconde en una mesa 3D las secciones
«Reglas para jugadores» y «Chat, dados y fichas» de la escena 2D, porque el 3D pone las suyas (mismos
textos). **T8** hace de los ajustes del tablero de JA-VTT la única fuente (3.1 `boardSettings` y
`setBoardSettings`, 3.11), recorta el chat también con el tablero cerrado (3.1), esconde su «Iniciativa» 2D
en una mesa 3D (paso 4) y para el dibujo 2D y el clima 2D mientras la mesa 3D está abierta (paso 7).

La interfaz completa del módulo (`createTablero3D(host)`, `Tablero3D.mount`, mensajes, documentos)
está en su [README](../modules/tablero3d/README.md), que viaja con la carpeta; la API, en
[02](02-funcional.md#api-resumen).

## Si ya integraste con la guía anterior (T7 → T8)

Si montaste el módulo con la versión de la guía de 63 líneas en 5 archivos (T7), para ponerte al día:

1. **Vuelve a copiar `modules/tablero3d`** entero (trae la migración `t3d/006-tamano-guardado.sql`, los
   ganchos de ajustes y los límites por ruta). Al arrancar, JA-VTT aplica `t3d/006` y mide lo ya guardado.
2. **`server/app.js` 3.1**: sustituye el bloque entero por el nuevo (adaptador de `postChat` que recorta el
   chat con el tablero cerrado + ganchos `boardSettings` y `setBoardSettings`).
3. **`server/app.js` 3.11** (nuevo): en `handleOps()`, sustituye `if (boardChanged) sendInitiative(b);` por la
   versión que además llama a `t3d.settingsChanged(b.id)`.
4. **Paso 4** (`index.html`): el estilo añade una regla que esconde la «Iniciativa» 2D en una mesa 3D.
5. **Paso 7** (nuevo): una línea al principio del `loop` de `public/js/render.js` y una línea sustituida en
   `public/js/weather.js` (exporta `unmount`).
6. **Recomendado**: el test `test/t3d.test.js` de «Verificación»; sin él la cobertura de funciones de
   JA-VTT queda en 82,05 % frente a su umbral de 82 %.
7. Vuelve a pasar tus tests y `npm run test:ja-vtt` (ahora 20 pasos).

Los ajustes del tablero que se hubieran cambiado desde el 3D con la guía T7 quedaron en
`t3d.boards.settings`; desde T8 mandan los de JA-VTT (`boards.settings`): revisa en la pestaña Mesa que
«Dados», «Chat de texto», visibilidad de la vida, etc. estén como quieres.

## Qué se comparte y qué es del módulo

| Del anfitrión (JA-VTT), compartido | Del módulo |
|---|---|
| Cuentas, sesiones y cookie `jav_session` (el mismo login) | Esquema PostgreSQL **`t3d`**: `boards` (fila = mesa 3D), `scenes`, `campaigns`, `drawings`, `drawing_layers`, `live_docs`, `schema_migrations` |
| Tableros, miembros y roles (`gm`/`player`), invitación | API `/api/t3d/boards/:id` (tipo de mesa) y `/api/t3d/boards/:id/{scenes,campaigns,drawings,usage,settings,travel}` y `…/scenes/:sid/portals` (sólo mesas 3D; lista completa en [02](02-funcional.md#api-resumen)) |
| Chat del tablero (`chat_messages`, con su recorte): recibe las tiradas del 3D. Ajustes del tablero (`b.settings` / `boards.settings`): los del 3D son éstos | Cliente en `/t3d/` (`t3d.js` carga el resto: estilos, marcado, three.js r128, motor) |
| Cabecera, panel lateral, pestañas Mesa y Chat, `toast`, iconos, variables CSS | Conexión en tiempo real propia `/t3d/ws` (mesa en vivo, presencia, tiradas, `travel`, `gather`; el `state` lleva `settings`) |

Las tablas del módulo apuntan a `public.boards(id)` y `public.users(id)` con `ON DELETE CASCADE`:
borrar un tablero o un usuario en JA-VTT borra lo suyo del 3D. El contrato lo prueba
`test/ja-vtt-contract.test.js` con las migraciones de JA-VTT copiadas en
`test/fixtures/ja-vtt/migrations/`: el núcleo de este repo tiene las mismas columnas, restricciones
e índices en `users`, `sessions`, `boards`, `board_members` y `chat_messages`, y el módulo migra
sobre una base de JA-VTT sin tocar ninguna tabla suya (su `public.scenes` incluida), dos veces
seguidas sin error.

## Qué lleva el módulo (para no tocar JA-VTT más de lo necesario)

- **Iconos**: los 25 que usa el 3D y el `ICONS` de JA-VTT no trae viajan en `icons-t3d.js`; `t3d.js`
  los añade al montar. No hay que editar `public/js/icons.js`.
- **Tiempo real**: el `Net` de JA-VTT no reparte mensajes a nadie (su `ws` es privado y su `state`
  depende de la escena 2D). Por eso, **sin la opción `net`**, `Tablero3D.mount` abre su propia
  conexión a `/t3d/ws?board=<id>` y el servidor la atiende con `t3d.socket`. No hay que tocar
  `public/js/net.js`.
- **Estáticos**: `t3d.serve` sirve `/t3d/…` (el `serveStatic` de JA-VTT no admite otra carpeta).
- **Cuerpo JSON**: la API del módulo lee su propio cuerpo con un límite por ruta, sacado del documento
  más grande que acepta (`BODY_LIMITS` de `rules.js`: escena y cruce 2,1 MB, campaña 8,1 MB, dibujo
  42,7 MB —8 capas de 4 MB en base64—, ajustes 64 KB; más, 413 «La petición es demasiado grande: aquí se
  admiten hasta …»); no depende del `MAX_BODY` de JA-VTT (22 MB).
- **Interruptor**: `enabled: false` apaga el módulo entero (sin migrar, rutas 404, `t3d.js` vacío).
- **Tipo de mesa**: lo guarda el módulo en `t3d.boards`; JA-VTT no cambia su esquema. `GET
  /api/t3d/boards/:id` dice si es 3D y el rol; `POST` lo marca (director, idempotente, sólo en los
  **10 minutos** siguientes a crear el tablero); `DELETE` siempre 409 (textos en
  [02](02-funcional.md#api-resumen)). En un tablero 2D las demás rutas del 3D responden 404, `/t3d/ws`
  cierra con 4404 y `join` no lo atiende: no hay forma de quitar la fila (sólo se va al borrar el
  tablero, en cascada) y marcar uno viejo está fuera de plazo.
- **Panel**: `t3d.tagBoards(boards)` sólo **añade** `t3d: true` a las mesas 3D; no toca ningún campo
  de JA-VTT (su `scenes`, el recuento de escenas 2D, queda como está).
- **Ajustes**: con los ganchos de 3.1 son los de JA-VTT (una sola fuente; el módulo los sanea con sus
  reglas, que son las suyas). `t3d.boards.settings` guarda sólo las claves propias del 3D (hoy ninguna).
  Sin esos ganchos (este repo, o el microservicio) el módulo los guarda todos en `t3d.boards.settings`.
- **Portales**: por la API y la conexión del módulo. Todo dentro del módulo: JA-VTT no cambia.

## Pasos

Rutas relativas a la carpeta de JA-VTT. Cada fragmento dice **dónde** va por el nombre de la
función o el elemento, no por número de línea.

En total: la carpeta `modules/` y **78 líneas en 7 archivos** de JA-VTT (`Dockerfile` 1,
`server/app.js` 34, `public/index.html` 15, `public/js/main.js` 25, `public/js/editor.js` 1,
`public/js/render.js` 1, `public/js/weather.js` 1), de las que 7 sustituyen a una línea suya (3.2, 3.5,
3.6, 3.10, 3.11, 5.3 y 7.2): `git diff --numstat` da 78 añadidas y 7 quitadas. Más el test recomendado de
«Verificación» (`test/t3d.test.js`, archivo nuevo). Antes de T8 eran 63 líneas en 5 archivos (5
sustituidas); con el botón 3D de T3, 66.

### 1. Copiar el módulo

```bash
cp -r /ruta/a/3d-tablero/modules /ruta/a/ja-vtt/modules      # queda ja-vtt/modules/tablero3d
```

No lleva dependencias nuevas: usa el `pg` de JA-VTT y el `ws.js` del anfitrión.

### 2. `Dockerfile`

Debajo de `COPY public ./public`:

```dockerfile
COPY modules ./modules
```

### 3. `server/app.js` (11 sitios, 34 líneas; 5 de ellas sustituyen a una de JA-VTT)

**3.1** Justo debajo de `const memberOf = (boardId, uid) => q.member(boardId, uid);`:

```js
/* ---------------- módulo t3d: el tablero 3D (modules/tablero3d) ---------------- */
const { createTablero3D } = require('../modules/tablero3d');
const t3d = createTablero3D({
  enabled: process.env.T3D !== 'off',
  pool: db.pool, touchBoard: q.touchBoard,
  memberRole: async (boardId, uid) => (await memberOf(boardId, uid))?.role || null,
  // las tiradas de la mesa 3D al chat del tablero (kind 'roll', cuerpo de dice.js); sin el tablero en memoria, el mismo recorte
  postChat: async (boardId, user, kind, body) => {
    const b = live.get(boardId);
    if (b) return postChat(b, { user }, kind, body);
    const row = await q.insertChat(boardId, user.id, kind, body);
    if (row.id % 50 === 0) await q.trimChat(boardId, CHAT_KEEP);
  },
  // los ajustes del tablero son los de JA-VTT (b.settings o, sin abrir, boards.settings): el 3D los lee y cambia aquí
  boardSettings: async (boardId) => live.get(boardId)?.settings || Object.assign({}, R.DEFAULT_BOARD, R.splitSettings((await q.board(boardId))?.settings || {}).board),
  setBoardSettings: async (boardId, patch) => {
    const b = live.get(boardId), board = R.splitSettings(patch).board, row = b ? null : await q.board(boardId);
    if (row) await q.setSettings(Object.assign({}, R.DEFAULT_BOARD, R.splitSettings(row.settings || {}).board, board), boardId);
    if (!b) return;
    Object.assign(b.settings, board); b.settingsDirty = true;
    for (const c of b.clients) c.ws.send({ t: 'ops', settings: settingsFor(b, b.scenes.get(c.sceneId), c.role) });
    sendInitiative(b);
  },
});
```

`live`, `postChat(b, c, kind, body)`, `settingsFor` y `sendInitiative` son los de JA-VTT (se declaran más abajo;
sólo se usan al llegar una tirada o un cambio de ajustes); `R`, `q`, `CHAT_KEEP` y `db`, los de arriba del archivo.

- **Tiradas**: `postChat` de JA-VTT sólo lee `c.user`, por eso basta `{ user }`: guarda en `chat_messages`, lo
  reparte a su chat y recorta el historial (`trimChat` cada 50 mensajes). Si el tablero no está abierto en memoria
  (nadie con JA-VTT conectado) se guarda sin repartir **con el mismo recorte**: toda tirada del 3D pasa por él.
- **Ajustes del tablero** (T8): con `boardSettings` y `setBoardSettings` los de JA-VTT son **la única fuente**. El 3D
  lee sus claves (`BOARD_KEYS` salvo `initiative`: `sharedVision`, `playersDoors`, `chatEnabled`, `diceEnabled`,
  `initiativeShown`, `hpVisibility`, `hpEnabled`, `conditionsEnabled`, `acEnabled`) de `b.settings` (o de
  `boards.settings` con los valores por defecto de `DEFAULT_BOARD` si el tablero no está en memoria) y las sanea
  con sus reglas, que son las de JA-VTT; al cambiarlas el director en el 3D, `setBoardSettings` las pone en
  `b.settings` (las guarda el volcado de JA-VTT, `settingsDirty`) y avisa a sus clientes como `handleOps` (`ops`
  con `settings` e iniciativa); sin el tablero en memoria, las escribe en `boards.settings`. Así el «Chat de
  texto» y los «Dados» del 3D apagan el chat y los dados de JA-VTT, y al revés.

**3.2** En `prepare()`, el módulo migra **después** del núcleo:

```js
  const applied = [...await db.migrate(), ...await t3d.migrate()]; // t3d
```

**3.3** En `api()`, debajo de `if (parts[0] === 'images' && parts[1]) return imageRoutes(req, res, user, parts);`:

```js
  if (parts[0] === t3d.name) return t3d.api(req, res, url, user, parts); // t3d
```

**3.4** En `http.createServer(...)`, debajo de `if (url.pathname.startsWith('/api/')) …`:

```js
    if (url.pathname.startsWith('/t3d/')) return t3d.serve(req, res, url); // t3d
```

**3.5 y 3.6** En `server.on('upgrade', …)`, sustituir la comprobación de ruta y la llamada a
`onSocket`:

```js
  if (url.pathname !== '/ws' && url.pathname !== '/t3d/ws') return sock.destroy(); // t3d
  …
    if (ws) await (url.pathname === '/t3d/ws' ? t3d.socket : onSocket)(ws, user, url.searchParams.get('board') || ''); // t3d
```

**3.7** En `boardRoutes()`, rama `DELETE` del dueño, justo antes de `await q.deleteBoard(id);`:

```js
        t3d.onBoardDeleted(id); // t3d
```

**3.8** Primera línea de `function kick(boardId, uid)` (expulsar o salir del tablero):

```js
  t3d.kick(boardId, uid); // t3d
```

**3.9** En `stop()`, debajo de `await flushAll();`:

```js
  await t3d.close(); // t3d
```

**3.10** En `boardRoutes()`, la rama `GET` de la lista de tableros (sustituye a la de JA-VTT):

```js
    if (M === 'GET') return send(res, 200, { boards: await t3d.tagBoards(await q.boardsForUser(user.id)) }); // t3d
```

**3.11** Al final de `handleOps()`, **sustituir** `if (boardChanged) sendInitiative(b); // mostrar u ocultar…` por:

```js
  if (boardChanged) { sendInitiative(b); await t3d.settingsChanged(b.id); } // t3d: la mesa 3D relee los ajustes del tablero
```

Si el director cambia un ajuste del tablero desde JA-VTT, la mesa 3D abierta lo recibe al momento (mensaje `settings` y
la vida, CA e iniciativa que ve cada jugador). Aunque faltara este aviso (p. ej. `handleReplace`, que en una mesa 3D no se
usa), el módulo relee los ajustes de JA-VTT antes de cada tirada, cambio de la mesa y cruce de portal: nunca decide con
unos viejos.

No usar `t3d.describeBoards` en JA-VTT: pisaría su `b.scenes` (sus escenas 2D). Ni `markBoard`
(es para un anfitrión en el que el propio servidor crea mesas 3D, como este repo) ni la opción
`allBoards3D` (convertiría en 3D todos los tableros de JA-VTT). `t3d.join/ws/leave` tampoco hacen
falta (son para un anfitrión que reparta la mesa por su propio WebSocket).

### 4. `public/index.html`

Huecos donde el módulo pone su marcado (`display:contents`: no alteran el diseño). Donde falte uno,
el módulo pone esa parte al final de `#app`.

| Dónde (JA-VTT) | Qué añadir |
|---|---|
| En `<head>`, debajo de `css/app.css` | el bloque `<style>` de abajo |
| `<header>`: justo antes de `<button id="liveBadge"` | `<div data-t3d-slot="scene-button" style="display:contents"></div>` |
| `<header>`: justo antes de `<button id="panelToggle"` | `<div data-t3d-slot="actions" style="display:contents"></div>` |
| `<main>`: justo antes de `<aside id="panel">` (tras `#stageWrap`) | `<div data-t3d-slot="stage" style="display:contents"></div>` |
| Primera línea dentro de `<div class="tabs" role="tablist">` | `<div data-t3d-slot="tabs" style="display:contents"></div>` |
| Justo antes de `<section class="tabpane active" id="tab-scene">` | `<div data-t3d-slot="panes" style="display:contents"></div>` |
| Primera línea dentro de `<section class="tabpane" id="tab-live">` | `<div data-t3d-slot="live" style="display:contents"></div>` |
| Última línea dentro de `#tab-live` (antes de su `</section>`) | `<div data-t3d-slot="live-end" style="display:contents"></div>` |
| En `#newBoardForm`, justo antes de su botón `Crear y abrir` | el selector de abajo |
| Antes de `<script src="js/main.js">` | `<script src="t3d/t3d.js"></script>` |

Selector «Tipo de mesa» (nace oculto; `main.js` lo muestra si el módulo está activo):

```html
        <label class="gateField" id="newBoardTypeField" hidden><span>Tipo de mesa (no se cambia después)</span><select id="newBoardType"><option value="2d">Mesa 2D</option><option value="3d">Mesa 3D</option></select></label><!-- t3d -->
```

Estilo (en una mesa 3D se esconde lo que es sólo de la escena 2D, con `!important` porque
`setRole` de JA-VTT pone `display` en línea en sus pestañas —también su «Iniciativa» de la pestaña Chat, que es
la de las fichas 2D: la del 3D está en Partida—; y la etiqueta 2D/3D de las tarjetas):

```html
<style>/* t3d: en una mesa 3D se esconde lo que es sólo de la escena 2D; etiqueta 2D/3D del panel */
#app.is3d #rail,#app.is3d #stageWrap,#app.is3d #sceneBtn,#app.is3d #roleSeg,#app.is3d #viewAsWrap,#app.is3d #fogOfWrap,
#app.is3d #previewBtn,#app.is3d #undoBtn,#app.is3d #redoBtn,#app.is3d #exportBtn,#app.is3d #importBtn,
#app.is3d .tabs [data-tab="scene"],#app.is3d .tabs [data-tab="lights"],#app.is3d .tabs [data-tab="tokens"],
#app.is3d #tab-live>[data-fold=reglas],#app.is3d #tab-live>[data-fold=mesa],#app.is3d #tab-chat>[data-fold=iniciativa]{display:none!important}
.t3dType{margin-left:8px;padding:2px 7px;border:1px solid var(--line);border-radius:99px;font:700 11px/1 var(--sans);color:var(--fog);vertical-align:middle}.t3dType.is3d{border-color:var(--amber);color:var(--amber)}</style>
```

### 5. `public/js/main.js`: elegir el tipo al crear y abrir la mesa 3D

**Decisión (T3b)**: el tipo se elige en «Nuevo tablero» y es fijo. Al abrir un tablero, `open3d`
pregunta al módulo (`GET /api/t3d/boards/:id`); si es mesa 3D la monta **antes** de conectar el
`Net` de JA-VTT (así su `onBoardReady` ya ve `is3d`) y esconde lo 2D; si no, no hace nada y JA-VTT
sigue igual. No hay botón 3D, ni entrada en el menú de escenas, ni vuelta a 2D.

**5.1** En `renderDash()`, debajo de `const h=document.createElement('h3');h.textContent=b.name;`:

```js
      if(window.Tablero3D){const t=document.createElement('span');t.className='t3dType'+(b.t3d?' is3d':'');t.textContent=b.t3d?'3D':'2D';h.append(t)} // t3d
```

**5.2** En `$('#newBoardForm').onsubmit`, debajo de `const d=await apiJson('/api/boards',…);`:

```js
      if($('#newBoardType').value==='3d')await apiJson('/api/t3d/boards/'+d.board.id,{method:'POST'}).catch(err=>toast(err.message,4000)); // t3d
```

**5.3** En `openBoardView(id)`, **sustituir** `Net.connect(id);` por:

```js
  open3d(id).finally(()=>{if(openBoardId===id)Net.connect(id)}); // t3d: una mesa 3D se monta antes de conectar
```

**5.4** Primera línea de `function onBoardReady()` (su aviso «Crea tu personaje en la pestaña
Fichas» es de la escena 2D):

```js
  if($('#app').classList.contains('is3d'))return; // t3d
```

**5.5** Primera línea de `function leaveBoard(silent)` tras `if(!openBoardId)return;`:

```js
  close3d(); // t3d
```

**5.6** Justo antes del comentario `/* ---------- arranque ---------- */`:

```js
/* ---------- t3d: mesa 3D (modules/tablero3d, servido en /t3d/) ---------- */
let t3dView=null;
async function open3d(id){
  if(!window.Tablero3D)return;
  let b;try{b=(await apiJson('/api/t3d/boards/'+id)).board}catch(err){return}
  if(!b.t3d||openBoardId!==id||t3dView)return;
  $('#app').classList.add('is3d');
  t3dView=Tablero3D.mount($('#app'),{boardId:id,user:App.user,role:b.role,icon:svgIcon,showTab:show3dTab});
  t3dView.ready.then(()=>show3dTab('t3d-scene')).catch(err=>toast(err.message,4000));
}
function close3d(){if(!t3dView)return;t3dView.unmount();t3dView=null;$('#app').classList.remove('is3d')}
function show3dTab(name,reveal){
  UI.tab=name;
  $$('.tabs [data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===name)));
  $$('.tabpane').forEach(p=>p.classList.toggle('active',(p.dataset.pane||p.id.replace(/^tab-/,''))===name));
  if(name==='live')renderLive();
  if(reveal&&narrow())$('#panel').classList.add('open');
}
$('#panel .tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab^="t3d-"]');if(b)show3dTab(b.dataset.tab)});
$('#newBoardTypeField').hidden=!window.Tablero3D;
```

Por qué así: `selectTab` de JA-VTT activa secciones por `id="tab-…"` y engancha sólo los botones
que existían al cargar; las pestañas del módulo usan `data-tab`/`data-pane` con prefijo `t3d-`, así
que `show3dTab` cubre ambas y las pestañas propias de JA-VTT (Mesa, Chat) siguen con su
`selectTab`. El módulo busca la pestaña del hueco `live` por `data-pane` o, si no lo hay, por el id
sin `tab-` (`#tab-live` → `live`). `mount` sin `net` = conexión propia `/t3d/ws`; el rol inicial
sale de la consulta del tipo y luego manda el `state` de esa conexión. El `Net` de JA-VTT se
conecta igual en una mesa 3D: da el chat, los miembros y la pestaña Mesa.

### 6. `public/js/editor.js`: el teclado es del 3D mientras está abierto

En el manejador `window.addEventListener('keydown', …)` de «Teclado», debajo de
`const tag=(e.target.tagName||'').toLowerCase();`:

```js
  if($('#app').classList.contains('is3d'))return; // t3d: el teclado es del tablero 3D
```

Sigue haciendo falta: en una mesa 3D el editor 2D de JA-VTT está cargado (oculto) y su
manejador de teclado sigue escuchando en `window`. Sin esta línea, Ctrl+Z, Supr o las letras de
herramienta del 3D también actuarían sobre la escena 2D oculta.

### 7. `public/js/render.js` y `public/js/weather.js`: el 2D no dibuja con la mesa 3D abierta (T8)

**7.1** Primera línea de `function loop(ts){` en `render.js`:

```js
  if($('#app').classList.contains('is3d')){requestAnimationFrame(loop);Weather.unmount();dirty=true;if(ts-lastNet>40){lastNet=ts;Net.tick()}return} // t3d: con la mesa 3D abierta el 2D no se dibuja
```

**7.2** En `weather.js`, **sustituir** la línea `return{sync,invalidate,resize,mounted,clipPolyRect};` del final de `Weather` por:

```js
  return{sync,invalidate,resize,mounted,clipPolyRect,unmount}; // t3d: la mesa 3D quita el clima 2D
```

Con una mesa 3D abierta, el bucle 2D sigue pidiendo fotograma (vuelve solo al salir) pero no calcula animaciones ni
dibuja el lienzo oculto, y el clima 2D (WeatherFX sobre PixiJS, que lleva su propio bucle de dibujo) se destruye y no
se vuelve a montar mientras dure. `Net.tick()` sigue: manda los cambios de la escena 2D que aún pueda haber (los
ajustes de JA-VTT de sus casillas ocultas). `dirty=true` deja el 2D listo para repintarse entero al volver. Medida en
[«Rendimiento»](#rendimiento-medido-t8).

### 8. Variables CSS que el módulo toma del anfitrión

`t3d.css` no define variables propias; usa éstas, todas definidas en `public/css/app.css` de JA-VTT
(lo comprueba `test/frontend.test.js` contra `test/fixtures/ja-vtt/variables-css.json`):
`--ink`, `--panel`, `--raise`, `--line`, `--bone`, `--fog`, `--amber`, `--amber-ink`,
`--amber-soft`, `--rust`, `--verdigris`, `--shadow`, `--sans`, `--serif`, `--z-modal`, `--z-pop`,
`--z-toast`. Las clases sin prefijo que usa (`btn`, `fold`, `tabs`, `tabpane`, `tool`…) existen en
JA-VTT (mismo test, `clases.json`).

### 9. Activar, desactivar y migraciones

- Activo por defecto. `T3D=off` en el entorno del contenedor lo apaga: no se crea el esquema, la
  API y los estáticos responden 404 salvo `/t3d/t3d.js` (vacío, para que la página no dé error);
  sin `Tablero3D`, el selector queda oculto, las tarjetas sin etiqueta y todo tablero se abre como
  2D (una mesa 3D enseña su escena 2D vacía de JA-VTT hasta que se vuelva a activar).
- La migración `t3d/002-tableros-3d.sql` crea `t3d.boards` **vacía**: los tableros que JA-VTT ya
  tenía siguen siendo 2D (lo prueba `test/ja-vtt-contract.test.js`).
- Orden al arrancar: migraciones de JA-VTT (`public.schema_migrations`, cerrojo 7318204) y luego
  las del módulo (`t3d.schema_migrations`, cerrojo 7318206). El módulo nunca escribe en el control
  de migraciones de JA-VTT. Una migración nueva del módulo se aplica sola al arrancar.
- **Datos**: la instalación será nueva; **no hay script de exportación/importación** de tableros de
  este repo a JA-VTT (el plan lo dejaba abierto y se descarta).

## Verificación

1. Tus tests de JA-VTT: `npm run check`. Referencia en la copia de prueba (T8): 98/98, con la cobertura de
   funciones de `server/` en 82,05 % (sin el módulo, 83,48 %; umbral 82 %) por las cuatro funciones de 3.1
   (`memberRole`, `postChat`, `boardSettings`, `setBoardSettings`), que sus tests no llaman. **Recomendado**:
   añadir este test, `test/t3d.test.js` (99/99 y 83,33 %; comprueba que los ajustes del 3D se guardan en los de
   JA-VTT):

```js
'use strict';
/* t3d: el módulo del tablero 3D montado (docs/08 de Tablero pixel): sus ajustes son los del tablero de JA-VTT */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetSchema } = require('./helpers/db');
const app = require('../server/app');

let base;
before(async () => { await resetSchema(); await app.prepare(); base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.stop(); });

test('t3d: una mesa 3D lee y cambia los ajustes del tablero de JA-VTT', async () => {
  const reg = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Directora3d', password: 'secreto1' }) });
  const headers = { 'Content-Type': 'application/json', Cookie: reg.headers.get('set-cookie').split(';')[0] };
  const call = async (method, path, body) => (await fetch(base + path, { method, headers, body: body && JSON.stringify(body) })).json();
  const { board } = await call('POST', '/api/boards', { name: 'Mesa 3D' });
  assert.equal((await call('POST', `/api/t3d/boards/${board.id}`)).board.t3d, true);
  assert.equal((await call('GET', `/api/t3d/boards/${board.id}/settings`)).settings.diceEnabled, true);
  assert.equal((await call('PATCH', `/api/t3d/boards/${board.id}/settings`, { diceEnabled: false })).settings.diceEnabled, false);
  assert.equal((await db.q.board(board.id)).settings.diceEnabled, false, 'guardado en boards.settings de JA-VTT');
});
```

2. Humo automático (desde este repo, con JA-VTT en marcha):
   `BASE_URL=http://localhost:3000 npm run test:ja-vtt` (o `CHROMIUM_PATH=…` sin Edge/Chrome).
3. A mano:
   - Arranque: el log dice `Migraciones aplicadas: …, t3d/001-esquema.sql, …, t3d/006-tamano-guardado.sql`; `\dn` en `psql`
     muestra `t3d`; `curl -I /t3d/t3d.js` → 200.
   - Director: «Nuevo tablero» con **Mesa 3D** → se abre en 3D: se ve el terreno, sin raíl ni lienzo
     2D; pestañas Escena · Fichas · Partida · Campaña (del 3D) + Mesa · Chat (de JA-VTT).
   - Guardar una escena 3D, recargar: el tablero vuelve a abrir en 3D con la escena en su menú.
   - Jugador invitado: el enlace abre el 3D; pestaña Mesa → «Unirse a la mesa» cuando el director la abre.
   - Tirada en Partida → Dados: llega al jugador y aparece en el Chat de JA-VTT.
   - Quitar al jugador del tablero: su 3D se desconecta. Borrar el tablero: `t3d.scenes` y
     `t3d.boards` quedan sin filas de ese tablero.
   - «Nuevo tablero» con **Mesa 2D**: JA-VTT de siempre, sin nada del 3D. En el panel, «2D» y «3D».
   - `T3D=off`: sin selector ni etiquetas y sin errores en la consola.

## Revertir

1. Quitar las líneas marcadas: `grep -n "t3d" server/app.js public/index.html public/js/main.js public/js/editor.js public/js/render.js public/js/weather.js`
   (3.1 y 5.6 son bloques; el resto, una línea cada una), la línea del `Dockerfile`, `test/t3d.test.js` si se
   añadió y la carpeta `modules/`. Las que sustituyen a una de JA-VTT se devuelven a su forma: 3.10 →
   `boards: await q.boardsForUser(user.id)`, 3.11 → `if (boardChanged) sendInitiative(b);`, 5.3 →
   `Net.connect(id);` y 7.2 → `return{sync,invalidate,resize,mounted,clipPolyRect};` (3.2, 3.5 y 3.6, como
   estaban).
2. Datos: `DROP SCHEMA t3d CASCADE;` (tipo de mesa, escenas, dibujos, campañas y mesa 3D; nada de
   JA-VTT). Las mesas 3D quedan como tableros 2D con su escena vacía. Las tiradas del 3D que ya
   están en `chat_messages` se quedan en el chat como tiradas normales (kind `roll`, el cuerpo de JA-VTT).
   Los ajustes del tablero ya estaban en `boards.settings` de JA-VTT (T8): no hay nada que devolver.
3. Sin borrar datos basta `T3D=off`.

## Alternativa: microservicio

El mismo código en un contenedor aparte, detrás del mismo dominio, con la misma base:

- Un `server.js` de ~40 líneas que monta sólo el módulo (como el anfitrión mínimo de
  `test/t3d-host.test.js`): `pg.Pool` con el `DATABASE_URL` de JA-VTT y el parser de BIGINT a
  `Number` (`types.setTypeParser(20, Number)`), `userFrom` que lea la cookie `jav_session` y
  consulte `sessions`/`users` de JA-VTT, `memberRole` sobre `board_members`, `acceptUpgrade` de una
  copia de `server/ws.js` (idéntico en ambos proyectos), y las rutas `/api/t3d/`, `/t3d/` y
  `/t3d/ws`.
- El proxy (Traefik en Coolify) manda `/api/t3d`, `/t3d` y `/t3d/ws` a ese contenedor y lo demás a
  JA-VTT. La cookie funciona igual porque es el mismo dominio.
- Qué cambia: `postChat` sólo puede insertar en `chat_messages` (el chat de JA-VTT no se entera al
  momento; aparece al recargar) salvo que JA-VTT exponga un aviso; `onBoardDeleted` y `kick` no
  llegan (el borrado en cascada sí limpia los datos; las conexiones 3D de un expulsado siguen hasta
  que se reconecta y el servidor lo rechaza); sin `boardSettings`/`setBoardSettings` (el tablero en
  memoria es de otro proceso) los ajustes del 3D vuelven a ser otra copia en `t3d.boards.settings`
  (como antes de T8: el chat y los dados de JA-VTT siguen los suyos); dos procesos que migran: el del
  módulo sólo toca `t3d`. En el cliente, lo mismo que en los pasos 4–7.
- Se descarta como primera opción porque añade despliegue, proxy y un proceso más para ganar sólo
  aislamiento; la mesa en vivo sigue en memoria de un solo proceso igual.

## Diferencias conocidas

Qué es igual que en JA-VTT (con su fijo de contrato en `test/fixtures/ja-vtt/`, commit `d68f41f`) y
qué no. Los campos de cada documento están en el
[README del módulo](../modules/tablero3d/README.md#formato-de-los-documentos).

- **Fichas** (T5): los campos, nombres, rangos y unidades de su `type:'token'` (`server/rules.js`):
  `name`, `kind`, `size` 1–4, `color`, `hidden`, `vision`, `sight` y `darkvision` **en pies**, `light`
  (su objeto de `LIGHT_PRESETS`), `conditions` (sus `CONDITION_IDS`, abreviaturas y colores;
  `conditions.json`), `elevation` en pies, `ac` y `hp:{cur,max,temp}`. Diferencias: el 3D añade `speed`
  (pies) e `init` (modificador de iniciativa) y tres extras que JA-VTT ignora al sanear: `neutral` (un
  `enemy` que no ataca), `tiny` y `small` (**Diminuto** y **Pequeño**: en JA-VTT son `size: 1`; una
  ficha con `size: 0.5` que llegue de otra mesa se lee como diminuta). Una ficha 3D siempre tiene vida
  (`hp.max` ≥ 1) y CA; en JA-VTT son opcionales. El sprite es `kind` del personaje (fuera de `sheet`,
  hace de `img`) y el dueño, `owner` del personaje (texto con el id). El jugador no cambia bando,
  tamaño, visión ni visibilidad de sus fichas, como en JA-VTT.
- **Dados** (T6d): la notación, los errores y el cuerpo de tirada de su `server/dice.js` (`dice.json`:
  `parse` de 24 fórmulas y tres tiradas de ejemplo); en la mesa en vivo tira el servidor y el chat de
  JA-VTT la pinta como las suyas (pips, total y sus dados 3D si anima). Diferencias: el 3D añade `adv`
  (ventaja o desventaja con 1d20: `2d20…`, las dos tiradas y cuenta la mayor o la menor; el `total` de
  JA-VTT sería la suma); no hay tiradas ocultas del director (`secret`); fuera de la mesa en vivo tira
  el cliente y no llega al chat.
- **Luces** (T4): mismos ids, nombres e iconos que `LIGHT_PRESETS`, las mismas animaciones (`ANIMS`) y,
  la luz de ficha, los de `TOKEN_LIGHTS`; una luz guarda `preset`, `color`, `intensity`, `anim`,
  `angle`, `rot`, `darkness`, `on` y `name` como JA-VTT (`light-presets.json`). Diferencias: el
  alcance es un radio `r` en casillas (= (`bright`+`dim`)/5 del tipo) en vez de `bright`/`dim` en pies,
  hay altura `h`, y el motor de luz (por casilla, con sombras y altura) es el suyo, no el 2D.
- **Muros y portales** (T6b): los siete tipos de `WALL_TYPES` con los mismos ids, nombres, iconos,
  colores, trazos, descripciones y banderas (`wall-types.json` y `WALL_KINDS` del servidor); puertas
  con `open` y `locked`, portales con `name` y `target: { scene, portal }`; la llegada es su
  `arrivalPoints` por casillas y «Reunir al grupo» su `gather`; al borrar una escena, los portales que
  llevaban allí se quedan sin destino, igual. Diferencias: **en 3D van por casilla**, no como segmentos
  finos entre casillas (`a`, `b`); una casilla que tapa lo hace hasta la altura de una persona (desde lo
  alto se ve por encima), y se ve a quien está **dentro** de la maleza, no detrás. Los muros finos
  quedan en la hoja de ruta (R13). El portal lleva además `look` (aspecto 3D), y los de suelo
  (escalera, trampilla) no tapan vista ni luz. Su `id` es entero y único en la escena, pero no el id de
  objeto de JA-VTT: un portal 2D no lleva a una escena 3D ni al revés. En la mesa en vivo del 3D la mesa
  sigue la escena del director y el jugador que cruza solo pide permiso (en JA-VTT pasa él solo).
  `playersDoors` es el de JA-VTT (`b.settings`, T8): el mismo ajuste en 2D y en 3D.
- **Ambiente e interiores** (T6c): los cuatro momentos de `ENVS` con sus nombres, iconos,
  descripciones, `ambient` y `dark` (`envs.json` y `ENVS` del servidor); la escena guarda `env`,
  `ambient` y `darkColor` como su `DEFAULT_SCENE`/`cleanSettings`. La sección «Iluminación» usa sus
  componentes (`envGrid`, `env`, `rangeRow`); la herramienta «Zona interior» tiene su icono (`house`),
  título, tecla Z y el color de sus zonas (#B79BD8); el umbral para ver sin luz es el de su `canSee`
  (0,25). Diferencias: el 3D añade el selector «Color de la oscuridad» (JA-VTT lo fija con el momento) y
  su aspecto propio por momento (tinte y cielo). Una escena 3D nueva abre de día (la de JA-VTT, en
  interior). Las zonas van **por casilla** (`zoneCells`) en vez de objetos `zone` con rectángulo o
  polígono en píxeles, cada techo crea la suya y el director puede dejar al aire libre una casilla con
  techo; exportar una zona 3D a JA-VTT queda para la exportación a 2D (hoja de ruta R10). Las ventanas y
  las puertas abiertas dejan entrar el ambiente de fuera (en JA-VTT la zona sólo resta el ambiente). El
  clima (`weather`, `indoor`) todavía no existe en 3D (R7): el motor ya sabe qué casillas son
  interiores (`isInterior`).
- **Ajustes del tablero** (T6d, T8): las claves, valores por defecto y textos de `BOARD_KEYS`/`DEFAULT_BOARD`
  y de sus secciones «Reglas para jugadores» y «Chat, dados y fichas» (`board-settings.json`). Desde T8
  **son los mismos**: el 3D lee y cambia los de JA-VTT (`b.settings`; sin abrir, `boards.settings`) por
  `boardSettings`/`setBoardSettings` (3.1) y se entera de los cambios de JA-VTT por `t3d.settingsChanged`
  (3.11) y releyéndolos antes de cada tirada, cambio de la mesa y cruce. En una mesa 3D la guía esconde las
  casillas de la escena 2D y se ven las del 3D, una vez. El «Chat de texto» del 3D apaga el chat de JA-VTT
  y sus «Dados», también la barra de dados de su pestaña Chat (P-06, cerrado). La nota de la sección no dice
  que se quite la pestaña Chat.
- **Privacidad** (T6d): la de `visibleTo`/`objectFor`, **en el servidor y por conexión**, también en
  las escenas y campañas que un jugador lee por la API. Diferencia: `bar_only` también en el servidor
  (JA-VTT manda la vida entera y la esconde el cliente): llega `hpBar` y `withheld` dice qué falta.
- **Iniciativa** (T6d): `{ entries: [{ id, name, value, tokenId, hidden? }], turn, round }` como su
  `cleanInitiative` (mismo resultado con sus ejemplos). Diferencias: vive en el documento `combat` de
  la mesa en vivo (no en `boards.settings.initiative`, que el 3D no toca: **no se comparte**, T8, porque
  la del 3D lleva ids de ficha en texto que el `cleanInitiative` de JA-VTT descarta, tiradas y turnos del
  jugador; en una mesa 3D la guía esconde la «Iniciativa» 2D de su pestaña Chat y queda la de Partida;
  `initiativeShown` sí es el de JA-VTT), `tokenId` es el id de la ficha 3D (texto), cada
  entrada lleva además `roll` e `init`, el documento lleva `left` y `dashed`, al jugador se le cambia
  `turn` a la posición en su lista filtrada (JA-VTT deja el índice de la lista completa) y se le dice
  `current`, y el jugador puede pasar el turno de su ficha y gastar su movimiento (en JA-VTT sólo el
  director toca la iniciativa).
- **Planos y anotaciones** (T6d): `type: 'plan'` y `type: 'note'`, con `plansReleased` y hasta 40
  planos por jugador. Diferencias: en casillas `{x, z}` (JA-VTT: píxeles `{x, y}`; la anotación, en una
  casilla entera), `owner` es el id en texto, la línea de un conjuro lleva `area`, los planos del
  director van en la escena y los de los jugadores en `live/plans`; no son objetos sueltos de la escena
  con capas (`layers`).
- **Ajustes de escena** (T6d): `grid`, `snap`, `animate`, `plansReleased` con sus valores por defecto.
  Diferencias: `snap` no hace nada en 3D (todo va por casillas); `fog` es la niebla de guerra del 3D
  (por defecto apagada; en JA-VTT «Recordar lo ya explorado», por defecto encendida); `animate` también
  se apaga con el movimiento reducido del sistema.
- **Unidades**: pies en todo lo que se ve, 5 por casilla, como JA-VTT.
- **Escenas**: las 3D (`t3d.scenes`) no son escenas de JA-VTT: «Llevar al grupo», la escena activa y
  los portales de JA-VTT no llevan al 3D. No hay escena por jugador (`board_members.scene_id` sigue en
  NULL; R15). JA-VTT crea igualmente su «Escena 1» (2D, oculta) al crear una mesa 3D, y la tarjeta del
  panel la cuenta («1 escena»).
- **Tipo de mesa**: se marca con una segunda petición tras crear el tablero. Si esa petición falla
  (red caída), el tablero queda 2D y se avisa con un `toast`; hay 10 minutos para repetirla por la
  API, después se crea otro. Marcar a mano un tablero 2D recién creado lo vuelve 3D con su escena
  2D oculta (sólo el director y dentro del plazo). El panel de este tablero en otro navegador
  muestra la etiqueta al recargar.
- **Conectados**: dentro del 3D, «en línea» cuenta las conexiones del 3D; la lista de miembros del
  3D se toma al conectar.
- **Cuota**: el 3D cuenta sus 500 MB aparte de los 500 MB de imágenes de JA-VTT. Medida (T8): bytes
  UTF-8 del JSON que guarda de cada escena y campaña (columna `size`, puesta al escribir) más los bytes
  de las capas PNG de cada dibujo (sin base64); al sustituir un documento, cuenta su tamaño nuevo y no
  el viejo. Las mesas en vivo (`live_docs`, 2 MB por documento) no cuentan.
- **Rendimiento** (T8, paso 7): con el 3D abierto el bucle 2D de JA-VTT no dibuja ni anima y su clima
  2D (PixiJS) se destruye. Siguen cargadas **dos copias de three.js**: la de sus dados 3D
  (`three.module.min.js` r170, módulo ES, 675 KB, en toda página) y la r128 clásica del módulo
  (`three.min.js`, 589 KB, sólo al montar una mesa 3D): no se pueden compartir (módulo ES frente a script
  global, y versiones con API distinta). Medidas en [«Rendimiento medido»](#rendimiento-medido-t8).
- **Iguales**: cookie `jav_session`, roles, invitación, `chat_messages`, `ws.js` y `auth.js`.
- Preferencias del 3D en `localStorage` con claves `tablero:*` y `t3d-*`; JA-VTT usa `jav.*`.

## Rendimiento medido (T8)

En la copia de prueba de JA-VTT con la guía de T7 («antes») y con la de T8 («después»), una mesa 3D
recién creada, Chromium sin GPU (SwiftShader: el 3D se dibuja en la CPU), 1400×860, 10 s por medida,
dos pasadas (`requestAnimationFrame` contados en la página, `ScriptDuration` de CDP, `drawAll` de JA-VTT
contado, tareas largas):

| Caso | Antes (T7) | Después (T8) |
|---|---|---|
| Mesa 3D sola | 42,7–43,9 fps · 22–23 ms de JS/s · 0 dibujos 2D | 42,8–43,8 fps · 22–23 ms/s · 0 dibujos 2D |
| Su escena 2D oculta con lluvia | 37,6–38,1 fps · 135–139 ms/s · PixiJS cargado (+481 KB) y montado · 13–15 MB de montón | 43,9–44,0 fps · 19–20 ms/s · sin PixiJS · 7,5 MB |
| Lluvia y 3 antorchas animadas | 36,7–38,1 fps · 139–144 ms/s · 37 dibujos 2D/s | 42,3–44,7 fps · 20–21 ms/s · 0 dibujos 2D |

Con la mesa 3D sola el bucle 2D ya estaba casi parado (sólo repinta si algo cambia): el arreglo se nota
cuando la escena 2D oculta tiene clima o luces animadas (unos 6 fps y 120 ms de JS por segundo menos).
El hilo principal va lleno en todos los casos (~1 s de tarea por segundo) porque SwiftShader dibuja el 3D
en la CPU; con GPU el 3D cuesta mucho menos y la parte de JA-VTT pesa proporcionalmente más.

## Limitaciones conocidas (antes de integrar)

Lo que sigue abierto o no está probado al cerrar la ronda (detalle en las diferencias de arriba y en
[06](06-pendientes.md)):

- **Tiradas**: sólo las de la mesa en vivo llegan al chat de JA-VTT (tira el servidor); fuera de ella tira el cliente y
  quedan en el registro de Partida. No hay tiradas ocultas del director (`secret`).
- **Escena por jugador**: no; la mesa en vivo 3D es la escena del director (hoja de ruta R15).
- **Muros**: por casilla, no segmentos finos entre casillas (hoja de ruta R13); un portal 2D no lleva a una escena 3D.
- **Iniciativa**: la del 3D (Partida) no es la de JA-VTT (`boards.settings.initiative`): no se comparten; en una mesa
  3D se esconde la de JA-VTT. Los demás ajustes del tablero sí son los de JA-VTT.
- **Ajustes sin aviso**: si JA-VTT cambia sus ajustes por un camino distinto de `handleOps` (3.11), la mesa 3D abierta
  se entera en la siguiente tirada, cambio o cruce, no al momento. Un cambio desde el 3D con el tablero de JA-VTT en
  memoria pero sin nadie conectado puede perderse si coincide con su descarga (la misma ventana que tiene JA-VTT).
- **Rendimiento**: dos copias de three.js en una mesa 3D (675 KB + 589 KB); el bucle 2D sigue pidiendo fotograma (sin
  dibujar). Medido sólo con SwiftShader, no con GPU real ni en portátiles.
- **Tipo de mesa**: se marca con una segunda petición tras crear el tablero (si falla, queda 2D con un aviso; 10
  minutos para repetirla). JA-VTT crea igualmente su «Escena 1» 2D, oculta, y la tarjeta la cuenta.
- **Cobertura de JA-VTT**: funciones 82,05 % frente a su umbral de 82 % sin el test recomendado de «Verificación»
  (83,33 % con él): añadirlo deja margen.
- **Móvil dentro de JA-VTT**: no probado. `test:ui` prueba el móvil en este repo; `test:ja-vtt` va en escritorio
  (1400×860).
- **Versión de JA-VTT**: la guía y los fijos de contrato (`test/fixtures/ja-vtt/`) son de `d68f41f`. Si la rama
  `release` avanzó, comprobar que cada anclaje de «Pasos» sigue existiendo, regenerar los fijos
  (`test/fixtures/ja-vtt/migrations/README.md`) y repetir `npm run check` y `test:ja-vtt`.
- **`Dockerfile` de JA-VTT** está en ISO-8859-1 (no UTF-8): al añadir la línea del paso 2, guardarlo con la misma
  codificación.
- **Una sola instancia**: la mesa en vivo del 3D vive en memoria del proceso, como la de JA-VTT.
