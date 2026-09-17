# 08 — Traspaso a OpenCode: modo 2.5D

Escrito el 2026-09-16; actualizado el 2026-09-16 tras completar la tarea 7. **Este archivo es el punto de
entrada para retomar el trabajo con OpenCode** (o cualquier otro agente). Cuando la fase A esté
cerrada, lo que aquí es «estado» pasa a `01`–`07` y este archivo se archiva en `_archivo/`.

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| Diseño aprobado (autoridad) | [`superpowers/specs/2026-09-16-modo-25d-design.md`](superpowers/specs/2026-09-16-modo-25d-design.md) |
| Plan fase A (tareas 1–12; **1–10 hechas**) | [`superpowers/plans/2026-09-16-modo-25d-fase-a.md`](superpowers/plans/2026-09-16-modo-25d-fase-a.md) |
| Planes fases B, C, D, E (**a nivel de tarea, sin líneas ni regexes: expandir cada uno al detalle del plan A leyendo el código real antes de empezar esa fase**) | [`…-fase-b.md`](superpowers/plans/2026-09-16-modo-25d-fase-b.md) · [`…-fase-c.md`](superpowers/plans/2026-09-16-modo-25d-fase-c.md) · [`…-fase-d.md`](superpowers/plans/2026-09-16-modo-25d-fase-d.md) · [`…-fase-e.md`](superpowers/plans/2026-09-16-modo-25d-fase-e.md) |
| Rama de trabajo | `modo-25d-fase-a` (desde `main` en `e0d0ffa`). **No está en `origin` ni desplegada**: decisión del usuario (2026-09-16) — se sigue en la rama y se despliega cuando el terreno persista (fase B). |
| Prototipo fuente (sólo lectura, gitignorado) | `diorama-jav/` — `index.html` de 2935 líneas es el original r128 del que se porta todo |
| Motor | `public/js/d3/` — 12 módulos ES (ver tabla en `01`); `index.js` crea el motor y expone `window.D3` |
| Atlas de arte CC0 | `public/img/packs25.png` (créditos en `README.md`) |
| Cómo se trabajó (briefs, informes, revisiones) | `.superpowers/sdd/2026-09-16-modo-25d-fase-a/` — gitignorado; el resumen útil está en §3 |

## 2. Estado exacto (rama `modo-25d-fase-a`, fase A cerrada, 70 tests, `test:ui` 19/19)

| Commit | Qué |
|---|---|
| `8e76e75` + `5891d04` | Servidor: `boards.settings.mode` ∈ {`2d`,`2.5d`}, fijo al crear; `R.boardSettingsPatch()` lo quita de `ops` **y de `replace`** |
| `3f8a050` | Dashboard: `<select id="newBoardMode">`, etiqueta `2.5D` en la tarjeta; `S.mode`, `is25()` |
| `31daca7` | `packs25.png`, `packmap.js`, créditos, `.gitignore` |
| `80a07ee` + `c3a5753` | Motor portado a three **r170** como módulo: sin HUD, sin `localStorage`; `ColorManagement.enabled=false` + salida lineal (look r128); luces ×π; `WebGLRenderTarget{samples:4}`; sombras suaves parcheando `ShaderChunk.lights_fragment_begin`; `stop()` seguro; dados envueltos en `withColorManagement` |
| `383e1ae` + `a8d6aa2` | Shell: `syncStageMode()` monta/desmonta; canvas 2D ocultos; handlers 2D gateados con `is25()`; rail sólo Seleccionar/Desplazar; subbar con girar; `D3.setEnv` local y remoto; `#blindNote`/`#status` limpios |
| tarea 7 (commit «refactor(2.5d): estado del mundo en ctx.js») | Tarea 7: estado compartido en `ctx.js` (`G/S/R/U`), variables mutables del motor migradas, tests de T4/T7 ajustados, `npm run check` 70/70, `npm run test:ui` 19/19 |

Verificado en Edge headless (swiftshader): el valle renderiza dentro del shell; volver a un tablero
2D restaura el 2D sin errores de consola (salvo el 401 esperado de `/api/me` sin sesión).

**Limitaciones de la fase A (por diseño):** sin fichas, luces, edición ni niebla por jugador; vista
= director para todos; terreno = escena de muestra «Valle del arroyo» del diorama (no persiste).

### Fase A cerrada — qué sigue

1. Expandir el plan B (`superpowers/plans/2026-09-16-modo-25d-fase-b.md`) al detalle del plan A leyendo el
   código ya troceado (con Claude Code: «expande el plan B»).
2. Ejecutar B tarea a tarea con el mismo flujo: OpenCode (Kimi) implementa sin commitear; Claude Code
   revisa con captura + comparación píxel a píxel y commitea. Kimi siguió bien las instrucciones en 6–10;
   GPT no sirvió para el troceo (reescribió con pérdidas): usar Kimi.

## 3. Decisiones tomadas en marcha (rulings) — revisar si algo chirría

1. Rama en el mismo directorio, no worktree (los tests necesitan `jav-test-pg` y `diorama-jav/` debe ser legible).
2. `createEngine(stage,opts)` sin espacio: manda el test del plan.
3. La inmutabilidad de `mode` se amplió a `handleReplace` (el plan sólo citaba `handleOps`; la spec dice «inmutable»).
4. **«Terreno a plena luz con entorno Interior» (fase A) no era un bug del port**, pero la explicación buena llegó en B5b: la escena de muestra traía 7 luces (antorchas, hoguera) de 20 pies de radio que iluminaban casi todo el mapa de 22 casillas. Con el terreno del servidor (sin luces hasta la fase C) «Interior» se ve oscuro con la luz de suelo del director ( .13) y «Exterior de día» iluminado: comportamiento correcto y coherente con los textos del panel. Medido: luminosidad media 103 (fase A) vs 22 (B4+) con el mismo entorno.
5. Sombras suaves: en r170 `onBeforeCompile` recibe el template **sin expandir**; el parche se aplica a `THREE.ShaderChunk.lights_fragment_begin` y se sustituye el `#include`. Hay test estático que extrae el chunk real del vendor y comprueba la regex.
6. Color: `ColorManagement.enabled=false` es global al módulo three; los dados lo reactivan sólo mientras construyen sus materiales (`withColorManagement`). Si algún día se quiere el pipeline sRGB en el 2.5D, hay que retocar colores y `outputColorSpace` a la vez.

### Menores diferidos (para la revisión final de la fase A)
- `app.css` `.tag` usa `color:#fff`; mejor `var(--amber-ink)` en tema claro.
- `engine.js`: `im.src='img/packs25.png'` es relativo a la página; falla si la app se sirve bajo una subruta.
- Un test de iniciativa dio 66/67 una vez (tiempos ajustados); 67/67 al repetir. Vigilar.

## 4. Cómo se trabajó (y cómo seguir igual con OpenCode)

Flujo por tarea (**es el que garantiza la calidad; no acortarlo**):

1. Extraer la tarea N del plan a un *brief* (texto íntegro de la tarea) y dársela a un **agente implementador** con: contexto de una línea, el brief, interfaces de tareas previas que el brief no conoce, ruta del informe. El implementador: test en rojo → código → verde → `npm run check` → commit → autorrevisión → informe corto.
2. Generar el diff de la tarea (`git diff BASE..HEAD`, con `git log --oneline` y `--stat`) a un fichero y dárselo a un **agente revisor** distinto con el brief, el informe y las restricciones globales. Verdicto: cumplimiento de la spec + calidad (Crítico / Importante / Menor).
3. Críticos e importantes → ronda de corrección con el mismo implementador → re-revisión acotada al diff de la corrección. Menores → lista diferida.
4. Registrar en un ledger: `Task N: complete (commits a..b, review clean)` y cada *ruling*.
5. Al acabar todas las tareas: revisión de toda la rama, una ola de correcciones, `finishing`: merge a `main`, despliegue, docs.

**Variante de bajo presupuesto (la elegida el 2026-09-16):** OpenCode sólo hace el paso 1 con un
modelo barato y **no commitea**; la revisión (paso 2), las correcciones y el commit los hace Claude
Code en este PC sobre el árbol de trabajo (`git diff`), una tarea por vez. Por eso `/tarea` exige
árbol limpio al empezar: si hay cambios sin revisar, primero se revisan.

En OpenCode esto se hace con **agentes primarios y subagentes** (`.opencode/agent/*.md`) y **comandos**
(`.opencode/command/*.md`). Ya están creados en este repo:

| Fichero | Uso |
|---|---|
| `opencode.json` | Reglas: `AGENTS.md` + `docs/04-convenciones.md`; formateadores desactivados (el estilo denso del cliente no debe reformatearse) |
| `.opencode/agent/implementador.md` | Subagente que ejecuta **una** tarea de un plan con TDD y commit |
| `.opencode/agent/revisor.md` | Subagente de sólo lectura que revisa un diff contra un brief |
| `.opencode/command/arranque.md` | `/arranque` — lee 00, 06, 04 y este 08, y resume el estado |
| `.opencode/command/tarea.md` | `/tarea <plan> <N>` — extrae el brief, lanza el implementador y **para sin commitear** (revisión externa) |
| `.opencode/command/cierre.md` | `/cierre` — docs 01–07, `check`, `test:ui`, entrada en 07 |

## 5. Qué hace falta instalado para trabajar con OpenCode en este PC

| Pieza | Estado / cómo |
|---|---|
| **Node ≥ 22.5** | Hay Node 24.11.1 ✔ |
| **OpenCode** | `npm i -g opencode-ai@latest` (o `winget install OpenCode.OpenCode` / `scoop install opencode` / `choco install opencode`). Comprobar: `opencode --version` |
| **Proveedor de modelo** | `opencode auth login`. Presupuesto corto: modelo barato (Kimi) para las tareas 6, 7 y 12; si la revisión externa devuelve roturas en el troceo (8–11), subir a uno más capaz sólo para esas. Se cambia con `/models` |
| **Docker Desktop** | Para `jav-test-pg` (`docker start jav-test-pg`) y la pila local. Ya está |
| **Edge o Chrome** | Playwright usa el instalado (`channel:'msedge'`). Ya está. Flags para WebGL en headless: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` |
| **git** | Ya está. Rama `modo-25d-fase-a` |
| **Base `jav_ui`** (para `test:ui`) | `docker exec jav-test-pg psql -U jav -d postgres -c "CREATE DATABASE jav_ui"` (una vez) |
| Python 3 + Pillow | **Sólo** si se añaden piezas al atlas (`diorama-jav/herramientas/empaquetar_atlas.py`; adaptar la salida a `public/img/packs25.png` + `packmap.js`) |
| Opcional: MCP Playwright | `opencode.json` → `"mcp": {"playwright": {"type":"local","command":["npx","@playwright/mcp@latest"]}}` para que el agente mire la app en un navegador real. No es necesario: los scripts de `test/e2e/` ya hacen capturas |
| Opcional: skills | OpenCode lee `SKILL.md` en `.opencode/skill/<nombre>/`. Las de Superpowers (brainstorming, writing-plans, subagent-driven-development, systematic-debugging) están en `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/` y son MIT: copiar las que se quieran |

**Primer arranque sugerido:**
```
cd C:\Users\gogam\Desktop\Trabajo\Mine\mini-vtt
git checkout modo-25d-fase-a
docker start jav-test-pg
opencode
/arranque
/tarea docs/superpowers/plans/2026-09-16-modo-25d-fase-a.md 6
```

## 6. Trampas ya encontradas en este trabajo

- `onBeforeCompile` en r170 ve el shader **sin** resolver `#include`: parchear chunks, no el template.
- r170 quitó el modo de luces legado: ×π en `sun`/`hemi` para el mismo look.
- `window.D3` sólo existe cuando el módulo se ha evaluado (después de `main.js`): referenciar siempre dentro de funciones.
- `#stage canvas{pointer-events:none}`: los punteros llegan al `div#stage`, por eso el motor escucha ahí.
- `.gitignore` no admite comentarios en la misma línea del patrón (se detectó al cerrar: `diorama-jav/  # …` no ignoraba nada).
- `npm test` puede dar un fallo intermitente en tests con tiempos si la CPU está ocupada (Docker construyendo, swiftshader): repetir antes de investigar.
- Playwright sólo se resuelve desde dentro del repo (scripts sueltos en el scratchpad fallan con `ERR_MODULE_NOT_FOUND`): dejar los scripts temporales en `test/e2e/_*.tmp.mjs` y borrarlos.
