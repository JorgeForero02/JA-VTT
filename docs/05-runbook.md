# 05 — Runbook

## Desarrollo sin Docker para la app (Postgres sí en Docker)

```bash
docker run -d --name jav-test-pg -e POSTGRES_USER=jav -e POSTGRES_PASSWORD=jav \
  -e POSTGRES_DB=jav_test -p 55432:5432 postgres:16-alpine
DATABASE_URL=postgres://jav:jav@localhost:55432/jav_test PORT=3000 node server.js
```

`jav-test-pg` es la base que usan los tests por defecto (`TEST_DATABASE_URL`, ver
`test/helpers/db.js`). **Los tests borran el esquema entero**: nunca apuntarlos a otra base.

## Comandos

| Qué | Comando |
|---|---|
| Lint | `npm run lint` |
| Tests (32) | `npm test` — serie, contra `TEST_DATABASE_URL` (por defecto `jav-test-pg`) |
| Lint + tests | `npm run check` |
| Pila local | `docker compose up -d --build` · `docker compose logs -f app` · `docker compose down` |
| E2E contra la pila | `npm run test:e2e` (`BASE_URL` para otra URL; `E2E_RESTART=no` si no puede reiniciar el contenedor) |
| Consola SQL | `docker compose exec db psql -U jav -d jav` |
| Conteos rápidos | `docker compose exec -T db psql -U jav -d jav -Atc "SELECT count(*) FROM users"` |
| Backup / restore | ver [03-despliegue.md](03-despliegue.md) |

## Añadir una migración

1. Crear `server/migrations/002-<nombre>.sql` (tres dígitos, orden alfabético).
2. Arrancar la app (o `npm test`): se aplica y se anota en `schema_migrations`.
3. Documentar el modelo en [01](01-arquitectura.md) si cambia.

## Gotchas

- `node --test test/` falla con «Cannot find module»: hay que pasar el glob
  `"test/*.test.js"` (ya lo hace `npm test`).
- Los tests se ejecutan en serie (`--test-concurrency=1`) porque comparten la base.
- `git checkout <archivo>` sobre un archivo sin commitear **lo pierde**; el 2026-09-15 pasó
  con `server/db.js` y hubo que reescribirlo.
- Norton rompe `npm ci` dentro del build en este PC: `NPM_STRICT_SSL=false` en `.env`.
- La extensión Claude in Chrome no estaba conectada el 2026-09-15: la comprobación visual del
  login quedó para el usuario (los tests de contrato del frontend sí corren).
- `pg` devuelve `COUNT(*)` como texto salvo cast: `db.js` ya castea o parsea BIGINT a Number.
- `npm test` dio 2 fallos intermitentes en `realtime.test.js` el 2026-09-15 mientras Docker
  construía la imagen (CPU saturada); 9 corridas posteriores limpias. La espera por mensaje
  WS en tests es de 5 s (`test/helpers/ws.js`). No correr la suite mientras se construye.
