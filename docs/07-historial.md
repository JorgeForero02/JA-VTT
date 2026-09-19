# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

## 2026-09-19 — El panel lateral pasa a ser una capa sobre el lienzo (desplegado)

**Qué** — `main` ya no tiene la columna de 330 px: `#panel` es `position:absolute` a la derecha, encima
del `#stageWrap` (lo que ya hacía en pantallas estrechas), con `#subbar{right:342px}` para que las
opciones de herramienta no queden debajo (`right:12px` con `noPanel`). Abrir/cerrar el panel **ya no
cambia el tamaño del `#stage`**: no hay reajuste de canvas, luz ni clima. Test de contrato en
`frontend.test.js`; `test:ui` 26/26 (el paso de abrir/cerrar con clima sigue midiendo la cuadrícula).
`prod-2d` `09fe180` desplegado (`x7y3vpfyk6pik3kaxvy3zuvl`); en `clima-2d` también.
**Por qué** — decisión del usuario: seguía viendo desfases al abrir/cerrar el panel con clima e imágenes
(no reproducidos aquí tras los tres arreglos anteriores: 0 renders inconsistentes de 228 y de 139 en el
primer montaje) y prefiere que el panel no mueva el lienzo. Coste: el panel tapa 330 px del mapa.
**Revertir** — revertir `09fe180` en `prod-2d` y redesplegar.

## 2026-09-19 — Clima: un frame estirado al abrir/cerrar el panel (hotfix desplegado)

**Qué** — Tras el arreglo anterior quedaba un frame malo que se corregía solo. Causa: `fx.app.resize()`
(ResizePlugin de Pixi) **renderiza en el acto** con el tamaño nuevo pero textura, sprite y uniformes
viejos; además `cScene` acababa de vaciarse. Arreglo en `weather.js`: `Weather.resize()` sólo pide un
frame; todo el reajuste va en `invalidate()` tras `drawScene` (canvas ya pintado) y sin renderizar:
`renderer.resize` → `fx.resize()` → textura (`resource.update`) → sprite (`fit`). `app.resizeTo=null` para
que Pixi tampoco renderice por su cuenta en el resize de ventana. **Evidencia** — instrumentando
`Renderer.render` en Edge con GPU real durante 4 toggles: código anterior 4 renders inconsistentes
(sprite 1012 con pantalla 1342 y viceversa), nuevo 0 de 228. Las capturas no cogen un frame de un tick:
por eso se midió dentro de la página. `test:ui` 26/26, `check` 68/68. `prod-2d` `f3fb687` desplegado
(`aq3gen3ronb5rh1q7qoca2dl`); en `clima-2d` también.
**Revertir** — revertir `f3fb687` en `prod-2d` y redesplegar.

## 2026-09-18 — Clima: el mapa refractado se estiraba al abrir/cerrar el panel (hotfix desplegado)

**Qué** — Con clima, al cambiar el ancho del `#stage` (panel lateral) el mapa refractado quedaba escalado
×(ancho nuevo/ancho viejo) y desplazado; fichas y objetos con él, muros y controles no. Causa: en
`Weather.resize()` se llamaba `fit()` **antes** de `invalidate()`; `mapSprite.width=` calcula la escala
con el tamaño de la textura en ese momento (viejo) y el sprite de Pixi sólo escucha el primer `update`
de la textura, así que no se corregía al redimensionarla. Arreglo: `invalidate()` (redimensiona la
textura) y después `fit()`. `test:ui` +1 paso: cerrar/abrir el panel con niebla mantiene el paso de
cuadrícula en 50 px; los criterios de cuadrícula buscan la cadena a 50 px (ignoran barra de iniciativa y
etiquetas) y toleran la pérdida de contraste de la niebla. Dos ejecuciones seguidas 26/26.
`prod-2d` `4db8ef2` desplegado (`jtsrw8wvgbbhmlm8xbse2a9x`); en `clima-2d` también.
**Lección** — el primer diagnóstico («pestaña con JS viejo») fue erróneo: la prueba anterior comparaba
tamaños, no alineación. Medir lo que el usuario ve (columnas de la cuadrícula), no el estado interno.
**Revertir** — revertir `4db8ef2` en `prod-2d` y redesplegar.

## 2026-09-18 — Clima: las zonas interiores no lo muestran, salvo los tipos que marque el director (desplegado)

**Qué** — Nuevo `weather.indoor = {id:true,…}` por escena (saneado en `rules.js`: sólo ids de la lista, sin
`none`). Casilla «Se nota en zonas interiores; se recuerda por tipo» en Escena → Clima. `weather.js`
`maskZones()`: si el tipo activo no está en `indoor`, la capa Pixi lleva una máscara (`PIXI.Graphics`,
pantalla menos cada zona, rect o polígono, mundo→pantalla con `UI.cam`) recalculada en cada frame
completo; dentro se ve `cScene` intacto (sin partículas, agua, tinte ni fogonazo). `test:ui` +2 pasos
(zona «Cueva» con niebla: dentro igual que sin clima ±4 de verde medio, fuera +10; casilla → dentro cambia
y el jugador recibe `indoor`). `prod-2d` `5844283` desplegado (`wkxddoz7dz3k0oxvospifg3a`); en
`clima-2d` `b94a0c8` (63/63 con 2.5D).
**Por qué** — petición del usuario: bajo techo no llueve, pero una cueva puede tener ceniza o niebla;
lo decide el director por tipo.
**Trampa vista** — el servidor local de `test:ui` arrancó antes de tocar `rules.js` y descartaba
`indoor`: reiniciar `node server.js` tras cambiar el servidor.
**Revertir** — revertir `5844283` en `prod-2d` y redesplegar; los `indoor` guardados son inertes.

## 2026-09-18 — Clima: muros, luz y controles desalineados con el mapa (hotfix desplegado)

**Qué** — Con clima activo, el mapa refractado no coincidía con muros, brillo y controles. Causa:
`_fitMap()` de `weather-fx.js` pinta el mapa con 16 px de sobremedida por lado (para que el rayo y la
refracción no enseñen el borde), lo que escala la copia (~3 %) y la desplaza; en el demo no se nota
porque todo va dentro de Pixi, aquí las capas de arriba no se refractan. Arreglo en `weather.js`:
`fit()` deja el sprite en 0,0 y `w×h` tras montar y tras cada `resize()`; el borde desplazado se ve
transparente un instante (debajo está `cScene` sin deformar). Medido con Edge + GPU real: sin fix la
cuadrícula caía en 39, 91, 143… (paso 51,7 px) frente a 3, 53, 103…; con fix ±1 px. `test:ui` gana un
paso de alineación (perfil de columnas con niebla) y se le portó `pngPixels`. `prod-2d` `99eefef`
desplegado (`m4ocir38utdlcmcczhqqvgke`); mismo fix en `clima-2d` (`eb911c3`).
**Revertir** — revertir `99eefef` en `prod-2d` y redesplegar.

## 2026-09-18 — Clima: `GL_INVALID_VALUE glCopySubTextureCHROMIUM` al redimensionar (hotfix desplegado)

**Qué** — El usuario vio en consola de producción `GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset
overflows texture dimensions`. Causa: `Texture.from(cScene)` fija el tamaño al crearse y
`invalidateSource()` (`baseTexture.update()`) no lo relee; nuestro `resize()` cambia `cScene` con la
ventana/paneles/dpr y Pixi hacía `texSubImage2D` con un canvas mayor que la textura (y al encoger,
imagen desalineada). Arreglo en `weather.js`: `invalidate()` llama `baseTexture.resource.update()`,
que redimensiona antes de marcar sucia. `test:ui` ahora captura también los `warning` de WebGL
(Chrome los emite así) y tiene un paso que redimensiona la ventana con clima. `prod-2d` `23b050d`
desplegado (`i9dm0bpvlcdk3k5ska0zizri`); mismo commit en `clima-2d`.
**Evidencia** — repro con Edge y GPU real: textura 1012×806 fija frente a canvas 1312×946 → error;
tras el arreglo la textura sigue al canvas (1312×946, 612×596) sin errores. `test:ui` 22/22, `check` 66/66.
**Revertir** — revertir `23b050d` en `prod-2d` y redesplegar.

## 2026-09-18 — Clima 2D desplegado en producción desde la rama `prod-2d`

**Qué** — Rama `prod-2d` = `34a7ba4` (lo que servía producción) + cherry-pick de los 4 commits
`feat(clima)` de `clima-2d`, resueltos a mano para no arrastrar nada del 2.5D (`weather.js` sin
`is25`, tests sin `window.S`). Coolify pasó de seguir `main` a **`prod-2d`** (`PATCH git_branch`) y
se desplegó `c4a7fbe` (deploy `kv0sxwxozkntd1mqu1xfrvkm`, 30 s). La rama `clima-2d` (clima sobre
`main` con 2.5D) queda para mergear en `main` cuando toque.
**Por qué** — el usuario quiere el clima en producción ya, pero **no** el 2.5D incompleto.
**Evidencia** — en `prod-2d`: `check` 66/66, `test:ui` 21/21, compose local + `test:e2e` 11/11.
Desde vps1new: `/`, `/api/health`, `/js/weather.js`, `/js/vendor/pixi.min.js` y `weather-fx.js`
200; `render.js` servido contiene `Weather.sync`; `index.html` contiene `weatherId`; `/js/d3/index.js`
**404** (sin 2.5D). Contenedores `app-d6qlm…`/`db-d6qlm…` healthy.
**Revertir** — `git push -f origin 34a7ba4:prod-2d` + `POST /deploy` (o `PATCH git_branch`).

## 2026-09-18 — Modo 2.5D: merge de `modo-25d-fase-a` en `main` y push (sin desplegar)

**Qué** — `git merge --ff-only` de la rama (47 commits, `e0d0ffa..2853f49`) en `main` y `git push` de
`main` y de la rama. `origin/main` iba por detrás de `main` local (`34a7ba4`), ambos ancestros de la
rama: avance rápido sin conflictos. Comprobado que Coolify **no** despliega por push (`instant_deploy:
false`): los contenedores de producción siguen «Up 2 days» sirviendo `34a7ba4`.
**Por qué** — decisión del usuario: consolidar A–D en `main`; el despliegue se hace al cerrar la fase E.
**Evidencia** — `git status -sb` → `## main...origin/main`; `docker ps` en vps1new sin contenedores nuevos.
**Revertir** — `git revert -m` no aplica (ff): `git reset --hard 34a7ba4` en `main` + `push --force` sólo
si nadie ha construido encima; mejor `git revert` de los commits concretos.

## 2026-09-18 — Modo 2.5D, fase D cerrada: panel, luces colgadas, menú contextual, arte propio, aspecto

**Qué** — D1 panel «Mapa 2.5D» (4 estilos de arte, opacidad de niebla, niebla ambiental, muros
recortados, maqueta, ampliar tablero, agua) por `D3.terrainOp`/`settings25`; `style` en `extras` y
aplicado al cargar. D2 herramienta Luz en 2.5D (suelta o colgada con `mount`, `D3.pickPlace`), clic
derecho → menú contextual (fichas/luces: el de JA-VTT; objetos de terreno: abrir/cerrar, llave, girar,
quitar), `mountValid` en servidor, `open` en la op `obj`. D3 arte propio: categoría `arte25`,
recortador en la Biblioteca, op `art` (rects, ≤ 64 cuadros, ≤ 200 entradas, ids `propio-*`), motor
que recorta en cada cliente y rehace el atlas, criaturas y objetos nuevos. D4 campo «Aspecto» con
miniaturas del motor (`D3.artThumb`) y `restyle` que reasigna el atlas del terreno. Ola final:
kinds propios sin imagen ya no matan el render del jugador (instancias retiradas antes de rehacer el
arte, guards en `removeObj`/`isDoor`/…, `applyRemoteOp` devuelve `false` al lanzar), el cliente aplica
`open`, `deferred` se limpia, `playerUpsert` copia `art`, y menores (tope al reintento de montaje,
`d.error` en el toast, Girar sólo en `fixed`, tecla L, `tile:[0-6]`…).
Flujo: subagentes Claude por tarea (implementador Sonnet/Opus + revisor + re-revisión acotada), revisión
final de toda la fase con Opus y una única ola de correcciones. Ledger con rulings en
`.superpowers/sdd/2026-09-16-modo-25d-fase-d/progress.md` (gitignorado); resumen en 08 §3.
**Por qué** — fase D de la spec del modo 2.5D (paridad de opciones con el diorama dentro del panel de
JA-VTT; arte propio en `images`, nada en `localStorage`).
**Evidencia** — `npm run check` 127/127 · `npm run test:ui` 55/55 (capturas 09-estilo-{pixel,pixel32,
drawn,packs} con atlas distinto, 17 farol, 18 menú, 19 pasto magenta, 20 esqueleto, luz colgada, objeto
propio «Tótem» re-recortado sin errores en el jugador).
**Revertir** — `git revert` de `00e6430..48a3d6e`. Sin migraciones; las filas `images` con
`category='arte25'` y las claves `extras.art`/`extras.style` quedarían huérfanas (el cliente anterior
las ignora).

## 2026-09-17 — 2.5D: barra de selección al elegir ficha, Supr/Escape, icono de Subir

**Qué** — El motor avisa al shell de la ficha elegida (`hooks.selected` → `opts.onSelect` →
`UI.selected`), así que en 2.5D aparece la barra Editar/Duplicar/Eliminar y el panel sigue a la
ficha; `D3.select(null)` desde Escape; borrar quita el anillo. En 2.5D pasan al editor Supr/Retroceso
y los atajos con Ctrl (flechas y WASD siguen siendo de la cámara). Icono `chevron-up` para Subir
bloque (antes `move`, flechas en cruz). Tocar la ficha elegida la suelta (con el ratón no había manera:
clic en casilla = mover). `test:ui` con esperas de 40/60 s y diagnóstico al fallar (P-12). Detectado por el
usuario probando a mano tras el cierre de C.
**Evidencia** — `check` 115/115 · `test:ui` 32/32 (pasos nuevos: la barra aparece con «Prueba»; el
segundo clic la quita).
**Revertir** — `git revert 7ff816b 4d9ad0f`.

## 2026-09-17 — Modo 2.5D, fase C cerrada: fichas, luces, ver como y niebla por celda

**Qué** — C1 servidor: `token.art`, `light.mount` en `sanitize`; niebla 2.5D como bytes crudos
(`base64:`) con una fila `cx=cy=0` por escena y usuario. C2 cliente: `syncTokens/syncLights` reflejan
`S.tokens/S.lights` como sprites (`light-map.js`: la luz lleva sus radios reales, el preset sólo elige
el sprite); `defOf(l)` en `vision.js`. C3: mover con dos clics y una sola `op` al llegar; Ficha/Enemigo
del rail crean en casilla (`D3.pickCell`); `changed()` refresca el motor porque el servidor no hace eco
al emisor. C4: `D3.setView({view,uid,gm,shared})`, `viewers()` como el 2D, `#blindNote` decidido por
el motor, entorno del tablero aplicado en el primer fotograma. C5: `G.exploredUser`, `loadFog/
takeDirtyFog/resetExplored` delegan en D3; bandera `ready` del motor (carrera `ART.art=null` que rompía
la pantalla del jugador). Auditoría final de toda la rama (A–C) con un guion Playwright aparte:
regresión 2D (fichas, arrastre, niebla PNG), puerta puesta por el director y abierta por el jugador,
`grow` con ficha y niebla encima, recarga tras crecer, «Ver como» ficha concreta → 14/14. Hallazgo
corregido: `obj/door/mount/water` no comprobaban el índice contra `n*n` (ahora lanzan → `fix`).
Tareas C1–C5 con OpenCode (kimi) y revisión aquí; correcciones de revisión: luz que nacía encendida,
eco local centralizado, entorno tardío, carrera del arte, logs de depuración.
**Por qué** — fase C de la spec del modo 2.5D. Divergencia deliberada con el 2D: jugador sin fichas
propias y `sharedVision=false` queda ciego (el 2D cae de vuelta al grupo) — P-11.
**Evidencia** — `npm run check` 114/114 · `npm run test:ui` 30/30 (capturas 11–16: sprite real
comparado con el atlas, movimiento `575,575 → 675,525`, ciego, vista del jugador, alternar
Director/Vista de jugador, niebla 212 celdas antes y después de recargar).
**Revertir** — `git revert` de `cbca4ae..c3d0fb9`. Sin cambios de esquema: la tabla `fog` ya era
BYTEA. Las filas de niebla 2.5D (`cx=cy=0`, bytes crudos) quedarían huérfanas: `DELETE FROM fog`
para las escenas de tableros 2.5D si se quiere limpiar.

## 2026-09-17 — Modo 2.5D, fase B cerrada: terreno persistente y editable

**Qué** — Migración 005 (`terrain`), módulo puro `server/terrain.js`, catálogo compartido
`public/js/d3/catalog.js`, permisos `rules.terrainOpAllowed`, mensaje WS `terrain` (validación,
control de `version`, reenvío, volcado con `flush`), cliente que construye el mapa desde el blob y
aplica ops remotas, `grow` con paridad servidor/cliente, y herramientas del director en el rail
(Subir, Bajar, Pintar, Objeto, Agua) con subbarra. Tareas B1–B5b con OpenCode (kimi-k3) y revisión
aquí; una corrección (Regla/Plano visibles en 2.5D). Aclarado que «Interior» oscuro sin luces es
correcto (la demo de la fase A tenía 7 antorchas).
**Por qué** — fase B de la spec del modo 2.5D.
**Evidencia** — `npm run check` 101/101 · `npm run test:ui` 23/23 (dos navegadores: la edición del
director llega al jugador con `version` 1 y 2; el jugador no puede editar).
**Revertir** — `git revert` de `b6a0590..558aebe`; la migración 005 es aditiva (`DROP TABLE terrain`
si se quiere limpiar).

## 2026-09-16 — Modo 2.5D, fase A cerrada (tareas 6–12): test:ui, motor en 12 módulos

**Qué** — `test:ui` con GPU por software y paso «tablero 2.5D» (19/19). Refactor sin cambio de
comportamiento de `engine.js` (2266 líneas) a 12 módulos en `public/js/d3/` (`ctx`, `art`, `water`,
`fx`, `vision`, `chars`, `camera`, `input`, `terrain`, `world`, `index`, `packmap`); `engine.js`
desaparece. Tareas 6–10 con OpenCode (kimi-k3) y revisión aquí; la 11 la hizo Claude Code tras
descartar un intento con GPT que perdía código. Correcciones halladas en revisión: grupos de sprites
sin añadir a la escena, errata `wz(cxOf)`, tildes perdidas al reescribir módulos, imports muertos.
**Por qué** — fase A del modo 2.5D (spec `superpowers/specs/2026-09-16-modo-25d-design.md`).
**Evidencia** — `npm run check` 70/70; `npm run test:ui` 19/19; captura `08-tablero-25d.png` idéntica
antes y después de cada troceo (comparación píxel a píxel); sonda de cámara y desmontaje sin errores.
**Revertir** — `git revert` de `3972904..428fe88` (vuelve al motor monolítico de `c3a5753`).

## 2026-09-16 — Modo 2.5D, fase A: estado del motor en `ctx.js` (tarea 7)

**Qué** — Refactor mecánico de `public/js/d3/engine.js`: se crea `public/js/d3/ctx.js` con el estado
compartido (`G` mundo, `S` escena, `R` renderer, `U` uniforms, helpers de índice y constantes). Las
variables mutables del módulo pasan a `G.*`/`S.*`/`R.*`/`U.*`; las colecciones se mantienen como
alias locales para no romper los cierres. Se corrige el test de T7 (import relativo) y el test de T4
(`G.visionDirty`). Se inicializan los arrays de simulación en `ctx.js` para evitar `null` en la
primera carga. Se restaura `S.animLights` con `prefers-reduced-motion`.
**Por qué** — Paso previo al troceo en módulos independientes (tareas 8–11 del plan); unifica el
estado y evita dependencias circulares.
**Evidencia** — `npm run check` 70/70 · `npm run test:ui` 19/19 (Playwright + Edge headless con
swiftshader; captura `08-tablero-25d.png` no plana).
**Revertir** — `git revert` del commit de esta tarea; no afecta datos de usuario.

## 2026-09-16 — Modo 2.5D, fase A hasta la tarea 5 (rama `modo-25d-fase-a`) y traspaso a OpenCode

**Qué** — spec `superpowers/specs/2026-09-16-modo-25d-design.md` (aprobada por secciones) y planes
A–E en `superpowers/plans/`. En la rama: `mode` de tablero inmutable (servidor + selector en el
dashboard), atlas CC0 extraído, motor del diorama portado a three r170 como módulo
(`public/js/d3/`), integración en el shell (canvas 2D ocultos, rail reducido, entorno sincronizado).
Cada tarea con implementador + revisor independientes; correcciones relevantes: `replace` también
respeta `mode`; el parche de sombras tenía que ir al `ShaderChunk`; parada segura del motor en
mitad de la carga. Comprobado que «terreno iluminado con Interior» es comportamiento del diorama
en vista Director, no un fallo. Se para en la tarea 5 por decisión del usuario: el resto se hará
con OpenCode (`opencode.json`, `.opencode/agent`, `.opencode/command`, `docs/08`).
**Por qué** — el usuario quiere mapas 2.5D como segundo tipo de tablero y cambia de herramienta.
**Evidencia** — `npm run check` 69/69; capturas en Edge headless del valle dentro del shell y del
2D intacto.
**Revertir** — no mezclar la rama; o `git revert` de `8e76e75..a8d6aa2`. Sin migraciones: los
tableros creados como 2.5D quedan como 2D sin datos.

## 2026-09-16 — Ajustes de chat/dados para todos, tiradas privadas, dados rediseñados, favicon

**Qué** — `diceEnabled` junto a `chatEnabled`, ambos en la pestaña Ajustes y apagan la función
para todo el mundo (la pestaña Chat desaparece si no queda nada). Tirada privada del director
(candado / `/rs`): sólo a sus pantallas, sin guardar. Dados: rótulos colocados por la geometría
real de cada cara (centro y radio inscrito; en el d4 un número por vértice), acabado con degradado
del color del jugador, filigrana dorada y número marfil con borde. Iniciativa: editor rehecho
(cabecera con ronda y turno, filas con marcador, herramientas agrupadas) y barra con colores
fijos (no dependía del tema y salía ilegible en tema claro). Favicon SVG propio (d20) en vez de emoji.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Recuperación de contraseña, chat, dados 3D e iniciativa

**Qué** — spec en `superpowers/specs/2026-09-16-chat-dados-iniciativa-recuperacion-design.md`.
Servidor: migración 002 (`users.recovery_code`, `chat_messages`), `server/dice.js`, rutas
`/api/recover`, `/api/me/recovery`, `/api/me/password`, mensajes WS `chat`/`roll`/`initiative`,
ajustes `chatEnabled` e `initiativeShown`. Cliente: pestaña Chat con botonera de dados y `/r`,
capa de dados 3D (`dice3d.js`, three.js + cannon-es; el servidor decide el resultado y el cliente
rotula las caras para que la que cae arriba lo muestre), barra de iniciativa sobre el mapa con
editor en Mesa, Perfil con código de recuperación y cambio de contraseña, «¿Olvidaste la
contraseña?» en la entrada. Prueba visual con Playwright + Edge (`npm run test:ui`, 14/14).
**Por qué** — pedido del usuario; comparación con otros VTT.
**Revertir** — `git revert` de los commits del 2026-09-16 (server y cliente); la migración 002 es
aditiva y puede quedarse.

## 2026-09-16 — Producción en https://tablero.supportive.pro

**Qué** — repo privado `JorgeForero02/JA-VTT`; app Coolify `ja-vtt` (uuid
`d6qlm5kzdoitlacr5br29fna`, proyecto D&D) desde `docker-compose.yml`, dominio
`tablero.supportive.pro` (antes PlanarAlly, borrado por el usuario; quedan sus tres volúmenes
`aloj51hvldbfcmvbxfkumfpq_planarally-*` sin uso). Detalle en [03](03-despliegue.md).
**Por qué** — pedido del usuario tras aprobar la prueba local.
**Evidencia** — 200 y certificado desde dentro; e2e 10/10 por WSS; restart por API sin perder
filas (3 usuarios, 2 tableros, 75 objetos). Cuentas `gm-mu3ck9p7`/`pl-mu3ck9p7` del e2e quedan
en la base (borrado remoto bloqueado por el clasificador); borrar con
`DELETE FROM users WHERE name IN ('gm-mu3ck9p7','pl-mu3ck9p7')`.
**Revertir** — `DELETE /api/v1/applications/d6qlm5kzdoitlacr5br29fna` (con volúmenes si se quiere
borrar la base) y quitar la deploy key del repo.

## 2026-09-15 — Nace Just Another VTT a partir de Mini VTT

**Qué**
- Repo git nuevo (`main`); commit inicial con el código original como línea base.
- Renombrado completo: paquete, UI, cookie (`jav_session`), localStorage (`jav.*`).
- SQLite → **PostgreSQL** (`pg`), migraciones SQL, todas las consultas asíncronas.
- **Login con contraseña** (scrypt); registro abierto; añadir miembro por nombre exige cuenta.
- `app.js` reescrito asíncrono: cola por tablero, cerrojo de volcado, cierre ordenado.
- Dockerfile + `docker-compose.yml` (Coolify) + override local; `.env.example`.
- Tests: 32 con `node:test` (db, auth, API, tiempo real, frontend) + e2e de 11 pasos.
- Docs 00–07, `CLAUDE.md`, `AGENTS.md`, README actualizado. Se retiran `iniciar.bat/sh`.

**Por qué** — el usuario quiere desplegarlo en vps1new con persistencia fiable y un login
mínimo; SQLite en un volumen y cuentas sin contraseña no servían.

**Cómo revertir** — el commit `chore: import Mini VTT source as baseline` es el original
funcional con SQLite. No hay migración de datos entre ambos (la base pg nace vacía).

**Evidencia** — `npm run check` 32/32 · `npm run test:e2e` 11/11 con `docker compose restart app`
· `down`+`up` conserva 2 usuarios, 1 tablero, 1 objeto.

## 2026-09-15 — Botón en la cabecera para ocultar el panel derecho

**Qué** — `#panelToggle` pasa a verse siempre. En pantallas anchas pliega la columna del
panel (`#app.noPanel`) y guarda la preferencia en `localStorage` (`jav.panel`); en
estrechas sigue abriendo el panel como capa. Iconos Lucide `panel-right-open/close`.
**Por qué** — pedido del usuario: más espacio de mapa en escritorio.
**Revertir** — `git revert` del commit `feat(ui): botón para ocultar el panel lateral`.

## 2026-09-16 — Cursores suaves y guardas contra el doble clic

**Qué** — los cursores de los demás se interpolan 110 ms hacia su posición nueva (misma
técnica que las fichas, `cursorPos` en `net.js`) y se envían cada ~50 ms. `withBusy()`
(`store.js`) desactiva los botones de un formulario mientras dura la petición: entrar / crear
cuenta, crear tablero, unirse por código, añadir miembro, regenerar código; crear escena lleva
un cerrojo de 1,5 s. Sin tests nuevos por decisión del usuario (cambios visuales).
**Revertir** — `git revert` del commit.

## 2026-09-16 — Test de viaje por portal; HTTP/3 desactivado en el Traefik de vps1new

**Qué** — `test/portal.test.js` reproduce el viaje de un jugador por un portal (ficha con luz,
escena nueva, director en origen, base, reconexión): verde. HTTP/3 quitado del proxy de Coolify
por los errores `ERR_QUIC_PROTOCOL_ERROR`/`ERR_SSL_PROTOCOL_ERROR` en el navegador del usuario
(Norton). El reinicio a mano del proxy dejó ~10 min sin servicio a las apps compose; detalle y
regla nueva en `vps1new:/root/docs/07` y `/05`.

## 2026-09-16 — Modelo de visión: sin tope de alcance, visión en la oscuridad absoluta

**Qué** — se retira «Alcance máximo» (`sight`) del editor y del render: era un tope duro que
dejaba en negro todo lo que quedara más allá, incluidas luces de la escena y la antorcha propia
(así estaban las fichas del usuario, a 10–20 ft). La visión en la oscuridad pasa a ser absoluta
dentro de su radio (antes iluminaba al 55–62 %); las luces sólo aportan lo que sobresale. Lo
iluminado que se ve queda explorado de lleno en la niebla (`EXP.boost`), aunque la luz sea tenue.
El campo `sight` sigue aceptándose en el servidor y se ignora.
**Por qué** — pedido del usuario tras confundirle el tope en producción.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Orientar la linterna sorda de una ficha

**Qué** — con la ficha seleccionada aparece la línea del cono y un tirador en su extremo;
arrastrarlo gira la luz (pasos de 15°, Alt = libre). Lo puede usar el director y el dueño de la
ficha. El jugador ve además el campo «Dirección (°)» en el editor de su ficha si la luz es un
cono. Antes sólo el director podía cambiar la dirección, y sólo a mano desde el editor.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Giro de la linterna: fino y con tres tiradores

Giro de 1° por defecto (Alt = pasos de 15°) y tres puntos de agarre sobre la línea del cono
(junto a la ficha, a media luz, en el extremo) para no tener que alejar el zoom.

## 2026-09-16 — Fix: la ficha «saltaba atrás» al arrastrar o girar la luz (jsonb reordena claves)

**Qué** — `jsonb` devuelve los objetos con las claves en otro orden. El servidor comparaba el
resultado del cambio del jugador con lo recibido por `JSON.stringify` textual → siempre
«distinto» → mandaba una corrección (`fix`) en cada envío con datos de 80 ms antes → la ficha o
la linterna retrocedían un instante. Ahora compara con claves ordenadas (`rules.sameObject`), y
el cliente ignora correcciones sobre el objeto que está arrastrando (reenvía lo suyo).
**Regresión de la migración a PostgreSQL** (con SQLite el texto conservaba el orden). Tests:
`test/rules.test.js` y caso en `test/realtime.test.js` que recarga el tablero de la base.
**Revertir** — `git revert` del commit.

## 2026-09-16 — Niebla explorada sin dientes de sierra

Memoria de exploración al 20 % (antes 12 %; 160 bloques máx. en vez de 260 para no subir el
consumo) y desenfoque leve (`EXP.blur`) al pintarla. Los tiles guardados con la resolución
vieja se escalan al cargar.

## 2026-09-16 — Tipo de muro «Maleza»

**Qué** — nuevo `kind: 'cover'`: no bloquea vista del fondo, ni luz, ni paso; pero para los
jugadores esconde las fichas (no propias) y los objetos que queden detrás. Se implementa como un
tercer tipo de línea de visión `'hide'` (muros que tapan la vista + maleza) usado sólo por
`visibleToPlayers` y `propVisibleToPlayers`. Aparece en la barra de muros, leyenda, editor y
menú «Convertir en…» automáticamente (catálogo `WALL_TYPES`). Servidor: `WALL_KINDS` lo acepta.
**Revertir** — `git revert` del commit; los muros ya guardados como `cover` pasarían a `wall`.

## 2026-09-16 — Editar articulaciones de muros siempre

Los extremos de muro se arrastran con cualquier número de muros seleccionados (antes sólo con
≤ 8, así que una sala o un círculo no se podía retocar) y también con la herramienta de muros
activa: pinchar una articulación existente la mueve en vez de empezar un tramo; los tramos que
comparten ese punto se mueven juntos. Con la herramienta activa, los puntos se pintan grandes.

## 2026-09-16 — Producción: chat, dados, iniciativa y recuperación desplegados (cfaa9dc)

Migración 002 aplicada en vps1new al arrancar; e2e 10/10 por WSS. Las cuentas existentes reciben
su código de recuperación al entrar o al abrir Perfil.

## 2026-09-16 — Sin plantillas; licencias en orden

**Qué** — se retiran las plantillas Granja y Herbolario: `templates.js`, `public/muestras`,
selectores y botones, `seedSamples`; migración 003 borra las 6 imágenes de muestra de la base
(las fichas que las usaban quedan sin retrato). Se añaden `LICENSE` (MIT, coherente con
`package.json`) y `THIRD-PARTY-LICENSES.md` con el inventario de terceros y sus avisos.
**Por qué** — pedido del usuario; el mapa del Herbolario era de procedencia no documentada.
**Revertir** — `git revert`; las imágenes borradas por la migración no vuelven (no había copia).

## 2026-09-16 — Luces más suaves

La luz de una ficha y las luces sueltas usan la posición interpolada (`displayPos`), así se
deslizan con la ficha en vez de saltar; las luces que mueve otro también se interpolan (120 ms).
El parpadeo se redibuja a 30 fps (antes 24) y pierde el componente rápido que temblaba.

## 2026-09-16 — Movimiento remoto continuo

Sustituye la interpolación fija de 120 ms (se paraba entre paquetes → tirones) por una
persecución exponencial continua (`chase`, τ = 70 ms) para fichas, luces y cursores; los envíos
de cambios pasan de 80 a 40 ms y los de cursor de 50 a 33 ms; la animación se redibuja a 60 fps
mientras haya algo moviéndose. Más CPU en el cliente sólo durante el movimiento; el servidor no
cambia (reenvía lo que llega).

## 2026-09-16 — Animación de luces: sólo se redibujan las capas de luz

Los fotogramas de animación (parpadeo, pulso) ya no repintan mapa, cuadrícula, fichas, línea de
visión ni controles: sólo máscara de luz, brillo y oscuridad. Elimina los tiempos irregulares por
frame que se veían como tirones en la luz de pulso.

## 2026-09-16 — Luz sin borde duro; pulso más suave

La máscara de luz pasaba de brillante a tenue en un 4 % del radio (anillo duro) y el pulso
movía ese anillo ±5 % con la intensidad bajando al 72 %: se veía a saltos aunque los fps fueran
estables (comprobado con capturas consecutivas en Edge headless). Ahora la transición ocupa del
−10 % al +14 % del radio brillante y el pulso es ±3 % de radio e intensidad 80–100 %.

## 2026-09-16 — Fotograma de luz 3,5× más barato

Medido en Edge headless a 1920×1080 con escala 2: 58 ms por fotograma animado (dos composiciones
`destination-out` a pantalla completa a 3064×2052 px) → 16 ms. Dos cambios: las capas de luz
(máscara, visión, exploración, brillo, oscuridad) se dibujan a escala 1 y el navegador las
amplía (son degradados, no se nota); la niebla explorada desenfocada se compone sólo en los
fotogramas completos y los de animación reutilizan la imagen. Mapa, fichas y controles siguen a
la escala nativa. Guion de medida: ver `05-runbook` (perfilado).

## 2026-09-16 — Pulso sin escalones

El pulso variaba la intensidad de la máscara de oscuridad (alfa) despacio y para todo el disco a
la vez: con alfa de 8 bits eso se ve como escalones de 1/255 sincronizados. Ahora el pulso respira
en radio (±4,5 %) y en el tinte de color del brillo (82–100 %), y deja la máscara quieta. El
parpadeo no lo sufría por ser rápido y ruidoso.

## 2026-09-16 — Pulso sólo espacial; bandeja de dados

Pulso: respira el radio (±5 %) y la proporción brillante/tenue (±12 %), sin tocar ningún alfa
global (ni máscara ni tinte). Dados: la botonera llena una **bandeja** (clic = +1, Mayús ×2,
Ctrl ×3); se tira con «Tirar», Enter o sola a los 2,5 s; la fórmula acepta términos separados
por espacio (`2d8 1d4 +2`). Menos brillo especular en los dados 3D.

## 2026-09-16 — Fix: exportar escena fallaba (`usedImageIds is not defined`)

Fallo heredado del Mini VTT original: la función nunca existió. Definida (imágenes usadas por
tableros/objetos y fichas). Probado en Edge headless: el .json exportado incluye muros, fichas y
la imagen en base64.

## 2026-09-16 — Render adaptativo y lectura de rendimiento

El cliente mide cuánto tarda cada fotograma de luz. Si supera el 75 % del intervalo de pantalla
durante 12 fotogramas, baja las capas de luz a 0,5× y la animación a la mitad de la frecuencia
de pantalla (cadencia regular). Si sobra margen durante 4 s, vuelve a 1×. Mesa → Conexión muestra
«Render de luz: N ms por fotograma (pantalla X Hz), capas de luz a S×» para diagnosticar en el
navegador del usuario.

## 2026-09-16 — Fix: la animación de luz iba a ~9 fps (realimentación de la cadencia)

La cadencia adaptativa medía el intervalo entre fotogramas *animados* y lo usaba como umbral
para animar el siguiente: se realimentaba y bajaba hasta ~110 ms (el usuario midió «pantalla 9
Hz», render 0,2 ms). Ahora la frecuencia de pantalla se mide con todos los fotogramas del bucle
y la animación va cada frame (o uno de cada dos, contado, en calidad reducida). Medido en Edge:
59,5 fotogramas animados/s con intervalo 16,7 ms constante.

## 2026-09-16 — Fix urgente: `hexA is not defined` (brillo de luces roto en producción ~15 min)

El parche de la cadencia borró `hexA` al reemplazar el bloque del bucle. Restaurada; test de
contrato nuevo que comprueba que toda función usada en `render.js` está definida. Lección: para
cambios de cliente, `npm run test:ui` antes de desplegar, no sólo `npm run check`.

## 2026-09-16 — Dithering en la máscara de luz

Con cadencia y coste ya correctos (60 Hz, 0,2 ms medidos por el usuario), lo que quedaba del
pulso era banding: 255 niveles de alfa en un degradado grande dan anillos de ~3 px que reptan al
cambiar el radio. Se suma un patrón fijo de ruido de ±1 nivel a la máscara (`dither`), que rompe
los anillos sin grano visible. Pulso algo más contenido (±3,5 % radio, ±10 % núcleo).

## 2026-09-16 (noche) — Fix: niebla granulada por el dithering

El ruido se sumaba a la máscara de luz, y la memoria de exploración acumula esa máscara frame a
frame: los píxeles de ruido se «exploraban» solos y la niebla salía con manchas. Ahora el ruido se
aplica sólo a la capa de oscuridad final (no se acumula). Migración 004 borra la niebla guardada
(un día de exploración, contaminada). Los jugadores vuelven a explorar desde cero.
