# 02 — Funcional

Qué hace el sistema al 2026-09-15. El manual detallado para jugadores está en
[`README.md`](../README.md); aquí, el contrato.

## Cuentas

- **Crear cuenta**: nombre + contraseña. Cualquiera con la URL puede registrarse.
- **Entrar**: nombre + contraseña. Sesión de un año en cookie `HttpOnly`.
- **Salir**: invalida la sesión en el servidor.
- El nombre no distingue mayúsculas (`Ana` = `ana`).
- **Recuperación**: código de 12 caracteres (`XXXX-XXXX-XXXX`) generado al registrarse, visible
  en Perfil y regenerable. `POST /api/recover {name, code, password}` pone contraseña nueva y
  cierra las sesiones anteriores. `POST /api/me/password {current, password}` la cambia.

## Chat, dados e iniciativa

- Chat por tablero (todas las escenas), últimos 200 mensajes; los 100 más recientes llegan en el
  estado. Tiradas `NdM±k` con M ∈ {4,6,8,10,12,20,100}, ≤ 20 dados por término, ≤ 5 términos; el
  servidor tira con `crypto.randomInt` y todos los clientes animan el mismo resultado en 3D.
- El director apaga chat (`chatEnabled`) y/o dados (`diceEnabled`) **para todos**, él incluido.
- Tirada privada (`roll {secret:true}`, sólo director): llega sólo a sus pantallas, no se guarda.
- Iniciativa: entradas (nombre, valor, ficha opcional, oculta opcional), turno y ronda, en los
  ajustes del tablero. Sólo el director la edita (WS `initiative`). Los jugadores la reciben sólo
  con `initiativeShown` y sin las fichas ocultas ni las entradas ocultas.

## Tableros

- Quien crea un tablero es su **director** (`gm`); nace con una escena («Escena 1») y un
  código de invitación de 6 caracteres.
- Un jugador entra con el código o el enlace (`#/tablero/<id>` con `?invitar=`), o el
  director lo añade **por nombre de usuario si ya tiene cuenta**.
- El director puede regenerar el código, renombrar, expulsar miembros y borrar el tablero
  (borra escenas, objetos, imágenes y niebla). Un jugador puede salir.

## Escenas, portales, fichas, imágenes, niebla

**Niebla de un jugador vista por el director** (2026-09-19): en «Vista de jugador», selector «Niebla:
Nueva (se reinicia) / La de <jugador>» y botón «Reiniciar mi vista». Sólo lectura: el director nunca
guarda niebla. «Reiniciar exploración… para todos» sigue borrando la de todos.

Sin cambios respecto a Mini VTT: ver README §«Cómo se usa» y §«Qué puede hacer cada rol».
El servidor valida cada operación y devuelve una corrección (`fix`) cuando un jugador
intenta algo que no puede.

## Modo 2.5D (rama `modo-25d-fase-a`; fases A–D cerradas)

- Al crear un tablero se elige **Tipo de mapa: 2D / 2.5D**; la tarjeta muestra la etiqueta `2.5D`.
  El tipo no se puede cambiar después. `POST /api/boards {name, mode}`; `mode` viaja en la lista y
  en `GET /api/boards/:id`.
- Abrir un tablero 2.5D monta el motor en el escenario: pedestal con el terreno de la escena,
  cámara orbital (arrastrar gira, rueda acerca, Q/E giran, WASD/flechas
  desplazan, F centra), entorno y luz ambiental de la pestaña Escena aplicados al 3D (también los
  cambios remotos del director).
- **El terreno se guarda** (fase B): cada escena 2.5D tiene su relieve, materiales, objetos, piezas de
  pared y fuentes de agua en la base; la primera escena de un tablero 2.5D nace con el «Valle del
  arroyo», las siguientes vacías (22×22 a ras) y las duplicadas copian el terreno.
- **El director edita** con el rail: **Subir (2)**, **Bajar (3)**, **Pintar (4)** con material en la
  subbarra, **Objeto (5)** (poner/quitar en casilla; en la cara de un muro cuelga estandartes, fuentes,
  grietas, limo) y **Agua (6)** (verter y secar son locales; manantial y desagüe se guardan). El
  tablero crece 8 casillas por lado al editar cerca del borde (hasta 118). Todo llega al instante a los
  demás; un jugador no puede editar (recibe corrección). Las **puertas** las abre y cierra cualquiera
  con Seleccionar si el director lo permite (`playersDoors`) y no están cerradas con llave.
- **Fichas y luces** (fase C): las fichas y luces del tablero se ven en el mapa como sprites del
  diorama. El aspecto de una ficha lo decide su campo *Aspecto* (`art`: `guerrera`, `mago`, `arquera`,
  `enana`, `goblin`, `esqueleto`, `demonio`, `nigromante`, `fantasma`, `murcielago`, `arana`, `rata`;
  sin él, guerrera para personajes y goblin para enemigos — el campo en el editor y el arte propio
  llegan en la fase D). Una luz con `mount` cuelga de la cara de un muro. Los radios, color y parpadeo
  son los del tablero; el tipo sólo cambia el sprite. La linterna sorda alumbra en redondo (sin cono)
  y el tamaño de ficha mayor que 1 no se dibuja distinto, por ahora.
- **Mover fichas**: un clic sobre una ficha propia la elige (anillo, y para el director la barra
  Editar/Duplicar/Eliminar de siempre; Supr borra; Escape o tocarla otra vez la suelta); un clic en una casilla la lleva
  andando por el camino más corto (no sube escalones de más de un bloque, no atraviesa objetos ni
  fichas, no cruza puertas cerradas) y al llegar la posición se guarda para todos. Si no hay camino,
  aviso. El director mueve cualquier ficha; el jugador sólo las suyas. El director crea fichas con
  **Ficha (P)** y **Enemigo (E)** tocando una casilla.
- **Quién ve qué**: el director en vista Director lo ve todo. En «Vista de jugador» ve lo que ven las
  fichas del grupo o, con el selector «Ver como», una concreta. Un jugador ve lo que ven sus fichas
  (las del grupo si el tablero tiene *Visión compartida*); si no controla ninguna, el mapa queda a
  oscuras con el aviso de siempre. Los personajes se ven siempre entre sí; los enemigos sólo cuando
  alguien los ve; las fichas ocultas del director, nunca.
- **Niebla de guerra por jugador**: lo explorado queda en penumbra y se guarda por casilla en la
  cuenta del jugador, por escena; al volver a entrar sigue ahí. «Reiniciar exploración» la borra para
  todos. Si el tablero creció desde la última visita, se empieza de cero.
- **Panel «Mapa 2.5D»** (pestaña Escena, sólo 2.5D; el jugador lo ve deshabilitado): estilo de arte
  (Packs, Píxel 16, Píxel 32, Dibujado), opacidad de la niebla, niebla ambiental, recortar muros altos
  (con altura), efecto maqueta, tamaño del tablero con «Ampliar 8 casillas» y «crecer solo», evaporación
  y desagüe por el borde. Todo se guarda con la escena y llega a todos. En 2.5D se ocultan «Zonas
  interiores» y «Contenido» (cosas del 2D).
- **Luces**: la herramienta Luz (L) con los presets de siempre en la subbarra coloca una luz en la
  casilla tocada, o la **cuelga** de la pared si tocas la cara de un muro más alto. Las piezas de pared
  (estandartes, fuente, grieta, limo) sólo cuelgan donde la casilla de al lado es más baja.
- **Clic derecho** en el mapa: sobre una ficha o una luz abre su menú de siempre (ver como, ocultar,
  encender, duplicar, eliminar…); sobre un objeto de terreno, el director tiene abrir/cerrar, cerrar con
  llave, girar (los que no giran con la cámara) y quitar; sobre una pieza colgada, quitarla. Arrastrar
  con el botón derecho sigue desplazando la vista.
- **Arte propio** (Biblioteca → «Arte 2.5D»): sube un PNG con piezas, elige la imagen, recorta
  (ancho/alto/separación/margen/zoom, piezas por clic y en orden para animar) y di dónde usarlo: una
  cara de un material del terreno, un personaje del catálogo (reposo/movimiento), un objeto, un
  **objeto nuevo** (nombre, bloquea el paso, tapa la vista, no gira, se cuelga) o una **criatura nueva**
  (nombre; aparece como enemigo cerca del centro). «Píxeles por casilla» fija su tamaño. Lo aplicado
  sale en «Arte propio en uso» con Quitar y «Quitar todo»; quitar una criatura u objeto nuevo retira sus
  usos del tablero. El arte se guarda con la escena y lo ven todos; nada queda en el navegador.
- **Aspecto de la ficha**: en el editor de la ficha (director, y el jugador en la suya) el retrato se
  sustituye por una rejilla de criaturas (las 12 del catálogo más las propias) que cambia el sprite.
- Fases siguientes y estado: [08](08-traspaso-opencode.md).

## Arte del modo 2.5D

Los packs de arte del modo 2.5D (atlas y mapa de piezas) son CC0: Kenney Tiny Dungeon y 0x72 DungeonTileset II. Ver README §«Créditos del arte 2.5D» para detalles.

## API (resumen)

| Método y ruta | Quién | Qué |
|---|---|---|
| `GET /api/health` | nadie | `{ok:true}`; lo usa el healthcheck de Docker |
| `POST /api/register` · `POST /api/login` · `POST /api/logout` · `POST /api/recover` | — | cuentas |
| `GET/PATCH /api/me` · `GET/POST /api/me/recovery` · `POST /api/me/password` | sesión | perfil, color, código de recuperación, contraseña |
| `GET/POST /api/boards` · `GET/PATCH/DELETE /api/boards/:id` | sesión / gm | tableros |
| `POST /api/join` | sesión | unirse por código |
| `GET/POST /api/boards/:id/members` · `DELETE …/members/:uid` | gm | miembros |
| `POST /api/boards/:id/invite` | gm | nuevo código |
| `GET /api/boards/:id/scenes/:sid/portals` | miembro | portales de una escena |
| `GET/POST /api/boards/:id/images` · `GET/PATCH/DELETE /api/images/:id[/thumb]` | miembro / gm | imágenes |
| `GET /ws?board=<id>` | miembro | tiempo real: `ops`, `scene`, `travel`, `fog`, `cursor`, `rename`, `chat`, `roll`, `initiative`, `terrain` (2.5D) |

Errores siempre como `{ "error": "texto en castellano" }` con el código HTTP que toca.
