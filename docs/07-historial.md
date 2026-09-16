# 07 — Historial

Formato: fecha · qué · por qué · cómo revertir. Más reciente arriba.

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
