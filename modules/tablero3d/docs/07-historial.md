# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-26 — Integración en JA-VTT: ajustes con una sola fuente, recorte del chat, cuota y rendimiento (T8)

- **Qué:** cuatro avisos del usuario al integrar el módulo en su JA-VTT (ninguno bloqueaba).
  1. **Recorte del chat** ([08](08-integracion-ja-vtt.md) 3.1): con el tablero sin abrir en la memoria de JA-VTT, el
     `postChat` de la guía insertaba la tirada 3D sin su `trimChat`. Ahora hace `insertChat` y, como su `postChat`,
     `if (row.id % 50 === 0) await q.trimChat(boardId, CHAT_KEEP)`. Con el tablero abierto sigue su `postChat`
     (reparte a su chat y recorta).
  2. **Ajustes del tablero con una sola fuente** (P-06 cerrado): ganchos opcionales del anfitrión
     `boardSettings(boardId)` y `setBoardSettings(boardId, patch)` (JSDoc de `modules/tablero3d/index.js`,
     [README del módulo](../modules/tablero3d/README.md#interfaz-con-el-anfitrión-createtablero3dhost)). Con ellos las
     claves de JA-VTT (`HOST_SETTINGS` = su `BOARD_KEYS` salvo `initiative`) se leen y guardan en el anfitrión,
     saneadas con `cleanSettings`, y `t3d.boards.settings` guarda sólo las propias del 3D (`settingsParts`; hoy
     ninguna); sin ellos (este repo) todo sigue en `t3d.boards.settings`. Nuevo `t3d.settingsChanged(boardId)`: el
     anfitrión avisa y la mesa abierta relee y reparte (`settings` y las vistas de los jugadores); además el módulo
     relee los del anfitrión antes de cada `live`, `roll`, `travel`, `gather` y al entrar alguien. La guía los da con
     `b.settings`/`settingsDirty`, el aviso a sus clientes (`ops` con `settings`, `sendInitiative`) y
     `boards.settings` si el tablero no está en memoria (3.1), y llama a `settingsChanged` desde `handleOps` (3.11,
     sustituye a una línea). La **iniciativa no se comparte** (la del 3D lleva ids de ficha en texto que el
     `cleanInitiative` de JA-VTT descarta, tiradas y turnos del jugador): la guía esconde la «Iniciativa» 2D de su
     pestaña Chat en una mesa 3D.
  3. **Cuota y límites de cuerpo**: la cuota comparaba el JSON nuevo con `pg_column_size` (comprimido) de lo guardado
     y contaba dos veces el documento que se sustituía; cada petición admitía 40 MB. Ahora una sola medida: columna
     `size` en `t3d.scenes` y `t3d.campaigns` (migración `t3d/006-tamano-guardado.sql`; `db.js` la pone con los bytes
     del mismo JSON que manda a Postgres; lo de antes lo mide `migrate()`) más la de los dibujos (bytes PNG), y
     `boardUsage(boardId, except)` sin el documento que se sustituye. Límite por ruta (`BODY_LIMITS` de `rules.js`:
     escena y cruce 2 MB + 64 KB, campaña 8 MB + 64 KB, dibujo 8 capas de 4 MB en base64 + 64 KB = 42,7 MB, ajustes
     64 KB); más, 413 «La petición es demasiado grande: aquí se admiten hasta …» sin leer el resto y sin cortar la
     conexión (antes `req.destroy()` podía dejar al cliente sin respuesta).
  4. **Rendimiento en JA-VTT** (paso 7 de la guía, nuevo): primera línea de su `loop` (`render.js`): con `#app.is3d`
     pide el siguiente fotograma, quita el clima 2D (`Weather.unmount`, que `weather.js` pasa a exportar), deja el 2D
     sucio para volver y sólo hace `Net.tick`. Las dos copias de three.js (la r170 de sus dados, módulo ES, y la r128
     del módulo, sólo al montar) no se pueden compartir: documentado en «Limitaciones conocidas».
  - La guía pasa de 63 líneas en 5 archivos a **78 en 7** (`server/app.js` 21 → 34, más `render.js` 1 y
    `weather.js` 1; sustituidas 5 → 7) y recomienda un test para JA-VTT (`test/t3d.test.js`) que cubre los ganchos.
- **Por qué:** con el tablero cerrado el chat de JA-VTT crecía sin recorte; los ajustes vivían en dos sitios (las
  tiradas 3D seguían los «Dados» del 3D y no los de JA-VTT, y el «Chat de texto» del 3D no apagaba su chat); la cuota
  medía con dos unidades distintas; y con la mesa 3D abierta JA-VTT seguía animando y dibujando su 2D oculto y su clima.
- **Verificado:** `npm run check` **170/170** (6 tests nuevos: ajustes integrados leídos y guardados en el anfitrión,
  la mesa sigue sus cambios con y sin aviso, límites por ruta con y sin `Content-Length`, cuota exacta y sin doble
  cuenta, `HOST_SETTINGS`/`settingsParts` contra el fijo de JA-VTT, `BODY_LIMITS` con el dibujo más grande; cada uno
  roto una vez a propósito: 10 mutaciones, todas muerden) · `npm run test:ui` **96/96** (el paso del fundido de ambiente esperaba 1,3 s fijos y en esta máquina fallaba también sin estos cambios —comprobado con el commit anterior, 95/96—: ahora espera a que acabe el fundido, hasta 4 s más) · cobertura 97,5/93,5/95,4 · guía aplicada al pie de la
  letra (script) sobre un clon limpio de JA-VTT `d68f41f`: 78 líneas añadidas y 7 quitadas en 7 archivos, su lint
  limpio, sus tests 98/98 (funciones 82,05 %) y 99/99 con el test recomendado (83,33 %; roto una vez a propósito),
  `npm run test:ja-vtt` **20/20** (4 pasos nuevos, que fallan con la guía de T7: ajustes una vez y sin la iniciativa
  2D, los «Dados» de JA-VTT bloquean la tirada 3D en el servidor, el «Chat de texto» del 3D apaga el de JA-VTT, el 2D
  no dibuja); recorte: 260 mensajes + 55 tiradas 3D con el tablero cerrado → quedan 217 (con la guía de T7, 315);
  `T3D=off` sin esquema y con los ajustes 2D de siempre. Rendimiento (SwiftShader, 10 s, dos pasadas): mesa 3D sola
  igual (≈43 fps, 22 ms de JS/s); con lluvia en la escena 2D oculta 37,6–38,1 → 43,9–44,0 fps y 135–139 → 19–20 ms/s
  (sin PixiJS); con lluvia y 3 antorchas animadas 36,7–38,1 → 42,3–44,7 fps, 37 → 0 dibujos 2D/s. Tabla en
  [08](08-integracion-ja-vtt.md#rendimiento-medido-t8).
- **Revertir:** revertir el commit. En una base ya migrada, `t3d/006` deja dos columnas `size` que el código anterior
  no lee (se pueden dejar o quitar con `ALTER TABLE t3d.scenes DROP COLUMN size` y lo mismo en `t3d.campaigns`). En
  JA-VTT, volver a la guía anterior (3.1 sin `boardSettings`/`setBoardSettings`, 3.11 y paso 7 fuera); los ajustes
  que el 3D guardó en `boards.settings` se quedan allí (son los de JA-VTT) y el 3D vuelve a los de `t3d.boards.settings`.

## 2026-09-26 — Documentación reorganizada al modelo de Just Another VTT

- **Qué:** petición del usuario («documenta todo correctamente, sigue el ejemplo de JA-VTT»). Sin cambios de código.
  - Nuevo [`modules/tablero3d/README.md`](../modules/tablero3d/README.md): referencia técnica propia del módulo, que
    viaja con la carpeta al copiarla en JA-VTT (sólo enlaza dentro de `modules/tablero3d/`). Recibe de
    [01](01-arquitectura.md) la interfaz `createTablero3D(host)`, el tipo de mesa, la mesa en vivo del servidor
    (privacidad, permisos, portales, tiradas), la tabla de archivos del cliente del módulo, `Tablero3D.mount` y `probe`,
    el aislamiento `t3d-` y el motor (luz y niebla, ambiente e interiores, fichas, techos y estructuras, muros y
    portales, armonía T6d); y de [02](02-funcional.md) el formato de los documentos (campos de la escena, tabla de la
    ficha y compatibilidad, `live/combat`, `live/plans`, dibujos).
  - [01](01-arquitectura.md) (536 → 128 líneas): stack, capas, montaje en este repo, cliente anfitrión, modelo de datos
    con la lista de migraciones, tiempo real, decisiones. [02](02-funcional.md) (313 → 280): el comportamiento visible
    y la API; los textos de error de las rutas del tipo de mesa pasan aquí desde [08](08-integracion-ja-vtt.md).
  - [08](08-integracion-ja-vtt.md): una sola verificación (la del cierre; las de T3b y T6d quedan en este historial),
    «Qué lleva el módulo» y «Diferencias conocidas» sin repetir lo de 01/02 (enlazan). **Los pasos 1–8 no cambian**
    (idénticos byte a byte).
  - [00](00-INDEX.md) con la forma del de JA-VTT (tamaños contados con `wc -l`, calidad con fecha, funciones, trabajo
    en curso, `_archivo/`, fuera de `docs/`, números vacantes); [03](03-despliegue.md) con sección «Producción»;
    [04](04-convenciones.md) con nivel N2, mutación como N3 y excepciones declaradas; [05](05-runbook.md) con el
    Postgres de pruebas con y sin Docker, `test:e2e` sin Docker y los pasos de cada prueba; [06](06-pendientes.md)
    con **P-08** (licencia); `docs/_archivo/` creada; [`superpowers/README.md`](superpowers/README.md) como índice por
    fecha; `CLAUDE.md` y `README.md` apuntan al README del módulo. Dos enlaces de este historial a secciones movidas
    apuntan ahora al README del módulo.
- **Por qué:** 01, 02 y 08 eran demasiado largos frente a los de JA-VTT y mezclaban el interior del motor con el
  contrato; y el módulo se va a copiar en JA-VTT, así que su documentación técnica tiene que ir con él.
- **Verificado:** todos los enlaces relativos y anclas de los `.md` resuelven (script de comprobación) · `npm run lint`
  limpio · `npm run check` 164/164 (cobertura 97,4/93,1/95,2).
- **Revertir:** revertir el commit (sólo documentación).

## 2026-09-26 — Cierre de la ronda «módulo JA-VTT, fichas, techos y luces» (T7)

- **Qué:** repaso final de la documentación y del repositorio tras T1–T6d (13 tareas, un commit cada una; hashes en el
  [plan](superpowers/plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md), marcado como cerrado). Resumen de la ronda:
  núcleo con la forma de JA-VTT y módulo `modules/tablero3d` (esquema `t3d`, 5 migraciones, `/api/t3d/`, `/t3d/ws`)
  montable en JA-VTT con 63 líneas; tipo de mesa 2D/3D fijo; y los tipos de luz, la ficha, los muros y portales, el
  ambiente y las zonas, los ajustes del tablero, la privacidad, la iniciativa, los planos, las anotaciones y los dados con
  los ids, nombres y campos de JA-VTT; además, techos de cinco materiales y formas, estructuras, arte por tamaño y 21
  personajes pintados con el píxel del mundo. Correcciones de T7:
  - [08](08-integracion-ja-vtt.md): la cuenta de líneas era 64 y es **63** (`server/app.js` 21, `index.html` 15,
    `main.js` 25; ya lo era en T3b, 62, y T6d añadió una línea al estilo); el anclaje de 3.3 dice la línea exacta; la
    tabla de lo que es del módulo lista todas sus rutas; los ajustes ya no son «sólo `playersDoors`»; al revertir, las
    tiradas del 3D quedan en el chat como tiradas (no como texto, desde T6d); el log de arranque lista hasta `t3d/005`;
    la exportación de zonas es R10 y no E7; sección nueva **«Limitaciones conocidas»** (chat P-06, tiradas fuera de la
    mesa en vivo, R15, R13, ajustes en dos sitios, segunda petición y «Escena 1» oculta, cobertura justa, móvil sin
    probar dentro de JA-VTT, versión `d68f41f`, `Dockerfile` de JA-VTT en ISO-8859-1, una sola instancia).
  - [01](01-arquitectura.md): Node ≥ 22.8 (el `engines`, que exige el umbral de cobertura de `node --test`; también en
    el README), 25 iconos propios (no 24), las consultas de `probe` de T6c/T6d, `t3d.boards.settings` guarda todos los
    ajustes, la escena por jugador ya no «se valora en T6d» (R15), variables CSS completas.
  - [00](00-INDEX.md): resumen y tamaños al día (el motor tiene ~5100 líneas, no ~4400; el núcleo ~760 y 3 migraciones)
    y sólo los números del cierre (los de cada tarea quedan aquí). [03](03-despliegue.md) y [06](06-pendientes.md):
    Docker no se ha vuelto a probar desde T1 (**P-07** nuevo). [06](06-pendientes.md): P-02 lista a falta del usuario,
    P-05 con la hoja de ruta de verdad (R1–R16, E1–E7). [04](04-convenciones.md): `test:ja-vtt` en el pipeline;
    [05](05-runbook.md): `npm start`, `test:ui` y `test:ja-vtt` en la tabla de comandos.
  - Hoja de ruta: estado «se puede empezar» y un ancla rota (`#e2`); guía para continuar: ruta real del README de los
    fijos y el mapa del código con `ambiente.js`, `ajustes.js`, `dados.js` y `liveDocFor`. README: migraciones del módulo.
  - Repositorio: sin archivos sueltos (las capturas van a `test/e2e/capturas/`, ignorada), sin `console.log` de
    depuración en `modules/`, lint limpio, `.env` fuera de git, el `Dockerfile` copia `modules/`.
- **Por qué:** muchas tareas tocaron los mismos documentos y el usuario va a integrar el módulo en su JA-VTT siguiendo
  [08](08-integracion-ja-vtt.md): tiene que ser exacto.
- **Verificado:** `npm run check` → 164/164 (cobertura núcleo + módulo 97,4/93,1/95,2) · `test:ui` 96/96 sin errores de consola · `test:e2e`
  (`realtime.mjs`, `E2E_RESTART=no`, servidor local) 13/13 · [08](08-integracion-ja-vtt.md) aplicada **al pie de la
  letra** (un script lee sus bloques y su tabla) sobre un clon limpio de JA-VTT `d68f41f`: `git diff --numstat` 63
  añadidas y 5 quitadas en 5 archivos, su `npm run lint` limpio, su `npm test` 98/98 (funciones 82,76 %; sin el módulo
  83,48 %), `npm run test:ja-vtt` 16/16 y con `T3D=off` sin esquema `t3d` y `/t3d/t3d.js` vacío. Todos los enlaces
  relativos de los `.md` existen. Docker no está disponible en la sesión (P-07).
- **Revertir:** revertir el commit (sólo documentación).

## 2026-09-26 — Ajustes, privacidad, iniciativa, planos, anotaciones y dados como Just Another VTT (T6d)

- **Qué:** que una ficha, una escena y un ajuste signifiquen lo mismo en 2D y en 3D.
  - **Ajustes del tablero** con las claves, valores por defecto y textos de JA-VTT (`BOARD_KEYS`/`DEFAULT_BOARD`/`HP_VISIBILITY`;
    fijo `test/fixtures/ja-vtt/board-settings.json`) en `t3d.boards.settings`: `sharedVision`, `playersDoors`, `chatEnabled`,
    `diceEnabled`, `initiativeShown` (por defecto no), `hpVisibility`, `hpEnabled`, `conditionsEnabled`, `acEnabled`; en la
    pestaña Mesa, secciones «Reglas para jugadores» y «Chat, dados y fichas». Efectos: visión compartida en la niebla,
    vida/CA/estados y altura escondidos para todos al apagarlos, dados apagados para todos (el servidor los rechaza).
  - **Privacidad en el servidor, por conexión** (`rules.liveDocFor`, `broadcastDoc` en `index.js`): al jugador no le llegan
    las fichas ocultas ajenas (ni le cortan el paso), la CA ajena nunca, la vida ajena según `hpVisibility` (`gm`: nada;
    `bar_only`: `hpBar` en pasos de 0,05, sin números), ni anotaciones `gmOnly`, ni planos del director sin publicar, ni la
    iniciativa sin `initiativeShown` (ni las entradas de fichas ocultas). También en las escenas y campañas que lee por REST.
    `sheet.withheld` le dice al cliente qué falta.
  - **Iniciativa** con la forma de JA-VTT `{ entries, turn, round }` en el documento `combat` (mismo nombre; el de antes con
    `order` se traduce al abrir la mesa y en el cliente), con `roll`/`init` y `left`/`dashed` del 3D; el jugador pasa el turno
    o gasta el movimiento sólo en el turno de su ficha (el servidor busca la siguiente viva).
  - **Planos** (`type 'plan'`: line/circle/rect/cone, `a`, `b`, `owner`, `color`) = las plantillas de Partida con «Fijar
    plantilla» (cubo → rect, línea de conjuro → line con `area`); los del director en la escena con «Planos visibles para los
    jugadores» (`plansReleased`), los de los jugadores en el documento nuevo `live/plans` (migración `t3d/005-planos-en-vivo.sql`).
    **Anotaciones** (`type 'note'`, ≤ 200, `gmOnly`) desde el menú contextual, como etiquetas sobre el tablero. Las notas de
    campaña no se unifican.
  - **Dados** con la notación y el cuerpo de `server/dice.js` de JA-VTT (fijo `dice.json`): `modules/tablero3d/dice.js`
    (servidor, tira en la mesa en vivo: mensaje `roll`) y `public/dados.js` (cliente); la tirada va a `chat_messages` con kind
    `roll` y `{ formula, dice, mod, total, label? }` (+ `adv`), así el chat de JA-VTT la pinta como tirada. Fórmula en Partida →
    Dados. El `emit` de `roll`/`travelAsk` lo rechaza el servidor.
  - **Ajustes de escena** `grid` (cuadrícula nueva, 1 llamada), `snap` (se guarda), `animate` («Animar llamas y pulsos»:
    congela agua, lava, llamas, halos y la respiración de las fichas; también con movimiento reducido) y `plansReleased`.
  - **Pies** en todo lo que se ve (regla, menú contextual, radio de la luz de un dibujo, avisos de zona y techo).
  - Escena por jugador (`board_members.scene_id`): valorada y dejada en la hoja de ruta (R15, con lo que falta).
  - Nuevos: `modules/tablero3d/dice.js`, `public/ajustes.js` (`Tablero3D.Ajustes`), `public/dados.js` (`Tablero3D.Dados`),
    migración `t3d/005`, fijos `board-settings.json` y `dice.json`. `probe` gana `combat`, `plans`, `notes`, `log` y datos de
    privacidad en `tokens`. Guía de JA-VTT ([08](08-integracion-ja-vtt.md)): `postChat` pasa el `kind` y el estilo esconde sus
    ajustes 2D en una mesa 3D.
- **Por qué:** plan T6d y principio de producto: una mesa para mover fichas con los mismos ajustes, privacidad, iniciativa,
  planos, anotaciones y dados que JA-VTT, y la privacidad hecha por el servidor (antes el cliente sólo dejaba de pintar).
  Las tiradas llegaban al chat de JA-VTT como texto (T3). La escena por jugador cambia el modelo de la mesa en vivo (una por
  escena) y no cabía en esta tarea.
- **Cambios de comportamiento a tener en cuenta:** la cuadrícula se ve por defecto (valor de JA-VTT), también en las escenas de
  antes (se apaga por escena en Escena → Cuadrícula); por defecto el jugador ya no ve el orden de iniciativa (hay que marcar
  «Mostrar la iniciativa a los jugadores»); con visión compartida (por defecto) cada jugador ve lo que ve todo el grupo, no
  sólo lo de sus fichas; la tirada la hace el servidor en la mesa en vivo.
- **Verificado:** `npm run check` → 164/164 (23 tests nuevos: 11 de reglas —ajustes y escena contra JA-VTT, planos,
  anotaciones, privacidad por rol y `hpVisibility`, escena para el jugador, iniciativa y turno del jugador, planos en la mesa,
  dados contra el fijo—, 4 contra el servidor —fichas por conexión, ajustes en vivo e iniciativa, planos y anotaciones y
  lectura por REST, dados con `diceEnabled`— y 8 del cliente —ajustes y textos de JA-VTT, el motor los aplica, planos = cuenta
  de las plantillas, escena de antes y de ahora, iniciativa, `withheld`, dados—; y 7 cambiados), cada uno roto una vez a
  propósito (31 mutaciones); cobertura del módulo 99/95/96 (índice), 100/95/100 (reglas) y 100/98/100 (dados) · `test:ui`
  96/96 (10 pasos nuevos y el de la tirada cambiado, rotos a propósito en cuatro tandas; capturas 17 y 18), sin errores de
  consola · en una copia de JA-VTT `d68f41f` con la guía nueva: sus tests 98/98 y `test:ja-vtt` 16/16 (2 pasos nuevos o
  cambiados, rotos a propósito).
- **Revertir:** revertir el commit y quitar las dos líneas nuevas de la guía en JA-VTT. La migración `t3d/005` sólo cambia el
  `CHECK` de `live_docs`: se puede dejar (o borrar las filas `plans` y volver al `CHECK` de antes). Los ajustes nuevos en
  `t3d.boards.settings` los ignora el código de antes (sólo lee `playersDoors`). Un combate guardado con la forma nueva no lo
  lee el código de antes (el combate se pierde; basta empezar otro). Las escenas con `grid`, `plans` o `notes` se abren igual
  (el código de antes ignora esos campos y los pierde al guardar).

## 2026-09-26 — Momentos de luz de JA-VTT, zonas interiores y ventanas (T6c)

- **Qué:** el ambiente de la escena con los `ENVS` de JA-VTT (`interior`, `day`, `dusk`, `night`: ids, nombres,
  iconos, descripciones, `ambient` y `dark`; fijo `test/fixtures/ja-vtt/envs.json`, `d68f41f`) en
  `modules/tablero3d/public/ambiente.js` (`Tablero3D.Ambiente`, lo carga `t3d.js`) y `modules/tablero3d/rules.js`
  (`ENVS`, `cleanEnv`, `cleanZoneCells`). La escena guarda `env`, `ambient` y `darkColor` (nombres de JA-VTT) y ya no
  `night`; las de antes abren de noche con `night: true` y si no de día (cliente y servidor igual). Sección
  **Iluminación** en la pestaña Escena (los cuatro momentos con los componentes `envGrid`/`env`/`rangeRow` de JA-VTT,
  deslizador de luz ambiental y color de la oscuridad, con deshacer y reparto en la mesa en vivo); «Nueva escena»
  elige el momento. Sustituye al botón Noche (`state.night`, `applyMode`, `uTorchK`). Motor: el mismo de luz por
  casilla, ampliado: `lightFor(s, torch, a)` mezcla `uDark`→`uAmbient` según el ambiente que llega a la casilla y las
  fuentes pesan `torchK` (0,35 a pleno día, 1,15 a oscuras); tinte y cielo propios por momento (día como antes,
  atardecer cálido con cielo morado y naranja, noche azul de luna, interior casi negro del color de la oscuridad) y
  fundido de 0,9 s. **Zonas interiores** por casilla: cada techo crea la suya y el director pinta o borra con la
  herramienta **Zona interior** (tecla Z, icono `house` de JA-VTT; Techos pasa a `warehouse`, nuevo en
  `icons-t3d.js`), guardadas en `zoneCells` (`0`/`1`/`2` por casilla, sólo si pinta algo), con contorno a trazos
  #B79BD8 en edición. Dentro no llega el ambiente, la niebla aplica la regla de oscuridad de JA-VTT (ambiente > 0,25)
  aunque fuera sea de día y los halos brillan como a oscuras; `isInterior` queda para el clima (R7). **Ventanas y
  puertas abiertas** que dan fuera dejan entrar el ambiente en un cono de 120° y radio 5 con las sombras del motor
  (`windowLight`). El ambiente por casilla viaja en una textura (`uAmbT`), así que cambiar de momento sólo toca
  uniformes. El Pueblo de Brezo gana 14 ventanas; la mazmorra abre en interior, el Taller de luces de noche.
  `probe` gana `env`, `ambient`, `interior` y `light`.
- **Por qué:** plan T6c y petición del usuario («diferentes momentos de iluminación ambiente»): que el ambiente y
  las zonas signifiquen lo mismo en 2D y en 3D, sin cambiar el motor de luz 3D (se amplía). Por casilla, como el
  motor; la luz de las ventanas es el ambiente de fuera y no una luz de color, para que siga al momento del día.
- **Verificado:** `npm run check` → 141/141 (8 tests nuevos: 2 de reglas —ambiente y escenas de antes, zonas
  pintadas y su reparto en la mesa en vivo— y 6 del cliente —fijo de JA-VTT y marcado, `norm` = `cleanEnv`, aspecto
  de cada momento y peso de las luces, zonas de techos y pintadas, ventanas con cono y sombra, plantillas—; cada uno
  roto una vez a propósito, 16 mutaciones, y los 11 pasos nuevos de `test:ui` en tres tandas de mutaciones); cobertura del módulo 99/95/97 (índice) y 100/95/100 (reglas) · `test:ui`
  86/86 (11 pasos nuevos: panel Iluminación, los cuatro momentos con fundido, deslizador y deshacer, casa de día con
  la luz de su ventana, zona interior pintada que oscurece y oculta al goblin en la niebla hasta que hay una antorcha,
  guardado, escenas de antes con y sin `night`, el jugador de la mesa en vivo ve el atardecer; capturas 16 y 07b),
  sin errores de consola; el pueblo, 20 fps con SwiftShader como antes (426 llamadas alejado, +28 por las ventanas).
  JA-VTT no cambia (sin líneas nuevas en la guía): `test:ja-vtt` no se repite.
- **Revertir:** revertir el commit. Sin migraciones. Las escenas guardadas después llevan `env` en vez de `night`: con
  el código de antes abrirían de día (poner `night: true` a mano en las de noche o interior) y perderían las zonas
  pintadas (`zoneCells` se ignora).

## 2026-09-26 — Muros, puertas con llave y portales como Just Another VTT (T6b)

- **Qué:** los siete tipos de muro de JA-VTT (`WALL_TYPES`/`WALL_KINDS`: muro, puerta, ventana, velo, maleza, barrera,
  portal) con sus ids, nombres, iconos, colores, trazos, descripciones y banderas (`sight`, `light`, `move`, `hide`,
  `door`, `portal`), en `modules/tablero3d/public/muros.js` (`Tablero3D.Muros`, lo carga `t3d.js`) y en
  `modules/tablero3d/rules.js`; fijo `test/fixtures/ja-vtt/wall-types.json` (`d68f41f`). **Por casilla** (primera
  fase): el muro es la casilla de terreno Muro de siempre; puerta = los objetos puerta con `open` y ahora `locked`;
  ventana, velo, maleza, barrera y portal = objetos nuevos (escenas de antes, idénticas). Cada uno con su objeto por
  capas editable en «Todo el arte» (ventana de ladrillo con cristal, cortina, hierba alta, barrera a trazos que sólo
  ve el director y cinco aspectos de portal: puerta en arco, escalera, boca de cueva, trampilla y portal mágico con la
  luz `crystal` de T4). Motor: `Vision.los`/`lightReaches` consultan `g.bk(i, flag)` (tapa hasta 1 sobre el suelo),
  los caminos respetan el paso, y la **maleza** oculta en la niebla las fichas y los objetos pequeños que sólo se ven
  a través de ella (`Vision.los(…, 'hide')`: se ve a quien está dentro, no a quien está detrás). Herramienta **Muros**
  (tecla M) con los siete tipos, llave de la puerta, aspecto, nombre y destino del portal, «Enlazar también la vuelta»
  y R para girar. **Puertas con llave** (el jugador no las abre; nadie las cruza andando) y el ajuste de tablero
  **`playersDoors`** de JA-VTT (por defecto sí), guardado en `t3d.boards.settings` (migración del módulo
  `t3d/004-ajustes-del-tablero.sql`; `GET/PATCH /api/t3d/boards/:id/settings`, llega con el `state` y como mensaje
  `settings`) y exigido en el servidor (`liveChange` de `live/doors`: sólo puertas de la escena de la mesa, sin llave
  y con `playersDoors`). **Portales** con `target: {scene, portal}` a cualquier escena 3D del tablero: llegada junto
  al portal de destino calculada en el servidor (`arrival`, la idea de `arrivalPoints` por casillas), «Reunir al
  grupo» (`gather`), `GET …/scenes/:sid/portals` como JA-VTT, `POST …/travel` fuera de la mesa en vivo y mensajes
  `travel`/`gather` en ella (la mesa sigue la escena del director, `live/board.scene`; un jugador pide cruzar y el
  director decide, `travelAsk`). Al borrar una escena, los portales que llevaban allí quedan sin destino (escenas
  guardadas y mesa abierta). Las escaleras de campaña de antes se leen como portales de aspecto escalera (cliente y
  servidor igual) y «Crear portal a…» sustituye a «Crear paso a…». Los personajes guardan su dueño en la escena
  (`owner`) para que la mesa lo conserve al cruzar. `probe` gana `props` con el tipo de muro, `los`, `fog`, `screen`
  y `scene`.
- **Por qué:** plan T6b: que muros, puertas y portales signifiquen lo mismo en 2D y en 3D. Por casilla porque el motor
  3D (visión, luz, caminos) es por casilla y así una escena de antes no cambia; los muros finos quedan en la hoja de
  ruta. La mesa sigue al director (y no escena por jugador como `board_members.scene_id` de JA-VTT) porque la mesa en
  vivo del 3D es una sola escena compartida: se valorará con T6d.
- **Verificado:** `npm run check` → 133/133 (23 tests nuevos: 8 de reglas —saneado de muros, portales y escaleras de
  antes, puertas con llave y `playersDoors`, ajustes, llegada, viaje y reunir, limpieza—, 5 contra el servidor
  —ajustes, puertas en la mesa, lista de portales y borrado, viaje fuera y dentro de la mesa en vivo con aviso al
  director y reunir—, 10 del cliente —fijo de JA-VTT, `normProp` = `cleanWallProp`, objetos y lo que se pisa, vista,
  luz, paso y ocultación de cada tipo, el motor, llegada cliente = servidor—), cada uno roto una vez a propósito;
  cobertura del módulo 99/95/97 (índice) y 100/95/100 (reglas) · `test:ui` 75/75 (15 pasos nuevos: paleta de los siete
  tipos, colocar cada uno y cada aspecto de portal, llave, ventana, velo, maleza, puerta con llave y barrera, de día y
  de noche, enlazar dos escenas, cruzar y llegar junto al portal, reunir al grupo, el jugador no abre una puerta con
  llave ni ve la barrera, sí abre una sin llave, y no con `playersDoors` apagado; capturas 13, 14 y 15), sin errores de
  consola. JA-VTT no cambia (sin líneas nuevas en la guía): `test:ja-vtt` no se repite.
- **Revertir:** revertir el commit. La migración `t3d/004` sólo añade una columna con valor por defecto: se puede
  dejar (o `ALTER TABLE t3d.boards DROP COLUMN settings` y borrar su fila de `t3d.schema_migrations`). Las escenas
  guardadas con objetos de muro nuevos los perderían al abrirse con el código de antes (`deserialize` descarta un
  tipo desconocido) y las escaleras convertidas a portales se verían como un portal desconocido: antes, quitarlos.

## 2026-09-26 — Personajes del tablero con el estilo del mundo: medianos redibujados a mano y 12 nuevos (T5c)

- **Qué:** los cuatro personajes medianos de fábrica (caballero, maga, goblin, aldeano) se redibujan a mano,
  texel a texel, a 16×24 (la densidad de T5b, ampliados con EPX como antes) con el estilo del terreno, los
  techos y las criaturas grandes: proporciones de cabeza grande, luz de arriba a la izquierda, rampas de 3–4
  tonos de la paleta del motor con sombras frías y luces cálidas, pliegues oscuros y **contorno selectivo**
  (`selout`: tinta abajo y a la derecha; en el lado de la luz, el color de la pieza oscurecido). Doce nuevos
  con el mismo estilo: guerrera, pícaro, clérigo, arquera (jugadores); esqueleto, lobo, bandido (enemigos);
  molinero, tabernera, herrero, anciana y guardia (vecinos). Tres vistas cada uno. El arte vive en
  `modules/tablero3d/public/personajes.js` (`Tablero3D.Personajes`, sin dependencias, lo carga `t3d.js`):
  rejillas de letras y claves de color que se resuelven con las rampas del motor (`art(P)`); el motor los
  pinta (`handArt`) y los mete en `CAN` y `CHARS` (paleta de Personajes, «Todo el arte» editable y restaurable,
  nacen Medianos). `defaultSheet` pasa a una tabla (`SHEET_OF`, mismos valores para los de antes; el nombre
  sale de `CHARS`). La piel y el metal de los personajes entran en la paleta del editor de dibujo; las rampas
  extra (`EXTRA_RAMPS`) y las de las criaturas grandes suben al principio del motor para que las usen los
  personajes. Plantillas: los vecinos del pueblo usan su personaje (guardia, tabernera, herrero, anciana
  —«Abuela Lía», antes «Aldeana Lía»—, clériga, molinero; el pregonero sigue de aldeano) y Aria llega con
  Brenna (guerrera, 17,18) e Ilse (arquera, 21,18); el claro trae un lobo; las mazmorras reparten esqueletos,
  goblins y bandidos (según la casilla, sin tocar el generador: la misma semilla da el mismo mapa); la nota de
  las catacumbas de la campaña de ejemplo ya no habla de goblins. El Taller de luces no cambia.
- **Por qué:** el usuario: los personajes «no pegan nada con el entorno». Junto a los grandes de T5b (volúmenes
  sombreados) el caballero de 16×24 se veía plano y tosco, y todos los vecinos eran el mismo aldeano. A 16×24
  `sculpt` no da volumen a piezas de 3–4 texeles: se pintan a mano, como la rata y el niño.
- **Verificado:** `npm run check` → 110/110 (2 tests nuevos: el contorno selectivo; y cada personaje mediano
  con sus tres vistas de 16×24, letras con color, ≥ 150 texeles, contorno oscuro en al menos la mitad del borde,
  6–28 colores dentro y sólo colores de la paleta del motor; más los cambios en los de `CHARS` —lista, nombres,
  tamaños de nacimiento—, el cargador, los globales y las plantillas), cada uno roto una vez a propósito ·
  `test:ui` 60/60 (4 pasos nuevos: cada vecino con su personaje; el desfile de los 21 importado como escena, con
  su arte a su tamaño y el texel del terreno; de día y de noche sin errores; un dibujo guardado para `knight`
  sustituye al caballero de fábrica —la textura que se pinta cambia, `probe('sprite')`—; capturas nuevas 10c/10d de cerca en
  la plaza y el molino y 12/12b del desfile), sin errores de consola.
- **Revertir:** revertir el commit. No hay migraciones. Las escenas guardadas con los personajes nuevos los
  perderían al abrirse (`deserialize` descarta un sprite desconocido): antes, cambiarlos por uno de los de antes.

## 2026-09-26 — Arte propio por tamaño de ficha: el píxel del personaje mide lo que el del terreno (T5b)

- **Qué:** cada tamaño de ficha tiene su lienzo de arte (`Fichas.SIZES[].art`, a 16 texeles por casilla:
  Diminuto 10×14, Pequeño 12×18, Mediano 16×24, Grande 32×48, Enorme 48×72, Colosal 64×96; ×2 y ×4 a 32 y
  64). El sprite de una ficha ya no se escala por su tamaño (antes ×0,55…×3,5): mide sus propios píxeles
  (`spriteDims` / `Fichas.spriteWorld`), así que su texel es siempre 1/`TEX` de casilla, el del terreno. Arte
  nuevo a su tamaño, pintado en el motor (`sculpt`: volúmenes sombreados con la luz y las rampas del resto,
  pliegues y contorno de tinta), tres vistas cada uno: ogro Grande (32×48, redibujado), trol Enorme (48×72),
  gólem de piedra Colosal (64×96, con runa que brilla), rata Diminuta (10×14) y niño Pequeño (12×18). Todos
  en `CHARS`: paleta de Personajes (nacen de su tamaño), «Todo el arte» (editables y restaurables). El pueblo
  usa el trol y el niño de verdad y trae un gólem guardián junto a la capilla (44,6). La ficha avisa si el
  arte es de otro tamaño. Editor: el personaje elige su tamaño al crearlo (diálogo) o al editarlo (Opciones,
  «Tamaño»: el lienzo cambia sin reescalar el dibujo, centrado sobre el suelo); línea de suelo y guías de
  altura cada 5 pies (hoja de ruta E4, en parte). Datos: el dibujo de personaje guarda `charSize`
  (`cleanDrawing`, `drawingRecord`), columna `t3d.drawings.char_size` en la migración nueva del módulo
  `003-arte-por-tamano.sql`, que además sube el alto máximo de un dibujo de 256 a 384 (Colosal a 64 px). Los
  personajes dibujados de antes se leen como Medianos.
- **Por qué:** el usuario vio que un trol Enorme era un sprite de 16×24 ampliado ×2,7: sus píxeles eran
  mucho más gordos que los del suelo y rompían el pixel art. Decidió arte propio por tamaño con la misma
  densidad en todo. Con arte de otro tamaño se muestra a su escala (con aviso) en vez de ampliarlo.
- **Verificado:** `npm run check` → 108/108 (4 tests nuevos: tamaño del arte en `cleanDrawing`/`drawingRecord`;
  columna, alto 384 y rechazos en la base; densidad constante para cada tamaño a 16/32/64 y dibujos a
  cualquier resolución; lienzos, tamaños de nacimiento y «Todo el arte» de los personajes de fábrica; más
  la ida y vuelta de `charSize` por la API), cada uno roto una vez a propósito · `test:ui` 56/56 (5 pasos
  nuevos: ogro colocado Grande de 3 casillas de alto con el texel del terreno; trol, gólem, rata y niño con
  el mismo texel; capturas de día y de noche; el ogro se abre en su lienzo con guías; Enorme cambia el
  lienzo), sin errores de consola.
- **Revertir:** revertir el commit. La migración `003` sólo añade una columna y amplía un CHECK: puede
  quedarse; para quitarla, `ALTER TABLE t3d.drawings DROP COLUMN char_size` y volver el CHECK de `height` a
  256 (antes, borrar los dibujos de más de 256 de alto) y la fila `003-arte-por-tamano.sql` de
  `t3d.schema_migrations`.

## 2026-09-26 — Techos de cinco materiales y cinco formas, estructuras y un pueblo más rico (T6)

- **Qué:** los techos (`roofs[]`) ganan `mat` (teja roja, pizarra, paja, tablillas de madera, cobre con
  verdín: casillas 27, 31, 41, 42 y 43 del atlas, cada una editable y restaurable en «Todo el arte»),
  `shape` (a dos aguas, a cuatro aguas, plano con almenas, cónico, a un agua) y `rot` (gira la cumbrera);
  los de antes son de teja a dos aguas como eran. `normRoof` (cliente) y `cleanRoof` (servidor, `cleanMap`)
  los sanean igual. Material nuevo del motor `roofMat`: textura en coordenadas del mundo, repetida dentro
  de su casilla (misma densidad de píxel que el terreno en cualquier faldón), aleros con remate, caballete,
  hastial en el plano del muro, y luz de la calle en los aleros (`roofLight`). Herramienta Techos (7):
  materiales en la paleta, formas con silueta en píxeles, dirección, **R**, elegir un techo tocándolo y
  cambiarlo (con deshacer); con esta herramienta los techos se ven. Objetos por capas: extensiones
  `span` (varias casillas), `door`/`lift`/`frame` (puerta de muralla con rastrillo que sube dentro de su
  arco, abierta y cerrada como una puerta), `deck` (puentes que se pisan a la altura de la orilla),
  `noShadow` y `cat` (filtro «Estructuras» y «Decorado»); volúmenes hechos al usarse (`pstack`). Estructuras
  nuevas: puesto de fruta y de telas, puente y puente ancho, puerta de la muralla (+ arco), molino de viento,
  campanario, poste, carreta, cajas y barriles, banco, valla de estacas, murete de piedra y letrero; pozo
  mejorado. Arreglo: a 32 px por casilla las comparaciones con alturas exactas de los objetos no se cumplían
  (faltaban la llama de los faroles, los aros de los barriles, las baldas y los travesaños de las vallas):
  cada rebanada toma ahora su rebanada base. «Pueblo de Brezo» pasa a 48×40: muralla al norte con puerta de
  rastrillo y dos torres almenadas, torre de la esquina, atalaya con techo cónico de pizarra, plaza del
  mercado con tres puestos, capilla de piedra con techo de cobre, bancos, altar con velas y campanario,
  herrería con cobertizo a un agua sobre postes, granero de tablillas, casas de paja y de pizarra, torre de
  la maga cónica, taberna a cuatro aguas, arroyo con puente ancho y pasarela, molino en una loma y luces de
  noche de JA-VTT (antorchas, braseros en las torres, faroles, velas, luna); las fichas de antes siguen en
  su sitio y se añaden vigía, hermana, molinero.
- **Por qué:** el usuario pidió más tipos de techo y estructuras, todas editables en «Todo el arte», y un
  pueblo de ejemplo más rico que las use, con el pixel art como prioridad.
- **Verificado:** `npm run check` → 104/104 (5 tests nuevos: saneado de techos en el servidor; cliente =
  servidor; casillas de los tejados libres y editables; cada estructura pinta algo, cabe y se edita a 64 px;
  el pueblo usa cada material, forma, estructura y tipo de luz) · `test:ui` 51/51 (7 pasos nuevos: la
  herramienta ofrece materiales y formas, techo a cuatro aguas de pizarra con dos esquinas, R, vuelve a
  cubrir al salir de editar, se guarda en PostgreSQL, el pueblo trae todo, y el pueblo de día y de noche
  desde dos lados sin errores; capturas 03c y 10). Cada test nuevo se rompió una vez a propósito. Llamadas
  de dibujo del pueblo con SwiftShader: vista inicial 152 → 173, alejada 345 → 393; 20–23 fps antes y después.
- **Revertir:** `git revert` del commit. Las escenas guardadas con techos nuevos las abre el código anterior
  como techos de teja a dos aguas; los objetos nuevos (tipos desconocidos) se descartan al abrirlas. Sin
  migración de esquema.

## 2026-09-26 — Fichas con los campos de JA-VTT, de varios tamaños y en pixel art (T5)

- **Qué:** la ficha (`sheet`) pasa a los campos de la ficha de JA-VTT: `kind` player/enemy, `name`,
  `size` 1–4, `color`, `hidden`, `vision`, `sight` y `darkvision` en pies, `light` (su objeto),
  `conditions` (sus 20 `CONDITION_IDS`, fijo `test/fixtures/ja-vtt/conditions.json`), `elevation`, `ac`,
  `hp:{cur,max,temp}`, más `speed` e `init` del 3D y los extras `neutral`, `tiny` y `small` (tabla en
  el [README del módulo](../modules/tablero3d/README.md#ficha-sheet)). `fichas.js` nuevo (`Tablero3D.Fichas`, sin dependencias): `norm`,
  tamaños, estados, luz de ficha, ocupación, distancias de borde a borde y caminos para fichas n×n;
  `cleanSheet` del servidor lee igual (también las fichas de las escenas en `cleanMap`) y `liveChange`
  compara ya saneado y no deja al jugador cambiar bando, tamaño, visión ni visibilidad. Tamaños de
  Diminuto a Colosal: ocupación, caminos (todas las casillas libres, escalones casilla a casilla), huellas
  y destino, arrastre, puertas, techos, pasos, plantillas de área, regla de borde a borde, editor,
  minimapa, visión desde sus casillas y luz desde su centro. Aspecto: peana de piedra con filo del color
  del bando, sombra tramada, anillo de trazos animado, estados y vida en píxeles sobre la ficha. Pestaña
  Fichas rehecha (sólo lo que usa la mesa). Sprites nuevos: rata y ogro; el pueblo trae un ogro Grande, un
  trol Enorme, una rata Diminuta y un niño Pequeño; el claro, una rata. `mount` devuelve también
  `probe` (sólo lectura, para `test:ui`).
- **Por qué:** el usuario: las fichas «no pegan nada con el entorno» y tienen que ser de varios tamaños;
  y, por el principio de producto, la ficha sólo lleva lo que usa la mesa, con los campos de JA-VTT, para
  que una ficha signifique lo mismo en 2D y en 3D.
- **Verificado:** `npm run check` → 99/99 (12 tests nuevos: saneado, compatibilidad, tamaños, estados,
  permisos, cliente = servidor, estados y luces contra JA-VTT, caminos de fichas grandes, distancias,
  plantillas), cobertura del módulo 100/94,2/100 en `rules.js` · `test:ui` 44/44 (3 pasos nuevos: tamaños
  del pueblo, Grande ya no pasa por la puerta de la taberna, estado con su chapa; capturas día y noche).
  Cada test nuevo se rompió una vez a propósito. `test:ja-vtt` no se tocó (sin cambios en la guía).
- **Revertir:** `git revert` del commit. Las fichas guardadas con el formato nuevo las lee el código
  anterior con sus valores por defecto (perderían tamaño, estados, vida temporal y luz); sin migración de
  esquema.

## 2026-09-26 — Tipo de mesa 2D o 3D fijo al crear el tablero (T3b)

- **Qué:** migración del módulo `t3d/002-tableros-3d.sql` con `t3d.boards (board_id PK →
  public.boards en cascada, created_at)`: fila = mesa 3D. Rutas `GET /api/t3d/boards/:id` (miembros:
  `{ board: { id, t3d, role } }`), `POST` (director: marcarla 3D, idempotente, sólo 10 minutos tras
  `boards.created_at`) y `DELETE` (siempre 409: el tipo es fijo). En un tablero 2D las demás rutas del
  3D dan 404 «Este tablero no es una mesa 3D», `/t3d/ws` cierra con 4404 y `join` no lo atiende.
  Ganchos nuevos: `markBoard(id)`, `tagBoards(boards)` (sólo añade `t3d: true`; `describeBoards`
  ahora también lo añade) y la opción `allBoards3D`. Este repo: todo tablero es 3D
  (`allBoards3D: true` marca los existentes al arrancar y `POST /api/boards` llama a `markBoard`),
  sin selector. [08](08-integracion-ja-vtt.md): fuera el botón 3D de cabecera, la entrada «Tablero 3D»
  del menú de escenas y la vuelta a 2D; dentro el selector «Tipo de mesa» en «Nuevo tablero», la
  apertura directa en 3D (`open3d` pregunta el tipo antes de conectar el `Net`), el aviso 2D de
  `onBoardReady` desactivado en 3D, la etiqueta 2D/3D de las tarjetas y `tagBoards` en la lista de
  tableros: 64 líneas en 5 archivos (antes 66). `test:ja-vtt` reescrito (15 pasos). Tests: módulo
  (tipo, `join`, `tagBoards`, `allBoards3D`), anfitrión mínimo (rutas del tipo, 404 y 4404 en 2D,
  plazo, sin vuelta atrás), API de este repo, migración de un despliegue anterior y contrato con
  JA-VTT (sus tableros siguen 2D).
- **Por qué:** decisión del usuario: el tipo de mesa se elige al crear el tablero y no cambia; una
  mesa 3D abre en 3D sin botón, una 2D es JA-VTT sin rastro del módulo.
- **Verificado:** `npm run check` → 87/87 · `test:ui` 41/41 · copia limpia de JA-VTT `d68f41f` con
  los fragmentos nuevos: `npm run lint` limpio, `npm test` 98/98, `test:ja-vtt` 15/15 y con
  `T3D=off` sin selector, sin etiquetas y sin errores. Cada test nuevo se rompió una vez a propósito.
- **Revertir:** `git revert` del commit. La tabla `t3d.boards` se queda (inofensiva para el código
  anterior); para quitarla, `DROP TABLE t3d.boards; DELETE FROM t3d.schema_migrations WHERE version = 2;`.
  Quien ya integró la guía nueva en JA-VTT vuelve a los pasos de T3 de [08](08-integracion-ja-vtt.md)
  en ese commit.

## 2026-09-26 — Tipos de luz de Just Another VTT sobre el motor de luz 3D (T4)

- **Qué:** catálogo `LIGHT_TYPES` en el motor con los 12 tipos de `LIGHT_PRESETS` de JA-VTT (mismos
  ids, nombres e iconos) traducidos a radio, altura, color, intensidad y animación del motor 3D
  (tabla en el [README del módulo](../modules/tablero3d/README.md#luz-y-niebla)). Extensiones pequeñas del motor: cono
  (`angle`/`rot`, linterna sorda y ventana), oscuridad mágica (luz negativa por casilla que tapa luz,
  ambiente, sprites, halos y niebla), animaciones `soft` y `pulse` del halo, luces apagadas y sin
  halo. Luces guardadas con los nombres de JA-VTT (`preset`, `color`, `intensity`, `anim`, `angle`,
  `rot`, `darkness`, `on`, `name`) más `r` y `h`; las de antes (`r,h,c,f`) se leen igual en el
  cliente (`normLight`) y el servidor las sanea y traduce (`cleanLightProp`, radio hasta 24). Luz de
  ficha: tipos de `TOKEN_LIGHTS` (la linterna sorda apunta hacia donde mira) sin romper la numérica.
  Objetos dibujados: `lightSpec.preset` opcional. Herramienta Luz: paleta de 12 tipos con icono,
  panel con tipo, radio, altura, intensidad, color, animación, encendido, dirección y apertura;
  **R**/Mayús+R gira; cono visible al editar; nombres de las luces sobre el tablero al editar.
  Plantilla nueva **Taller de luces 43×24**. Tests: contrato con `test/fixtures/ja-vtt/light-presets.json`
  (`d68f41f`), cliente y servidor leen igual las luces, reglas nuevas y 2 pasos de `test:ui`.
- **Por qué:** plan T4. El usuario pidió tomar de JA-VTT sólo los *tipos* de fuente: su motor de luz
  3D (por casilla, sombras, altura, halos, parpadeo, niebla) se queda tal cual.
- **Efecto visible:** paleta de luces nueva; escenas antiguas se ven igual.
- **Verificado:** `npm run check` → 83/83 · `test:ui` 41/41 sin errores de consola · capturas del
  taller de noche revisadas (unos 35 fps con SwiftShader a 1400×860, más que el pueblo, 26).
  Cada test nuevo se rompió una vez a propósito.
- **Revertir:** `git revert` del commit (sin migraciones). Las escenas guardadas después tienen
  luces con los campos nuevos: el código anterior las abre con radio, altura y color por defecto
  (ignora `color`); para conservarlas, renombrar `color` → `c` y `anim` → `f` antes de revertir.

## 2026-09-26 — Módulo 3D autosuficiente e integración documentada en Just Another VTT (T3)

- **Qué:** el módulo `modules/tablero3d` ya no necesita cambios dentro de él para vivir en JA-VTT:
  trae los 24 iconos que el `ICONS` de JA-VTT no tiene (`public/icons-t3d.js`, se añaden sin pisar
  ninguno), sirve sus estáticos (`t3d.serve`), abre su propia conexión en tiempo real si el
  anfitrión no le da `net` (`/t3d/ws` ↔ `t3d.socket`, con cola por tablero, latido, `kick` y cierre
  al borrar el tablero) y se puede apagar (`enabled: false`). `postChat` recibe el usuario
  (`{ id, name, color }`) en vez del id. El anfitrión de este repo sigue repartiendo la mesa por su
  `/ws` y además acepta `/t3d/ws`; su `public/js/icons.js` queda idéntico al de JA-VTT.
  Guía nueva [08-integracion-ja-vtt.md](08-integracion-ja-vtt.md) con las líneas exactas (servidor
  ~20, `index.html` ~14, `main.js` ~29, `editor.js` 1, `Dockerfile` 1). Tests nuevos:
  `test/ja-vtt-contract.test.js` (migraciones de JA-VTT `d68f41f` en `test/fixtures/ja-vtt/migrations`
  + módulo sin choques, dos veces; núcleo idéntico en columnas, restricciones e índices),
  `test/t3d-host.test.js` (anfitrión mínimo sólo con la interfaz documentada), contratos de iconos
  y variables CSS contra JA-VTT, `/t3d/ws` en `realtime.test.js`, paso nuevo en `test:ui` (montar sin
  `net`) y `npm run test:ja-vtt` (humo contra un JA-VTT integrado).
- **Por qué:** plan `superpowers/plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md` (T3). El
  usuario integrará el módulo él mismo sin tocar `modules/tablero3d`. El `Net` de JA-VTT no expone
  sus mensajes (y su `state` cambia con la escena 2D), así que el módulo lleva su propia conexión en
  vez de pedirle a JA-VTT un gancho `onMessage`. No se escribe script de exportación/importación:
  la instalación en JA-VTT será nueva.
- **Efecto visible:** ninguno en este repo.
- **Verificado:** `npm run check` → 76/76, cobertura 96,0/89,7/93,6 · `test:ui` 39/39 · copia de
  JA-VTT `d68f41f` con los fragmentos de la guía: su lint limpio, su `npm test` 98/98, humo 12/12;
  con `T3D=off`, sin esquema `t3d` y sin errores. Cada test nuevo se rompió una vez a propósito.
- **Revertir:** `git revert` del commit (sin migraciones). Si el 3D ya se montó en un JA-VTT, ver
  «Revertir» en [08](08-integracion-ja-vtt.md).

## 2026-09-26 — Cliente del tablero 3D aislado y montable: `Tablero3D.mount` (T2)

- **Qué:** el cliente 3D pasa a `modules/tablero3d/public/` (servido en `/t3d/`): `t3d.js`
  (`Tablero3D.mount(root, { boardId, net, user, role, icon, showTab, onDom })` → `{ ready,
  unmount }`), `t3d.html` (el marcado del 3D en plantillas por hueco), `t3d.css`, `mesa.js` (el
  antiguo `window.Mesa`, ahora adaptador sobre el `Net` del anfitrión), `vision.js`
  (`Tablero3D.Vision`), `tablero3d.js` (`Tablero3D._engine`) y `vendor/three.min.js`. El
  anfitrión (`public/`) queda con la forma de JA-VTT: `index.html` marca huecos
  `data-t3d-slot`, `main.js` monta el módulo y lleva un marco de pestañas genérico
  (`data-tab` / `data-pane`), `net.js` sólo hace el WebSocket y ofrece `onMessage` y `sendRaw`.
  Los 126 ids del módulo y sus 64 clases propias (`gmOnly` y `gmSect` se funden en `t3d-gm`)
  llevan el prefijo `t3d-`; también sus `data-tab`/`data-pane`/`data-fold`. Estilos bajo `.t3d-root` con las variables del anfitrión.
  Globales añadidos: `Tablero3D` y `THREE`. Contratos nuevos en `test/frontend.test.js` contra una
  lista fija de ids y clases de JA-VTT (`test/fixtures/ja-vtt/`, commit `d68f41f`): ningún choque.
- **Por qué:** plan `superpowers/plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md` (T2):
  que una página de JA-VTT pueda cargar el tablero 3D sin choques de ids, clases ni globales.
  JA-VTT usa `#rail`, `#stage`, `#stageWrap`, `.hint`, `.wrap`, `.chips`, `data-tool`, y las
  secciones «vista», «mesa» y «atajos»: sin el prefijo habrían chocado.
- **Efecto visible:** ninguno buscado (capturas de `test:ui` iguales antes y después). Se
  olvidan una vez la pestaña y las secciones plegadas recordadas del 3D (sus claves llevan ahora
  `t3d-`). En «Todo el arte», el borde de los sprites modificados usa `--amber` del anfitrión en
  vez de un dorado fijo.
- **Verificado:** `npm run check` → 65/65 (4 contratos nuevos del cliente y estáticos de `/t3d/`),
  cobertura 95,8/88,7/93,7 · `test:ui` 38/38 sin errores de consola (antes 36: se añaden
  «montar sólo añade THREE» y «unmount y volver a montar»).
- **Revertir:** `git revert` del commit (sólo cliente, tests y docs; sin migraciones).

## 2026-09-26 — Núcleo con la forma de JA-VTT y módulo `modules/tablero3d` con esquema `t3d` (T1)

- **Qué:** el servidor se parte en un núcleo idéntico en forma al de JA-VTT (`users`, `sessions`,
  `boards` + `active_scene`, `board_members` + `scene_id`, `chat_messages`; cookie `jav_session`)
  y un módulo `modules/tablero3d` (`index.js` con `createTablero3D(host)`, `db.js`, `rules.js`,
  `migrations/`) con todo lo del 3D: API en `/api/t3d/boards/:id/{scenes,campaigns,drawings,usage}`,
  mesa en vivo (`live`, `emit`, `presence`) y tablas en el esquema `t3d`. La migración del núcleo
  `003-nucleo-ja-vtt-y-esquema-t3d.sql` muda las tablas del 3D de `public` a `t3d` con sus datos.
  Las tiradas siguen en `chat_messages` (kind `roll`). `net.js` llama a las rutas nuevas.
- **Por qué:** plan `superpowers/plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md` (T1):
  poder montar el tablero 3D en JA-VTT con pocas líneas y sin choques de esquema (JA-VTT ya tiene
  su propia `public.scenes`).
- **Efecto visible:** la cookie cambia de nombre: cada usuario inicia sesión una vez tras actualizar.
- **Verificado:** `npm run check` → 61/61, cobertura 95,8/88,8/93,7 (núcleo + módulo) ·
  `test:e2e` 13/13 contra un servidor local sin reinicio (`E2E_RESTART=no`). `test:ui` no se pudo
  ejecutar en esta sesión (sin navegador): pendiente antes de desplegar.
- **Revertir:** `git revert` del commit. La base queda con las tablas en `t3d`: para volver, en
  `psql`, `ALTER TABLE t3d.<tabla> SET SCHEMA public` para `scenes`, `campaigns`, `drawings`,
  `drawing_layers` y `live_docs`, y `DELETE FROM schema_migrations WHERE version = 3`.

## 2026-09-25 — Luces con posición, niebla suave, editor ampliado e interfaz de creador

- **Qué:** luz RGB con sombras y fuentes con posición, altura, radio, color y parpadeo
  (herramienta Luz, tecla 8); objetos dibujados que alumbran desde el píxel y la rebanada que se
  elija; personajes con luz propia y visión en la oscuridad. Niebla con bordes suaves y fundido,
  línea de visión sin rendijas diagonales (`public/js/vision.js`) y camino con coste al mover.
  Editor de dibujo: «Todo el arte» (editar y restaurar cualquier sprite), aerógrafo, degradado
  tramado, varita, lazo, pincel propio, pincel 1–8 redondo, capas con opacidad y bloqueo, código
  hexadecimal, recientes, rampa con cambio de tono, Endesga 32, importar paletas (.gpl, .hex,
  imagen), animación con velocidad, sombra proyectada, invertir, desaturar y borrador automático.
  Interfaz de creador: se abre la última escena o una vacía; plantillas en el menú de escenas;
  herramienta Nivelar, pincel 5×5, Ctrl+S y filtros de objetos. Migración `002-luz-y-capas.sql`.
- **Por qué:** petición del usuario: comodidad y expansión del editor, editar los sprites
  existentes, objetos de luz con posición, mejor movimiento y niebla, y una interfaz de director
  «más de creador». Diseño en `superpowers/specs/2026-09-25-editor-luz-niebla-design.md`.
- **Verificado:** `npm test` 53/53 · `npm run lint` limpio · `test:ui` 36/36.
- **Revertir:** `git revert` del commit. La migración 002 sólo añade columnas: puede quedarse.

## 2026-09-25 — Arquitectura, esquema de datos e interfaz de Just Another VTT

- **Qué:** el servidor de archivo JSON + SSE se sustituye por el de JA-VTT (rama `release`):
  Node 22, PostgreSQL con migraciones, `db.js`/`rules.js`/`auth.js`/`ws.js`, cuentas con
  contraseña y código de recuperación, tableros con miembros e invitación. El cliente adopta su
  interfaz (entrada, panel de tableros, perfil, cabecera, raíl, panel con cinco pestañas,
  Alegreya, Lucide) y el motor 3D pasa a `public/js/tablero3d.js`, que habla con el servidor por
  `public/js/net.js`. Docker Compose con `db` + `app` como JA-VTT; se retiran `render.yaml`,
  `fly.toml` y los scripts de Windows/Mac del modo local.
- **Por qué:** petición del usuario: máxima fidelidad con JA-VTT (interfaz, lenguaje y forma de
  guardar los datos) para integrarlo allí más adelante, sin fusionar los proyectos.
- **Verificado:** `npm test` 46/46 · `npm run lint` limpio · `test:e2e` 14/14 con reinicio ·
  `test:ui` 28/28 contra la pila de Docker.
- **Revertir:** `git revert` de los commits del 2026-09-25 vuelve al servidor de archivo JSON
  (commit `029c75b` y siguiente). Los datos de PostgreSQL no se migran de vuelta.

## 2026-09-25 — Desplegable con Docker, Render y Fly.io (sustituido el mismo día)

- **Qué:** `servidor.js` con `DATA_DIR`, `/healthz`, `SITE_PASSWORD` y guardado al recibir
  `SIGTERM`; `Dockerfile`, `docker-compose.yml`, `render.yaml` y `fly.toml`.
- **Por qué:** primera petición del usuario: hacerlo desplegable.
- **Revertir:** ya sustituido por la entrada de arriba.
