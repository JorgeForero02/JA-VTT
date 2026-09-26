# Tablero pixel

Tablero de rol en pixel art 3D: editor de escenas (terreno, alturas, agua, objetos, techos y
personajes), editor de dibujo para crear tus propias casillas, personajes y objetos, modo partida
(5.ª edición: iniciativa, fichas, dados, medidas y niebla de guerra), campañas con escenas unidas
por portales y mesa en vivo para jugar en grupo. Todo se guarda en PostgreSQL. Pensado para un
grupo pequeño en un servidor propio.

La interfaz, las cuentas y la forma de guardar los datos siguen a
[Just Another VTT](https://github.com/JorgeForero02/JA-VTT) (rama `release`), para poder
integrarlo allí más adelante: el tablero 3D es un módulo (`modules/tablero3d/`) que se monta en Just
Another VTT con los pasos de `docs/08-integracion-ja-vtt.md`.

## Arrancar con Docker (recomendado)

Necesitas Docker con Compose.

```bash
cp .env.example .env        # pon una contraseña en POSTGRES_PASSWORD
docker compose up -d --build
```

Abre http://localhost:3000. Otro puerto: `APP_PORT=4000` en `.env`. Para parar:
`docker compose down` (los datos quedan en el volumen `pgdata`; `down -v` los borra).

Para desplegarlo en un servidor con Coolify u otro proxy, ver `docs/03-despliegue.md`.

## Arrancar sin Docker

Node.js 22.8 o superior y un PostgreSQL accesible:

```bash
npm ci
DATABASE_URL=postgres://usuario:clave@host:5432/base PORT=3000 node server.js
```

Las tablas se crean solas al arrancar (migraciones en `server/migrations/` y, las del tablero 3D, en
`modules/tablero3d/migrations/`, esquema `t3d`).

## Cómo se usa

1. **Entrar:** crea una cuenta con nombre y contraseña (pestaña «Crear cuenta»); después entra
   con ellas. Cualquiera con la dirección puede registrarse. Al crear la cuenta recibes un
   **código de recuperación**: guárdalo. Lo tienes siempre en **Perfil** y con él puedes poner
   una contraseña nueva desde «¿Olvidaste la contraseña?». No hay correo.
2. **Panel:** crea un tablero o únete a uno con un código de invitación. Quien crea el tablero es
   su **director**.
3. **Invitar:** dentro del tablero, pestaña **Mesa**. Comparte el código o el enlace, o añade a
   alguien que ya tenga cuenta por su nombre de usuario. Desde ahí también puedes quitar miembros.
4. **Escenas:** al entrar se abre la última escena guardada del tablero (o una vacía). El botón
   con el nombre de la escena (arriba) abre el menú de escenas: abrir una guardada, borrarla,
   crear una nueva (nombre, 8×8 a 128×128, terreno base y momento de luz) o **empezar desde una
   plantilla** (claro, mazmorras, pueblo, taller de luces). **Ctrl+S** o la pestaña **Escena** la guardan.
   El **Pueblo de Brezo** (48×40) trae una muralla al norte con su puerta de rastrillo y dos torres
   almenadas, una atalaya con techo cónico de pizarra, la plaza del mercado con el pozo y tres puestos,
   una capilla con techo de cobre, bancos y campanario, un molino en una loma, un arroyo con su puente y
   casas de paja, pizarra, tablillas y teja con ventanas; de noche, antorchas, braseros, faroles y velas. Cada vecino
   tiene su personaje (vigía, tabernera, herrero, clériga, molinero, anciana y pregonero).
   **Iluminación** (pestaña Escena, director): los cuatro momentos de Just Another VTT —**Interior** (oscuro: sólo ven
   las luces y la visión en la oscuridad), **Exterior de día**, **Atardecer** y **Noche** (luna tenue)—, con el
   deslizador de luz ambiental y el color de la oscuridad; al cambiar, la escena se funde en un segundo y en la mesa en
   vivo lo ven todos. Dentro de las **zonas interiores** no llega la luz de fuera: cada techo crea la suya y el director
   pinta más (o deja al aire libre una casilla con techo) con la herramienta **Zona interior** (Z). De día, dentro de
   una casa hay penumbra y las ventanas y las puertas abiertas dejan entrar un rayo de luz.
5. **Editar:** las herramientas del raíl izquierdo (teclas 1 a 9 y 0): pintar terreno, subir y
   bajar, agua, objetos (con **Estructuras**: puestos de mercado, puentes, puerta de muralla, molino,
   campanario, postes, carretas, cajas, bancos, vallas, murete y letreros; los de varias casillas las
   ocupan todas y un puente se pisa sobre el agua), personajes (21 de fábrica: caballero, guerrera, pícaro,
   clérigo, arquera, maga, goblin, esqueleto, lobo, bandido, seis vecinos, rata, niño, ogro, trol y gólem,
   pintados con el mismo píxel, contorno y paleta que el terreno y los techos), **techos** (7: toca dos esquinas; elige
   material —teja roja, pizarra, paja, tablillas de madera o cobre con verdín— y forma —a dos aguas, a
   cuatro aguas, plano con almenas, cónico o a un agua—; **R** gira la cumbrera; tocar un techo lo elige
   para cambiarlo; con esta herramienta los techos se ven, con las demás se ocultan y en juego se abren
   cuando alguien entra), **luz** (8: los 12 tipos de fuente de
   Just Another VTT —vela, antorcha, farol, linterna sorda, hoguera, brasero, luz mágica, cristal
   arcano, rayo de luna, luz diurna, luz de ventana y oscuridad mágica— con tipo, radio, altura,
   intensidad, color, animación, encendido y, en las dirigidas, dirección: **R** la gira), **muros** (M: los siete
   tipos de muro de Just Another VTT, con su icono y su color —muro, puerta, ventana, velo, maleza, barrera y
   portal—; sobre un muro, una puerta o ventana abre el hueco; tocar lo colocado lo elige: la puerta se **cierra con
   llave** y el portal elige aspecto —puerta, escalera, boca de cueva, trampilla o portal mágico con luz—, nombre y a
   qué escena y portal lleva, con «Enlazar también la vuelta»), **zona interior** (Z: rectángulo arrastrando, pincel o
   borrar), **nivelar** (9) y quitar (0). **V** vuelve a explorar.
   La ventana deja ver y pasar la luz pero no se cruza; el velo tapa la vista y se cruza; la maleza deja ver el suelo
   pero oculta a quien está detrás (no a quien está dentro); la barrera sólo frena el paso y los jugadores no la ven.
6. **Dibujar:** el botón **Dibujar** abre el editor de pixel art: casillas, personajes (frente,
   espalda y perfil) y objetos 3D por rebanadas. Un personaje se dibuja **a su tamaño** (de Diminuto a
   Colosal): el lienzo toma las medidas de ese tamaño para que su píxel mida lo mismo que el del suelo,
   con línea de suelo y guías de altura cada 5 pies; el tamaño se puede cambiar sin reescalar el dibujo. **Todo el arte** muestra cada sprite del tablero
   (también cada tejado y cada estructura) para editarlo o restaurar el original. Aerógrafo, degradado, varita, lazo, pincel propio, capas
   con opacidad y bloqueo, rampas de color, paletas importables (.gpl, .hex, imagen) y efectos.
   Un objeto puede **dar luz**: «Colocar la luz» y toca el píxel de la rebanada de donde sale.
   **Guardar** lo deja en el tablero para todos.
7. **Partida:** combate por turnos con iniciativa, niebla de guerra, dados (d4 a d100, ventaja y
   desventaja, o una fórmula como `2d6+3`, la notación de Just Another VTT) y medidas en pies (regla, círculo, cono,
   línea y cubo). **Fijar plantilla** deja la medida en el tablero como un plano: los del director los ven los jugadores
   si pulsa «Planos visibles para los jugadores»; los de un jugador, todos. Con el menú contextual de una casilla el
   director añade **anotaciones** (las «Sólo el director» no las ve nadie más). La ficha del personaje elegido está
   en **Fichas**: sólo lo que usa la mesa, con los mismos campos que las fichas de Just Another VTT.
   Cada ficha tiene un **tamaño**, de Diminuto a Colosal: una Grande ocupa 2×2 casillas (no pasa por
   una puerta de una), una Enorme 3×3 y una Colosal 4×4; el pueblo de ejemplo trae un ogro, un trol,
   una rata y un niño. Sobre el tablero, cada ficha se apoya en su peana con el color de su bando y
   muestra sus **estados** (Derribado, Envenenado…, con las abreviaturas y colores de JA-VTT) y, al
   elegirla, pasar el cursor o si está herida, su **vida**.
   **Portales:** lleva una ficha junto a un portal y cruza (al llegar se ofrece; también tocándolo o desde su menú):
   llega junto al portal de destino. El director puede cruzar con todo el grupo, y **Reunir al grupo** (menú de
   escenas) lleva las fichas del grupo a otra escena. En la mesa en vivo la mesa sigue al director: si cruza un
   jugador, el director decide.
8. **Campaña:** varias escenas unidas por portales (con aspecto de escalera, como los pasos de antes), con notas del
   director en cada una.
9. **Mesa en vivo:** en **Mesa → Mesa en vivo** el director abre la mesa con la escena actual.
   Los jugadores reciben el aviso al momento y se unen desde la misma sección. El director asigna
   cada personaje a un jugador; cada jugador mueve el suyo y ve las tiradas de todos (las tira el servidor y quedan en el
   chat del tablero). En **Mesa → Reglas para jugadores** y **Chat, dados y fichas** el director elige, con los mismos
   ajustes que Just Another VTT, si hay visión compartida, si los jugadores abren puertas, si ven la iniciativa, cuánta
   vida de las fichas ajenas ven (toda, sólo la barra o nada) y si hay dados, vida, estados y CA. Lo que un jugador no
   debe ver (fichas ocultas, la CA y, si se elige, la vida de otros, anotaciones del director) no le llega nunca: lo
   filtra el servidor.

### Panel lateral

| Pestaña | Contenido |
|---|---|
| **Escena** | Herramienta y paleta (al editar), guardar la escena, iluminación (con «Animar llamas y pulsos»), cuadrícula, vista y efectos |
| **Fichas** | Ficha del personaje elegido: nombre, bando, tamaño, vida (actual, máxima y temporal), CA, iniciativa, velocidad, altura, visión y visión en la oscuridad (en pies), luz que lleva, estados, visión propia y oculta para los jugadores |
| **Partida** | Combate y niebla, dados con registro y fórmula, medidas y planos fijados |
| **Campaña** | Escenas de la campaña, portales entre ellas y notas del director |
| **Mesa** | Participantes, invitación, mesa en vivo, reglas para jugadores y «Chat, dados y fichas» (los ajustes de Just Another VTT), conexión y atajos de teclado |

### Qué puede hacer cada rol

| | Director | Jugador |
|---|---|---|
| Editar escenas, dibujar, guardar y borrar | Sí | No (el servidor lo rechaza) |
| Abrir y cerrar la mesa en vivo, combate y niebla | Sí | No |
| Mover personajes en la mesa en vivo | Todos | Sólo los que el director le asigna |
| Abrir puertas en la mesa | Sí, también las de llave | Las que no tienen llave, si el director lo deja |
| Cruzar portales | Sí, con quien quiera; reunir al grupo | Con su ficha, junto al portal; en la mesa en vivo lo pide al director |
| Tirar dados y señalar casillas | Sí (si el tablero tiene dados) | Sí (si el tablero tiene dados) |
| Fijar planos | Sí; decide si los ven los jugadores | Sí, los ven todos; quita sólo los suyos |
| Ver la iniciativa, la vida y la CA de las fichas ajenas | Sí | La iniciativa si el director la muestra; la vida según el ajuste; la CA, nunca |
| Ver escenas guardadas, campañas y dibujos | Sí | Sí, sin lo que es sólo del director |

## Datos

Todo vive en PostgreSQL: usuarios, tableros, miembros, escenas, campañas, dibujos (cada capa como
PNG en `bytea`), la mesa en vivo y el registro de tiradas.

- **Copia de seguridad:** `docker compose exec -T db pg_dump -U tp -d tp --format=custom > copia.dump`.
- **Empezar de cero:** `docker compose down -v`.

## Estructura

```
server.js              Punto de entrada (DATABASE_URL, PORT)
server/app.js          Núcleo (forma de JA-VTT): HTTP, cuentas, tableros, tiempo real; monta el módulo 3D
server/db.js           Pool de PostgreSQL, migraciones y consultas del núcleo
server/migrations/     Esquema del núcleo, un fichero SQL por versión
server/auth.js         Contraseñas (scrypt)
server/rules.js        Reglas del núcleo
server/ws.js           WebSocket mínimo sin dependencias
modules/tablero3d/     Módulo del tablero 3D: API /api/t3d/, mesa en vivo, reglas y SQL (esquema t3d)
modules/tablero3d/public/  Su cliente, servido en /t3d/: Tablero3D.mount, motor 3D, estilos y marcado
modules/tablero3d/README.md  Referencia técnica del módulo (viaja con él al copiarlo en JA-VTT)
test/                  Tests (node:test), prueba e2e contra docker compose y prueba visual
docs/                  Documentación técnica y operativa (empieza por docs/00-INDEX.md)
public/index.html      Interfaz
public/css/app.css     Estilos (sistema visual de Just Another VTT)
public/js/             Cliente anfitrión: arranque y cuentas, red, iconos
public/fonts/          Tipografías Alegreya (licencia SIL OFL)
```

## Créditos

- Motor 3D: three.js r128 (MIT), incluido en `modules/tablero3d/public/vendor/`.
- Iconos: Lucide (licencia ISC).
- Tipografías: Alegreya y Alegreya Sans de Huerta Tipográfica (SIL Open Font License).
- Interfaz y arquitectura: las de Just Another VTT. Ver `THIRD-PARTY-LICENSES.md`.
- Licencia del proyecto: todavía sin elegir (pendiente P-08 en `docs/06-pendientes.md`).
- Nació como página única que guardaba en un archivo JSON; el historial está en `docs/07-historial.md`.
