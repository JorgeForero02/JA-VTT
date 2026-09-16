# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-16 — Producción en https://tablero.supportive.pro

**Qué** — repo privado `JorgeForero02/JA-VTT`; app Coolify `ja-vtt` (uuid
`d6qlm5kzdoitlacr5br29fna`, proyecto D&D) desde `docker-compose.yml`, dominio
`tablero.supportive.pro` (antes PlanarAlly, borrado por el usuario; quedan sus tres volúmenes
`aloj51hvldbfcmvbxfkumfpq_planarally-*` sin uso). Detalle en [03](03-despliegue.md).
**Por qué** — pedido del usuario tras aprobar la prueba local.
**Evidencia** — 200 y certificado desde dentro; e2e 10/10 por WSS; restart por API sin perder
filas (3 usuarios, 2 tableros, 75 objetos). Cuentas `gm-mu3ck9p7`/`pl-mu3ck9p7` del e2e quedan
en la base (borrado remoto bloqueado por el clasificador); borrar con
`DELETE FROM users WHERE name IN ('gm-mu3ck9p7','pl-mu3ck9p7')`.
**Revertir** — `DELETE /api/v1/applications/d6qlm5kzdoitlacr5br29fna` (con volúmenes si se quiere
borrar la base) y quitar la deploy key del repo.

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

## 2026-09-15 — Botón en la cabecera para ocultar el panel derecho

**Qué** — `#panelToggle` pasa a verse siempre. En pantallas anchas pliega la columna del
panel (`#app.noPanel`) y guarda la preferencia en `localStorage` (`jav.panel`); en
estrechas sigue abriendo el panel como capa. Iconos Lucide `panel-right-open/close`.
**Por qué** — pedido del usuario: más espacio de mapa en escritorio.
**Revertir** — `git revert` del commit `feat(ui): botón para ocultar el panel lateral`.

## 2026-09-16 — Cursores suaves y guardas contra el doble clic

**Qué** — los cursores de los demás se interpolan 110 ms hacia su posición nueva (misma
técnica que las fichas, `cursorPos` en `net.js`) y se envían cada ~50 ms. `withBusy()`
(`store.js`) desactiva los botones de un formulario mientras dura la petición: entrar / crear
cuenta, crear tablero, unirse por código, añadir miembro, regenerar código; crear escena lleva
un cerrojo de 1,5 s. Sin tests nuevos por decisión del usuario (cambios visuales).
**Revertir** — `git revert` del commit.
