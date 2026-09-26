# Fase 1 — Objetos propios con comportamiento: investigación (pasos 1–3)

Fecha: 2026-09-26 · Base: `main @ 95290b9` (fase 0 + P-47/P-48, sin desplegar; se despliega junto con esta fase).
Método: los 4 pasos de `docs/04` B.1b. Este documento cubre el **1 (investigar)**, el **2 (catálogo)** y el
**3 (enfoques)**. El 4 (diseño por partes, spec y plan) va en `2026-09-2x-fase1-objetos-propios-design.md`.

## 0. Qué cubre la fase según las hojas de ruta

| Fuente | Qué dice | Cómo entra |
|---|---|---|
| Investigación arte propio §5, fila 1 | Plantillas (Mueble, Decoración, Pared, Colgante, Luz, Puerta, Contenedor…) + panel «Comportamiento» en el editor de dibujo: huella y altura, orientación, paso, vista y luz, oculta, sólo director, emite luz, capa | **Núcleo** de la fase |
| Hoja 3D [E1](../../../modules/tablero3d/docs/superpowers/specs/2026-09-26-hoja-de-ruta-3d-y-editor.md#e1) | Vista previa en entorno real: mini escena 5×5 con ambiente (día, atardecer, noche, interior). **Hecho cuando:** un objeto con luz propia se ve con su halo de noche en la vista previa | Recomendado dentro (B, ~½ jornada) |
| Hoja 3D [R16](../../../modules/tablero3d/docs/superpowers/specs/2026-09-26-hoja-de-ruta-3d-y-editor.md#r16) | Al cerrar cada fase, al menos dos plantillas nuevas que usen lo añadido | Entra: las plantillas **son** lo añadido |
| Hoja 3D E6 (comodidad: historial, Ctrl+K) y E3 (herramientas por rebanadas, bordes de R1) | B-M y M | **Fuera**: no son de objetos con comportamiento; E3 va con R1 |

Desvío conocido y ya aprobado: la hoja 3D pone R11 (terrenos) primero; el usuario mantiene terrenos en la fase 3.

## 1. Inventario del código (qué hay y qué falta)

Mapa detallado del editor (agente de exploración, 2026-09-26). Resumen:

### 1.1 Lo que se reutiliza tal cual
- **Editor de objetos por rebanadas** (`tablero3d.js` 3219–4085 + asistente 5017–5100): documento `ART.doc`
  con capas y rebanadas, deshacer, borrador automático, biblioteca, «Probar» y «Guardar».
- **Colocar el punto de luz** en el propio dibujo: herramienta `lightpos`, `placeLight` (rebanada = altura),
  `renderLightOpts` (radio, parpadeo, tipo, color).
- **Guardado del dibujo**: `docToRecord` → `assetPut` → REST `/drawings` → `t3d.drawings` (sólo director escribe).
- **Fase 0 completa**: `validateDef` (ya valida `template`, `shape`, todos los `components`, `emitLight`
  con `origin`, `art.base`), API `PUT/DELETE /pieces`, `PIECES` en cliente, `refreshEntities` aplica
  bloqueo/vista/luz/`hide`/`gmOnly` de una `p:`, `sceneFor` filtra `gmOnly` y deriva `blockCells`.
- **Terreno difícil**: el buscador de caminos (`fichas.js` `stepCost`) ya cobra doble si `g.hard(i)`;
  hoy `hard` sólo es agua poco profunda (`PATHG.hard`, `tablero3d.js:1959`) y `validateDef` ya acepta `cost:2`.

### 1.2 Lo que falta
1. **Nadie crea `p:` desde la interfaz**: `loadPieces` es la única llamada a `pieces` en el cliente.
2. **No hay plantillas** ni panel de comportamiento.
3. **Dibujo y pieza no están ligados**: son dos documentos (`t3d.drawings` `o_…` y `t3d.pieces` `p:…`).
4. **Colocar no escribe `def`** (`applyTool` rama `prop`), así que todo dibujo cae en `d:o_…` (1×1, sólido, bajo).
5. **Tamaño visual ≠ lógico**: el asistente elige 1/1,5/2 casillas de lienzo; la huella lógica es siempre 1×1;
   `addBill` no calcula `span`, `px` ni giro `v` para `obj:` (un objeto de 2×1 se dibujaría centrado en la primera casilla).
6. **Luz en dos formatos**: `lightSpec` del dibujo (r 1–12) y `emitLight` de la pieza (r 1–24, `origin`, `color`,
   `preset`); `propLight` da prioridad al dibujo y la rama de catálogo ignora color y origen.
7. **Paleta por índice** (`state.propSel`): añadir o borrar dibujos desplaza la selección.
8. **El arte de una `p:` sale de `p.type`**, no de `def.art.base`: una pieza con `type` distinto de `obj:o_…`
   cae en la rama del brasero sin avisar.

### 1.3 Riesgo estructural
`tablero3d.js` mide **5241 líneas / 447 KB** en un solo cierre. El editor ocupa ~1000 líneas densas. Añadir
el panel, las plantillas y la vista previa ahí dentro lo lleva a ~5800. Extraer el editor a `editor-arte.js`
(con la misma técnica que `catalogo.js`/`muros.js`) antes de tocarlo abarata esta fase y todas las siguientes.

## 2. Cómo lo hacen otros (resumen de la investigación de UX)

| Referente | Qué copiamos |
|---|---|
| Foundry (Tile/Wall config), Owlbear Rodeo, Dungeondraft | **Pestañas** Básico / Luz / Avanzado en vez de una lista larga de casillas |
| Dungeon Alchemist, TaleSpire | **Plantillas de un clic** que fijan todo el comportamiento; el usuario sólo ajusta |
| Foundry V12+ (modos de oclusión con nombre) | **Modos con nombre** («Transparente», «Bajo: se ve por encima», «Opaco») en lugar de dos casillas sueltas vista/luz |
| Unity/Godot (colisionador y punto de luz sobre el sprite) | **Pintar la huella** sobre la rejilla y **arrastrar el origen de la luz** sobre el dibujo |
| Tiled (propiedades de objeto), RPG Maker | **Etiqueta libre** y enumeraciones cerradas; comportamientos componibles |
| Figma / editores modernos | **Vista previa en vivo** al cambiar cualquier valor y **resaltar lo que cambió la plantilla** |

## 3. Catálogo (paso 2)

### 3.1 Comportamientos de un objeto (5.ª edición + mesa virtual)

| Comportamiento | Campo (fase 0) | ¿El motor ya lo aplica? | En la fase 1 |
|---|---|---|---|
| Huella w×d (1–8) y altura (0–8) | `shape.w/d/height` | Huella sí (bloqueo); altura visual no | **Sí**: huella lógica = lienzo |
| Orientación (girar al colocar) | `shape.orient` | Sólo catálogo | **Sí** |
| Giro aleatorio | `shape.random` | Sí | Sí |
| Bloquea el paso | `move.block` | Sí | Sí |
| Tapa vista / luz | `sight`, `light` (none/limited/block) | Sí (`limited` = `block`) | Sí, con modos con nombre |
| Bajo (se ve por encima, esconde tumbado) | `shape.low` / `hide` | Sí | Sí |
| Sólo lo ve el director | `gmOnly` | Sí, servidor incluido | Sí |
| Emite luz (radio, color, parpadeo, altura, origen) | `emitLight` | Parcial: sin color ni origen de pieza | **Sí**: `emitLight` manda |
| Terreno difícil (mesa volcada, escombros, maleza) | `cost:2` | No para objetos; sí `hard` para agua | **Sí** (barato: ampliar `PATHG.hard`) |
| Se puede pisar/subir (mesa, tarima) | `surface` | Sí para catálogo (`deck`) | Recomendado **fuera** (va con pisos, fase 4) |
| Cobertura ½ / ¾ / total | — (nuevo) | No: el motor no resuelve ataques | **Fuera**: sin sistema de ataques no hace nada |
| Destructible (CA/PG por material) | — | No | **Fuera** (fase 5, reacciones) |
| Puerta / estados | `door`, `states` | Sí para catálogo | **Fuera** (fase 2) |

### 3.2 Plantillas (valores de partida; el usuario ajusta)

| Plantilla | Huella×alto | Paso | Vista/luz | Otros |
|---|---|---|---|---|
| Mueble bajo (cofre, banco, cama) | 1×1×1 | bloquea | Bajo | — |
| Mueble alto (armario, estantería) | 1×1×2 | bloquea | Opaco | orientable |
| Mesa | 2×1×1 | difícil | Bajo | orientable |
| Contenedor (barril, caja) | 1×1×1 | bloquea | Bajo | — |
| Pilar / columna | 1×1×3 | bloquea | Opaco | — |
| Decoración pequeña (jarrón, libros) | 1×1×1 | libre | Transparente | — |
| Vegetación (arbusto, maleza) | 1×1×1 | difícil | Bajo | giro aleatorio |
| Escombros | 1×1×1 | difícil | Transparente | giro aleatorio |
| Cortina / tapiz | 1×1×2 | libre | Opaco | orientable |
| Luz de pie (farol, brasero) | 1×1×2 | bloquea | Transparente | luz 30/30 pies |
| Luz de pared (antorcha, aplique) | 1×1×2 | libre | Transparente | luz 20/20, orientable |
| Luz colgante (lámpara) | 1×1×1 | libre | Transparente | luz 15/30, capa colgante |
| Estructura grande (carro, altar) | 2×2×2 | bloquea | Opaco | orientable |
| Valla / pared baja | 1×1×1 | bloquea | Bajo | orientable, pieza de pared |

Radios de 5.ª edición para los preajustes de luz: vela 5/5, antorcha 20/20, lámpara 15/30, farol 30/30,
llama continua 20/20. La linterna sorda (cono) necesita `angle`, que `validateDef` ya admite pero el motor
no dibuja: **fuera**.

## 4. Enfoques (paso 3)

**A. Panel «Comportamiento» dentro del editor de dibujo (recomendado).** Pestaña nueva visible para
objetos; la plantilla se elige en el asistente «Nuevo dibujo». Guardar = dibujo (`/drawings`) y después
pieza (`/pieces`, `art.base` = clave del dibujo). Colocar escribe `type:'obj:o_…'` y `def:'p:…'`.
Una sola pantalla, reutiliza todo el editor, el usuario no aprende nada nuevo. Coste: dos escrituras sin
transacción (se ordena dibujo → pieza y el fallo de la segunda se muestra y se reintenta).

**B. Editor de piezas aparte** que elige un dibujo de la biblioteca y le pone comportamiento. Permite varias
piezas con el mismo dibujo (cofre normal y cofre trampa). Coste: otra pantalla, otro flujo, más código;
el caso «varias piezas por dibujo» se puede añadir después sobre A con «Duplicar pieza».

**C. Pieza y dibujo en un solo documento.** Sin dos escrituras, pero rompe `t3d.drawings`, la biblioteca y
«Todo el arte», y contradice la fase 0 (`art.base` referencia). Descartado.

## 5. Decisiones para el diseño (se preguntan de una en una)

1. **Alcance**: núcleo + E1 (recomendado) · E3/E6 fuera.
2. **Extraer el editor a `editor-arte.js`** antes de empezar, como refactor sin cambio de comportamiento
   (recomendado).
3. **Enfoque** A (recomendado) / B.
4. **Fuente de la luz**: `emitLight` de la pieza manda; el `lightSpec` del dibujo sólo vale para dibujos sin
   pieza (compatibilidad) (recomendado).
5. **Tamaño**: la huella lógica define el lienzo (w×d × resolución); desaparece el 1,5 del asistente para
   objetos nuevos (recomendado).
6. **Vista y luz**: tres modos con nombre (Transparente / Bajo / Opaco) y `limited` sigue reservado (recomendado).
7. **Terreno difícil por objeto** dentro; subirse encima, cobertura y destructibles fuera (recomendado).
8. **P-37** (jugadores creando piezas): cerrar como «sólo el director» (recomendado).
9. **Plantillas**: las 14 de §3.2.
10. **Paleta por clave** en vez de por índice (recomendado, necesario para que la selección no salte).

## 6. Tamaño

| Parte | Jornadas |
|---|---|
| Extraer el editor (refactor, guardado por test:ui y test:t3d) | ~0,5 |
| Plantillas + panel + guardado dibujo→pieza + colocar con `def` + tamaño/giro/luz en `addBill`/`propLight` + terreno difícil | 2–2,5 |
| E1 vista previa en entorno | ~0,5 |
| **Total** | **~3–3,5** |
