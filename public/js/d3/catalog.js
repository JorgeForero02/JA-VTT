/* Catálogo de juego compartido con el servidor (server/terrain.js): mismos nombres y banderas.
   art.js añade encima lo visual (atlas, tamaños). Un test impide que diverjan. */

export const MATS = [
  { name: 'Pasto', swatch: '#6aab45' },
  { name: 'Piedra', swatch: '#8b8f94' },
  { name: 'Arena', swatch: '#e2cf8f' },
  { name: 'Camino', swatch: '#a88b62' },
  { name: 'Losas', swatch: '#61656c' },
  { name: 'Corte', swatch: '#2f3237', hidden: true },
  { name: 'Quemado', swatch: '#3b2f28', scorch: true }
];

export const OBJ_KINDS = {
  arbol: { move: 1, sight: 1 },
  pino: { move: 1, sight: 1 },
  columna: { move: 1, sight: 1 },
  puerta: { move: 1, sight: 1, fixed: 1, door: 1 },
  valla: { move: 1, fixed: 1 },
  barril: { move: 1 },
  barrilx: { move: 1, explosive: 'media' },
  caja: { move: 1 },
  cofre: { move: 1 },
  baul: { move: 1 },
  mesa: { move: 1 },
  taburete: { move: 0 },
  estante: { move: 1, fixed: 1 },
  lapida: { move: 1, fixed: 1 },
  cruz: { move: 1, fixed: 1 },
  estandarte: { move: 1, fixed: 1, mount: 1 },
  estandarte2: { move: 1, fixed: 1, mount: 1 },
  fuente: { mountOnly: 1 },
  grieta: { mountOnly: 1 },
  limo: { mountOnly: 1 },
  craneo: { move: 0 },
  pocion: { move: 0 },
  pinchos: { move: 0, flat: 1 }
};
