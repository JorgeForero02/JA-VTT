'use strict';
/* Red de seguridad del refactor de tablero3d.js: luces, azar y generadores de mapas dan exactamente lo mismo que la foto
   tomada antes de mover nada (fixtures/motor-antes.json, test/t3d/tools/foto-motor.cjs; no se regenera). `load` devuelve
   hoy la implementación recortada del motor; las tareas 3–5 la cambian por los módulos. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const FOTO = require('./fixtures/motor-antes.json');
const { load, CASOS_LUZ, plain } = require('./helpers/motor');   // load('luces'|'azar'|'mapas') → implementación actual
test('luces: normLight, lightOfType y lightRGB iguales a la foto', () => {
  const L = load('luces');
  assert.deepEqual(CASOS_LUZ.map((c) => L.normLight(c)), FOTO.luces.normLight);
  for (const id of L.LIGHT_IDS) assert.deepEqual(L.lightOfType(id), FOTO.luces.lightOfType[id], id);
  for (const h of ['#ff9c50', '#000000', 'mal']) assert.deepEqual(L.lightRGB(h), FOTO.luces.lightRGB[h], h);
});
test('luces: listas, lightOfType con keep, lightName y hexRGB iguales a la foto', () => {
  const L = load('luces'), F = FOTO.luces;
  assert.deepEqual({ WARM: L.WARM, LIGHT_TYPES: L.LIGHT_TYPES, LIGHT_IDS: L.LIGHT_IDS, OBJ_LIGHT_IDS: L.OBJ_LIGHT_IDS, LIGHT_ANIMS: L.LIGHT_ANIMS, TOKEN_LIGHTS: L.TOKEN_LIGHTS, HEX6: String(L.HEX6) }, F.listas);
  assert.deepEqual(L.lightOfType('bullseye', { rot: 45, on: false }), F.lightOfTypeKeep);
  assert.equal(L.lightOfType('nope'), null);
  assert.deepEqual([{ name: 'Mía' }, { preset: 'moon' }, { preset: 'nope' }, {}].map((p) => L.lightName(p)), F.lightName);
  assert.deepEqual(L.hexRGB('#12abEF'), F.hexRGB);
});
test('azar: mulberry32 y hash iguales a la foto', () => {
  const A = load('azar'); const r = A.mulberry32(7);
  assert.deepEqual(Array.from({ length: 8 }, () => r()), FOTO.azar.mulberry32_7);
  assert.deepEqual(FOTO.azar.hash.map(([x, z, s]) => [x, z, s, A.hash(x, z, s)]), FOTO.azar.hash);
  assert.deepEqual(FOTO.azar.hash.map(([x, z, s]) => A.pick(['a', 'b', 'c', 'd', 'e'], x, z, s)), FOTO.azar.pick);
});
test('mapas: los cuatro generadores dan lo mismo que antes', () => {
  const G = load('mapas');
  assert.deepEqual(plain(G.demoMap()), FOTO.mapas.demo);
  assert.deepEqual(plain(G.dungeonMap(32, 7)), FOTO.mapas.dungeon32_7);
  assert.deepEqual(plain(G.dungeonMap(48, 12345)), FOTO.mapas.dungeon48_12345);
  assert.deepEqual(plain(G.townMap()), FOTO.mapas.town);
  assert.deepEqual(plain(G.lightWorkshopMap()), FOTO.mapas.taller);
});
test('mapas: la semilla es la de siempre (plain la quita de la foto)', () => {
  const G = load('mapas');
  assert.deepEqual([G.demoMap().seed, G.dungeonMap(32, 7).seed, G.townMap().seed, G.lightWorkshopMap().seed], [3, 7, 77, 91]);
});
