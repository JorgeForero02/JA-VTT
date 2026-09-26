# Refactor de `tablero3d.js` (SOLID, duradero) — diseño

Fecha: 2026-09-26 · Base: `main @ 4688194` · Pedido por el usuario antes de la fase 1 («aplicar SOLID, acomodar
tablero3d, que sea realmente duradero»). Alcance elegido: **sólo el cliente `modules/tablero3d/public/tablero3d.js`**
(opción A). Enfoque elegido por mí con delegación del usuario: **A reforzado** (extraer hojas + quitar parches +
pruebas que ejecutan + reglas que impiden volver atrás). El núcleo con estado compartido (B completo) queda para
cuando las fases 2 y 5 lo toquen, con estas reglas ya puestas.

**Desvío de la hoja de ruta:** no está en ninguna hoja; se intercala antes de la fase 1 por decisión del usuario.
Se despliega junto con la fase 1 y con P-47/P-48.

## 1. Punto de partida (mapa del 2026-09-26)

- 5241 líneas / 447 KB en un único cierre `T3D._engine(ctx)`; 39 secciones, **36 en un solo ciclo** de dependencias.
- El ciclo lo cierran pocas aristas: `animOn`→`M`, `computeEH`→`RCAP`, `gmView`→`LIVE`, `piecesGate`→`showHint`,
  `applyArtMaps`→TOKVIS, y **10 parches** que reasignan funciones ya declaradas (`moveMiniTo` en :4202 y :4948;
  `loadMap, startCombat, nextTurn, endCombat, dash, undo, redo, endStroke, setFog` en :4953–4962).
- **Ninguna prueba ejecuta el motor.** ~110 aserciones leen el texto con regex o recortan trozos por anclas
  (`frontend.test.js`, `cliente-armonia.test.js`, `tools/foto-fabrica.cjs`). `test:t3d` (41 pasos) es la única
  prueba que lo pone en marcha y **no cubre el editor de arte ni el combate**.
- ESLint no revisa `modules/tablero3d/public`. La cobertura no cuenta `tablero3d.js`.
- Hojas con dependencias sólo hacia abajo: arte procedural (~910), editor de arte (~1000), generadores de mapas
  (~190), serialización (~90), datos de luz (~40), utilidades de interfaz (~20).

## 2. Arquitectura resultante

Capas (una capa sólo usa las de arriba; nunca al revés):

```
base.js ─ luces.js ─ objetos3d.js ─ escena.js ─ mapas.js ─ pixel.js      (puros: node y navegador)
      └──────────────── arte-procedural.js ─ ui3d.js                      (navegador, fábricas con deps)
                              └──────────── editor-arte.js                 (navegador, fábrica con API explícita)
                                                  └── tablero3d.js (núcleo: modelo, luz, entidades, partida, en vivo, entrada, bucle)
```

| Fichero | Tipo | Contenido (sale de) | Pruebas |
|---|---|---|---|
| `base.js` | puro, UMD | `mulberry32, hash, pick, clamp, hexRGB, shadeHex, luma` (UTIL) | node + cobertura |
| `luces.js` | puro, UMD | `LIGHT_TYPES/IDS/ANIMS, normLight, lightOfType, coneOf/coneF, lightRGB` (LIGHT, parte de datos) | node + cobertura |
| `objetos3d.js` | puro, UMD | datos `PROP3D` y sus colores; `propSlices` si es puro (PROP3D) | node + cobertura; `foto-fabrica.cjs` hace `require` |
| `escena.js` | puro, UMD | `read(obj, deps)` y `write(model, extras)` = núcleo de `deserialize/serialize`, `readExtras, sceneExtras, levelSide, campValid, blankMap, defaultSheet, normSheet, normRoof` | node + cobertura; ida y vuelta |
| `mapas.js` | puro, UMD | `demoMap, dungeonMap, townMap, lightWorkshopMap` (GENMAP + TOWN) | node + cobertura; salida igual a la foto previa |
| `pixel.js` | puro, UMD | `flipH/flipV/rot90, lineCb, rgb2hsl/hsl2rgb, hueRamp, parsePalette, reduceToPalette, replaceColor, mapPixels` (ART + ARTADJ) | node + cobertura |
| `arte-procedural.js` | fábrica `T3D.ArteProcedural(deps)` | ATLAS + SPRITES + CUSTOMART + `buildArt`; expone `SPR/STACK/STK/atlasTex/CSTACK` por getters | vm con lienzo falso donde baste; `test:t3d` |
| `ui3d.js` | fábrica `T3D.UI(ctx)` | `el, esc, mkBtn, sepEl, lblEl, thumbCanvas, lsGet, lsSet` | vm |
| `editor-arte.js` | fábrica `T3D.EditorArte(api)` | ART + PANELS (arte) + ARTADJ (UI) | `test:t3d` (pasos nuevos) |
| `tablero3d.js` | núcleo | lo demás, sin parches | `test:t3d` + regex de cableado |

Meta de tamaño: `tablero3d.js` ≈ **2600 líneas** (−50 %). Ningún fichero nuevo pasa de **1100**.

### 2.1 Reglas de los módulos
1. **Puros**: sin DOM, sin `THREE`, sin estado global; UMD igual que `catalogo.js`
   (`module.exports` en node, `Tablero3D.X` en navegador). Dependencias entre puros por `require`/`Tablero3D`.
2. **Fábricas**: reciben **todo** lo que usan en un objeto de dependencias con nombre (inversión de
   dependencias); no leen variables del motor por cierre. El estado que el motor reasigna (`TEX`, `M`, `ENV`,
   `CUSTOM`) se pasa como **función lectora** (`getM()`), nunca como valor copiado.
3. La interfaz de `editor-arte.js` hacia el motor es una lista cerrada y documentada en la cabecera del fichero
   (qué pide: `rebuild, buildDecor, buildRoofs, refreshEntities, syncMinis, renderPalette, resize, showHint,
   composeAtlas, applyArtMaps, db, getM, getENV…`; qué da: `open, close, isOpen, key, preview, loadAllAssets,
   registerDoc, applyCustom`).
4. `tablero3d.js` usa los módulos por alias al principio del cierre, como hoy hace con `Vision…Catalogo`.
5. Nada nuevo usa `getElementById`/`querySelector`: sólo `$()` (regla ya probada).

### 2.2 Sin parches: composición explícita
Los 10 parches pasan a **declaraciones de función únicas** que componen por nombre, en el orden actual:

```js
function moveMiniTo(b,x,z,quiet){            // permiso en vivo → turno de combate → mover → sincronizar
  if(LIVE.on&&!canControl(b)){ if(!quiet) showHint(miniName(b)+' lo controla otra persona.',1600); return false; }
  const ok=combatMove(b,x,z,quiet); if(ok&&LIVE.on){ liveTok(b); if(GM.active) liveCombat(); } return ok;
}
function combatMove(b,x,z,quiet){ /* cuerpo del parche de :4202 */ return moveMini(b,x,z,quiet); }
function moveMini(b,x,z,quiet){ /* cuerpo original de :2443 */ }
```

Igual para `loadMap/startCombat/nextTurn/endCombat/dash/undo/redo/endStroke/setFog`: la versión base pasa a
llamarse `…Local` (p. ej. `undoLocal`) y la pública la compone. ESLint impone `no-func-assign` y
`no-redeclare` para que no vuelvan.

**Comportamiento que se conserva a propósito:** hoy los botones deshacer/rehacer (:2771) usan la versión **sin**
aviso a la mesa en vivo (Ctrl+Z sí avisa). El refactor los ata a `undoLocal/redoLocal` para no cambiar nada.
Arreglarlo es **D1** (§6).

## 3. Red de seguridad (antes de mover una línea)

1. **Pasos nuevos en `test:t3d`** con el código actual, verdes antes del refactor:
   - editor de arte: abrir, nuevo objeto, pintar un píxel, «Probar» (aparece en la paleta y se coloca),
     «Guardar», recargar y seguir viéndolo;
   - editor de tablero: pintar terreno, deshacer con Ctrl+Z y con el botón, rehacer;
   - combate: empezar, mover fuera de turno (rechazado), mover en turno (gasta), siguiente turno, terminar;
   - mapas de ejemplo: pueblo, mazmorra, demo y taller de luces se abren con su número de objetos y luces.
2. **Fotos doradas en node** tomadas del código actual (recortado como hoy) y guardadas en
   `test/t3d/fixtures/`: salida de los 4 generadores con semilla fija, `normLight` de todos los tipos, ida y
   vuelta de `deserialize/serialize` de 3 escenas (v1, v2 con piezas, con techos y notas). **No se regeneran**
   después (misma regla que `fabrica-antes.json`).
3. La foto de fábrica existente (`fabrica-antes.json`) sigue igual.

## 4. Pruebas y reglas que impiden volver atrás

- **Las pruebas ejecutan, no leen texto.** Las aserciones regex que apuntan a código movido se sustituyen por
  llamadas al módulo. Sólo quedan regex para **invariantes de cableado** (un único `WALLAT.set(`, `DB.doc('live/…')`
  contra `LIVE_KEYS`, colecciones, `ctx.mesa`), leyendo la **concatenación** de todos los ficheros del motor
  con un ayudante `readEngine()`.
- Listas fijas actualizadas: ficheros que carga `t3d.js` (frontend.test.js:131, :138, :148) y claves de
  `Tablero3D` (:150), en orden de capas.
- **ESLint para `modules/tablero3d/public/*.js`** (sin `vendor/`):
  - módulos nuevos: `recommended` con `no-undef` (globales declarados);
  - `tablero3d.js`: `no-func-assign`, `no-redeclare`, `no-dupe-keys`, sintaxis;
  - **`max-lines` como trinquete**: `tablero3d.js` ≤ su tamaño final redondeado a la centena superior;
    los demás ≤ 1100. Bajar el tope está permitido; subirlo es decisión explícita en `docs/04`.
- **Cobertura:** se añaden los módulos puros a `--test-coverage-include`, sin bajar los umbrales.
- `docs/04-convenciones.md`: sección «Arquitectura del cliente 3D» con capas, dirección de dependencias,
  patrón puro/fábrica, prohibido reasignar funciones, trinquete de líneas, y dónde va cada cosa nueva
  (p. ej. el panel «Comportamiento» de la fase 1 va a `editor-arte.js`, no al núcleo). Se corrige también la
  discrepancia de umbrales de cobertura (docs 90/82/90 frente a package 78/72/82) dejando escrito el real.

## 5. Orden de trabajo (cada paso deja todo verde)

| # | Paso | Guarda |
|---|---|---|
| 1 | Red de seguridad (§3) | nuevos pasos + fotos verdes sobre el código actual |
| 2 | ESLint + `readEngine()` + trinquete provisional (5300) | `npm run lint` |
| 3 | `base.js` + `luces.js` | node + fotos |
| 4 | `objetos3d.js` + `mapas.js` | fotos de generadores y fábrica |
| 5 | `escena.js` | ida y vuelta |
| 6 | `arte-procedural.js` | `test:t3d` |
| 7 | `ui3d.js` + `pixel.js` | node + `test:t3d` |
| 8 | `editor-arte.js` | pasos del editor en `test:t3d` |
| 9 | Quitar los 10 parches (§2.2) | pasos de combate, deshacer y en vivo |
| 10 | Trinquete final, docs 01/04/05/07, pasada completa | check + test:ui + test:t3d + compose/e2e |

Mientras se trabaja: sólo pruebas 3D; una pasada completa al final (preferencia del usuario).
Ejecución: subagentes por tarea con revisión por tarea (como la fase 0).

## 6. Decisiones abiertas

- **D1 — botón deshacer/rehacer sin aviso en vivo.** Recomendado: arreglarlo **después** del refactor en un
  commit propio con su paso en `test:t3d` (una línea: `onclick=()=>undo()`). Si no, queda como pendiente.

## 7. Tamaño y riesgos

~1,5–2 jornadas. Riesgos: orden de inicialización (TDZ) al sacar código que se ejecuta al cargar (`paint()`,
`buildArt()`, `buildShade()`) → cada fábrica se invoca en el mismo punto del cierre donde estaba el código;
getters para el estado reasignado (`atlasTex`, `SPR`…) → la foto de fábrica y `test:t3d` lo cubren; caché del
navegador (sin `?v=`, `no-cache`) → sin cambio.

## 8. Hecho cuando
- `tablero3d.js` ≤ ~2600 líneas, cero reasignaciones de función, ESLint con trinquete activo.
- Los 9 módulos nuevos existen con su interfaz documentada; los puros con pruebas en node y en cobertura.
- Fotos doradas y los pasos nuevos y viejos de `test:t3d` en verde **sin cambiarlos** tras el refactor.
- Pasada completa verde; docs 01, 04, 05 y 07 al día.
