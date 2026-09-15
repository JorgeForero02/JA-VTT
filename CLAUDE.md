# CLAUDE.md

Just Another VTT — mesa virtual de rol con luz dinámica, escenas y tiempo real.
**Node 22 · PostgreSQL 16 · WebSocket propio · Docker Compose (Coolify en vps1new).**

Este archivo es **corto a propósito**. Toda la documentación vive en `docs/`. Nada de estado
de sesión ni pendientes aquí: van en `docs/06-pendientes.md` y `docs/07-historial.md`.

## Al empezar cualquier sesión (obligatorio)

1. [docs/00-INDEX.md](docs/00-INDEX.md) — resumen + mapa.
2. [docs/06-pendientes.md](docs/06-pendientes.md) — qué está abierto.
3. Antes de escribir código, [docs/04-convenciones.md](docs/04-convenciones.md).

Reglas globales del PC: `~/.claude/dev-rules.md` · `~/.claude/docs-protocol.md`.

| Necesito… | Voy a |
|---|---|
| Stack, capas, modelo de datos, tiempo real | [docs/01-arquitectura.md](docs/01-arquitectura.md) |
| Qué hace el sistema / API | [docs/02-funcional.md](docs/02-funcional.md) |
| Docker, compose, Coolify, backups | [docs/03-despliegue.md](docs/03-despliegue.md) |
| Un comando o gotcha | [docs/05-runbook.md](docs/05-runbook.md) |

## Comandos mínimos

```bash
npm run check            # lint + 32 tests (necesita el Postgres jav-test-pg, ver runbook)
docker compose up -d --build && npm run test:e2e
```

## Reglas duras

- **Todo el SQL en `server/db.js`**; esquema sólo por migraciones nuevas en `server/migrations/`.
- **Reglas de negocio en `server/rules.js` / `server/auth.js`**, nunca en rutas ni cliente.
- Una dependencia de producción (`pg`). Añadir otra es decisión explícita.
- Test primero; cada test roto una vez a propósito. `npm run check` verde antes de commitear.
- Refactor = sin cambio de comportamiento. Divergencia → parar y consultar.
- Secretos sólo por entorno; `.env` no se commitea.
- El compose debe funcionar en este PC antes de tocar Coolify.

## Cierre de cada cambio

1. Estado → `docs/01`–`05`. 2. `docs/07-historial.md`: qué · por qué · revertir.
3. `docs/06-pendientes.md` al día.
