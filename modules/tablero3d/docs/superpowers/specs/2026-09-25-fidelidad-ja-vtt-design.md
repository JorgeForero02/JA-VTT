# Fidelidad con Just Another VTT — diseño

Fecha: 2026-09-25. Petición del usuario: que el tablero 3D quede «lo más fiel posible» a Just
Another VTT (sólo la rama `release`), con el mismo lenguaje y el mismo sistema de esquemas de base
de datos para guardarlo todo, **sin fusionar los proyectos**, para integrarlo allí más adelante.

## Qué se copia de JA-VTT

| Aspecto | Cómo |
|---|---|
| Lenguaje y plataforma | JavaScript CommonJS en Node 22, `node:http`, una dependencia (`pg`), scripts clásicos en el cliente, textos en castellano |
| Datos | PostgreSQL 16, migraciones SQL numeradas con `schema_migrations` y `pg_advisory_lock`, todo el SQL en `db.js`, reglas en `rules.js`, tiempos en ms BIGINT |
| Cuentas y tableros | Tablas `users`, `sessions`, `boards`, `board_members` con las mismas columnas; mismas rutas `/api/register`, `/api/login`, `/api/me…`, `/api/boards…`, `/api/join` |
| Tiempo real | `ws.js` idéntico, cola por tablero, volcado cada 400 ms, cierre ordenado con `SIGTERM` |
| Interfaz | HTML de entrada, panel y perfil; cabecera, raíl, panel de cinco pestañas con secciones plegables que se recuerdan; `app.css` con sus tokens, Alegreya y Lucide |
| Calidad y operación | `node:test` contra Postgres real con umbral de cobertura, eslint, `test:e2e` con reinicio del contenedor, `test:ui` con Playwright, Docker Compose `db`+`app` con override local, docs `00`–`07` |

## Qué es propio del tablero 3D

- Contenido del tablero: `scenes` (mapa 3D en jsonb), `campaigns`, `drawings` + `drawing_layers`
  (PNG en bytea, como las imágenes de JA-VTT), `live_docs` (mesa en vivo) y `chat_messages`
  (tiradas).
- Vocabulario: el «tablero» es la mesa del grupo (como en JA-VTT) y cada mapa 3D es una «escena».
- Pestañas: Escena · Fichas · Partida · Campaña · Mesa (JA-VTT: Escena · Luces · Fichas · Mesa · Chat).
- El motor 3D conserva su lógica y su interfaz de documentos (`use('db' | 'room' | 'user')`);
  `net.js` la implementa sobre REST y WebSocket.

## Qué no se hace

- No se copia el dominio 2D de JA-VTT (luces, muros, escenas por objetos, dados 3D, clima).
- No se comparte base de datos ni código en tiempo de ejecución con JA-VTT.
