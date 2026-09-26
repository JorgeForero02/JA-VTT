# Fase 0 — Cimientos de las piezas con comportamientos (diseño)

Fecha: 2026-09-26. Estado: **aprobado** (conversación por partes y revisión escrita del usuario). Enmienda
del mismo día, aprobada: se mantiene la lista `props` de la escena en vez de una nueva, claves en inglés y
reglas de durabilidad (§3.2). Hoja de ruta y referentes:
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

Esta es **la base de todas las fases**: se diseñó para no tener que migrar datos después (decisión del
usuario del 2026-09-26: «será la base y será caro de cambiar»). Reglas de durabilidad:

- **Claves de datos en inglés**, como todo el formato guardado (`type`, `open`, `look`…) y como los
  nombres de JA-VTT/Foundry (`move`, `sight`, `light`, `hide`, `door`, `portal`). Los textos de la
  interfaz siguen en castellano.
- **Versionado**: la definición lleva `schema: 1`; una escena guardada con los campos nuevos pasa a `v: 2`
  (se siguen leyendo las `v: 1`).
- **Prefijo del id de definición**: `f:` fábrica (`f:chest`, `f:door`, `f:g`), `p:` pieza del tablero
  (`t3d.pieces`), `d:` definición **calculada** (no guardada) de un dibujo de objeto antiguo (`d:o_xxxx`).
- **Campos reservados desde ya** para no cambiar el formato después: `level` (pisos, fase 4) y `side`
  (borde de la casilla, muros finos, fase 4), `interactions` y `reactions` (fases 2 y 5).
- **Nombres de estado reservados** (ronda de arreglos 1 de la tarea 3): un estado de una definición del tablero
  (`p:`) no puede llamarse igual que un campo de la pieza colocada, o `complete()`/`stateOf` no sabrían si leen
  el estado o el campo propio: `type def uid x z v level side state id look target name preset r h color
  intensity anim angle rot darkness on open locked`. Esto incluye `open`/`locked`: una pieza propia con una
  tapa no puede llamar a su estado `open` (usa otro nombre, p. ej. `lid`); esos dos nombres quedan para el
  espejo de las puertas de fábrica.
- **Respaldo a la raíz de un estado**: sólo para `open` y `locked` (formato de antes de las puertas); si el
  estado es booleano (`values: [false, true]`), se coacciona con `!!v` (los datos viejos ya eran booleanos, pero
  así un `open: 1` residual no deja la puerta a medio cerrar). Cualquier otro nombre de estado sólo se lee de
  `state`, nunca de la raíz de la pieza.

```
definition {
  schema: 1, id: 'f:door' | 'p:xxxxxxxx' | 'd:o_xxxx', name, class: 'terrain'|'object'|'wall'|'hanging',
  template?: string,                                   // la plantilla elegida al crearla (fase 1)
  wallKind?:  'door'|'window'|'veil'|'cover'|'barrier'|'portal',  // sólo en las definiciones de fábrica que son
                                                          // muros de JA-VTT (su visión y su exportación al 2D);
                                                          // validateDef no lo escribe: las piezas del tablero no lo llevan
  art: { base: clave, byState?: { 'open=true': clave } },
  shape: { w: 1–8, d: 1–8, height: 0–8 (pasos de ¼ de casilla), orient: bool, random: bool,
           layer: 'ground'|'object'|'wall'|'hanging', low: bool },   // low: objeto bajo, la maleza lo oculta
  components: {
    move:       { block: bool, sides?: 'NESW' },        // sides: fase 4 (R13); hoy siempre la casilla entera
    sight:      'none' | 'limited' | 'block',           // qué tapa; 'limited' se admite y el motor la trata como 'block' hasta su fase
    light:      'none' | 'limited' | 'block',
    emitLight?: { preset, r, color, intensity, anim, angle, h, origin?: { px, py, s } },
    surface?:   { walkable: true, height },              // puentes (hoy `deck`)
    cost?:      1 | 2,                                   // terreno difícil
    hide?:      bool,                                    // maleza: oculta a quien está dentro
    gmOnly?:    bool,                                    // barrera: sólo la ve el director
    door?:      { lift?: number },                       // es puerta; lift: casillas que sube (la de la muralla, 1,5)
    portal?:    { looks: [...] },
    terrain?:   { liquid?, hazard?, anim?, prio, fringe? }   // sólo class 'terrain'
  },
  states?:   { nombre: { values: [...], initial } }     // ≤ 4 estados, ≤ 4 valores cada uno; nombre no reservado (ver abajo)
  variants?: [ { when: { estado: valor }, set: { componentes parciales, art? } } ]   // en orden; la última que cumple gana
  interactions: [], reactions: []                        // reservados: fases 2 y 5
}

pieza colocada = un elemento de la lista `props` de la escena (se mantiene la lista y su forma de hoy):
{ type,                    // como hoy: clave de arte y alias de la definición de fábrica ('chest' → 'f:chest')
  def?,                    // si falta, sale de `type`; 'obj:o_xxxx' → 'd:o_xxxx'; una pieza del tablero → 'p:…'
  uid,                     // id fijo por pieza ('u' + 8 caracteres base36), único en la escena; lo pone quien la crea
  x, z, v,                 // casilla y giro (0–3), como hoy
  level?: 0, side?,        // reservados (fase 4)
  state?: { … },           // estado propio según la definición (puerta: { open, locked })
  …campos propios de hoy   // luz: preset, r, h, color…; portal: id (entero), look, target, name
}
```

- **Puerta de fábrica** = `states: { open: {values:[false,true]}, locked: {values:[false,true]} }` + variante
  `when: {open: true} → move: {block:false}, sight: 'none', light: 'none'`. El «tipo + estado» repartido en
  el código (§2) pasa a vivir en la definición.
- **Vuelta atrás segura**: durante las fases 0 y 1 las puertas escriben su estado en `state` **y** en los
  campos de hoy `open`/`locked` (lo que lee la versión anterior). La copia se quita en la fase 2 (anotado).
- Los datos propios de cada pieza (luz, portal) **se quedan donde están hoy**: nada de cajas nuevas que
  obliguen a migrar.
- Los **terrenos** siguen siendo letras de `M.t` en esta fase; cada letra apunta a `f:<letra>`.
- **`blocks(pieza, flag)` sin `wallKind`** (ronda de arreglos 1): las piezas del tablero y el mobiliario de
  fábrica no tienen `wallKind`, así que se decide por componentes en vez de por la semántica de `Muros.blocks` de
  hoy: `move` → `move.block`; `sight`/`light` → el componente **`!== 'none'`** (así `'limited'` tapa igual que
  `'block'` hasta su fase); `hide` → `hide || sight !== 'none'`. Con `wallKind` (los muros de JA-VTT de fábrica)
  se mantiene la semántica de hoy — portal de suelo no tapa, etc. —, también comparando `!== 'none'`. Para las
  piezas de fábrica sin `wallKind` el resultado no cambia, porque sus componentes de vista y luz son siempre
  `'none'`.

### 3.3 Guardado y API

- Migración `t3d/007-piezas.sql`: tabla `t3d.pieces (board_id, id, name, data jsonb, size, created_at,
  updated_at)`, clave `(board_id, id)`, `ON DELETE CASCADE` a `public.boards`; cuenta en la cuota del tablero.
- API `GET /api/t3d/boards/:id/pieces` (miembros; al jugador se le omiten las definiciones con `gmOnly`,
  que nunca se le dibujan) · `PUT/DELETE …/pieces/:pid` (director). Tope: 300 definiciones y 64 KB por
  definición.
- **Escenas**: se mantiene la lista `props`. Al leer (cliente y servidor, con la misma función del catálogo)
  se **completan** los campos que falten: `def` desde `type`, `uid` nuevo si no hay, `state` de las puertas
  desde `open`/`locked`. Al guardar se escribe `v: 2` con todo completo. Una escena vieja es válida tal cual:
  no hay traducción que pueda perder datos.
- **Mesa en vivo**: `live/doors` sigue como está (claves `x_z`); se generaliza a estados por `uid` en la fase 2.

### 3.4 Motor (cliente)

`refreshEntities` pasa a construir, desde las piezas colocadas y el catálogo, las mismas estructuras de hoy
(`blocked`, `doorShut`, `lockedDoors`, `WALLAT`, `HAS_COVER`, luces, `DECK`) — así `PATHG`, `GRID`,
`vision.js`, `ambiente.js` y el resto **no cambian de interfaz**. `Muros.kindOf/blocks`, `isDoorType`,
`propLight`, `hideable`, `occupied`, `gridOf` y el editor leen componentes. `serialize`/`deserialize` usan el
formato nuevo y la traducción. El arte sigue igual.

### 3.5 Servidor

- `cleanMap` valida **cada pieza** contra su definición (fábrica o del tablero): tipo existente, `x`/`z` en
  rango, `v`, `uid` único, `state` válido según la definición, campos propios saneados según componente (luz,
  portal). Se acabó el «cualquier otro
  pasa tal cual».
- `sceneFor`/`campaignFor`/`liveDocFor`: al jugador **no se le mandan piezas con `gmOnly`** (hoy las
  barreras llegan y el cliente las esconde). Base para las secretas de
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
