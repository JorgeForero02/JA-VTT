# 03 — Despliegue

Estado al 2026-09-15: **probado en local con docker compose. No desplegado todavía en
Coolify.** Cuando se despliegue, este documento pasa a describir producción.

## Piezas

| Fichero | Para qué |
|---|---|
| `Dockerfile` | `node:22-alpine`, `npm ci --omit=dev`, usuario `node`, `HEALTHCHECK` sobre `/api/health` |
| `docker-compose.yml` | Pila `db` (postgres:16-alpine, volumen `pgdata`) + `app`. **Sin `ports`**: en producción entra Traefik |
| `docker-compose.override.yml` | Sólo local: publica `APP_PORT` (3000) y pasa `NPM_STRICT_SSL`. Coolify no lo lee |
| `.env.example` | Variables; copiar a `.env` en local. `.env` está en `.gitignore` |

Variables: `POSTGRES_USER` (jav) · `POSTGRES_PASSWORD` (**obligatoria**) · `POSTGRES_DB` (jav) ·
`APP_PORT` (local) · `NPM_STRICT_SSL` (local; ver gotcha abajo). `DATABASE_URL` y `PORT` los
compone el compose; la app sólo lee esos dos.

## Local (este PC)

```bash
cp .env.example .env          # y poner una contraseña; NPM_STRICT_SSL=false por Norton
docker compose up -d --build  # fusiona el override → http://localhost:3000
npm run test:e2e              # 11 pasos: registro, WS, broadcast, restart del contenedor, persistencia
docker compose down           # los datos quedan en el volumen pgdata
docker compose down -v        # borra TAMBIÉN los datos
```

Verificado el 2026-09-15: `docker compose ps` → ambos `healthy`; `GET /` → 200; `down` + `up`
conserva filas (2 usuarios, 1 tablero, 1 objeto antes y después).

## Coolify (vps1new) — procedimiento previsto, aún no ejecutado

1. Subir el repo a GitHub (lo hace el usuario).
2. Coolify → nuevo recurso → **Docker Compose** desde el repo, fichero `docker-compose.yml`.
3. Variables en la UI: `POSTGRES_PASSWORD` fuerte; el resto puede quedar por defecto.
   **Recordar:** en Coolify cambiar una variable **recompila** la imagen.
4. Dominio en el servicio `app`, puerto 3000. Traefik añade TLS. Sin publicar puertos.
5. Comprobar desde dentro del servidor: `curl -s https://DOMINIO/api/health`.
6. Documentar en `vps1new:/root/docs/` (01–05, 07) y aquí.

WebSocket: Traefik lo pasa sin configuración extra; el cliente usa `wss://` cuando la
página va por `https`.

## Copias de seguridad

El único dato irreemplazable es el volumen `pgdata`. Coolify **no** lo respalda solo.

```bash
docker compose exec -T db pg_dump -U jav -d jav --format=custom > jav-$(date +%F).dump
docker compose exec -T db pg_restore -U jav -d jav --clean --if-exists < jav-YYYY-MM-DD.dump
```

En vps1new hay un backup diario a Drive (`gdrive:vps1new-backups`); al desplegar, añadir
esta base a ese guion (pendiente en [06](06-pendientes.md)).

## Gotchas

- **Norton intercepta TLS en este PC**: `npm ci` dentro del build falla con
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Por eso el override pasa `NPM_STRICT_SSL=false` al build
  **sólo en local**. En Coolify se construye con verificación normal.
- `docker compose restart app` manda `SIGTERM`: la app vuelca lo pendiente antes de salir.
- El contenedor de la app no escribe en disco: todo va a PostgreSQL. Se puede recrear sin miedo.
