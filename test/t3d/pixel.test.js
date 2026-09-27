'use strict';
/* Módulo puro pixel.js (Tablero3D.Pixel), extraído de tablero3d.js en la tarea 7 del refactor: las operaciones del editor
   de arte sobre un Uint8ClampedArray RGBA de w×h (voltear, girar, línea de Bresenham, HSL, rampa de tonos, leer una
   paleta, ajustar a la paleta, reemplazar un color y aplicar una función a cada píxel). Lo que toca ART (deshacer,
   selección, cuadro y capa actuales) se queda en el motor, en envoltorios con el mismo nombre; aquí llega por parámetros. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Pixel = require('../../modules/tablero3d/public/pixel.js');
const { mulberry32 } = require('../../modules/tablero3d/public/base.js');

// lienzo w×h en el que el píxel i vale [i, 2i, 3i, 255]: cada píxel es distinto y se ve adónde va
const numbered = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set([i, 2 * i, 3 * i, 255], i * 4); return d; };
const pixels = (d) => { const out = []; for (let o = 0; o < d.length; o += 4) out.push([d[o], d[o + 1], d[o + 2], d[o + 3]]); return out; };

test('pixel: el módulo exporta las operaciones puras del editor de arte', () => {
  assert.deepEqual(Object.keys(Pixel).sort(), ['flipH', 'flipV', 'hsl2rgb', 'hueRamp', 'lineCb', 'mapPixels', 'parsePalette', 'reduceToPalette', 'replaceColor', 'rgb2hsl', 'rot90', 'toHex'].sort());
});

test('pixel: rot90 gira en el sentido de las agujas del reloj; cuatro veces es la identidad (3×2)', () => {
  const s = numbered(3, 2);
  const r = Pixel.rot90(s, 3, 2);
  assert.equal(r.w, 2); assert.equal(r.h, 3);
  // 0 1 2      3 0
  // 3 4 5  →   4 1
  //            5 2
  assert.deepEqual(pixels(r.data).map((p) => p[0]), [3, 0, 4, 1, 5, 2]);
  let x = { data: s, w: 3, h: 2 };
  for (let i = 0; i < 4; i++) x = Pixel.rot90(x.data, x.w, x.h);
  assert.deepEqual([x.w, x.h], [3, 2]);
  assert.deepEqual([...x.data], [...s]);
});

test('pixel: flipH y flipV dan la vuelta; dos veces es la identidad', () => {
  const s = numbered(3, 2);
  assert.deepEqual(pixels(Pixel.flipH(s, 3, 2).data).map((p) => p[0]), [2, 1, 0, 5, 4, 3]);
  assert.deepEqual(pixels(Pixel.flipV(s, 3, 2).data).map((p) => p[0]), [3, 4, 5, 0, 1, 2]);
  const h = Pixel.flipH(s, 3, 2), v = Pixel.flipV(s, 3, 2);
  assert.deepEqual([...Pixel.flipH(h.data, h.w, h.h).data], [...s]);
  assert.deepEqual([...Pixel.flipV(v.data, v.w, v.h).data], [...s]);
});

test('pixel: hsl2rgb(rgb2hsl(c)) vuelve al color (±1) en 50 colores de mulberry32(3)', () => {
  const rnd = mulberry32(3);
  for (let i = 0; i < 50; i++) {
    const c = [0, 0, 0].map(() => Math.floor(rnd() * 256));
    const back = Pixel.hsl2rgb(...Pixel.rgb2hsl(...c));
    c.forEach((v, k) => assert.ok(Math.abs(back[k] - v) <= 1, `${c} → ${back}`));
  }
  assert.deepEqual(Pixel.rgb2hsl(255, 0, 0), [0, 1, 0.5]);
  assert.deepEqual(Pixel.hsl2rgb(0, 0, 0.5), [128, 128, 128]);
});

test('pixel: lineCb de (0,0) a (3,1) visita 4 píxeles en orden', () => {
  const seen = [];
  Pixel.lineCb(0, 0, 3, 1, (x, y) => seen.push([x, y]));
  assert.deepEqual(seen, [[0, 0], [1, 0], [2, 1], [3, 1]]);
});

test('pixel: toHex y hueRamp dan tonos #rrggbb, sin repetir, con sombras más oscuras y luces más claras', () => {
  assert.equal(Pixel.toHex([255, 16, 0, 255]), '#ff1000');
  const ramp = Pixel.hueRamp([180, 60, 60]);
  assert.ok(ramp.length > 1 && ramp.length <= 7);
  for (const h of ramp) assert.match(h, /^#[0-9a-f]{6}$/);
  assert.equal(new Set(ramp).size, ramp.length);
  const lum = (h) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
  assert.ok(lum(ramp[0]) < lum(ramp[ramp.length - 1]));
});

test('pixel: parsePalette lee hex, líneas RGB de GIMP y se salta cabeceras y comentarios', () => {
  assert.deepEqual(Pixel.parsePalette('#ff0000\n#00ff00'), ['#ff0000', '#00ff00']);
  assert.deepEqual(Pixel.parsePalette('GIMP Palette\nName: x\n# comentario\n255 0 16\tRojo\r\n300 1 2'), ['#ff0010', '#ff0102']);
});

test('pixel: reduceToPalette deja sólo colores de la paleta (y no toca los transparentes)', () => {
  const rnd = mulberry32(3), w = 4, h = 4, d = new Uint8ClampedArray(w * h * 4);
  for (let o = 0; o < d.length; o++) d[o] = Math.floor(rnd() * 256);
  d[3] = 0; const hidden = [d[0], d[1], d[2]];
  const pal = [[0, 0, 0], [255, 255, 255], [200, 30, 30]];
  Pixel.reduceToPalette(d, w, h, pal);
  const px = pixels(d);
  assert.deepEqual(px[0].slice(0, 3), hidden, 'el píxel transparente no cambia');
  for (const p of px.slice(1)) if (p[3]) assert.ok(pal.some((c) => c.every((v, k) => v === p[k])), `${p}`);
});

test('pixel: mapPixels y replaceColor respetan la selección y sólo tocan píxeles opacos', () => {
  const d = numbered(3, 2); d[4 * 4 + 3] = 0; // el píxel 4 transparente
  const inLeft = (x) => x < 2;
  Pixel.mapPixels(d, 3, 2, () => [9, 9, 9], inLeft);
  assert.deepEqual(pixels(d).map((p) => p[0]), [9, 9, 2, 9, 4, 5]);
  const e = numbered(2, 2); e.set([7, 7, 7, 255], 0); e.set([7, 7, 7, 255], 8);
  assert.equal(Pixel.replaceColor(e, 2, 2, [7, 7, 7, 255], [1, 2, 3, 0], (x, y) => y === 0), 1);
  assert.deepEqual(pixels(e), [[1, 2, 3, 0], [1, 2, 3, 255], [7, 7, 7, 255], [3, 6, 9, 255]]);
  assert.equal(Pixel.replaceColor(e, 2, 2, [7, 7, 7, 255], [0, 0, 0, 255]), 1, 'sin selección, todos');
});
