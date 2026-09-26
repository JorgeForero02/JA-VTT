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

## Mesa 3D (módulo `modules/tablero3d`, 2026-09-26)

- En «Nuevo tablero» se elige **Mesa 2D** (JA-VTT de siempre) o **Mesa 3D**; el tipo no cambia
  después. Las tarjetas del panel llevan la etiqueta «2D» o «3D».
- Una mesa 3D abre directamente la vista 3D: pestañas Escena · Fichas · Partida · Campaña (del
  módulo) + Mesa · Chat (de JA-VTT). Lo que hace dentro está en
  [modules/tablero3d/README.md](../modules/tablero3d/README.md).
- **Guardado automático** (2026-09-26), como el 2D: la escena que edita el director se guarda sola en el
  tablero unos 2 s después de cada cambio (en una campaña, la campaña). Abrir una escena no la guarda; el
  estado sale en Escena → «Esta escena» y Ctrl+S guarda al momento. «Guardar como nueva» crea una copia
  aparte, que pasa a ser la que se edita. Los jugadores no guardan.
- **Mesa → Conexión** en una mesa 3D: el estado cuenta las dos conexiones (chat de JA-VTT y tablero 3D) y el
  render 3D (fps, ms de CPU por fotograma, llamadas, triángulos); «Probar conexión» mide las dos. «Vista» y
  «Atajos de teclado» del 2D no se muestran (el 3D tiene su ayuda con «?»).
- Las tiradas de su mesa en vivo aparecen en el Chat como tiradas; sus ajustes («Dados», «Chat de
  texto», vida, puertas…) son los mismos del tablero.
- Límites vigentes en [06](06-pendientes.md) (P-32 a P-36).

## Escenas, portales, fichas, imágenes, niebla

Sin cambios respecto a Mini VTT: ver README §«Cómo se usa» y §«Qué puede hacer cada rol».
El servidor valida cada operación y devuelve una corrección (`fix`) cuando un jugador
intenta algo que no puede.

### Condiciones, vida y altura (2026-09-19)

- Clic derecho en una ficha → **Estado**: 20 condiciones (14 del SRD + muerto, concentración, agotamiento,
  en llamas, bendecido, marcado), vida actual/máxima/temporal con `−`/`+` (Mayús: 5) o rueda del ratón, y
  altura en pies. Lo abren el director (cualquier ficha) y el jugador (la suya).
- En el lienzo: badges de dos letras encima de la ficha (máximo 6, luego `+n`), barra de vida bajo la ficha
  (verde > 50 %, ámbar > 25 %, rojo; franja cian = vida temporal), pastilla `+20'` arriba a la izquierda si
  la altura no es 0, velo y calavera si está muerta.
- Mesa → Reglas para jugadores → **Vida de las fichas**: todos · sólo el director (cada jugador sigue
  viendo la suya) · los jugadores ven sólo la barra.
- **Clase de armadura (CA)**: opcional por ficha (0 = sin CA), en el editor y en el Estado; se pinta como un escudo con el número. El director ve todas; cada jugador, sólo la de sus fichas (el servidor no envía las demás).
- Mesa → Chat, dados y fichas: **Vida de las fichas**, **Condiciones y altura** y **Clase de armadura (CA)** se apagan por tablero (se ocultan, no se borran) para quien lleve esto en otro sistema.

### Regla multitramo y anotaciones (2026-09-19)

- **Regla (R):** arrastra para medir; **Espacio o clic derecho** durante el arrastre fija un punto y sigue midiendo desde ahí (para rodear esquinas). Cada tramo muestra sus pies; al final, el total y la línea recta. Diagonales a 5 pies (regla de mesa: `max(dx,dy)`).
- **Anotaciones (N, director):** clic clava un pin con texto («Trampa DC 15», «Palanca»). Por defecto **sólo el director la ve** (pin violeta con ojo tachado); en sus propiedades se publica y los jugadores ven pin y texto. Capa «Anotaciones» en Capas.
- Una anotación **publicada** se ve donde el grupo ve (como una ficha enemiga): en la oscuridad o tras un muro no aparece. Decisión P-27, 2026-09-19.

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
| `GET/POST/DELETE /api/t3d/boards/:id` | miembro / gm | tipo de mesa (POST: marcar 3D en los 10 min tras crear; DELETE siempre 409) |
| `/api/t3d/boards/:id/{scenes,campaigns,drawings,usage,settings,travel}` · `…/scenes/:sid/portals` | miembro / gm | contenido de una mesa 3D (404 en una 2D); detalle en el README del módulo |
| `GET /t3d/…` · `GET /t3d/ws?board=<id>` | — / miembro | cliente del módulo · su tiempo real |
| `GET /ws?board=<id>` | miembro | tiempo real: `ops`, `scene`, `travel`, `fog`, `cursor`, `rename`, `chat`, `roll`, `initiative` |

Errores siempre como `{ "error": "texto en castellano" }` con el código HTTP que toca.
