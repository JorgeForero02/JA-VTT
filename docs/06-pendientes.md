# 06 — Pendientes

Actualizado: 2026-09-17. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

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
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
