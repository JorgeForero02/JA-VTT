# Plan — Módulo para Just Another VTT, fichas, techos y luces como JA-VTT

Fecha: 2026-09-26. Rama: `claude/jolly-allen-xj8xlt`. Una tarea = un commit.
Referencia de JA-VTT (sólo lectura, rama `release`): `/home/user/jorgeforero02/ja-vtt`.

**Estado: cerrado el 2026-09-26.** Todas las tareas hechas, una por commit (hash en cada una). Dos puntos del
plan cambiaron por decisión posterior: el punto de entrada en JA-VTT no es un tipo de escena «3D» sino el tipo de
mesa fijo de T3b, y el script de exportación/importación de T3 se descartó (instalación nueva; ver
[08](../../08-integracion-ja-vtt.md)). Lo abierto al cerrar está en [06](../../06-pendientes.md).

## Petición del usuario

1. Hacer el tablero 3D «fácilmente unible» a JA-VTT, como un módulo o microservicio, con el
   mismo estilo de código, sin choques de esquema, y documentar cómo unirlo. Todo bajo el mismo
   login y los mismos menús de JA-VTT.
2. Fichas (personajes) que peguen con el entorno y de distintos tamaños (diminuto a colosal).
3. Más tipos de techo y estructuras nuevas, usadas en el pueblo de ejemplo.
4. Fuentes de luz variadas, de ejemplo, que funcionen «tal cual» como la iluminación de JA-VTT.

## Decisiones (recomendaciones aceptadas por el usuario)

- **Esquema PostgreSQL propio `t3d`** para las tablas del 3D: `t3d.scenes`, `t3d.campaigns`,
  `t3d.drawings`, `t3d.drawing_layers`, `t3d.live_docs`. Referencian `public.boards(id)` y
  `public.users(id)` del anfitrión.
- **Módulo dentro del proceso** (no microservicio); el microservicio queda documentado como
  alternativa.
- **Núcleo compartido idéntico a JA-VTT**: `users`, `sessions`, `boards` (+`active_scene`),
  `board_members` (+`scene_id`), `chat_messages`; cookie `jav_session`. Al unir, el núcleo de este
  repo se descarta y se usa el de JA-VTT.
- **Tiradas** en `chat_messages` (kind `roll`) del anfitrión, como JA-VTT.
- **Punto de entrada en JA-VTT**: tipo de escena «3D» (documentado); la API de montaje sirve
  también para una vista aparte.

## Principio de producto (usuario, 2026-09-26)

Es **una mesa para mover fichas**, no un gestor de personajes: nada de hojas de personaje ni
reglas de un sistema concreto. La ficha sólo lleva lo que la mesa usa: nombre, bando, **vida**
(actual, máxima, temporal), **clase de armadura**, **iniciativa**, **estados/efectos**, tamaño y
lo que mueve el tablero (velocidad, visión, visión en la oscuridad, luz que lleva, elevación).
Los campos siguen los de las fichas de JA-VTT (`hp:{cur,max,temp}`, `ac`, `conditions` con sus
`CONDITION_IDS`, `elevation`) y sus interruptores de tablero (`hpEnabled`, `hpVisibility`,
`acEnabled`, `conditionsEnabled`) para que una ficha signifique lo mismo en 2D y en 3D.

## Estructura objetivo

```
server/                      núcleo (copia fiel de JA-VTT): app.js, auth.js, db.js, rules.js, ws.js, migrations/
modules/tablero3d/
  index.js                   createTablero3D({ pool, tx?, userFromReq?, memberRole, sendJson, fail, broadcast? })
                             → { name:'t3d', migrate(), api(req,res,url,user,parts), ws(conn,msg,ctx), publicDir, onBoardDeleted? }
  db.js                      TODO el SQL del módulo (esquema t3d)
  rules.js                   reglas del módulo (mapas, dibujos, luces, fichas, mesa en vivo)
  migrations/NNN-*.sql       migraciones propias, control en t3d.schema_migrations
  public/                    cliente del módulo: tablero3d.js, vision.js, vendor/three.min.js, t3d.css, index fragment
test/                        pruebas del núcleo + del módulo + contrato con JA-VTT
docs/08-integracion-ja-vtt.md
```

Reglas del módulo: nadie fuera de `modules/tablero3d/db.js` escribe SQL del módulo; nadie fuera
de `server/db.js` escribe SQL del núcleo. Una sola dependencia de producción (`pg`).

## Tareas

### T1 — Servidor: núcleo idéntico a JA-VTT + módulo `modules/tablero3d` con esquema `t3d` · **hecha** (`a16474d`)
- Mover rutas, consultas, reglas y mensajes WS del 3D a `modules/tablero3d/` (index/db/rules/
  migrations). `server/app.js` monta el módulo con ≈10 líneas (ruta `/api/t3d/...` o las rutas
  actuales redirigidas, WS, estáticos) como lo haría JA-VTT.
- Rutas del módulo bajo `/api/t3d/boards/:id/{scenes,campaigns,drawings}`; `net.js` se adapta.
- Núcleo: migración nueva que añade `boards.active_scene` y `board_members.scene_id`; cookie
  `jav_session`. Tiradas en `chat_messages`.
- **Datos existentes**: un despliegue actual tiene `public.scenes`/`campaigns`/`drawings`/
  `drawing_layers`/`live_docs`. La migración del núcleo de este repo los mueve a `t3d`
  (`ALTER TABLE … SET SCHEMA t3d`) y el módulo crea sus tablas con `IF NOT EXISTS` (o detecta el
  caso), de forma que tanto una base nueva como una existente y una de JA-VTT queden bien.
- Tests: los existentes pasan (adaptados a las rutas nuevas); test de que las tablas del módulo
  viven en `t3d` y `public.scenes` no existe en modo solo; cobertura ≥ umbrales para `server/**`
  y `modules/**/*.js` del servidor.

### T2 — Cliente aislado y montable · **hecha** (`26ade1e`)
- Mover el cliente 3D a `modules/tablero3d/public/` (servido en `/t3d/`).
- Todos los ids y clases del motor con prefijo `t3d-` (el shell de JA-VTT usa `#rail`, `#panel`,
  `#stage`…); estilos del módulo en `t3d.css` bajo `.t3d-root`, usando las variables de color y
  fuentes del anfitrión (no copiarlas).
- `Tablero3D.mount(elemento, { boardId, net, user, role })` y `unmount()`; `window.Mesa` pasa a
  ser un adaptador sobre el `Net` del anfitrión. El shell (`public/js/main.js`, entrada, panel de
  tableros, perfil, cabecera) es el de JA-VTT y llama a `mount`.
- `test/frontend.test.js`, `test/e2e/ui.mjs` y `test/e2e/realtime.mjs` adaptados y verdes.

### T3 — Integración documentada + contrato con JA-VTT · **hecha** (`d139c68`)
- `docs/08-integracion-ja-vtt.md`: pasos numerados (copiar `modules/tablero3d`, líneas exactas en
  `app.js`, WS, `index.html`, tipo de escena «3D», variable para activarlo), datos (script de
  exportación/importación de tableros), verificación, reversión, alternativa microservicio.
- `test/fixtures/ja-vtt/` con las migraciones del núcleo de JA-VTT (anotar commit de origen);
  test que aplica JA-VTT + módulo en la misma base sin choques; test de contrato de columnas del
  núcleo; test que monta el módulo en un anfitrión mínimo.
- `scripts/exportar-tablero.js` / importar (si se decide en el doc). *Descartado en T3: la instalación en JA-VTT será nueva.*

### T3b — Tipo de mesa 2D o 3D elegido al crear el tablero (decisión del usuario: fijo) · **hecha** (`4208a23`)
- Al crear un tablero en JA-VTT se elige **Mesa 2D** o **Mesa 3D**; el tipo **no cambia** después.
- Un tablero 3D abre directamente la vista 3D (sin botón para alternar); uno 2D es JA-VTT tal
  cual, sin rastro del módulo. Tarjetas del panel con etiqueta «2D»/«3D».
- Dato en el módulo: tabla `t3d.boards (board_id PK → public.boards ON DELETE CASCADE,
  created_at)`; fila = tablero 3D. Rutas del módulo para marcarlo al crear y consultarlo
  (y en la lista de tableros); las rutas 3D de un tablero 2D responden 404/409.
- Este repo por separado: todos los tableros son 3D (selector oculto); la migración marca como
  3D los tableros existentes.
- `docs/08` y la prueba de humo `test:ja-vtt`: sustituir botón 3D + entrada de menú de escenas
  por el selector en «Nuevo tablero» y la comprobación al abrir. Menos líneas en JA-VTT.

### T4 — Tipos de luz como JA-VTT (el motor de luz 3D actual NO se cambia) · **hecha** (`b268ce4`)
- **Aclaración del usuario (2026-09-26):** de JA-VTT sólo se toman los **tipos** de fuente de luz.
  El motor de iluminación 3D actual (luz por casilla RGB con sombras, altura, halos, parpadeo,
  niebla dependiente de la luz) se conserva tal cual: «pega mejor que el del tablero 2D».
- Catálogo de fuentes con los mismos identificadores, nombres e iconos que `LIGHT_PRESETS` de
  JA-VTT (`public/js/core.js`): vela, antorcha, farol, linterna sorda, hoguera, brasero, luz
  mágica, cristal, luna, luz de día, ventana, oscuridad. Cada tipo se traduce a los parámetros
  del motor 3D (radio, altura, color, parpadeo) con valores que se vean bien en 3D; si un tipo
  necesita algo que el motor no tiene (p. ej. el cono de la linterna sorda o la oscuridad que
  resta), se añade como extensión pequeña del motor actual, no como un motor nuevo.
- La herramienta Luz y la «Luz que lleva» de las fichas ofrecen esos tipos. Escenas guardadas
  siguen abriendo igual.
- Escena de ejemplo «Taller de luces» (plantilla) que muestra cada tipo.

### T5 — Fichas que pegan con el entorno y de varios tamaños · **hecha** (`8361156`)
- Tamaños D&D: diminuto (½ casilla), pequeño y mediano (1), grande (2×2), enorme (3×3),
  colosal (4×4). Campo `size` en la ficha (servidor lo sanea); ocupación, caminos, medidas,
  selección y visión consideran el tamaño.
- Aspecto: base/peana en pixel art con la misma luz y paleta del entorno (sombra de contacto,
  iluminación de la escena aplicada al sprite, anillo de selección y barra de vida en el mismo
  estilo pixel), sin elementos planos «de interfaz» que desentonen.

- Ficha según el «Principio de producto»: añadir estados/efectos con los `CONDITION_IDS` y
  abreviaturas/colores de JA-VTT (`server/rules.js`, `public/js/core.js` `CONDITIONS`), vida
  temporal y elevación; interruptores del tablero para vida/CA/estados y quién ve la vida.
  Nada de atributos, habilidades ni hojas. Compatibilidad con fichas guardadas (`hp`/`hpMax`).

### T5b — Arte propio por tamaño (decisión del usuario) · **hecha** (`7e812e9`)
- Las criaturas grandes no se amplían: tienen sprite con la resolución de su tamaño para que el
  píxel mida lo mismo que el del terreno (densidad constante): Mediano 16×24 base, Grande
  32×48, Enorme 48×72, Colosal 64×96 (a la resolución del tablero, ×2/×4 si es 32/64).
  Diminuto y Pequeño también con sprite propio a su escala (o recorte), no reducido.
- Ogro (Grande), trol (Enorme) y un colosal de ejemplo (p. ej. dragón o gólem) redibujados a su
  tamaño; editables en «Todo el arte».
- Editor: al crear o editar un personaje se elige su tamaño y el lienzo toma esas medidas; guías
  de altura y línea de suelo por tamaño (hoja de ruta E4). Si una ficha usa un sprite de otro
  tamaño, se muestra a la densidad correcta (sin reescalar el píxel) o con aviso.

### T5c — Personajes del tablero que peguen con el entorno (usuario: «no pegan nada») · **hecha** (`1166072`)
- Redibujar los personajes medianos de fábrica (caballero, maga, goblin, aldeano) con el nivel
  de detalle y el estilo del terreno, los techos y las estructuras nuevas: contorno oscuro
  selectivo, rampas de 3–4 tonos con cambio de tono, luz desde el mismo lado que el mundo,
  proporciones y paleta coherentes con el pueblo; 3 vistas (frente, espalda, perfil).
- Más variedad de ejemplo: guerrera, pícaro, clérigo, arquera, esqueleto, lobo, bandido…
  (medianos) y los grandes/pequeños de T5b en el mismo estilo.
- Todos editables y restaurables en «Todo el arte»; los aldeanos del pueblo usan variedad.
- Criterio de aceptación: capturas de día y noche junto a casas, techos y árboles donde los
  personajes se lean como parte del mismo mundo (densidad de píxel, paleta, contorno).

### T6 — Techos y estructuras · **hecha** (`a102068`)
- Más tipos de techo (teja roja, pizarra, paja, tablillas de madera, cobre verdín…) y formas
  (a dos aguas, a cuatro aguas, plano con almenas, cónico de torre).
- Estructuras nuevas (torre, pozo, puestos de mercado, puente, muralla con puerta, molino,
  capilla…) como objetos por capas o piezas de terreno, todas editables en «Todo el arte».
- El pueblo de ejemplo las usa.

### T6b — Muros y portales en armonía con JA-VTT · **hecha** (`4223801`)
- Mismos tipos y atributos que `WALL_TYPES` de JA-VTT (`ja-vtt/public/js/core.js`,
  `WALL_KINDS` en `ja-vtt/server/rules.js`): `wall`, `door`, `window`, `veil`, `cover`,
  `barrier`, `portal`, con sus banderas `sight` (tapa la vista), `light` (tapa la luz), `move`
  (impide el paso), `hide` (oculta fichas detrás) y, en puertas, `open` y `locked`. Mismos
  nombres, iconos, colores y descripciones en la interfaz.
- En 3D se aplican con el motor actual: `Vision.los` consulta «tapa la vista», `lightReaches`
  «tapa la luz», los caminos «impide el paso»; `cover` oculta fichas pero no el fondo.
  Cada tipo tiene su sprite 3D (ventana con cristal, cortina/velo, hierba alta, barrera sólo
  visible para el director como contorno, portal con luz propia). Primera fase: por casilla
  (como hoy los muros y puertas); los muros finos en el borde entre casillas quedan en la hoja
  de ruta si esta fase no los cubre.
- Puertas: `locked` (el jugador no la abre) y el ajuste de tablero `playersDoors` de JA-VTT
  (los jugadores pueden abrir puertas sin llave); validado en `modules/tablero3d/rules.js`.
- Portales como JA-VTT: unen **cualquier escena 3D del tablero** (no sólo dentro de una
  campaña), con `target: { scene, portal }`; el jugador cruza con su ficha si el director lo
  permite; el servidor calcula puntos de llegada junto al portal de destino; «Reunir al grupo»
  (`gather`); al borrar una escena, los portales que llevaban allí quedan sin destino. Aspectos:
  puerta, escalera, boca de cueva, trampilla, portal mágico. Las escaleras de campaña actuales
  se convierten en portales al abrir escenas antiguas.
- Tests de reglas (servidor) y de `Vision` con cada tipo; pasos en `test:ui`.

### T6c — Interiores y momentos de luz ambiente como JA-VTT · **hecha** (`1b1b961`)
- Ambiente de escena con los mismos valores que `ENVS` de JA-VTT: `interior` (oscuro),
  `day`, `dusk`, `night`, cada uno con su `ambient` (0–1) y `darkColor`; el director puede
  afinar `ambient` y `darkColor` a mano como en JA-VTT. Sustituye al interruptor día/noche
  (escenas antiguas: `night:true` → `night`, si no → `day`). Transición suave al cambiar.
- Zonas interiores (`zone` de JA-VTT): rectángulos o casillas pintadas por el director; cada
  techo crea la suya. Dentro no llega el ambiente (sólo luces y visión en la oscuridad), la
  niebla aplica la regla de oscuridad y no entra el clima. Las ventanas dejan pasar la luz de
  fuera. Máscara «interior» por casilla en el motor actual (luz por casilla), sin motor nuevo.

### T6d — Armonía del modelo de datos con JA-VTT (lo que falta) · **hecha** (`0163868`)
Que una ficha, una escena y un ajuste signifiquen lo mismo en 2D y en 3D:
- **Ficha** con los campos de la ficha de JA-VTT (`ja-vtt/server/rules.js`, `type:'token'`):
  `kind` player/enemy (el bando actual se traduce), `name`, `size` 1–4 casillas (diminuto es
  un extra del 3D que se exporta como 1), `color`, `hidden` (sólo la ve el director),
  `vision`, `sight` y `darkvision` **en pies**, `light` con los `TOKEN_LIGHTS`, `img` (retrato),
  `owner`, `conditions`, `elevation`, `ac`, `hp:{cur,max,temp}`. Compatibilidad con las
  fichas guardadas (casillas → pies, `hp/hpMax`, `team`).
- **Privacidad como JA-VTT (en el servidor)**: `hpVisibility` all/gm/bar_only y la CA de fichas
  ajenas nunca se envía al jugador; fichas `hidden` no se envían a jugadores.
- **Ajustes del tablero** con las mismas claves: `sharedVision`, `playersDoors`, `chatEnabled`,
  `diceEnabled`, `initiativeShown`, `hpEnabled`, `conditionsEnabled`, `acEnabled`, `hpVisibility`.
- **Iniciativa** con el formato de JA-VTT `initiative:{entries,turn,round}` en lugar del
  combate propio, para que el orden de turnos sea el mismo en ambas vistas.
- **Ajustes de escena**: `fog`, `grid`, `snap`, `animate`, `plansReleased`.
- **Planos** (plantillas de medida: línea, círculo, rectángulo, cono) con los mismos `shape` y
  la liberación a jugadores (`plansReleased`, `owner`).
- **Anotaciones** del director (`note`, `gmOnly`) en la escena.
- **Dados y chat**: misma notación y mismo formato de mensaje que `ja-vtt/server/dice.js` y
  `chat_messages` (el chat del anfitrión es el chat de la mesa 3D).
- **Unidades**: pies en todo lo que ve el usuario (5 pies por casilla), como JA-VTT.

### T7 — Cierre · **hecha** (commit de cierre de la ronda, `docs: cierre…`; ver `git log`)
- Docs `01`–`05`, `07-historial`, `06-pendientes` (P-02 resuelto), README.
- `npm run check` y `npm run test:ui` verdes; commit (el push lo decide el usuario).
