'use strict';
/* Módulos puros base.js (azar y color) y luces.js (tipos de luz y su normalización), extraídos de tablero3d.js en la
   tarea 3 del refactor. Mismos casos que la foto (fixtures/motor-antes.json) y propiedades de los límites. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Base = require('../../modules/tablero3d/public/base.js');
const Luces = require('../../modules/tablero3d/public/luces.js');
const FOTO = require('./fixtures/motor-antes.json');
const { CASOS_LUZ } = require('./helpers/motor');

test('base: exporta mulberry32, hash, pick y hexRGB', () => {
  assert.deepEqual(Object.keys(Base).sort(), ['hash', 'hexRGB', 'mulberry32', 'pick']);
  assert.deepEqual(Base.hexRGB('#ff0080'), [255, 0, 128]);
  assert.deepEqual(Base.hexRGB('#12abEF'), FOTO.luces.hexRGB);
  const r = Base.mulberry32(7);
  assert.deepEqual(Array.from({ length: 8 }, () => r()), FOTO.azar.mulberry32_7);
  for (const [x, z, s, h] of FOTO.azar.hash) assert.equal(Base.hash(x, z, s), h);
  assert.deepEqual(FOTO.azar.hash.map(([x, z, s]) => Base.pick(['a', 'b', 'c', 'd', 'e'], x, z, s)), FOTO.azar.pick);
});

test('luces: exporta la hoja de luces', () => {
  assert.deepEqual(Object.keys(Luces).sort(), ['HEX6', 'LIGHT_ANIMS', 'LIGHT_IDS', 'LIGHT_TYPES', 'OBJ_LIGHT_IDS', 'TOKEN_LIGHTS', 'WARM',
    'lightName', 'lightOfType', 'lightRGB', 'normLight'].sort());
});

test('luces: normLight, lightOfType, lightRGB y lightName iguales a la foto', () => {
  const F = FOTO.luces;
  assert.deepEqual(CASOS_LUZ.map((c) => Luces.normLight(c)), F.normLight);
  for (const id of Luces.LIGHT_IDS) assert.deepEqual(Luces.lightOfType(id), F.lightOfType[id], id);
  for (const h of ['#ff9c50', '#000000', 'mal']) assert.deepEqual(Luces.lightRGB(h), F.lightRGB[h], h);
  assert.deepEqual(Luces.lightOfType('bullseye', { rot: 45, on: false }), F.lightOfTypeKeep);
  assert.deepEqual([{ name: 'Mía' }, { preset: 'moon' }, { preset: 'nope' }, {}].map((p) => Luces.lightName(p)), F.lightName);
  assert.equal(String(Luces.HEX6), F.listas.HEX6);
});

test('luces: normLight acota r a 1–24 y h a múltiplos de 0,25 en 0–4', () => {
  for (const r of [-100, 0, 0.4, 1, 7.6, 24, 25, 1e9]) {
    const o = Luces.normLight({ r });
    assert.ok(Number.isInteger(o.r) && o.r >= 1 && o.r <= 24, `r=${r} → ${o.r}`);
  }
  for (const h of [-5, 0, 0.1, 0.13, 1.2, 3.9, 4, 17]) {
    const o = Luces.normLight({ h });
    assert.ok(o.h >= 0 && o.h <= 4 && Number.isInteger(o.h * 4), `h=${h} → ${o.h}`);
  }
});

test('luces: lightOfType de un tipo que no existe es null', () => {
  assert.equal(Luces.lightOfType('nope'), null);
});

test('luces: un objeto dibujado no lleva oscuridad ni luces de cono', () => {
  for (const id of ['darkness', 'bullseye', 'window']) assert.ok(!Luces.OBJ_LIGHT_IDS.includes(id), id);
  assert.ok(Luces.OBJ_LIGHT_IDS.includes('torch'));
});
