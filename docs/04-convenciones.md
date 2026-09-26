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
  Excepción declarada: el SQL del tablero 3D vive en `modules/tablero3d/db.js`, siempre sobre el
  esquema `t3d` (usa el pool del núcleo; nunca escribe en tablas de `public` salvo por las funciones
  que le pasa `server/app.js`).
- **Cambios de esquema = nueva migración** `server/migrations/NNN-nombre.sql` (núcleo) o
  `modules/tablero3d/migrations/NNN-nombre.sql` (esquema `t3d`). Nunca editar una ya aplicada.
- **Reglas de negocio en `server/rules.js` y `server/auth.js`** (en el 3D, `modules/tablero3d/rules.js`),
  no en rutas ni en el cliente.
- Dependencias de producción del servidor: sólo `pg`. En el cliente, three.js y cannon-es
  vendorizados (`public/js/vendor`) para los dados 3D, y three.js r128 en
  `modules/tablero3d/public/vendor` para el tablero 3D; nada por CDN. Añadir otra es decisión explícita.
- Secretos sólo por variables de entorno. `.env` no se commitea.
- El cliente son scripts clásicos compartiendo ámbito global: no introducir módulos ES ni
  bundler sin decisión explícita.
- Textos de usuario (errores de API, UI) en castellano.
- Estilo: `'use strict'`, comillas simples, punto y coma, 2 espacios, comentarios sólo para
  decisiones no obvias.

## B.1b Tablero 3D (`modules/tablero3d`)

- **Desde el 2026-09-26 el módulo se mantiene en este repositorio** (decisión del usuario). Antes se
  copiaba tal cual desde `3d-tablero` sin tocarlo; esa regla de su guía (`modules/tablero3d/docs/08`)
  ya no aplica. `3d-tablero` queda como histórico.
- Se sigue manteniendo como módulo: su servidor sólo se conecta al núcleo por `createTablero3D(host)`
  y su cliente por `Tablero3D.mount` (interfaz en `modules/tablero3d/README.md`). Las líneas de
  JA-VTT que lo montan van marcadas `// t3d` (o `t3d:`), para poder encontrarlas y quitarlas.
- Su cliente no depende de globales de JA-VTT salvo los que recibe al montar (`icon`, `showTab`…) y
  `ICONS`; sus preferencias van en `localStorage` con claves `tablero:*` y `t3d-*`.
- Cambios de su cliente: `npm run test:ui` **y** `npm run test:t3d` verdes antes de desplegar.
- Documentación de cómo se construyó y hoja de ruta: `modules/tablero3d/docs/` (no se reescribe; lo
  vigente va en estos `docs/`).
- **Método por fase** (hoja de ruta del arte propio, decisión del usuario del 2026-09-26): cada fase pasa
  por **4 pasos** antes de programar: (1) **investigar a fondo** —inventario del código que se toca y cómo
  lo resuelven otros, con fuentes—, (2) catálogo de lo que hay que cubrir, (3) enfoques con recomendación,
  (4) diseño por partes aprobado → spec en `superpowers/specs/` → plan en `superpowers/plans/`. Todo
  queda escrito; las decisiones del usuario, una a una y anotadas en la spec.
- **Archivos de tests**: un archivo de tests que pasa de **~800 líneas** se parte por área (p. ej.
  `frontend.test.js` → muros, luz, fichas…) en el siguiente cambio que lo toque. `test/t3d/frontend.test.js`
  ya lo supera y se deja así por ahora (decisión de la ola final de la fase 0: partirlo sería sólo estilo);
  la regla vale desde aquí.

## B.2 Ramas

| Rama | Qué es |
|---|---|
| `main` | **Rama única y estable**: lo que está en producción y lo que ve quien visita el repo. Coolify despliega desde aquí |

- Un **hotfix** se hace directamente en `main`.
- Trabajo grande: rama corta desde `main`, un commit por punto, merge a `main` sólo con
  `check` y `test:ui` verdes, y la rama se borra tras el merge.

## B.3 Flujo por cambio

1. Test que falla → implementación → verde. Cada test se rompe una vez a propósito
   (mutación manual) para comprobar que muerde.
2. `npm run check` verde antes de commitear.
3. Commits chicos, Conventional Commits (`feat(db): …`, `fix(ws): …`, `docs: …`).
4. Feature sin frontend = pendiente, no entregada.

# Parte C — Pipeline

**Nivel declarado: N2** (cobertura con umbral desde el 2026-09-19).

| Paso | Comando | Estado |
|---|---|---|
| Sintaxis | incluido en `npm run lint` | obligatorio |
| Lint | `npm run lint` (eslint flat config) | obligatorio |
| Formato | — (estilo manual; sin prettier) | ver excepción |
| Unitarios + integración | `npm test` (necesita Postgres en `TEST_DATABASE_URL`) | obligatorio |
| E2E tiempo real | `npm run test:e2e` con la pila levantada | obligatorio antes de desplegar |
| E2E visual | `npm run test:ui` (Playwright + Edge/Chrome del PC, servidor local en 3999) | obligatorio cuando se toca el cliente |
| Cobertura con umbral | incluida en `npm test` (`server/**`: líneas ≥ 78 %, ramas ≥ 72 %, funciones ≥ 82 %; baseline 80/75/84 el 2026-09-19) | obligatorio |
| Mutación automatizada | — | N3, pendiente P-04 |

## Excepciones declaradas

| Regla global | Excepción | Motivo |
|---|---|---|
| Formateador aplicado | No hay prettier; eslint sin reglas de formato | Código heredado con estilo compacto propio; reformatearlo entero enmascararía el diff. Se mantiene a mano |
| Type-check | No hay TypeScript ni JSDoc checkeado | Proyecto pequeño, JS plano; eslint cubre errores de referencia en servidor |
| Rate-limit / seguridad de login | Sin límite de intentos ni 2FA | Decisión del usuario: proyecto casi privado |
| Secretos nunca en claro | `users.recovery_code` se guarda en claro | Decisión del usuario (2026-09-16): quiere verlo en su perfil cuando quiera. Quien lea la base puede entrar en cualquier cuenta: aceptado para un grupo privado |
