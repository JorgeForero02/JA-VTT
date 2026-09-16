---
description: Ejecuta la tarea N de un plan SIN commitear (la revisión y el commit se hacen aparte). Uso — /tarea <ruta-del-plan> <N>
---
Plan: `$1` · Tarea: `$2`

Comprueba primero que el árbol está limpio (`git status --short` vacío). Si no, para y avisa: hay
una tarea anterior sin revisar.

1. Extrae el texto íntegro de la sección `### Task $2` del plan (hasta la siguiente `### Task` o
   `## `) y guárdalo en `.superpowers/sdd/<nombre-del-plan>/task-$2-brief.md` (crea la carpeta;
   está gitignorada).
2. Lanza el subagente **implementador** con: una línea de contexto (qué fase, qué hay hecho según
   `docs/08-traspaso-opencode.md`), la ruta del brief («léelo primero; son tus requisitos, con los
   valores exactos»), las interfaces de tareas anteriores que el brief no conoce, y la ruta del
   informe `.superpowers/sdd/<plan>/task-$2-report.md`.
3. Si responde NEEDS_CONTEXT o BLOCKED: resuélvelo con más contexto o decide tú y anota la decisión
   en `.superpowers/sdd/<plan>/progress.md` como `Ruling: …`; relanza.
4. Cuando responda DONE: **no commitees, no revises con otro agente**. Muestra `git status --short`,
   `git diff --stat` y el resumen del implementador, y termina con:
   «Tarea $2 lista para revisión externa. Informe en <ruta>.»

Nada de `git add`, `git commit`, `git stash`, `git checkout` ni `git reset` en todo el proceso.
