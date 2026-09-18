# 06 — Pendientes

Actualizado: 2026-09-18 (cierre de la fase D). Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-02 | — | (cerrado 2026-09-16: `npm run test:ui` con Playwright + Edge cubre login, chat, dados, iniciativa, perfil) Comprobación visual del login (Entrar / Crear cuenta) en navegador; la extensión de Chrome no conectaba | Captura o confirmación del usuario |
| P-04 | P2 | Subir el pipeline a N2/N3: cobertura con umbral y mutación automatizada | Comandos en [04](04-convenciones.md) Parte C |
| P-05 | P2 | Cambiar contraseña desde la UI (hoy no existe) | Test de API + pantalla |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |

Cerrados el 2026-09-16: P-01 (desplegado, ver [03](03-despliegue.md)); P-03 (el usuario decidió
que esta base no entra en el backup).

## Hallazgo ajeno a este repo (avisado al usuario el 2026-09-16)

El backup diario de vps1new escribe `dnd-pg.sql.gz` de **20 bytes** (vacío) y lo registra como OK:
el bloque de `dnd` en `/root/scripts/backup-coolify.sh` perdió las comillas
(`sh -c PGPASSWORD= pg_dumpall -U`). **La base de la plataforma D&D no tiene copia real.** Se
arregla en el servidor, no aquí.

| P-07 | P2 | El pulso de luz aún se percibe «un poco» a saltos (usuario, 2026-09-16, con 60 Hz, 0,2 ms/frame y dithering ±1). Siguiente vuelta: dithering ±2 niveles o ruido temporal; medir con capturas consecutivas | El usuario lo da por fluido |
| P-09 | **P1** | **Modo 2.5D**: fases A–D cerradas (2026-09-18); sigue E (agua y explosiones sincronizadas, cono de la linterna sorda, tamaño de ficha >1, cascada en servidor al quitar `newobj`/`newchar`, cierre y archivo de 08). Rama `modo-25d-fase-a`, **pendiente de merge a `main` y despliegue** (decisión del usuario) | `check` y `test:ui` verdes, docs 01–07 al día, desplegado |
| P-11 | P2 | Visión en 2D: un jugador sin fichas propias con *Visión compartida* apagada ve por las fichas de todo el grupo (`core.js viewers()` cae de vuelta al grupo). El 2.5D lo deja ciego, que es lo que promete el ajuste. Decidir si el 2D se alinea | Test en `frontend.test.js` o `test:ui` y ambos modos iguales |
| P-12 | P2 | Flakiness: `test:ui` ya espera 40/60 s y a `D3.isMounted()` (2026-09-17), pero con el navegador del usuario abierto en 2.5D sigue yendo justo; `npm run check` cae de vez en cuando en tests con tiempos (P-10). Valorar `--test-concurrency` y tiempos en `mesa.test.js` | Cinco ejecuciones seguidas verdes |
| P-10 | P2 | Menores diferidos de la fase A: `.tag` con `var(--amber-ink)`; `img/packs25.png` relativo a la página; tests con tiempos ajustados fallan a veces si la CPU está ocupada (visto 3 veces; siempre verde al repetir); `undoBoom` perdido en el port (se vuelve a portar en la fase E) | Revisión final de la rama |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
| P-13 | P2 | Deuda de la fase D (menores triados en la revisión final, ninguno bloquea): el servidor no borra `obj:`/`char:` asociados al quitar `newobj`/`newchar` (huérfanos que cuentan para el tope de 200; el cliente los borra en cascada); `refreshCustomArt` restila dos veces en `loadTerrain`; el cliente no comprueba `version` en ops remotas (viene de B; hoy `applyRemoteOp` devuelve `false` al lanzar y pide `full`); slider de evaporación tope 0,01 frente a 0,05 del servidor | Cada punto con su test o cerrado con evidencia |
