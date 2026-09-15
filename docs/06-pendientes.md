# 06 — Pendientes

Actualizado: 2026-09-15. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-01 | P0 | Usuario: subir el repo a GitHub y crear el recurso Docker Compose en Coolify (vps1new) con dominio. Procedimiento en [03](03-despliegue.md) | `curl https://DOMINIO/api/health` desde vps1new → `{"ok":true}`; `npm run test:e2e` con `BASE_URL=https://DOMINIO E2E_RESTART=no` verde |
| P-02 | P0 | Comprobación visual del login (Entrar / Crear cuenta) en navegador; la extensión de Chrome no conectaba | Captura o confirmación del usuario |
| P-03 | P1 | Añadir la base `jav` al backup diario de vps1new (`pg_dump` → `gdrive:vps1new-backups`) y probar un restore | Restore en contenedor desechable con conteos iguales |
| P-04 | P2 | Subir el pipeline a N2/N3: cobertura con umbral y mutación automatizada | Comandos en [04](04-convenciones.md) Parte C |
| P-05 | P2 | Cambiar contraseña desde la UI (hoy no existe) | Test de API + pantalla |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |
