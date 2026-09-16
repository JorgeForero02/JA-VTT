# 00 — Índice maestro · Just Another VTT

**Leer PRIMERO en cada sesión, junto con [06-pendientes](06-pendientes.md).**
Última actualización: 2026-09-16.

## Resumen en 30 segundos

Mesa virtual de rol (VTT) para un grupo pequeño: iluminación dinámica, muros, niebla de
guerra, varias escenas por tablero unidas por portales, tiempo real por WebSocket. Nació como
"Mini VTT" (SQLite, sin contraseña, sólo LAN); el 2026-09-15 se convirtió en proyecto
desplegable: **Node 22 + PostgreSQL 16 + Docker Compose**, login con contraseña, registro
abierto. Casi privado: sin rate-limit ni 2FA a propósito.

Estado: **en producción en https://tablero.supportive.pro** (Coolify, vps1new) desde el 2026-09-16.

Tamaño real (2026-09-15): servidor ~1366 líneas (5 archivos) · cliente ~2269 líneas
(scripts clásicos sin framework) · 1 dependencia de producción (`pg`).

Estado de calidad verificado el 2026-09-15: `npm run lint` limpio · `npm test` →
**32 tests, 0 fallos** (contra un Postgres real) · `npm run test:e2e` → **11/11** contra la pila
de compose, incluido reinicio del contenedor.

Trabajo en curso: nada bloqueante — ver [06-pendientes.md](06-pendientes.md).

## Mapa de la documentación

| Archivo | Rol | Cuándo se toca |
|---|---|---|
| [00-INDEX.md](00-INDEX.md) | Este índice | Cuando cambia la estructura de docs |
| [01-arquitectura.md](01-arquitectura.md) | Stack, capas, modelo de datos, tiempo real, decisiones | Cuando cambia una decisión técnica |
| [02-funcional.md](02-funcional.md) | Qué hace el sistema: roles, cuentas, tableros, escenas | Cuando cambia el comportamiento visible |
| [03-despliegue.md](03-despliegue.md) | Docker, compose, Coolify, variables, backups | Cuando cambia cómo se ejecuta |
| [04-convenciones.md](04-convenciones.md) | **Reglas de código y documentación (obligatorias)** | Casi nunca |
| [05-runbook.md](05-runbook.md) | Comandos, tests, gotchas | Cuando cambia un comando |
| [06-pendientes.md](06-pendientes.md) | **Tareas abiertas** | En cada sesión |
| [07-historial.md](07-historial.md) | **Changelog**: qué, por qué, cómo revertir | Tras cada cambio relevante |

### Subcarpetas

| Carpeta | Contenido |
|---|---|
| `superpowers/specs/` | Diseño por feature |
| `superpowers/plans/` | Plan de implementación por feature |
| `_archivo/` | Fotos históricas congeladas. **No editar** |

### Fuera de `docs/`

| Archivo | Rol |
|---|---|
| `CLAUDE.md` / `AGENTS.md` (raíz) | Contrato de arranque: reglas duras + punteros |
| `README.md` | Manual de uso para quien juega |
| `~/.claude/dev-rules.md` · `~/.claude/docs-protocol.md` | Reglas globales del PC |

## Regla de oro

**Un hecho vive en un solo sitio.** Estado (`01`–`05`) ≠ historial (`07`) ≠ pendientes (`06`).

> **Números vacantes:** ninguno.
