# Licencias de terceros

Just Another VTT se distribuye bajo la licencia MIT (ver `LICENSE`). Incluye o usa estas obras
de terceros; cada una conserva su licencia y su aviso de copyright.

## Incluido en el repositorio y servido al navegador

| Obra | Dónde | Licencia | Aviso |
|---|---|---|---|
| three.js (r170) | `public/js/vendor/three.module.min.js` | MIT | `public/js/vendor/three.LICENSE` — © 2010-2024 three.js authors |
| cannon-es 0.20 | `public/js/vendor/cannon-es.js` | MIT | `public/js/vendor/cannon-es.LICENSE` — © 2015 cannon.js Authors, © 2020 cannon-es Authors |
| visibility-polygon.js | `public/js/vendor/visibility-polygon.js` | Dominio público | Byron Knoll |
| Iconos Lucide | trazados SVG dentro de `public/js/icons.js` | ISC | © 2022 Lucide Contributors; parte del conjunto proviene de Feather (MIT, © 2013-2022 Cole Bemis) |
| Alegreya y Alegreya Sans | `public/fonts/*.woff2` | SIL Open Font License 1.1 | `public/fonts/OFL.txt` — © 2011 The Alegreya Project Authors (Huerta Tipográfica). Sin modificar; no se venden por separado |

## Dependencias del servidor (instaladas con npm, no redistribuidas modificadas)

| Paquete | Licencia |
|---|---|
| pg | MIT |

## Sólo para desarrollo (no forman parte del programa desplegado)

| Paquete | Licencia |
|---|---|
| eslint, @eslint/js | MIT |
| playwright | Apache-2.0 |
| three, cannon-es (copias en `node_modules` de las que se toman los ficheros de `vendor`) | MIT |

## Imágenes de la pila

Node.js (imagen `node:22-alpine`, licencia MIT) y PostgreSQL (`postgres:16-alpine`, PostgreSQL
License). Se usan como servicios; no se redistribuyen.

## Qué NO contiene

- Ningún código de Owlbear Rodeo, PlanarAlly, Foundry VTT ni Roll20: sólo se compararon como
  productos. Los dados 3D están escritos desde cero sobre three.js y cannon-es.
- Ningún texto, regla, criatura ni marca de Dungeons & Dragons ni de Wizards of the Coast: los
  dados, la iniciativa y las luces son mecánicas genéricas; los nombres de ejemplo («Goblin») son
  palabras comunes.
- Ninguna imagen de mapas o fichas: las plantillas y sus muestras se retiraron el 2026-09-16. Los
  mapas y retratos los sube cada mesa y son responsabilidad de quien los sube.
