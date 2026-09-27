# 00 — Índice maestro · Tablero pixel

**Leer PRIMERO en cada sesión, junto con [06-pendientes](06-pendientes.md).**
Última actualización: 2026-09-26.

## Resumen en 30 segundos

Tablero de rol en pixel art 3D (three.js) para un grupo pequeño: editor de escenas, editor de
dibujo, modo partida de 5.ª edición, campañas y mesa en vivo. Nació como página única que guardaba
en un archivo JSON; el 2026-09-25 se reconstruyó con la **arquitectura y la interfaz de Just
Another VTT** (rama `release`): **Node 22 + PostgreSQL 16 + WebSocket propio + Docker Compose**,
cuentas con contraseña y tableros con miembros. Desde el 2026-09-26 el servidor es un **núcleo** con
la forma del de JA-VTT (`server/`) más el **módulo** del tablero 3D (`modules/tablero3d/`, esquema
PostgreSQL `t3d`, API `/api/t3d/`), que se monta en JA-VTT sin fusionar los proyectos.

Estado: **sin desplegar** (P-01). La pila de Docker Compose funcionaba en local el 2026-09-25; desde
T1 no se ha vuelto a probar con Docker (P-07). La ronda «módulo JA-VTT, fichas, techos y luces» está
**cerrada** (T1–T7, [plan](superpowers/plans/2026-09-26-modulo-ja-vtt-fichas-techos-luces.md)): el
módulo está listo para que el usuario lo integre en su JA-VTT con [08](08-integracion-ja-vtt.md) (P-02). T8 arregla
lo que el usuario vio al integrarlo: los ajustes del tablero son los de JA-VTT (P-06 cerrado), toda tirada 3D pasa por
el recorte de su chat, la cuota del 3D se mide con una sola unidad y cada ruta tiene su límite de cuerpo, y el 2D de
JA-VTT no dibuja con la mesa 3D abierta.

Tamaño real (2026-09-26, `wc -l`): núcleo 764 líneas (`server.js` + 5 archivos en `server/`) y 3
migraciones · módulo 1592 líneas en el servidor (`index.js` 618, `rules.js` 758, `db.js` 148,
`dice.js` 68) y 6 migraciones · cliente anfitrión 371 líneas de JS (`main.js`, `net.js`, `store.js`,
`icons.js`) · cliente del módulo 7211 líneas de JS en `modules/tablero3d/public/` más `t3d.html` 335 y `t3d.css` 202 (motor `tablero3d.js`
5108 líneas compactas; `personajes.js` 1161; `t3d.js`, `vision.js`, `fichas.js`, `muros.js`,
`ambiente.js`, `ajustes.js`, `dados.js`, `mesa.js` y 25 iconos en `icons-t3d.js`) · 1 dependencia de
producción (`pg`); three.js r128 vendorizado.

> 2026-09-26: tras el refactor del cliente 3D el motor quedó repartido en 9 módulos más `tablero3d.js` (3055
> líneas). El mapa de ficheros vigente está en `docs/01-arquitectura.md` del repositorio; estas cifras son históricas.

Estado de calidad verificado el 2026-09-26: `npm run lint` limpio · `npm run check` → **170 tests, 0
fallos** (contra un Postgres real; cobertura núcleo + módulo 97,5/93,5/95,4; T8) · `npm run test:ui` →
**96/96** (director y jugador, móvil incluido; T8) · `npm run test:e2e` (`realtime.mjs`) →
**13/13** contra un servidor local con `E2E_RESTART=no` (T7) · la guía [08](08-integracion-ja-vtt.md)
aplicada al pie de la letra sobre una copia de JA-VTT `d68f41f`: sus tests 98/98 (99/99 con el test
recomendado) y `npm run test:ja-vtt` **20/20** (T8). Los números de cada tarea están en [07](07-historial.md).

Funciones (2026-09-26): cuentas con contraseña y código de recuperación · tableros con miembros e
invitación, tipo de mesa 2D/3D fijo · escenas 3D con plantillas (Pueblo de Brezo, Taller de luces…),
terreno, alturas, agua, objetos y estructuras · techos de cinco materiales y cinco formas · 12 tipos
de luz de JA-VTT, niebla de guerra y visión · momentos de luz y zonas interiores con ventanas · muros,
puertas con llave y portales entre escenas · fichas con los campos de JA-VTT, de Diminuto a Colosal, y
21 personajes de fábrica · editor de dibujo (casillas, personajes a su tamaño, objetos por rebanadas)
· partida de 5.ª edición (iniciativa, dados con la notación de JA-VTT, plantillas y planos,
anotaciones) · campañas · mesa en vivo con privacidad filtrada en el servidor y los ajustes de tablero
de JA-VTT.

Trabajo en curso: nada bloqueante. Lo siguiente es la
[hoja de ruta](superpowers/specs/2026-09-26-hoja-de-ruta-3d-y-editor.md) (P-05) con la
[guía para continuar](superpowers/plans/2026-09-26-guia-para-continuar-hoja-de-ruta.md) — ver
[06-pendientes.md](06-pendientes.md).

## Mapa de la documentación

| Archivo | Rol | Cuándo se toca |
|---|---|---|
| [00-INDEX.md](00-INDEX.md) | Este índice | Cuando cambia la estructura de docs |
| [01-arquitectura.md](01-arquitectura.md) | Stack, capas, modelo de datos, tiempo real, decisiones | Cuando cambia una decisión técnica |
| [02-funcional.md](02-funcional.md) | Qué hace el sistema: roles, cuentas, tableros, escenas, mesa en vivo, API | Cuando cambia el comportamiento visible |
| [03-despliegue.md](03-despliegue.md) | Docker, compose, variables, backups | Cuando cambia cómo se ejecuta |
| [04-convenciones.md](04-convenciones.md) | **Reglas de código y documentación (obligatorias)** | Casi nunca |
| [05-runbook.md](05-runbook.md) | Comandos, tests, gotchas | Cuando cambia un comando |
| [06-pendientes.md](06-pendientes.md) | **Tareas abiertas** | En cada sesión |
| [07-historial.md](07-historial.md) | **Changelog**: qué, por qué, cómo revertir | Tras cada cambio relevante |
| [08-integracion-ja-vtt.md](08-integracion-ja-vtt.md) | **Cómo montar el módulo 3D en Just Another VTT**: líneas exactas, verificación, reversión, microservicio, diferencias y limitaciones | Cuando cambia la integración (rutas, WS, `mount`, iconos, CSS) o JA-VTT |

### Subcarpetas

| Carpeta | Contenido |
|---|---|
| `superpowers/specs/` | Diseño por feature |
| `superpowers/plans/` | Plan de implementación por feature |
| [`superpowers/README.md`](superpowers/README.md) | Índice por fecha de specs y planes |
| `_archivo/` | Fotos históricas congeladas. **No editar** |

### Fuera de `docs/`

| Archivo | Rol |
|---|---|
| `CLAUDE.md` / `AGENTS.md` (raíz) | Contrato de arranque: reglas duras + punteros |
| `README.md` | Manual de uso para quien juega |
| [`modules/tablero3d/README.md`](../modules/tablero3d/README.md) | Referencia técnica del módulo 3D (interfaz con el anfitrión, formato de los documentos, `Tablero3D.mount`, motor). Viaja con la carpeta al copiarla en JA-VTT |
| `THIRD-PARTY-LICENSES.md` | Licencias de three.js, Lucide, Alegreya y dependencias |

## Regla de oro

**Un hecho vive en un solo sitio.** Estado (`01`–`05`) ≠ historial (`07`) ≠ pendientes (`06`).
Lo interno del módulo vive en `modules/tablero3d/README.md`; `01`, `02` y `08` enlazan allí.

> **Números vacantes:** ninguno (`00`–`08` en uso).
