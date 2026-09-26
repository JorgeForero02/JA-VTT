# Hoja de ruta — ampliar el 3D por sprites y el editor de dibujo

Fecha: 2026-09-26 (reorganizada por fases el mismo día, con fuentes verificadas). Estado:
**aprobada por el usuario, sin empezar**. La ronda «módulo JA-VTT, fichas, techos y luces»
([plan](../plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md)) que había que cerrar antes está cerrada (T7,
2026-09-26): se puede empezar.

**Cómo retomarla:** [guía para continuar](../plans/2026-09-26-guia-para-continuar-hoja-de-ruta.md)
(entorno, mapa del código, invariantes, método por subagentes, plantilla de encargo).

## Principios que no se tocan

1. **Modelado por sprites 2D en pixel art**: casillas con textura, personajes por vistas y objetos
   por rebanadas apiladas. Nada de mallas modeladas a mano ni texturas pintadas en alta resolución.
2. **Densidad de píxel constante**: un texel de cualquier sprite = un texel del terreno.
3. **El motor de luz 3D se amplía, no se sustituye.**
4. **Una mesa para mover fichas**, no un gestor de personajes.
5. **Armonía con Just Another VTT** (JA-VTT): si algo existe allí, se usan sus ids, nombres,
   iconos y campos; JA-VTT no se modifica y los proyectos no se fusionan.
6. **Todo en el módulo** `modules/tablero3d` (esquema `t3d`, prefijo `t3d-`).

## Fuentes: cómo leer la verificación

La investigación (2026-09-26) sólo podía abrir GitHub; el resto se comprobó en índices de búsqueda.
- **✓** abierta y leída (GitHub). **≈** aparece con esa URL exacta en buscadores actuales; no se
  pudo abrir. **?** sin verificar. Al retomar, abrir las ≈ y ? antes de citarlas en código o docs.
- Licencias: sólo se **copia código** de fuentes MIT/Apache/BSD/CC0; las GPL (p. ej.
  `parse-magica-voxel`, Monk's Active Tiles) sirven de consulta, nunca de copia.
- Para three.js se enlaza la **etiqueta r128** en GitHub (la versión vendorizada); la web actual de
  threejs.org documenta la API nueva, que no coincide.

Dificultad: B baja · M media · A alta, sobre el motor actual.

---

## Orden por fases

| Fase | Objetivo | Mejoras (en orden) |
|---|---|---|
| **A. Crear con arte propio** | El director hace su mundo sin límites | [R11](#r11) terrenos propios → [E1](#e1) vista previa en el entorno → [R4](#r4) piezas prefabricadas → [R5](#r5) importar `.vox`/`.ase` → [E7](#e7) compartir arte entre tableros → [E6](#e6) comodidad del editor → [R16](#r16) contenido de partida (continuo) |
| **B. Que se vea mejor** | Mapas más bonitos con el mismo esfuerzo | [R1](#r1) autotiling (+[E3](#e3) bordes generados) → [R2](#r2) rampas, escaleras, medio bloque → [R8](#r8) acabado HD-2D → [E5](#e5) herramientas de dibujo |
| **C. Que cobre vida** | Movimiento y ambiente | [R6](#r6) animación de personajes (+E2) → [R12](#r12) objetos animados → [R7](#r7) clima y efectos |
| **D. Jugar mejor** | Más cosas que hacer en la mesa | [R13](#r13) muros finos en los bordes → [R9](#r9) elementos interactivos → [R15](#r15) escenas por jugador |
| **E. Puente y profundidad** | Integración máxima y verticalidad | [R10](#r10) exportar a 2D (**decisión pendiente**) → [R3](#r3) pisos y niveles |
| **Siempre** | Funciona en cualquier equipo | [R14](#r14) rendimiento y móvil: medir al cerrar cada fase |

Por qué este orden:
- **A primero** porque convierte la herramienta en algo propio de cada director (terrenos, piezas,
  arte importado y compartido) y es la base del mercado de paquetes de arte.
- **R1 y R2 seguidas** porque ambas reescriben `buildChunk`; hacerlas juntas evita rehacerlo.
- **C después de B** porque la animación y los efectos lucen sobre mapas ya bonitos, y el clima
  necesita la máscara de interiores de T6c.
- **R13 antes de R9 y R10**: los interactivos (puertas secretas, palancas) y la exportación a 2D
  necesitan muros en las aristas como los de JA-VTT.
- **R3 al final**: cambia el modelo del mapa y depende de R2 (escaleras) y R13.

| Mejora | Dificultad | Depende de | Fase |
|---|---|---|---|
| R11 Terrenos propios | M | — (prepara R1) | A |
| E1 Vista previa en el entorno | B | — | A |
| R4 Piezas prefabricadas | B-M | — | A |
| R5 Importar `.vox` / `.ase` | B-M | — | A |
| E7 Compartir arte | M | R4, R11 | A |
| E6 Comodidad del editor | B-M | — | A |
| R16 Contenido de partida | continuo | cada mejora | A→E |
| R1 Autotiling (+E3) | M | R11 | B |
| R2 Formas de bloque | M-A | R1 (mismo `buildChunk`) | B |
| R8 Acabado HD-2D | B-M | R14 (medir) | B |
| E5 Herramientas de dibujo | B-M | — | B |
| R6 Animación de personajes (+E2) | M | R5 (etiquetas de `.ase`) | C |
| R12 Objetos animados | M | R6 (reloj y etiquetas) | C |
| R7 Clima y efectos | M | T6c (interiores), R14 | C |
| R13 Muros finos | M-A | T6b | D |
| R9 Elementos interactivos | M | R13 | D |
| R15 Escenas por jugador | M | T6b (portales), T6d | D |
| R10 Exportar a 2D | M | R13, decisión | E |
| R3 Pisos y niveles | A | R2, R13 | E |
| R14 Rendimiento y móvil | continuo | — | siempre |

---

## Fase A — Crear con arte propio

### <a id="r11"></a>R11 — Terrenos propios del tablero · M

**Qué:** crear terrenos nuevos desde el editor (pantano, baldosas de templo, alfombra, hielo,
tierra quemada, hierba otoñal…), no sólo redibujar los 9 de fábrica.

**Estado actual:** cada casilla guarda una letra (`TERRAIN = 'gapsow~cnl'` en
`modules/tablero3d/rules.js`), cada terreno tiene un hueco fijo del atlas (`composeAtlas`,
`TILE_SLOT`) y el editor sólo ofrece los `TILE_TARGETS` de fábrica.

**Fuentes**
- Tiled, propiedades personalizadas por casilla — https://doc.mapeditor.org/en/stable/manual/custom-properties/ ≈
- LDtk, capas IntGrid (valor entero + identificador por celda = «tipo de terreno») — https://ldtk.io/docs/general/intgrid-layers/ ≈
- Terreno difícil en el SRD 5.1 (CC-BY-4.0; «Movement and Position»: cada pie cuesta 1 pie extra,
  no se acumula) — https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf ≈ · SRD 5.2.1:
  https://www.dndbeyond.com/srd ≈

**Cómo**
1. **Datos:** rango de letras reservado para terrenos del tablero (p. ej. `A`–`T`, hasta 20);
   `TERRAIN` las acepta; las escenas actuales no cambian.
2. **Definición** como dibujo `kind:'tile'`, `target:'terrain:<letra>'`, con metadatos validados en
   `cleanDrawing`: `name`, `minimap` (color), `move` (`normal` | `difficult` | `block`), `priority`
   (entero, para R1), `frames` (1 o 4, animado como el agua). Si hace falta columna: migración nueva
   del módulo (`004+`), nunca editar una aplicada.
3. **Atlas dinámico:** los terrenos propios toman huecos al cargar el tablero; **reservar ya los
   huecos de sus piezas de borde** (ver R1) aunque todavía no se dibujen.
4. **Motor:** `Fichas.route` aplica coste ×2 a `difficult` (igual que el SRD); `block` actúa como
   muro para movimiento, visión y luz (tabla de `muros.js`).
5. **Interfaz:** en la paleta de terreno, los propios junto a los de fábrica; «Nuevo terreno»,
   «Duplicar» desde uno existente, editar y borrar (una escena que lo usa cae al pasto, con aviso).
6. **Integración:** JA-VTT no tiene terrenos; R10 los exportará como imagen.

**Hecho cuando:** crear «Pantano» difícil, pintarlo, guardar, recargar y verlo igual; una ficha
tarda el doble en cruzarlo; tests del servidor con letras nuevas y de coste en `Fichas.route`.

**Riesgos:** agotar huecos del atlas a 64 px (medir memoria de textura, R14).

### <a id="e1"></a>E1 — Vista previa en el entorno real · B

**Qué:** ver lo que se dibuja dentro de una mini escena con la luz, el ambiente (T6c) y la niebla
actuales, no sobre un fondo liso.

**Cómo:** segunda cámara que renderiza a la caja de vista previa del editor una escena de 5×5 con
el dibujo en prueba registrado temporalmente (`registerDoc` sin `applyCustom` al tablero); selector
de ambiente (día, atardecer, noche, interior) y de luz cercana (tipos de T4).

**Hecho cuando:** un objeto con luz propia se ve con su halo de noche en la vista previa; capturas.

### <a id="r4"></a>R4 — Piezas prefabricadas (sellos) · B-M

**Qué:** seleccionar una zona (casa, tienda, puente), guardarla con nombre y estamparla girada en
otras escenas o tableros.

**Fuentes**
- Formato oficial de «slab» de TaleSpire (Bouncyrock): texto base64 de un binario gzip; cada pieza
  8 bytes (posición ×100, giro en pasos de 15°) — https://github.com/Bouncyrock/DumbSlabStats/blob/master/format.md ✓
- Tiled, plantillas y pincel de sellos — https://docs.mapeditor.org/en/stable/manual/using-templates/ ≈ ·
  https://doc.mapeditor.org/en/stable/manual/editing-tile-layers/ ≈
- LDtk, entidades con campos tipados — https://ldtk.io/docs/general/editor-components/entities/ ≈

**Cómo**
1. **Datos:** tabla `t3d.prefabs (board_id, id, owner_id, name, w, d, data JSONB, thumb TEXT,
   created_at, updated_at)` (migración nueva). `data` = recorte de `h`, `t`, `src`, props (luces,
   muros T6b, portales sin destino), techos y zonas interiores (T6c), relativos a la esquina.
2. **Funciones puras** en `modules/tablero3d/public/piezas.js` (probadas en node): `recortar(mapa,
   rect)`, `girar(pieza, cuartos)`, `estampar(mapa, pieza, x, z)` con choque de límites.
3. **Herramienta** «Seleccionar zona» → «Guardar como pieza»; panel «Piezas» con miniatura cenital;
   vista fantasma que sigue al cursor, **R** gira, clic estampa con deshacer (`beginStroke`).
4. **Copiar como texto** (como las slabs de TaleSpire): exportar/importar una pieza como cadena
   base64 comprimida (`CompressionStream('gzip')`), para compartir por chat.
5. Rutas `GET/PUT/DELETE /api/t3d/boards/:id/prefabs`, saneado en `rules.js`.

**Hecho cuando:** copiar la herrería del pueblo a una escena vacía girada 90°; girar 4 veces =
identidad (test); pegar una pieza desde texto en otro tablero.

### <a id="r5"></a>R5 — Importar MagicaVoxel (`.vox`) y Aseprite (`.ase`/`.aseprite`) · B-M

**Qué:** traer arte existente sin exportar a PNG a mano.

**Fuentes**
- Especificación `.vox` — https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt ✓
- Especificación Aseprite (cels de imagen tipo 2 y de tilemap tipo 3 comprimidos con **zlib**) —
  https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md ✓
- `DecompressionStream('deflate')` = zlib con cabecera y suma de control (lo correcto para Aseprite;
  `'deflate-raw'` sería sin cabecera) — https://github.com/mdn/content/blob/main/files/en-us/web/api/decompressionstream/decompressionstream/index.md ✓
- Lectores de referencia: `magica-voxels` (MIT, navegador) — https://github.com/matthewjosephtaylor/magica-voxels ✓ ·
  `ase-parser` (MIT, sólo Node) — https://github.com/TheCyberRonin/ase-parser ✓ · `parse-magica-voxel`
  (**GPL-3, sólo consulta**) — https://github.com/kevzettler/parse-magica-voxel ✓
- Técnica de rebanadas apiladas: SpriteStack — https://spritestack.io/ ≈ · guía avanzada —
  https://medium.com/@dev_dwarf/advanced-guide-to-sprite-stacking-using-gamemaker-studio-2-5b133ae5ca64 ≈ ·
  https://www.samd.is/2020/04/10/sprite-stacking.html ≈

**Cómo**
1. `modules/tablero3d/public/vox.js`: leer `SIZE`, `XYZI`, `RGBA`; cada Z = rebanada; → documento
   `obj` del editor (`newDoc('obj')`). Modelos mayores que el límite: recortar o reducir con aviso.
2. `modules/tablero3d/public/ase.js`: cabecera, cuadros, capas, cels (zlib vía
   `DecompressionStream`), etiquetas → capas, cuadros y (con R6) animaciones del editor.
3. Botón «Importar archivo» en «Nuevo dibujo»; «Reducir a la paleta» si los colores no son de la
   paleta activa.
4. Escribir los lectores desde la especificación (sin copiar código GPL).

**Hecho cuando:** un árbol `.vox` aparece como objeto; un `.aseprite` de 3 capas y 4 cuadros abre
con sus capas y cuadros; fixtures binarias pequeñas en `test/fixtures/` con píxeles esperados.

### <a id="e7"></a>E7 — Compartir arte entre tableros · M

**Qué:** biblioteca del director común a todos sus tableros (terrenos, objetos, personajes, piezas)
y paquetes de arte exportables/importables; base del futuro mercado.

**Fuentes**
- Mercado de recursos pixel art en itch.io — https://itch.io/game-assets/tag-pixel-art ≈
- Licencias de OpenGameArt (CC0, CC-BY, CC-BY-SA, OGA-BY, GPL) — https://opengameart.org/content/faq ≈
- CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/legalcode.en ≈ · selector —
  https://creativecommons.org/chooser/ ≈

**Cómo**
1. **Datos:** tabla `t3d.library (owner_id, id, kind, name, record JSONB, license, author,
   created_at, updated_at)` sin `board_id` (migración nueva); «Usar en este tablero» copia al
   tablero (`t3d.drawings`/`t3d.prefabs`).
2. **Paquete** = archivo `.t3dpack` (JSON comprimido) con manifiesto: nombre, autor, **licencia**
   (CC0, CC-BY 4.0, propia), versión, lista de dibujos/piezas/terrenos y miniaturas.
3. Importar valida cada entrada con los mismos `clean*` del servidor y respeta la cuota del tablero.

**Hecho cuando:** exportar el pueblo (terrenos + piezas + personajes) como paquete e importarlo en
otro tablero de otro director, con la licencia visible.

### <a id="e6"></a>E6 — Comodidad del editor · B-M

Historial visible (lista de pasos navegable), espacios de trabajo guardados (disposición de
paneles, en `localStorage` con prefijo `t3d-`), atajos configurables y **paleta de comandos**
(Ctrl+K) que busca cualquier acción del editor y del tablero.

**Hecho cuando:** Ctrl+K → «rellenar selección» ejecuta la acción; el historial permite saltar 5
pasos atrás.

### <a id="r16"></a>R16 — Contenido de partida (continuo)

**Qué:** lo que hace que la gente se quede es el contenido. Cada fase añade plantillas y piezas
listas: taberna de dos plantas (con R3), cripta, bosque con claro, campamento, puerto, cueva con río,
templo, mercado nocturno. Todas con luces de T4, muros de T6b y ambiente de T6c.

**Hecho cuando:** al cerrar cada fase, al menos dos plantillas nuevas que usen lo añadido.

---

## Fase B — Que se vea mejor

### <a id="r1"></a>R1 — Autotiling (transiciones automáticas) · M

**Qué:** bordes de hierba sobre tierra, orillas, bordes de acantilado y esquinas de muro que salen
solos según las casillas vecinas, en lugar del corte recto actual. Incluye los terrenos de R11.

**Fuentes**
- Tiled, conjuntos de terreno (esquinas, bordes, mixtos; el «blob» de 47 es mixto) —
  https://doc.mapeditor.org/en/stable/manual/terrain/ ≈ · fuente en GitHub:
  https://github.com/mapeditor/tiled/blob/master/docs/manual/terrain.rst ✓
- Clasificación de juegos de casillas — https://www.boristhebrave.com/2021/11/14/classification-of-tilesets/ ≈
- **Autotiling por cuartos** (RPG Maker A2) y su relación con la cuadrícula dual —
  https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/ ≈ · blog oficial de RPG Maker:
  https://www.rpgmakerweb.com/blog/classic-tutorial-how-autotiles-work ≈
- **Cuadrícula dual** (Oskar Stålberg; 15 piezas en vez de 47) — https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique/ ≈ ·
  implementación MIT: https://github.com/pablogila/TileMapDual ✓
- LDtk, reglas automáticas — https://ldtk.io/docs/general/auto-layers/ ≈ ·
  https://ldtk.io/docs/general/auto-layers/auto-layer-rules/ ≈

**Cómo**
1. **Elegir técnica** (spec corta): recomendado **cuadrícula dual** o **cuartos** — 5 piezas por
   terreno en vez de 47, fáciles de generar desde una casilla (E3).
2. Máscara de vecinos por casilla en una función pura (`modules/tablero3d/public/terreno.js`,
   probada en node); prioridad de terrenos (`priority` de R11 y tabla de fábrica: pasto > arena >
   camino…) decide quién monta a quién.
3. `composeAtlas` genera las piezas de borde de cada terreno (máscaras de ruido pixelado sobre la
   casilla base) salvo que el director las haya dibujado en «Todo el arte».
4. `buildChunk` elige las coordenadas de textura por cuarto; laterales con lengüeta del terreno de
   arriba; recálculo sólo alrededor de la casilla editada.
5. Interruptor «Bordes automáticos» por escena (apagado = aspecto actual).

**Hecho cuando:** arena junto a pasto muestra orilla irregular pixelada; tests de máscaras (todas
las esquinas); capturas antes/después; `buildChunk` de 128² no más de un 20 % más lento (R14).

### <a id="e3"></a>E3 — Herramientas para objetos por rebanadas y piezas de borde · M

- Generar las piezas de borde de R1 desde una casilla, con máscara ajustable.
- Dibujar sobre una vista 3D girable (el clic proyecta a la rebanada visible).
- **Revolver** un perfil (barril, columna, jarrón); extruir con bisel; pintar a través de varias
  rebanadas.
- Fuentes: SpriteStack — https://spritestack.io/ ≈ · 80.lv —
  https://80.lv/articles/developer-shows-how-to-make-2d-game-look-3d-with-sprite-stacking ≈

### <a id="r2"></a>R2 — Formas de bloque: rampa, escalera, medio bloque, cuña, diagonal · M-A

**Qué:** la superficie de una casilla puede tener forma, no sólo altura: caminos que suben,
escaleras de piedra, muros en diagonal.

**Fuentes**
- Crocotile 3D (casillas pixel art sobre formas simples) — https://crocotile3d.com/howto.html ≈
- Sprytile (MIT) — https://github.com/Sprytile/Sprytile ✓
- Mallado en juegos de vóxeles (útil también para rendimiento) — https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/ ≈
- Líneas sobre cuadrículas y visibilidad — https://www.redblobgames.com/grids/line-drawing/ ≈ ·
  https://www.redblobgames.com/articles/visibility/ ≈

**Cómo**
1. **Datos:** arreglos por casilla `shape` (0 cubo, 1 rampa, 2 escalera, 3 medio, 4 cuña,
   5 diagonal) y `rot` (0–3), serializados como `h`/`t`; ausente = cubo; `cleanMap` los valida.
2. `buildChunk`: plantilla de vértices por forma (caras inclinadas con la textura superior).
3. `Fichas.route`: rampas y escaleras conectan alturas sin salto; `Vision.los`/`lightReaches`: altura
   interpolada en el punto de cruce.
4. Herramienta «Forma» con **R** para girar.

**Hecho cuando:** una ficha sube una rampa de 3 niveles; la luz de una antorcha baja por una
escalera; tests de visión y caminos con rampas.

### <a id="r8"></a>R8 — Acabado estilo HD-2D · B-M

**Qué:** brillo suave en las luces (bloom), profundidad de campo suave, reflejos en el agua.

**Fuentes**
- Octopath Traveler (HD-2D: sprites en mundo 3D, profundidad de campo, sombras de sprites, niebla) —
  https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true ≈ ·
  Octopath II: https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style ≈
- three.js r128, pases clásicos (`EffectComposer`, `UnrealBloomPass`, `BokehPass`) —
  https://github.com/mrdoob/three.js/tree/r128/examples/js/postprocessing ✓ · ejemplos:
  bloom https://github.com/mrdoob/three.js/blob/r128/examples/webgl_postprocessing_unreal_bloom.html ✓,
  profundidad https://github.com/mrdoob/three.js/blob/r128/examples/webgl_postprocessing_dof.html ✓,
  pixelado https://github.com/mrdoob/three.js/blob/r128/examples/webgl_postprocessing_pixel.html ✓
- Manual r128 de posprocesado — https://github.com/mrdoob/three.js/blob/r128/docs/manual/en/introduction/How-to-use-post-processing.html ✓
- Render a baja resolución con `NearestFilter` — https://github.com/mrdoob/three.js/blob/r128/docs/api/en/textures/Texture.html ✓

**Cómo**
1. Vendorizar los pases de r128 en `modules/tablero3d/public/vendor/` (licencia MIT en
   `THIRD-PARTY-LICENSES.md`), cargados sólo si «Calidad alta» está activa.
2. Bloom sólo sobre píxeles muy brillantes (llamas, luz mágica, runas) en un objetivo de render de
   baja resolución con `NearestFilter` para no emborronar el pixel art.
3. Profundidad de campo suave y desactivable; agua con término especular de cielo y luces cercanas.
4. Interruptor «Calidad» en Vista y efectos; se apaga solo en móvil si baja del mínimo de R14.

**Hecho cuando:** capturas antes/después del pueblo de noche; fps medidos (R14) dentro del mínimo.

### <a id="e5"></a>E5 — Herramientas de dibujo · B-M

- Tinta de sombreado sobre rampas (ampliar «Sombra») — https://www.aseprite.org/docs/shading/ ≈ ·
  tintas: https://www.aseprite.org/docs/ink/ ≈
- Simetría con eje movible y radial — https://github.com/aseprite/docs/blob/main/symmetry.md ✓
- Pinceles de textura (trama de piedra, madera, paja) — https://aseprite.org/docs/brushes/ ≈
- Suavizado manual de contornos; reemplazar un color con toda su rampa; selección por color en toda
  la capa o todos los cuadros.
- Paletas: Lospec (lista, `.hex`/`.gpl`, API) — https://lospec.com/palette-list ≈ ·
  https://lospec.com/palettes/api ≈ · https://lospec.com/palette-list/importing-palettes ≈
- Otras referencias de editor: Pixelorama — https://orama-interactive.github.io/Pixelorama-Docs/ ≈ ·
  Piskel (Apache-2.0) — https://github.com/piskelapp/piskel ✓ · LibreSprite (GPL-2, consulta) —
  https://github.com/LibreSprite/LibreSprite ✓

---

## Fase C — Que cobre vida

### <a id="r6"></a>R6 — Animación de personajes (+E2) · M

**Qué:** caminar e inactivo por dirección y un cuadro de golpe, en vez de 3 vistas fijas.

**Fuentes**
- Etiquetas de animación de Aseprite — https://www.aseprite.org/docs/tags/ ≈ · fuente:
  https://github.com/aseprite/docs/blob/main/tags.md ✓ · papel cebolla:
  https://www.aseprite.org/docs/onion-skinning/ ≈
- Giro en 8 direcciones (Lospec) — https://lospec.com/pixel-art-tutorials/8-directional-turn-around-by-sandy-gordon ≈
- Cuántos sprites pide cada perspectiva (4/8 direcciones, espejado) —
  https://cxong.github.io/2022/03/how-many-sprites-do-different-perspectives-need ≈

**Cómo**
1. **Datos:** personaje con `anims: {idle, walk, hit}` × vista (frente, espalda, perfil; 8
   direcciones opcional) con cuadros y duración; formato actual = `idle` de 1 cuadro. Campo validado
   en `cleanDrawing`; migración si hace falta columna.
2. `buildCharTex` arma una hoja por personaje; el sombreador de sprites elige cuadro por tiempo y
   estado (quieto, andando por `path`, golpe al perder vida).
3. **E2** en el editor: etiquetas, duración por cuadro, papel cebolla multi-cuadro, ida y vuelta;
   R5 trae las etiquetas de `.ase`.
4. Respeta el ajuste de escena `animate` y `prefers-reduced-motion` —
   https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion ≈

**Hecho cuando:** el caballero camina con 4 cuadros al moverse y respira quieto; con «reducir
movimiento» queda quieto.

### <a id="r12"></a>R12 — Objetos animados · M

**Qué:** aspas del molino, banderas, rueda hidráulica, carteles y campanas, fuego, humo de chimeneas.
Un sistema común, no un parche por objeto.

**Fuentes**
- Manual r128 del sistema de animación (jerarquía de `Object3D` con pivotes) —
  https://github.com/mrdoob/three.js/blob/r128/docs/manual/en/introduction/Animation-system.html ✓
- Animación por cuadros de textura (`offset`/`repeat` sobre el atlas) —
  https://github.com/mrdoob/three.js/blob/r128/docs/api/en/textures/Texture.html ✓

**Cómo**
1. **Piezas móviles:** rebanadas o píxeles de un objeto marcados como pieza con eje, tipo (girar,
   balancear) y velocidad → malla hija con pivote.
2. **Objetos con cuadros:** varias versiones de rebanadas alternadas con el reloj del agua (`uFrame`).
3. Editor: marcar la pieza móvil y dibujar los cuadros (comparte etiquetas con E2).
4. Respeta `animate` y «reducir movimiento».

**Hecho cuando:** el molino del pueblo gira, una bandera ondea y un objeto dibujado se anima sin
código nuevo.

### <a id="r7"></a>R7 — Clima y efectos de pixel art · M

**Qué:** lluvia, nieve, niebla baja, chispas y humo; efectos de hechizo sobre las plantillas de área.

**Fuentes**
- `weather-fx` de JA-VTT (catálogo, intensidad, viento, `indoor`) — `ja-vtt/weather-fx/README.md`,
  `ja-vtt/server/rules.js` (`WEATHER_IDS`). **Mismos identificadores** (fixture + test de igualdad).
- `InstancedMesh` r128 — https://github.com/mrdoob/three.js/blob/r128/docs/api/en/objects/InstancedMesh.html ✓
- Dibujo instanciado — https://webglfundamentals.org/webgl/lessons/webgl-instanced-drawing.html ≈
- Nieve con sombreadores — https://soledadpenades.com/articles/three-js-tutorials/rendering-snow-with-shaders/ ≈ ·
  lluvia de partículas — https://tympanus.net/codrops/2021/03/17/tropical-particles-rain-animation-with-three-js/ ≈

**Cómo**
1. Partículas de 1–4 px en `InstancedMesh` (una llamada por tipo), presupuesto fijo por calidad.
2. Clima por escena `{id, intensity, wind, indoor}` como JA-VTT; bajo la **máscara de interiores de
   T6c** no llueve salvo los efectos marcados en `indoor`.
3. Humo y chispas desde luces con animación (T4) y desde R12.
4. Hechizos: hojas animadas sobre plantillas de área, lanzadas desde Partida y repartidas por la
   mesa en vivo (`emit` validado en el servidor).

**Hecho cuando:** lluvia con viento que no entra en casas; bola de fuego visible para todos.

---

## Fase D — Jugar mejor

### <a id="r13"></a>R13 — Muros finos en los bordes de las casillas · M-A

**Qué:** muros, puertas y ventanas en la arista entre dos casillas, como los segmentos de JA-VTT,
sin gastar una casilla entera. Completa T6b (hoy los tipos de muro son por casilla).

**Fuentes**
- Partes de la cuadrícula (caras, aristas, vértices) — https://www.redblobgames.com/grids/parts/ ≈
- Campo de visión con muros finos — https://www.redblobgames.com/x/2128-thin-wall-fov/ ≈ ·
  RogueBasin — https://www.roguebasin.com/index.php?title=Thin_walls ≈
- Muros en Foundry (movimiento, visión, sonido, puertas) — https://foundryvtt.com/article/walls/ ≈
- A* con aristas bloqueadas — https://www.redblobgames.com/pathfinding/a-star/introduction.html ≈

**Cómo**
1. **Datos:** aristas `{x, z, side: 'n'|'w', kind, open?, locked?}` con los `kind` de JA-VTT;
   compacto en la escena; `cleanMap` los valida.
2. `Fichas.route`: un vecino no es alcanzable si la arista está bloqueada para `move`;
   `Vision.los`/`lightReaches` comprueban la arista cruzada en cada paso del DDA.
3. Render: paneles finos con la textura del muro, puerta o ventana; herramienta que ajusta a las
   aristas.
4. Traducción directa a segmentos `wall` de JA-VTT (base de R10).

**Hecho cuando:** una casa de muros finos con puerta y ventana funciona igual que JA-VTT para
visión, luz y paso; tests por arista.

### <a id="r9"></a>R9 — Elementos interactivos · M

**Qué:** palancas que abren puertas, cofres, trampas ocultas, puertas secretas y zonas que se
revelan al entrar.

**Fuentes**
- Monk's Active Tiles (disparadores: entrar, salir, clic, puerta, combate; GPL-3 + Commons Clause,
  **sólo consulta**) — https://github.com/ironmonk108/monks-active-tiles ✓ · disparadores:
  https://github.com/ironmonk108/monks-module-wiki/wiki/Monk's-Active-Tile-Triggers ≈
- Roll20, puertas y ventanas (con llave, secretas) — https://help.roll20.net/hc/en-us/articles/11462645998999-Placing-Doors-Windows ≈

**Cómo**
1. Objetos con `link` (id de la puerta, zona o portal que activan) y disparadores simples
   (entrar, clic, abrir).
2. Estado en un documento nuevo de la mesa en vivo (añadir a `LIVE_KEYS` con saneado y permisos).
3. Secretos invisibles para jugadores hasta que el director los revele (filtrado en el servidor,
   como la privacidad de T6d).

**Hecho cuando:** una palanca abre una puerta para todos; el servidor rechaza que un jugador revele
una trampa.

### <a id="r15"></a>R15 — Escenas por jugador (grupo dividido) · M

**Qué:** cada jugador en una escena distinta, como JA-VTT (`board_members.scene_id`). Hoy (T6b) la
mesa en vivo sigue la escena del director. T6d lo valoró y lo deja aquí: con la privacidad por conexión ya hecha
(`rules.liveDocFor`), falta que la mesa en vivo tenga documentos por escena (fichas, puertas, planos, combate y niebla),
filtrar cada mensaje por la escena de cada conexión y rehacer portales, «Reunir al grupo» y la UI de «llevar».

**Fuentes**
- Escenas en Foundry («activar» frente a «llevar a un jugador») — https://foundryvtt.com/article/scenes/ ≈ ·
  https://github.com/Mr-Byte/pull-players-to-scene ≈
- Escenas en Owlbear Rodeo (mapas lado a lado) — https://docs.owlbear.rodeo/docs/scenes/ ≈

**Cómo:** usar `board_members.scene_id` del núcleo (ya existe); la mesa en vivo guarda estado por
escena; cada jugador recibe sólo la suya; el director ve una lista de escenas con quién está en cada
una y puede «llevar» a jugadores; los portales mueven a quien cruza.

**Hecho cuando:** dos jugadores en escenas distintas por un portal; cada uno sólo recibe la suya.

---

## Fase E — Puente y profundidad

### <a id="r10"></a>R10 — Exportar la escena 3D a 2D · M · **decisión pendiente**

**Decisión del usuario antes de empezar:** si el 2D es gratis y el 3D de pago, exportar 3D→2D puede
ser gancho («crea en 3D, juega en cualquier sitio») o restar valor al 3D. Técnicamente es igual.

**Fuentes**
- Universal VTT (`.dd2vtt`, Dungeondraft) — https://dungeondraft-encyclopaedia.gitbook.io/guide/final-steps/exporting-your-map/universal-vtt ≈ ·
  campos (`resolution{map_origin,map_size,pixels_per_grid}`, `line_of_sight`, `portals`, `lights`,
  imagen base64) — https://arkenforge.com/universal-vtt-files/ ≈ · soporte en Roll20 —
  https://help.roll20.net/hc/en-us/articles/41643201127831-Universal-Virtual-Tabletop-UVTT-Support ≈
- **Aviso:** no hay especificación formal publicada por el autor del formato; la «v2» que circula
  (`TheGeolama/uvtt-v2-specification`, universalvtt.org) **no es autoritativa**.
- Objetos de JA-VTT (`wall`, `light`, `token`, `asset`) — `ja-vtt/server/rules.js`.

**Cómo**
1. Cámara ortográfica cenital → PNG a N px por casilla (5 pies/casilla).
2. Muros (R13 y T6b) → `wall` con su `kind`; luces (T4) → `light` con su `preset`; fichas (T5/T6d)
   → `token`; imagen → `asset`.
3. Salida: escena nueva de JA-VTT vía su API cuando está integrado, o archivo `.dd2vtt` para otros VTT.

**Hecho cuando:** el pueblo se abre en una mesa 2D de JA-VTT con muros, puertas y luces; el objeto
exportado pasa el saneado de JA-VTT (probado con `test:ja-vtt`).

### <a id="r3"></a>R3 — Pisos y niveles · A

**Qué:** segundos pisos, balcones, puentes sobre el suelo, sótanos; ver por piso.

**Fuentes**
- Levels (Foundry) — https://github.com/theripper93/Levels ✓ · wiki: https://wiki.theripper93.com/levels ≈.
  **El módulo está retirado**: Foundry v14 lo integró como «Scene Levels» (franjas de elevación con
  visibilidad por nivel) — https://foundryvtt.com/releases/14.359 ≈. Tomar ese modelo.
- Dungeon Alchemist exporta una imagen + JSON por planta —
  https://github.com/brunocalado/da-level-importer ≈

**Cómo**
1. **Spec propia antes de empezar.** Modelo recomendado: **franjas de elevación** (como Scene
   Levels) = capas de suelo dispersas `{base, casillas:{i:{h,t,shape}}}` con su visibilidad.
2. Trozos de render por capa; «ver piso N» oculta las superiores (como los techos).
3. Ficha con `elevation` (ya existe) → piso; caminos entre capas por escaleras (R2) y portales.
4. Visión, luz y niebla por capa; revisar el coste de `computeFog`/`computeLight` (R14).

**Hecho cuando:** taberna de dos pisos con escalera; los de abajo no ven el piso de arriba.

---

## Siempre

### <a id="r14"></a>R14 — Rendimiento y móvil (continuo)

**Qué:** que funcione en un móvil medio. Hoy el pueblo va a ~20 fps en el navegador de pruebas
(WebGL por software, peor que un equipo real) con ~170–390 llamadas de dibujo.

**Fuentes**
- Liberar recursos y `renderer.info` (r128) — https://github.com/mrdoob/three.js/blob/r128/docs/manual/en/introduction/How-to-dispose-of-objects.html ✓
- Instanciado frente a fusionado (r128, con contador de llamadas) — https://github.com/mrdoob/three.js/blob/r128/examples/webgl_instancing_performance.html ✓
- LOD (r128) — https://github.com/mrdoob/three.js/blob/r128/examples/webgl_lod.html ✓
- `BatchedMesh` **no existe en r128** (entró en r159) — https://github.com/mrdoob/three.js/releases/tag/r159 ✓
- Consejos de three.js — https://discoverthreejs.com/tips-and-tricks/ ≈ · varias cosas por dibujo —
  https://webgl2fundamentals.org/webgl/lessons/webgl-drawing-multiple-things.html ≈ · buenas
  prácticas WebGL — https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices ≈
- Medir en un Android real — https://developer.chrome.com/docs/devtools/remote-debugging ≈

**Cómo**
1. **Mínimo:** 30 fps en un móvil de gama media en el pueblo; 45 fps en portátil sin GPU dedicada.
2. **Medición al cerrar cada fase:** fps, llamadas y triángulos (`renderer.info`, `#t3d-stats`) en
   el pueblo, el Taller de luces y una mazmorra de 128², en el navegador de pruebas y en un móvil real.
3. Técnicas por orden de rentabilidad: agrupar objetos repetidos en `InstancedMesh` o geometría
   fusionada (no hay `BatchedMesh` en r128); menos detalle a lo lejos (LOD); calidad automática
   (resolución de render, sombras, bloom, partículas) según fps; liberar texturas y geometrías.

**Hecho cuando:** cada fase cierra con su tabla de medidas en `docs/07-historial.md` y dentro del
mínimo.

---

## Referencias generales

- Generación procedural: Wave Function Collapse — https://github.com/mxgmn/WaveFunctionCollapse ✓ ·
  Oskar Stålberg, «Organic towns from square tiles» — https://www.youtube.com/watch?v=1hqt8JkYRdI ≈ ·
  «Beyond Townscapers» — https://www.youtube.com/watch?v=Uxeo9c-PX-w ≈
- Programación de juegos en cuadrícula (Amit Patel) — http://www-cs-students.stanford.edu/~amitp/gameprog.html ≈
- Estado de la técnica que se sigue: TaleSpire — https://talespire.com/ ≈ · MagicaVoxel —
  https://ephtracy.github.io/ ≈ · LDtk — https://ldtk.io/ ≈
