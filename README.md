# Just Another VTT

Mesa virtual para jugar rol: iluminación dinámica, muros de cualquier forma, niebla de
guerra, varias escenas por tablero unidas por portales, tableros compartidos en tiempo real y
todo guardado en PostgreSQL. Pensada para un grupo pequeño en un servidor propio.

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

Node.js 22.5 o superior y un PostgreSQL accesible:

```bash
npm ci
DATABASE_URL=postgres://usuario:clave@host:5432/base PORT=3000 node server.js
```

Las tablas se crean solas al arrancar (migraciones en `server/migrations/`).

## Cómo se usa

1. **Entrar:** crea una cuenta con nombre y contraseña (pestaña «Crear cuenta»); después
   entra con ellas. Cualquiera con la dirección puede registrarse; no hay recuperación de
   contraseña por correo.
2. **Panel:** crea un tablero vacío o a partir de una plantilla (Granja o Herbolario),
   o únete a uno con un código de invitación.
3. **Invitar:** dentro del tablero, pestaña **Mesa**. Comparte el código o el enlace,
   o añade a alguien que ya tenga cuenta por su nombre de usuario. Desde ahí también puedes
   quitar miembros.
4. **Escenas:** el botón con el nombre de la escena (arriba) abre el menú de escenas.
   Desde ahí el director crea escenas (vacías o con plantilla), las renombra, duplica o
   elimina, y cambia de escena.
   - **Ver una escena** solo cambia la vista del director.
   - **Llevar al grupo** mueve a todos los jugadores y sus personajes a esa escena.
   - En la pestaña **Mesa** puede enviar a un jugador concreto a otra escena.
5. **Portales:** en la herramienta de muros, el tipo **Portal** es una puerta a otra
   escena. En su editor (doble clic) eliges a qué escena lleva y junto a qué portal
   aparece quien lo cruza; la casilla «Enlazar también ese portal hacia aquí» crea el
   camino de vuelta.
   - Un jugador lo cruza con un clic cuando su personaje está a menos de 15 pies:
     solo viaja él, y el resto del grupo sigue donde estaba.
   - El director, con clic en el portal, puede llevar a todo el grupo o ir solo a mirar.
6. **Personajes:** en el editor de una ficha (doble clic), el director elige qué jugador
   la **controla**. Un jugador sin ficha puede crear la suya en la pestaña **Fichas**.

### Panel lateral

Cada pestaña agrupa una sola cosa, en secciones que puedes plegar (el panel
recuerda cuáles dejaste abiertas):

| Pestaña | Contenido |
|---|---|
| **Escena** | Iluminación, zonas interiores, niebla de guerra y contenido (tablero de fondo y plantillas) |
| **Luces** | Biblioteca de fuentes de luz y luces de la escena |
| **Imágenes** | Subida y biblioteca de tableros, objetos y retratos |
| **Fichas** | Crear fichas, personajes y enemigos (el jugador ve «Mi personaje») |
| **Mesa** | Participantes, invitaciones, reglas para jugadores y conexión |
| **Ajustes** | Vista, cuadrícula, capas, tipos de muro y atajos de teclado |

Los jugadores solo ven Fichas, Mesa y Ajustes.

### Qué puede hacer cada rol

| | Director | Jugador |
|---|---|---|
| Muros, luces, zonas, tablero, imágenes | Sí | No |
| Planos tácticos (M) | Sí; los suyos solo se ven si los publica | Sí: los ve todo el grupo y solo puede mover o borrar los suyos |
| Cargar plantillas, importar y exportar escenas, deshacer | Sí | No |
| Mover su personaje | Sí (y cualquier ficha, también en «Vista de jugador») | Solo el suyo |
| Nombre, color, retrato y luz del personaje | Sí | Solo el suyo |
| Visión, tamaño y visibilidad de las fichas | Sí | No |

Un personaje ve **todo** lo que quede dentro de su **visión en la oscuridad** y, más allá, sólo lo
que esté iluminado (luces de la escena, antorchas, luz ambiente). Lo que ve queda explorado
en la niebla de guerra, también lo que sólo alcanza a ver gracias a una luz lejana.
| Abrir puertas | Sí | Si el director lo permite (Mesa → Reglas para jugadores) |
| Cruzar portales | Sí, y llevar a todo el grupo | Solo con su personaje, estando cerca |
| Crear, cambiar y borrar escenas | Sí | No; solo ve la escena donde está |
| Ver fichas ocultas y planos sin publicar | Sí | No: el servidor no se los envía |

En **Vista de jugador** el director ve la escena como la ven los jugadores y puede
seguir moviendo a los personajes (con los muros bloqueando el paso, como a ellos).

El servidor valida cada cambio; lo que un jugador no puede hacer se rechaza y se
deshace en su pantalla.

### Colocación libre o en casillas

En **Ajustes → Cuadrícula** eliges qué se ajusta a la cuadrícula. Por defecto:

- **Fichas y puntos al dibujar muros:** se ajustan a las casillas.
- **Luces, objetos, zonas y el movimiento de muros y barreras:** quedan libres. Una
  figura (una escalera, una columna, un mostrador curvo) se desplaza exactamente lo
  que la arrastras, sin saltar a la casilla más cercana.

Las barras de las herramientas de muros y luces tienen el mismo interruptor a mano.
**Alt** invierte el ajuste mientras lo mantienes pulsado. Esta preferencia se guarda
en tu navegador.

Para colocar con precisión, selecciona y usa las flechas:
- **Fichas:** una casilla por pulsación.
- **Muros, luces, objetos y zonas:** 5 px por pulsación, 1 px con Alt y una casilla
  con Mayús.

### Mapas comerciales

Sube el mapa en **Imágenes → Tablero**. Si el nombre del archivo indica la escala
(por ejemplo `Taberna - 14x15 - 72 DPI.png`), se coloca a ese tamaño automáticamente.
Si no, ajústala en el editor del tablero con **Píxeles por casilla**.

Para interiores irregulares, la herramienta de muros (W) tiene tramos, salas,
círculos, arcos y curvas; la herramienta de zonas (Z) dibuja zonas interiores
poligonales, y con clic derecho sobre una figura de muros puedes crear la zona
con su misma forma.

## Datos

Todo vive en PostgreSQL: usuarios, tableros, escenas, miembros (y la escena en la que está
cada uno), objetos, imágenes (como bytes) y la niebla explorada por cada jugador.

- **Copia de seguridad:** `docker compose exec -T db pg_dump -U jav -d jav --format=custom > copia.dump`.
- **Empezar de cero:** `docker compose down -v`.

La niebla se guarda cada pocos segundos y al cruzar un portal. El director puede
borrarla para todos desde **Escena → Niebla de guerra → Reiniciar exploración**.

## Estructura

```
server.js              Punto de entrada (DATABASE_URL, PORT)
server/app.js          HTTP, API y tiempo real
server/db.js           Pool de PostgreSQL, migraciones y consultas
server/migrations/     Esquema, un fichero SQL por versión
server/auth.js         Contraseñas (scrypt)
server/rules.js        Validación y permisos
server/ws.js           WebSocket mínimo sin dependencias
test/                  Tests (node:test) y prueba e2e contra docker compose
docs/                  Documentación técnica y operativa
public/index.html      Interfaz
public/css/app.css     Estilos
public/js/             Cliente (núcleo, dibujo, editor, red, plantillas)
public/muestras/       Imágenes de las plantillas
public/fonts/          Tipografías Alegreya (licencia SIL OFL)
```

## Créditos

- Iconos: Lucide (licencia ISC).
- Cálculo de visibilidad: visibility-polygon.js de Byron Knoll (dominio público).
- Tipografías: Alegreya y Alegreya Sans de Huerta Tipográfica (SIL Open Font License).
- El mapa del Herbolario de la plantilla es aportado por el autor; revisa su licencia
  antes de compartir el programa con terceros.
- Nació como «Mini VTT»; el historial del cambio está en `docs/07-historial.md`.
