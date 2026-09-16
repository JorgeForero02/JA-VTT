# 06 — Pendientes

Actualizado: 2026-09-16. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-02 | P1 | Comprobación visual del login (Entrar / Crear cuenta) en navegador; la extensión de Chrome no conectaba | Captura o confirmación del usuario |
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
