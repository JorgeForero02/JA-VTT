'use strict';
/* Los módulos puros del cliente 3D son uno solo para todas las mesas montadas (antes cada montaje tenía sus propios
   cierres): sus datos exportados son de sólo lectura, congelados. Lo que cambie por tablero va en el motor o en una fábrica. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Luces = require('../../modules/tablero3d/public/luces.js');
const Objetos3D = require('../../modules/tablero3d/public/objetos3d.js');
const { load } = require('./helpers/motor');

const frozen = (v, name) => assert.ok(Object.isFrozen(v), `${name} congelado`);

test('luces: tipos, listas, animaciones y luces de ficha congelados', () => {
  frozen(Luces.LIGHT_TYPES, 'LIGHT_TYPES');
  for (const [id, t] of Object.entries(Luces.LIGHT_TYPES)) frozen(t, `LIGHT_TYPES.${id}`);
  for (const k of ['LIGHT_IDS', 'OBJ_LIGHT_IDS', 'LIGHT_ANIMS', 'TOKEN_LIGHTS']) frozen(Luces[k], k);
  Luces.LIGHT_ANIMS.forEach((a, i) => frozen(a, `LIGHT_ANIMS[${i}]`));
  assert.throws(() => { Luces.LIGHT_TYPES.torch.r = 99; }, TypeError);
});

test('objetos3d: PROP3D, cada objeto y la paleta congelados', () => {
  frozen(Objetos3D.PROP3D, 'PROP3D');
  for (const [k, p] of Object.entries(Objetos3D.PROP3D)) frozen(p, `PROP3D.${k}`);
  for (const k of ['G', 'D', 'S', 'B', 'W', 'SA', 'WA', 'SL', 'TH', 'SH', 'CU']) frozen(Objetos3D[k], k);
  for (const k of ['Grgb', 'Drgb', 'Srgb']) { frozen(Objetos3D[k], k); Objetos3D[k].forEach((c, i) => frozen(c, `${k}[${i}]`)); }
});

test('escena: las listas de techos congeladas', () => {
  const { Escena } = load('escena');
  frozen(Escena.ROOF_MAT_IDS, 'ROOF_MAT_IDS');
  frozen(Escena.ROOF_SHAPE_IDS, 'ROOF_SHAPE_IDS');
});
