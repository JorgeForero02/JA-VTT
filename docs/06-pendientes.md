# 06 — Pendientes

Actualizado: 2026-09-17 (cierre de la fase C). Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

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
| P-09 | **P1** | **Modo 2.5D**: fases A, B y C cerradas y auditadas (2026-09-17); seguir con D (panel completo, editor de ficha con *Aspecto*, luces desde el mapa y colgadas, cono de la linterna sorda, tamaño de ficha, arte propio, 4 estilos) y E (agua, explosiones, cierre). Antes de cada fase, guía tarea a tarea al nivel de las de C (ver [08](08-traspaso-opencode.md)). Rama `modo-25d-fase-a`, **pendiente de merge a `main` y despliegue** (decisión del usuario) | Cada fase: `check` y `test:ui` verdes, docs 01–07 al día, desplegado |
| P-11 | P2 | Visión en 2D: un jugador sin fichas propias con *Visión compartida* apagada ve por las fichas de todo el grupo (`core.js viewers()` cae de vuelta al grupo). El 2.5D lo deja ciego, que es lo que promete el ajuste. Decidir si el 2D se alinea | Test en `frontend.test.js` o `test:ui` y ambos modos iguales |
| P-12 | P2 | Flakiness de `test:ui` con dos páginas WebGL en swiftshader: el montaje del motor a veces pasa de 15 s y `npm run check` cae de vez en cuando en tests con tiempos (P-10). Subir esperas a `D3.isMounted()` en vez de al canvas visible; valorar `--test-concurrency` y tiempos en `mesa.test.js` | Cinco ejecuciones seguidas verdes |
| P-10 | P2 | Menores diferidos de la fase A: `.tag` con `var(--amber-ink)`; `img/packs25.png` relativo a la página; tests con tiempos ajustados fallan a veces si la CPU está ocupada (visto 3 veces; siempre verde al repetir); `undoBoom` perdido en el port (se vuelve a portar en la fase E) | Revisión final de la rama |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
