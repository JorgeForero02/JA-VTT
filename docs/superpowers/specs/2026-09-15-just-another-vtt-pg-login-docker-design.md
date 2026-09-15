# Just Another VTT — PostgreSQL, login con contraseña y despliegue Docker

Fecha: 2026-09-15. Estado: aprobado en conversación por el usuario.

## Punto de partida

Mini VTT: Node ≥22.5 sin dependencias, HTTP + WebSocket propio, SQLite (`node:sqlite`),
login solo por nombre. Funciona bien en LAN. Se quiere desplegar en `vps1new` (Coolify)
con persistencia fiable y un login mínimo con contraseña.

## Requisitos (del usuario)

1. Renombrar a **Just Another VTT** (repo, paquete, UI, cookie, claves de localStorage).
2. Persistencia en **PostgreSQL**; volumen Docker para los datos.
3. **Login con contraseña.** Registro abierto a cualquiera con la URL. Sin 2FA ni
   rate-limit: proyecto casi privado.
4. **`docker-compose.yml`** que levante todo en este PC **y** sirva para Coolify. Sin
   prueba local no hay despliegue.
5. **Tiempo real probado** con evidencia: dos clientes, un cambio viaja; reinicio del
   contenedor y el estado sigue.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Driver | `pg` (única dependencia de producción) | Estándar, sin ORM: las consultas ya son SQL a mano |
| Esquema | Migraciones SQL numeradas en `server/migrations/`, aplicadas al arrancar con tabla `schema_migrations` | Sin herramienta externa; reproducible |
| Imágenes | Siguen en la base (`bytea`) | Un solo `pg_dump` respalda todo; Coolify no respalda volúmenes de ficheros |
| Objetos | `jsonb` en vez de `text` | Permite índices futuros; hoy se usa igual |
| Contraseña | `crypto.scrypt` nativo, formato `scrypt$N$salt$hash` | Sin dependencia; suficiente para el umbral pedido |
| Sesión | Cookie `jav_session` HttpOnly, token aleatorio en tabla `sessions`, 1 año | Igual que hoy, sólo cambia el nombre |
| Estado en memoria | Se mantiene la caché `live` por tablero con `flush()` periódico | El tiempo real depende de ella; sólo se hace asíncrona con un cerrojo por tablero para no solapar escrituras |
| Compose | `docker-compose.yml` (prod: app + db, sin `ports`) + `docker-compose.override.yml` (local: publica `APP_PORT`) | `docker compose up` local fusiona ambos; Coolify lee sólo el principal y pone Traefik delante |
| Tests | `node:test` nativo contra un Postgres real (`TEST_DATABASE_URL`) | Sin framework extra; la base es la pieza que cambia |
| Nivel pipeline | **N1**: `node --check`, eslint, `node --test`, prueba e2e de tiempo real | Es lo que se puede probar hoy con comando |

## Criterios de aceptación (Given / When / Then)

**Registro y login**
- Dado que no existe `ana` · cuando `POST /api/register {name:'ana', password:'secreto1'}` · entonces 201, cookie `jav_session`, y `GET /api/me` devuelve `ana`.
- Dado que `ana` existe · cuando se registra otra vez · entonces 409.
- Dado que `ana` existe · cuando `POST /api/login` con contraseña correcta · entonces 200 y cookie.
- Dado que `ana` existe · cuando `POST /api/login` con contraseña incorrecta · entonces 401 y sin cookie.
- Cuando `POST /api/login` con nombre inexistente · entonces 401 (mismo mensaje que contraseña mala).
- Contraseña de menos de 6 caracteres → 400.

**Persistencia**
- Dado un tablero con una ficha movida · cuando el proceso se cierra y arranca de nuevo · entonces la ficha está en la nueva posición.
- Dado una imagen subida · cuando se reinicia · entonces `GET /api/images/:id` devuelve los mismos bytes.

**Tiempo real**
- Dado dos clientes en la misma escena · cuando A mueve una ficha · entonces B recibe `ops` con la ficha en menos de 1 s.
- Dado un jugador sin permiso · cuando intenta mover una ficha ajena · entonces recibe `fix` y nadie más recibe el cambio (comportamiento actual, se conserva).

**Despliegue**
- `docker compose up -d --build` en este PC → `http://localhost:3000` responde 200 y todo lo anterior pasa contra el contenedor.
- `docker compose restart app` → los datos siguen.

## Fuera de alcance

Recuperación de contraseña, correo, roles globales de administración, rate-limit,
migración de datos desde el SQLite viejo (la base empieza vacía; las muestras se siembran).
