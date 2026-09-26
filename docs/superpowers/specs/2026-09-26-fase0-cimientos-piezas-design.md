# Fase 0 — Cimientos de las piezas con comportamientos (diseño)

Fecha: 2026-09-26. Estado: **diseño aprobado en conversación por partes** (arquitectura, pieza, flujo de
datos, pruebas); pendiente de revisión escrita del usuario. Hoja de ruta y referentes:
[investigación](2026-09-26-arte-propio-investigacion.md). Método: [04](../../04-convenciones.md) B.1b.

## 1. Objetivo y alcance

Dejar el tablero 3D listo para que las fases siguientes añadan piezas propias con comportamiento **sin
reescribir el motor cada vez**. Tres cosas:

1. Un **esquema de pieza** (definición + pieza colocada) validado en el servidor.
2. Las **piezas de fábrica** (32 objetos, árbol, brasero, luz, 7 tipos de muro, 10 terrenos) escritas como
   definiciones en un **catálogo único** que leen el cliente y el servidor.
3. El motor y el servidor **preguntan por componentes**, no por identificadores.

**Sin cambio visible** para el usuario, salvo los arreglos listados en §6 (fallos que la investigación
encontró), cada uno con su test.

**Fuera de alcance** (fases siguientes): pantalla de piezas propias y plantillas (1), estados con arte e
interacciones (2), terrenos propios y paleta (3), niveles (4), reacciones (5), animación de personajes (6).

**Frontera**: todo dentro de `modules/tablero3d`. Fuera sólo `test/` y la configuración de tests de
`package.json`. **Ni una línea del 2D ni de `server/`**; si hiciera falta, se para y se consulta.

## 2. Qué dice la investigación del código (paso 1)

Mapa completo de sitios que deciden por identificador (agente de lectura, 2026-09-26, comprobado a mano en
los puntos críticos):

| Categoría | Sitios | Dónde, sobre todo |
|---|---|---|
| Paso | 24 | `refreshEntities`, `PATHG`, `occupied`, `applyTool`; `gridOf` en `muros.js` y `rules.js` |
| Visión y luz (qué tapa) | 22 | `GRID`/`AGRID`, `Muros.kindOf/blocks`, `vision.js` `low1`, `hideable` |
| Emisión de luz | 20 | `propLight` (cadena por orden), `objLightSpec`, `cleanLightProp`, `cleanDrawing` |
| Puertas y portales | 30 | `isDoorType`, `canOpenDoor`, `toggleDoor`, `doorPose`, portales y campañas; `playerDoors` |
| Privacidad (servidor) | 8 | `sceneFor`, `liveDocFor`, `campaignFor`, `portalsRoute` |
| Validación (servidor) | 12 | `cleanMap`, `cleanProp`, `cleanWallProp`, `cleanLiveDoc('doors')` |
| Serialización | 16 | `serialize`/`deserialize`, `serializeOf`, `campStore`, `cleanMap` |
| Dibujo y mallas | 30 | `TERR`, `PROP3D`, `buildChunk`, `addBill`, `updateBills`, techos, minimapa |
| Editor y menús | 20 | paletas, `applyTool`, `placeWall`, `openCtx`, editor de dibujo |
| Mesa en vivo | 10 | `live/doors`, `handleLive`, `liveChange`, `handleTravel` |

Lo que más importa para el diseño:

- **El «qué es cada tipo» está repetido en tres sitios** sin test que los compare: puerta (`rules.js`
  `DOOR_PROPS`, `muros.js` `DOOR_PROPS`, `PROP3D.door`), pisable (`PASSABLE_PROPS`, `Muros.PASSABLE`,
  `PROP3D.walk` + `'light'` a mano) y varias casillas (`PROP_SPANS`, `Muros.SPANS`, `PROP3D.span`). El
  catálogo único lo sustituye.
- **`PROP3D.block` no lo lee nadie**: bloquear es lo que pasa cuando falta `walk`.
- **Sitios delicados** (un error rompe visión, privacidad o guardado): `sceneFor`/`portalsRoute`,
  `serialize`/`deserialize` (listas fijas: lo nuevo se pierde en silencio), `cleanProp`/`cleanWallProp`,
  `refreshEntities` (única fuente de bloqueados, puertas, `WALLAT`, luces), `Muros.kindOf/blocks` + `GRID`,
  `playerDoors` (autorización en el servidor), `gridOf` (cliente y servidor), `propLight` (orden),
  `hideable` (mezcla categoría de menú con visibilidad), `normProp`/`fixPortalIds` (iguales en los dos lados).
- **Dependen de tipo + estado**: puerta + `open`/`locked` (paso, visión, luz de ventanas, dibujo, mesa en
  vivo), portal + `look` (tapa si es de pie; sólo el mágico alumbra) y + `target`, luz + `on`/`darkness`/
  `angle`, maleza (activa el cálculo de ocultos), barrera + quién mira, muro + techo abierto, agua + puente.

## 3. Diseño

### 3.1 Catálogo único (`modules/tablero3d/public/catalogo.js`)

Un archivo que funciona en el navegador (`Tablero3D.Catalogo`, cargado por `t3d.js` como los demás) y en
Node (`module.exports`, lo usa `rules.js`), como ya hacen `dados.js`/`muros.js` con sus pruebas. Contiene:

- `COMPONENTES`: esquema de cada componente (campo, tipo, valores, por defecto).
- `FABRICA`: las definiciones de fábrica (`f:chest`, `f:door`, `f:wall`, `f:g`…), **generadas a partir de los
  datos de hoy** (`PROP3D`, `WALL_TYPES`, `TERR`, `LIGHT_TYPES`) para que no haya dos fuentes; lo que hoy son
  listas sueltas (`PASSABLE_PROPS`, `PROP_SPANS`, `DOOR_PROPS`) pasan a ser **consultas** sobre el catálogo.
- Funciones puras: `defDe(tipo)` (tipo guardado → definición), `componente(def, estado, nombre)` (aplica
  variantes), `normalizar(def)` y `validar(def)` (la misma en cliente y servidor).

El dibujo de las mallas (`PROP3D.fn`, texturas de `TERR`) **se queda en `tablero3d.js`**: el catálogo describe
comportamiento y referencia el arte por clave.

### 3.2 Definición y pieza colocada

```
definición {
  id: 'f:door' | 'p_xxxxxxxx',  nombre, clase: 'terreno'|'objeto'|'pared'|'colgante', plantilla?,
  arte: { base: clave, porEstado?: { valor: clave } },
  forma: { w: 1–8, d: 1–8, alto: 0–8 (casillas, admite ¼), orienta: bool, capa: 'suelo'|'objeto'|'pared'|'colgante' },
  componentes: {
    paso:       { bloquea: bool, lados?: 'NESO' },              // lados: fase 4 (R13); hoy siempre la casilla entera
    vista:      'no' | 'limitada' | 'si',                         // limitada: se admite en el esquema, el motor la trata como 'si' hasta la fase 1
    luz:        'no' | 'limitada' | 'si',                         // qué tapa
    emiteLuz?:  { tipo, r, color, intensidad, anim, angulo, h, origen?: { px, py, s } },
    superficie?:{ pisable: bool, altura },                         // puentes (hoy `deck`)
    coste?:     1 | 2,                                             // terreno difícil (hoy agua poco profunda)
    oculta?:    bool,                                              // maleza: oculta a quien está dentro
    soloDirector?: bool,                                           // barrera
    puerta?:    { abrible: true, llave: bool, levanta?: bool },   // fase 2 la amplía (tipos, quién puede, CD)
    portal?:    { aspectos: [...] },
    terreno?:   { liquido?, dañino?, anim?, prio, bordes? }        // sólo clase terreno
  },
  estados?:  { nombre: { valores: [...], inicial } }  (≤ 4 estados, ≤ 4 valores),
  variantes?: [ { si: { estado: valor }, cambia: { componentes parciales, arte } } ]   (la última que cumple gana),
  interacciones: [], reacciones: []                   // reservados: fases 2 y 5
}
pieza colocada { id (fijo), def, x, z, nivel: 0, giro: 0–3, estados?: {…}, extra?: {…} }
```

- **Puerta de fábrica** = `estados: { abierta: [false, true] }` + variante `abierta:true → paso libre, vista
  'no', luz 'no'`. Así el «tipo + estado» de §2 deja de estar repartido.
- `extra` lleva lo propio de ciertas piezas que no es comportamiento: luz suelta (`preset`, `r`, `color`…),
  portal (`id`, `look`, `target`, `name`), `locked` de la puerta (pasa a estado en la fase 2).
- Los **terrenos** siguen siendo letras de `M.t` en esta fase; cada letra apunta a `f:<letra>`.

### 3.3 Guardado y API

- Migración `t3d/007-piezas.sql`: tabla `t3d.pieces (board_id, id, name, data jsonb, size, created_at,
  updated_at)`, clave `(board_id, id)`, `ON DELETE CASCADE` a `public.boards`; cuenta en la cuota del tablero.
- API `GET /api/t3d/boards/:id/pieces` (miembros; al jugador se le omiten las definiciones con
  `soloDirector`, que nunca se le dibujan) · `PUT/DELETE …/pieces/:pid` (director). Tope: 300 definiciones y
  64 KB por definición.
- **Escenas**: al guardar se escribe el formato nuevo (`pieces: [colocadas]`); al leer, una escena vieja con
  `props` se traduce (`type` → `def`, `v` → `giro`, `open`/`locked`/portal → `estados`/`extra`, id nuevo
  fijo). `obj:o_xxx` → definición automática `p_o_xxx` con el comportamiento de hoy (sólida, 1×1, giro al
  azar, su luz). La traducción vive en el catálogo y la usan igual cliente y servidor.
- **Mesa en vivo**: `live/doors` sigue como está (claves `x_z`); se generaliza en la fase 2.

### 3.4 Motor (cliente)

`refreshEntities` pasa a construir, desde las piezas colocadas y el catálogo, las mismas estructuras de hoy
(`blocked`, `doorShut`, `lockedDoors`, `WALLAT`, `HAS_COVER`, luces, `DECK`) — así `PATHG`, `GRID`,
`vision.js`, `ambiente.js` y el resto **no cambian de interfaz**. `Muros.kindOf/blocks`, `isDoorType`,
`propLight`, `hideable`, `occupied`, `gridOf` y el editor leen componentes. `serialize`/`deserialize` usan el
formato nuevo y la traducción. El arte sigue igual.

### 3.5 Servidor

- `cleanMap` valida **cada pieza** contra su definición (fábrica o del tablero): tipo existente, `x`/`z` en
  rango, `giro`, estados válidos, `extra` saneado según componente (luz, portal). Se acabó el «cualquier otro
  pasa tal cual».
- `sceneFor`/`campaignFor`/`liveDocFor`: al jugador **no se le mandan piezas con `soloDirector`** (hoy las
  barreras llegan y el cliente las esconde) ni el `extra` que sea sólo del director. Base para las secretas de
  la fase 2.
- `playerDoors` y `gridOf` preguntan al catálogo (componente `puerta`, `paso`, `forma`).

## 4. Pruebas (cómo sabremos que no se rompió nada)

1. **Tests del módulo portados** de `3d-tablero/test/` a `test/t3d/` (P-41), contra el servidor real de
   JA-VTT: `t3d-module`, `t3d-host`, `armonia` y `cliente-armonia` y `frontend` (comparando con el código
   real de JA-VTT en vez de con copias congeladas), `privacidad`, `portales` y la parte de `realtime` del
   módulo (vía `/t3d/ws` con mesas marcadas 3D), `rules` (sus partes del módulo). Cada uno roto una vez a
   propósito. La cobertura de `modules/**/*.js` (sin `public/`) entra en `npm test`.
2. **Equivalencia** (el test clave): para cada pieza de fábrica, lo que hacía con los datos de hoy
   (`PROP3D`, `WALL_TYPES`, listas del servidor, `propLight`) = lo que dice su definición: paso, vista, luz,
   casillas, orientación, sólo director, superficie, luz que emite, y la puerta abierta/cerrada.
3. **Compatibilidad**: escenas y campañas guardadas con el formato de hoy (objetos de fábrica, dibujos,
   puertas con llave, portales con destino, luces) se abren, se traducen, se guardan y se vuelven a abrir
   iguales. API de piezas: permisos, validación, topes, cuota.
4. **Navegador**: `test:t3d` 26/26 y `test:ui` 54/54; capturas de la misma escena antes y después (píxeles).
5. **Rendimiento**: fps y tiempo de `refreshEntities`/visión en una escena grande (160×160 con muchos objetos)
   antes y después; sin empeorar.

## 5. Orden de trabajo (para el plan)

1. Portar los tests del módulo (red de seguridad), verdes sobre el código actual.
2. Catálogo + esquema + validación, con el test de equivalencia (rojo → verde).
3. Traducción de escenas viejas (tests de compatibilidad).
4. Servidor: `cleanMap`, privacidad, `playerDoors`, `gridOf`, migración 007 y API de piezas.
5. Cliente: `refreshEntities` y consultas por componente; serialización nueva.
6. Arreglos de §6, cada uno con su test.
7. Navegador, rendimiento, documentación (01–07, README del módulo) y despliegue con aprobación.

## 6. Fallos encontrados que se arreglan aquí (con test cada uno)

| Fallo | Dónde | Arreglo |
|---|---|---|
| Al jugador le llegan las barreras (sólo del director) en la escena; el cliente las esconde | `rules.js` `sceneFor` | No mandarlas (§3.5) |
| Objetos que no son luz ni muro se guardan sin validar (`x`/`z` ni tipo) | `rules.js` `cleanProp` | Validar contra la definición (§3.5) |
| Listas de puerta/pisable/varias casillas repetidas en tres sitios sin test | `rules.js`, `muros.js`, `PROP3D` | Catálogo único |
| Un dibujo que sustituye a un farol o brasero no puede quitarle la luz; los árboles no pueden tener luz propia | `propLight` (orden de la cadena) | Luz por componente de la definición |
| Al abrir una puerta no se recalcula la luz de las antorchas de detrás (visto en código; **se comprueba en el navegador antes de arreglar**) | `toggleDoor` | Recalcular la luz de la zona |
| `gridOf` (servidor y `muros.js`) y el paso del cliente discrepan en agua y puentes | `gridOf` / `PATHG` | **No se cambia en esta fase** (sería cambio de comportamiento): se documenta y se decide en la fase 3 (terrenos) |

## 7. Riesgos

- **Guardado**: un fallo en la traducción pierde datos en silencio → tests de compatibilidad con escenas
  reales de producción (copia anonimizada de las de `t3d.scenes`) y la copia de la base antes de desplegar.
- **Privacidad**: filtrar de más rompe al jugador; de menos, filtra → tests de privacidad portados + nuevos.
- **Tamaño**: toca ~170 sitios; se hace por categorías (paso, visión, luz, puertas…), cada una verde antes
  de la siguiente.

## 8. Decisiones abiertas que no bloquean esta fase

Jugadores creando piezas (2), grados de vista y luz en el motor (3), alcance de las reacciones (4), tope de
terrenos por escena (6), Universal VTT (7): se deciden en su fase. Esta fase sólo reserva sitio en el esquema.
