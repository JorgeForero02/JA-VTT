# 06 — Pendientes

Actualizado: 2026-09-19. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-30 | P1 | Retirar `main`: en GitHub (Settings → Branches) poner `release` como rama por defecto, luego `git push origin --delete main` y `git branch -D main`. Lo hace el usuario | `git branch -a` sólo muestra `release` |
| P-04 | P2 | Subir el pipeline a **N3**: mutación automatizada (N2 —cobertura con umbral— cerrado el 2026-09-19) | Comando en [04](04-convenciones.md) Parte C |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |
| P-07 | P2 | El pulso de luz aún se percibe «un poco» a saltos (usuario, 2026-09-16, con 60 Hz, 0,2 ms/frame y dithering ±1). Siguiente vuelta: dithering ±2 niveles o ruido temporal; medir con capturas consecutivas | El usuario lo da por fluido |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
| P-24 | P2 | Audio ambiental por escena y SFX (dados, puertas). Spec §6 · plan C | Prueba en navegador con sonido |
| P-25 | P2 | Girar una luz (campo «Dirección (°)») en el editor no cambia su preset a «Personalizada», a diferencia de radio/color/apertura; evaluar si la dirección debe independizarse del preset o marcarlo como personalizado | Comportamiento acordado y test de editor |
| P-28 | P2 | `npm run check` falla a veces en `realtime.test.js` (`ECONNRESET` en el hook `before`, 1–3 tests) y al repetir pasa 95/95. Visto el 2026-09-21 tras ejecutar `test:ui`; el servidor de test escucha en puerto aleatorio, así que no es choque con el de 3999 | Diez `check` seguidos en verde |
| P-29 | P2 | La barra de iniciativa sobre el mapa tiene dos reglas `.initBar`/`.initEntry` distintas en `app.css`: una con colores fijos («siempre oscura sobre el mapa») y otra con variables del tema, que es la que manda. Decidir cuál es la buena y borrar la otra | Una sola copia y captura de la barra en tema claro y oscuro |
| P-26 | P2 | Pastilla de elevación pisa el primer badge en fichas de tamaño 1 (captura 08-fichas-estado.png); moverla o bajar la fila de badges | Captura de test:ui sin solape |

Cerrados: P-01, P-02, P-03 (2026-09-16); **P-05** el 2026-09-19 (ya existía `#passwordForm` en
`index.html` + `POST /api/me/password` con test en `mesa.test.js`: estaba hecho y sin cerrar);
**P-04 nivel N2** el 2026-09-19 (queda N3 con el mismo ID);
**P-19, P-20, P-21** el 2026-09-19 (plan A; evidencia: tests de rules/realtime/frontend y capturas 08/09 de test:ui);
**P-22, P-23** el 2026-09-19 (plan B; evidencia: tests en rules/realtime/frontend, pasos regla/notas en test:ui y capturas 10/11);
**P-27** el 2026-09-19 (decidido: tapada por visión; test en ui.mjs y noteVisibleToPlayers en core.js).

## Hallazgo ajeno a este repo (avisado al usuario el 2026-09-16)

El backup diario de vps1new escribe `dnd-pg.sql.gz` de **20 bytes** (vacío) y lo registra como OK:
el bloque de `dnd` en `/root/scripts/backup-coolify.sh` perdió las comillas
(`sh -c PGPASSWORD= pg_dumpall -U`). **La base de la plataforma D&D no tiene copia real.** Se
arregla en el servidor, no aquí.
