# 06 — Pendientes

Actualizado: 2026-09-19. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-04 | P2 | Subir el pipeline a **N3**: mutación automatizada (N2 —cobertura con umbral— cerrado el 2026-09-19) | Comando en [04](04-convenciones.md) Parte C |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |
| P-07 | P2 | El pulso de luz aún se percibe «un poco» a saltos (usuario, 2026-09-16, con 60 Hz, 0,2 ms/frame y dithering ±1). Siguiente vuelta: dithering ±2 niveles o ruido temporal; medir con capturas consecutivas | El usuario lo da por fluido |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
| P-22 | P2 | Regla de medición multitramo (waypoints con clic / espacio durante el arrastre de `ruler`). Spec: [specs/2026-09-19-condiciones-srd-y-tactica-design.md](superpowers/specs/2026-09-19-condiciones-srd-y-tactica-design.md) §4 · plan B pendiente de escribir | Medición compuesta en `npm run test:ui` |
| P-23 | P2 | Etiquetas / pines de texto en el mapa con `gmOnly`. Spec §5 · plan B | Test en `rules.test.js` y `npm run test:ui` |
| P-24 | P2 | Audio ambiental por escena y SFX (dados, puertas). Spec §6 · plan C | Prueba en navegador con sonido |

Cerrados: P-01, P-02, P-03 (2026-09-16); **P-05** el 2026-09-19 (ya existía `#passwordForm` en
`index.html` + `POST /api/me/password` con test en `mesa.test.js`: estaba hecho y sin cerrar);
**P-04 nivel N2** el 2026-09-19 (queda N3 con el mismo ID);
**P-19, P-20, P-21** el 2026-09-19 (plan A; evidencia: tests de rules/realtime/frontend y capturas 08/09 de test:ui).

## Hallazgo ajeno a este repo (avisado al usuario el 2026-09-16)

El backup diario de vps1new escribe `dnd-pg.sql.gz` de **20 bytes** (vacío) y lo registra como OK:
el bloque de `dnd` en `/root/scripts/backup-coolify.sh` perdió las comillas
(`sh -c PGPASSWORD= pg_dumpall -U`). **La base de la plataforma D&D no tiene copia real.** Se
arregla en el servidor, no aquí.
