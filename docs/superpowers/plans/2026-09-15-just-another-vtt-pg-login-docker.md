# Plan — Just Another VTT: PostgreSQL + login + Docker

Spec: [../specs/2026-09-15-just-another-vtt-pg-login-docker-design.md](../specs/2026-09-15-just-another-vtt-pg-login-docker-design.md).
Una tarea = un commit. Test primero en cada una.

| # | Tarea | Test que la prueba |
|---|---|---|
| 1 | Renombrar a Just Another VTT (package, UI, cookie, localStorage, docs) | `grep -ri "mini.vtt\|minivtt\|vtt_session"` vacío salvo historial |
| 2 | Capa de base `server/db.js` sobre `pg`: pool, migraciones, consultas `q.*` asíncronas | `test/db.test.js` contra `TEST_DATABASE_URL`: migra en limpio, idempotente, CRUD de usuario/tablero/escena/objeto/imagen/niebla |
| 3 | Contraseñas: `server/auth.js` (`hashPassword`, `verifyPassword`) | `test/auth.test.js`: hash distinto por sal, verifica bien/mal, formato |
| 4 | `server/app.js` asíncrono + rutas `register`/`login`; cerrojo en `flush` | `test/api.test.js`: criterios de registro/login/me/logout; tablero persiste tras `closeBoards()` |
| 5 | Frontend de login: nombre + contraseña, alternar registro | Manual en navegador + test de que `index.html` contiene los campos |
| 6 | Dockerfile, `docker-compose.yml`, `docker-compose.override.yml`, `.env.example` | `docker compose up -d --build`; `curl localhost:3000` 200 |
| 7 | Prueba e2e de tiempo real `test/e2e/realtime.mjs` contra el contenedor: 2 WS, broadcast, restart, persistencia | Salida del script con `OK` en cada paso |
| 8 | Docs `docs/00..07`, `CLAUDE.md`, `README.md`, eslint | pipeline N1 verde |
