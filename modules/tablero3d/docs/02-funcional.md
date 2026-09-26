# 02 — Funcional

Qué hace el sistema al 2026-09-26. El manual para quien juega está en [`README.md`](../README.md);
aquí, el contrato. El formato de cada documento del 3D (escena, ficha, mesa en vivo, dibujo) está en
el [README del módulo](../modules/tablero3d/README.md#formato-de-los-documentos).

## Cuentas

Idénticas a Just Another VTT:
- **Crear cuenta**: nombre (2–24 caracteres) + contraseña (≥ 6). Registro abierto.
- **Entrar**: sesión de un año en cookie `HttpOnly` (`jav_session`, la misma que JA-VTT). Mismo 401 para usuario
  inexistente y contraseña mala.
- **Recuperación**: código `XXXX-XXXX-XXXX` al registrarse, visible y regenerable en Perfil.
  `POST /api/recover` pone contraseña nueva y cierra las otras sesiones.

## Tableros

- Quien crea un tablero es su **director** (`gm`); nace con un código de invitación de 6 caracteres.
- Un jugador entra con el código o el enlace (`/?invitar=CÓDIGO`), o el director lo añade por su
  nombre de usuario. El director puede regenerar el código, renombrar, expulsar y borrar el tablero
  (borra escenas, campañas, dibujos, mesa y registro). Un jugador puede salir.
- **Tipo de mesa** (2D o 3D, del módulo, fijo desde que se crea el tablero): en este repo **todo
  tablero es una mesa 3D** (se marca al crearlo; los de antes, al arrancar) y no hay selector. En Just
  Another VTT se elige «Mesa 2D» o «Mesa 3D» en «Nuevo tablero» y el panel lo etiqueta (ver
  [08](08-integracion-ja-vtt.md)). Una mesa 3D no vuelve a 2D; en una 2D todo lo del 3D responde 404.

## Escenas, campañas y dibujos

- Los leen todos los miembros; sólo el director los guarda o los borra (403 para el jugador).
- Límites: escena ≤ 2 MB y 4–160 casillas por lado; campaña ≤ 8 MB y 64 escenas; dibujo ≤ 8 capas
  de ≤ 4 MB, 1–256 px de ancho, 1–384 de alto y 1–512 cuadros.
- Al abrir un tablero se abre **su última escena guardada**; si no tiene ninguna, una escena vacía.
  Las plantillas (claro, mazmorras, **Pueblo de Brezo 48×40** —muralla con puerta y torres, atalaya,
  mercado, capilla con campanario, molino, arroyo con puente, techos de cada material y forma y
  ventanas en las casas—, **Taller de luces**: una sala de noche con una alcoba por tipo de luz y una
  galería con pilares para la linterna sorda) están en el menú de escenas, bajo «Empezar desde una
  plantilla». «Nueva escena» pide nombre, tamaño, terreno base y el momento de luz (de día por
  defecto), sin personajes. El pueblo y el claro abren de día, el Taller de luces de noche y las
  mazmorras en interior.
- **Ambiente** (los momentos de JA-VTT): `interior` Interior —oscuro: sólo ven las luces y la visión en
  la oscuridad—, `day` Exterior de día, `dusk` Atardecer, `night` Noche, con luz ambiental 0, 1, 0,55 y
  0,18 y color de la oscuridad #0B0E11, #0E1316, #1A1220 y #081026 al elegir cada uno. El director los
  elige en la pestaña Escena, sección **Iluminación** (los cuatro momentos, el deslizador «Luz
  ambiental» y «Color de la oscuridad»), con deshacer; al cambiar, la escena se funde en un segundo y
  en la mesa en vivo lo ven todos. Sin fuentes de luz ni visión en la oscuridad se ve lo que tiene más
  de 0,25 de ambiente (como JA-VTT): de día y al atardecer, todo a la vista; de noche o en interior,
  sólo lo iluminado. Una escena de antes con `night: true` abre de noche; sin él, de día.
- **Zonas interiores** (`zone` de JA-VTT): dentro no llega la luz ambiental, así que aunque fuera sea
  de día hay penumbra y la niebla oculta a quien esté dentro sin luz. **Cada techo crea la suya**;
  además el director pinta o borra casillas con la herramienta **Zona interior** (tecla Z: rectángulo
  arrastrando, pincel o borrar; en edición ve el contorno a trazos lila) y puede dejar al aire libre
  una casilla con techo. Las **ventanas** y las **puertas abiertas** que dan fuera dejan entrar el
  ambiente de fuera en un abanico hacia dentro (de día, un rayo de luz; de noche, un poco de luna). Los
  techos se siguen abriendo al entrar.
- **Luces**: los 12 tipos de fuente de JA-VTT (vela, antorcha, farol, linterna sorda, hoguera,
  brasero, luz mágica, cristal arcano, rayo de luna, luz diurna, luz de ventana y oscuridad mágica) o
  a medida, con color, intensidad, animación, cono dirigido (R lo gira), encendido y nombre, más radio
  y altura del 3D. Las escenas de antes se leen igual.
- **Techos** (hasta 300 por escena, de al menos 2×2): material teja roja, pizarra, paja, tablillas de
  madera o cobre con verdín, y forma a dos aguas, a cuatro aguas, plano con almenas (sin material),
  cónico o a un agua; R gira la cumbrera. Un techo de antes es de teja a dos aguas.
- **Objetos**: giro de 90° en 90°; las puertas se abren, se cierran y pueden tener llave. Los de
  varias casillas (puestos, carreta, molino, puente ancho) ocupan un rectángulo desde su esquina. La
  puerta de la muralla (`gate`) es una puerta (y en la mesa en vivo, en `live/doors`); su rastrillo
  sube dentro del arco. Un puente (`bridge`, `bridge2`) se pisa a la altura de la orilla más alta a lo
  largo del paso.
- **Muros** con los tipos de Just Another VTT (`WALL_TYPES`, mismos ids, nombres, iconos, colores y
  banderas), por casilla:

  | Tipo | En 3D | Vista | Luz | Paso | Oculta |
  |---|---|---|---|---|---|
  | `wall` Muro | casilla de terreno Muro | tapa | tapa | no | sí |
  | `door` Puerta | objeto puerta o puerta de la muralla; `open`, `locked` | cerrada tapa | cerrada tapa | cerrada no (se abre al pasar si se puede) | cerrada sí |
  | `window` Ventana | tramo de muro con cristal | deja | deja | no | no |
  | `veil` Velo | cortina (follaje, humo) | tapa | tapa | sí | sí |
  | `cover` Maleza | hierba alta | deja (el suelo se ve) | deja | sí | **sí**: oculta fichas y objetos pequeños que sólo se ven a través de ella |
  | `barrier` Barrera | invisible para el jugador; el director ve su contorno a trazos | deja | deja | no | no |
  | `portal` Portal | puerta en arco, escalera, boca de cueva, trampilla o portal mágico (con luz) | de pie tapa; de suelo deja | igual | no: se cruza a otra escena | de pie sí |

  «Tapa» es hasta la altura de una persona (1 sobre su suelo): desde lo alto se ve por encima. Se ve a
  quien está dentro de la maleza, no a quien está detrás. Lo que no es válido se descarta.
- **Portales**: con aspecto (puerta, escalera, cueva, trampilla, mágico), nombre y destino (una escena
  guardada del tablero —en una campaña, de la campaña— y su portal de llegada). Las escaleras de
  campaña de antes se leen como portales de aspecto escalera. Al borrar una escena, los portales que
  llevaban allí se quedan sin destino.
- **Dibujos**: un objeto puede dar luz (desde un píxel de una rebanada, con un tipo de luz); cada
  capa tiene opacidad y bloqueo. Cualquier sprite de fábrica (24 casillas —con los cinco tejados—, 21
  personajes, 39 objetos —con los muros de JA-VTT, los cinco aspectos de portal, las estructuras del
  pueblo y el arco de la puerta de la muralla—) se puede abrir desde «Todo el arte» y restaurar. Un
  dibujo de personaje tiene el **tamaño de su arte** (de Diminuto a Colosal; uno de antes es Mediano)
  y la ficha de un personaje dibujado nace de ese tamaño.

## Personajes de fábrica

21, en la paleta de Personajes y en «Todo el arte» (editables y restaurables; un dibujo guardado con la misma
clave, p. ej. `knight`, sustituye al de fábrica). Cada uno nace con su tamaño y su ficha:

| Tamaño | Personajes (sprite) |
|---|---|
| Mediano (16×24, pintados a mano) | Jugadores: Caballero (`knight`), Guerrera (`warrior`), Pícaro (`rogue`), Clérigo (`cleric`), Arquera (`archer`), Maga (`mage`). Enemigos: Goblin (`goblin`), Esqueleto (`skeleton`), Lobo (`wolf`), Bandido (`bandit`). Neutrales: Aldeano (`villager`), Molinero (`miller`), Tabernera (`barmaid`), Herrero (`smith`), Anciana (`crone`), Guardia (`guard`) |
| Diminuto · Pequeño | Rata (`rat`) · Niño (`boy`) |
| Grande · Enorme · Colosal | Ogro (`ogre`) · Trol (`troll`) · Gólem de piedra (`golem`) |

Las plantillas los usan: en el Pueblo de Brezo cada vecino tiene el suyo (Vigía Bruno, guardia; Tabernera
Olga; Herrero Iván; Abuela Lía, anciana; Hermana Clara, clériga; Molinero Tobías; el pregonero, aldeano) y
Aria llega con Brenna (guerrera), la maga Selene e Ilse (arquera); el claro trae un lobo junto al goblin y
las mazmorras mezclan esqueletos, goblins y bandidos.

## Fichas

Principio de producto: es una mesa para mover fichas, no un gestor de personajes. La ficha sólo lleva
lo que usa la mesa, con los campos de la ficha de Just Another VTT (tabla de campos y rangos en el
[README del módulo](../modules/tablero3d/README.md#ficha-sheet)); cliente y servidor la sanean igual.

- **Tamaños**: Diminuto, Pequeño y Mediano ocupan 1 casilla; Grande 2×2, Enorme 3×3 y Colosal 4×4. Una
  ficha de n casillas ocupa las que van de su esquina `(x, z)` a `(x+n−1, z+n−1)`; al tocar una casilla
  para moverla queda encima de ella. Caminos, alcance, arrastre, huellas del camino, destino, puertas,
  techos, pasos de campaña, plantillas de área, colocación en el editor y minimapa usan todas sus
  casillas; la regla mide de borde a borde (5.ª edición) si un extremo cae en una ficha. Cambiar el
  tamaño en la ficha la hace crecer hacia donde quepa o no cambia («No cabe…»). El **sprite no crece** con
  el tamaño: cada tamaño tiene su arte con el píxel del terreno; si el arte es de otro tamaño, la ficha
  lo avisa («El arte es de tamaño Mediano…»). Al colocarlas, el ogro nace Grande, el trol Enorme, el
  gólem Colosal, la rata Diminuta y el niño Pequeño.
- **Compatibilidad**: las fichas de antes (bando `team`, vida `hp`/`hpMax`, visión en casillas, `luz`)
  se leen igual.
- **Permisos**: el jugador cambia vida, CA, estados, luz, altura, velocidad, iniciativa y nombre de sus
  fichas; bando, tamaño, visión y visibilidad sólo el director (el servidor lo rechaza).
- **Pestaña Fichas**: nombre, bando (Jugador, Enemigo, Neutral), tamaño, vida (− y + gastan antes la
  temporal), vida máxima, temporal, CA, iniciativa, velocidad, altura, visión y visión en la oscuridad,
  luz que lleva, estados como chapas con la abreviatura y el color de JA-VTT, visión propia y oculta.
- **En el tablero**: cada ficha se apoya en una peana de piedra con el filo del color de su bando,
  alumbrada por la luz de su casilla, con sombra de contacto tramada; la elegida lleva un anillo de
  trazos que avanza a saltos. Encima, en píxeles: los estados (chapas de 3×5 con la abreviatura) y la
  altura siempre; la vida (con la temporal en cian), si está elegida, bajo el cursor o herida. Una
  ficha que vuela (`elevation`) se alza y ve más lejos.

## Muros, puertas y portales

- **Herramienta Muros** (director, tecla M): los siete tipos con su icono y color de JA-VTT. Muro pinta casillas; los
  demás se ponen de uno en uno (sobre un muro abren el hueco) y se orientan solos; tocados otra vez se eligen: la
  puerta se cierra con llave, el portal cambia de aspecto, nombre, destino y portal de llegada («Enlazar también la
  vuelta»); R gira y «Quitar» lo borra. El menú contextual de una puerta la abre o cierra y, al director, le deja
  cerrarla con llave («Cerrar con llave»/«Quitar la llave»).
- **Puertas**: el director abre cualquiera. El jugador abre y cierra las que no tienen llave si el ajuste del tablero
  **«Los jugadores abren y cierran las puertas sin llave»** (`playersDoors`, pestaña Mesa → Mesa en vivo; por
  defecto sí, como JA-VTT) está encendido; si no, el menú lo dice y el servidor lo rechaza. Nadie cruza andando una
  puerta con llave.
- **Portales**: una ficha junto a un portal (a una casilla o menos) puede cruzar: al llegar, al tocarlo o desde su
  menú. El director cruza con la ficha elegida, con todo el grupo (fichas del bando Jugador) o sin fichas. Las fichas
  llegan junto al portal de destino, del lado por el que se anda, cada una en una casilla libre donde quepa; la que no
  cabe se queda. Fuera de la mesa en vivo el servidor guarda las dos escenas (la de origen con quien se queda). En la
  **mesa en vivo** la mesa sigue la escena del director: cuando él cruza o reúne al grupo, la mesa pasa a la otra
  escena para todos; un jugador que cruza con su ficha **pide** cruzar y el director decide («Cruzar con …», «Con todo
  el grupo» o «Quedarse»). En una campaña, los portales unen sus escenas y cruzar es como los pasos de antes;
  «Crear portal a…» (menú contextual de la campaña) crea el par.
- **Reunir al grupo** (director, menú de escenas): las fichas del bando Jugador de la escena abierta van a esa escena,
  junto a su punto de entrada.

## Ajustes del tablero (T6d)

Las claves, los valores por defecto y los textos de los ajustes de tablero de Just Another VTT (su `BOARD_KEYS` y
`DEFAULT_BOARD`; fijo `test/fixtures/ja-vtt/board-settings.json`). **Dónde se guardan** (T8): en este repo (suelto),
en `t3d.boards.settings`; integrado en JA-VTT (el anfitrión da `boardSettings`/`setBoardSettings`), son **los del
tablero de JA-VTT** (`b.settings` / `boards.settings`), la única fuente: el 3D los lee y cambia allí (saneados con las
mismas reglas), el chat y los dados de JA-VTT los siguen, y los cambios hechos en JA-VTT llegan a la mesa 3D al momento
(`t3d.settingsChanged`) y, en cualquier caso, antes de cada tirada, cambio de la mesa o cruce. `initiative` no se
comparte (la iniciativa del 3D es el documento `combat`). El director los
cambia en la pestaña **Mesa**, en dos secciones con los títulos de JA-VTT («Reglas para jugadores» y «Chat, dados y
fichas»); cada cambio llega al momento a la mesa (mensaje `settings`) y el servidor reenvía a cada jugador lo que ahora
le toca ver.

| Clave | Por defecto | Texto | Efecto en 3D |
|---|---|---|---|
| `sharedVision` | sí | Visión compartida: cada jugador ve lo que ve el grupo | apagado: en la mesa en vivo cada jugador ve (niebla) sólo desde sus fichas; si no tiene ninguna, desde el grupo (como JA-VTT) |
| `playersDoors` | sí | Pueden abrir y cerrar puertas | los jugadores abren las puertas sin llave (T6b) |
| `initiativeShown` | **no** | Mostrar la iniciativa a los jugadores | apagado: el jugador no recibe el orden de iniciativa; sí sabe cuándo es el turno de una ficha suya |
| `hpVisibility` | `all` | Vida de las fichas: La ven todos (barra y números) · Sólo el director (cada jugador ve la suya) · Los jugadores ven sólo la barra | ver «Privacidad» |
| `chatEnabled` | sí | Chat de texto | el chat es el del anfitrión; el 3D no tiene chat propio, sólo manda las tiradas. Integrado en JA-VTT, apaga su chat (el mismo ajuste) |
| `diceEnabled` | sí | Dados | apagado: nadie tira (el servidor lo rechaza) y Partida → Dados lo dice |
| `hpEnabled` | sí | Vida de las fichas | apagado: sin vida en la ficha, la barra ni el orden de combate, para todos (no se borra) |
| `conditionsEnabled` | sí | Condiciones y altura | apagado: sin estados ni altura en la ficha ni sobre el tablero |
| `acEnabled` | sí | Clase de armadura (CA) | apagado: sin CA en la ficha |

Los de antes (sólo `playersDoors`) se leen con el resto por defecto. Por la API: `GET/PATCH /api/t3d/boards/:id/settings`
(el `PATCH` acepta cualquier subconjunto de hasta 64 KB; lo que no es válido no cambia nada).

## Privacidad (en el servidor)

Como `visibleTo`/`objectFor` de JA-VTT, pero **en el servidor y por conexión**: el módulo reparte la mesa en vivo a cada
conexión filtrada para su rol, y también las escenas y campañas que un jugador lee por la API.
- **Fichas ocultas** (`hidden`): no le llegan a un jugador (salvo las suyas). Como no las conoce, tampoco le cortan el paso.
- **CA** de las fichas que no son suyas: nunca le llega.
- **Vida** de las fichas que no son suyas, según `hpVisibility`: `all`, entera; `gm`, no le llega; `bar_only`, sólo la
  barra (fracciones en pasos de 0,05, sin números). El cliente no pinta el valor por defecto de lo que no recibe.
- **Anotaciones** `gmOnly` y **planos** del director sin publicar: no le llegan.
- **Iniciativa**: sin `initiativeShown`, no le llega el orden; con él, sin las entradas de fichas ocultas ajenas. En
  los dos casos sabe la ficha del turno si es una suya o la puede ver en el orden.
- Las campañas que lee un jugador llegan sin las notas del director.

## Iniciativa

Con la forma de JA-VTT (`initiative: { entries, turn, round }`), en el documento `combat` de la mesa en vivo, más el
movimiento que le queda al turno y la carrera. «Tirar iniciativa y empezar combate», «Siguiente turno», «Carrera» y el
movimiento por turno funcionan como antes; el jugador, en el turno de una ficha suya, pasa el turno (el servidor busca
la siguiente ficha viva) y gasta su movimiento, y nada más. Un combate guardado con el formato de antes se lee igual:
cada ficha es una entrada con su nombre.

## Planos y anotaciones

- **Planos** (`type: 'plan'` de JA-VTT): Partida → Medir → **Fijar plantilla** deja la plantilla en el tablero. Regla →
  `line`, Línea (5 pies de ancho) → `line` con `area`, Círculo → `circle`, Cono → `cone`, Cubo → `rect`. Los del
  director van en la escena (hasta 100) y los jugadores los ven si pulsa **«Planos visibles para los jugadores»**
  (`plansReleased`); los de un jugador en la mesa en vivo (con su dueño y su color, hasta 40 por jugador) los ven
  todos. Cada cual quita los suyos; el director, todos.
- **Anotaciones** (`type: 'note'` de JA-VTT): menú contextual de una casilla → «Añadir una anotación aquí» (director):
  texto de hasta 200 y «Sólo el director» (`gmOnly`). Se ven como etiquetas sobre el tablero (las `gmOnly`, en lila y a
  trazos) y viajan con la escena. Las **notas de campaña** (hasta 500, siempre del director) siguen aparte: son las de una
  campaña, no las de una escena, y no se unifican (una nota de campaña equivale a una anotación `gmOnly`).

## Ajustes de escena

`grid` (**Mostrar cuadrícula**, sección Cuadrícula de la pestaña Escena: líneas en el borde de cada casilla, con la niebla),
`snap` (en 3D todo va por casillas: se guarda para JA-VTT, sin control), `animate` (**Animar llamas y pulsos**, sección
Iluminación: llamas, halos, agua, lava y la respiración de las fichas; con movimiento reducido del sistema, nunca) y
`plansReleased`, con los valores por defecto de JA-VTT (sí, sí, sí, no). `fog` es la «Niebla de guerra» de Partida (en
3D, por defecto apagada). Una escena de antes los toma por defecto.

## Dados

La notación y el formato de JA-VTT (su `server/dice.js`): `2d6+3`, `d20`, `4d6 + 2d8` (dados de 4, 6, 8, 10, 12, 20 y
100; hasta 20 por grupo, 5 grupos y ±1000). Partida → Dados: los botones de siempre (cantidad, modificador, ventaja y
desventaja con 1d20) y una **fórmula**. En la mesa en vivo **tira el servidor** (mensaje `roll`): el resultado llega a
todos y queda en el chat del tablero (`chat_messages`, kind `roll`) con el cuerpo de JA-VTT `{ formula, dice: [{ n,
sides, sign, rolls }], mod, total, label? }` (con ventaja: `2d20…`, las dos tiradas y `adv`), así el chat de JA-VTT la
pinta como tirada. Fuera de la mesa tira el cliente con la misma cuenta. «Tirar iniciativa» de la ficha es una tirada
`1d20±iniciativa` con la etiqueta «Iniciativa de …».

## Unidades

Todo lo que ve quien juega va en **pies** (5 por casilla), como JA-VTT: regla y plantillas, camino y alcance, distancias del
menú contextual, velocidad, visión, luces (el radio de una luz se guarda en casillas, `r`, y se muestra en pies) y los
avisos de zonas y techos.

## Mesa en vivo

- El director la abre con la escena actual (`live/board`), sus personajes (`live/tokens`), el
  combate (`live/combat`), las puertas (`live/doors`) y los planos de los jugadores (`live/plans`).
- El ambiente (`env`, `ambient`, `darkColor`) y las zonas interiores viajan con la escena en `live/board`: cuando el
  director cambia el momento o la luz ambiental, los jugadores lo ven fundirse al momento. El jugador no lo cambia.
- Los miembros conectados reciben el aviso al momento y se unen desde Mesa → Mesa en vivo.
- El director asigna cada personaje a un jugador. El jugador mueve y edita la ficha de los suyos
  (salvo bando, tamaño, visión y visibilidad) y abre las puertas sin llave si el tablero lo deja (`playersDoors`). No puede crear, borrar ni quedarse con otros (el
  servidor lo rechaza con un `ack` de error). Las fichas ocultas no le llegan (ver «Privacidad»).
- Tiradas (mensaje `roll`, las hace el servidor) y señales (`emit` `ping`) llegan a todos. Las tiradas quedan en el
  chat del tablero (`chat_messages`, kind `roll`, cuerpo de JA-VTT): `GET /api/boards/:id/rolls`.
- **Escena por jugador** (`board_members.scene_id` de JA-VTT): no. La mesa en vivo 3D es una sola escena, la del director;
  llevar a un jugador a otra escena queda en la hoja de ruta (R15).

## API (resumen)

| Método y ruta | Quién | Qué |
|---|---|---|
| `GET /api/health` | nadie | `{ok:true}`; lo usa el healthcheck de Docker |
| `POST /api/register` · `POST /api/login` · `POST /api/logout` · `POST /api/recover` | — | cuentas |
| `GET/PATCH /api/me` · `GET/POST /api/me/recovery` · `POST /api/me/password` | sesión | perfil, color, código de recuperación, contraseña |
| `GET/POST /api/boards` · `GET/PATCH/DELETE /api/boards/:id` | sesión / gm | tableros (la lista lleva `scenes`, escenas 3D, y `t3d: true`) |
| `POST /api/join` | sesión | unirse por código |
| `GET/POST /api/boards/:id/members` · `DELETE …/members/:uid` | gm | miembros |
| `POST /api/boards/:id/invite` | gm | nuevo código |
| `GET /api/boards/:id/rolls` | miembro | últimas tiradas (chat del núcleo) |
| `GET /api/t3d/boards/:id` | miembro | tipo de mesa: `{ board: { id, t3d, role } }` (módulo) |
| `POST /api/t3d/boards/:id` | gm | marcar mesa 3D al crear el tablero: idempotente; pasados 10 min desde `boards.created_at`, 409 «El tipo de mesa se elige al crear el tablero y ya no se puede cambiar» (módulo) |
| `DELETE /api/t3d/boards/:id` | — | siempre 409 «El tipo de mesa es fijo: un tablero 3D no vuelve a 2D» (módulo) |
| `GET /api/t3d/boards/:id/scenes` · `GET/PUT/DELETE …/scenes/:sid` | miembro / gm | escenas 3D (módulo; esta y las siguientes, 404 «Este tablero no es una mesa 3D» en una mesa 2D); el jugador las lee filtradas (ver «Privacidad») |
| `GET /api/t3d/boards/:id/campaigns` · `PUT/DELETE …/campaigns/:cid` | miembro / gm | campañas (módulo; el jugador, sin las notas del director) |
| `GET /api/t3d/boards/:id/drawings` · `PUT/DELETE …/drawings/:did` | miembro / gm | dibujos con sus capas (módulo) |
| `GET /api/t3d/boards/:id/usage` | miembro | espacio usado por el 3D: `{ usage: { bytes, quota } }` (módulo). `bytes` = bytes UTF-8 del JSON guardado de cada escena y campaña + bytes de las capas PNG de cada dibujo; `quota` 500 MB. Un `PUT` que la pasaría: 413 «El almacén del tablero está lleno» (sustituir un documento cuenta su tamaño nuevo, no los dos) |
| `GET/PATCH /api/t3d/boards/:id/settings` | miembro / gm | ajustes del tablero 3D con las claves de JA-VTT: `{ settings: { sharedVision, playersDoors, chatEnabled, diceEnabled, initiativeShown, hpVisibility, hpEnabled, conditionsEnabled, acEnabled } }` (módulo; el cambio llega a la mesa como `settings`) |
| `GET /api/t3d/boards/:id/scenes/:sid/portals` | miembro | portales de una escena, como la ruta de JA-VTT: `{ scene: { id, name }, portals: [{ id, name, look, target }] }` |
| `POST /api/t3d/boards/:id/travel` | gm | fuera de la mesa en vivo: `{ from, map, portal, tokens, all }` cruza por un portal de `map` (la escena abierta, id `from`) o `{ from, map, to, all: true }` reúne al grupo en `to`; guarda las dos escenas y devuelve `{ scene, moved, left }` |
| `GET /t3d/<archivo>` | nadie | cliente del módulo (`modules/tablero3d/public`) |
| `GET /ws?board=<id>` | miembro | tiempo real: `ping` (núcleo); `live`, `emit`, `presence`, `roll` (`formula`, `label`, `adv`), `travel` (`portal`, `tokens`, `all`), `gather` (`scene`) (módulo) → `state` (con `settings`), `doc` (filtrado para cada conexión), `ack` (el de `roll` trae la tirada), `msg` (`roll` a todos; `travelAsk` al director), `peers`, `members`, `board`, `settings`, `kicked` |
| `GET /t3d/ws?board=<id>` | miembro | conexión propia del módulo (la que usa JA-VTT, ver [08](08-integracion-ja-vtt.md)): los mismos mensajes del 3D y `ping`; `state` con `me`, `role`, `members`, `online`, `peer`, `peers`, `live`; `kicked` al expulsar o borrar; en una mesa 2D, `error` y cierre 4404 |

Errores siempre como `{ "error": "texto en castellano" }` con el código HTTP que toca.

**Límite de cuerpo de la API del módulo** (T8, `BODY_LIMITS` de `modules/tablero3d/rules.js`, sacado del documento más
grande que se acepta): escena (`PUT …/scenes/:sid`) y cruce (`POST …/travel`) 2 MB + 64 KB; campaña 8 MB + 64 KB; dibujo
8 capas × 4 MB en base64 + 64 KB (42,7 MB); ajustes 64 KB. Más grande: 413 «La petición es demasiado grande: aquí se
admiten hasta …» sin leer el resto (ni cortar la conexión). El núcleo sigue con su `MAX_BODY`.
