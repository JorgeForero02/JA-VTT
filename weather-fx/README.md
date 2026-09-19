# WeatherFX

Efectos climáticos para mesas virtuales, sobre PixiJS 7.

El agua no está dibujada: es una simulación de onda sobre una malla. Las gotas
caen en puntos aleatorios, la onda se propaga a velocidad finita, se amortigua,
rebota en los bordes y se suma con las demás. De esa malla sale un mapa de
normales y un shader desplaza el tablero según la pendiente. Por eso las ondas
interfieren y las fichas se deforman al pasar bajo ellas.

La simulación corre en CPU (~180 celdas de alto, menos de 1 ms por frame) para
no depender de texturas de coma flotante, que en WebGL siguen detrás de
extensiones. Se apaga sola cuando la superficie se calma.

## Archivos

| | |
|---|---|
| `weather-fx.js` | la librería, legible y comentada |
| `weather-fx.min.js` | la misma, minificada (25 KB, 9 KB con gzip) |
| `demo.js` | tablero de ejemplo y panel de control |
| `index.html` | el demo completo |

## Uso

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js"></script>
<script src="weather-fx.js"></script>
```

```js
const fx = new WeatherFX({
  container: document.querySelector('#tablero'),
  source: miCanvas2D     // tu canvas del tablero
});

fx.use('rain');
fx.set({ intensity: .8, wind: -.3 });
```

`source` es el canvas que quieres que se moje. WeatherFX lo dibuja él mismo
como textura para poder refractarlo, así que oculta el original o déjalo
detrás. **Sube la textura solo cuando repintes el mapa**, no cada frame:

```js
repintarTablero();
fx.invalidateSource();
```

Las fichas que deban mojarse van dentro de `fx.world`. Lo que dejes fuera en
DOM queda por encima del agua y no se deforma.

## API

| | |
|---|---|
| `use(id, overrides?)` | cambia de efecto; reinicia el agua |
| `set({ intensity, speed, wind, drops, refraction })` | ajusta en caliente |
| `drop(x, y, { radius, strength })` | una gota puntual en coordenadas de pantalla |
| `strike()` | rayo con trazo, destello y sacudida |
| `sheetFlash()` | fogonazo lejano, sin rayo ni sacudida |
| `pause(v)` / `toggle()` | |
| `invalidateSource()` | vuelve a subir el canvas del tablero |
| `resize()` | tras cambiar el tamaño del contenedor |
| `destroy()` | |
| `fx.world` | contenedor refractado: mete aquí las fichas |
| `WeatherFX.list()` | los efectos disponibles |

Parámetros, todos de 0 a 1 salvo donde se indique:

- `intensity` — cuántas partículas y cuántas gotas caen
- `speed` — multiplicador de velocidad (0,1 a 2)
- `wind` — de −1 a 1; sopla a rachas, no constante
- `drops` — multiplica la frecuencia de gotas sobre la superficie
- `refraction` — multiplica cuánto desplaza el agua el tablero (0 a 2,5)

`drop()` sirve para todo lo que deba tocar el agua: un conjuro, un proyectil,
la ficha que avanza. Radio en píxeles, fuerza relativa a 1.

## Añadir un efecto

Un efecto es un objeto de datos. No hay que tocar el motor.

```js
WeatherFX.register({
  id: 'acido', icon: '🧪', name: 'Lluvia ácida',
  blurb: 'Texto que se muestra en el panel.',
  base: { intensity: .6, speed: 1, wind: .2, drops: 1, refraction: 1 },

  layers: [                       // una o varias capas de partículas
    { tex: 'streak', count: 900, size: [1.3, 2.4], len: [16, 36],
      speed: [800, 1400], alpha: [.09, .24], tint: 0xa8d06a,
      mode: 'fall', sway: 5 }
  ],
  gust: .4,                       // cuánto sopla a rachas (0 = viento plano)

  water: {                        // omítelo si el efecto no moja
    rate: 3,                      // gotas por segundo a intensidad 1
    radius: [6, 14],              // tamaño del impacto, en píxeles
    strength: [.5, 1.1],
    amplitude: .14,               // altura de la gota
    damping: .976,                // cuánto se frena la onda
    flatten: .992,                // cuánto vuelve la superficie a plana
    waveSpeed: 1,
    normalScale: 7,
    perturbance: 50,              // píxeles de desplazamiento del tablero
    specular: .8,                 // brillo sobre la pendiente
    wet: .45                      // cuánto oscurece la superficie mojada
  },

  refract: { turbAmp: 0, turbScale: 6, turbSpeed: .05, chroma: .2 },
  grade: { sat: .95, bright: .93, contrast: 1.03,
           tint: [.55, .72, .45], tintAmt: .1,
           fogColor: [.5, .6, .45], fog: .03, fogScale: 3, fogSpeed: .05,
           vignette: .2, grain: .012 },

  lightning: { min: 16, max: 42 },  // rayo con trazo, cada N segundos
  flashes: { min: 4, max: 11 }      // fogonazo lejano
});
```

Texturas disponibles en `tex`: `streak`, `shard`, `flake`, `grain`, `soft`,
`glow`, `mote`.

Modos en `mode`: `fall` (cae), `rise` (sube), `drift` (cruza con el viento;
usa `drift` para darle una corriente propia y `sink` para que además baje).

Cada capa reparte sus partículas en planos de profundidad: las cercanas salen
grandes, rápidas y tenues, las lejanas pequeñas y lentas. De ahí sale el
paralaje sin configurar nada.

## Rendimiento

`maxParticles` (2400 por defecto) reparte proporcionalmente entre capas si un
efecto pide más. `gridSize` (180) es el alto de la malla de agua; bajarlo a 120
la abarata bastante y se nota poco.

Con `prefers-reduced-motion` la librería baja sola a 500 partículas, malla de
120 y destellos suaves.
