# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-15 — Nace Just Another VTT a partir de Mini VTT

**Qué**
- Repo git nuevo (`main`); commit inicial con el código original como línea base.
- Renombrado completo: paquete, UI, cookie (`jav_session`), localStorage (`jav.*`).
- SQLite → **PostgreSQL** (`pg`), migraciones SQL, todas las consultas asíncronas.
- **Login con contraseña** (scrypt); registro abierto; añadir miembro por nombre exige cuenta.
- `app.js` reescrito asíncrono: cola por tablero, cerrojo de volcado, cierre ordenado.
- Dockerfile + `docker-compose.yml` (Coolify) + override local; `.env.example`.
- Tests: 32 con `node:test` (db, auth, API, tiempo real, frontend) + e2e de 11 pasos.
- Docs 00–07, `CLAUDE.md`, `AGENTS.md`, README actualizado. Se retiran `iniciar.bat/sh`.

**Por qué** — el usuario quiere desplegarlo en vps1new con persistencia fiable y un login
mínimo; SQLite en un volumen y cuentas sin contraseña no servían.

**Cómo revertir** — el commit `chore: import Mini VTT source as baseline` es el original
funcional con SQLite. No hay migración de datos entre ambos (la base pg nace vacía).

**Evidencia** — `npm run check` 32/32 · `npm run test:e2e` 11/11 con `docker compose restart app`
· `down`+`up` conserva 2 usuarios, 1 tablero, 1 objeto.
