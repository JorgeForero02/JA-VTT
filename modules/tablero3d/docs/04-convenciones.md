# 04 — Convenciones (obligatorias)

Las mismas que Just Another VTT (su `docs/04-convenciones.md`), con las diferencias propias del
tablero 3D anotadas.

# Parte A — Documentación

**ANTES** de tocar nada: [00-INDEX](00-INDEX.md) y [06-pendientes](06-pendientes.md).
Feature nueva: spec en `superpowers/specs/AAAA-MM-DD-<slug>-design.md`, luego plan en
`superpowers/plans/`, una tarea = un commit; se anota en el índice
[`superpowers/README.md`](superpowers/README.md).
**DESPUÉS**: estado en `01`–`05` (y en `modules/tablero3d/README.md` si cambia algo interno del
módulo: interfaz, documentos, cliente, motor) · entrada en [07-historial](07-historial.md) (qué · por
qué · cómo revertir) · [06](06-pendientes.md) al día · comandos nuevos a [05](05-runbook.md) · si
cambia lo que JA-VTT tiene que añadir, [08](08-integracion-ja-vtt.md) y `npm run test:ja-vtt`.

Prohibido: estado de sesión en `CLAUDE.md`/`AGENTS.md` · duplicar bloques entre ambos ·
enlazar docs inexistentes · editar `_archivo/` · cerrar un pendiente sin evidencia · renumerar
documentos · enlaces desde `modules/tablero3d/README.md` a fuera de `modules/tablero3d/` (se rompen al
copiar el módulo en JA-VTT: las rutas de este repo se citan en texto).

# Parte B — Código

## B.1 Innegociables

- **Todo el SQL del núcleo vive en `server/db.js` y todo el del tablero 3D en
  `modules/tablero3d/db.js`** (esquema `t3d`). Ninguna otra capa importa `pg` ni escribe consultas.
- **Cambios de esquema = nueva migración** `server/migrations/NNN-nombre.sql` (núcleo) o
  `modules/tablero3d/migrations/NNN-nombre.sql` (módulo). Nunca editar una ya aplicada en un despliegue.
- **Reglas de negocio en `server/rules.js`, `server/auth.js` y `modules/tablero3d/rules.js`**, no
  en rutas ni en el cliente.
- Dependencias de producción del servidor: sólo `pg`. En el cliente, three.js r128 vendorizado
  (`modules/tablero3d/public/vendor`); nada por CDN (lo comprueba `test/frontend.test.js`). Añadir
  otra es decisión explícita.
- **Interfaz: el sistema visual de Just Another VTT** (tokens de color, Alegreya, Lucide,
  cabecera, raíl, panel con pestañas y secciones plegables). Un componente nuevo se construye
  con esas piezas antes que con estilos propios.
- Secretos sólo por variables de entorno. `.env` no se commitea.
- El cliente son scripts clásicos compartiendo ámbito global; el módulo 3D va entero dentro de
  funciones y sólo expone `Tablero3D` (ids y clases con prefijo `t3d-`, estilos bajo `.t3d-root`;
  ver el [README del módulo](../modules/tablero3d/README.md#aislamiento-prefijo-t3d-)). No introducir
  módulos ES ni bundler sin decisión explícita.
- Textos de usuario (errores de API, UI) en castellano.
- Estilo: `'use strict'`, comillas simples, punto y coma, 2 espacios en el servidor;
  el cliente conserva su estilo compacto. Comentarios sólo para decisiones no obvias.
- **No fusionar con Just Another VTT**: se copia su forma, no su código de dominio (luces 2D,
  muros, escenas por objetos). `auth.js` y `ws.js` son copias idénticas a propósito.

## B.2 Flujo por cambio

1. Test que falla → implementación → verde. Cada test se rompe una vez a propósito (mutación
   manual) para comprobar que muerde.
2. `npm run check` verde antes de commitear; `npm run test:ui` si se toca el cliente.
3. Commits chicos, Conventional Commits (`feat(server): …`, `fix(cliente): …`, `docs: …`).
4. Feature sin frontend = pendiente, no entregada.

# Parte C — Pipeline

**Nivel declarado: N2** (cobertura con umbral). N3 (mutación automatizada) es P-04.

| Paso | Comando | Estado |
|---|---|---|
| Sintaxis + lint | `npm run lint` (eslint flat config; en el cliente sólo sintaxis) | obligatorio |
| Formato | — (estilo manual; sin prettier) | ver excepción |
| Unitarios + integración + contratos del cliente | `npm test` (necesita Postgres en `TEST_DATABASE_URL`) | obligatorio |
| Cobertura con umbral | incluida en `npm test` (`server/**` y `modules/**/*.js` sin `public/`: líneas ≥ 90 %, ramas ≥ 82 %, funciones ≥ 90 %) | obligatorio |
| E2E tiempo real | `npm run test:e2e` con la pila levantada | obligatorio antes de desplegar |
| E2E visual | `npm run test:ui` (Playwright, servidor local) | obligatorio cuando se toca el cliente |
| Humo en Just Another VTT | `npm run test:ja-vtt` contra una copia de JA-VTT con [08](08-integracion-ja-vtt.md) aplicada | obligatorio cuando cambia la integración (rutas, WS, `mount`, iconos, CSS o la guía) |
| Mutación automatizada | — | N3, pendiente P-04 |

## Excepciones declaradas

Heredadas de Just Another VTT con el núcleo:

| Regla global | Excepción | Motivo |
|---|---|---|
| Formateador aplicado | No hay prettier; eslint sin reglas de formato | Estilo compacto propio en el cliente y en el motor; reformatearlo entero enmascararía el diff |
| Type-check | No hay TypeScript ni JSDoc checkeado | JS plano; eslint cubre errores de referencia en servidor; el cliente se prueba por contrato (`test/frontend.test.js`) y con `test:ui` |
| Rate-limit / seguridad de login | Sin límite de intentos ni 2FA | Igual que JA-VTT (decisión del usuario allí: proyecto casi privado) |
| Secretos nunca en claro | `users.recovery_code` se guarda en claro | Mismo núcleo que JA-VTT (decisión del usuario allí: verlo en el perfil cuando quiera) |
