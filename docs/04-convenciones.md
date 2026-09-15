# 04 — Convenciones (obligatorias)

Base global: `~/.claude/dev-rules.md` (código) y `~/.claude/docs-protocol.md` (documentación).
Aquí sólo lo propio de este repo y las excepciones declaradas.

# Parte A — Documentación

**ANTES** de tocar nada: [00-INDEX](00-INDEX.md) y [06-pendientes](06-pendientes.md).
Feature nueva: spec en `superpowers/specs/AAAA-MM-DD-<slug>-design.md`, luego plan en
`superpowers/plans/`, una tarea = un commit.
**DESPUÉS**: estado en `01`–`05` · entrada en [07-historial](07-historial.md) (qué · por qué ·
cómo revertir) · [06](06-pendientes.md) al día · comandos nuevos a [05](05-runbook.md).

Prohibido: estado de sesión en `CLAUDE.md`/`AGENTS.md` · duplicar bloques entre ambos ·
enlazar docs inexistentes · editar `_archivo/` · cerrar un pendiente sin evidencia ·
renumerar documentos.

# Parte B — Código

## B.1 Innegociables

- **Todo el SQL vive en `server/db.js`.** Ninguna otra capa importa `pg` ni escribe consultas.
- **Cambios de esquema = nueva migración** `server/migrations/NNN-nombre.sql`. Nunca editar
  una ya aplicada.
- **Reglas de negocio en `server/rules.js` y `server/auth.js`**, no en rutas ni en el cliente.
- Una sola dependencia de producción (`pg`). Añadir otra es decisión explícita y documentada.
- Secretos sólo por variables de entorno. `.env` no se commitea.
- El cliente son scripts clásicos compartiendo ámbito global: no introducir módulos ES ni
  bundler sin decisión explícita.
- Textos de usuario (errores de API, UI) en castellano.
- Estilo: `'use strict'`, comillas simples, punto y coma, 2 espacios, comentarios sólo para
  decisiones no obvias.

## B.2 Flujo por cambio

1. Test que falla → implementación → verde. Cada test se rompe una vez a propósito
   (mutación manual) para comprobar que muerde.
2. `npm run check` verde antes de commitear.
3. Commits chicos, Conventional Commits (`feat(db): …`, `fix(ws): …`, `docs: …`).
4. Feature sin frontend = pendiente, no entregada.

# Parte C — Pipeline

**Nivel declarado: N1.**

| Paso | Comando | Estado |
|---|---|---|
| Sintaxis | incluido en `npm run lint` | obligatorio |
| Lint | `npm run lint` (eslint flat config) | obligatorio |
| Formato | — (estilo manual; sin prettier) | ver excepción |
| Unitarios + integración | `npm test` (necesita Postgres en `TEST_DATABASE_URL`) | obligatorio |
| E2E tiempo real | `npm run test:e2e` con la pila levantada | obligatorio antes de desplegar |
| Cobertura con umbral | — | N2, pendiente P-04 |
| Mutación automatizada | — | N3, pendiente P-04 |

## Excepciones declaradas

| Regla global | Excepción | Motivo |
|---|---|---|
| Formateador aplicado | No hay prettier; eslint sin reglas de formato | Código heredado con estilo compacto propio; reformatearlo entero enmascararía el diff. Se mantiene a mano |
| Type-check | No hay TypeScript ni JSDoc checkeado | Proyecto pequeño, JS plano; eslint cubre errores de referencia en servidor |
| Rate-limit / seguridad de login | Sin límite de intentos ni 2FA | Decisión del usuario: proyecto casi privado |
