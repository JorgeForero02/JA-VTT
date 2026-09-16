---
description: Cierre de un cambio o fase — estado en docs 01–05, pendientes en 06, historial en 07, comprobaciones verdes.
---
Sigue `~/.claude/docs-protocol.md` (si no existe, `docs/04-convenciones.md` parte de documentación):

1. `npm run check` y, si hubo cambios de cliente, `npm run test:ui` (servidor en 3999 con la base
   `jav_ui`, ver `docs/05-runbook.md`). Pega los conteos reales.
2. Actualiza el **estado** en `docs/01`–`05` (un hecho en un solo sitio), los **pendientes** en
   `docs/06` y añade la entrada del día en `docs/07-historial.md` (qué · por qué · cómo revertir).
3. Si `docs/08-traspaso-opencode.md` describe algo que ya no es cierto, corrígelo; si la fase A ha
   terminado, mueve su contenido de estado a 01–07 y archívalo en `docs/_archivo/`.
4. Commit `docs: cierre …` con la lista de lo verificado.
