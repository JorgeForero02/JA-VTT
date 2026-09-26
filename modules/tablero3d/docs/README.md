# Documentación del tablero 3D (traída de `3d-tablero`)

Copia de `docs/` del repositorio `JorgeForero02/3d-tablero` en el commit `403d6a5` (2026-09-26), más su
README (`tablero-pixel-README.md`). Desde el 2026-09-26 **el módulo se mantiene aquí, en JA-VTT**: lo
vigente del módulo se documenta en los `docs/` de JA-VTT y en el [README del módulo](../README.md). Estos
archivos son la referencia de cómo se construyó y de lo que queda por hacer; no se reescriben.

| Necesito… | Voy a |
|---|---|
| Interfaz del módulo (`createTablero3D`, `Tablero3D.mount`, mensajes, documentos) | [../README.md](../README.md) |
| Cómo se monta en JA-VTT, diferencias con el 2D y límites conocidos | [08-integracion-ja-vtt.md](08-integracion-ja-vtt.md) |
| Qué hace el tablero 3D (herramientas, partida, campañas, mesa en vivo) | [02-funcional.md](02-funcional.md) y [tablero-pixel-README.md](tablero-pixel-README.md) |
| Arquitectura del motor y del módulo | [01-arquitectura.md](01-arquitectura.md) |
| Hoja de ruta (R1–R16, E1–E7) y guía para seguirla | [superpowers/specs/2026-09-26-hoja-de-ruta-3d-y-editor.md](superpowers/specs/2026-09-26-hoja-de-ruta-3d-y-editor.md) · [superpowers/plans/2026-09-26-guia-para-continuar-hoja-de-ruta.md](superpowers/plans/2026-09-26-guia-para-continuar-hoja-de-ruta.md) |
| Por qué es así (historial T1–T8) | [07-historial.md](07-historial.md) |

Lo que **sólo vale para el repositorio `3d-tablero`** (su propio servidor anfitrión, que JA-VTT no usa):
`03-despliegue.md`, `05-runbook.md` (Postgres de pruebas en :55433, sus tests), `04-convenciones.md`
(sus reglas pasaron a las de JA-VTT, [docs/04](../../../docs/04-convenciones.md)) y `00`/`06` (su índice y
sus pendientes; los que siguen abiertos están en [docs/06](../../../docs/06-pendientes.md) de JA-VTT). Donde
digan «rama `release`» de JA-VTT, hoy es `main`.
