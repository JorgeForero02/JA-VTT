# Condiciones SRD de D&D y mejoras tácticas de mesa

Fecha: 2026-09-19. Documentación y especificación de diseño para el VTT sin añadir hojas de personaje ni bloat de reglas.

## Requisitos

1. **Condiciones SRD en fichas (Badges)**:
   - Soporte para las 14 condiciones oficiales del SRD de D&D 5e:
     * `blinded` (Cegado), `charmed` (Hechizado), `deafened` (Ensordecido), `frightened` (Asustado),
     * `grappled` (Agarrado), `incapacitated` (Incapacitado), `invisible` (Invisible), `paralyzed` (Paralizado),
     * `petrified` (Petrificado), `poisoned` (Envenenado), `prone` (Derribado), `restrained` (Apresado),
     * `stunned` (Aturdido), `unconscious` (Inconsciente).
   - Marcadores tácticos adicionales comunes en mesa:
     * `dead` (Muerto), `concentration` (Concentración), `exhaustion` (Agotamiento),
     * `burning` (En llamas), `blessed` (Bendecido), `marked` (Marcado / Cazador).
   - Menú contextual rápido en la ficha (director y dueño de la ficha) para activar/desactivar condiciones.
   - Indicadores visuales compactos (mini-iconos o puntos coloreados alrededor de la ficha) sin entorpecer la imagen ni la visión.

2. **Puntos de Golpe (HP) minimalista en fichas**:
   - Dos valores numéricos por ficha: `hp` (actual) y `maxHp` (máximo), más `tempHp` opcional.
   - Cero cálculo de estadísticas ni hojas de personaje.
   - Barra o indicador visual flotante configurable: visible para todos, solo para el director, o solo barra sin números para jugadores.
   - Edición rápida con clic o rueda del ratón (`+`/`-`).

3. **Altura / Elevación en fichas**:
   - Valor numérico en pies (`elevation`, ej. `+20'`, `-10'`).
   - Etiqueta pequeña en la esquina superior de la ficha cuando `elevation !== 0`.

4. **Regla de medición multitramo (Waypoints)**:
   - Al usar la herramienta de medir (`ruler`), permitir marcar puntos de quiebre (con clic o barra espaciadora durante el arrastre) para rodear esquinas y obstáculos.
   - Muestra la distancia acumulada y de cada tramo en pies.

5. **Anotaciones / Etiquetas rápidas en mapa**:
   - Poder situar etiquetas de texto o pines en el mapa (ej. "Trampa DC 15", "Palanca").
   - Opción `gmOnly` para que solo el director las vea.

6. **Audio ambiental y efectos de sonido (SFX)**:
   - Efectos de sonido sutiles en el cliente: rodar de dados 3D, abrir/cerrar puertas y clic de herramientas.
   - Pista de audio ambiental en bucle por escena (enlace de audio / archivo ligero), con control de volumen por jugador.

## Decisiones técnicas

| Tema | Decisión |
|---|---|
| Datos de ficha | Se extienden los campos de `token` en `server/rules.js`: `conditions: string[]` (saneado contra catálogo fijo de 20 IDs), `hp: {cur, max, temp}`, `elevation: number` (pies). No requiere nuevas tablas SQL; viaja en `objects.data` jsonb. |
| Permisos | El director puede editar condiciones, HP y elevación de cualquier ficha. El jugador puede editar los de sus fichas asignadas (`ownsToken`). |
| Visibilidad de HP | Ajuste de escena o tablero: `hpVisibility`: `'all' | 'gm' | 'bar_only'`. Los clientes respetan esto en el renderizado; si es `'gm'`, el servidor omite los valores de HP a los jugadores en fichas ajenas. |
| Regla con waypoints | Estado efímero de UI en cliente (`UI.act.waypoints = [{x,y}, ...]`). No viaja por red. |
| Anotaciones de mapa | Nuevo subtipo de `plan` o tipo ligero `note` con `{x, y, text, gmOnly}`. Validado en `rules.js` y filtrado en difusión si `gmOnly` y el cliente no es director. |
| Audio | Nativo con `HTMLAudioElement` o Web Audio API en el navegador. Cero dependencias npm en servidor ni cliente. Ajuste de volumen y mute en `localStorage` del cliente. |

## Criterios de aceptación

- `sanitize({type:'token', conditions:['poisoned','invalid']})` devuelve `conditions:['poisoned']`.
- Una ficha con condición `prone` muestra el icono correspondiente en el borde del token.
- `sanitize({type:'token', hp:{cur:15, max:20}})` valida enteros positivos y los preserva.
- El jugador puede modificar el HP y las condiciones de su propia ficha; no puede modificar los de fichas enemigas ni de otros jugadores.
- Al arrastrar la regla y presionar `Espacio`, se añade un punto de quiebre y la distancia suma ambos tramos.
