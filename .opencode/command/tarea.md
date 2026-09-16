---
description: Ejecuta la tarea N de un plan con el flujo implementador → revisor → correcciones. Uso — /tarea <ruta-del-plan> <N>
---
Plan: `$1` · Tarea: `$2`

1. Extrae el texto íntegro de la sección `### Task $2` del plan (hasta la siguiente `### Task` o
   `## `) y guárdalo en `.superpowers/sdd/<nombre-del-plan>/task-$2-brief.md` (crea la carpeta;
   está gitignorada). Anota `BASE=$(git rev-parse --short HEAD)`.
2. Lanza el subagente **implementador** con: una línea de contexto (qué fase, qué hay hecho),
   la ruta del brief («léelo primero; son tus requisitos, con los valores exactos»), las interfaces
   de tareas anteriores que el brief no conoce, y la ruta del informe
   `.superpowers/sdd/<plan>/task-$2-report.md`. Espera su respuesta corta.
3. Si responde NEEDS_CONTEXT o BLOCKED: resuélvelo (más contexto, o decide y anota la decisión en
   `.superpowers/sdd/<plan>/progress.md` como `Ruling: …`) y relanza.
4. Genera el paquete de revisión:
   `git log --oneline BASE..HEAD; git diff --stat BASE..HEAD; git diff -U10 BASE..HEAD` en
   `.superpowers/sdd/<plan>/review-BASE..HEAD.diff`.
5. Lanza el subagente **revisor** con brief, informe, ruta del diff y las «Global Constraints» del
   plan copiadas tal cual.
6. Críticos/Importantes → vuelve al implementador con los hallazgos literales; pide informe de
   corrección; repite la revisión sólo sobre el diff de la corrección. Máximo 5 rondas; si no
   converge, decide tú y anótalo como Ruling. Menores → anótalos en `progress.md` como
   `Task $2: minor (deferred): …`.
7. Anota `Task $2: complete (commits BASE..HEAD, review clean)` en `progress.md` y marca las
   casillas de la tarea en el plan.

No corrijas tú el código: siempre a través del implementador, para que la revisión no se salte.
