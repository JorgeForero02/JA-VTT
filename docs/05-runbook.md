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
| Tests (101) | `npm test` — serie, contra `TEST_DATABASE_URL` (por defecto `jav-test-pg`) |
| Lint + tests | `npm run check` |
| Pila local | `docker compose up -d --build` · `docker compose logs -f app` · `docker compose down` |
| E2E contra la pila | `npm run test:e2e` (`BASE_URL` para otra URL; `E2E_RESTART=no` si no puede reiniciar el contenedor) |
| Consola SQL | `docker compose exec db psql -U jav -d jav` |
| Conteos rápidos | `docker compose exec -T db psql -U jav -d jav -Atc "SELECT count(*) FROM users"` |
| Backup / restore | ver [03-despliegue.md](03-despliegue.md) |

## Prueba visual (Playwright con el Edge/Chrome instalado)

```bash
docker exec jav-test-pg psql -U jav -d postgres -c "CREATE DATABASE jav_ui"   # una vez
DATABASE_URL=postgres://jav:jav@localhost:55432/jav_ui PORT=3999 node server.js &
npm run test:ui          # 31 pasos: registro, perfil, chat, dados, iniciativa, tablero 2.5D (edición del director, ficha como sprite, mover y crear fichas, ciego / ver con la ficha / Director↔Vista de jugador, niebla que sobrevive a la recarga), recuperación; capturas en test/e2e/capturas
# Edge headless con GPU por software (--use-angle=swiftshader …) para que el WebGL del 2.5D renderice (~6 fps); el paso 2.5D va ANTES de la recuperación porque ésta cierra las sesiones del director
npm run test:dice        # tira un dado de cada tipo y captura dice-debug.png
```

No descarga navegadores: usa `channel: 'msedge'` o `'chrome'`. Contra producción: `BASE_URL=https://tablero.supportive.pro`.

Gotchas del 2.5D en la prueba visual: `window.D3.debug()` sólo responde en `localhost` y da
`{chars, lights, vids, screen:[{vid,x,y}], view, env, amb, blind, viewers, explored}` — `screen` son
coordenadas de pantalla para pinchar una ficha; para tocar un objeto (una puerta) hay que pinchar el
**sprite**, no el suelo de la casilla. Con dos páginas y swiftshader el montaje puede tardar >15 s:
esperar a `D3.isMounted() && D3.debug()`, no a que el canvas sea «visible». Si falla, el script
vuelca los errores de consola acumulados.

## Añadir una migración

Migraciones aplicadas: 001 inicial · 002 chat/recuperación · 003 sin muestras · 004 niebla limpia · 005 terreno 2.5D.

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

## Perfilar el render

En la consola del navegador, dentro de un tablero: `const t=performance.now()/1000; const f=()=>cx.dark.getImageData(0,0,1,1);
let t0=performance.now(); for(let i=0;i<20;i++){frame.sources=null;drawAll(t+i*.016,true);f()} (performance.now()-t0)/20`
→ ms por fotograma de animación de luz. Referencia 2026-09-16 (Edge headless, 1920×1080 @2x, 7 luces,
60 muros): 16 ms; por encima de 30 ms se notan tirones en el pulso.
