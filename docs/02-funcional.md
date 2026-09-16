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
- El director puede desactivar chat y dados para los jugadores (`chatEnabled`).
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

Sin cambios respecto a Mini VTT: ver README §«Cómo se usa» y §«Qué puede hacer cada rol».
El servidor valida cada operación y devuelve una corrección (`fix`) cuando un jugador
intenta algo que no puede.

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
| `GET /ws?board=<id>` | miembro | tiempo real: `ops`, `scene`, `travel`, `fog`, `cursor`, `rename`, `chat`, `roll`, `initiative` |

Errores siempre como `{ "error": "texto en castellano" }` con el código HTTP que toca.
