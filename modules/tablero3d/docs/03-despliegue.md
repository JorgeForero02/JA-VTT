# 03 — Despliegue

Estado al 2026-09-26: **sin desplegar**. La pila funciona en local con Docker Compose y está
preparada para Coolify u otro proxy, igual que Just Another VTT.

## Producción

No hay: ni dominio, ni servidor, ni copias programadas. Decidir dónde y desplegar es **P-01** en
[06](06-pendientes.md); cuando se haga, esta sección lleva la tabla de JA-VTT (dominio, aplicación,
origen y rama, clave, variables, contenedores, volumen) y el último despliegue verificado.

## Piezas

| Fichero | Para qué |
|---|---|
| `Dockerfile` | `node:22-alpine`, `npm ci --omit=dev`, usuario `node`, `HEALTHCHECK` sobre `/api/health` |
| `docker-compose.yml` | Pila `db` (postgres:16-alpine, volumen `pgdata`) + `app`. **Sin `ports`**: en producción entra el proxy |
| `docker-compose.override.yml` | Sólo local: publica `APP_PORT` (3000) y pasa `NPM_STRICT_SSL`. Un proxy no lo lee |
| `.env.example` | Variables; copiar a `.env` en local. `.env` está en `.gitignore` |

Variables: `POSTGRES_USER` (tp) · `POSTGRES_PASSWORD` (**obligatoria**) · `POSTGRES_DB` (tp) ·
`APP_PORT` (local) · `NPM_STRICT_SSL` (local). `DATABASE_URL` y `PORT` los compone el compose; la
app sólo lee esos dos.

## Local

```bash
cp .env.example .env          # y poner una contraseña
docker compose up -d --build  # fusiona el override → http://localhost:3000
npm run test:e2e              # registro, escena, mesa en vivo, restart del contenedor, persistencia
docker compose down           # los datos quedan en el volumen pgdata
docker compose down -v        # borra TAMBIÉN los datos
```

Verificado el 2026-09-25: `app` y `db` sanos; `test:e2e` 14/14 (reinicio incluido) y `test:ui`
28/28 contra la pila. Desde T1 (2026-09-26) la imagen copia también `modules/`; no se ha vuelto a construir
(sin Docker en las sesiones): pendiente P-07.

## Coolify (cuando se despliegue)

Mismo procedimiento que Just Another VTT (su `docs/03-despliegue.md`): aplicación de tipo
`dockercompose` con `/docker-compose.yml`, `POSTGRES_PASSWORD` en la UI y dominio en el servicio
`app`. WebSocket: Traefik lo pasa sin configuración extra; el cliente usa `wss://` cuando la
página va por `https`.

## Copias de seguridad

El único dato irreemplazable es el volumen `pgdata`.

```bash
docker compose exec -T db pg_dump -U tp -d tp --format=custom > tp-$(date +%F).dump
docker compose exec -T db pg_restore -U tp -d tp --clean --if-exists < tp-YYYY-MM-DD.dump
```

## Gotchas

- Si un antivirus o un proxy intercepta TLS en el PC, `npm ci` dentro del build falla con
  `SELF_SIGNED_CERT_IN_CHAIN`: `NPM_STRICT_SSL=false` en `.env` **sólo en local**.
- `docker compose restart app` manda `SIGTERM`: la app vuelca lo pendiente antes de salir.
- El contenedor de la app no escribe en disco: todo va a PostgreSQL.
