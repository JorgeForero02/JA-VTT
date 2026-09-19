# 03 — Despliegue

Estado al 2026-09-16: **en producción en https://tablero.supportive.pro** (Coolify en vps1new).

## Producción

| Dato | Valor |
|---|---|
| Dominio | `https://tablero.supportive.pro` (Let's Encrypt hasta 2026-12-11) |
| Coolify | proyecto **D&D** · entorno `production` · app `ja-vtt` · uuid `d6qlm5kzdoitlacr5br29fna` |
| Origen | `git@github.com:JorgeForero02/JA-VTT.git`, **rama `prod-2d`** (desde 2026-09-18: producción 2D + clima, sin el 2.5D de `main`), compose `/docker-compose.yml` |
| Clave | `github-deploy-ja-vtt` (Coolify uuid `tvonfo4u5mayl3kxq1owv1cc`), deploy key de sólo lectura en el repo. Privada en `vps1new:/root/.ssh/coolify-keys/ja-vtt-deploy` |
| Variables | `POSTGRES_USER=jav`, `POSTGRES_DB=jav`, `POSTGRES_PASSWORD` (copia en `vps1new:/root/.ssh/coolify-keys/ja-vtt-postgres-password`) |
| Contenedores | `app-d6qlm…` y `db-d6qlm…` (el sufijo cambia en cada deploy: resolver por prefijo) |
| Datos | volumen `d6qlm5kzdoitlacr5br29fna_pgdata` |
| Dominio en Coolify | `docker_compose_domains = {"app":{"domain":"https://tablero.supportive.pro"}}` |

Desplegar: push a **`prod-2d`** y `POST /api/v1/deploy {"uuid":"d6qlm5kzdoitlacr5br29fna"}` (o botón en la
UI). **El push solo no despliega** (`instant_deploy: false`, sin webhook): comprobado el 2026-09-18 al
empujar el modo 2.5D a `main` — los contenedores siguieron «Up 2 days». Producción sirve **`prod-2d`**
(`c4a7fbe` = `34a7ba4` + cherry-picks del clima, desplegado el 2026-09-18); **no** lleva 2.5D (decisión
del usuario: no exponer algo incompleto). Cambiar la rama que sigue Coolify: `PATCH /api/v1/applications/<uuid>`
con `{"git_branch":"…"}`; cuando el 2.5D esté listo (fase E), volver a `main` con ese PATCH. Antes de
cualquier deploy: `npm run test:ui` local y `test:e2e`. Reiniciar: `POST /api/v1/applications/d6qlm5kzdoitlacr5br29fna/restart`. **No** tocar los
contenedores con `docker` a mano.

Verificado el 2026-09-16 desde dentro del servidor: `GET /` 200, `/api/health` ok, certificado
correcto; `npm run test:e2e` con `BASE_URL=https://tablero.supportive.pro E2E_RESTART=no` → 10/10
(WSS por Traefik, 190 ms por mensaje); restart por API → mismas filas antes y después.

**Copias de seguridad: no las hay, por decisión del usuario (2026-09-16).** El script diario
`/root/scripts/backup-coolify.sh` no incluye esta base.

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

## Cómo se creó en Coolify (2026-09-16, por API)

1. Repo privado `JorgeForero02/JA-VTT`; clave ed25519 generada en el servidor, alta en Coolify
   (`POST /security/keys`) y como deploy key de sólo lectura en GitHub (una deploy key sólo
   puede vivir en un repo: la de DnD no servía).
2. `POST /applications/private-deploy-key` con `build_pack: dockercompose`,
   `docker_compose_location: /docker-compose.yml`, `instant_deploy: false`.
3. Coolify **crea solo las variables del compose**, con el texto del `:?` como valor:
   `PATCH /applications/{uuid}/envs` para poner la contraseña real.
4. Primer deploy sin dominio (Coolify rechaza el dominio hasta leer el compose). Después
   `PATCH /applications/{uuid}` con `docker_compose_domains` **en forma de array**
   `[{"name":"app","domain":"https://…"}]` y redeploy.
5. Verificar desde dentro con `--resolve DOMINIO:443:127.0.0.1` (Norton falsea el TLS en el PC).

WebSocket: Traefik lo pasa sin configuración extra; el cliente usa `wss://` cuando la
página va por `https`.

## Copias de seguridad

El único dato irreemplazable es el volumen `pgdata`. Coolify **no** lo respalda solo.

```bash
docker compose exec -T db pg_dump -U jav -d jav --format=custom > jav-$(date +%F).dump
docker compose exec -T db pg_restore -U jav -d jav --clean --if-exists < jav-YYYY-MM-DD.dump
```

El usuario decidió (2026-09-16) **no** añadir esta base al backup diario de vps1new. Si cambia
de idea: bloque nuevo en `/root/scripts/backup-coolify.sh` resolviendo el contenedor por
prefijo `db-d6qlm5kzdoitlacr5br29fna`.

## Gotchas

- **Norton intercepta TLS en este PC**: `npm ci` dentro del build falla con
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Por eso el override pasa `NPM_STRICT_SSL=false` al build
  **sólo en local**. En Coolify se construye con verificación normal.
- `docker compose restart app` manda `SIGTERM`: la app vuelca lo pendiente antes de salir.
- El contenedor de la app no escribe en disco: todo va a PostgreSQL. Se puede recrear sin miedo.
