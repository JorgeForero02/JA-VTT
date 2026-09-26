# 06 — Pendientes

Actualizado: 2026-09-26. Prioridad: P0 bloquea · P1 próxima sesión · P2 cuando toque.

| ID | P | Tarea | Evidencia para cerrar |
|---|---|---|---|
| P-32 | P2 | Tablero 3D: no hay escena por jugador; la mesa en vivo 3D es la escena del director (hoja de ruta R15 del módulo; se resuelve en `3d-tablero`) | Nueva versión del módulo copiada |
| P-33 | P2 | Tablero 3D: muros y zonas por casilla, no segmentos finos entre casillas; un portal 2D no lleva a una escena 3D (R13 del módulo) | Nueva versión del módulo copiada |
| P-34 | P2 | Tablero 3D: el tipo de mesa se marca con una segunda petición tras crear el tablero (si falla queda 2D con aviso; 10 min para repetirla) y JA-VTT crea igual su «Escena 1» 2D, oculta, que la tarjeta cuenta («1 escena») | Decisión del usuario: aceptarlo o crear el tipo en la misma petición |
| P-35 | P2 | Tablero 3D en el móvil dentro de JA-VTT: no probado (`test:ja-vtt` va en escritorio, 1400×860) | Paso móvil en la prueba de humo |
| P-36 | P2 | Tablero 3D: sólo las tiradas de la mesa en vivo llegan al chat; fuera de ella tira el cliente y quedan en Partida. No hay tiradas ocultas del director | Nueva versión del módulo o decisión del usuario |
| P-37 | P2 | Tablero 3D: los jugadores pueden explorar y editar en local sin guardar (las plantillas ya son sólo del director); valorar si deben ver sólo lo que el director comparte (P-03 de `3d-tablero`) | Decisión del usuario |
| P-38 | P1 | **Hoja de ruta del arte propio** (aprobada el 2026-09-26, [investigación](superpowers/specs/2026-09-26-arte-propio-investigacion.md)): piezas con comportamientos, enfoque B. Fases: **0 cimientos (código hecho, pendiente de despliegue)** → 1 objetos propios → 2 estados y puertas → 3 terrenos propios → 4 pisos y niveles → 5 reacciones automáticas → 6 personajes animados. Lo que quede de la hoja de ruta anterior del módulo (R1–R16, E1–E7) se reparte en esas fases | Fase 0: código completo y verificado en [07](07-historial.md); pendiente el despliegue (paso 5 del controlador) |
| P-39 | P2 | Tablero 3D, abiertos tras T8 (P-09 de `3d-tablero`): (a) si JA-VTT cambia sus ajustes por otro camino que `handleOps`, la mesa 3D se entera en su siguiente acción; (b) un cambio de ajustes desde el 3D puede perderse si coincide con que JA-VTT descarga un tablero sin nadie conectado; (c) la iniciativa del 3D y la de JA-VTT no se comparten; (d) dos copias de three.js en una mesa 3D (r170 de los dados + r128 del módulo) | Cada punto resuelto o aceptado por el usuario |
| P-40 | P1 | Tablero 3D: medir con GPU real y en un portátil (todo lo medido hasta ahora fue con SwiftShader y a tamaño de escritorio). Junto con P-35 (móvil) | Tabla de fps/CPU en portátil real en [07](07-historial.md) |
| P-42 | P2 | Licencia: el módulo vive ahora en este repositorio público con `LICENSE` MIT; `3d-tablero` no tenía licencia. Confirmar que el módulo queda bajo MIT (decisión legal del usuario) | Decisión anotada en [07](07-historial.md) |
| P-47 | P2 | `npm run test:ui` (2D) falló una vez en 8 ejecuciones el 2026-09-26 (53/54, primera tras arrancar el servidor; el paso no quedó registrado) y pasó 7 seguidas después. Vigilar: si vuelve, registrar el paso que falla | Diez `test:ui` seguidos en verde, o el paso identificado y arreglado |
| P-48 | P1 | Fase 1, primeras tareas (menores de la revisión final de la fase 0, sólo alcanzables con piezas `p:`): (a) una puerta `p:` de varias casillas cerrada bloquea en el cliente sólo su casilla de origen (`blocked`/`doorShut` en `refreshEntities` y `toggleDoor`) mientras el servidor bloquea todas; (b) `WALLAT` guarda una pieza por casilla: una `p:` que tapa sobre un muro de fábrica lo pisa; (c) volver a medir `refreshEntities` tras `senseOf` (el ×1,09 es de antes de la ola final) | Tests de (a) y (b) y medida anotada en [07](07-historial.md) |
| P-04 | P2 | Subir el pipeline a **N3**: mutación automatizada (N2 —cobertura con umbral— cerrado el 2026-09-19) | Comando en [04](04-convenciones.md) Parte C |
| P-06 | P2 | Renombrar la carpeta local `mini-vtt` → `just-another-vtt` (no se hizo para no romper la sesión) | `git status` limpio tras mover |
| P-07 | P2 | El pulso de luz aún se percibe «un poco» a saltos (usuario, 2026-09-16, con 60 Hz, 0,2 ms/frame y dithering ±1). Siguiente vuelta: dithering ±2 niveles o ruido temporal; medir con capturas consecutivas | El usuario lo da por fluido |
| P-08 | P2 | Cuentas de prueba que deja `npm run test:ui` contra producción (`dir-*`, `jug-*`, `pulse-*`…) si algún día se ejecuta contra `tablero.supportive.pro`: borrar a mano | `SELECT name FROM users` sin cuentas de prueba |
| P-24 | P2 | Audio ambiental por escena y SFX (dados, puertas). Spec §6 · plan C | Prueba en navegador con sonido |
| P-25 | P2 | Girar una luz (campo «Dirección (°)») en el editor no cambia su preset a «Personalizada», a diferencia de radio/color/apertura; evaluar si la dirección debe independizarse del preset o marcarlo como personalizado | Comportamiento acordado y test de editor |
| P-29 | P2 | La barra de iniciativa sobre el mapa tiene dos reglas `.initBar`/`.initEntry` distintas en `app.css`: una con colores fijos («siempre oscura sobre el mapa») y otra con variables del tema, que es la que manda. Decidir cuál es la buena y borrar la otra | Una sola copia y captura de la barra en tema claro y oscuro |
| P-26 | P2 | Pastilla de elevación pisa el primer badge en fichas de tamaño 1 (captura 08-fichas-estado.png); moverla o bajar la fila de badges | Captura de test:ui sin solape |
| P-43 | P2 | Tablero 3D, fase 0: las puertas escriben su estado en `state` **y** en `open`/`locked` de la raíz (vuelta atrás mientras convive con la versión anterior, spec §3.2). Quitar el espejo cuando ya no haga falta | Espejo quitado y test actualizado, anotado en [07](07-historial.md) |
| P-44 | P2 | Tablero 3D, fase 0 → 2: las puertas secretas de la fase 2 usarán el mismo mecanismo que la barrera (`blockCells`, Ruling R18): casilla bloqueada sin tipo ni arte para quien no puede verla | Puerta secreta con test de privacidad, en la fase 2 |
| P-45 | P2 | Tablero 3D, fase 0: el servidor no valida los caminos de la mesa en vivo (`R.liveChange` sólo mira dueño y rol); la única protección para no cruzar barreras u otras piezas bloqueantes vive en el cliente, como en el resto de JA-VTT. Mejora futura, no bloquea la fase 0 (Ruling R18) | Decisión del usuario: validar en servidor o aceptarlo documentado |
| P-46 | P2 | Icono `eraser` ausente en `public/js/icons.js` (2D): hallado en la Tarea 1 de la fase 0 al comparar con los iconos que trae el módulo 3D; no es un fallo de esta fase, es del 2D de siempre | Icono `eraser` añadido a `ICONS` con su uso donde falte |

Cerrados: P-01, P-02, P-03 (2026-09-16); **P-05** el 2026-09-19 (ya existía `#passwordForm` en
`index.html` + `POST /api/me/password` con test en `mesa.test.js`: estaba hecho y sin cerrar);
**P-04 nivel N2** el 2026-09-19 (queda N3 con el mismo ID);
**P-19, P-20, P-21** el 2026-09-19 (plan A; evidencia: tests de rules/realtime/frontend y capturas 08/09 de test:ui);
**P-22, P-23** el 2026-09-19 (plan B; evidencia: tests en rules/realtime/frontend, pasos regla/notas en test:ui y capturas 10/11);
**P-27** el 2026-09-19 (decidido: tapada por visión; test en ui.mjs y noteVisibleToPlayers en core.js);
**P-41** el 2026-09-26 (los tests del módulo — `catalogo`, `piezas-escena`, `piezas-api`, `piezas-wiring`,
`rules`, `frontend`, `realtime`, `db`… de `test/t3d/` — corren contra el servidor de JA-VTT en `npm test`);
**P-28** el 2026-09-26 (causa real hallada y arreglada: `sock.on('error', () => {})` en
`server.on('upgrade', ...)` de `server/app.js`, ver [07](07-historial.md); `test/realtime.test.js` 5/5
seguidas en verde tras el arreglo).

## Hallazgo ajeno a este repo (avisado al usuario el 2026-09-16)

El backup diario de vps1new escribe `dnd-pg.sql.gz` de **20 bytes** (vacío) y lo registra como OK:
el bloque de `dnd` en `/root/scripts/backup-coolify.sh` perdió las comillas
(`sh -c PGPASSWORD= pg_dumpall -U`). **La base de la plataforma D&D no tiene copia real.** Se
arregla en el servidor, no aquí.
