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
| Tests (78) + cobertura con umbral | `npm test` — serie, contra `TEST_DATABASE_URL` (por defecto `jav-test-pg`) |
| Lint + tests | `npm run check` |
| Pila local | `docker compose up -d --build` · `docker compose logs -f app` · `docker compose down` |
| E2E contra la pila | `npm run test:e2e` (`BASE_URL` para otra URL; `E2E_RESTART=no` si no puede reiniciar el contenedor) |
| Consola SQL | `docker compose exec db psql -U jav -d jav` |
| Conteos rápidos | `docker compose exec -T db psql -U jav -d jav -Atc "SELECT count(*) FROM users"` |
| Backup / restore | ver [03-despliegue.md](03-despliegue.md) |

> Si `npm test` falla por cobertura (`does not meet threshold`), no bajes el umbral: añade el test que
> falta. Los umbrales viven en `package.json` (script `test`). El cliente no entra en la cobertura
> (se prueba con `test/frontend.test.js` por contrato y con `npm run test:ui` visualmente).

## Prueba visual (Playwright con el Edge/Chrome instalado)

```bash
docker exec jav-test-pg psql -U jav -d postgres -c "CREATE DATABASE jav_ui"   # una vez
DATABASE_URL=postgres://jav:jav@localhost:55432/jav_ui PORT=3999 node server.js &
npm run test:ui          # 14 pasos: registro, perfil, chat, dados, iniciativa, recuperación; capturas en test/e2e/capturas
npm run test:dice        # tira un dado de cada tipo y captura dice-debug.png
npm run test:t3d         # 35 pasos del tablero 3D dentro de JA-VTT (BASE_URL=http://localhost:3999): guardado automático, conexión, mesa en vivo, tirada, ajustes, mesa 2D, consola, catálogo de piezas (§6, escena vieja, pieza p: opaca, barrera R18, piezas p: que tapan por componentes, level/side, /pieces caído)
```

- **Límite de `probe('light', x, z)`** (lo usa `test:t3d`): lee la luz **calculada** (`computeLight`, el array
  `L`), no lo que se ve pintado. Tras abrir una puerta, `doorRelight` rehace además los bloques de alrededor
  (el repintado); la prueba confirma el cálculo, no que esos bloques se hayan vuelto a dibujar. Para ver el
  repintado hace falta una captura.
- `test:t3d` provoca a propósito que `/api/t3d/boards/*/pieces` falle (paso M4/M5); los errores de red de ese
  tramo no cuentan como errores de consola.

No descarga navegadores: usa `channel: 'msedge'` o `'chrome'`. Contra producción: `BASE_URL=https://tablero.supportive.pro`.

## Tests del módulo tablero3d (`test/t3d/`)

- **Sólo los del módulo, en serie, contra `jav-test-pg`**: `node --test --test-concurrency=1 "test/t3d/*.test.js"`
  (glob entre comillas; no hace falta `docker compose`; usa el mismo Postgres de siempre). Sin
  `--test-concurrency=1` chocan en Postgres (`users_name_ci`) y salen ~16 falsos fallos. Entran también en
  `npm test`/`npm run check` junto con los del núcleo.
- **Fotos doradas del refactor del cliente 3D** (no se regeneran nunca, [04](04-convenciones.md) B.1c):
  `test/t3d/fixtures/motor-antes.json` (luces, azar y generadores; la tomó `test/t3d/tools/foto-motor.cjs`, de un
  solo uso como `foto-fabrica.cjs`), `test/t3d/fixtures/motor-escenas-entrada.json` (escenas de entrada) y
  `test/e2e/fixtures/motor-escenas.json` (lo que da el motor en el navegador). `test/e2e/t3d-motor.mjs` compara
  contra esta última; **`FOTO=1` sólo la primera vez que se crea una foto** (se niega a sobrescribir;
  `FOTO_SALIDA=<ruta>` escribe en otro sitio para comparar dos capturas). Si no cuadra, es un cambio de
  comportamiento: parar, no recapturar.
- `npm run test:t3d` = `test/e2e/t3d.mjs` y luego `test/e2e/t3d-motor.mjs` (11 pasos: editor de arte, tablero,
  deshacer/rehacer, combate, mapas de ejemplo, permisos en vivo), con el servidor en 3999 como `test:ui`.
- `test/t3d/helpers/fixtures.js` trae `escenaVieja()` (una escena v1 completa: puertas con llave, portales con
  destino, dibujos `obj:o_…`, escaleras de campaña de antes) para los tests de compatibilidad.
- `test/t3d/tools/foto-fabrica.cjs` **no se vuelve a ejecutar**: fue una herramienta de un solo uso (Tarea 3,
  fase 0) para fotografiar el comportamiento de las piezas de fábrica *antes* de que existiera el catálogo
  (`test/t3d/fixtures/fabrica-antes.json`, referencia fija). Desde que `muros.js` y el resto leen
  `Catalogo`/`PIECES`, volver a correrla no reproduce lo mismo (ya no hay `PROP3D` sin catálogo que fotografiar
  de la misma forma) — el propio archivo lo avisa en su cabecera.

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
- **`test:ui`: esperar a la condición, no a un tiempo ni a «algo cambió».** P-47: en Vista de jugador el director
  explora su propia vista en el primer fotograma, así que `EXP.chunks.size > 0` se cumplía antes de que llegase la
  niebla del jugador. Para mensajes del servidor, `fogofApplied()` en `ui.mjs` espera el marco WS concreto
  (`page.__ws`, `framereceived`) y luego su efecto. Para reproducir fallos de temporización: varias `test:ui` a la
  vez contra el mismo servidor (3 en paralelo sacó éste en 1 de 12).
- **Añadir una condición** = dos sitios: `CONDITION_IDS` en `server/rules.js` **y** `CONDITIONS` en
  `public/js/core.js` (mismo orden). El test de contrato de `frontend.test.js` avisa si se desincronizan.
- **`hp` sin `max` no existe**: `sanitize` lo elimina. Para quitar la barra a una ficha, pon la vida máxima a 0.
- **Escenas previas y la capa de notas**: Escenas guardadas antes del 2026-09-19 no tienen `layers.notes`: el render usa `(S.layers.notes||{visible:true})`. Al guardar la escena la capa aparece sola.

## Perfilar el render

En la consola del navegador, dentro de un tablero: `const t=performance.now()/1000; const f=()=>cx.dark.getImageData(0,0,1,1);
let t0=performance.now(); for(let i=0;i<20;i++){frame.sources=null;drawAll(t+i*.016,true);f()} (performance.now()-t0)/20`
→ ms por fotograma de animación de luz. Referencia 2026-09-16 (Edge headless, 1920×1080 @2x, 7 luces,
60 muros): 16 ms; por encima de 30 ms se notan tirones en el pulso.
