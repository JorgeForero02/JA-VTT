# Editor de sprites, luces, movimiento, niebla e interfaz de creador — diseño

Fecha: 2026-09-25. Petición del usuario: comodidad y expansión del editor de sprites, mejoras en la
iluminación y los objetos, permitir editar los sprites existentes, crear objetos de luz con la
posición de la luz, mejorar movimiento y niebla de guerra, una interfaz de director «más de
creador y con menos plantillas», y ampliar mucho el editor tomando ejemplos de otros editores.

## Referencias consultadas

Aseprite (pincel píxel perfecto, tinta de sombreado, simetría, pinceles propios, degradados,
capas de referencia, animación con papel cebolla), Pixelorama (aclarar/oscurecer, varita mágica
y lazos, paletas importables, efectos de capa) y Piskel (lápiz espejo, cubeta de todo el color,
tramado, aclarar, selección por forma, vista previa con FPS).

## 1. Iluminación

- Cada fuente de luz tiene **posición** (x, z con decimales), **altura** (en niveles de terreno
  sobre el suelo), **radio** (casillas), **color** e **intensidad**.
- La luz por casilla pasa de un escalar a **RGB**. Se calcula con sombras: una casilla recibe una
  luz si la recta desde la fuente hasta su superficie no atraviesa terreno más alto ni una puerta
  cerrada. Los muros y los desniveles proyectan sombra.
- El sombreador suma el color de las luces sobre el ambiente; de día pesan menos que de noche.
- El halo de cada fuente se tiñe de su color y se dibuja a su altura.
- **Herramienta Luz** (raíl, tecla 8): coloca fuentes de luz sueltas (vela, antorcha, brasero,
  luz mágica, luna fría) y edita radio, altura, color y parpadeo de la elegida.
- **Objetos de luz**: en el editor de dibujo, un objeto 3D puede emitir luz; se coloca la luz
  tocando un píxel de una rebanada (la rebanada da la altura) y se eligen radio, color y parpadeo.
  Los objetos existentes que dan luz (brasero, farol, antorcha) guardan su luz al editarlos.
- **Personajes con luz**: la ficha tiene «Luz que lleva» (0 = ninguna) y «Visión en la oscuridad».

## 2. Movimiento y niebla

- Al elegir un personaje, pasar el ratón muestra el **camino** con huellas y su coste en pies; al
  arrastrarlo, igual. Las diagonales tardan más en recorrerse (el paso se ve natural).
- Niebla con **bordes suaves** y **transición**: lo que se descubre aparece en fundido.
- La visión depende de la luz: de noche, más allá de la visión en la oscuridad sólo se ve lo que
  está iluminado. La línea de visión no se cuela por huecos diagonales entre muros.
- En la mesa en vivo, cada jugador ve desde sus propios personajes.

## 3. Editor de sprites

- **Explorador de arte**: todos los sprites existentes (13 casillas, 4 personajes, 15 objetos)
  con miniatura, cuáles están modificados y «Restaurar el original».
- Herramientas nuevas: aerógrafo, degradado tramado, varita mágica (zona o todo el color), lazo,
  pincel propio (desde la selección), rellenar y contornear la selección. Las selecciones pasan a
  ser máscaras (formas libres).
- Comodidad: vista del pincel bajo el cursor, tamaño 1–8 y pincel redondo o cuadrado, mover la
  selección con las flechas, borrador guardado automáticamente, porcentaje de zoom, atajos en la
  ayuda, capas con nombre, opacidad y bloqueo.
- Color: selector con código hexadecimal, colores recientes, rampa con cambio de tono generada
  desde el color principal, paleta Endesga 32, importar paletas (lista hex, `.hex`, `.gpl`) y sacar
  la paleta de una imagen.
- Animación: vista previa con FPS para casillas animadas y objetos.
- Efectos: sombra proyectada, invertir, desaturar.

## 4. Interfaz de creador

- Al abrir un tablero: la última escena guardada o una escena vacía. Nunca una plantilla.
- Las plantillas (claro, mazmorras, pueblo, campaña de ejemplo) se mueven al menú de escenas,
  plegadas bajo «Empezar desde una plantilla».
- «Nueva escena» con ancho, fondo y terreno base, sin personaje de regalo.
- Herramientas: Nivelar (lleva el terreno a una altura), pincel 5×5, Ctrl+S guarda la escena,
  filtros en la paleta de objetos.

## Datos

- Migración 002: `drawings.light_spec JSONB` (posición, radio, color, parpadeo de la luz del objeto).
- Escenas: los objetos de tipo `light` guardan `r`, `c`, `h`, `f`; las fichas, `dark` y `luz`.
