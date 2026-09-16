# Chat, dados 3D, iniciativa y recuperación de contraseña

Fecha: 2026-09-16. Decisiones tomadas con el usuario en conversación.

## Requisitos
1. **Recuperación de contraseña sin correo**: código de recuperación (12 caracteres) que el
   usuario ve en su perfil (oculto, copiable) y puede regenerar. Con nombre + código se pone
   contraseña nueva desde la pantalla de entrada. Se muestra también al crear la cuenta.
2. **Dados 3D** «como PlanarAlly/Owlbear»: d4, d6, d8, d10, d12, d20, d100 (dos d10). three.js +
   cannon-es servidos desde el repo (`public/js/vendor`). El **servidor decide el resultado**
   (`crypto.randomInt`), los clientes sólo animan hacia ese resultado; todos ven la tirada.
3. **Iniciativa**: lista de participantes con valor, turno actual y ronda; la gestiona el
   director; **los jugadores sólo la ven si el director activa «Mostrar iniciativa»**. Las fichas
   ocultas no aparecen a los jugadores.
4. **Chat sencillo**: mensajes de texto por tablero, con las tiradas dentro; historial de los
   últimos 200. El director puede **desactivar chat y dados** para los jugadores.

## Decisiones
| Tema | Decisión |
|---|---|
| Código de recuperación | Se guarda en claro en `users.recovery_code` (proyecto privado; el usuario quiere verlo cuando quiera). Excepción declarada en `04`. |
| Ajustes de tablero | `chatEnabled` (def. true) e `initiativeShown` (def. false) entran en `BOARD_KEYS`. |
| Iniciativa | Vive en `boards.settings.initiative` (jsonb): `{entries:[{id,name,value,tokenId?}], turn, round}`. Sólo cambia por el mensaje WS `initiative` del director. |
| Chat | Tabla `chat_messages`; WS `chat {text}` y `roll {formula}`; broadcast `chat` con el mensaje; el estado inicial incluye los últimos 100. |
| Fórmulas | `NdM[+/-...]` con M ∈ {4,6,8,10,12,20,100}, N ≤ 20 por término, ≤ 5 términos, modificador entero. |
| Cliente | Pestaña **Chat** (jugadores la ven si `chatEnabled`), botonera de dados, `/r 2d6+3`. Capa de dados 3D sobre el mapa. Barra de iniciativa plegable arriba; edición en pestaña **Mesa** (director). Perfil: menú del nombre de usuario en el panel de tableros. |

## Criterios de aceptación
- Dado `ana` con código `X` · cuando `POST /api/recover {name:'ana', code:'X', password:'nueva12'}` · entonces 200 y `login` con `nueva12` funciona; con código malo → 401.
- `GET /api/me/recovery` devuelve el código; `POST /api/me/recovery` lo regenera (el viejo deja de valer).
- `roll('2d6+3')` → 2 dados de 6 y modificador 3; `roll('d7')` → error; `roll('30d6')` → error.
- WS: un jugador manda `roll` → todos los clientes del tablero reciben `chat {kind:'roll', dice:[...], total}`; queda en la base; el estado al conectar trae el historial.
- Con `chatEnabled=false`, `chat`/`roll` de un jugador se rechazan con `error`; el director sí puede.
- WS `initiative` de un jugador se ignora; del director se aplica y se difunde; con `initiativeShown=false` los jugadores no reciben la iniciativa (ni en el estado).
