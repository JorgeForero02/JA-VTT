# Clima en el tablero 2D (WeatherFX) — diseño

Fecha: 2026-09-18. Rama `clima-2d` (desde `main` 5588c25). Alcance: **sólo el modo 2D**; el 2.5D no
cambia (la capa se destruye al entrar en 2.5D).

## Qué se quiere

El director elige un efecto climático por escena (lluvia, tormenta, llovizna, ventisca, arena, niebla,
ceniza, brasas, calor, polvo arcano) con intensidad y viento. Todos los de la escena lo ven igual,
en tiempo real, y **con el mismo aspecto que el demo de `weather-fx/`**: partículas con paralaje,
agua simulada que refracta el tablero, gradación de color, rayos y fogonazos.

## Decisión de dependencia (explícita, aprobada por el usuario 2026-09-18)

PixiJS 7.4.2 (MIT, `pixi.min.js` 456 KB / ~150 KB gz) y `weather-fx.js` se **vendorizan** en
`public/js/vendor/` y se cargan **perezosamente** sólo cuando la escena tiene clima. Nadie paga la
descarga si no lo usa. Se descartó reescribir sobre three.js (coste alto, mismo resultado) y portar a
Canvas 2D (pierde agua, refracción y gradación).

## Arquitectura

```
#stage:  cScene → cWeather (Pixi) → cGlow → cDark → cOver
```

- `Weather` (`public/js/weather.js`, script clásico ~90 líneas) es el único puente con la librería.
  - `Weather.sync()` — compara `S.weather` con lo montado; carga scripts, monta, cambia efecto o
    destruye. Idempotente y barato (compara una clave). Se llama desde `drawAll` (frames completos)
    y desde `syncStageMode`.
  - `Weather.invalidate()` — tras `drawScene()`: resube `cScene` como textura. Nunca en frames
    `lightsOnly`.
  - `Weather.resize()` — desde `resize()`.
  - `Weather.drop(x,y)` — mundo → pantalla; gota al mover ficha (segunda ola, fuera de esta entrega).
- `source = cScene`: la librería pinta su copia refractada encima; `cScene` queda tapado.
  Glow, oscuridad y controles siguen **encima sin deformar**: la oscuridad tapa la lluvia donde el
  jugador no ve. Sin fugas de información.
- El `canvas` de Pixi recibe `id="cWeather"` y se inserta antes de `cGlow`. Hereda
  `pointer-events:none` y en 2.5D se destruye.
- Rendimiento: `S.animate=false` → `pause(true)`. `PERF.scale<1` → `refraction:0` (la refracción es
  el shader caro; las partículas se quedan para que el clima se siga viendo). Sin WebGL →
  aviso una vez y sin clima.
- Rayos y gotas son aleatorios **locales** (no se sincronizan; YAGNI).

## Datos

Ajuste de escena `weather: { id, intensity, wind }` en `settings` jsonb.
- `server/rules.js cleanSettings`: `id ∈ WEATHER_IDS` (`none` + los 10 de la librería);
  `intensity` 0–1; `wind` −1–1. Id inválido → sin `weather`.
- `net.js SCENE_KEYS` incluye `weather`; `core.js blankState` lo inicia a `{id:'none',intensity:.6,wind:0}`.
- `core.js WEATHERS` lista estática id → nombre/icono (para el panel sin cargar la librería).
  Un test comprueba que coincide con los `register({id})` de `vendor/weather-fx.js` y con `rules.js`.

## UI

Pestaña Escena, bajo «Entorno»: `<select id="weatherId">` + deslizadores «Intensidad» y «Viento»
(`#weatherIntensity`, `#weatherWind`). Sólo director. Cambio → `pushUndo(); changed()` como el resto.

## Tests

- `rules.test.js`: `cleanSettings` acepta, recorta e ignora.
- `frontend.test.js`: marcado, `SCENE_KEYS`, listas de ids iguales, `render.js` invalida tras
  `drawScene`, `weather.js` compila (bucle existente).
- `test:ui`: el director pone lluvia → `#cWeather` con ancho > 0 en director y jugador; pone «Sin
  clima» → desaparece. Captura.

## Fuera de alcance

Clima en 2.5D · gotas por movimiento de ficha · sincronizar rayos · elegir `drops`/`refraction`
por escena (la librería los acepta; se añaden si hacen falta).
