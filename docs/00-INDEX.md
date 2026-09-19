# 00 — Índice maestro · Just Another VTT

**Leer PRIMERO en cada sesión, junto con [06-pendientes](06-pendientes.md).**
Última actualización: 2026-09-18.

## Resumen en 30 segundos

Mesa virtual de rol (VTT) para un grupo pequeño: iluminación dinámica, muros, niebla de
guerra, varias escenas por tablero unidas por portales, tiempo real por WebSocket. Nació como
"Mini VTT" (SQLite, sin contraseña, sólo LAN); el 2026-09-15 se convirtió en proyecto
desplegable: **Node 22 + PostgreSQL 16 + Docker Compose**, login con contraseña, registro
abierto. Casi privado: sin rate-limit ni 2FA a propósito.

Estado: **en producción en https://tablero.supportive.pro** (Coolify, vps1new) desde el 2026-09-16 —
**producción sirve la rama `prod-2d` (`a1fa6ef` = `34a7ba4` + clima 2D, desplegado el 2026-09-18);
`main` lleva además el modo 2.5D (fases A–D) y no se despliega hasta cerrar la fase E.** El clima
sobre `main` está en la rama `clima-2d` (pendiente de mergear).

Tamaño real (2026-09-17, rama `modo-25d-fase-a`): servidor ~2300 líneas · cliente ~3100 líneas + `dice3d.js` + motor 2.5D en `public/js/d3/` (14 módulos ES, ~2800 líneas)
+ `dice3d.js` (módulo ES) · 1 dependencia de producción (`pg`); three.js y cannon-es vendorizados.

Estado de calidad verificado el 2026-09-17 (rama `modo-25d-fase-a`): `npm run lint` limpio · `npm test` →
**127 tests, 0 fallos** (contra un Postgres real) · `npm run test:e2e` → 10/10 contra producción
· `npm run test:ui` (Playwright + Edge, GPU por software) → **55/55** con capturas.

Funciones (2026-09-16): cuentas con contraseña y código de recuperación · tableros, escenas y
portales · luz dinámica (6 tipos de muro, maleza, visión en la oscuridad absoluta) · niebla por
jugador · chat con dados 3D (bandeja, tiradas privadas del director) · iniciativa con
interruptor del director · render adaptativo con lectura de rendimiento en Mesa → Conexión.

Trabajo en curso: **modo 2.5D** — rama `modo-25d-fase-a`; **fases A–D cerradas** (2026-09-18: terreno
persistente y editable; fichas y luces como sprites; mover fichas; ver como; niebla por celda; panel
«Mapa 2.5D» con 4 estilos; luces colgadas y menú contextual; arte propio desde la Biblioteca; aspecto de
ficha). Fase D con subagentes Claude (implementador + revisor por tarea + revisión final). Sigue la
fase E (agua, explosiones, cierre). Mergeado en `main` y en `origin`; **sin desplegar** (se despliega con E). Punto de entrada:
[08-traspaso-opencode.md](08-traspaso-opencode.md).
Resto: [06-pendientes.md](06-pendientes.md).

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
| [08-traspaso-opencode.md](08-traspaso-opencode.md) | **Traspaso del modo 2.5D**: estado exacto, decisiones, cómo seguir con OpenCode, qué instalar | Mientras dure el modo 2.5D (fase E); después se archiva |

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

> **Números vacantes:** ninguno (08 es temporal: se archiva al cerrar el modo 2.5D).
