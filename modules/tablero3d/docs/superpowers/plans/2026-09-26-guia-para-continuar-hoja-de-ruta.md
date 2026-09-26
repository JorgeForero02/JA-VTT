# Guía para continuar la hoja de ruta en otra sesión

Fecha: 2026-09-26. Para quien retome el proyecto (persona o agente) **sin el contexto de esta
conversación**. La hoja de ruta está en
[`../specs/2026-09-26-hoja-de-ruta-3d-y-editor.md`](../specs/2026-09-26-hoja-de-ruta-3d-y-editor.md)
(fases A–E: R1–R16 mundo 3D y E1–E7 editor, con fuentes verificadas). Aquí va **cómo** hacerla sin romper lo que ya existe.

---

## 0. Antes de empezar: estado del que partes

1. Comprueba que la ronda «módulo JA-VTT, fichas, techos y luces»
   ([plan](2026-09-26-modulo-ja-vtt-fichas-techos-luces.md)) está cerrada: sus tareas T1–T7
   (incluidas T3b, T5b, T5c, T6b, T6c, T6d) aparecen en [`../../07-historial.md`](../../07-historial.md).
   Si alguna falta, **termínala antes**: la hoja de ruta asume el modelo de datos de T6d
   (fichas, ajustes e iniciativa como JA-VTT) y los muros/portales de T6b.
2. Lee en orden: `CLAUDE.md` → `docs/00-INDEX.md` → `docs/06-pendientes.md` →
   `docs/04-convenciones.md` → `docs/01-arquitectura.md` → `docs/08-integracion-ja-vtt.md`.
3. Referencia de Just Another VTT (sólo lectura, **nunca se modifica ni se fusiona**): rama
   `release`; las fixtures de contrato salen del commit `d68f41f`
   (`test/fixtures/ja-vtt/migrations/README.md` explica cómo refrescarlas).

## 1. Preparar el entorno

```bash
# Postgres de pruebas (los tests borran el esquema entero: nunca apuntarlos a otra base)
docker run -d --name tp-test-pg -e POSTGRES_USER=tp -e POSTGRES_PASSWORD=tp \
  -e POSTGRES_DB=tp_test -p 55433:5432 postgres:16-alpine
# sin Docker: un clúster local de PostgreSQL 16 en el puerto 55433 con usuario/base tp / tp_test

npm ci
npm run check                      # lint + unitarios + integración + contratos + cobertura
```

Prueba visual (obligatoria si tocas el cliente):

```bash
PGPASSWORD=tp psql -h localhost -p 55433 -U tp -d postgres \
  -c "DROP DATABASE IF EXISTS tp_ui" -c "CREATE DATABASE tp_ui"
DATABASE_URL=postgres://tp:tp@localhost:55433/tp_ui PORT=3998 node server.js &   # guarda el PID
BASE_URL=http://localhost:3998 CHROMIUM_PATH=/ruta/a/chrome npm run test:ui -- <carpeta-capturas>
kill <PID>
```

Gotchas aprendidos:
- **Nunca `pkill -f node`**: mata también la shell/agente que lo lanza. Mata por PID.
- El navegador de pruebas usa WebGL por software (SwiftShader): los fps son la mitad o menos que
  en un equipo real. Compara siempre antes/después en la misma máquina.
- Si tocas el contrato con el anfitrión (rutas, WS, `mount`, iconos, CSS), corre también
  `npm run test:ja-vtt` contra una copia de JA-VTT con la guía `docs/08` aplicada.
- La cobertura de funciones de JA-VTT queda justa (≈82,8 % frente a su umbral de 82 %) con las
  líneas de integración; si añades funciones de anfitrión, añade también su prueba.

## 2. Mapa del código que vas a tocar

| Zona | Dónde |
|---|---|
| Servidor del módulo (rutas, mesa en vivo, WS `/t3d/ws`, interfaz con el anfitrión) | `modules/tablero3d/index.js` (JSDoc arriba = contrato) |
| **Todo** el SQL del módulo | `modules/tablero3d/db.js` |
| Reglas y saneado (escenas, luces, techos, muros, fichas, dibujos, ajustes, mesa en vivo y lo que ve cada rol) | `modules/tablero3d/rules.js` (`cleanMap`, `cleanProp`, `cleanLightProp`, `cleanRoof`, `cleanDrawing`, `cleanSheet`, `cleanSettings`, `liveDocFor`, `TERRAIN`…) y `dice.js` (dados) |
| Migraciones del módulo (esquema `t3d`, control en `t3d.schema_migrations`) | `modules/tablero3d/migrations/NNN-*.sql` — **nunca editar una aplicada** |
| Cargador y API de montaje (`Tablero3D.mount`) | `modules/tablero3d/public/t3d.js` |
| Marcado de la vista 3D por huecos | `modules/tablero3d/public/t3d.html` |
| Estilos (todo bajo `.t3d-root`, sólo variables del anfitrión) | `modules/tablero3d/public/t3d.css` |
| Motor 3D | `modules/tablero3d/public/tablero3d.js`: `composeAtlas`, `TILE_TARGETS`/`TILE_SLOT`, `buildChunk`, `buildWater` (`uFrame`), `buildRoofs`/`normRoof`, `PROP3D`/`paintStack`/`factorySlices`, `CHARS`/`buildCharTex`/`spriteDims`, `computeLight`/`allLights`/`normLight`, `computeFog`, `serialize`/`deserialize`/`loadMap`, plantillas (`townMap`…), editor de dibujo (`newDoc`, `docToRecord`/`recordToDoc`, `EXTRA_RAMPS`), `probe` (sólo pruebas) |
| Funciones puras probadas en node | `vision.js` (visión y luz), `fichas.js` (tamaños, caminos, distancias), `muros.js` (tipos de muro y portales), `ambiente.js` (momentos de luz y zonas interiores), `ajustes.js` (ajustes de JA-VTT, planos, anotaciones, iniciativa), `dados.js` (dados de JA-VTT), `personajes.js` (arte de personajes medianos) |
| Adaptador de red del motor | `modules/tablero3d/public/mesa.js` |
| Iconos que JA-VTT no tiene | `modules/tablero3d/public/icons-t3d.js` (hay test de contrato) |
| Anfitrión de este repo (núcleo idéntico a JA-VTT) | `server/`, `public/` |
| Pruebas | `test/*.test.js`, `test/e2e/ui.mjs`, `test/e2e/ja-vtt.mjs`, fixtures en `test/fixtures/ja-vtt/` |

## 3. Reglas que no se rompen (invariantes)

1. **Dos proyectos, no uno**: JA-VTT no se modifica. Todo lo nuevo vive en `modules/tablero3d`;
   el anfitrión sólo cambia si `docs/08` lo documenta (y se re-prueba con `test:ja-vtt`).
2. **Esquema `t3d`** para todo dato del 3D; SQL sólo en `modules/tablero3d/db.js`; reglas sólo en
   `modules/tablero3d/rules.js`; migraciones nuevas, idempotentes (`IF NOT EXISTS`).
3. **Prefijo `t3d-`** en ids, clases, `data-*` y claves de almacenamiento; un único global
   (`Tablero3D`, más `THREE`). Hay tests que lo comprueban contra las listas de JA-VTT.
4. **Principio de producto**: una mesa para mover fichas, no un gestor de personajes. Nada de
   hojas, atributos ni reglas de un sistema concreto.
5. **Armonía con JA-VTT**: si una cosa existe en JA-VTT (tipos de luz, muros, estados, fichas,
   ajustes, iniciativa, clima, zonas), el 3D usa **sus ids, nombres, iconos y campos**; lo propio
   del 3D va como campo extra que JA-VTT ignora. Actualiza la fixture y su test de igualdad.
6. **Motor de luz 3D intacto** (decisión del usuario): se amplía, no se sustituye.
7. **Densidad de píxel constante**: un texel de cualquier sprite = un texel del terreno (16 por
   casilla a la base, ×2/×4 a 32/64, ampliación EPX). Nada se reescala a píxel gordo.
8. **Compatibilidad**: toda escena, ficha o dibujo guardado antes abre igual. Cliente y servidor
   normalizan igual (patrón: `normX` en el cliente, `cleanX` en `rules.js`, y un test que compara
   ambos con las mismas entradas).
9. **Pruebas**: test primero; cada test nuevo se rompe una vez a propósito; `npm run check` verde
   antes de cada commit; `test:ui` verde y **capturas revisadas a ojo** si cambia algo visible.
10. **Documentación de cierre** en cada cambio: `docs/01`–`05`, entrada en `07-historial`
    (qué · por qué · revertir), `06-pendientes` al día, `docs/08` si cambia la integración.

## 4. Método de trabajo (el mismo de esta ronda)

1. **Spec** corta de la mejora en `docs/superpowers/specs/AAAA-MM-DD-<slug>-design.md` partiendo
   de la ficha R/E de la hoja de ruta (qué, datos, compatibilidad, «hecho cuando»). Si hay una
   decisión de producto, **preguntar al usuario antes** de implementar.
2. **Plan** en `docs/superpowers/plans/` con tareas de un commit cada una.
3. **Desarrollo dirigido por subagentes**: un subagente por tarea, en serie cuando tocan
   `tablero3d.js` (casi siempre); en paralelo sólo si los archivos no se pisan (o con worktrees).
   Plantilla del encargo en §6.
4. **Verificación independiente** de cada tarea antes de subirla: `npm run check`, `test:ui`
   (y `test:ja-vtt` si aplica) y mirar las capturas.
5. Commit (Conventional Commits en castellano) y push a la rama de trabajo.

## 5. Orden y cómo abordar cada fase

El **orden, las fuentes verificadas y el plan técnico de cada mejora** (datos, código,
compatibilidad, «hecho cuando», riesgos) están en la hoja de ruta, organizada por fases:

| Fase | Mejoras |
|---|---|
| A. Crear con arte propio | R11 → E1 → R4 → R5 → E7 → E6 · R16 continuo |
| B. Que se vea mejor | R1 (+E3) → R2 → R8 → E5 |
| C. Que cobre vida | R6 (+E2) → R12 → R7 |
| D. Jugar mejor | R13 → R9 → R15 |
| E. Puente y profundidad | R10 (decisión pendiente del usuario) → R3 |
| Siempre | R14 rendimiento y móvil: medir al cerrar cada fase |

Para cada fase:
1. **Spec de fase** (`docs/superpowers/specs/`) que concrete lo que la hoja de ruta deja abierto
   (p. ej. en R1 elegir cuadrícula dual o cuartos; en R3 el modelo de franjas de elevación).
   Preguntar al usuario lo que sea decisión de producto (R10 siempre).
2. **Abrir las fuentes marcadas ≈ o ?** antes de citarlas en código o docs; la investigación sólo
   pudo abrir GitHub. Respetar las licencias: copiar sólo de MIT/Apache/BSD/CC0; GPL sólo consulta.
3. **Plan** con una tarea por mejora (o por parte grande) y un commit por tarea.
4. **Cerrar la fase** con: plantillas nuevas (R16), tabla de medidas de R14 en `07-historial`,
   `docs/08` si cambió algo de la integración, y la mejora marcada como hecha en la hoja de ruta.

Notas por mejora que no están en la hoja de ruta:
- **R11** deja preparados los huecos de atlas de las piezas de borde y el campo `priority`, para que
  R1 no rehaga nada.
- **R1 y R2** se hacen seguidas: ambas reescriben `buildChunk`; mide `buildChunk` en 128² antes y
  después.
- **R8** vendoriza pases de three.js **r128** (no de la versión actual); la web de threejs.org
  documenta otra API.
- **R14**: no existe `BatchedMesh` en r128; usa `InstancedMesh` o geometría fusionada.
- **R3** toma el modelo de «Scene Levels» de Foundry v14 (el módulo Levels está retirado).
- **R10**: la «v2» de Universal VTT que circula no es autoritativa; no hay especificación formal del
  autor del formato.

## 6. Plantilla de encargo para un subagente

```
Estás implementando la tarea <Tn> del plan <ruta del plan> en /ruta/al/repo (rama <rama>;
no hagas push; un commit al final, Conventional Commit en castellano, terminado con las líneas
de atribución que indique la sesión). Sin nombres de modelos en commits ni código.

Lee primero: CLAUDE.md, docs/00-INDEX.md, docs/01, docs/02, docs/04, docs/05, docs/08 y la
sección <Tn> del plan. Referencia JA-VTT en <ruta> (SÓLO LECTURA): <archivos y símbolos>.

Invariantes: §3 de docs/superpowers/plans/2026-09-26-guia-para-continuar-hoja-de-ruta.md.

Objetivo: <lista numerada: datos, código, compatibilidad, interfaz>.
Pruebas: <reglas, node, UI>; rompe cada prueba nueva una vez a propósito.
Verifica: npm run check; test:ui (comandos de §1); mira las capturas y repite si se ve mal.
Documenta: docs/01, 02, 05, 06, 07 (+08 si cambia la integración).
Informe: qué hiciste, decisiones, compatibilidad, números de pruebas, capturas, pendientes.
```

## 7. Cómo cerrar cada mejora

- «Hecho cuando» de la hoja de ruta cumplido y demostrado (prueba o captura).
- `npm run check` y `test:ui` verdes; `test:ja-vtt` si cambió la integración.
- `docs/08` actualizado si cambia algo que el usuario deba añadir o sepa al integrar en JA-VTT.
- Marcar la mejora como hecha en la hoja de ruta (fecha y commit) y cerrar/actualizar P-05 en
  `docs/06-pendientes.md` cuando se completen todas.
- Al cerrar una fase: medidas de R14 dentro del mínimo y dos plantillas nuevas (R16).
