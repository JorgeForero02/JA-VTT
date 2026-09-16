# Modo 2.5D: integrar el diorama como segundo tipo de tablero

Fecha: 2026-09-16. Decisiones tomadas con el usuario en conversación. Origen: prototipo
`diorama-jav/` (index.html de 2935 líneas, three.js r128, sin persistencia ni red).

## Requisitos

1. Al crear un tablero se elige **2D** (el actual) o **2.5D** (bloques con desniveles, agua,
   cámara que gira, luces y visión por celda, objetos, explosiones, cuatro estilos de arte).
2. **Paridad completa** con el diorama en la primera versión: terreno, objetos y piezas de
   pared, luces, ver como, niebla de guerra y ambiental, agua, explosiones, arte propio, estilos.
3. **El front del diorama desaparece.** Sobrevive su motor como módulos; la interfaz es la de
   JA-VTT (login, dashboard, rail, panel, chat, dados, iniciativa, CSS) con sus opciones más las
   del diorama.
4. Todo el estado en PostgreSQL y validado por el servidor, como el resto del producto.

## Decisiones

| Tema | Decisión |
|---|---|
| Alcance del modo | **Por tablero**: `boards.settings.mode = '2d' \| '2.5d'`. Se elige al crear; **inmutable**. Tableros existentes → `'2d'`. |
| Terreno | Un **blob por escena** en tabla nueva `terrain` (migración 005): `n`, `h` bytea, `m` bytea, `extras` jsonb (objs, mounts, springs, sinks, evap, edgeDrain, style, fogAlpha, mist, cut, art), `version`, `updated_at`. |
| Agua | `W` **no se persiste ni viaja**: cada cliente la simula desde `springs/sinks`. Divergencia asumida (cosmético). |
| Fichas y luces | Siguen en `objects` (`token`, `light`) con `x,y` en px; celda `(cx,cz)` ↔ `x = cx*CELL+CELL/2`. `token.art` (criatura del catálogo o id de `images`); `light.mount` opcional `{cell, dir}`. |
| Objetos de terreno | En `extras.objs` (celda → `{kind, rot, open}`), editados por parches. Puertas: op `door` que los jugadores pueden usar según `playersDoors`. |
| Arte propio | `images` con `category='arte25'` + `extras.art` con recortes `{kind, imgId, fw, fh, ppc, frames}`. Nada en `localStorage`. |
| Niebla | Tabla `fog` actual con `cx=cy=0`, `data` = `n*n` bytes explorados por usuario y escena. |
| three.js | Un solo three: **r170 módulo** ya vendorizado. Port desde r128 (`WebGLMultisampleRenderTarget` → `WebGLRenderTarget({samples})`, chunks `encodings_fragment`→`colorspace_fragment`, `output_fragment`→`opaque_fragment`, `sRGBEncoding`→`colorSpace`, `ColorManagement` explícito). Validado con capturas antes/después. |
| Assets | `packs.png` → `public/img/packs25.png` como fichero (no incrustado). `assets/fuentes/` (2,4 MB) no se sirve. Fuentes: las nuestras. |
| Dependencias | Ninguna nueva. Sin bundler. |

## Tiempo real

Estado inicial (`t:'state'`) incluye `terrain` de la escena activa (`h`/`m` en base64). Mensaje
nuevo `terrain`, misma cola por tablero:

| Op | Quién | Cuerpo | Efecto |
|---|---|---|---|
| `cells` | gm | `{cells:[{i,h?,m?}], version}` ≤ 2000 | Subir/Bajar/Pintar/cráter |
| `grow` | gm | `{pad}` | Amplía `n` (≤118); reubica índices de objs/mounts/springs y niebla |
| `obj` | gm | `{i, kind\|null, rot}` | Poner/quitar objeto |
| `door` | gm o jugador | `{i, open}` | Jugador: sólo con `playersDoors` y puerta no bloqueada |
| `mount` | gm | `{key, kind\|null}` | Piezas de pared |
| `water` | gm | `{springs, sinks, evap, edgeDrain}` | Fuentes del agua |
| `settings` | gm | `{style, fogAlpha, mist, cut…}` | Ajustes 2.5D de la escena |

Servidor: `rules.cleanTerrainOp()` (índices en rango, `h` 0..9, `m` válido, `kind` en catálogo o
arte del tablero, tamaños). Aplica al blob en memoria, `version++`, `terrainDirty`, `flush()` cada
400 ms. Reenvía la op con la `version` nueva; cliente desfasado pide `t:'terrain'` completo.

- **Explosiones**: el director simula y envía el resultado (`cells` + borrados + `fx:{cell,level}`);
  los demás reproducen el efecto. Deshacer = parche inverso desde snapshot local.
- **Movimiento**: `ops` normal; el cliente 2.5D comprueba bloqueo (altura >1, objeto, puerta)
  antes de enviar. El servidor no revalida rutas (igual que en 2D).
- Ocultación de enemigos por LOS: en cliente (como 2D); `hidden` y planos: servidor.

## Cliente

`public/js/d3/` (módulos ES importando `../vendor/three.module.min.js`):

| Módulo | Del diorama (líneas) | Responsabilidad |
|---|---|---|
| `art.js` | 212–756 | Estilos, atlas, sprites, arte propio desde `images` |
| `world.js` | 1272–1640 | `H/M/W/objs/mounts`, `growWorld`, carga desde `terrain`, parches |
| `terrain.js` | 1002–1053, 1599–1640 | Pedestal, instanced meshes, `buildTerrain`, `relayout` |
| `water.js` | 1054–1133, 1641–1816 | Simulación, geometría, partículas |
| `vision.js` | 784–873, 1817–1889, 2089–2150 | LOS por alturas, lightmap, niebla; exporta explorado |
| `fx.js` | 1134–1174, 1890–2088 | Niebla ambiental, explosiones, humo, debris |
| `chars.js` | 1568–1598, 2151–2205 | Sprites de fichas, pathfinding, animación |
| `camera.js` | 2206–2291 | Cámara orbital, entorno, post-proceso |
| `input.js` | 2712–2861 | Raycast, punteros, teclas → `applyTool` |
| `index.js` | 2862+ | `D3.mount(stage)`, `D3.unmount()`, bucle, API pública |

Se elimina: HUD, `sheet`, `renderPanel`, `renderArte`, `renderSub`, escenas de demo,
`servidor.js`, `localStorage`. `core.js`: `is25()`. `render.js`/`editor.js` delegan en `D3` cuando
`S.mode==='2.5d'` (`#stage` oculta los canvas 2D y monta el WebGL). `net.js`: `t:'terrain'`,
`t:'fx'`. `store.js`: `S.terrain`. Agua y niebla respetan `PERF.scale` y `prefers-reduced-motion`.

## UI

- **Dashboard**: selector «Tipo de mapa: 2D / 2.5D» al crear; etiqueta `2.5D` en la tarjeta.
- **Rail** según modo: todos → Seleccionar/Mover ficha, Mover vista, Regla, Plano; director 2.5D
  → Subir, Bajar, Pintar, Agua, Objeto, Luz, Explosión, Ficha. Teclas 1–8. Girar (Q/E) y centrar
  (F) en `#subbar`. Cámara: arrastrar/rueda/pellizco como en el diorama.
- **Panel**: *Escena* añade estilo de arte, opacidad de niebla, niebla ambiental, muros
  recortados, efecto maqueta, tablero (tamaño/ampliar/auto), agua (evaporación, desagüe borde);
  quita fondo y capas 2D. *Luces*: biblioteca actual + colgar en pared. *Biblioteca*: categoría
  **Arte 2.5D** con recortador y «Arte en uso». *Fichas*: aspecto = criatura o arte propio.
  *Chat/Iniciativa/Mesa*: sin cambios.
- **Subbar**: material (Pintar), modo (Agua), objeto, preset de luz, nivel de explosión + Deshacer.
- **Ver como** = `roleSeg` ampliado con los personajes.
- **Editor** (`#editor`): objeto de terreno o pieza → girar, abrir/cerrar, bloquear, quitar.

## Errores

- `version` vieja → `t:'terrain'` completo; sin merge.
- Valor fuera de rango → op descartada + `fix` al emisor.
- Sin WebGL → aviso en `#stage`; chat/dados/iniciativa siguen.
- Arte propio con imagen borrada → vuelve al arte del estilo activo.

## Tests

- `rules.test.js`: `cleanTerrainOp`, `mode` en `cleanSettings`, `door` de jugador.
- `db.test.js`: migración 005, `terrain` guarda/lee, cascade al borrar escena.
- `realtime.test.js`: parche gm → otro cliente con `version+1`; jugador con `cells` → rechazado;
  persistencia tras descargar el tablero.
- `frontend.test.js`: módulos `d3/*` definen sus funciones.
- `test:ui` (Edge, `--use-gl=angle --use-angle=swiftshader`): tablero 2.5D, subir terreno, luz,
  capturas por estilo; capturas antes/después del port.
- `test:e2e`: un tablero 2.5D en producción.

## Fases (cada una: plan propio → código → `npm run check` → despliegue)

| # | Entrega | Verificable |
|---|---|---|
| A | Port r170 + módulos `d3/` + crear tablero 2.5D (sin persistir terreno) | Terreno visible en nuestro shell |
| B | Migración 005 + ops `terrain` + reglas + sync | Dos navegadores, mismo relieve |
| C | Fichas, luces, ver como, niebla por usuario | Jugador ve sólo lo suyo; niebla persiste |
| D | Panel completo, subbar, arte propio en `images`, 4 estilos | Paridad de opciones |
| E | Agua, explosiones, niebla ambiental, `test:ui`, docs 01–07 | Capturas + documentación |

## Criterios de aceptación

- Dado un usuario · cuando crea un tablero con tipo 2.5D · entonces `boards.settings.mode='2.5d'`
  y al abrirlo se ve el pedestal con terreno; `PATCH` de `mode` es ignorado.
- Dado el director en 2.5D · cuando sube una celda · entonces el otro cliente la ve con
  `version+1` y tras descargar y recargar el tablero la altura persiste en `terrain`.
- Dado un jugador · cuando envía `terrain cells` · entonces 0 cambios y `fix`.
- Dado un jugador con `playersDoors` · cuando envía `door {open:true}` de una puerta no
  bloqueada · entonces se abre para todos.
- Dado un tablero 2D existente · cuando se actualiza el servidor · entonces no cambia nada.
