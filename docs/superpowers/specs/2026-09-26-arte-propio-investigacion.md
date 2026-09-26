# Arte propio con comportamientos — investigación

Fecha: 2026-09-26. Estado: **investigación cerrada; enfoque B y fases aprobados** (ver «Decisiones tomadas» al final). Pide el usuario: crear arte propio
—terrenos, objetos, personajes, muebles, elementos con luz, más pisos, más tipos de puerta…— y que **no sea
sólo textura**: cada pieza con «todos los comportamientos posibles». Lo más largo: terrenos y objetos propios.

Contenido: 1) qué hay hoy en el tablero 3D · 2) cómo lo resuelven otros · 3) catálogo de comportamientos ·
4) enfoques para el modelo de datos · 5) propuesta de fases · 6) decisiones abiertas.

## 1. Qué hay hoy (inventario de `modules/tablero3d`, `main @ 1a8666c`)

### 1.1 Arte propio: sólo apariencia

El editor de dibujo guarda **dibujos** (`t3d.drawings`, `rules.js` `DRAWING_KINDS`) de tres tipos:

| Tipo | Qué es | Qué puede añadir además del aspecto |
|---|---|---|
| `tile` | Cara de una casilla de terreno (`g:top`, `g:side`…), con cuadros de animación | Nada: **sustituye** el aspecto de un terreno de fábrica (`TILE_SLOT`); no crea terrenos nuevos |
| `char` | Personaje (tamaño del lienzo `char_size`: diminuto…gargantuesco; vistas frente/espalda/perfil) | Nada de comportamiento: la ficha (vida, CA, visión…) va aparte, en la hoja |
| `obj` | Objeto por rebanadas (voxel apilado) | **Luz** (`light_spec`: píxel, radio, color, parpadeo, tipo de luz). Nada más |

Un objeto dibujado (`obj:o_…`) se coloca como pieza, pero su comportamiento está **fijo en el código**
(`tablero3d.js`, creación de billboards): siempre **sólido** (bloquea el paso), **1 casilla**, **giro al
azar**, no tapa la vista (`GRID.bk` sólo mira muros), sin estados, sin orientación, sin puerta, sin altura
pisable, sin varias casillas.

### 1.2 Comportamientos que ya existen, pero atados a un identificador fijo

**Terrenos** (`TERR`, 10 letras fijas en el mapa `M.t`): pasto `g`, arena `a`, camino `p`, piedra `s`, madera
`o`, muro `w`, agua `~`, adoquín `c`, nieve `n`, lava `l`. Comportamientos por letra: `w` bloquea paso, vista
y luz; `l` no se pisa y es animada; `~` es agua (profunda no se pisa; hay flujo `wsrc`); `anim`; prioridad de
bordes (`prio`, `fringe`). Una letra nueva exige código.

**Objetos de fábrica** (`PROP3D`, 32 + árbol, brasero, luz): banderas declarativas por tipo —

| Bandera | Qué hace | Cuántos la usan |
|---|---|---|
| `block` | sólido: bloquea el paso | 27 |
| `walk` | se cruza | 4 |
| `orient` | tiene frente (N/S/E/O) | 23 |
| `span:[w,d]` | ocupa varias casillas | 5 |
| `deck:n` | se pisa encima a cierta altura (puentes) | 2 |
| `light`, `lightS` | emite luz (radio, altura) | 2 |
| `door` | es puerta | 1 |
| `gmOnly` | sólo lo ve el director | 1 |
| `noShadow`, `rand`, `big`, `hidden`, `cat` | sombra, variación al azar, tamaño, oculto del menú, categoría | — |

**Muros y portales** (`muros.js`, `WALL_TYPES`): ya son **comportamiento como datos**: cada tipo es un
conjunto de banderas `sight`, `light`, `move`, más `hide` (maleza), `door` (abrir/cerrar), `portal` (lleva a
otra escena). Los 7 tipos (muro, puerta, ventana, velo, maleza, barrera, portal) son **preajustes** de esas
banderas. Puertas: `open`, `locked`; portales: `name`, `target`, `look` (5 aspectos). En 3D van **por
casilla**, no en el borde (R13).

**Luces** (`LIGHT_TYPES`, 12): radio, altura, color, intensidad, animación (fija, parpadeo, vaivén, pulso),
cono (`angle`), `darkness`, con o sin halo. Una luz es un objeto aparte o va dentro de un objeto dibujado.

**Techos** (`ROOF_MATS` 5 × `ROOF_SHAPES` 5) y **zonas interiores** por casilla (`zoneCells`); ventanas y
puertas abiertas dejan entrar la luz de fuera.

**Personajes** (`CHARS` de fábrica + dibujados): el comportamiento está en la **ficha** (tamaño, visión,
visión en la oscuridad, luz de ficha, vida, CA, velocidad, condiciones), no en el dibujo.

**Pisos**: no hay (hoja de ruta R3). Sólo alturas por casilla (`M.h`, 0–12) y puentes pisables (`deck`).

### 1.3 Dónde vive cada comportamiento (para generalizarlo)

| Comportamiento | Cliente (`tablero3d.js`) | Servidor (`rules.js`) |
|---|---|---|
| Paso | `PATHG.open` (terreno, `blocked`, puertas, `DECK`) | `PASSABLE_PROPS`, portales (`nearPortal`) |
| Vista y luz | `GRID.wall/door/bk` → `Vision.los`, `lightReaches` | privacidad de fichas (`visibleTo`), no la geometría |
| Luz | `lightOf(p)` (objeto, dibujo, portal, `PROP3D.light`) | `cleanLightProp`, `LIGHT_PRESETS` |
| Puertas | `doorShut`, `lockedDoors`, `passDoor`, `live/doors` | `DOOR_PROPS`, `liveChange('doors')` |
| Varias casillas | `PROP_SPANS` / `span` | `PROP_SPANS` (validación) |
| Oculto al jugador | `gmOnly`, maleza (`hide`) | `sceneFor`/`liveDocFor` |

Conclusión: **los muros ya siguen el modelo buscado** (banderas + preajustes). Los objetos, a medias
(banderas en `PROP3D`, pero sólo para los de fábrica). Los terrenos y los dibujos, nada. Lo que falta es que
**una pieza del usuario lleve sus propias banderas y estados**, y que el cliente y el servidor lean esas
banderas en vez de preguntar por el identificador.

## 2. Cómo lo resuelven otros

Tres búsquedas en paralelo (2026-09-26); fuentes enlazadas en cada punto. «(n. v.)» = no verificado en fuente
primaria.

| Producto | Qué es una «pieza» | Lo aprovechable | Lo que falla |
|---|---|---|---|
| **Foundry VTT V14** | Documentos separados: `Wall` (muro/puerta), `AmbientLight`, `Tile`, `AmbientSound`, `Region` + **Region Behaviors** | Restricción **por sentido** (`move`, `sight`, `light`, `sound`) con valores graduados: NONE, LIMITED (pasa uno, el segundo tapa), NORMAL, PROXIMITY/DISTANCE (según distancia a la fuente) y `dir` (un solo sentido). Puerta = estado del muro (`ds`: cerrada/abierta/con llave; `door`: normal/secreta), interacciones `open/close/lock/unlock/test`, animación (rastrillo, deslizar, batiente…) y sonido por transición. `LightData` común a luces y fichas (bright/dim, cono, color, animación, **rango de oscuridad en el que se enciende**, negativa, prioridad). **Behavior = `{type, enabled, params, events}`** adjuntable a un área (teleport, coste de movimiento, superficie, cambiar de nivel, **ToggleBehavior**). Niveles V14 = bandas de elevación con nombre; cada pieza dice en qué niveles existe | Comportamiento **repartido** en Wall, Tile, Region y módulos (tres sitios para «un área que hace algo»); restricciones de `Tile` sólo estéticas; scripts libres (`ExecuteScript`) como vía principal; la altura llegó tarde (años de módulos Wall Height/Levels). [walls](https://foundryvtt.com/article/walls/) · [LightData](https://foundryvtt.com/api/classes/foundry.data.LightData.html) · [regions](https://foundryvtt.com/article/scene-regions/) · [V14](https://foundryvtt.com/releases/14.359) |
| **Monk's Active Tile Triggers** (módulo de Foundry) | Pestaña «Triggers» en un tile | Lenguaje visual de reglas: gatillo (entrar, salir, clic, abrir puerta, combate…) → acciones (abrir/cerrar/bloquear puertas, cambiar imagen, luces, sonido, chat, daño, teleport), con quién, azar, cooldown y límite de usos. **Tagger**: etiquetas para que un gatillo actúe sobre otra pieza. [MATT](https://github.com/ironmonk108/monks-active-tiles) | Crece hasta ser programación; «Run Code» inseguro |
| **Roll20** | Barreras en la capa de luz + puertas y ventanas como objetos aparte | Barrera de un sentido; transparente = ventana | Luz sólo de fichas; sin sonido, sin grados, sin disparadores sin la API de pago, sin altura (n. v.: la ayuda devolvió 403) |
| **TaleSpire** | Tile, Prop o Creature; `IsInteractable`, caja de colisión, **malla de oclusión simplificada** distinta del arte | **Máquinas de estado compartidas** (puerta, cofre, trampilla) + scripts por estado; el cambio viaja por la red. Oclusión separada del arte (barata). Varios pisos en 3D libre y **plano de corte por jugador**; *hide volumes* del director; **puntos de anclaje** (antorcha en la pared). [dev log 207](https://bouncyrock.com/news/articles/talespire-dev-log-207) · [252](https://bouncyrock.com/news/articles/talespire-dev-log-252) | Sin puertas secretas; **luz de prop fija** (peticiones abiertas para radio y encender/apagar); piezas propias de tile/prop aún no oficiales; fallo real: scripts sin id por instancia (abrir una puerta abría un cofre de otra sala) |
| **Dungeon Alchemist** | Modelo 3D + **plantilla de comportamiento** al importarlo («Basic Object», «Flying Object») | Elegir una plantilla al crear la pieza rellena valores razonables. Un par imagen+JSON por piso | Los objetos **no bloquean vista ni paso** al exportar; puertas `door` 0 o 1 sin estado ni cerradura; luz sin parpadeo ni cono |
| **Owlbear Rodeo 2** | `Item` con `metadata` por extensión (claves por espacio de nombres) y `attachedTo` | **Luz secundaria**: sólo se ve si una luz primaria la alcanza (la hoguera enemiga). Luz enganchada a la pieza. Muro `doubleSided`/`blocking` | Puerta = tramo del contorno de la niebla, no una pieza; cada extensión inventa su modelo |
| **Universal VTT** (`.dd2vtt`) | Formato de mapa: `line_of_sight`, `objects_line_of_sight`, `portals{closed}`, `lights{range,intensity,color,shadows}` | Importar y exportar mapas listos | Sólo `closed`; sin cerradura, secreta, parpadeo ni altura |
| **Minecraft Bedrock** | Bloque definido por datos: `components` + `states` + **`permutations` (condición de estado → componentes que sustituyen)** + `traits` | **Componentes base + variantes por estado** (la lámpara: `is_lit` → `light_emission` 15 o 0). Colisión, selección y **opacidad a la luz 0–15** separadas. Traits que **rellenan el estado al colocar** (hacia dónde mira quien la pone). `multi_block` de hasta 4 partes. [estados](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockstatesandpermutations) · [componentes](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist) | Las combinaciones de estados explotan (tope 65.536); lo que no es declarativo exige script. **Java**: comportamiento en código y sólo el aspecto en datos (lo que tenemos hoy) |
| **Godot 4 TileSet** | Capas de datos por tile: física, **oclusión** (luz), navegación, **datos propios tipados**; *terrain sets* por vecinos | Capas separadas; autotile por esquinas y lados; animación con arranque desfasado | Datos por tile, no por casilla; los alternativos **no heredan** del base |
| **Tiled** | Tile con `class`, `properties` tipadas (enum, clase), colisión por tile, animación; **plantillas** | **Herencia con excepciones visibles** (lo heredado en gris, lo cambiado en negro); tipos declarados → formulario automático; conjuntos Wang | Sin estados; el motor interpreta todo |
| **RPG Maker MZ** | Tile con paso O/X/★ y **paso por cada lado**, escalera, arbusto, suelo dañino, etiqueta de terreno 0–7; **eventos con páginas** | Página = condiciones (incluidos **interruptores propios por instancia**) → gráfico → disparador (acción, contacto, automático) → acciones; **gana la página más alta**. Cofre de un solo uso sin programar | 4 interruptores propios; etiqueta 0–7; sin alturas |

**Lecciones que se repiten en todos:**

1. **El comportamiento tiene que ser datos**, no código por identificador (Minecraft Java, Dungeon Alchemist
   y nuestro `PROP3D` de hoy son el contraejemplo).
2. **Separar los sentidos**: paso, vista, luz y sonido son independientes (reja: deja ver, no pasar; cortina:
   al revés). Y **graduarlos** donde importa (Foundry LIMITED/PROXIMITY, Bedrock 0–15).
3. **Estados por instancia, definición compartida**: la definición dice qué estados hay y qué cambia en cada
   uno; cada pieza colocada guarda los suyos y un **id estable** (TaleSpire, Godot).
4. **Variantes que heredan y sólo sustituyen lo que cambia** (Bedrock, Tiled; Godot como error).
5. **Disparadores cerrados y declarativos** (catálogo de acciones), nunca código libre en una mesa
   multijugador (`ExecuteScript` de Foundry y «Run Code» de MATT como error).
6. **Una sola entidad** «pieza con comportamientos», no tres sistemas (error de Foundry).
7. **Reservar altura, niveles y lados desde el primer esquema** (Foundry tardó años).
8. **Plantillas al crear** (Dungeon Alchemist) y **formularios generados del esquema** (Tiled): el director
   no rellena 30 campos, elige «Puerta» y ajusta.

## 3. Catálogo de comportamientos

Todo lo que podría declarar una pieza. **(hoy)** = ya existe en el motor para alguna pieza de fábrica.

- **A. Forma y colocación** — huella en casillas `w×d` (hoy: `span`) · altura en casillas y fracciones · ancla
  · orientación N/E/S/O (hoy: `orient`) o libre · capa: suelo, objeto, pared (en el borde), colgante (del
  techo), techo (hoy: techos aparte) · variación al azar de arte o giro (hoy: `rand`) · encima de otra pieza
  (mesa → vela) o en un punto de anclaje · qué niveles ocupa.
- **B. Movimiento** — bloquea el paso (hoy: `block`/`walk`) y **por qué lados** (muros finos, R13) · terreno
  difícil: coste ×2 o por tipo de movimiento · superficie pisable a cierta altura (hoy: `deck`) · escalera o
  rampa que cambia de altura o de nivel · dañino al entrar o al empezar el turno (lava, trampa) · resbaladizo ·
  líquido: nadar, profundidad (hoy: el agua profunda no se pisa).
- **C. Percepción** — tapa la vista: no / limitada (tapa a partir de la segunda) / sí / según distancia ·
  **oculta a quien está dentro** (hoy: maleza, `hide`) · por lados · se desvanece desde arriba o al entrar
  (techos, copas de árbol) · sólo la ve el director (hoy: `gmOnly`) · **secreta**: el jugador la ve como otra
  cosa (una pared) hasta que se descubre · cobertura de 5e: media, tres cuartos, total.
- **D. Luz** — bloquea la luz, graduado (hoy: muros) · **emite luz**: tipo (preajuste), radio, color,
  intensidad, animación, cono y dirección, altura y **punto de origen en el dibujo** (hoy: `light_spec`) ·
  oscuridad mágica (hoy) · se enciende por estado o por la oscuridad del momento (farolas de noche) · **luz
  secundaria**: sólo se ve si alguien la ve · brillo propio sin alumbrar (runas, lava).
- **E. Sonido** (no existe aún; P-24) — emite: bucle, radio, volumen, amortiguado tras muros · sonido de la
  transición (la puerta que chirría) · bloquea el sonido.
- **F. Estados e interacción** — estados con nombre y valores (abierta/cerrada, encendida/apagada, rota,
  activada, 0–3…) · **cada estado cambia arte y comportamientos** (variante) · interacciones: abrir, cerrar,
  bloquear, desbloquear, encender, alternar, romper, registrar · **quién puede**: director, jugadores, dueño
  de la ficha, con llave (un objeto), con prueba (CD) · animación y sonido de la transición · estado inicial
  al colocar (hacia dónde mira, abierta o cerrada) · tipos de puerta: batiente, doble, rastrillo, corredera,
  trampilla, secreta, portal (hoy: puerta, reja y 5 aspectos de portal).
- **G. Disparadores** — gatillo: entrar, salir, empezar o terminar el turno en la casilla, interactuar, cambiar
  de estado, activarse otra pieza · condiciones: estado, rol, una sola vez, cooldown, azar · acciones (catálogo
  cerrado): cambiar el estado de esta pieza **o de otras por etiqueta**, mensaje al chat o al director, tirada
  (daño `2d6` de fuego, salvación CD), mostrar u ocultar piezas, llevar a otra escena o casilla (hoy:
  portales), sonido, encender o apagar luces.
- **H. Animación** — cuadros por estado, velocidad, arranque desfasado entre copias (hoy: terrenos y tiles
  animados a 4 c/s; personajes sin animar, R6) · animación de la transición (la puerta gira).
- **I. Reglas de partida** — etiquetas libres · notas del director · objeto rompible con PV y CA · CD para
  forzar, abrir o trepar.
- **J. Terrenos** (pieza de suelo) — todo lo de B, C y D, más: bordes y transiciones con los vecinos
  (autotiling, R1; hoy: `prio`/`fringe`) · líquido que fluye (hoy: agua, `wsrc`) · animado · caras de arriba,
  de lado y de abajo distintas · altura de caída.
- **K. Personajes** — vistas y direcciones, animaciones por estado (quieto, andar, atacar, caído; R6), tamaño
  (hoy), luz propia y visión (hoy, en la ficha), puntos de anclaje para efectos.
- **L. Pisos y niveles** — banda de elevación con nombre · la pieza dice en qué niveles existe · suelo y techo
  entre niveles · escaleras que cambian de nivel · qué ve cada jugador (corte por nivel, como el plano de corte
  de TaleSpire).

## 4. Enfoques para el modelo de datos

**A. Ampliar las banderas fijas del dibujo** (añadir `block`, `sight`, `span`… a `t3d.drawings`). Rápido
(días); cubre lo básico de A–D. Pero sin estados, sin puertas propias ni disparadores: habría que rehacerlo
para F y G. **Se queda corto** para lo pedido.

**B. «Pieza» = definición con componentes + estados y variantes + disparadores cerrados** *(recomendado)*.
Mezcla Bedrock (componentes y variantes por estado), Foundry (sentidos separados y graduados, luz común,
comportamientos tipados) y RPG Maker (condiciones y gatillos, interruptores por instancia):

```
definición  { id, nombre, clase: terreno|objeto|pared|colgante|personaje, plantilla,
              arte: { base: dibujo, porEstado: { abierta: dibujo2 } },
              forma: { w, d, alto, orienta, capa, niveles },
              componentes: { paso, vista, luz, emiteLuz, sonido, superficie, coste, oculta, secreta, … },
              estados: { abierta: bool, cerrojo: bool, encendida: bool, … },
              variantes: [ { si: { abierta: true }, cambia: { paso: libre, vista: no, arte: … } } ],
              interacciones: [ { acción: abrir, quién: jugadores, si: { cerrojo: false }, hace: [alternar abierta] } ],
              disparadores: [ { al: entrar, hace: [ tirada 2d6 fuego ] } ] }
instancia   { id estable, def, x, z, nivel, giro, estados, cambios? }   ← en la escena y en la mesa en vivo
```

- **Las piezas de fábrica pasan a ser definiciones de fábrica** (los 32 objetos, los 7 muros, los 10
  terrenos, las luces): un solo camino de código. El cliente y el servidor preguntan por componentes, nunca por
  el identificador. Es un **refactor sin cambio visible** que va primero.
- Validación completa en `rules.js` (esquema cerrado, topes de estados y de valores para que no exploten las
  combinaciones) y privacidad (secretas, sólo director) en el servidor, como hoy.
- La mesa en vivo sincroniza el **estado por instancia** (lo que hoy hace `live/doors`, generalizado).

**C. Scripts** (Spaghet de TaleSpire, macros de Foundry). **Descartado**: inseguro en una mesa multijugador,
difícil de validar en el servidor y de enseñar al director. Lo que B no cubra se añade como acción nueva del
catálogo.

**Terrenos en B**: hoy cada casilla es una letra fija (`M.t`). Con terrenos propios la escena necesita una
**paleta** (índice de casilla → definición de terreno) con tope por escena. Pide migrar el formato de escena
(leyendo bien las escenas viejas).

## 5. Propuesta de fases (cada una con su diseño, plan y despliegue)

| Fase | Qué | Por qué en este orden |
|---|---|---|
| **0. Cimientos** | Esquema de pieza (definición + instancia) y su validación; las piezas de fábrica reescritas como definiciones **sin cambio visible**; portar los tests del módulo (P-41) | Todo lo demás se apoya aquí; los tests hacen seguro el refactor |
| **1. Objetos propios con comportamiento** | Plantillas (Mueble, Decoración, Pared, Colgante, Luz, Puerta, Contenedor…) + panel «Comportamiento» en el editor de dibujo: huella y altura, orientación, paso (y lados), vista y luz, oculta, sólo director, emite luz, capa | Lo que más pides: muebles y elementos con luz |
| **2. Estados e interacción** | Estados con arte por estado; **tipos de puerta** (batiente, doble, rastrillo, corredera, trampilla, secreta) con cerradura, quién puede, CD y animación; luces que se encienden y apagan; cofres | «Más tipos de puerta» y todo lo que se abre o se activa |
| **3. Terrenos propios** | Terreno nuevo (no sólo sustituir el aspecto): paso, coste, dañino, líquido, resbaladizo, animado, caras; paleta por escena; transiciones con los vecinos (R1) | «La más larga» junto con los objetos; pide migrar el formato de escena |
| **4. Pisos y niveles** | Bandas de altura con nombre, piezas por nivel, suelos y techos, escaleras que cambian de nivel, corte por jugador (R3); muros finos por lado (R13) | «Más pisos»; el esquema lo reserva desde la fase 0 |
| **5. Disparadores** | Catálogo cerrado de gatillos y acciones, etiquetas entre piezas: trampas, palancas, placas | Da vida a lo anterior |
| **6. Personajes** | Animaciones por estado (R6), anclajes de efectos | El comportamiento del personaje ya vive en la ficha |
| **Siempre** | Rendimiento y móvil (R14, P-40) al cerrar cada fase; sonido cuando exista (P-24) | — |

## 6. Decisiones abiertas (para el usuario)

1. **Alcance de una pieza**: ¿por tablero (como hoy los dibujos) o una **biblioteca del director** compartida
   entre sus tableros (E7)?
2. **¿Pueden los jugadores crear piezas?** (P-37) ¿O sólo el director?
3. **Grados de vista y luz** (limitada, según distancia) desde la fase 1, o sí/no primero.
4. **Disparadores**: ¿hasta dónde? (sólo cambiar estados y avisar, o también tiradas, daño, teleport).
5. **Pisos**: ¿niveles con nombre (como Foundry V14) o alturas libres (como TaleSpire)?
6. **Terrenos por escena**: ¿cuántos distintos como máximo en una escena (tamaño de la paleta)?
7. **Interoperar con Universal VTT** (`.dd2vtt`): ¿importar mapas de Dungeondraft y otros? (sería otra fase)

## Decisiones tomadas (2026-09-26, usuario)

- **Enfoque B** y **fases en el orden propuesto** (0 → 6).
- **Pregunta 1 — alcance:** las piezas son **del tablero** (como los dibujos), con «traer piezas de otro
  tablero mío» (copia). Una biblioteca personal podría llegar después sin rehacer nada.
- **Pregunta 5 — pisos:** **niveles con nombre** apilados, vistos en 3D completo (los de arriba se
  desvanecen o cortan al trabajar abajo), con visión y luz entre niveles. Se diseña en la fase 4; el esquema
  reserva `nivel` desde la fase 0.
- Todo dentro de `modules/tablero3d`, **sin tocar el 2D** (sólo tests y su configuración fuera del módulo).
- Método: cada fase con los 4 pasos (investigar a fondo, catálogo, enfoques, diseño/plan) y documentada
  ([04](../../04-convenciones.md) B.1b).
- Pendientes de decidir en su fase: 2 (jugadores creando piezas), 3 (grados de vista y luz), 4 (alcance de
  las reacciones automáticas), 6 (tope de terrenos por escena), 7 (Universal VTT).
